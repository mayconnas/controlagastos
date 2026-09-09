#!/usr/bin/env bash
# Inicia o Controla Gastos (Linux / macOS)
cd "$(dirname "$0")" || exit 1
exec python3 app.py --abrir "$@"
