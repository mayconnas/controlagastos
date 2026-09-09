"""Camada de acesso ao banco de dados SQLite do Controla Gastos."""

import os
import sqlite3
import threading
from contextlib import contextmanager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("FINANCAS_DB", os.path.join(BASE_DIR, "data", "financas.db"))

_lock = threading.Lock()

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pastas (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT    NOT NULL UNIQUE,
    subtitulo TEXT    NOT NULL DEFAULT '',
    icone     TEXT    NOT NULL DEFAULT 'folder',
    cor       TEXT    NOT NULL DEFAULT '#3b82f6',
    ordem     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contas (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    pasta_id INTEGER REFERENCES pastas(id) ON DELETE CASCADE,
    codigo   TEXT    NOT NULL DEFAULT '',
    nome     TEXT    NOT NULL,
    tipo     TEXT    NOT NULL CHECK (tipo IN ('receita', 'despesa')),
    cor      TEXT    NOT NULL DEFAULT '#3b82f6',
    ativo    INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contas_unicas
    ON contas (IFNULL(pasta_id, -1), tipo, nome);

CREATE TABLE IF NOT EXISTS lancamentos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    pasta_id       INTEGER NOT NULL REFERENCES pastas(id) ON DELETE CASCADE,
    conta_id       INTEGER NOT NULL REFERENCES contas(id) ON DELETE RESTRICT,
    tipo           TEXT    NOT NULL CHECK (tipo IN ('receita', 'despesa')),
    data           TEXT    NOT NULL,
    descricao      TEXT    NOT NULL DEFAULT '',
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    observacao     TEXT    NOT NULL DEFAULT '',
    criado_em      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_lanc_data  ON lancamentos (data);
CREATE INDEX IF NOT EXISTS idx_lanc_pasta ON lancamentos (pasta_id, data);
CREATE INDEX IF NOT EXISTS idx_lanc_conta ON lancamentos (conta_id);
"""

# Pastas iniciais: os tres centros de custo pedidos.
PASTAS_PADRAO = [
    ("Corretor", "Comissões • Despesas • Lucro", "corretor", "#f5a524", 1),
    ("Barbearia", "Vendas • Despesas • Lucro", "barbearia", "#3b82f6", 2),
    ("Casa", "Moradia • Contas • Despesas", "casa", "#22c55e", 3),
]

# Plano de contas inicial: (pasta, codigo, nome, tipo, cor)
CONTAS_PADRAO = [
    ("Corretor", "1.01", "Comissão de venda", "receita", "#22c55e"),
    ("Corretor", "1.02", "Comissão de locação", "receita", "#16a34a"),
    ("Corretor", "1.99", "Outras receitas", "receita", "#4ade80"),
    ("Corretor", "2.01", "Combustível", "despesa", "#3b82f6"),
    ("Corretor", "2.02", "Marketing", "despesa", "#f97316"),
    ("Corretor", "2.03", "Alimentação", "despesa", "#22c55e"),
    ("Corretor", "2.04", "Internet/Telefone", "despesa", "#8b5cf6"),
    ("Corretor", "2.99", "Outros", "despesa", "#94a3b8"),
    ("Barbearia", "1.01", "Serviços (cortes e barba)", "receita", "#22c55e"),
    ("Barbearia", "1.02", "Venda de produtos", "receita", "#16a34a"),
    ("Barbearia", "1.99", "Outras receitas", "receita", "#4ade80"),
    ("Barbearia", "2.01", "Produtos (pomadas, etc.)", "despesa", "#3b82f6"),
    ("Barbearia", "2.02", "Aluguel", "despesa", "#f97316"),
    ("Barbearia", "2.03", "Energia/Água", "despesa", "#22c55e"),
    ("Barbearia", "2.04", "Internet/Telefone", "despesa", "#8b5cf6"),
    ("Barbearia", "2.99", "Outros", "despesa", "#94a3b8"),
    ("Casa", "1.01", "Salário", "receita", "#22c55e"),
    ("Casa", "1.02", "Bônus/Extras", "receita", "#16a34a"),
    ("Casa", "1.99", "Outras receitas", "receita", "#4ade80"),
    ("Casa", "2.01", "Moradia (aluguel/cond.)", "despesa", "#3b82f6"),
    ("Casa", "2.02", "Contas (água, luz, internet)", "despesa", "#f97316"),
    ("Casa", "2.03", "Alimentação", "despesa", "#22c55e"),
    ("Casa", "2.04", "Transporte", "despesa", "#8b5cf6"),
    ("Casa", "2.99", "Outros", "despesa", "#ec4899"),
]


def connect():
    """Abre uma conexao configurada com o banco."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def cursor(commit=False):
    """Contexto de cursor; serializa escritas para evitar lock concorrente."""
    conn = connect()
    travado = False
    try:
        if commit:
            _lock.acquire()
            travado = True
        cur = conn.cursor()
        yield cur
        if commit:
            conn.commit()
    except Exception:
        if commit:
            conn.rollback()
        raise
    finally:
        if travado:
            _lock.release()
        conn.close()


def init(seed=True):
    """Cria o schema e, na primeira execucao, os dados iniciais."""
    with cursor(commit=True) as cur:
        cur.executescript(SCHEMA)
        if not seed:
            return
        cur.execute("SELECT COUNT(*) AS n FROM pastas")
        if cur.fetchone()["n"] > 0:
            return
        for nome, subtitulo, icone, cor, ordem in PASTAS_PADRAO:
            cur.execute(
                "INSERT INTO pastas (nome, subtitulo, icone, cor, ordem) VALUES (?, ?, ?, ?, ?)",
                (nome, subtitulo, icone, cor, ordem),
            )
        cur.execute("SELECT id, nome FROM pastas")
        ids = {row["nome"]: row["id"] for row in cur.fetchall()}
        for pasta, codigo, nome, tipo, cor in CONTAS_PADRAO:
            cur.execute(
                "INSERT INTO contas (pasta_id, codigo, nome, tipo, cor) VALUES (?, ?, ?, ?, ?)",
                (ids[pasta], codigo, nome, tipo, cor),
            )


if __name__ == "__main__":
    init()
    print("Banco criado em", DB_PATH)
