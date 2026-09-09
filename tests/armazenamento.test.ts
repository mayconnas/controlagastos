import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Recarrega o módulo para que ele releia as variáveis de ambiente. */
async function carregar() {
  vi.resetModules();
  return import("../api/_db.js");
}

const VARIAVEIS = [
  "VERCEL", "FINANCAS_DB",
  "TURSO_DATABASE_URL", "TURSO_URL", "LIBSQL_URL", "DATABASE_URL",
  "TURSO_AUTH_TOKEN", "TURSO_TOKEN", "LIBSQL_AUTH_TOKEN", "DATABASE_AUTH_TOKEN",
];

beforeEach(() => {
  for (const nome of VARIAVEIS) delete process.env[nome];
});
afterEach(() => {
  for (const nome of VARIAVEIS) delete process.env[nome];
});

describe("escolha do armazenamento", () => {
  it("na sua máquina, sem nada configurado, usa o arquivo local", async () => {
    const bd = await carregar();
    expect(bd.modoArmazenamento()).toBe("local");
  });

  it("na Vercel sem banco conectado, avisa que é temporário", async () => {
    process.env.VERCEL = "1";
    const bd = await carregar();
    expect(bd.modoArmazenamento()).toBe("temporario");
  });

  it("reconhece o Turso pelos nomes de variável mais comuns", async () => {
    for (const nome of ["TURSO_DATABASE_URL", "TURSO_URL", "LIBSQL_URL", "DATABASE_URL"]) {
      for (const outro of VARIAVEIS) delete process.env[outro];
      process.env.VERCEL = "1";
      process.env[nome] = "libsql://controla-gastos.turso.io";
      const bd = await carregar();
      expect(bd.modoArmazenamento(), `variável ${nome}`).toBe("turso");
    }
  });

  it("reconhece o token pelos nomes mais comuns", async () => {
    for (const nome of ["TURSO_AUTH_TOKEN", "TURSO_TOKEN", "LIBSQL_AUTH_TOKEN"]) {
      for (const outro of VARIAVEIS) delete process.env[outro];
      process.env[nome] = "token-de-teste";
      const bd = await carregar();
      expect(bd.tokenRemoto(), `variável ${nome}`).toBe("token-de-teste");
    }
  });

  it("ignora DATABASE_URL que não seja de SQLite (ex.: Postgres)", async () => {
    process.env.VERCEL = "1";
    process.env.DATABASE_URL = "postgres://usuario:senha@servidor/banco";
    const bd = await carregar();
    expect(bd.modoArmazenamento()).toBe("temporario");
  });

  it("ignora variável vazia", async () => {
    process.env.VERCEL = "1";
    process.env.TURSO_DATABASE_URL = "   ";
    const bd = await carregar();
    expect(bd.modoArmazenamento()).toBe("temporario");
  });
});
