# Tab Cleaner Backend API

FastAPI 后端服务，提供 OpenGraph 抓取、向量搜索、AI 聚类等功能。

## 🚀 快速启动

### 方式 1: 使用启动脚本（推荐）

**macOS/Linux:**
```bash
chmod +x start_server.sh
./start_server.sh
```

**Windows:**
```cmd
start_server.bat
```

### 方式 2: 手动启动

#### 使用 uv（推荐）
```bash
# 安装依赖
uv sync

# 启动服务器
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

#### 使用 pip
```bash
# 创建虚拟环境（如果还没有）
python -m venv .venv

# 激活虚拟环境
# macOS/Linux:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动服务器
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 📋 环境变量配置

创建 `.env` 文件（可选，用于配置数据库等）：

```bash
# 阿里云 ADB PostgreSQL 向量数据库配置（可选）
ADBPG_HOST=your_host
ADBPG_PORT=5432
ADBPG_DBNAME=postgres
ADBPG_USER=your_user
ADBPG_PASSWORD=your_password
ADBPG_NAMESPACE=cleantab

# 阿里云 DashScope API Key（必需，用于 AI 功能）
DASHSCOPE_API_KEY=your_api_key
```

## 🌐 API 端点

服务器启动后，访问：
- **API 文档**: http://localhost:8000/docs
- **健康检查**: http://localhost:8000/

### 主要 API

- `POST /api/v1/tabs/opengraph` - 批量抓取 OpenGraph 数据
- `POST /api/v1/search/embedding` - 生成 embedding 向量
- `POST /api/v1/search/query` - 搜索相关内容
- `POST /api/v1/clustering/manual` - 手动创建聚类
- `POST /api/v1/clustering/ai-classify` - AI 按标签分类
- `POST /api/v1/clustering/ai-discover` - AI 自发现聚类

## 🔧 故障排查

### 问题：无法连接到后端服务器

**检查清单：**
1. ✅ 后端服务是否已启动？
   ```bash
   # 检查进程
   lsof -i :8000  # macOS/Linux
   netstat -ano | findstr :8000  # Windows
   ```

2. ✅ 后端服务是否运行在正确的端口？
   - 默认端口：`8000`
   - 检查启动日志中的端口号

3. ✅ 防火墙是否阻止连接？
   - 确保本地防火墙允许 `localhost:8000` 的连接

4. ✅ 前端配置的地址是否正确？
   - 检查 `frontend/public/assets/background.js` 中的 API 地址
   - 默认应该是 `http://localhost:8000`

### 问题：依赖安装失败

**解决方案：**
```bash
# 使用 uv（推荐）
uv sync

# 或使用 pip
pip install -r requirements.txt
```

### 问题：向量数据库连接失败

**解决方案：**
- 如果不需要向量数据库功能，可以不配置 `ADBPG_HOST` 环境变量
- 如果需要，请参考 `VECTOR_DB_SETUP.md` 配置数据库

## 📝 开发说明

- **热重载**: 使用 `--reload` 参数启用自动重载
- **日志**: 所有日志输出到控制台
- **CORS**: 已配置允许跨域请求

## 🐛 调试

查看详细日志：
```bash
# 启动时查看所有输出
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level debug
```




