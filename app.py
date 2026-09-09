#!/usr/bin/env python3
"""Controla Gastos - servidor HTTP (biblioteca padrao do Python + SQLite).

Uso:
    python3 app.py            # inicia em http://localhost:8000
    python3 app.py --port 9000
"""

import argparse
import json
import mimetypes
import os
import re
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import api
import db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
MAX_BODY = 1 * 1024 * 1024  # 1 MB


def rota(metodo, padrao):
    def decorador(func):
        ROTAS.append((metodo, re.compile("^" + padrao + "$"), func))
        return func
    return decorador


ROTAS = []


# --------------------------------------------------------------------------
# Endpoints da API
# --------------------------------------------------------------------------

@rota("GET", r"/api/painel")
def _painel(_p, q, _b):
    return api.painel(q.get("mes"))


@rota("GET", r"/api/meses")
def _meses(_p, _q, _b):
    return {"meses": api.meses_disponiveis(), "anos": api.relatorio_anos()}


@rota("GET", r"/api/pastas")
def _pastas(_p, _q, _b):
    return {"pastas": api.listar_pastas()}


@rota("POST", r"/api/pastas")
def _pasta_nova(_p, _q, body):
    return api.criar_pasta(body)


@rota("PUT", r"/api/pastas/(\d+)")
def _pasta_edita(p, _q, body):
    return api.atualizar_pasta(int(p[0]), body)


@rota("DELETE", r"/api/pastas/(\d+)")
def _pasta_apaga(p, _q, _b):
    return api.excluir_pasta(int(p[0]))


@rota("GET", r"/api/contas")
def _contas(_p, q, _b):
    return {
        "contas": api.listar_contas(
            pasta_id=_int(q.get("pasta")),
            tipo=q.get("tipo") if q.get("tipo") in api.TIPOS else None,
            incluir_inativas=q.get("inativas", "1") != "0",
        )
    }


@rota("POST", r"/api/contas")
def _conta_nova(_p, _q, body):
    return api.criar_conta(body)


@rota("PUT", r"/api/contas/(\d+)")
def _conta_edita(p, _q, body):
    return api.atualizar_conta(int(p[0]), body)


@rota("DELETE", r"/api/contas/(\d+)")
def _conta_apaga(p, _q, _b):
    return api.excluir_conta(int(p[0]))


@rota("GET", r"/api/lancamentos")
def _lancamentos(_p, q, _b):
    return api.listar_lancamentos(
        limite=min(_int(q.get("limite")) or 200, 1000),
        offset=_int(q.get("offset")) or 0,
        **_filtros_query(q),
    )


@rota("POST", r"/api/lancamentos")
def _lancamento_novo(_p, _q, body):
    return api.criar_lancamento(body)


@rota("PUT", r"/api/lancamentos/(\d+)")
def _lancamento_edita(p, _q, body):
    return api.atualizar_lancamento(int(p[0]), body)


@rota("DELETE", r"/api/lancamentos/(\d+)")
def _lancamento_apaga(p, _q, _b):
    return api.excluir_lancamento(int(p[0]))


@rota("GET", r"/api/relatorios/categorias")
def _rel_categorias(_p, q, _b):
    return api.categorias(
        pasta_id=_int(q.get("pasta")),
        mes=api._mes(q.get("mes")),
        tipo=q.get("tipo") if q.get("tipo") in api.TIPOS else "despesa",
    )


@rota("GET", r"/api/relatorios/mensal")
def _rel_mensal(_p, q, _b):
    return api.relatorio_mensal(ano=_int(q.get("ano")), pasta_id=_int(q.get("pasta")))


@rota("GET", r"/api/relatorios/comparativo")
def _rel_comparativo(_p, q, _b):
    return api.relatorio_comparativo(mes=api._mes(q.get("mes")))


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def _int(valor):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return None


