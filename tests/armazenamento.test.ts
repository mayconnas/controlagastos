import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Recarrega o módulo para que ele releia as variáveis de ambiente. */
async function carregar() {
  vi.resetModules();
  return import("../api/_db.js");
}

const VARIAVEIS = ["VERCEL", "DATABASE_URL", "POSTGRES_URL", "PGURL", "DATABASE_URL_UNPOOLED"];
const NEON = "postgres://usuario:senha@ep-bole-xylophone.sa-east-1.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgres://postgres@localhost:5433/financas_teste";

beforeEach(() => {
  for (const nome of VARIAVEIS) delete process.env[nome];
});
afterEach(() => {
  for (const nome of VARIAVEIS) delete process.env[nome];
});

describe("escolha do armazenamento", () => {
  it("sem nada configurado, informa que não há banco", async () => {
    const bd = await carregar();
    expect(bd.modoArmazenamento()).toBe("sem-banco");
  });

  it("sem banco, falha com mensagem clara em vez de quebrar a função", async () => {
    process.env.VERCEL = "1";
    const bd = await carregar();
    await expect(bd.prepararBanco()).rejects.toMatchObject({
      status: 503,
      mensagem: expect.stringContaining("Storage"),
    });
  });

  it("reconhece o Neon", async () => {
    process.env.DATABASE_URL = NEON;
    const bd = await carregar();
    expect(bd.modoArmazenamento()).toBe("neon");
  });

  it("reconhece um PostgreSQL local", async () => {
    process.env.DATABASE_URL = LOCAL;
    const bd = await carregar();
    expect(bd.modoArmazenamento()).toBe("local");
  });

  it("aceita os nomes de variável que a Vercel pode injetar", async () => {
    for (const nome of VARIAVEIS.filter((v) => v !== "VERCEL")) {
      for (const outro of VARIAVEIS) delete process.env[outro];
      process.env[nome] = NEON;
      const bd = await carregar();
      expect(bd.modoArmazenamento(), `variável ${nome}`).toBe("neon");
    }
  });

  it("ignora URL que não seja de PostgreSQL", async () => {
    for (const url of ["libsql://exemplo.turso.io", "mysql://servidor/banco", "redis://servidor"]) {
      for (const outro of VARIAVEIS) delete process.env[outro];
      process.env.DATABASE_URL = url;
      const bd = await carregar();
      expect(bd.modoArmazenamento(), url).toBe("sem-banco");
    }
  });

  it("ignora variável vazia", async () => {
    process.env.DATABASE_URL = "   ";
    const bd = await carregar();
    expect(bd.modoArmazenamento()).toBe("sem-banco");
  });
});

describe("TLS", () => {
  it("exige certificado válido no Neon", async () => {
    const bd = await carregar();
    expect(bd.configuracaoSsl(NEON)).toEqual({ rejectUnauthorized: true });
  });

  it("dispensa TLS num PostgreSQL local, que não tem certificado", async () => {
    const bd = await carregar();
    expect(bd.configuracaoSsl(LOCAL)).toBe(false);
    expect(bd.configuracaoSsl("postgres://postgres@127.0.0.1:5433/banco")).toBe(false);
  });

  it("respeita sslmode=disable", async () => {
    const bd = await carregar();
    expect(bd.configuracaoSsl("postgres://u@servidor.com/banco?sslmode=disable")).toBe(false);
  });
});
