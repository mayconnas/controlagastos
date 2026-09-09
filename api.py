"""Regras de negocio e consultas do Controla Gastos."""

import csv
import io
import re
import sqlite3
from datetime import date

import db

DATA_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MES_RE = re.compile(r"^\d{4}-\d{2}$")
TIPOS = ("receita", "despesa")
MESES_PT = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]


class ApiError(Exception):
    """Erro de validacao/negocio, devolvido ao cliente com status HTTP."""

    def __init__(self, mensagem, status=400):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.status = status


# --------------------------------------------------------------------------
# Helpers de validacao
# --------------------------------------------------------------------------

def _texto(payload, campo, obrigatorio=True, padrao="", maximo=120):
    valor = str(payload.get(campo, padrao) or "").strip()
    if obrigatorio and not valor:
        raise ApiError(f"O campo '{campo}' é obrigatório.")
    if len(valor) > maximo:
        raise ApiError(f"O campo '{campo}' deve ter no máximo {maximo} caracteres.")
    return valor


def _tipo(payload, campo="tipo"):
    valor = str(payload.get(campo, "")).strip().lower()
    if valor not in TIPOS:
        raise ApiError("O tipo deve ser 'receita' ou 'despesa'.")
    return valor


def _inteiro(payload, campo, obrigatorio=True, padrao=None):
    bruto = payload.get(campo, padrao)
    if bruto in (None, ""):
        if obrigatorio:
            raise ApiError(f"O campo '{campo}' é obrigatório.")
        return None
    try:
        return int(bruto)
    except (TypeError, ValueError):
        raise ApiError(f"O campo '{campo}' deve ser um número inteiro.")


def _centavos(payload, campo="valor"):
    """Aceita 1234.56, '1234,56' ou '1.234,56' e devolve centavos."""
    bruto = payload.get(campo)
    if bruto in (None, ""):
        raise ApiError("Informe o valor do lançamento.")
    if isinstance(bruto, str):
        limpo = bruto.strip().replace("R$", "").replace(" ", "")
        if "," in limpo:
            limpo = limpo.replace(".", "").replace(",", ".")
        bruto = limpo
    try:
        valor = round(float(bruto) * 100)
    except (TypeError, ValueError):
        raise ApiError("Valor inválido. Use por exemplo 1250,00.")
    if valor <= 0:
        raise ApiError("O valor deve ser maior que zero.")
    if valor > 10 ** 13:
        raise ApiError("Valor acima do limite permitido.")
    return valor


def _data(payload, campo="data"):
    valor = str(payload.get(campo) or "").strip()
    if not valor:
        return date.today().isoformat()
    if not DATA_RE.match(valor):
        raise ApiError("Data inválida. Use o formato AAAA-MM-DD.")
    try:
        date.fromisoformat(valor)
    except ValueError:
        raise ApiError("Data inexistente no calendário.")
    return valor


def _mes(valor):
    valor = str(valor or "").strip()
    if not valor:
        return None
    if not MES_RE.match(valor):
        raise ApiError("Mês inválido. Use o formato AAAA-MM.")
    return valor


def _cor(payload, campo="cor", padrao="#3b82f6"):
    valor = str(payload.get(campo) or padrao).strip()
    if not re.match(r"^#[0-9a-fA-F]{6}$", valor):
        raise ApiError("Cor inválida. Use o formato #RRGGBB.")
    return valor


def rotulo_mes(mes):
    ano, num = mes.split("-")
    return f"{MESES_PT[int(num) - 1]}/{ano}"


# --------------------------------------------------------------------------
# Pastas (centros: Corretor, Barbearia, Casa)
# --------------------------------------------------------------------------

def listar_pastas():
    with db.cursor() as cur:
        cur.execute("SELECT * FROM pastas ORDER BY ordem, nome")
        return [dict(r) for r in cur.fetchall()]


