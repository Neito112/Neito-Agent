@echo off
chcp 65001 >nul
title Ni-Oh Strategic Autonomous Agent System
color 0B

echo ======================================================================
echo          NI-OH STRATEGIC AUTONOMOUS COMPANION & AGENT ECOSYSTEM
echo                   Hệ Thống Trợ Lý Chiến Lược Đa Năng
echo                     Phát triển bởi Neito112 (Open Source)
echo ======================================================================
echo.

:: 1. Kiểm tra & Cấu hình Runtime Node.js
echo [*] Đang kiểm tra môi trường Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    if exist "%USERPROFILE%\.nodejs\node.exe" (
        set "PATH=%USERPROFILE%\.nodejs;%PATH%"
        echo [OK] Đã tự động nhận diện Node.js Standalone Runtime!
    ) else (
        echo [!] Chưa tìm thấy Node.js trên máy!
        echo [*] Vui lòng cài đặt Node.js v20+ tại https://nodejs.org
        pause
        exit /b 1
    )
) else (
    echo [OK] Node.js sẵn sàng!
)

:: 2. Kiểm tra Thư Viện Dependencies
echo.
echo [*] Đang kiểm tra thư viện hệ thống...
if not exist "node_modules\" (
    echo [*] Lần đầu khởi động: Đang tự động cài đặt dependencies cần thiết...
    call npm install --silent
    echo [OK] Cài đặt thư viện hoàn tất!
) else (
    echo [OK] Thư viện dependencies đã sẵn sàng!
)

:: 3. Kiểm tra Local Model Engine (Ollama)
echo.
echo [*] Kiểm tra Local Model Engine (0-Token Edge AI)...
where ollama >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Đã phát hiện Ollama Engine! Tận dụng GPU nội bộ để tiết kiệm 100% token.
) else (
    echo [i] Ollama chưa cài đặt. Hệ thống sẽ tự động dùng Cloud AI Gateway (Antigravity/OpenAI/Claude).
)

:: 4. Khởi chạy Server
echo.
echo ======================================================================
echo   KHỞI ĐỘNG HỆ THỐNG NI-OH & 7 AGENTS CHIẾN LƯỢC TOÀN DIỆN
echo   • Discord 6 Bots: Sẵn sàng
echo   • Zalo Quản Đốc: Cổng Webhook :5050
echo   • 24/7 Knowledge Daemon: Quét tri thức vĩnh viễn (0 Token)
echo   • Strategic Live Companion: Sẵn sàng tác chiến
echo ======================================================================
echo.

node server.js
pause
