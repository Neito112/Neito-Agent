@echo off
setlocal
rem ============================================================
rem  Cai dat moi truong YOLO cho Ni-Oh Eye (yolo_env)
rem  Chay mot lan khi clone du an ve may khac.
rem ============================================================
cd /d "%~dp0"

set "BASEPY=C:\Users\Neito\AppData\Local\hermes\hermes-agent\.hermes-runtime\python\cpython-3.11.16-windows-x86_64-none\python.exe"
if not exist "%BASEPY%" (
  where python >nul 2>&1 || (echo [Loi] Khong tim thay Python 3.11. & pause & exit /b 1)
  set "BASEPY=python"
)

echo [1/3] Tao yolo_env...
"%BASEPY%" -m venv yolo_env || (echo venv that bai & pause & exit /b 1)

echo [2/3] Cai torch CPU...
yolo_env\Scripts\python.exe -m pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cpu

echo [3/3] Cai ultralytics + mss...
yolo_env\Scripts\python.exe -m pip install -q ultralytics mss pillow numpy

yolo_env\Scripts\python.exe -c "import ultralytics, mss; print('YOLO_ENV READY')"
pause
endlocal
