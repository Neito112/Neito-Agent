@echo off
title Neito Agent Launcher
cd /d "%~dp0"

echo ===================================================
echo     KHOI DONG NEITO AGENT DESKTOP COMPANION
echo ===================================================

if not exist logs mkdir logs

REM Don dep tien trinh cu
taskkill /F /IM neito-agent.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :4242 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [1/2] Dang chay Brain Server :4242 (Phidata + Smolagents + Mem0)...
start "Neito Brain" cmd /c "venv\Scripts\activate.bat && python -u brain.py > logs\brain.log 2>&1"

REM Cho 2 giay de Brain Server san sang lang nghe tren cong 4242
timeout /t 2 /nobreak >nul

echo [2/2] Dang khoi dong Desktop Overlay & System Tray...
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cd /d "%~dp0neito-agent\src-tauri"
cargo run

pause
