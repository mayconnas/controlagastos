/**
 * Conexão com o banco e criação do schema.
 *
 * O mesmo código serve os dois cenários:
 *  - Na Vercel, apontando para o Turso (SQLite hospedado), via TURSO_DATABASE_URL.
 *  - Na sua máquina, apontando para um arquivo local (file:data/financas.db).
 *
 * Na Vercel sem Turso configurado o app ainda sobe, mas grava em /tmp, que é
 * apagado a qualquer momento — a interface avisa isso em destaque.
 */

import { createClient, type Client } from "@libsql/client";

export type ModoArmazenamento = "turso" | "local" | "temporario";

const NA_VERCEL = Boolean(process.env.VERCEL);

export function modoArmazenamento(): ModoArmazenamento {
  if (process.env.TURSO_DATABASE_URL) return "turso";
  return NA_VERCEL ? "temporario" : "local";
}

function urlDoBanco(): string {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  if (process.env.FINANCAS_DB) return `file:${process.env.FINANCAS_DB}`;
  // Sem Turso: /tmp na Vercel (temporário), arquivo do projeto na sua máquina.
  return NA_VERCEL ? "file:/tmp/financas.db" : "file:data/financas.db";
}

let cliente: Client | undefined;

export function db(): Client {
  if (!cliente) {
    cliente = createClient({
      url: urlDoBanco(),
      authToken: process.env.TURSO_AUTH_TOKEN,
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
      const cliente = db();
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
