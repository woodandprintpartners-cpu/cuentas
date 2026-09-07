@echo off
title W^&P - Taller 3D y Control de Proyectos
chcp 65001 > nul
echo =========================================================
echo       Iniciando W^&P Workshop App (FastAPI)
echo =========================================================
echo.

cd /d "%~dp0"

echo Verificando dependencias...
python -m pip install -q -r requirements.txt

echo.
echo Iniciando servidor en http://localhost:8000 ...
echo Abriendo navegador en breve...

start "" http://localhost:8000

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
