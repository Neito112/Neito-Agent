@echo off
title Neito Agent Launcher
cd /d "%~dp0"

if not exist logs mkdir logs

REM 1) Ensure Python virtual environment exists
if not exist "venv\Scripts\activate.bat" (
    echo [1/4] Creating Python virtual environment...
    python -m venv venv
)

REM 2) Install Python requirements if needed
call "venv\Scripts\activate.bat"
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

REM 3) Ensure Tauri frontend dependencies are installed
cd /d "%~dp0neito-agent"
if not exist "node_modules" (
    echo [2/4] Installing frontend dependencies for Tauri app...
    call npm install
)

REM 4) Start backend + desktop app
cd /d "%~dp0"

echo ===================================================
echo     KHOI DONG NEITO AGENT DESKTOP COMPANION
echo ===================================================

echo [3/4] Dang chay Brain Server :4242 (Phidata + Smolagents + Mem0)...
start "Neito Brain" cmd /c "call venv\Scripts\activate.bat && python -u brain.py > logs\brain.log 2>&1"

REM Cho 2 giay de Brain Server san sang lang nghe tren cong 4242
ping -n 3 127.0.0.1 >nul

echo [4/4] Dang khoi dong Desktop Overlay & System Tray...
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cd /d "%~dp0neito-agent\src-tauri"
cargo run

pause
