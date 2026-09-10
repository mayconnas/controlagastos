/**
 * Testes do schema do Supabase.
 *
 * Nesta arquitetura o navegador fala direto com o banco, então as regras de
 * negócio e o isolamento entre usuários são responsabilidade do PostgreSQL.
 * Estes testes rodam contra um PostgreSQL real, com um dublê do que o Supabase
 * fornece pronto (auth.uid, auth.users e os papéis anon/authenticated).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const URL_TESTE =
  process.env.DATABASE_URL_TESTE ?? "postgres://postgres@127.0.0.1:5433/supa_teste";

const ANA = "11111111-1111-1111-1111-111111111111";
const BRUNO = "22222222-2222-2222-2222-222222222222";

let cliente: pg.Client;

/** Executa consultas como um usuário autenticado, com o RLS valendo. */
async function como(usuario: string, sql: string, args: unknown[] = []) {
  await cliente.query("select set_config('request.jwt.claim.sub', $1, false)", [usuario]);
  await cliente.query("set role authenticated");
  try {
    return await cliente.query(sql, args);
  } finally {
    await cliente.query("reset role");
  }
}

/** Como visitante não autenticado. */
async function comoVisitante(sql: string) {
  await cliente.query("select set_config('request.jwt.claim.sub', '', false)");
  await cliente.query("set role anon");
  try {
    return await cliente.query(sql);
  } finally {
    await cliente.query("reset role");
  }
}

async function idDaConta(usuario: string, pasta: string, nome: string): Promise<number> {
  const { rows } = await como(
    usuario,
    "select c.id from contas c join pastas p on p.id = c.pasta_id where p.nome = $1 and c.nome = $2",
    [pasta, nome],
  );
  return Number(rows[0]!.id);
}

beforeAll(async () => {
  cliente = new pg.Client({ connectionString: URL_TESTE, ssl: false });
  await cliente.connect();
  await cliente.query("drop schema if exists public cascade; create schema public");
  await cliente.query("grant usage on schema public to public");
  const raiz = join(process.cwd());
  await cliente.query(readFileSync(join(raiz, "tests/supabase-stub.sql"), "utf-8"));
  await cliente.query(readFileSync(join(raiz, "supabase/schema.sql"), "utf-8"));
  await cliente.query(
    "insert into auth.users (id) values ($1), ($2) on conflict do nothing",
    [ANA, BRUNO],
  );
});

afterAll(async () => {
  await cliente?.end();
});

beforeEach(async () => {
  await cliente.query("truncate lancamentos, contas, pastas restart identity cascade");
  await como(ANA, "select preparar_conta_nova()");
});

describe("dados iniciais", () => {
  it("cria as três pastas e o plano de contas", async () => {
    const pastas = await como(ANA, "select nome from pastas order by ordem");
    expect(pastas.rows.map((r) => r.nome)).toEqual(["Corretor", "Barbearia", "Casa"]);

    const contas = await como(ANA, "select count(*)::int as n from contas");
    expect(contas.rows[0]!.n).toBe(24);
  });

  it("chamar de novo não duplica nada", async () => {
    await como(ANA, "select preparar_conta_nova()");
    const { rows } = await como(ANA, "select count(*)::int as n from pastas");
    expect(rows[0]!.n).toBe(3);
  });
});

