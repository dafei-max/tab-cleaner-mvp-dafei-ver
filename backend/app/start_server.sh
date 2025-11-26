#!/bin/bash
# 启动后端服务器脚本

echo "🚀 Starting Tab Cleaner Backend Server..."

# 检查是否在虚拟环境中
if [ -z "$VIRTUAL_ENV" ] && [ -d ".venv" ]; then
    echo "📦 Activating virtual environment..."
    source .venv/bin/activate
fi

# 检查是否安装了依赖
if ! command -v uvicorn &> /dev/null; then
    echo "⚠️  uvicorn not found, installing dependencies..."
    if command -v uv &> /dev/null; then
        echo "📦 Using uv to install dependencies..."
        uv sync
    else
        echo "📦 Using pip to install dependencies..."
        pip install -r requirements.txt
    fi
fi

# 设置默认端口
PORT=${PORT:-8000}

# 启动服务器
echo "🌐 Starting server on http://localhost:${PORT}..."
echo "📝 Press Ctrl+C to stop the server"
echo ""

if command -v uv &> /dev/null; then
    uv run uvicorn main:app --host 0.0.0.0 --port $PORT --reload
else
    uvicorn main:app --host 0.0.0.0 --port $PORT --reload
fi



