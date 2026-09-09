/**
 * Regras de negócio: validações, consultas e relatórios.
 *
 * Convenções do projeto:
 *  - Valores em centavos (inteiro), para não existir erro de arredondamento.
 *  - O tipo (receita/despesa) e a pasta do lançamento sempre vêm da conta
 *    escolhida no plano de contas, o que impede classificação incorreta.
 *  - As consultas são escritas com "?"; o _db.ts converte para $1, $2... do
 *    PostgreSQL, o que mantém legível a montagem dinâmica dos filtros.
 */

import {
  UNICIDADE_VIOLADA,
  consultar as consultarBanco,
  prepararBanco,
  transacao,
  type Consulta,
} from "./_db.js";
import { ErroApi } from "./_erros.js";

export { ErroApi };

export type Tipo = "receita" | "despesa";
export const TIPOS: Tipo[] = ["receita", "despesa"];

export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Payload = Record<string, unknown>;
type Linha = Record<string, any>;

async function linhas(sql: string, args: unknown[] = []): Promise<Linha[]> {
  await prepararBanco();
  return (await consultarBanco(sql, args)).rows;
}

async function primeira(sql: string, args: unknown[] = []): Promise<Linha | undefined> {
  return (await linhas(sql, args))[0];
}

async function afetadas(sql: string, args: unknown[] = []): Promise<number> {
  await prepararBanco();
  return (await consultarBanco(sql, args)).rowCount;
}

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return (erro as { code?: string } | null)?.code === UNICIDADE_VIOLADA;
}

/* ------------------------------------------------------------------ */
/* Validações                                                          */
/* ------------------------------------------------------------------ */

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_MES = /^\d{4}-\d{2}$/;
const RE_COR = /^#[0-9a-fA-F]{6}$/;

function texto(p: Payload, campo: string, obrigatorio = true, maximo = 120): string {
  const valor = String(p[campo] ?? "").trim();
  if (obrigatorio && !valor) throw new ErroApi(`O campo '${campo}' é obrigatório.`);
  if (valor.length > maximo) {
    throw new ErroApi(`O campo '${campo}' deve ter no máximo ${maximo} caracteres.`);
  }
  return valor;
}

function tipoDe(p: Payload, campo = "tipo"): Tipo {
  const valor = String(p[campo] ?? "").trim().toLowerCase();
  if (valor !== "receita" && valor !== "despesa") {
    throw new ErroApi("O tipo deve ser 'receita' ou 'despesa'.");
  }
  return valor;
}

function inteiro(p: Payload, campo: string, obrigatorio = true): number | null {
  const bruto = p[campo];
  if (bruto === undefined || bruto === null || bruto === "") {
    if (obrigatorio) throw new ErroApi(`O campo '${campo}' é obrigatório.`);
    return null;
  }
  const numero = Number(bruto);
  if (!Number.isInteger(numero)) {
    throw new ErroApi(`O campo '${campo}' deve ser um número inteiro.`);
  }
  return numero;
}

/** Aceita 1234.56, "1234,56" ou "1.234,56" e devolve centavos. */
export function paraCentavos(bruto: unknown): number {
  if (bruto === undefined || bruto === null || bruto === "") {
    throw new ErroApi("Informe o valor do lançamento.");
  }
  let numero: number;
  if (typeof bruto === "string") {
    let limpo = bruto.trim().replace(/R\$/g, "").replace(/\s/g, "");
    if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");
    numero = Number(limpo);
  } else {
    numero = Number(bruto);
  }
  if (!Number.isFinite(numero)) {
    throw new ErroApi("Valor inválido. Use por exemplo 1250,00.");
  }
  const centavos = Math.round(numero * 100);
  if (centavos <= 0) throw new ErroApi("O valor deve ser maior que zero.");
  if (centavos > 1e13) throw new ErroApi("Valor acima do limite permitido.");
  return centavos;
}

export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function dataDe(p: Payload, campo = "data"): string {
  const valor = String(p[campo] ?? "").trim();
  if (!valor) return hojeISO();
  if (!RE_DATA.test(valor)) throw new ErroApi("Data inválida. Use o formato AAAA-MM-DD.");
  const [ano, mes, dia] = valor.split("-").map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    throw new ErroApi("Data inexistente no calendário.");
  }
  return valor;
}