def criar_pasta(payload):
    nome = _texto(payload, "nome")
    subtitulo = _texto(payload, "subtitulo", obrigatorio=False, maximo=160)
    icone = _texto(payload, "icone", obrigatorio=False, padrao="folder", maximo=40) or "folder"
    cor = _cor(payload)
    ordem = _inteiro(payload, "ordem", obrigatorio=False, padrao=99)
    with db.cursor(commit=True) as cur:
        try:
            cur.execute(
                "INSERT INTO pastas (nome, subtitulo, icone, cor, ordem) VALUES (?, ?, ?, ?, ?)",
                (nome, subtitulo, icone, cor, ordem),
            )
        except sqlite3.IntegrityError:
            raise ApiError(f"Já existe uma pasta chamada '{nome}'.", 409)
        cur.execute("SELECT * FROM pastas WHERE id = ?", (cur.lastrowid,))
        return dict(cur.fetchone())


def atualizar_pasta(pasta_id, payload):
    nome = _texto(payload, "nome")
    subtitulo = _texto(payload, "subtitulo", obrigatorio=False, maximo=160)
    icone = _texto(payload, "icone", obrigatorio=False, padrao="folder", maximo=40) or "folder"
    cor = _cor(payload)
    ordem = _inteiro(payload, "ordem", obrigatorio=False, padrao=99)
    with db.cursor(commit=True) as cur:
        try:
            cur.execute(
                "UPDATE pastas SET nome = ?, subtitulo = ?, icone = ?, cor = ?, ordem = ? WHERE id = ?",
                (nome, subtitulo, icone, cor, ordem, pasta_id),
            )
        except sqlite3.IntegrityError:
            raise ApiError(f"Já existe uma pasta chamada '{nome}'.", 409)
        if cur.rowcount == 0:
            raise ApiError("Pasta não encontrada.", 404)
        cur.execute("SELECT * FROM pastas WHERE id = ?", (pasta_id,))
        return dict(cur.fetchone())


def excluir_pasta(pasta_id):
    with db.cursor(commit=True) as cur:
        cur.execute("SELECT COUNT(*) AS n FROM lancamentos WHERE pasta_id = ?", (pasta_id,))
        usados = cur.fetchone()["n"]
        if usados:
            raise ApiError(
                f"Esta pasta possui {usados} lançamento(s). Exclua ou mova os lançamentos antes.", 409
            )
        cur.execute("DELETE FROM pastas WHERE id = ?", (pasta_id,))
        if cur.rowcount == 0:
            raise ApiError("Pasta não encontrada.", 404)
        return {"ok": True}


# --------------------------------------------------------------------------
# Plano de contas
# --------------------------------------------------------------------------

def listar_contas(pasta_id=None, tipo=None, incluir_inativas=True):
    sql = [
        "SELECT c.*, p.nome AS pasta_nome,",
        "       (SELECT COUNT(*) FROM lancamentos l WHERE l.conta_id = c.id) AS usos",
        "FROM contas c LEFT JOIN pastas p ON p.id = c.pasta_id WHERE 1 = 1",
    ]
    args = []
    if pasta_id:
        sql.append("AND (c.pasta_id = ? OR c.pasta_id IS NULL)")
        args.append(pasta_id)
    if tipo:
        sql.append("AND c.tipo = ?")
        args.append(tipo)
    if not incluir_inativas:
        sql.append("AND c.ativo = 1")
    sql.append("ORDER BY p.ordem, c.tipo DESC, c.codigo, c.nome")
    with db.cursor() as cur:
        cur.execute(" ".join(sql), args)
        return [dict(r) for r in cur.fetchall()]


def _valida_pasta_existe(cur, pasta_id):
    if pasta_id is None:
        return
    cur.execute("SELECT 1 FROM pastas WHERE id = ?", (pasta_id,))
    if not cur.fetchone():
        raise ApiError("Pasta informada não existe.", 404)


