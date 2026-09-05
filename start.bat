@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ni-Oh Strategic Autonomous Agent System (1-Click Auto Setup)
color 0B

echo ======================================================================
echo          NI-OH STRATEGIC AUTONOMOUS COMPANION & AGENT ECOSYSTEM
echo                   Hệ Thống Trợ Lý Chiến Lược Đa Năng
echo                     Phát triển bởi Neito112 (Open Source)
echo ======================================================================
echo.

:: ─────────────────────────────────────────────────────────────────────────────
:: BƯỚC 1: KIỂM TRA VÀ TỰ ĐỘNG THIẾT LẬP MÔI TRƯỜNG NODE.JS
:: ─────────────────────────────────────────────────────────────────────────────
echo [1/5] [*] Đang kiểm tra môi trường chạy Node.js...

set "NODE_CMD="

:: 1.1 Kiểm tra Node trong PATH hệ thống
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_CMD=node"
    echo [OK] Đã tìm thấy Node.js trong hệ thống:
    node -v
    goto :NODE_READY
)

:: 1.2 Kiểm tra Node Portable trong thư mục .runtime của project
if exist "%~dp0.runtime\node-v20.18.0-win-x64\node.exe" (
    set "PATH=%~dp0.runtime\node-v20.18.0-win-x64;%PATH%"
    set "NODE_CMD=node"
    echo [OK] Đã tìm thấy Node.js Portable trong project (.runtime)!
    goto :NODE_READY
)

:: 1.3 Kiểm tra Node trong thư mục người dùng cá nhân (.nodejs)
if exist "%USERPROFILE%\.nodejs\node.exe" (
    set "PATH=%USERPROFILE%\.nodejs;%PATH%"
    set "NODE_CMD=node"
    echo [OK] Đã tìm thấy Node.js Standalone tại %USERPROFILE%\.nodejs!
    goto :NODE_READY
)

:: 1.4 MÁY MỚI HOÀN TOÀN: TỰ ĐỘNG TẢI NODE.JS PORTABLE TỪ NODEJS.ORG
echo.
echo ======================================================================
echo [!] PHÁT HIỆN MÁY TÍNH MỚI / CHƯA CÓ NODE.JS!
echo [*] Đang tự động tải Node.js v20.18.0 LTS Portable từ nodejs.org...
echo [*] Dung lượng ~29MB (Hoàn toàn không cần quyền Admin, không làm rác máy)
echo ======================================================================
echo.

if not exist "%~dp0.runtime" mkdir "%~dp0.runtime"

:: Tải bằng curl (có sẵn trên Win 10/11) hoặc PowerShell dự phòng
where curl.exe >nul 2>nul
if %errorlevel% equ 0 (
    echo [*] Đang tải Node.js qua curl...
    curl.exe -L --progress-bar -o "%~dp0.runtime\node.zip" "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
) else (
    echo [*] Đang tải Node.js qua PowerShell...
    powershell -ExecutionPolicy Bypass -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip', '%~dp0.runtime\node.zip')"
)

if not exist "%~dp0.runtime\node.zip" (
    echo.
    echo ======================================================================
    echo [X] LỖI KHÔNG THỂ TẢI NODE.JS TỰ ĐỘNG!
    echo Vui lòng kiểm tra kết nối mạng Internet của máy tính.
    echo Hoặc bạn có thể tải và cài đặt Node.js thủ công tại: https://nodejs.org
    echo ======================================================================
    pause
    exit /b 1
)

echo [*] Đang giải nén môi trường Node.js Portable...
where tar.exe >nul 2>nul
if %errorlevel% equ 0 (
    tar.exe -xf "%~dp0.runtime\node.zip" -C "%~dp0.runtime\"
) else (
    powershell -ExecutionPolicy Bypass -NoProfile -Command "Expand-Archive -Path '%~dp0.runtime\node.zip' -DestinationPath '%~dp0.runtime\' -Force"
)

:: Xóa file zip tạm để giải phóng ổ cứng
if exist "%~dp0.runtime\node.zip" del /f /q "%~dp0.runtime\node.zip" >nul 2>&1

set "PATH=%~dp0.runtime\node-v20.18.0-win-x64;%PATH%"
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] Không thể khởi chạy Node.js sau khi giải nén.
    pause
    exit /b 1
)
echo [OK] Tự động thiết lập Node.js v20 Portable THÀNH CÔNG!

:NODE_READY
echo.

