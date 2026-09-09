/**
 * Conexão com o banco e criação do schema.
 *
 * Importante sobre a Vercel: o pacote @libsql/client, na entrada padrão, carrega
 * um binário nativo (libsql) para conseguir abrir arquivos .db. Esse binário não
 * sobrevive ao empacotamento da função serverless, então aqui a entrada usada
 * depende do destino:
 *
 *   - arquivo local (file:...) -> "@libsql/client", com o binário nativo;
 *   - Turso (libsql://...)     -> "@libsql/client/web", só HTTP, sem binário.
 *
 * O import é dinâmico justamente para que o binário nativo nunca seja carregado
 * quando o app está rodando na Vercel.
 */

import type { Client } from "@libsql/client";

import { ErroApi } from "./_erros.js";

export type ModoArmazenamento = "turso" | "local" | "sem-banco";

const NA_VERCEL = Boolean(process.env.VERCEL);

/**
 * A integração do Turso pelo Marketplace da Vercel cadastra as variáveis sozinha,
 * mas o nome pode variar conforme por onde o banco foi criado. Aceitamos os
 * nomes usuais para você não precisar renomear nada no painel.
 */
const NOMES_URL = ["TURSO_DATABASE_URL", "TURSO_URL", "LIBSQL_URL", "DATABASE_URL"];
const NOMES_TOKEN = ["TURSO_AUTH_TOKEN", "TURSO_TOKEN", "LIBSQL_AUTH_TOKEN", "DATABASE_AUTH_TOKEN"];

function primeiraVariavel(nomes: string[]): string | undefined {
  for (const nome of nomes) {
    const valor = process.env[nome]?.trim();
    if (valor) return valor;
  }
  return undefined;
}

/** URL do Turso, se houver uma configurada. DATABASE_URL só vale se for libsql. */
function urlRemota(): string | undefined {
  const url = primeiraVariavel(NOMES_URL);
  if (!url) return undefined;
  return /^(libsql|wss?|https?):\/\//.test(url) ? url : undefined;
}

export function tokenRemoto(): string | undefined {
  return primeiraVariavel(NOMES_TOKEN);
}

function urlLocal(): string | undefined {
  if (process.env.FINANCAS_DB) return `file:${process.env.FINANCAS_DB}`;
  // Na Vercel não existe disco permanente, então arquivo local só faz sentido fora dela.
  return NA_VERCEL ? undefined : "file:data/financas.db";
}

export function modoArmazenamento(): ModoArmazenamento {
  if (urlRemota()) return "turso";
  return urlLocal() ? "local" : "sem-banco";
}

export const SEM_BANCO =
  "Este site ainda não tem um banco de dados conectado. Na Vercel, abra a aba Storage " +
  "do projeto, adicione o Turso pelo Marketplace e clique em Redeploy.";

async function criarCliente(): Promise<Client> {
  const remota = urlRemota();
  if (remota) {
    // Entrada "web": puramente HTTP, sem binário nativo — é a que funciona na Vercel.
    const { createClient } = await import("@libsql/client/web");
    return createClient({ url: remota, authToken: tokenRemoto() });
  }
  const local = urlLocal();
  if (!local) throw new ErroApi(SEM_BANCO, 503);
  const { createClient } = await import("@libsql/client");
  return createClient({ url: local });
}

let cliente: Promise<Client> | undefined;

/** Cliente do banco, criado sob demanda e reaproveitado na mesma instância. */
export function bd(): Promise<Client> {
  if (!cliente) {
    cliente = criarCliente().catch((erro) => {
      cliente = undefined; // permite tentar de novo na próxima requisição
      throw erro;
    });
  }
  return cliente;
}

