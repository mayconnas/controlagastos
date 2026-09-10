/**
 * Camada de dados: conversa com o Supabase.
 *
 * Não há servidor próprio — o navegador fala direto com o banco. Quem garante
 * que ninguém veja ou estrague os dados de outra pessoa é o RLS, e quem garante
 * as regras de negócio são os gatilhos: tudo isso está em supabase/schema.sql.
 */

import { createClient } from "./vendor/supabase.js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, configurado } from "./config.js";

export { configurado };

export const supabase = configurado()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

const PAGINA = 1000; // limite padrão de linhas por resposta do Supabase

/* ------------------------------------------------------------------ */
/* Mensagens de erro                                                   */
/* ------------------------------------------------------------------ */

const POR_RESTRICAO = {
  lancamentos_conta_id_fkey:
    "Esta conta possui lançamentos vinculados. Reclassifique-os ou desative a conta em vez de excluir.",
  lancamentos_pasta_id_fkey:
    "Esta pasta possui lançamentos. Exclua ou mova os lançamentos antes.",
  contas_pasta_id_tipo_nome_key: "Já existe uma conta com esse nome e tipo nesta pasta.",
  pastas_user_id_nome_key: "Já existe uma pasta com esse nome.",
  lancamentos_valor_centavos_check: "O valor deve ser maior que zero.",
  contas_cor_check: "Cor inválida. Use o formato #RRGGBB.",
  pastas_cor_check: "Cor inválida. Use o formato #RRGGBB.",
  contas_nome_check: "O nome da conta é obrigatório (até 120 caracteres).",
  pastas_nome_check: "O nome da pasta é obrigatório (até 120 caracteres).",
};

/** Traduz o erro do PostgreSQL para algo que faça sentido na tela. */
export function traduzirErro(erro) {
  if (!erro) return "Erro desconhecido.";
  const { code, message, details } = erro;

  // Mensagens levantadas pelos gatilhos já vêm em português.
  if (code === "P0001" || code === "P0002") return message;

  const restricao = Object.keys(POR_RESTRICAO).find((nome) =>
    `${message ?? ""} ${details ?? ""}`.includes(nome),
  );
  if (restricao) return POR_RESTRICAO[restricao];

  if (code === "23505") return "Já existe um registro com esses dados.";
  if (code === "23503") return "Este registro está sendo usado por outro e não pode ser excluído.";
  if (code === "23514") return "Algum campo está fora do formato esperado.";
  if (code === "42501" || code === "PGRST301") {
    return "Sua sessão expirou. Entre novamente.";
  }
  return message || "Não foi possível falar com o banco de dados.";
}

function conferir({ data, error }) {
  if (error) throw new Error(traduzirErro(error));
  return data;
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

export async function sessaoAtual() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function aoMudarAutenticacao(callback) {
  supabase?.auth.onAuthStateChange((_evento, sessao) => callback(sessao));
}

export async function entrar(email, senha) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      throw new Error("E-mail ou senha incorretos.");
    }
    if (/email not confirmed/i.test(error.message)) {
      throw new Error("Confirme o e-mail que o Supabase te enviou antes de entrar.");
    }
    throw new Error(error.message);
  }
}

export async function cadastrar(email, senha) {
  const { data, error } = await supabase.auth.signUp({ email, password: senha });
  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      throw new Error("Este e-mail já tem cadastro. Use a opção de entrar.");
    }
    if (/password/i.test(error.message)) {
      throw new Error("A senha precisa ter pelo menos 6 caracteres.");
    }
    throw new Error(error.message);
  }
  // Sem sessão significa que o Supabase está exigindo confirmação por e-mail.
  return Boolean(data.session);
}

export async function sair() {
  await supabase?.auth.signOut();
}

