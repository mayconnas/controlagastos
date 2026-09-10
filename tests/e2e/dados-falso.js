/**
 * Dublê da camada de dados, usado só nos testes de interface.
 *
 * Expõe a mesma API de public/dados.js, guardando tudo em memória e imitando
 * as regras que no Supabase são garantidas por gatilhos e chaves estrangeiras.
 * Assim a interface é testada de verdade, sem depender de rede.
 */

export const configurado = () => true;
export const traduzirErro = (e) => e?.message ?? "Erro.";

let sessao = null;
let ouvinte = null;
let sequencia = 100;

const banco = { pastas: [], contas: [], lancamentos: [] };

const PASTAS = [
  ["Corretor", "Comissões • Despesas • Lucro", "corretor", "#f5a524", 1],
  ["Barbearia", "Vendas • Despesas • Lucro", "barbearia", "#3b82f6", 2],
  ["Casa", "Moradia • Contas • Despesas", "casa", "#22c55e", 3],
];

const CONTAS = [
  ["Corretor", "1.01", "Comissão de venda", "receita", "#22c55e"],
  ["Corretor", "1.02", "Comissão de locação", "receita", "#16a34a"],
  ["Corretor", "2.01", "Combustível", "despesa", "#3b82f6"],
  ["Corretor", "2.02", "Marketing", "despesa", "#f97316"],
  ["Corretor", "2.03", "Alimentação", "despesa", "#22c55e"],
  ["Corretor", "2.04", "Internet/Telefone", "despesa", "#8b5cf6"],
  ["Corretor", "2.99", "Outros", "despesa", "#94a3b8"],
  ["Barbearia", "1.01", "Serviços (cortes e barba)", "receita", "#22c55e"],
  ["Barbearia", "1.02", "Venda de produtos", "receita", "#16a34a"],
  ["Barbearia", "2.01", "Produtos (pomadas, etc.)", "despesa", "#3b82f6"],
  ["Barbearia", "2.02", "Aluguel", "despesa", "#f97316"],
  ["Barbearia", "2.03", "Energia/Água", "despesa", "#22c55e"],
  ["Barbearia", "2.04", "Internet/Telefone", "despesa", "#8b5cf6"],
  ["Barbearia", "2.99", "Outros", "despesa", "#94a3b8"],
  ["Casa", "1.01", "Salário", "receita", "#22c55e"],
  ["Casa", "2.01", "Moradia (aluguel/cond.)", "despesa", "#3b82f6"],
  ["Casa", "2.02", "Contas (água, luz, internet)", "despesa", "#f97316"],
  ["Casa", "2.03", "Alimentação", "despesa", "#22c55e"],
  ["Casa", "2.04", "Transporte", "despesa", "#8b5cf6"],
  ["Casa", "2.99", "Outros", "despesa", "#ec4899"],
];

/** Mesmos lançamentos do exemplo.sql: [pasta, conta, dia, descrição, centavos] */
const EXEMPLOS = [
  ["Corretor", "Comissão de venda", 28, "Comissão de venda", 250000],
  ["Corretor", "Comissão de venda", 18, "Comissão de venda", 180000],
  ["Corretor", "Comissão de locação", 10, "Comissão de locação", 820000],
  ["Corretor", "Combustível", 27, "Combustível", 18000],
  ["Corretor", "Combustível", 12, "Combustível", 102000],
  ["Corretor", "Marketing", 25, "Marketing", 65000],
  ["Corretor", "Alimentação", 22, "Alimentação", 42000],
  ["Corretor", "Internet/Telefone", 20, "Internet/Telefone", 28000],
  ["Corretor", "Outros", 15, "Outros", 70000],
  ["Barbearia", "Serviços (cortes e barba)", 28, "Serviços", 32000],
  ["Barbearia", "Serviços (cortes e barba)", 18, "Serviços", 29000],
  ["Barbearia", "Serviços (cortes e barba)", 8, "Serviços", 714000],
  ["Barbearia", "Venda de produtos", 14, "Venda de produtos", 100000],
  ["Barbearia", "Produtos (pomadas, etc.)", 27, "Produtos", 18000],
  ["Barbearia", "Produtos (pomadas, etc.)", 5, "Reposição de estoque", 80000],
  ["Barbearia", "Aluguel", 25, "Aluguel", 75000],
  ["Barbearia", "Energia/Água", 22, "Energia/Água", 42000],
  ["Barbearia", "Internet/Telefone", 20, "Internet/Telefone", 31000],
  ["Barbearia", "Outros", 16, "Outros", 52000],
  ["Casa", "Salário", 18, "Salário", 500000],
  ["Casa", "Moradia (aluguel/cond.)", 28, "Aluguel", 120000],
  ["Casa", "Contas (água, luz, internet)", 27, "Conta de luz", 28000],
  ["Casa", "Contas (água, luz, internet)", 22, "Internet", 40000],
  ["Casa", "Alimentação", 25, "Mercado", 52000],
  ["Casa", "Transporte", 21, "Transporte", 42000],
  ["Casa", "Outros", 12, "Outros", 60000],
];

const mesAtual = () => new Date().toISOString().slice(0, 7);
const acharPasta = (nome) => banco.pastas.find((p) => p.nome === nome);
const acharConta = (pastaNome, nome) =>
  banco.contas.find((c) => c.pasta_id === acharPasta(pastaNome)?.id && c.nome === nome);