def criar_conta(payload):
    nome = _texto(payload, "nome")
    tipo = _tipo(payload)
    codigo = _texto(payload, "codigo", obrigatorio=False, maximo=20)
    cor = _cor(payload)
    pasta_id = _inteiro(payload, "pasta_id", obrigatorio=False)
    ativo = 1 if payload.get("ativo", True) else 0
    with db.cursor(commit=True) as cur:
        _valida_pasta_existe(cur, pasta_id)
        try:
            cur.execute(
                "INSERT INTO contas (pasta_id, codigo, nome, tipo, cor, ativo) VALUES (?, ?, ?, ?, ?, ?)",
                (pasta_id, codigo, nome, tipo, cor, ativo),
            )
        except sqlite3.IntegrityError:
            raise ApiError(f"Já existe a conta '{nome}' ({tipo}) nesta pasta.", 409)
        return _conta_por_id(cur, cur.lastrowid)


def atualizar_conta(conta_id, payload):
    nome = _texto(payload, "nome")
    tipo = _tipo(payload)
    codigo = _texto(payload, "codigo", obrigatorio=False, maximo=20)
    cor = _cor(payload)
    pasta_id = _inteiro(payload, "pasta_id", obrigatorio=False)
    ativo = 1 if payload.get("ativo", True) else 0
    with db.cursor(commit=True) as cur:
        _valida_pasta_existe(cur, pasta_id)
        cur.execute("SELECT tipo FROM contas WHERE id = ?", (conta_id,))
        atual = cur.fetchone()
        if not atual:
            raise ApiError("Conta não encontrada.", 404)
        if atual["tipo"] != tipo:
            cur.execute("SELECT COUNT(*) AS n FROM lancamentos WHERE conta_id = ?", (conta_id,))
            if cur.fetchone()["n"]:
                raise ApiError(
                    "Não é possível mudar o tipo de uma conta que já possui lançamentos.", 409
                )
        try:
            cur.execute(
                "UPDATE contas SET pasta_id = ?, codigo = ?, nome = ?, tipo = ?, cor = ?, ativo = ? "
                "WHERE id = ?",
                (pasta_id, codigo, nome, tipo, cor, ativo, conta_id),
            )
        except sqlite3.IntegrityError:
            raise ApiError(f"Já existe a conta '{nome}' ({tipo}) nesta pasta.", 409)
        # Mantem os lancamentos coerentes com a pasta da conta.
        if pasta_id:
            cur.execute("UPDATE lancamentos SET pasta_id = ? WHERE conta_id = ?", (pasta_id, conta_id))
        return _conta_por_id(cur, conta_id)


def excluir_conta(conta_id):
    with db.cursor(commit=True) as cur:
        cur.execute("SELECT COUNT(*) AS n FROM lancamentos WHERE conta_id = ?", (conta_id,))
        usos = cur.fetchone()["n"]
        if usos:
            raise ApiError(
                f"Esta conta possui {usos} lançamento(s) vinculado(s). "
                "Reclassifique-os ou desative a conta em vez de excluir.",
                409,
            )
        cur.execute("DELETE FROM contas WHERE id = ?", (conta_id,))
        if cur.rowcount == 0:
            raise ApiError("Conta não encontrada.", 404)
        return {"ok": True}


def _conta_por_id(cur, conta_id):
    cur.execute(
        "SELECT c.*, p.nome AS pasta_nome, 0 AS usos "
        "FROM contas c LEFT JOIN pastas p ON p.id = c.pasta_id WHERE c.id = ?",
        (conta_id,),
    )
    return dict(cur.fetchone())


# --------------------------------------------------------------------------
# Lancamentos
# --------------------------------------------------------------------------

LANC_SELECT = """
SELECT l.id, l.pasta_id, l.conta_id, l.tipo, l.data, l.descricao,
       l.valor_centavos, l.observacao, l.criado_em,
       c.nome AS conta_nome, c.codigo AS conta_codigo, c.cor AS conta_cor,
       p.nome AS pasta_nome, p.cor AS pasta_cor, p.icone AS pasta_icone
FROM lancamentos l
JOIN contas c ON c.id = l.conta_id
JOIN pastas p ON p.id = l.pasta_id
"""


