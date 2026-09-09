/**
 * Roteador da API. Recebe uma Request e devolve uma Response, formato que a
 * Vercel usa para funções e que o servidor local de desenvolvimento reaproveita.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { modoArmazenamento } from "./_db.js";
import { ErroApi } from "./_erros.js";
import {
  TIPOS,
  type Filtros,
  type Tipo,
  anosDisponiveis,
  atualizarConta,
  atualizarLancamento,
  atualizarPasta,
  categorias,
  criarConta,
  criarLancamento,
  criarPasta,
  excluirConta,
  excluirLancamento,
  excluirPasta,
  exportarCsv,
  listarContas,
  listarLancamentos,
  listarPastas,
  mesesDisponiveis,
  painel,
  relatorioComparativo,
  relatorioMensal,
  validarMes,
} from "./_servico.js";

const TAMANHO_MAXIMO_CORPO = 1024 * 1024; // 1 MB

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function numeroOuNulo(valor: string | null): number | null {
  if (!valor) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function tipoOuNulo(valor: string | null): Tipo | null {
  return valor && (TIPOS as string[]).includes(valor) ? (valor as Tipo) : null;
}

function filtrosDaQuery(q: URLSearchParams): Filtros {
  return {
    pastaId: numeroOuNulo(q.get("pasta")),
    mes: validarMes(q.get("mes")),
    tipo: tipoOuNulo(q.get("tipo")),
    contaId: numeroOuNulo(q.get("conta")),
    busca: q.get("busca")?.trim() || null,
    de: q.get("de") || null,
    ate: q.get("ate") || null,
  };
}

async function corpoJson(request: Request): Promise<Record<string, unknown>> {
  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > TAMANHO_MAXIMO_CORPO) throw new ErroApi("Requisição muito grande.", 413);
  const texto = await request.text();
  if (!texto.trim()) return {};
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new ErroApi("JSON inválido.");
  }
  if (typeof dados !== "object" || dados === null || Array.isArray(dados)) {
    throw new ErroApi("O corpo da requisição deve ser um objeto JSON.");
  }
  return dados as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Arquivos da interface                                               */
/* ------------------------------------------------------------------ */

const TIPOS_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

let raizPublic: string | null | undefined;

/**
 * Onde estão index.html/style.css/app.js. Normalmente a Vercel serve esses
 * arquivos direto do CDN; isto aqui é a rede de segurança para o caso de a
 * requisição cair na função.
 */
function acharPublic(): string | null {
  if (raizPublic !== undefined) return raizPublic;
  const aqui = dirname(fileURLToPath(import.meta.url));
  const candidatos = [
    join(process.cwd(), "public"),
    join(aqui, "..", "public"),
    join(aqui, "..", "..", "public"),
  ];
  raizPublic = candidatos.find((pasta) => existsSync(join(pasta, "index.html"))) ?? null;
  return raizPublic;
}