export function validarMes(valor: unknown): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  if (!RE_MES.test(texto)) throw new ErroApi("Mês inválido. Use o formato AAAA-MM.");
  return texto;
}

function corDe(p: Payload, campo = "cor", padrao = "#3b82f6"): string {
  const valor = String(p[campo] ?? padrao).trim() || padrao;
  if (!RE_COR.test(valor)) throw new ErroApi("Cor inválida. Use o formato #RRGGBB.");
  return valor;
}

export function rotuloMes(mes: string): string {
  const [ano, numero] = mes.split("-");
  return `${MESES_PT[Number(numero) - 1]}/${ano}`;
}

/* ------------------------------------------------------------------ */
/* Pastas (Corretor, Barbearia, Casa)                                  */
/* ------------------------------------------------------------------ */

export async function listarPastas(): Promise<Linha[]> {
  return linhas("SELECT * FROM pastas ORDER BY ordem, nome");
}

function camposDaPasta(p: Payload) {
  return {
    nome: texto(p, "nome"),
    subtitulo: texto(p, "subtitulo", false, 160),
    icone: texto(p, "icone", false, 40) || "folder",
    cor: corDe(p),
    ordem: inteiro({ ordem: p.ordem ?? 99 }, "ordem") ?? 99,
  };
}

export async function criarPasta(p: Payload) {
  const { nome, subtitulo, icone, cor, ordem } = camposDaPasta(p);
  try {
    return await primeira(
      "INSERT INTO pastas (nome, subtitulo, icone, cor, ordem) VALUES (?, ?, ?, ?, ?) RETURNING *",
      [nome, subtitulo, icone, cor, ordem],
    );
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      throw new ErroApi(`Já existe uma pasta chamada '${nome}'.`, 409);
    }
    throw erro;
  }
}

export async function atualizarPasta(pastaId: number, p: Payload) {
  const { nome, subtitulo, icone, cor, ordem } = camposDaPasta(p);
  let atualizada: Linha | undefined;
  try {
    atualizada = await primeira(
      "UPDATE pastas SET nome = ?, subtitulo = ?, icone = ?, cor = ?, ordem = ? WHERE id = ? RETURNING *",
      [nome, subtitulo, icone, cor, ordem, pastaId],
    );
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      throw new ErroApi(`Já existe uma pasta chamada '${nome}'.`, 409);
    }
    throw erro;
  }
  if (!atualizada) throw new ErroApi("Pasta não encontrada.", 404);
  return atualizada;
}

