/**
 * Testes dos cálculos que hoje acontecem no navegador.
 *
 * São funções puras (não conhecem tela nem banco), então dá para verificar
 * cada soma e cada percentual isoladamente.
 */

import { describe, expect, it } from "vitest";

import {
  anosDisponiveis, dataBR, evolucaoMensal, filtrar, mesesDisponiveis, moeda,
  paraCentavos, paraCsv, porConta, rotuloMes, totalizar,
} from "../public/calculos.js";

type Lanc = {
  id: number; pasta_id: number; conta_id: number; tipo: "receita" | "despesa";
  data: string; descricao: string; valor_centavos: number; observacao: string;
  conta_nome: string; conta_codigo: string; conta_cor: string; pasta_nome: string;
};

let proximo = 1;
function lanc(campos: Partial<Lanc>): Lanc {
  return {
    id: proximo++, pasta_id: 1, conta_id: 1, tipo: "despesa", data: "2025-08-10",
    descricao: "", valor_centavos: 1000, observacao: "", conta_nome: "Conta",
    conta_codigo: "", conta_cor: "#3b82f6", pasta_nome: "Corretor", ...campos,
  } as Lanc;
}

/** Os mesmos números do painel de exemplo, para conferir os totais. */
const CORRETOR = [
  lanc({ tipo: "receita", conta_id: 1, conta_nome: "Comissão de venda", valor_centavos: 250000 }),
  lanc({ tipo: "receita", conta_id: 1, conta_nome: "Comissão de venda", valor_centavos: 180000 }),
  lanc({ tipo: "receita", conta_id: 2, conta_nome: "Comissão de locação", valor_centavos: 820000 }),
  lanc({ tipo: "despesa", conta_id: 3, conta_nome: "Combustível", valor_centavos: 18000 }),
  lanc({ tipo: "despesa", conta_id: 3, conta_nome: "Combustível", valor_centavos: 102000 }),
  lanc({ tipo: "despesa", conta_id: 4, conta_nome: "Marketing", valor_centavos: 65000 }),
  lanc({ tipo: "despesa", conta_id: 5, conta_nome: "Alimentação", valor_centavos: 42000 }),
  lanc({ tipo: "despesa", conta_id: 6, conta_nome: "Internet/Telefone", valor_centavos: 28000 }),
  lanc({ tipo: "despesa", conta_id: 7, conta_nome: "Outros", valor_centavos: 70000 }),
];

describe("valores em formato brasileiro", () => {
  it("aceita as formas que a pessoa digita", () => {
    expect(paraCentavos("1.234,56")).toBe(123456);
    expect(paraCentavos("1234,56")).toBe(123456);
    expect(paraCentavos("R$ 1.234,56")).toBe(123456);
    expect(paraCentavos(1234.56)).toBe(123456);
    expect(paraCentavos("0,10")).toBe(10);
  });

  it("recusa valores impossíveis", () => {
    for (const valor of [0, -10, "abc", null, undefined, ""]) {
      expect(() => paraCentavos(valor as never)).toThrow();
    }
  });

  it("formata em reais", () => {
    expect(moeda(123456)).toBe("R$ 1.234,56");
    expect(moeda(0)).toBe("R$ 0,00");
    expect(moeda(1660000)).toBe("R$ 16.600,00");
  });

  it("formata datas no padrão brasileiro", () => {
    expect(dataBR("2025-08-28")).toBe("28/08/2025");
    expect(rotuloMes("2025-08")).toBe("Agosto/2025");
  });
});

describe("totais", () => {
  it("soma entradas, despesas e saldo", () => {
    expect(totalizar(CORRETOR)).toEqual({
      receitas: 1250000,
      despesas: 325000,
      saldo: 925000,
    });
  });

  it("devolve zeros quando não há lançamentos", () => {
    expect(totalizar([])).toEqual({ receitas: 0, despesas: 0, saldo: 0 });
  });

  it("saldo fica negativo quando a despesa é maior", () => {
    const so = [lanc({ tipo: "despesa", valor_centavos: 90000 })];
    expect(totalizar(so).saldo).toBe(-90000);
  });
});

describe("agrupamento por conta", () => {
  it("agrupa, ordena do maior para o menor e calcula o percentual", () => {
    const cat = porConta(CORRETOR, "despesa");
    expect(cat.total).toBe(325000);
    expect(cat.itens.map((i) => i.nome)).toEqual([
      "Combustível", "Outros", "Marketing", "Alimentação", "Internet/Telefone",
    ]);
    expect(cat.itens[0]!.total).toBe(120000); // as duas linhas de combustível somadas
    expect(cat.itens[0]!.percentual).toBe(36.9);
    expect(cat.itens.reduce((s, i) => s + i.total, 0)).toBe(cat.total);
  });

  it("separa receita de despesa", () => {
    expect(porConta(CORRETOR, "receita").total).toBe(1250000);
  });

  it("não divide por zero quando não há nada", () => {
    expect(porConta([], "despesa")).toEqual({ total: 0, tipo: "despesa", itens: [] });
  });
});

