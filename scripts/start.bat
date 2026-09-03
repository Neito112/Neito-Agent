@echo off
title Neito-Agent Runner
color 0B
chcp 65001 >nul
echo ===================================================
echo   NEITO-AGENT - UNIVERSAL LIVE AI ASSISTANT
echo ===================================================
cd /d "%~dp0\.."
node src/index.js
pause