function servirArquivo(caminho: string): Response {
  const raiz = acharPublic();
  if (!raiz) return new Response("Interface não encontrada.", { status: 404 });

  const relativo = caminho === "/" || caminho === "" ? "index.html" : caminho.replace(/^\/+/, "");
  const destino = normalize(join(raiz, relativo));
  if (!destino.startsWith(raiz) || !existsSync(destino)) {
    return new Response("<h1>404</h1><p>Página não encontrada.</p>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const extensao = destino.slice(destino.lastIndexOf("."));
  return new Response(readFileSync(destino), {
    headers: {
      "Content-Type": TIPOS_MIME[extensao] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}

/* ------------------------------------------------------------------ */
/* Roteamento                                                          */
/* ------------------------------------------------------------------ */

async function despachar(request: Request, url: URL): Promise<Response> {
  const caminho = url.pathname.replace(/\/+$/, "") || "/";
  const q = url.searchParams;
  const metodo = request.method.toUpperCase();
  const corpo = metodo === "POST" || metodo === "PUT" ? await corpoJson(request) : {};

  const idDe = (prefixo: string) => Number(caminho.slice(prefixo.length));
  const ehId = (prefixo: string) => caminho.startsWith(prefixo) && /^\d+$/.test(caminho.slice(prefixo.length));

  if (caminho === "/api/status" && metodo === "GET") {
    return json({ armazenamento: modoArmazenamento() });
  }
  if (caminho === "/api/painel" && metodo === "GET") {
    return json(await painel(q.get("mes")));
  }
  if (caminho === "/api/meses" && metodo === "GET") {
    return json({ meses: await mesesDisponiveis(), anos: await anosDisponiveis() });
  }

  if (caminho === "/api/pastas") {
    if (metodo === "GET") return json({ pastas: await listarPastas() });
    if (metodo === "POST") return json(await criarPasta(corpo));
  }
  if (ehId("/api/pastas/")) {
    const id = idDe("/api/pastas/");
    if (metodo === "PUT") return json(await atualizarPasta(id, corpo));
    if (metodo === "DELETE") return json(await excluirPasta(id));
  }

  if (caminho === "/api/contas") {
    if (metodo === "GET") {
      return json({
        contas: await listarContas({
          pastaId: numeroOuNulo(q.get("pasta")),
          tipo: tipoOuNulo(q.get("tipo")),
          incluirInativas: q.get("inativas") !== "0",
        }),
      });
    }
    if (metodo === "POST") return json(await criarConta(corpo));
  }
  if (ehId("/api/contas/")) {
    const id = idDe("/api/contas/");
    if (metodo === "PUT") return json(await atualizarConta(id, corpo));
    if (metodo === "DELETE") return json(await excluirConta(id));
  }

  if (caminho === "/api/lancamentos") {
    if (metodo === "GET") {
      return json(
        await listarLancamentos({
          ...filtrosDaQuery(q),
          limite: numeroOuNulo(q.get("limite")) ?? 200,
          offset: numeroOuNulo(q.get("offset")) ?? 0,
        }),
      );
    }
    if (metodo === "POST") return json(await criarLancamento(corpo));
  }
  if (ehId("/api/lancamentos/")) {
    const id = idDe("/api/lancamentos/");
    if (metodo === "PUT") return json(await atualizarLancamento(id, corpo));
    if (metodo === "DELETE") return json(await excluirLancamento(id));
  }

  if (caminho === "/api/relatorios/categorias" && metodo === "GET") {
    return json(
      await categorias(
        numeroOuNulo(q.get("pasta")),
        validarMes(q.get("mes")),
        tipoOuNulo(q.get("tipo")) ?? "despesa",
      ),
    );
  }
  if (caminho === "/api/relatorios/mensal" && metodo === "GET") {
    return json(await relatorioMensal(numeroOuNulo(q.get("ano")), numeroOuNulo(q.get("pasta"))));
  }
  if (caminho === "/api/relatorios/comparativo" && metodo === "GET") {
    return json(await relatorioComparativo(validarMes(q.get("mes"))));
  }

  if ((caminho === "/api/export.csv" || caminho === "/api/export") && metodo === "GET") {
    return new Response(await exportarCsv(filtrosDaQuery(q)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="extrato.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  if (caminho.startsWith("/api/")) return json({ erro: "Endpoint não encontrado." }, 404);
  if (metodo === "GET") return servirArquivo(caminho);
  return json({ erro: "Método não permitido." }, 405);
}

/**
 * Caminho realmente pedido pelo navegador. Normalmente é o da própria URL; os
 * cabeçalhos são consultados apenas caso algum rewrite tenha reescrito o
 * caminho antes de chegar aqui.
 */
function caminhoOriginal(request: Request, url: URL): URL {
  if (!/^\/api\/(index|\[\.\.\.rota\])?$/.test(url.pathname)) return url;
  const cabecalhos = ["x-vercel-original-path", "x-original-path", "x-forwarded-uri"];
  for (const nome of cabecalhos) {
    const bruto = request.headers.get(nome);
    if (bruto?.startsWith("/api/")) return new URL(bruto, url.origin);
  }
  return url;
}

export async function atender(request: Request): Promise<Response> {
  const url = caminhoOriginal(request, new URL(request.url));
  try {
    return await despachar(request, url);
  } catch (erro) {
    if (erro instanceof ErroApi) return json({ erro: erro.mensagem }, erro.status);
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    console.error("Falha ao atender", url.pathname, erro);
    return json({ erro: `Erro interno: ${detalhe}` }, 500);
  }
}