describe("isolamento entre usuários (RLS)", () => {
  it("um usuário não enxerga os dados do outro", async () => {
    const daAna = await como(ANA, "select count(*)::int as n from pastas");
    expect(daAna.rows[0]!.n).toBe(3);

    const doBruno = await como(BRUNO, "select count(*)::int as n from pastas");
    expect(doBruno.rows[0]!.n).toBe(0);

    const lancamentosDoBruno = await como(BRUNO, "select count(*)::int as n from lancamentos");
    expect(lancamentosDoBruno.rows[0]!.n).toBe(0);
  });

  it("um usuário não consegue gravar dados em nome do outro", async () => {
    await expect(
      como(BRUNO, "insert into pastas (user_id, nome) values ($1, 'Invasão')", [ANA]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("um usuário não consegue apagar os dados do outro", async () => {
    const apagados = await como(BRUNO, "delete from pastas");
    expect(apagados.rowCount).toBe(0);

    const restantes = await como(ANA, "select count(*)::int as n from pastas");
    expect(restantes.rows[0]!.n).toBe(3);
  });

  it("visitante não autenticado não lê nada", async () => {
    await expect(comoVisitante("select * from pastas")).rejects.toThrow(/permission denied/i);
  });
});

describe("regras do lançamento", () => {
  it("tipo e pasta vêm da conta, ignorando o que o navegador mandar", async () => {
    const conta = await idDaConta(ANA, "Barbearia", "Aluguel");
    const casa = await como(ANA, "select id from pastas where nome = 'Casa'");

    // De propósito: tipo errado e pasta errada.
    const { rows } = await como(
      ANA,
      `insert into lancamentos (conta_id, tipo, pasta_id, valor_centavos, data)
       values ($1, 'receita', $2, 75000, '2025-08-25')
       returning tipo, pasta_id`,
      [conta, Number(casa.rows[0]!.id)],
    );
    expect(rows[0]!.tipo).toBe("despesa");

    const pasta = await como(ANA, "select nome from pastas where id = $1", [rows[0]!.pasta_id]);
    expect(pasta.rows[0]!.nome).toBe("Barbearia");
  });

  it("conta inativa não aceita lançamento", async () => {
    const conta = await idDaConta(ANA, "Casa", "Transporte");
    await como(ANA, "update contas set ativo = false where id = $1", [conta]);
    await expect(
      como(ANA, "insert into lancamentos (conta_id, valor_centavos) values ($1, 5000)", [conta]),
    ).rejects.toThrow(/inativa/);
  });

  it("não aceita conta de outro usuário", async () => {
    const contaDaAna = await idDaConta(ANA, "Casa", "Salário");
    await como(BRUNO, "select preparar_conta_nova()");
    await expect(
      como(BRUNO, "insert into lancamentos (conta_id, valor_centavos) values ($1, 5000)", [contaDaAna]),
    ).rejects.toThrow();
  });

  it("recusa valor zero ou negativo", async () => {
    const conta = await idDaConta(ANA, "Casa", "Salário");
    for (const valor of [0, -100]) {
      await expect(
        como(ANA, "insert into lancamentos (conta_id, valor_centavos) values ($1, $2)", [conta, valor]),
      ).rejects.toThrow(/valor_centavos/);
    }
  });

  it("recusa data inexistente no calendário", async () => {
    const conta = await idDaConta(ANA, "Casa", "Salário");
    await expect(
      como(ANA, "insert into lancamentos (conta_id, valor_centavos, data) values ($1, 100, '2025-02-31')", [conta]),
    ).rejects.toThrow();
  });
});

describe("proteções do plano de contas", () => {
  it("conta com lançamento não pode ser excluída", async () => {
    const conta = await idDaConta(ANA, "Casa", "Salário");
    await como(ANA, "insert into lancamentos (conta_id, valor_centavos) values ($1, 500000)", [conta]);
    await expect(como(ANA, "delete from contas where id = $1", [conta])).rejects.toThrow(
      /foreign key|violates/i,
    );
  });

  it("pasta com lançamento não pode ser excluída", async () => {
    const conta = await idDaConta(ANA, "Casa", "Salário");
    await como(ANA, "insert into lancamentos (conta_id, valor_centavos) values ($1, 500000)", [conta]);
    await expect(como(ANA, "delete from pastas where nome = 'Casa'")).rejects.toThrow(
      /foreign key|violates/i,
    );
  });

  it("conta com lançamento não muda de tipo", async () => {
    const conta = await idDaConta(ANA, "Casa", "Salário");
    await como(ANA, "insert into lancamentos (conta_id, valor_centavos) values ($1, 500000)", [conta]);
    await expect(
      como(ANA, "update contas set tipo = 'despesa' where id = $1", [conta]),
    ).rejects.toThrow(/mudar o tipo/);
  });

  it("conta sem lançamento pode mudar de tipo e ser excluída", async () => {
    const conta = await idDaConta(ANA, "Casa", "Outras receitas");
    await como(ANA, "update contas set tipo = 'despesa' where id = $1", [conta]);
    const apagados = await como(ANA, "delete from contas where id = $1", [conta]);
    expect(apagados.rowCount).toBe(1);
  });

  it("mudar a pasta da conta leva os lançamentos junto", async () => {
    // "Transporte" só existe na Casa; mover para o Corretor não colide com nada.
    const conta = await idDaConta(ANA, "Casa", "Transporte");
    await como(ANA, "insert into lancamentos (conta_id, valor_centavos) values ($1, 52000)", [conta]);
    const corretor = await como(ANA, "select id from pastas where nome = 'Corretor'");
    const idCorretor = Number(corretor.rows[0]!.id);

    await como(ANA, "update contas set pasta_id = $1 where id = $2", [idCorretor, conta]);
    const { rows } = await como(ANA, "select pasta_id from lancamentos where conta_id = $1", [conta]);
    expect(Number(rows[0]!.pasta_id)).toBe(idCorretor);
  });

  it("não deixa mover uma conta para uma pasta que já tem outra com o mesmo nome", async () => {
    const conta = await idDaConta(ANA, "Casa", "Alimentação"); // o Corretor também tem
    const corretor = await como(ANA, "select id from pastas where nome = 'Corretor'");
    await expect(
      como(ANA, "update contas set pasta_id = $1 where id = $2", [
        Number(corretor.rows[0]!.id),
        conta,
      ]),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("recusa nome repetido na mesma pasta e no mesmo tipo", async () => {
    const casa = await como(ANA, "select id from pastas where nome = 'Casa'");
    await expect(
      como(ANA, "insert into contas (pasta_id, nome, tipo) values ($1, 'Transporte', 'despesa')", [
        Number(casa.rows[0]!.id),
      ]),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it("recusa cor fora do formato #RRGGBB", async () => {
    const casa = await como(ANA, "select id from pastas where nome = 'Casa'");
    await expect(
      como(ANA, "insert into contas (pasta_id, nome, tipo, cor) values ($1, 'Teste', 'despesa', 'vermelho')", [
        Number(casa.rows[0]!.id),
      ]),
    ).rejects.toThrow(/cor/);
  });
});
