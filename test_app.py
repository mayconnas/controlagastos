#!/usr/bin/env python3
"""Testes do Controla Gastos: python3 test_app.py"""

import os
import tempfile
import unittest

os.environ["FINANCAS_DB"] = os.path.join(tempfile.mkdtemp(), "teste.db")

import api  # noqa: E402
import db  # noqa: E402


class Base(unittest.TestCase):
    def setUp(self):
        if os.path.exists(db.DB_PATH):
            os.remove(db.DB_PATH)
        db.init()
        self.pastas = {p["nome"]: p["id"] for p in api.listar_pastas()}
        self.contas = {(c["pasta_nome"], c["nome"]): c["id"] for c in api.listar_contas()}

    def conta(self, pasta, nome):
        return self.contas[(pasta, nome)]


class TestSementes(Base):
    def test_tres_pastas_padrao(self):
        self.assertEqual(sorted(self.pastas), ["Barbearia", "Casa", "Corretor"])

    def test_plano_de_contas_por_pasta(self):
        corretor = api.listar_contas(pasta_id=self.pastas["Corretor"])
        self.assertTrue(any(c["nome"] == "Combustível" and c["tipo"] == "despesa" for c in corretor))
        self.assertTrue(any(c["tipo"] == "receita" for c in corretor))


class TestPlanoDeContas(Base):
    def test_crud_completo(self):
        criada = api.criar_conta({
            "nome": "Manutencao", "tipo": "despesa", "codigo": "2.10",
            "pasta_id": self.pastas["Barbearia"], "cor": "#ff0000",
        })
        self.assertEqual(criada["nome"], "Manutencao")
        editada = api.atualizar_conta(criada["id"], {
            "nome": "Manutencao e reparos", "tipo": "despesa",
            "pasta_id": self.pastas["Barbearia"], "cor": "#00ff00", "ativo": True,
        })
        self.assertEqual(editada["nome"], "Manutencao e reparos")
        api.excluir_conta(criada["id"])
        self.assertFalse([c for c in api.listar_contas() if c["id"] == criada["id"]])

    def test_nome_duplicado_na_mesma_pasta(self):
        dados = {"nome": "Combustível", "tipo": "despesa", "pasta_id": self.pastas["Corretor"]}
        with self.assertRaises(api.ApiError) as ctx:
            api.criar_conta(dados)
        self.assertEqual(ctx.exception.status, 409)

    def test_nao_exclui_conta_com_lancamento(self):
        conta_id = self.conta("Casa", "Salário")
        api.criar_lancamento({"conta_id": conta_id, "valor": 100, "data": "2025-08-05"})
        with self.assertRaises(api.ApiError) as ctx:
            api.excluir_conta(conta_id)
        self.assertEqual(ctx.exception.status, 409)

    def test_conta_inativa_bloqueia_lancamento(self):
        conta_id = self.conta("Casa", "Transporte")
        api.atualizar_conta(conta_id, {
            "nome": "Transporte", "tipo": "despesa",
            "pasta_id": self.pastas["Casa"], "ativo": False, "cor": "#3b82f6",
        })
        with self.assertRaises(api.ApiError):
            api.criar_lancamento({"conta_id": conta_id, "valor": 50})


class TestLancamentos(Base):
    def test_valores_em_formato_brasileiro(self):
        conta_id = self.conta("Corretor", "Comissão de venda")
        for entrada, esperado in [("1.234,56", 123456), ("1234,56", 123456), (1234.56, 123456)]:
            lanc = api.criar_lancamento({"conta_id": conta_id, "valor": entrada, "data": "2025-08-01"})
            self.assertEqual(lanc["valor_centavos"], esperado)

    def test_tipo_e_pasta_vem_da_conta(self):
        lanc = api.criar_lancamento({
            "conta_id": self.conta("Barbearia", "Aluguel"), "valor": 750, "data": "2025-08-25",
        })
        self.assertEqual(lanc["tipo"], "despesa")
        self.assertEqual(lanc["pasta_nome"], "Barbearia")

    def test_valor_invalido(self):
        conta_id = self.conta("Casa", "Salário")
        for valor in (0, -10, "abc", None):
            with self.assertRaises(api.ApiError):
                api.criar_lancamento({"conta_id": conta_id, "valor": valor})

    def test_data_invalida(self):
        with self.assertRaises(api.ApiError):
            api.criar_lancamento({
                "conta_id": self.conta("Casa", "Salário"), "valor": 10, "data": "2025-02-31",
            })

    def test_editar_e_excluir(self):
        lanc = api.criar_lancamento({
            "conta_id": self.conta("Casa", "Alimentação"), "valor": 100, "data": "2025-08-10",
        })
        editado = api.atualizar_lancamento(lanc["id"], {
            "conta_id": self.conta("Casa", "Transporte"), "valor": "250,50",
            "data": "2025-08-11", "descricao": "Uber",
        })
        self.assertEqual(editado["valor_centavos"], 25050)
        self.assertEqual(editado["conta_nome"], "Transporte")
        api.excluir_lancamento(lanc["id"])
        with self.assertRaises(api.ApiError):
            api.excluir_lancamento(lanc["id"])

    def test_conta_de_outra_pasta_e_recusada(self):
        with self.assertRaises(api.ApiError):
            api.criar_lancamento({
                "conta_id": self.conta("Casa", "Salário"), "valor": 10,
                "pasta_id": self.pastas["Barbearia"],
            })


