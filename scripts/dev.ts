/**
 * Servidor local de desenvolvimento.
 *
 * Usa exatamente o mesmo roteador que roda na Vercel, então o que funciona aqui
 * funciona lá. Rode com: npm run dev
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { atender } from "../api/_rotas.js";
import { modoArmazenamento, prepararBanco } from "../api/_db.js";

const PORTA = Number(process.env.PORT ?? 8000);
const HOST = process.env.HOST ?? "127.0.0.1";

async function paraRequest(req: IncomingMessage): Promise<Request> {
  const url = `http://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
  const metodo = req.method ?? "GET";
  let corpo: string | undefined;
  if (metodo !== "GET" && metodo !== "HEAD") {
    const partes: Buffer[] = [];
    for await (const parte of req) partes.push(parte as Buffer);
    corpo = Buffer.concat(partes).toString("utf-8");
  }
  return new Request(url, {
    method: metodo,
    headers: req.headers as Record<string, string>,
    body: corpo,
  });
}

async function responder(resposta: Response, res: ServerResponse): Promise<void> {
  const cabecalhos: Record<string, string> = {};
  resposta.headers.forEach((valor, chave) => {
    cabecalhos[chave] = valor;
  });
  res.writeHead(resposta.status, cabecalhos);
  res.end(Buffer.from(await resposta.arrayBuffer()));
}

const servidor = createServer((req, res) => {
  void (async () => {
    try {
      await responder(await atender(await paraRequest(req)), res);
    } catch (erro) {
      console.error(erro);
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ erro: "Erro interno do servidor." }));
    }
  })();
});

await prepararBanco();
servidor.listen(PORTA, HOST, () => {
  const modo = modoArmazenamento();
  console.log("=".repeat(56));
  console.log("  Minhas Finanças - Controla Gastos");
  console.log(`  Armazenamento: ${modo === "turso" ? "Turso (nuvem)" : "arquivo local"}`);
  console.log(`  Acesse: http://${HOST}:${PORTA}`);
  console.log("  (Ctrl+C para encerrar)");
  console.log("=".repeat(56));
});
