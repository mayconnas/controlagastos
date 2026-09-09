@echo off
REM Inicia o Controla Gastos (Windows)
cd /d "%~dp0"
python app.py --abrir %*
pause