:: ─────────────────────────────────────────────────────────────────────────────
:: BƯỚC 2: CÀI ĐẶT THƯ VIỆN HỆ THỐNG (NPM INSTALL)
:: ─────────────────────────────────────────────────────────────────────────────
echo [2/5] [*] Đang kiểm tra thư viện hệ thống (Dependencies)...
if not exist "%~dp0node_modules\" (
    echo [*] Lần đầu khởi động: Đang tự động cài đặt các thư viện cần thiết...
    echo [*] (discord.js, exceljs, pptxgenjs, docx, node-cron, edge-tts...)
    echo [*] Quá trình này chỉ chạy 1 lần duy nhất, vui lòng chờ 1-2 phút...
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo [!] Có một số thư viện cảnh báo, hệ thống sẽ tiếp tục thử chạy.
    ) else (
        echo [OK] Cài đặt toàn bộ thư viện dependencies HOÀN TẤT!
    )
) else (
    echo [OK] Toàn bộ thư viện dependencies đã sẵn sàng!
)
echo.

:: ─────────────────────────────────────────────────────────────────────────────
:: BƯỚC 3: KIỂM TRA FILE CẤU HÌNH & BẢO MẬT (THÔNG BÁO CHO NGƯỜI DÙNG)
:: ─────────────────────────────────────────────────────────────────────────────
echo [3/5] [*] Kiểm tra cấu hình bảo mật cá nhân (.env ^& tokens.json)...

:: Tự động tạo file .env nếu chưa có
if not exist "%~dp0.env" (
    if exist "%~dp0.env.example" (
        copy "%~dp0.env.example" "%~dp0.env" >nul 2>&1
        echo [i] Đã tự động tạo file .env từ template .env.example!
    )
)

:: Tự động tạo file tokens.json nếu chưa có
if not exist "%~dp0tokens.json" (
    if exist "%~dp0tokens.example.json" (
        copy "%~dp0tokens.example.json" "%~dp0tokens.json" >nul 2>&1
    ) else (
        echo {"default":""} > "%~dp0tokens.json"
    )
)

:: Tự động tạo file api_keys.json nếu chưa có
if not exist "%~dp0api_keys.json" (
    if exist "%~dp0api_keys.example.json" (
        copy "%~dp0api_keys.example.json" "%~dp0api_keys.json" >nul 2>&1
    ) else (
        echo {"google":[""]} > "%~dp0api_keys.json"
    )
)

:: Kiểm tra xem người dùng đã cấu hình Token chưa
set "NEED_CONFIG=0"
powershell -ExecutionPolicy Bypass -NoProfile -Command "
$hasDiscord = $false;
if (Test-Path '.env') {
    $content = Get-Content '.env' -Raw;
    if ($content -match 'DISCORD_TOKEN=([^\r\n#\s]+)' -and $matches[1] -ne 'your_discord_bot_token_here') { $hasDiscord = $true }
}
if (Test-Path 'tokens.json') {
    $tj = Get-Content 'tokens.json' -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue;
    if ($tj.default -and $tj.default -ne 'YOUR_DISCORD_BOT_TOKEN_HERE' -and $tj.default.Length -gt 15) { $hasDiscord = $true }
}
if (-not $hasDiscord) { exit 10 } else { exit 0 }
" >nul 2>&1

if %errorlevel% equ 10 (
    set "NEED_CONFIG=1"
    echo.
    echo ======================================================================
    echo  [!] THÔNG BÁO QUAN TRỌNG: CẦN CẤU HÌNH BOT TOKEN ĐỂ KẾT NỐI DISCORD!
    echo ======================================================================
    echo  Hệ thống start.bat đã tự động chuẩn bị 100%% môi trường và mã nguồn.
    echo  Tuy nhiên, BOT TOKEN là bí mật riêng của bạn, hệ thống không thể tự đoán.
    echo.
    echo  👉 HƯỚNG DẪN LẤY BOT TOKEN MIỄN PHÍ TRONG 1 PHÚT:
    echo     1. Mở trình duyệt vào: https://discord.com/developers/applications
    echo     2. Bấm 'New Application' -^> Đặt tên (vd: Ni-Oh)
    echo     3. Vào menu 'Bot' -^> Bấm 'Reset Token' hoặc 'Copy Token'
    echo     4. Kéo xuống mục 'Privileged Gateway Intents', BẬT cả 3 công tắc:
    echo        [x] PRESENCE INTENT
    echo        [x] SERVER MEMBERS INTENT
    echo        [x] MESSAGE CONTENT INTENT
    echo     5. Dán token vào file .env (ở dòng DISCORD_TOKEN=) hoặc tokens.json
    echo.
    echo  👉 NẾU DÙNG CLOUD AI (Google Gemini):
    echo     Lấy API Key MIỄN PHÍ tại: https://aistudio.google.com
    echo     Dán vào dòng GEMINI_API_KEY= trong file .env
    echo ======================================================================
    echo.
    echo [*] Đang tự động mở file .env bằng Notepad để bạn chỉnh sửa...
    if exist "%~dp0.env" (
        start notepad "%~dp0.env"
    ) else (
        start notepad "%~dp0tokens.json"
    )
    echo.
    echo Sau khi dán token và bấm Ctrl+S (Lưu file), hãy quay lại đây.
    set /p USER_CONFIRM="Bạn đã lưu token chưa? Bấm phím [Y] để tiếp tục chạy, hoặc [N] để thoát: "
) else (
    echo [OK] Đã phát hiện cấu hình Token bảo mật sẵn sàng!
)
echo.

