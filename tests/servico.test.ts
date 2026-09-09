import { beforeEach, describe, expect, it } from "vitest";

import { bancoLimpo } from "./apoio.js";

let servico: typeof import("../api/_servico.js");
let pastas: Record<string, number>;
let contas: Map<string, number>;

const conta = (pastaNome: string, contaNome: string): number => {
  const id = contas.get(`${pastaNome}|${contaNome}`);
  if (!id) throw new Error(`conta inexistente: ${pastaNome} / ${contaNome}`);
  return id;
};

beforeEach(async () => {
  await bancoLimpo();
  servico = await import("../api/_servico.js");

  pastas = Object.fromEntries(
    (await servico.listarPastas()).map((p) => [String(p.nome), Number(p.id)]),
  );
  contas = new Map(
    (await servico.listarContas()).map((c) => [`${c.pasta_nome}|${c.nome}`, Number(c.id)]),
  );
});

describe("dados iniciais", () => {
  it("cria as três pastas pedidas", () => {
    expect(Object.keys(pastas).sort()).toEqual(["Barbearia", "Casa", "Corretor"]);
  });

  it("cria o plano de contas separado por pasta", async () => {
    const corretor = await servico.listarContas({ pastaId: pastas.Corretor });
    expect(corretor.some((c) => c.nome === "Combustível" && c.tipo === "despesa")).toBe(true);
    expect(corretor.some((c) => c.tipo === "receita")).toBe(true);
    expect(corretor.some((c) => c.nome === "Aluguel")).toBe(false); // é da Barbearia
  });
});

