@echo off
setlocal
rem ============================================================
rem  Dong goi agy CLI vao du an Ni-Oh (tools\agy\agy.exe)
rem  Chay mot lan sau khi cai Antigravity, hoac khi agy update.
rem ============================================================
cd /d "%~dp0"

set "SRC=%LOCALAPPDATA%\agy\bin\agy.exe"

if not exist "%SRC%" (
  echo [LOI] Khong thay agy.exe tai: %SRC%
  echo Hay cai Antigravity CLI truoc: https://antigravity.google
  pause
  exit /b 1
)

echo Dang copy agy.exe tu: %SRC%
echo Den:                %~dp0agy.exe
copy /Y "%SRC%" "%~dp0agy.exe" >nul
if errorlevel 1 (
  echo [LOI] Copy that bai.
  pause
  exit /b 1
)

echo [OK] Da dong goi agy vao du an.
"%~dp0agy.exe" --version
pause
endlocal
