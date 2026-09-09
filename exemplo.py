#!/usr/bin/env python3
"""Popula o banco com lancamentos de exemplo (opcional).

    python3 exemplo.py            # usa o mes atual
    python3 exemplo.py 2025-08    # usa o mes informado
"""

import sys
from datetime import date

import api
import db

EXEMPLOS = [
    # (pasta, conta, tipo, dia, descricao, valor em reais)
    ("Corretor", "Comissão de venda", 28, "Comissão de venda", 2500.00),
    ("Corretor", "Comissão de venda", 18, "Comissão de venda", 1800.00),
    ("Corretor", "Comissão de locação", 10, "Comissão de locação", 8200.00),
    ("Corretor", "Combustível", 27, "Combustível", 180.00),
    ("Corretor", "Combustível", 12, "Combustível", 1020.00),
    ("Corretor", "Marketing", 25, "Marketing", 650.00),
    ("Corretor", "Alimentação", 22, "Alimentação", 420.00),
    ("Corretor", "Internet/Telefone", 20, "Internet/Telefone", 280.00),
    ("Corretor", "Outros", 15, "Outros", 700.00),
    ("Barbearia", "Serviços (cortes e barba)", 28, "Serviços (cortes e barba)", 320.00),
    ("Barbearia", "Serviços (cortes e barba)", 18, "Serviços (cortes e barba)", 290.00),
    ("Barbearia", "Serviços (cortes e barba)", 8, "Serviços (cortes e barba)", 7140.00),
    ("Barbearia", "Venda de produtos", 14, "Venda de produtos", 1000.00),
    ("Barbearia", "Produtos (pomadas, etc.)", 27, "Produtos", 180.00),
    ("Barbearia", "Produtos (pomadas, etc.)", 5, "Reposicao de estoque", 800.00),
    ("Barbearia", "Aluguel", 25, "Aluguel", 750.00),
    ("Barbearia", "Energia/Água", 22, "Energia/Água", 420.00),
    ("Barbearia", "Internet/Telefone", 20, "Internet/Telefone", 310.00),
    ("Barbearia", "Outros", 16, "Outros", 520.00),
    ("Casa", "Salário", 18, "Salário", 5000.00),
    ("Casa", "Moradia (aluguel/cond.)", 28, "Aluguel", 1200.00),
    ("Casa", "Contas (água, luz, internet)", 27, "Conta de luz", 280.00),
    ("Casa", "Contas (água, luz, internet)", 22, "Internet", 400.00),
    ("Casa", "Alimentação", 25, "Mercado", 520.00),
    ("Casa", "Transporte", 21, "Transporte", 420.00),
    ("Casa", "Outros", 12, "Outros", 600.00),
]


def main():
    mes = sys.argv[1] if len(sys.argv) > 1 else date.today().strftime("%Y-%m")
    db.init()
    with db.cursor() as cur:
        cur.execute("SELECT c.id, c.nome, p.nome AS pasta FROM contas c JOIN pastas p ON p.id = c.pasta_id")
        contas = {(r["pasta"], r["nome"]): r["id"] for r in cur.fetchall()}
    criados = 0
    for pasta, conta, dia, descricao, valor in EXEMPLOS:
        conta_id = contas.get((pasta, conta))
        if not conta_id:
            print(f"  ! conta nao encontrada: {pasta} / {conta}")
            continue
        api.criar_lancamento({
            "conta_id": conta_id, "valor": valor,
            "data": f"{mes}-{dia:02d}", "descricao": descricao,
        })
        criados += 1
    print(f"{criados} lancamentos de exemplo criados em {api.rotulo_mes(mes)}.")


if __name__ == "__main__":
    main()