/** Usado nos testes, para trocar de banco entre um caso e outro. */
export function resetarConexao(): void {
  cliente = undefined;
  schemaPronto = undefined;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pastas (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT    NOT NULL UNIQUE,
    subtitulo TEXT    NOT NULL DEFAULT '',
    icone     TEXT    NOT NULL DEFAULT 'folder',
    cor       TEXT    NOT NULL DEFAULT '#3b82f6',
    ordem     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contas (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    pasta_id INTEGER REFERENCES pastas(id) ON DELETE CASCADE,
    codigo   TEXT    NOT NULL DEFAULT '',
    nome     TEXT    NOT NULL,
    tipo     TEXT    NOT NULL CHECK (tipo IN ('receita', 'despesa')),
    cor      TEXT    NOT NULL DEFAULT '#3b82f6',
    ativo    INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contas_unicas
    ON contas (IFNULL(pasta_id, -1), tipo, nome);

CREATE TABLE IF NOT EXISTS lancamentos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    pasta_id       INTEGER NOT NULL REFERENCES pastas(id) ON DELETE CASCADE,
    conta_id       INTEGER NOT NULL REFERENCES contas(id) ON DELETE RESTRICT,
    tipo           TEXT    NOT NULL CHECK (tipo IN ('receita', 'despesa')),
    data           TEXT    NOT NULL,
    descricao      TEXT    NOT NULL DEFAULT '',
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    observacao     TEXT    NOT NULL DEFAULT '',
    criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lanc_data  ON lancamentos (data);
CREATE INDEX IF NOT EXISTS idx_lanc_pasta ON lancamentos (pasta_id, data);
CREATE INDEX IF NOT EXISTS idx_lanc_conta ON lancamentos (conta_id);
`;

/** Pastas iniciais: os três centros de custo. */
const PASTAS_PADRAO: Array<[string, string, string, string, number]> = [
  ["Corretor", "Comissões • Despesas • Lucro", "corretor", "#f5a524", 1],
  ["Barbearia", "Vendas • Despesas • Lucro", "barbearia", "#3b82f6", 2],
  ["Casa", "Moradia • Contas • Despesas", "casa", "#22c55e", 3],
];

/** Plano de contas inicial: [pasta, código, nome, tipo, cor]. */
const CONTAS_PADRAO: Array<[string, string, string, "receita" | "despesa", string]> = [
  ["Corretor", "1.01", "Comissão de venda", "receita", "#22c55e"],
  ["Corretor", "1.02", "Comissão de locação", "receita", "#16a34a"],
  ["Corretor", "1.99", "Outras receitas", "receita", "#4ade80"],
  ["Corretor", "2.01", "Combustível", "despesa", "#3b82f6"],
  ["Corretor", "2.02", "Marketing", "despesa", "#f97316"],
  ["Corretor", "2.03", "Alimentação", "despesa", "#22c55e"],
  ["Corretor", "2.04", "Internet/Telefone", "despesa", "#8b5cf6"],
  ["Corretor", "2.99", "Outros", "despesa", "#94a3b8"],
  ["Barbearia", "1.01", "Serviços (cortes e barba)", "receita", "#22c55e"],
  ["Barbearia", "1.02", "Venda de produtos", "receita", "#16a34a"],
  ["Barbearia", "1.99", "Outras receitas", "receita", "#4ade80"],
  ["Barbearia", "2.01", "Produtos (pomadas, etc.)", "despesa", "#3b82f6"],
  ["Barbearia", "2.02", "Aluguel", "despesa", "#f97316"],
  ["Barbearia", "2.03", "Energia/Água", "despesa", "#22c55e"],
  ["Barbearia", "2.04", "Internet/Telefone", "despesa", "#8b5cf6"],
  ["Barbearia", "2.99", "Outros", "despesa", "#94a3b8"],
  ["Casa", "1.01", "Salário", "receita", "#22c55e"],
  ["Casa", "1.02", "Bônus/Extras", "receita", "#16a34a"],
  ["Casa", "1.99", "Outras receitas", "receita", "#4ade80"],
  ["Casa", "2.01", "Moradia (aluguel/cond.)", "despesa", "#3b82f6"],
  ["Casa", "2.02", "Contas (água, luz, internet)", "despesa", "#f97316"],
  ["Casa", "2.03", "Alimentação", "despesa", "#22c55e"],
  ["Casa", "2.04", "Transporte", "despesa", "#8b5cf6"],
  ["Casa", "2.99", "Outros", "despesa", "#ec4899"],
];

let schemaPronto: Promise<void> | undefined;

/**
 * Cria as tabelas e, se o banco estiver vazio, os dados iniciais.
 * Roda uma única vez por instância — as chamadas seguintes reaproveitam a promessa.
 */
export function prepararBanco(): Promise<void> {
  if (!schemaPronto) {
    schemaPronto = (async () => {
      const cliente = await bd();
      await cliente.executeMultiple(SCHEMA);

      const { rows } = await cliente.execute("SELECT COUNT(*) AS n FROM pastas");
      if (Number(rows[0]?.n ?? 0) > 0) return;

      for (const [nome, subtitulo, icone, cor, ordem] of PASTAS_PADRAO) {
        await cliente.execute({
          sql: "INSERT INTO pastas (nome, subtitulo, icone, cor, ordem) VALUES (?, ?, ?, ?, ?)",
          args: [nome, subtitulo, icone, cor, ordem],
        });
      }
      const pastas = await cliente.execute("SELECT id, nome FROM pastas");
      const ids = new Map(pastas.rows.map((r) => [String(r.nome), Number(r.id)]));
      for (const [pasta, codigo, nome, tipo, cor] of CONTAS_PADRAO) {
        await cliente.execute({
          sql: "INSERT INTO contas (pasta_id, codigo, nome, tipo, cor) VALUES (?, ?, ?, ?, ?)",
          args: [ids.get(pasta) ?? null, codigo, nome, tipo, cor],
        });
      }
    })().catch((erro) => {
      schemaPronto = undefined; // permite tentar de novo na próxima requisição
      throw erro;
    });
  }
  return schemaPronto;
}