def _filtros_query(q):
    return {
        "pasta_id": _int(q.get("pasta")),
        "mes": api._mes(q.get("mes")),
        "tipo": q.get("tipo") if q.get("tipo") in api.TIPOS else None,
        "conta_id": _int(q.get("conta")),
        "busca": (q.get("busca") or "").strip() or None,
        "data_ini": q.get("de") or None,
        "data_fim": q.get("ate") or None,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "ControlaGastos/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, formato, *args):  # menos ruido no terminal
        if os.environ.get("FINANCAS_DEBUG"):
            super().log_message(formato, *args)

    # -- verbos ------------------------------------------------------------
    def do_GET(self):
        self._despachar("GET")

    def do_POST(self):
        self._despachar("POST")

    def do_PUT(self):
        self._despachar("PUT")

    def do_DELETE(self):
        self._despachar("DELETE")

    # -- roteamento --------------------------------------------------------
    def _despachar(self, metodo):
        url = urllib.parse.urlparse(self.path)
        caminho = urllib.parse.unquote(url.path)
        query = {k: v[0] for k, v in urllib.parse.parse_qs(url.query).items()}

        if caminho == "/api/export.csv" and metodo == "GET":
            return self._exportar(query)

        for rota_metodo, padrao, funcao in ROTAS:
            match = padrao.match(caminho)
            if not match:
                continue
            if rota_metodo != metodo:
                continue
            try:
                corpo = self._ler_json() if metodo in ("POST", "PUT") else None
                return self._json(funcao(match.groups(), query, corpo))
            except api.ApiError as erro:
                return self._json({"erro": erro.mensagem}, erro.status)
            except Exception as erro:  # pragma: no cover - rede de seguranca
                if os.environ.get("FINANCAS_DEBUG"):
                    import traceback
                    traceback.print_exc()
                return self._json({"erro": f"Erro interno: {erro}"}, 500)

        if caminho.startswith("/api/"):
            return self._json({"erro": "Endpoint não encontrado."}, 404)
        if metodo == "GET":
            return self._arquivo(caminho)
        self._json({"erro": "Método não permitido."}, 405)

    # -- respostas ---------------------------------------------------------
    def _ler_json(self):
        tamanho = _int(self.headers.get("Content-Length")) or 0
        if tamanho > MAX_BODY:
            raise api.ApiError("Requisição muito grande.", 413)
        if tamanho == 0:
            return {}
        try:
            dados = json.loads(self.rfile.read(tamanho).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise api.ApiError("JSON inválido.")
        if not isinstance(dados, dict):
            raise api.ApiError("O corpo da requisição deve ser um objeto JSON.")
        return dados

    def _enviar(self, corpo, status=200, tipo="application/json; charset=utf-8", extra=None):
        if isinstance(corpo, str):
            corpo = corpo.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        for chave, valor in (extra or {}).items():
            self.send_header(chave, valor)
        self.end_headers()
        self.wfile.write(corpo)

    def _json(self, dados, status=200):
        self._enviar(json.dumps(dados, ensure_ascii=False), status)

    def _exportar(self, query):
        conteudo = api.exportar_csv(**_filtros_query(query))
        self._enviar(
            conteudo, 200, "text/csv; charset=utf-8",
            {"Content-Disposition": 'attachment; filename="extrato.csv"'},
        )

    def _arquivo(self, caminho):
        relativo = "index.html" if caminho in ("/", "") else caminho.lstrip("/")
        destino = os.path.normpath(os.path.join(STATIC_DIR, relativo))
        if not destino.startswith(STATIC_DIR) or not os.path.isfile(destino):
            return self._enviar("<h1>404</h1><p>Página não encontrada.</p>", 404,
                                "text/html; charset=utf-8")
        tipo = mimetypes.guess_type(destino)[0] or "application/octet-stream"
        if tipo.startswith("text/") or tipo == "application/javascript":
            tipo += "; charset=utf-8"
        with open(destino, "rb") as arquivo:
            self._enviar(arquivo.read(), 200, tipo)


def main():
    parser = argparse.ArgumentParser(description="Controla Gastos")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--abrir", action="store_true", help="abre o navegador ao iniciar")
    args = parser.parse_args()

    db.init()
    servidor = ThreadingHTTPServer((args.host, args.port), Handler)
    endereco = f"http://{args.host}:{args.port}"
    print("=" * 52)
    print("  Minhas Finanças - Controla Gastos")
    print(f"  Banco de dados: {db.DB_PATH}")
    print(f"  Acesse: {endereco}")
    print("  (Ctrl+C para encerrar)")
    print("=" * 52)
    if args.abrir:
        webbrowser.open(endereco)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrado.")
        servidor.server_close()


if __name__ == "__main__":
    main()