export async function prepararContaNova() {
  if (banco.pastas.length) return;
  for (const [nome, subtitulo, icone, cor, ordem] of PASTAS) {
    banco.pastas.push({ id: sequencia++, nome, subtitulo, icone, cor, ordem });
  }
  for (const [pasta, codigo, nome, tipo, cor] of CONTAS) {
    banco.contas.push({ id: sequencia++, pasta_id: acharPasta(pasta).id, codigo, nome, tipo, cor, ativo: true });
  }
  for (const [pasta, conta, dia, descricao, valor] of EXEMPLOS) {
    const c = acharConta(pasta, conta);
    banco.lancamentos.push({
      id: sequencia++, conta_id: c.id, pasta_id: c.pasta_id, tipo: c.tipo,
      data: `${mesAtual()}-${String(dia).padStart(2, "0")}`,
      descricao, valor_centavos: valor, observacao: "",
    });
  }
}

/* ------------------------------- login ------------------------------ */

export async function sessaoAtual() { return sessao; }
export function aoMudarAutenticacao(cb) { ouvinte = cb; }

export async function entrar(email, senha) {
  if (senha !== "senha123") throw new Error("E-mail ou senha incorretos.");
  sessao = { user: { id: "u1", email } };
  ouvinte?.(sessao);
}

export async function cadastrar(email) {
  sessao = { user: { id: "u1", email } };
  ouvinte?.(sessao);
  return true;
}

export async function sair() { sessao = null; ouvinte?.(null); }

/* ------------------------------ leitura ----------------------------- */

export async function carregarTudo() {
  const usos = new Map();
  for (const l of banco.lancamentos) usos.set(l.conta_id, (usos.get(l.conta_id) ?? 0) + 1);

  const porId = new Map(banco.contas.map((c) => [c.id, c]));
  const pastaPorId = new Map(banco.pastas.map((p) => [p.id, p]));

  return {
    pastas: [...banco.pastas].sort((a, b) => a.ordem - b.ordem),
    contas: banco.contas.map((c) => ({ ...c, usos: usos.get(c.id) ?? 0 })),
    lancamentos: [...banco.lancamentos]
      .sort((a, b) => (b.data === a.data ? b.id - a.id : b.data.localeCompare(a.data)))
      .map((l) => {
        const c = porId.get(l.conta_id);
        const p = pastaPorId.get(l.pasta_id);
        return {
          ...l,
          conta_nome: c?.nome ?? "", conta_codigo: c?.codigo ?? "", conta_cor: c?.cor ?? "#3b82f6",
          pasta_nome: p?.nome ?? "", pasta_cor: p?.cor ?? "#3b82f6", pasta_icone: p?.icone ?? "folder",
        };
      }),
  };
}

/* ------------------------------ escrita ----------------------------- */

export async function salvarPasta(dados, id) {
  const campos = {
    nome: dados.nome, subtitulo: dados.subtitulo ?? "", icone: dados.icone || "folder",
    cor: dados.cor, ordem: Number(dados.ordem) || 99,
  };
  if (banco.pastas.some((p) => p.nome === campos.nome && p.id !== id)) {
    throw new Error("Já existe uma pasta com esse nome.");
  }
  if (id) Object.assign(banco.pastas.find((p) => p.id === id), campos);
  else banco.pastas.push({ id: sequencia++, ...campos });
}

export async function excluirPasta(id) {
  if (banco.lancamentos.some((l) => l.pasta_id === id)) {
    throw new Error("Esta pasta possui lançamentos. Exclua ou mova os lançamentos antes.");
  }
  banco.contas = banco.contas.filter((c) => c.pasta_id !== id);
  banco.pastas = banco.pastas.filter((p) => p.id !== id);
}

export async function salvarConta(dados, id) {
  const campos = {
    pasta_id: Number(dados.pasta_id), codigo: dados.codigo ?? "", nome: dados.nome,
    tipo: dados.tipo, cor: dados.cor, ativo: Boolean(dados.ativo),
  };
  const repetida = banco.contas.some(
    (c) => c.id !== id && c.pasta_id === campos.pasta_id && c.tipo === campos.tipo && c.nome === campos.nome);
  if (repetida) throw new Error("Já existe uma conta com esse nome e tipo nesta pasta.");

  if (id) {
    const atual = banco.contas.find((c) => c.id === id);
    const temLancamento = banco.lancamentos.some((l) => l.conta_id === id);
    if (temLancamento && atual.tipo !== campos.tipo) {
      throw new Error("Não é possível mudar o tipo de uma conta que já possui lançamentos.");
    }
    Object.assign(atual, campos);
    for (const l of banco.lancamentos) if (l.conta_id === id) l.pasta_id = campos.pasta_id;
  } else {
    banco.contas.push({ id: sequencia++, ...campos });
  }
}

export async function excluirConta(id) {
  if (banco.lancamentos.some((l) => l.conta_id === id)) {
    throw new Error(
      "Esta conta possui lançamentos vinculados. Reclassifique-os ou desative a conta em vez de excluir.");
  }
  banco.contas = banco.contas.filter((c) => c.id !== id);
}

export async function salvarLancamento(dados, id) {
  const conta = banco.contas.find((c) => c.id === Number(dados.conta_id));
  if (!conta) throw new Error("Conta do plano de contas não encontrada.");
  if (!conta.ativo) throw new Error(`A conta "${conta.nome}" está inativa.`);
  if (!(dados.valor_centavos > 0)) throw new Error("O valor deve ser maior que zero.");

  // Como no banco: tipo e pasta vêm da conta, não do que a tela mandou.
  const campos = {
    conta_id: conta.id, pasta_id: conta.pasta_id, tipo: conta.tipo,
    data: dados.data, descricao: dados.descricao ?? "",
    valor_centavos: dados.valor_centavos, observacao: dados.observacao ?? "",
  };
  if (id) Object.assign(banco.lancamentos.find((l) => l.id === id), campos);
  else banco.lancamentos.push({ id: sequencia++, ...campos });
}

export async function excluirLancamento(id) {
  banco.lancamentos = banco.lancamentos.filter((l) => l.id !== id);
}