:: ─────────────────────────────────────────────────────────────────────────────
:: BƯỚC 4: KIỂM TRA PHẦN CỨNG & CHẾ ĐỘ 0-TOKEN LOCAL AI (OLLAMA / GPU)
:: ─────────────────────────────────────────────────────────────────────────────
echo [4/5] [*] Kiểm tra phần cứng đồ họa (GPU) và Engine AI Cục Bộ (Ollama)...

:: 4.1 Kiểm tra card đồ họa
powershell -ExecutionPolicy Bypass -NoProfile -Command "
$gpus = Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name;
Write-Output ('[i] Card đồ họa phát hiện: ' + ($gpus -join ' | '));
$hasNvidia = $gpus | Where-Object { $_ -match 'NVIDIA' };
if ($hasNvidia) {
    $hasSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue;
    if (-not $hasSmi) {
        Write-Output '[!] CẢNH BÁO: Máy có card NVIDIA nhưng chưa có Driver CUDA!';
        Write-Output '[*] Hãy cập nhật Driver tại https://www.nvidia.com/download/index.aspx để tăng tốc AI!';
    } else {
        Write-Output '[OK] NVIDIA GPU và CUDA Driver sẵn sàng!';
    }
}
"

:: 4.2 Kiểm tra Ollama (Local AI 0-Token)
where ollama >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Đã phát hiện Ollama Engine! Hỗ trợ chạy Local AI 0-Token 100%% miễn phí.
    :: Kiểm tra service Ollama có đang chạy không
    curl.exe -s http://127.0.0.1:11434/api/tags >nul 2>nul
    if %errorlevel% neq 0 (
        echo [*] Đang khởi động tiến trình nền Ollama...
        start /b "" ollama serve >nul 2>&1
        timeout /t 2 /nobreak >nul
    )
) else (
    echo.
    echo ----------------------------------------------------------------------
    echo [i] THÔNG BÁO VỀ OLLAMA (Local AI 0-Token Offline):
    echo     Máy tính của bạn hiện chưa cài đặt Ollama.
    echo     - Chế độ 1: Dùng Cloud AI (Google Gemini / OpenAI qua API Key)
    echo       -^> Chạy bình thường, không cần cài Ollama.
    echo     - Chế độ 2: Dùng Local AI (Chạy offline trên máy, tốn 0 token)
    echo       -^> Cần cài Ollama và tải model (vd: moondream, qwen2.5:7b).
    echo.
    set /p INSTALL_OLLAMA="Bạn có muốn tự động tải trình cài đặt Ollama ngay không? (Y/N): "
    if /i "%INSTALL_OLLAMA%"=="Y" (
        echo [*] Đang tải trình cài đặt Ollama...
        curl.exe -L --progress-bar -o "%~dp0.runtime\OllamaSetup.exe" "https://ollama.com/download/OllamaSetup.exe"
        if exist "%~dp0.runtime\OllamaSetup.exe" (
            echo [*] Đang mở trình cài đặt Ollama. Bạn hãy bấm 'Install' trên cửa sổ hiện lên...
            start "" "%~dp0.runtime\OllamaSetup.exe"
        )
    )
    echo ----------------------------------------------------------------------
)
echo.

:: ─────────────────────────────────────────────────────────────────────────────
:: BƯỚC 5: KHỞI CHẠY HỆ THỐNG NI-OH CHIẾN LƯỢC
:: ─────────────────────────────────────────────────────────────────────────────
echo [5/5] ====================================================================
echo   KHỞI ĐỘNG NI-OH STRATEGIC AUTONOMOUS COMPANION
echo   • Chế độ 0-Token Math: Sẵn sàng xuất công thức Google Sheets/Excel
echo   • Chế độ Live Screen: Windows Native OCR + Local VLM
echo   • Cổng Deep Reasoning Gateway: Sẵn sàng
echo.
echo   [i] LƯU Ý MẠNG: Nếu Windows hiển thị bảng hỏi "Windows Defender Firewall",
echo       vui lòng tích chọn Private và Public rồi bấm [Allow access]!
echo ======================================================================
echo.

:: Kiểm tra file chạy chính: server.js hoặc src/index.js
if exist "%~dp0server.js" (
    node server.js
) else if exist "%~dp0src\index.js" (
    node src/index.js
) else (
    echo [X] Lỗi: Không tìm thấy file khởi động (server.js hoặc src/index.js)!
)

if %errorlevel% neq 0 (
    echo.
    echo ======================================================================
    echo [!] Ứng dụng đã dừng với mã lỗi %errorlevel%.
    echo [*] Vui lòng kiểm tra lại Token trong file .env hoặc tokens.json.
    echo ======================================================================
)

echo.
echo Bấm phím bất kỳ để đóng cửa sổ này...
pause >nul
