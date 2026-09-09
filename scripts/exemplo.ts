/**
 * Popula o banco com lançamentos de exemplo (opcional).
 *
 *   npm run exemplo            # usa o mês atual
 *   npm run exemplo 2025-08    # usa o mês informado
 */

import { db, prepararBanco } from "../api/_db.js";
import { criarLancamento, hojeISO, rotuloMes, validarMes } from "../api/_servico.js";

const EXEMPLOS: Array<[string, string, number, string, number]> = [
  ["Corretor", "Comissão de venda", 28, "Comissão de venda", 2500],
  ["Corretor", "Comissão de venda", 18, "Comissão de venda", 1800],
  ["Corretor", "Comissão de locação", 10, "Comissão de locação", 8200],
  ["Corretor", "Combustível", 27, "Combustível", 180],
  ["Corretor", "Combustível", 12, "Combustível", 1020],
  ["Corretor", "Marketing", 25, "Marketing", 650],
  ["Corretor", "Alimentação", 22, "Alimentação", 420],
  ["Corretor", "Internet/Telefone", 20, "Internet/Telefone", 280],
  ["Corretor", "Outros", 15, "Outros", 700],
  ["Barbearia", "Serviços (cortes e barba)", 28, "Serviços (cortes e barba)", 320],
  ["Barbearia", "Serviços (cortes e barba)", 18, "Serviços (cortes e barba)", 290],
  ["Barbearia", "Serviços (cortes e barba)", 8, "Serviços (cortes e barba)", 7140],
  ["Barbearia", "Venda de produtos", 14, "Venda de produtos", 1000],
  ["Barbearia", "Produtos (pomadas, etc.)", 27, "Produtos", 180],
  ["Barbearia", "Produtos (pomadas, etc.)", 5, "Reposição de estoque", 800],
  ["Barbearia", "Aluguel", 25, "Aluguel", 750],
  ["Barbearia", "Energia/Água", 22, "Energia/Água", 420],
  ["Barbearia", "Internet/Telefone", 20, "Internet/Telefone", 310],
  ["Barbearia", "Outros", 16, "Outros", 520],
  ["Casa", "Salário", 18, "Salário", 5000],
  ["Casa", "Moradia (aluguel/cond.)", 28, "Aluguel", 1200],
  ["Casa", "Contas (água, luz, internet)", 27, "Conta de luz", 280],
  ["Casa", "Contas (água, luz, internet)", 22, "Internet", 400],
  ["Casa", "Alimentação", 25, "Mercado", 520],
  ["Casa", "Transporte", 21, "Transporte", 420],
  ["Casa", "Outros", 12, "Outros", 600],
];

const mes = validarMes(process.argv[2]) ?? hojeISO().slice(0, 7);
await prepararBanco();

const { rows } = await db().execute(
  "SELECT c.id, c.nome, p.nome AS pasta FROM contas c JOIN pastas p ON p.id = c.pasta_id",
);
const contas = new Map(rows.map((r) => [`${r.pasta}|${r.nome}`, Number(r.id)]));

let criados = 0;
for (const [pasta, conta, dia, descricao, valor] of EXEMPLOS) {
  const contaId = contas.get(`${pasta}|${conta}`);
  if (!contaId) {
    console.log(`  ! conta não encontrada: ${pasta} / ${conta}`);
    continue;
  }
  await criarLancamento({
    conta_id: contaId,
    valor,
    data: `${mes}-${String(dia).padStart(2, "0")}`,
    descricao,
  });
  criados += 1;
}
console.log(`${criados} lançamentos de exemplo criados em ${rotuloMes(mes)}.`);
