@echo off
REM 启动后端服务器脚本 (Windows)

echo 🚀 Starting Tab Cleaner Backend Server...

REM 检查是否在虚拟环境中
if exist ".venv\Scripts\activate.bat" (
    echo 📦 Activating virtual environment...
    call .venv\Scripts\activate.bat
)

REM 检查是否安装了依赖
where uvicorn >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  uvicorn not found, installing dependencies...
    where uv >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo 📦 Using uv to install dependencies...
        uv sync
    ) else (
        echo 📦 Using pip to install dependencies...
        pip install -r requirements.txt
    )
)

REM 设置默认端口
if "%PORT%"=="" set PORT=8000

REM 启动服务器
echo 🌐 Starting server on http://localhost:%PORT%...
echo 📝 Press Ctrl+C to stop the server
echo.

where uv >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    uv run uvicorn main:app --host 0.0.0.0 --port %PORT% --reload
) else (
    uvicorn main:app --host 0.0.0.0 --port %PORT% --reload
)




