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
- `DELETE /api/v1/tabs/{tab_id}` - 软删除单个 tab
- `DELETE /api/v1/sessions/{session_id}` - 软删除整个 session
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

## 📊 核心业务逻辑

### 1. 共享向量库架构

**设计理念**：所有用户的 embedding 数据存储在共享向量库中，搜索时忽略用户隔离，实现跨用户的知识共享。

**实现方式**：
- 数据库表：`cleantab.opengraph_items_v2`
- 主键：`(user_id, url)` - 支持同一 URL 被多个用户收藏
- 搜索行为：`search_by_text_embedding` 和 `search_by_image_embedding` 忽略 `user_id`，搜索所有 `status='active'` 的记录
- 数据隔离：虽然搜索是共享的，但删除操作仍然需要 `user_id` 来确保用户只能删除自己的数据

**优势**：
- ✅ 更大的搜索池：可以搜索所有用户的历史数据
- ✅ 更好的搜索质量：更多数据意味着更准确的相似度匹配
- ✅ 知识共享：用户可以从其他用户的收藏中受益

### 2. 软删除机制

**设计目标**：实现前端个人空间和后端数据库的同步删除，同时保留数据用于恢复和审计。

**数据库 Schema**：
```sql
CREATE TABLE cleantab.opengraph_items_v2 (
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    ...
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    deleted_at TIMESTAMP,
    ...
    PRIMARY KEY (user_id, url)
);
```

**软删除流程**：

1. **删除 Tab**：
   ```sql
   UPDATE opengraph_items_v2
   SET status = 'deleted', deleted_at = NOW()
   WHERE user_id = $1 AND url = $2 AND status = 'active';
   ```

2. **删除 Session**：
   ```sql
   UPDATE opengraph_items_v2
   SET status = 'deleted', deleted_at = NOW()
   WHERE user_id = $1 
     AND status = 'active'
     AND metadata->>'session_id' = $2;
   ```

3. **自动过滤**：
   - 所有读取接口（`get_opengraph_item`, `get_items_by_urls`, `search_by_*`）自动过滤 `status='deleted'` 的记录
   - 已删除的记录不会出现在搜索结果中

4. **定时清理**：
   - 运行 `cleanup_deleted_data.py` 清理 `deleted_at` 超过 30 天的数据
   - 支持两种模式：
     - **匿名化**（默认）：保留 embedding，清空敏感字段（title, description, image 等）
     - **物理删除**：完全删除记录

**使用场景**：
- 用户在个人空间删除单个卡片 → 调用 `DELETE /api/v1/tabs/{tab_id}`
- 用户删除整个洗衣筐 → 调用 `DELETE /api/v1/sessions/{session_id}`
- 前端同步：删除后需要更新 `chrome.storage.local` 中的 `sessions` 数据

### 3. 数据迁移

**迁移脚本**：`migrate_data.py`

**迁移流程**：
1. 检查旧表 `opengraph_items` 是否存在
2. 检查新表 `opengraph_items_v2` 是否存在（如果不存在，先运行 `init_schema_standalone.py`）
3. 批量迁移数据（每次 100 条）：
   - 设置 `user_id = 'anonymous'`（共享向量库）
   - 设置 `status = 'active'`（所有记录都是活跃状态）
4. 统计迁移结果

**运行迁移**：
```bash
# 1. 先初始化 schema（如果表不存在）
python init_schema_standalone.py

# 2. 运行迁移
python migrate_data.py
```

### 4. 前端-后端数据同步

**数据流**：

```
前端（Chrome Storage）
  ↓
  用户操作（删除 tab/session）
  ↓
  调用 DELETE API
  ↓
  后端软删除（更新数据库 status='deleted'）
  ↓
  前端同步更新 chrome.storage.local
```

**同步要求**：
- ✅ 前端删除操作必须调用后端 DELETE API
- ✅ 后端删除成功后，前端需要更新本地 `sessions` 数据
- ✅ 确保 `metadata` 中包含 `session_id`，否则无法通过 session 删除

**Session ID 存储**：
```javascript
// 存储 OpenGraph 数据时，确保 metadata 包含 session_id
{
  url: "https://example.com",
  metadata: {
    session_id: "session_1234567890",  // ← 必须包含
    is_doc_card: false,
    success: true
  }
}
```

### 5. 定时清理任务

**清理脚本**：`cleanup_deleted_data.py`

**功能**：
- 清理 `deleted_at` 超过指定天数（默认 30 天）的数据
- 支持两种模式：
  - **匿名化**（推荐）：保留 embedding 用于搜索，清空敏感字段
  - **物理删除**：完全删除记录

**运行方式**：
```bash
# 匿名化（默认，保留 embedding）
python cleanup_deleted_data.py --days 30

# 物理删除
python cleanup_deleted_data.py --days 30 --delete
```

**定时任务配置**（Cron）：
```bash
# 每天凌晨 2 点运行清理任务
0 2 * * * cd /path/to/backend/app && python cleanup_deleted_data.py --days 30
```

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

## 📚 相关文档

- `SOFT_DELETE_GUIDE.md` - 软删除机制详细说明
- `DELETE_API_EXPLANATION.md` - DELETE API 接口说明
- `VECTOR_DB_SETUP.md` - 向量数据库配置说明
- `DIAGNOSE_SCOPE_EXPLANATION.md` - 诊断脚本检查范围说明