export async function excluirPasta(pastaId: number) {
  const usados = Number(
    (await primeira("SELECT COUNT(*) AS n FROM lancamentos WHERE pasta_id = ?", [pastaId]))?.n ?? 0,
  );
  if (usados > 0) {
    throw new ErroApi(
      `Esta pasta possui ${usados} lançamento(s). Exclua ou mova os lançamentos antes.`,
      409,
    );
  }
  if ((await afetadas("DELETE FROM pastas WHERE id = ?", [pastaId])) === 0) {
    throw new ErroApi("Pasta não encontrada.", 404);
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Plano de contas                                                     */
/* ------------------------------------------------------------------ */

export async function listarContas(
  opcoes: { pastaId?: number | null; tipo?: Tipo | null; incluirInativas?: boolean } = {},
): Promise<Linha[]> {
  const sql = [
    "SELECT c.*, p.nome AS pasta_nome,",
    "       (SELECT COUNT(*) FROM lancamentos l WHERE l.conta_id = c.id) AS usos",
    "FROM contas c LEFT JOIN pastas p ON p.id = c.pasta_id WHERE 1 = 1",
  ];
  const args: unknown[] = [];
  if (opcoes.pastaId) {
    sql.push("AND (c.pasta_id = ? OR c.pasta_id IS NULL)");
    args.push(opcoes.pastaId);
  }
  if (opcoes.tipo) {
    sql.push("AND c.tipo = ?");
    args.push(opcoes.tipo);
  }
  if (opcoes.incluirInativas === false) sql.push("AND c.ativo = 1");
  // NULLS FIRST mantém as contas de "todas as pastas" no topo, como antes.
  sql.push("ORDER BY p.ordem NULLS FIRST, c.tipo DESC, c.codigo, c.nome");
  return linhas(sql.join(" "), args);
}

async function exigirPasta(pastaId: number | null) {
  if (pastaId === null) return;
  if (!(await primeira("SELECT 1 AS ok FROM pastas WHERE id = ?", [pastaId]))) {
    throw new ErroApi("Pasta informada não existe.", 404);
  }
}

function camposDaConta(p: Payload) {
  return {
    nome: texto(p, "nome"),
    tipo: tipoDe(p),
    codigo: texto(p, "codigo", false, 20),
    cor: corDe(p),
    pastaId: inteiro(p, "pasta_id", false),
    ativo: p.ativo === undefined ? 1 : p.ativo ? 1 : 0,
  };
}

async function contaPorId(contaId: number) {
  return primeira(
    "SELECT c.*, p.nome AS pasta_nome, " +
      "(SELECT COUNT(*) FROM lancamentos l WHERE l.conta_id = c.id) AS usos " +
      "FROM contas c LEFT JOIN pastas p ON p.id = c.pasta_id WHERE c.id = ?",
    [contaId],
  );
}

export async function criarConta(p: Payload) {
  const { nome, tipo, codigo, cor, pastaId, ativo } = camposDaConta(p);
  await exigirPasta(pastaId);
  try {
    const criada = await primeira(
      "INSERT INTO contas (pasta_id, codigo, nome, tipo, cor, ativo) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
      [pastaId, codigo, nome, tipo, cor, ativo],
    );
    return await contaPorId(Number(criada?.id));
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      throw new ErroApi(`Já existe a conta '${nome}' (${tipo}) nesta pasta.`, 409);
    }
    throw erro;
  }
}

export async function atualizarConta(contaId: number, p: Payload) {
  const { nome, tipo, codigo, cor, pastaId, ativo } = camposDaConta(p);
  await exigirPasta(pastaId);

  const atual = await primeira("SELECT tipo FROM contas WHERE id = ?", [contaId]);
  if (!atual) throw new ErroApi("Conta não encontrada.", 404);
  if (atual.tipo !== tipo) {
    const usos = Number(
      (await primeira("SELECT COUNT(*) AS n FROM lancamentos WHERE conta_id = ?", [contaId]))?.n ?? 0,
    );
    if (usos > 0) {
      throw new ErroApi("Não é possível mudar o tipo de uma conta que já possui lançamentos.", 409);
    }
  }

  try {
    await transacao(async (q: Consulta) => {
      await q(
        "UPDATE contas SET pasta_id = ?, codigo = ?, nome = ?, tipo = ?, cor = ?, ativo = ? WHERE id = ?",
        [pastaId, codigo, nome, tipo, cor, ativo, contaId],
      );
      // Mantém os lançamentos coerentes com a pasta da conta.
      if (pastaId !== null) {
        await q("UPDATE lancamentos SET pasta_id = ? WHERE conta_id = ?", [pastaId, contaId]);
      }
    });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) {
      throw new ErroApi(`Já existe a conta '${nome}' (${tipo}) nesta pasta.`, 409);
    }
    throw erro;
  }
  return contaPorId(contaId);
}

