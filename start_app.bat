@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Neito Agent - Local Launcher

if not exist "logs" mkdir "logs"

echo ===================================================
echo        NEITO AGENT - LOCAL FIRST LAUNCHER
echo ===================================================

where python >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python is not installed or not in PATH.
  echo Install Python 3.10+ and run this file again.
  pause
  exit /b 1
)

if not exist "venv\Scripts\python.exe" (
  echo [1/6] Creating local Python environment...
  python -m venv venv || goto :fail
)

call "venv\Scripts\activate.bat"
echo [2/6] Installing/updating Python dependencies...
python -m pip install --upgrade pip || goto :fail
python -m pip install -r requirements.txt || goto :fail

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js/npm is not installed or not in PATH.
  echo Install Node.js 18+ and run this file again.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm is not installed or not in PATH.
  pause
  exit /b 1
)

cd /d "%~dp0neito-agent"
if not exist "node_modules\.bin\tauri.cmd" (
  echo [3/6] Installing frontend dependencies...
  call npm install || goto :fail
) else (
  echo [3/6] Frontend dependencies are ready.
)

where cargo >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Rust/Cargo is not installed or not in PATH.
  echo Install Rust from https://rustup.rs/ and run this file again.
  pause
  exit /b 1
)

cd /d "%~dp0"
echo [4/6] Starting local Brain Server on 127.0.0.1:4242...
start "Neito Brain" /min cmd /c "call "%~dp0venv\Scripts\activate.bat" && cd /d "%~dp0" && python -u brain.py > logs\brain.log 2>&1"

for /l %%i in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest http://127.0.0.1:4242/api/status -UseBasicParsing -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 goto :backend_ready
  timeout /t 1 /nobreak >nul
)

echo [WARN] Brain Server did not respond within 30 seconds.
echo Check logs\brain.log. The desktop UI will still be started.

:backend_ready
cd /d "%~dp0neito-agent"
echo [5/6] Starting Tauri desktop UI...
call npm run tauri:dev
if errorlevel 1 goto :fail

echo [6/6] Neito Agent closed.
exit /b 0

:fail
echo.
echo [ERROR] Launch failed. Review the message above and logs\brain.log.
pause
exit /b 1