def _filtros(pasta_id=None, mes=None, tipo=None, conta_id=None, busca=None,
             data_ini=None, data_fim=None):
    clausulas, args = [], []
    if pasta_id:
        clausulas.append("l.pasta_id = ?")
        args.append(pasta_id)
    if mes:
        clausulas.append("substr(l.data, 1, 7) = ?")
        args.append(mes)
    if tipo in TIPOS:
        clausulas.append("l.tipo = ?")
        args.append(tipo)
    if conta_id:
        clausulas.append("l.conta_id = ?")
        args.append(conta_id)
    if busca:
        clausulas.append("(l.descricao LIKE ? OR l.observacao LIKE ? OR c.nome LIKE ?)")
        curinga = f"%{busca}%"
        args += [curinga, curinga, curinga]
    if data_ini:
        clausulas.append("l.data >= ?")
        args.append(data_ini)
    if data_fim:
        clausulas.append("l.data <= ?")
        args.append(data_fim)
    where = (" WHERE " + " AND ".join(clausulas)) if clausulas else ""
    return where, args


def listar_lancamentos(limite=200, offset=0, **filtros):
    where, args = _filtros(**filtros)
    with db.cursor() as cur:
        cur.execute(
            LANC_SELECT + where + " ORDER BY l.data DESC, l.id DESC LIMIT ? OFFSET ?",
            args + [limite, offset],
        )
        itens = [dict(r) for r in cur.fetchall()]
        cur.execute(
            "SELECT COUNT(*) AS n, "
            "COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor_centavos END), 0) AS receitas, "
            "COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor_centavos END), 0) AS despesas "
            "FROM lancamentos l JOIN contas c ON c.id = l.conta_id" + where,
            args,
        )
        tot = cur.fetchone()
    return {
        "itens": itens,
        "total": tot["n"],
        "receitas": tot["receitas"],
        "despesas": tot["despesas"],
        "saldo": tot["receitas"] - tot["despesas"],
    }


def criar_lancamento(payload):
    conta_id = _inteiro(payload, "conta_id")
    valor = _centavos(payload)
    data_lanc = _data(payload)
    descricao = _texto(payload, "descricao", obrigatorio=False, maximo=160)
    observacao = _texto(payload, "observacao", obrigatorio=False, maximo=500)
    pasta_id = _inteiro(payload, "pasta_id", obrigatorio=False)
    with db.cursor(commit=True) as cur:
        conta = _conta_para_lancamento(cur, conta_id, pasta_id)
        cur.execute(
            "INSERT INTO lancamentos (pasta_id, conta_id, tipo, data, descricao, valor_centavos, observacao) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (conta["pasta_id"], conta_id, conta["tipo"], data_lanc,
             descricao or conta["nome"], valor, observacao),
        )
        cur.execute(LANC_SELECT + " WHERE l.id = ?", (cur.lastrowid,))
        return dict(cur.fetchone())


def atualizar_lancamento(lanc_id, payload):
    conta_id = _inteiro(payload, "conta_id")
    valor = _centavos(payload)
    data_lanc = _data(payload)
    descricao = _texto(payload, "descricao", obrigatorio=False, maximo=160)
    observacao = _texto(payload, "observacao", obrigatorio=False, maximo=500)
    pasta_id = _inteiro(payload, "pasta_id", obrigatorio=False)
    with db.cursor(commit=True) as cur:
        cur.execute("SELECT 1 FROM lancamentos WHERE id = ?", (lanc_id,))
        if not cur.fetchone():
            raise ApiError("Lançamento não encontrado.", 404)
        conta = _conta_para_lancamento(cur, conta_id, pasta_id)
        cur.execute(
            "UPDATE lancamentos SET pasta_id = ?, conta_id = ?, tipo = ?, data = ?, "
            "descricao = ?, valor_centavos = ?, observacao = ? WHERE id = ?",
            (conta["pasta_id"], conta_id, conta["tipo"], data_lanc,
             descricao or conta["nome"], valor, observacao, lanc_id),
        )
        cur.execute(LANC_SELECT + " WHERE l.id = ?", (lanc_id,))
        return dict(cur.fetchone())


