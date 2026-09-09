/**
 * Apoio dos testes: aponta para um PostgreSQL de testes e devolve o banco
 * limpo antes de cada caso.
 *
 * Use DATABASE_URL_TESTE para escolher o servidor; sem ela, o padrão é um
 * PostgreSQL local na porta 5433.
 */

export const URL_TESTE =
  process.env.DATABASE_URL_TESTE ?? "postgres://postgres@127.0.0.1:5433/financas_teste";

export async function bancoLimpo() {
  process.env.DATABASE_URL = URL_TESTE;
  delete process.env.VERCEL;

  const bd = await import("../api/_db.js");
  await bd.consultar("DROP TABLE IF EXISTS lancamentos, contas, pastas CASCADE");
  await bd.resetarConexao();
  await bd.prepararBanco();
  return bd;
}