describe("plano de contas", () => {
  it("cadastra, altera e exclui", async () => {
    const criada = await servico.criarConta({
      nome: "Manutenção",
      tipo: "despesa",
      codigo: "2.10",
      pasta_id: pastas.Barbearia,
      cor: "#ff0000",
    });
    expect(criada?.nome).toBe("Manutenção");

    const editada = await servico.atualizarConta(Number(criada!.id), {
      nome: "Manutenção e reparos",
      tipo: "despesa",
      pasta_id: pastas.Barbearia,
      cor: "#00ff00",
      ativo: true,
    });
    expect(editada?.nome).toBe("Manutenção e reparos");

    await servico.excluirConta(Number(criada!.id));
    const restantes = await servico.listarContas();
    expect(restantes.some((c) => Number(c.id) === Number(criada!.id))).toBe(false);
  });

  it("recusa nome repetido na mesma pasta", async () => {
    await expect(
      servico.criarConta({ nome: "Combustível", tipo: "despesa", pasta_id: pastas.Corretor }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("aceita o mesmo nome em pastas diferentes", async () => {
    const criada = await servico.criarConta({
      nome: "Combustível",
      tipo: "despesa",
      pasta_id: pastas.Casa,
    });
    expect(criada?.pasta_nome).toBe("Casa");
  });

  it("não exclui conta que já tem lançamento", async () => {
    const contaId = conta("Casa", "Salário");
    await servico.criarLancamento({ conta_id: contaId, valor: 100, data: "2025-08-05" });
    await expect(servico.excluirConta(contaId)).rejects.toMatchObject({ status: 409 });
  });

  it("não muda o tipo de conta que já tem lançamento", async () => {
    const contaId = conta("Casa", "Salário");
    await servico.criarLancamento({ conta_id: contaId, valor: 100 });
    await expect(
      servico.atualizarConta(contaId, { nome: "Salário", tipo: "despesa", pasta_id: pastas.Casa }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("conta inativa não aceita lançamento", async () => {
    const contaId = conta("Casa", "Transporte");
    await servico.atualizarConta(contaId, {
      nome: "Transporte",
      tipo: "despesa",
      pasta_id: pastas.Casa,
      ativo: false,
    });
    await expect(servico.criarLancamento({ conta_id: contaId, valor: 50 })).rejects.toThrow(/inativa/);
  });
});

describe("lançamentos", () => {
  it("entende valores no formato brasileiro", async () => {
    const contaId = conta("Corretor", "Comissão de venda");
    for (const [entrada, esperado] of [
      ["1.234,56", 123456],
      ["1234,56", 123456],
      ["R$ 1.234,56", 123456],
      [1234.56, 123456],
      ["0,10", 10],
    ] as const) {
      const lanc = await servico.criarLancamento({
        conta_id: contaId,
        valor: entrada,
        data: "2025-08-01",
      });
      expect(lanc?.valor_centavos).toBe(esperado);
    }
  });

  it("tira o tipo e a pasta da conta escolhida", async () => {
    const lanc = await servico.criarLancamento({
      conta_id: conta("Barbearia", "Aluguel"),
      valor: 750,
      data: "2025-08-25",
    });
    expect(lanc?.tipo).toBe("despesa");
    expect(lanc?.pasta_nome).toBe("Barbearia");
  });

  it("recusa valores inválidos", async () => {
    const contaId = conta("Casa", "Salário");
    for (const valor of [0, -10, "abc", null, undefined, ""]) {
      await expect(servico.criarLancamento({ conta_id: contaId, valor })).rejects.toThrow();
    }
  });

  it("recusa data inexistente", async () => {
    await expect(
      servico.criarLancamento({ conta_id: conta("Casa", "Salário"), valor: 10, data: "2025-02-31" }),
    ).rejects.toThrow(/calendário/);
  });

  it("edita e exclui", async () => {
    const lanc = await servico.criarLancamento({
      conta_id: conta("Casa", "Alimentação"),
      valor: 100,
      data: "2025-08-10",
    });
    const editado = await servico.atualizarLancamento(Number(lanc!.id), {
      conta_id: conta("Casa", "Transporte"),
      valor: "250,50",
      data: "2025-08-11",
      descricao: "Uber",
    });
    expect(editado?.valor_centavos).toBe(25050);
    expect(editado?.conta_nome).toBe("Transporte");

    await servico.excluirLancamento(Number(lanc!.id));
    await expect(servico.excluirLancamento(Number(lanc!.id))).rejects.toMatchObject({ status: 404 });
  });

  it("recusa conta de outra pasta", async () => {
    await expect(
      servico.criarLancamento({
        conta_id: conta("Casa", "Salário"),
        valor: 10,
        pasta_id: pastas.Barbearia,
      }),
    ).rejects.toThrow(/outra pasta/);
  });

  it("usa o nome da conta quando não há descrição", async () => {
    const lanc = await servico.criarLancamento({ conta_id: conta("Casa", "Salário"), valor: 10 });
    expect(lanc?.descricao).toBe("Salário");
  });
});

describe("relatórios", () => {
  beforeEach(async () => {
    const dados: Array<[string, string, string, number]> = [
      ["Corretor", "Comissão de venda", "2025-08-10", 2500],
      ["Corretor", "Combustível", "2025-08-11", 180],
      ["Corretor", "Marketing", "2025-08-12", 320],
      ["Casa", "Salário", "2025-08-05", 5000],
      ["Casa", "Alimentação", "2025-08-06", 500],
      ["Casa", "Alimentação", "2025-07-06", 900],
    ];
    for (const [pastaNome, contaNome, data, valor] of dados) {
      await servico.criarLancamento({ conta_id: conta(pastaNome, contaNome), valor, data });
    }
  });

  it("totaliza por pasta e no geral", async () => {
    const p = await servico.painel("2025-08");
    const corretor = p.pastas.find((x) => x.nome === "Corretor")!;
    expect(corretor.receitas).toBe(250000);
    expect(corretor.despesas).toBe(50000);
    expect(corretor.saldo).toBe(200000);
    expect(p.geral).toEqual({ receitas: 750000, despesas: 100000, saldo: 650000 });
    expect(p.rotulo).toBe("Agosto/2025");
  });

  it("não mistura as pastas", async () => {
    const p = await servico.painel("2025-08");
    const barbearia = p.pastas.find((x) => x.nome === "Barbearia")!;
    expect(barbearia.receitas).toBe(0);
    expect(barbearia.despesas).toBe(0);
  });

  it("calcula percentual por categoria", async () => {
    const cat = await servico.categorias(pastas.Corretor!, "2025-08", "despesa");
    expect(cat.total).toBe(50000);
    expect(cat.itens[0]!.nome).toBe("Marketing");
    expect(cat.itens[0]!.percentual).toBe(64);
  });

  it("monta os doze meses do ano", async () => {
    const mensal = await servico.relatorioMensal(2025, pastas.Casa);
    expect(mensal.meses).toHaveLength(12);
    expect(mensal.meses[6]!.despesas).toBe(90000);
    expect(mensal.meses[6]!.saldo).toBe(-90000);
    expect(mensal.meses[0]!.receitas).toBe(0);
  });

  it("compara as pastas entre si", async () => {
    const comp = await servico.relatorioComparativo("2025-08");
    expect(comp.totais.despesas).toBe(100000);
    expect(comp.pastas.find((p) => p.nome === "Casa")!.participacao).toBe(50);
  });

  it("filtra por período", async () => {
    const res = await servico.listarLancamentos({ de: "2025-07-01", ate: "2025-07-31" });
    expect(res.total).toBe(1);
    expect(res.despesas).toBe(90000);
  });

  it("filtra por texto", async () => {
    const res = await servico.listarLancamentos({ busca: "Marketing" });
    expect(res.total).toBe(1);
  });

  it("exporta CSV com data e valor no padrão brasileiro", async () => {
    const csv = await servico.exportarCsv({ pastaId: pastas.Casa, mes: "2025-08" });
    const linhas = csv.trim().split("\r\n");
    expect(linhas).toHaveLength(3); // cabeçalho + 2 lançamentos
    expect(csv).toContain("5000,00");
    expect(csv).toContain("05/08/2025");
  });
});

describe("pastas", () => {
  it("cadastra, altera e protege contra exclusão com lançamentos", async () => {
    const nova = await servico.criarPasta({ nome: "Aluguéis", cor: "#123456" });
    await servico.atualizarPasta(Number(nova!.id), { nome: "Aluguéis de imóveis", cor: "#654321" });

    const contaNova = await servico.criarConta({
      nome: "Aluguel recebido",
      tipo: "receita",
      pasta_id: Number(nova!.id),
    });
    await servico.criarLancamento({ conta_id: Number(contaNova!.id), valor: 1200 });

    await expect(servico.excluirPasta(Number(nova!.id))).rejects.toMatchObject({ status: 409 });
  });

  it("recusa nome de pasta repetido", async () => {
    await expect(servico.criarPasta({ nome: "Casa" })).rejects.toMatchObject({ status: 409 });
  });
});