describe("evolução mensal", () => {
  const dois = [
    lanc({ tipo: "receita", data: "2025-03-10", valor_centavos: 500000 }),
    lanc({ tipo: "despesa", data: "2025-03-15", valor_centavos: 120000 }),
    lanc({ tipo: "despesa", data: "2025-07-06", valor_centavos: 90000 }),
    lanc({ tipo: "despesa", data: "2024-07-06", valor_centavos: 999999 }),
  ];

  it("devolve sempre doze meses", () => {
    const { meses } = evolucaoMensal(dois, 2025);
    expect(meses).toHaveLength(12);
    expect(meses.map((m) => m.rotulo)).toEqual([
      "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
    ]);
  });

  it("soma cada mês e ignora outros anos", () => {
    const { meses } = evolucaoMensal(dois, 2025);
    expect(meses[2]).toMatchObject({ receitas: 500000, despesas: 120000, saldo: 380000 });
    expect(meses[6]).toMatchObject({ receitas: 0, despesas: 90000, saldo: -90000 });
    expect(meses[0]).toMatchObject({ receitas: 0, despesas: 0 });
  });
});

describe("filtros", () => {
  const variados = [
    lanc({ pasta_id: 1, conta_id: 10, data: "2025-08-05", descricao: "Mercado do bairro" }),
    lanc({ pasta_id: 2, conta_id: 11, data: "2025-08-20", descricao: "Aluguel" }),
    lanc({ pasta_id: 1, conta_id: 10, data: "2025-07-11", descricao: "Combustível" }),
    lanc({ pasta_id: 1, conta_id: 12, tipo: "receita", data: "2025-08-30", descricao: "Comissão" }),
  ];

  it("filtra por pasta", () => {
    expect(filtrar(variados, { pastaId: 1 })).toHaveLength(3);
  });

  it("filtra por mês", () => {
    expect(filtrar(variados, { mes: "2025-08" })).toHaveLength(3);
  });

  it("filtra por tipo e por conta", () => {
    expect(filtrar(variados, { tipo: "receita" })).toHaveLength(1);
    expect(filtrar(variados, { contaId: 10 })).toHaveLength(2);
  });

  it("busca sem diferenciar maiúsculas", () => {
    expect(filtrar(variados, { busca: "MERCADO" })).toHaveLength(1);
    expect(filtrar(variados, { busca: "aluguel" })).toHaveLength(1);
  });

  it("o período tem prioridade sobre o mês", () => {
    const achados = filtrar(variados, { mes: "2025-08", de: "2025-07-01", ate: "2025-07-31" });
    expect(achados).toHaveLength(1);
    expect(achados[0]!.descricao).toBe("Combustível");
  });
});

describe("listas de períodos", () => {
  it("lista os meses com movimento, do mais novo para o mais antigo", () => {
    const meses = mesesDisponiveis([
      lanc({ data: "2025-07-01" }),
      lanc({ data: "2025-08-01" }),
      lanc({ data: "2025-08-20" }),
    ]);
    const valores = meses.map((m) => m.valor);
    expect(valores).toContain("2025-08");
    expect(valores).toContain("2025-07");
    expect(valores.indexOf("2025-08")).toBeLessThan(valores.indexOf("2025-07"));
  });

  it("inclui sempre o mês e o ano atuais, mesmo sem lançamentos", () => {
    const agora = new Date();
    const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
    expect(mesesDisponiveis([]).map((m) => m.valor)).toContain(mesAtual);
    expect(anosDisponiveis([])).toContain(agora.getFullYear());
  });
});

describe("exportação CSV", () => {
  it("usa ponto e vírgula, data e valor no padrão brasileiro", () => {
    const csv = paraCsv([
      lanc({ data: "2025-08-05", descricao: "Mercado", valor_centavos: 52000, conta_nome: "Alimentação" }),
    ]);
    const linhas = csv.trim().split("\r\n");
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toContain("05/08/2025");
    expect(linhas[1]).toContain("520,00");
    expect(linhas[0]).toContain("Data;Pasta;Codigo;Conta");
  });

  it("protege textos que contêm ponto e vírgula", () => {
    const csv = paraCsv([lanc({ descricao: 'Compra; com "aspas"' })]);
    expect(csv).toContain('"Compra; com ""aspas"""');
  });
});