class TestRelatorios(Base):
    def setUp(self):
        super().setUp()
        dados = [
            ("Corretor", "Comissão de venda", "2025-08-10", 2500),
            ("Corretor", "Combustível", "2025-08-11", 180),
            ("Corretor", "Marketing", "2025-08-12", 320),
            ("Casa", "Salário", "2025-08-05", 5000),
            ("Casa", "Alimentação", "2025-08-06", 500),
            ("Casa", "Alimentação", "2025-07-06", 900),
        ]
        for pasta, conta, data, valor in dados:
            api.criar_lancamento({
                "conta_id": self.conta(pasta, conta), "valor": valor, "data": data,
            })

    def test_painel_totaliza_por_pasta_e_geral(self):
        painel = api.painel("2025-08")
        corretor = next(p for p in painel["pastas"] if p["nome"] == "Corretor")
        self.assertEqual(corretor["receitas"], 250000)
        self.assertEqual(corretor["despesas"], 50000)
        self.assertEqual(corretor["saldo"], 200000)
        self.assertEqual(painel["geral"]["receitas"], 750000)
        self.assertEqual(painel["geral"]["despesas"], 100000)
        self.assertEqual(painel["geral"]["saldo"], 650000)
        self.assertEqual(painel["rotulo"], "Agosto/2025")

    def test_categorias_com_percentual(self):
        cat = api.categorias(pasta_id=self.pastas["Corretor"], mes="2025-08", tipo="despesa")
        self.assertEqual(cat["total"], 50000)
        self.assertEqual(cat["itens"][0]["nome"], "Marketing")
        self.assertEqual(cat["itens"][0]["percentual"], 64.0)

    def test_relatorio_mensal_tem_doze_meses(self):
        mensal = api.relatorio_mensal(2025, self.pastas["Casa"])
        self.assertEqual(len(mensal["meses"]), 12)
        julho = mensal["meses"][6]
        self.assertEqual(julho["despesas"], 90000)
        self.assertEqual(julho["saldo"], -90000)

    def test_comparativo_entre_pastas(self):
        comp = api.relatorio_comparativo("2025-08")
        self.assertEqual(comp["totais"]["despesas"], 100000)
        casa = next(p for p in comp["pastas"] if p["nome"] == "Casa")
        self.assertEqual(casa["participacao"], 50.0)

    def test_filtro_por_periodo(self):
        res = api.listar_lancamentos(data_ini="2025-07-01", data_fim="2025-07-31")
        self.assertEqual(res["total"], 1)
        self.assertEqual(res["despesas"], 90000)

    def test_exportacao_csv(self):
        csv_texto = api.exportar_csv(pasta_id=self.pastas["Casa"], mes="2025-08")
        linhas = csv_texto.strip().splitlines()
        self.assertEqual(len(linhas), 3)  # cabecalho + 2 lancamentos
        self.assertIn("5000,00", csv_texto)
        self.assertIn("05/08/2025", csv_texto)


class TestPastas(Base):
    def test_crud_e_protecao(self):
        nova = api.criar_pasta({"nome": "Aluguéis", "cor": "#123456"})
        api.atualizar_pasta(nova["id"], {"nome": "Alugueis", "cor": "#654321"})
        conta = api.criar_conta({"nome": "Aluguel recebido", "tipo": "receita", "pasta_id": nova["id"]})
        api.criar_lancamento({"conta_id": conta["id"], "valor": 1200})
        with self.assertRaises(api.ApiError) as ctx:
            api.excluir_pasta(nova["id"])
        self.assertEqual(ctx.exception.status, 409)


if __name__ == "__main__":
    unittest.main(verbosity=2)