def excluir_lancamento(lanc_id):
    with db.cursor(commit=True) as cur:
        cur.execute("DELETE FROM lancamentos WHERE id = ?", (lanc_id,))
        if cur.rowcount == 0:
            raise ApiError("Lançamento não encontrado.", 404)
        return {"ok": True}


def _conta_para_lancamento(cur, conta_id, pasta_id):
    """Resolve a conta e a pasta do lancamento, validando a combinacao."""
    cur.execute("SELECT id, nome, tipo, pasta_id, ativo FROM contas WHERE id = ?", (conta_id,))
    conta = cur.fetchone()
    if not conta:
        raise ApiError("Conta do plano de contas não encontrada.", 404)
    if not conta["ativo"]:
        raise ApiError(f"A conta '{conta['nome']}' está inativa.")
    destino = conta["pasta_id"] or pasta_id
    if destino is None:
        raise ApiError("Informe a pasta (Corretor, Barbearia ou Casa) do lançamento.")
    if conta["pasta_id"] and pasta_id and conta["pasta_id"] != pasta_id:
        raise ApiError(f"A conta '{conta['nome']}' pertence a outra pasta.")
    _valida_pasta_existe(cur, destino)
    return {"pasta_id": destino, "tipo": conta["tipo"], "nome": conta["nome"]}


# --------------------------------------------------------------------------
# Painel e relatorios
# --------------------------------------------------------------------------

def meses_disponiveis():
    with db.cursor() as cur:
        cur.execute(
            "SELECT DISTINCT substr(data, 1, 7) AS mes FROM lancamentos ORDER BY mes DESC"
        )
        meses = [r["mes"] for r in cur.fetchall()]
    atual = date.today().strftime("%Y-%m")
    if atual not in meses:
        meses.insert(0, atual)
    return [{"valor": m, "rotulo": rotulo_mes(m)} for m in meses]


def _totais(cur, pasta_id, mes):
    # Sem filtro de conta/busca, portanto nao precisa do JOIN com contas.
    where, args = _filtros(pasta_id=pasta_id, mes=mes)
    cur.execute(
        "SELECT COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor_centavos END), 0) AS receitas, "
        "COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor_centavos END), 0) AS despesas "
        "FROM lancamentos l" + where,
        args,
    )
    row = cur.fetchone()
    return {
        "receitas": row["receitas"],
        "despesas": row["despesas"],
        "saldo": row["receitas"] - row["despesas"],
    }


def categorias(pasta_id=None, mes=None, tipo="despesa"):
    """Total por conta do plano de contas, com percentual sobre o total."""
    where, args = _filtros(pasta_id=pasta_id, mes=mes, tipo=tipo)
    with db.cursor() as cur:
        cur.execute(
            "SELECT c.id, c.nome, c.codigo, c.cor, SUM(l.valor_centavos) AS total "
            "FROM lancamentos l JOIN contas c ON c.id = l.conta_id" + where +
            " GROUP BY c.id ORDER BY total DESC",
            args,
        )
        linhas = [dict(r) for r in cur.fetchall()]
    total = sum(l["total"] for l in linhas)
    for linha in linhas:
        linha["percentual"] = round(linha["total"] * 100.0 / total, 1) if total else 0.0
    return {"total": total, "tipo": tipo, "itens": linhas}


def painel(mes=None):
    """Dados da tela inicial: uma visao por pasta + o resumo geral."""
    mes = _mes(mes) or date.today().strftime("%Y-%m")
    resultado = {"mes": mes, "rotulo": rotulo_mes(mes), "pastas": []}
    geral = {"receitas": 0, "despesas": 0, "saldo": 0}
    with db.cursor() as cur:
        cur.execute("SELECT * FROM pastas ORDER BY ordem, nome")
        pastas = [dict(r) for r in cur.fetchall()]
        for pasta in pastas:
            tot = _totais(cur, pasta["id"], mes)
            cur.execute(
                LANC_SELECT + " WHERE l.pasta_id = ? AND substr(l.data, 1, 7) = ?"
                " ORDER BY l.data DESC, l.id DESC LIMIT 6",
                (pasta["id"], mes),
            )
            ultimos = [dict(r) for r in cur.fetchall()]
            pasta.update(tot)
            pasta["ultimos"] = ultimos
            pasta["categorias"] = categorias(pasta["id"], mes, "despesa")
            resultado["pastas"].append(pasta)
            for chave in geral:
                geral[chave] += tot[chave]
    resultado["geral"] = geral
    return resultado


