@echo off
cd /d "%~dp0"
python -c "import yt_dlp, yt_dlp_ejs" >nul 2>&1
if errorlevel 1 (
  echo Preparando el lector de YouTube por primera vez...
  python -m pip install "yt-dlp[default]"
  if errorlevel 1 (
    echo No se pudo preparar YouTube. Revisa tu conexion y la instalacion de Python.
    pause
    exit /b 1
  )
)
python tools\retro_server.py --open
if errorlevel 1 pause
