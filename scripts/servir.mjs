/**
 * Servidor estático para abrir o app na sua máquina.
 *
 * Serve a pasta public/ do mesmo jeito que a Vercel faz. Não há backend:
 * o navegador fala direto com o Supabase.
 *
 *   node scripts/servir.mjs          → http://localhost:8000
 */

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const RAIZ = resolve(process.cwd(), "public");
const PORTA = Number(process.env.PORT ?? 8000);
const HOST = process.env.HOST ?? "127.0.0.1";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

createServer((req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const relativo = caminho === "/" ? "index.html" : caminho.replace(/^\/+/, "");
  const destino = normalize(join(RAIZ, relativo));

  if (!destino.startsWith(RAIZ) || !existsSync(destino) || !statSync(destino).isFile()) {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>404</h1><p>Página não encontrada.</p>");
    return;
  }
  res.writeHead(200, {
    "Content-Type": TIPOS[extname(destino)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(destino).pipe(res);
}).listen(PORTA, HOST, () => {
  console.log("=".repeat(56));
  console.log("  Minhas Finanças — Controla Gastos");
  console.log(`  Acesse: http://${HOST}:${PORTA}`);
  console.log("  (os dados vêm do Supabase configurado em public/config.js)");
  console.log("=".repeat(56));
});