def relatorio_mensal(ano=None, pasta_id=None):
    """Evolucao mes a mes (12 meses do ano informado)."""
    ano = int(ano or date.today().year)
    where, args = _filtros(pasta_id=pasta_id)
    conector = " AND " if where else " WHERE "
    with db.cursor() as cur:
        cur.execute(
            "SELECT substr(l.data, 1, 7) AS mes, "
            "COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN l.valor_centavos END), 0) AS receitas, "
            "COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN l.valor_centavos END), 0) AS despesas "
            "FROM lancamentos l JOIN contas c ON c.id = l.conta_id" + where + conector +
            "substr(l.data, 1, 4) = ? GROUP BY mes ORDER BY mes",
            args + [str(ano)],
        )
        dados = {r["mes"]: dict(r) for r in cur.fetchall()}
    meses = []
    for i in range(1, 13):
        chave = f"{ano}-{i:02d}"
        linha = dados.get(chave, {"mes": chave, "receitas": 0, "despesas": 0})
        linha["saldo"] = linha["receitas"] - linha["despesas"]
        linha["rotulo"] = MESES_PT[i - 1][:3]
        meses.append(linha)
    return {"ano": ano, "meses": meses}


def relatorio_comparativo(mes=None):
    """Compara receitas, despesas e saldo entre as pastas."""
    mes = _mes(mes)
    with db.cursor() as cur:
        cur.execute("SELECT * FROM pastas ORDER BY ordem, nome")
        pastas = [dict(r) for r in cur.fetchall()]
        for pasta in pastas:
            pasta.update(_totais(cur, pasta["id"], mes))
    total_despesas = sum(p["despesas"] for p in pastas)
    for pasta in pastas:
        pasta["participacao"] = (
            round(pasta["despesas"] * 100.0 / total_despesas, 1) if total_despesas else 0.0
        )
    return {
        "mes": mes,
        "pastas": pastas,
        "totais": {
            "receitas": sum(p["receitas"] for p in pastas),
            "despesas": total_despesas,
            "saldo": sum(p["saldo"] for p in pastas),
        },
    }


def relatorio_anos():
    with db.cursor() as cur:
        cur.execute("SELECT DISTINCT substr(data, 1, 4) AS ano FROM lancamentos ORDER BY ano DESC")
        anos = [int(r["ano"]) for r in cur.fetchall()]
    atual = date.today().year
    if atual not in anos:
        anos.insert(0, atual)
    return anos


def exportar_csv(**filtros):
    """Extrato completo em CSV (separador ';' para abrir direto no Excel BR)."""
    where, args = _filtros(**filtros)
    with db.cursor() as cur:
        cur.execute(LANC_SELECT + where + " ORDER BY l.data, l.id", args)
        linhas = cur.fetchall()
    buffer = io.StringIO()
    escritor = csv.writer(buffer, delimiter=";")
    escritor.writerow(["Data", "Pasta", "Codigo", "Conta", "Tipo", "Descricao", "Valor", "Observacao"])
    for r in linhas:
        valor = f"{r['valor_centavos'] / 100:.2f}".replace(".", ",")
        escritor.writerow([
            "/".join(reversed(r["data"].split("-"))),
            r["pasta_nome"], r["conta_codigo"], r["conta_nome"],
            r["tipo"].capitalize(), r["descricao"], valor, r["observacao"],
        ])
    return "﻿" + buffer.getvalue()
