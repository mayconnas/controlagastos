/**
 * Cálculos e formatação.
 *
 * Nesta arquitetura o navegador busca os lançamentos do Supabase e faz as
 * somas aqui. São funções puras — não conhecem tela nem banco — justamente
 * para poderem ser testadas isoladamente.
 */

export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Aceita 1234.56, "1234,56", "1.234,56" ou "R$ 1.234,56" e devolve centavos. */
export function paraCentavos(bruto) {
  if (bruto === undefined || bruto === null || bruto === "") {
    throw new Error("Informe o valor do lançamento.");
  }
  let numero;
  if (typeof bruto === "string") {
    let limpo = bruto.trim().replace(/R\$/g, "").replace(/\s/g, "");
    if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");
    numero = Number(limpo);
  } else {
    numero = Number(bruto);
  }
  if (!Number.isFinite(numero)) throw new Error("Valor inválido. Use por exemplo 1250,00.");
  const centavos = Math.round(numero * 100);
  if (centavos <= 0) throw new Error("O valor deve ser maior que zero.");
  if (centavos > 1e13) throw new Error("Valor acima do limite permitido.");
  return centavos;
}

export function moeda(centavos) {
  return `R$ ${(Number(centavos || 0) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function dataBR(iso) {
  if (!iso) return "";
  const [ano, mes, dia] = String(iso).slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function hojeISO() {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function mesDe(iso) {
  return String(iso).slice(0, 7);
}

export function rotuloMes(mes) {
  const [ano, numero] = String(mes).split("-");
  return `${MESES_PT[Number(numero) - 1]}/${ano}`;
}

export function totalizar(lancamentos) {
  let receitas = 0;
  let despesas = 0;
  for (const l of lancamentos) {
    if (l.tipo === "receita") receitas += Number(l.valor_centavos);
    else despesas += Number(l.valor_centavos);
  }
  return { receitas, despesas, saldo: receitas - despesas };
}

/** Total por conta do plano de contas, com o percentual sobre o total. */
export function porConta(lancamentos, tipo = "despesa") {
  const soma = new Map();
  for (const l of lancamentos) {
    if (l.tipo !== tipo) continue;
    const chave = l.conta_id;
    const item = soma.get(chave) ?? {
      id: l.conta_id,
      nome: l.conta_nome,
      codigo: l.conta_codigo,
      cor: l.conta_cor,
      total: 0,
    };
    item.total += Number(l.valor_centavos);
    soma.set(chave, item);
  }
  const itens = [...soma.values()].sort((a, b) => b.total - a.total);
  const total = itens.reduce((acumulado, item) => acumulado + item.total, 0);
  for (const item of itens) {
    item.percentual = total ? Math.round((item.total * 1000) / total) / 10 : 0;
  }
  return { total, tipo, itens };
}

/** Os doze meses do ano informado, mesmo os sem movimento. */
export function evolucaoMensal(lancamentos, ano) {
  const porMes = new Map();
  for (const l of lancamentos) {
    if (Number(String(l.data).slice(0, 4)) !== Number(ano)) continue;
    const chave = mesDe(l.data);
    const item = porMes.get(chave) ?? { receitas: 0, despesas: 0 };
    if (l.tipo === "receita") item.receitas += Number(l.valor_centavos);
    else item.despesas += Number(l.valor_centavos);
    porMes.set(chave, item);
  }
  const meses = [];
  for (let i = 1; i <= 12; i += 1) {
    const chave = `${ano}-${String(i).padStart(2, "0")}`;
    const { receitas = 0, despesas = 0 } = porMes.get(chave) ?? {};
    meses.push({
      mes: chave,
      receitas,
      despesas,
      saldo: receitas - despesas,
      rotulo: MESES_PT[i - 1].slice(0, 3),
    });
  }
  return { ano: Number(ano), meses };
}

export function mesesDisponiveis(lancamentos) {
  const encontrados = [...new Set(lancamentos.map((l) => mesDe(l.data)))].sort().reverse();
  const atual = mesDe(hojeISO());
  if (!encontrados.includes(atual)) encontrados.unshift(atual);
  return encontrados.map((mes) => ({ valor: mes, rotulo: rotuloMes(mes) }));
}

export function anosDisponiveis(lancamentos) {
  const encontrados = [...new Set(lancamentos.map((l) => Number(String(l.data).slice(0, 4))))]
    .sort((a, b) => b - a);
  const atual = new Date().getFullYear();
  if (!encontrados.includes(atual)) encontrados.unshift(atual);
  return encontrados;
}

/** Filtros da tela de lançamentos, aplicados sobre o que já foi buscado. */
export function filtrar(lancamentos, filtros = {}) {
  const { pastaId, mes, tipo, contaId, busca, de, ate } = filtros;
  const alvo = busca ? busca.trim().toLowerCase() : "";
  return lancamentos.filter((l) => {
    if (pastaId && Number(l.pasta_id) !== Number(pastaId)) return false;
    if (tipo && l.tipo !== tipo) return false;
    if (contaId && Number(l.conta_id) !== Number(contaId)) return false;
    if (de && l.data < de) return false;
    if (ate && l.data > ate) return false;
    if (mes && !de && !ate && mesDe(l.data) !== mes) return false;
    if (alvo) {
      const campos = `${l.descricao} ${l.observacao} ${l.conta_nome}`.toLowerCase();
      if (!campos.includes(alvo)) return false;
    }
    return true;
  });
}

/** Extrato em CSV com separador ';', que o Excel brasileiro abre direto. */
export function paraCsv(lancamentos) {
  const escapar = (valor) => {
    const texto = String(valor ?? "");
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const linhas = [
    ["Data", "Pasta", "Codigo", "Conta", "Tipo", "Descricao", "Valor", "Observacao"].join(";"),
  ];
  for (const l of lancamentos) {
    linhas.push(
      [
        dataBR(l.data),
        l.pasta_nome,
        l.conta_codigo,
        l.conta_nome,
        l.tipo.charAt(0).toUpperCase() + l.tipo.slice(1),
        l.descricao,
        (Number(l.valor_centavos) / 100).toFixed(2).replace(".", ","),
        l.observacao,
      ]
        .map(escapar)
        .join(";"),
    );
  }
  return `﻿${linhas.join("\r\n")}\r\n`;
}