export async function excluirConta(contaId: number) {
  const usos = Number(
    (await primeira("SELECT COUNT(*) AS n FROM lancamentos WHERE conta_id = ?", [contaId]))?.n ?? 0,
  );
  if (usos > 0) {
    throw new ErroApi(
      `Esta conta possui ${usos} lançamento(s) vinculado(s). ` +
        "Reclassifique-os ou desative a conta em vez de excluir.",
      409,
    );
  }
  if ((await afetadas("DELETE FROM contas WHERE id = ?", [contaId])) === 0) {
    throw new ErroApi("Conta não encontrada.", 404);
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Lançamentos                                                         */
/* ------------------------------------------------------------------ */

const LANC_SELECT = `
SELECT l.id, l.pasta_id, l.conta_id, l.tipo, l.data, l.descricao,
       l.valor_centavos, l.observacao, l.criado_em,
       c.nome AS conta_nome, c.codigo AS conta_codigo, c.cor AS conta_cor,
       p.nome AS pasta_nome, p.cor AS pasta_cor, p.icone AS pasta_icone
FROM lancamentos l
JOIN contas c ON c.id = l.conta_id
JOIN pastas p ON p.id = l.pasta_id
`;

export interface Filtros {
  pastaId?: number | null;
  mes?: string | null;
  tipo?: Tipo | null;
  contaId?: number | null;
  busca?: string | null;
  de?: string | null;
  ate?: string | null;
}

function montarFiltros(f: Filtros): { where: string; args: unknown[] } {
  const clausulas: string[] = [];
  const args: unknown[] = [];
  if (f.pastaId) {
    clausulas.push("l.pasta_id = ?");
    args.push(f.pastaId);
  }
  if (f.mes) {
    clausulas.push("substr(l.data, 1, 7) = ?");
    args.push(f.mes);
  }
  if (f.tipo) {
    clausulas.push("l.tipo = ?");
    args.push(f.tipo);
  }
  if (f.contaId) {
    clausulas.push("l.conta_id = ?");
    args.push(f.contaId);
  }
  if (f.busca) {
    // ILIKE porque, no PostgreSQL, LIKE diferencia maiúsculas de minúsculas.
    clausulas.push("(l.descricao ILIKE ? OR l.observacao ILIKE ? OR c.nome ILIKE ?)");
    const curinga = `%${f.busca}%`;
    args.push(curinga, curinga, curinga);
  }
  if (f.de) {
    clausulas.push("l.data >= ?");
    args.push(f.de);
  }
  if (f.ate) {
    clausulas.push("l.data <= ?");
    args.push(f.ate);
  }
  return {
    where: clausulas.length ? ` WHERE ${clausulas.join(" AND ")}` : "",
    args,
  };
}

export async function listarLancamentos(f: Filtros & { limite?: number; offset?: number } = {}) {
  const { where, args } = montarFiltros(f);
  const limite = Math.min(f.limite ?? 200, 1000);
  const offset = f.offset ?? 0;

  const itens = await linhas(
    `${LANC_SELECT}${where} ORDER BY l.data DESC, l.id DESC LIMIT ? OFFSET ?`,
    [...args, limite, offset],
  );
  const totais = await primeira(
    "SELECT COUNT(*) AS n, " +
      "COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor_centavos END), 0) AS receitas, " +
      "COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor_centavos END), 0) AS despesas " +
      `FROM lancamentos l JOIN contas c ON c.id = l.conta_id${where}`,
    args,
  );
  const receitas = Number(totais?.receitas ?? 0);
  const despesas = Number(totais?.despesas ?? 0);
  return { itens, total: Number(totais?.n ?? 0), receitas, despesas, saldo: receitas - despesas };
}

/** Resolve a conta e a pasta do lançamento, validando a combinação. */
async function contaParaLancamento(contaId: number, pastaId: number | null) {
  const conta = await primeira(
    "SELECT id, nome, tipo, pasta_id, ativo FROM contas WHERE id = ?",
    [contaId],
  );
  if (!conta) throw new ErroApi("Conta do plano de contas não encontrada.", 404);
  if (!Number(conta.ativo)) throw new ErroApi(`A conta '${conta.nome}' está inativa.`);

  const contaPasta = conta.pasta_id === null ? null : Number(conta.pasta_id);
  const destino = contaPasta ?? pastaId;
  if (destino === null || destino === undefined) {
    throw new ErroApi("Informe a pasta (Corretor, Barbearia ou Casa) do lançamento.");
  }
  if (contaPasta !== null && pastaId !== null && contaPasta !== pastaId) {
    throw new ErroApi(`A conta '${conta.nome}' pertence a outra pasta.`);
  }
  await exigirPasta(destino);
  return { pastaId: destino, tipo: String(conta.tipo) as Tipo, nome: String(conta.nome) };
}

function camposDoLancamento(p: Payload) {
  return {
    contaId: inteiro(p, "conta_id") as number,
    valor: paraCentavos(p.valor),
    data: dataDe(p),
    descricao: texto(p, "descricao", false, 160),
    observacao: texto(p, "observacao", false, 500),
    pastaId: inteiro(p, "pasta_id", false),
  };
}

export async function criarLancamento(p: Payload) {
  const { contaId, valor, data, descricao, observacao, pastaId } = camposDoLancamento(p);
  const conta = await contaParaLancamento(contaId, pastaId);
  const criado = await primeira(
    "INSERT INTO lancamentos (pasta_id, conta_id, tipo, data, descricao, valor_centavos, observacao) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
    [conta.pastaId, contaId, conta.tipo, data, descricao || conta.nome, valor, observacao],
  );
  return primeira(`${LANC_SELECT} WHERE l.id = ?`, [Number(criado?.id)]);
}

export async function atualizarLancamento(lancId: number, p: Payload) {
  const { contaId, valor, data, descricao, observacao, pastaId } = camposDoLancamento(p);
  if (!(await primeira("SELECT 1 AS ok FROM lancamentos WHERE id = ?", [lancId]))) {
    throw new ErroApi("Lançamento não encontrado.", 404);
  }
  const conta = await contaParaLancamento(contaId, pastaId);
  await afetadas(
    "UPDATE lancamentos SET pasta_id = ?, conta_id = ?, tipo = ?, data = ?, " +
      "descricao = ?, valor_centavos = ?, observacao = ? WHERE id = ?",
    [conta.pastaId, contaId, conta.tipo, data, descricao || conta.nome, valor, observacao, lancId],
  );
  return primeira(`${LANC_SELECT} WHERE l.id = ?`, [lancId]);
}

export async function excluirLancamento(lancId: number) {
  if ((await afetadas("DELETE FROM lancamentos WHERE id = ?", [lancId])) === 0) {
    throw new ErroApi("Lançamento não encontrado.", 404);
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Painel e relatórios                                                 */
/* ------------------------------------------------------------------ */

export async function mesesDisponiveis() {
  const encontrados = (
    await linhas("SELECT DISTINCT substr(data, 1, 7) AS mes FROM lancamentos ORDER BY mes DESC")
  ).map((r) => String(r.mes));
  const atual = hojeISO().slice(0, 7);
  if (!encontrados.includes(atual)) encontrados.unshift(atual);
  return encontrados.map((mes) => ({ valor: mes, rotulo: rotuloMes(mes) }));
}

export async function anosDisponiveis() {
  const encontrados = (
    await linhas("SELECT DISTINCT substr(data, 1, 4) AS ano FROM lancamentos ORDER BY ano DESC")
  ).map((r) => Number(r.ano));
  const atual = new Date().getFullYear();
  if (!encontrados.includes(atual)) encontrados.unshift(atual);
  return encontrados;
}

async function totais(pastaId: number | null, mes: string | null) {
  const { where, args } = montarFiltros({ pastaId, mes });
  const linha = await primeira(
    "SELECT COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor_centavos END), 0) AS receitas, " +
      "COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor_centavos END), 0) AS despesas " +
      `FROM lancamentos l${where}`,
    args,
  );
  const receitas = Number(linha?.receitas ?? 0);
  const despesas = Number(linha?.despesas ?? 0);
  return { receitas, despesas, saldo: receitas - despesas };
}

/** Total por conta do plano de contas, com percentual sobre o total. */
export async function categorias(pastaId: number | null, mes: string | null, tipo: Tipo = "despesa") {
  const { where, args } = montarFiltros({ pastaId, mes, tipo });
  const itens: Linha[] = (
    await linhas(
      "SELECT c.id, c.nome, c.codigo, c.cor, SUM(l.valor_centavos) AS total " +
        `FROM lancamentos l JOIN contas c ON c.id = l.conta_id${where} ` +
        "GROUP BY c.id ORDER BY total DESC",
      args,
    )
  ).map((linha) => ({ ...linha, total: Number(linha.total) }));

  const total = itens.reduce((soma, item) => soma + Number(item.total), 0);
  for (const item of itens) {
    item.percentual = total ? Math.round((item.total * 1000) / total) / 10 : 0;
  }
  return { total, tipo, itens };
}

/** Dados da tela inicial: uma visão por pasta + o resumo geral. */
export async function painel(mesPedido?: unknown) {
  const mes = validarMes(mesPedido) ?? hojeISO().slice(0, 7);
  const pastas = await listarPastas();
  const geral = { receitas: 0, despesas: 0, saldo: 0 };

  for (const pasta of pastas) {
    const pastaId = Number(pasta.id);
    const totalDaPasta = await totais(pastaId, mes);
    Object.assign(pasta, totalDaPasta);
    pasta.ultimos = await linhas(
      `${LANC_SELECT} WHERE l.pasta_id = ? AND substr(l.data, 1, 7) = ? ` +
        "ORDER BY l.data DESC, l.id DESC LIMIT 6",
      [pastaId, mes],
    );
    pasta.categorias = await categorias(pastaId, mes, "despesa");
    geral.receitas += totalDaPasta.receitas;
    geral.despesas += totalDaPasta.despesas;
    geral.saldo += totalDaPasta.saldo;
  }
  return { mes, rotulo: rotuloMes(mes), pastas, geral };
}

/** Evolução mês a mês (12 meses do ano informado). */
export async function relatorioMensal(ano?: number | null, pastaId?: number | null) {
  const anoAlvo = ano || new Date().getFullYear();
  const { where, args } = montarFiltros({ pastaId });
  const conector = where ? " AND " : " WHERE ";
  const encontrados = new Map(
    (
      await linhas(
        "SELECT substr(l.data, 1, 7) AS mes, " +
          "COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor_centavos END), 0) AS receitas, " +
          "COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor_centavos END), 0) AS despesas " +
          `FROM lancamentos l JOIN contas c ON c.id = l.conta_id${where}${conector}` +
          "substr(l.data, 1, 4) = ? GROUP BY substr(l.data, 1, 7) ORDER BY mes",
        [...args, String(anoAlvo)],
      )
    ).map((linha) => [String(linha.mes), linha] as const),
  );

  const meses = [];
  for (let i = 1; i <= 12; i += 1) {
    const chave = `${anoAlvo}-${String(i).padStart(2, "0")}`;
    const linha = encontrados.get(chave);
    const receitas = Number(linha?.receitas ?? 0);
    const despesas = Number(linha?.despesas ?? 0);
    meses.push({
      mes: chave,
      receitas,
      despesas,
      saldo: receitas - despesas,
      rotulo: MESES_PT[i - 1]!.slice(0, 3),
    });
  }
  return { ano: anoAlvo, meses };
}

/** Compara receitas, despesas e saldo entre as pastas. */
export async function relatorioComparativo(mes: string | null) {
  const pastas = await listarPastas();
  for (const pasta of pastas) {
    Object.assign(pasta, await totais(Number(pasta.id), mes));
  }
  const totalDespesas = pastas.reduce((soma, p) => soma + Number(p.despesas), 0);
  for (const pasta of pastas) {
    pasta.participacao = totalDespesas
      ? Math.round((Number(pasta.despesas) * 1000) / totalDespesas) / 10
      : 0;
  }
  return {
    mes,
    pastas,
    totais: {
      receitas: pastas.reduce((soma, p) => soma + Number(p.receitas), 0),
      despesas: totalDespesas,
      saldo: pastas.reduce((soma, p) => soma + Number(p.saldo), 0),
    },
  };
}

/** Extrato em CSV com separador ';', que o Excel brasileiro abre direto. */
export async function exportarCsv(f: Filtros) {
  const { where, args } = montarFiltros(f);
  const itens = await linhas(`${LANC_SELECT}${where} ORDER BY l.data, l.id`, args);

  const escapar = (valor: unknown) => {
    const texto = String(valor ?? "");
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const linhasCsv = [
    ["Data", "Pasta", "Codigo", "Conta", "Tipo", "Descricao", "Valor", "Observacao"].join(";"),
  ];
  for (const item of itens) {
    const valor = (Number(item.valor_centavos) / 100).toFixed(2).replace(".", ",");
    const tipo = String(item.tipo);
    linhasCsv.push(
      [
        String(item.data).split("-").reverse().join("/"),
        item.pasta_nome,
        item.conta_codigo,
        item.conta_nome,
        tipo.charAt(0).toUpperCase() + tipo.slice(1),
        item.descricao,
        valor,
        item.observacao,
      ]
        .map(escapar)
        .join(";"),
    );
  }
  return `﻿${linhasCsv.join("\r\n")}\r\n`;
}