/** Cria as pastas e o plano de contas na primeira vez que a pessoa entra. */
export async function prepararContaNova() {
  conferir(await supabase.rpc("preparar_conta_nova"));
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */

/** Busca todas as linhas de uma tabela, virando as páginas de 1000 em 1000. */
async function buscarTudo(tabela, selecao, ordem) {
  const linhas = [];
  for (let pagina = 0; ; pagina += 1) {
    const consulta = supabase
      .from(tabela)
      .select(selecao)
      .range(pagina * PAGINA, (pagina + 1) * PAGINA - 1);
    for (const [coluna, crescente] of ordem) consulta.order(coluna, { ascending: crescente });

    const lote = conferir(await consulta);
    linhas.push(...lote);
    if (lote.length < PAGINA) return linhas;
  }
}

/** Achata os dados vindos das tabelas ligadas, no formato que a tela espera. */
function achatar(lancamento) {
  const { conta, pasta, ...resto } = lancamento;
  return {
    ...resto,
    valor_centavos: Number(resto.valor_centavos),
    conta_nome: conta?.nome ?? "",
    conta_codigo: conta?.codigo ?? "",
    conta_cor: conta?.cor ?? "#3b82f6",
    pasta_nome: pasta?.nome ?? "",
    pasta_cor: pasta?.cor ?? "#3b82f6",
    pasta_icone: pasta?.icone ?? "folder",
  };
}

export async function carregarTudo() {
  const [pastas, contas, lancamentos] = await Promise.all([
    buscarTudo("pastas", "*", [["ordem", true], ["nome", true]]),
    buscarTudo("contas", "*", [["tipo", false], ["codigo", true], ["nome", true]]),
    buscarTudo(
      "lancamentos",
      "*, conta:contas(nome,codigo,cor), pasta:pastas(nome,cor,icone)",
      [["data", false], ["id", false]],
    ),
  ]);

  const usosPorConta = new Map();
  for (const l of lancamentos) {
    usosPorConta.set(l.conta_id, (usosPorConta.get(l.conta_id) ?? 0) + 1);
  }

  return {
    pastas,
    contas: contas.map((c) => ({ ...c, usos: usosPorConta.get(c.id) ?? 0 })),
    lancamentos: lancamentos.map(achatar),
  };
}

/* ------------------------------------------------------------------ */
/* Escrita                                                             */
/* ------------------------------------------------------------------ */

export async function salvarPasta(dados, id) {
  const campos = {
    nome: dados.nome,
    subtitulo: dados.subtitulo ?? "",
    icone: dados.icone || "folder",
    cor: dados.cor,
    ordem: Number(dados.ordem) || 99,
  };
  if (id) return conferir(await supabase.from("pastas").update(campos).eq("id", id).select());
  return conferir(await supabase.from("pastas").insert(campos).select());
}

export async function excluirPasta(id) {
  conferir(await supabase.from("pastas").delete().eq("id", id));
}

export async function salvarConta(dados, id) {
  const campos = {
    pasta_id: Number(dados.pasta_id),
    codigo: dados.codigo ?? "",
    nome: dados.nome,
    tipo: dados.tipo,
    cor: dados.cor,
    ativo: Boolean(dados.ativo),
  };
  if (id) return conferir(await supabase.from("contas").update(campos).eq("id", id).select());
  return conferir(await supabase.from("contas").insert(campos).select());
}

export async function excluirConta(id) {
  conferir(await supabase.from("contas").delete().eq("id", id));
}

export async function salvarLancamento(dados, id) {
  // tipo e pasta_id não são enviados de propósito: quem define é o gatilho do
  // banco, a partir da conta escolhida.
  const campos = {
    conta_id: Number(dados.conta_id),
    data: dados.data,
    descricao: dados.descricao ?? "",
    valor_centavos: dados.valor_centavos,
    observacao: dados.observacao ?? "",
  };
  if (id) return conferir(await supabase.from("lancamentos").update(campos).eq("id", id).select());
  return conferir(await supabase.from("lancamentos").insert(campos).select());
}

export async function excluirLancamento(id) {
  conferir(await supabase.from("lancamentos").delete().eq("id", id));
}
