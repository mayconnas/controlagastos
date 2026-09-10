/**
 * Servidor dos testes de interface: serve public/, mas troca dados.js pelo
 * dublê em memória, para o navegador não precisar de Supabase de verdade.
 */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const RAIZ = resolve(process.cwd(), "public");
const DUBLE = resolve(process.cwd(), "tests/e2e/dados-falso.js");
const PORTA = Number(process.env.PORT ?? 8890);

const TIPOS = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
};

createServer((req, res) => {
  const caminho = new URL(req.url, "http://x").pathname;

  if (caminho === "/dados.js") {
    res.writeHead(200, { "Content-Type": TIPOS[".js"], "Cache-Control": "no-store" });
    res.end(readFileSync(DUBLE));
    return;
  }
  const relativo = caminho === "/" ? "index.html" : caminho.replace(/^\/+/, "");
  const destino = normalize(join(RAIZ, relativo));
  if (!destino.startsWith(RAIZ) || !existsSync(destino) || !statSync(destino).isFile()) {
    res.writeHead(404); res.end("404"); return;
  }
  res.writeHead(200, {
    "Content-Type": TIPOS[extname(destino)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(destino).pipe(res);
}).listen(PORTA, "127.0.0.1", () => console.log(`teste em http://127.0.0.1:${PORTA}`));
