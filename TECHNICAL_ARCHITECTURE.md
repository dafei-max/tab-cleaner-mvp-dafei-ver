# Tab Cleaner MVP - 完整技术架构文档

## 📋 目录

1. [系统概览](#系统概览)
2. [前端架构](#前端架构)
3. [后端架构](#后端架构)
4. [数据库架构](#数据库架构)
5. [通信协议](#通信协议)
6. [数据流](#数据流)
7. [技术栈](#技术栈)

---

## 系统概览

Tab Cleaner MVP 是一个基于 Chrome 扩展的标签页管理工具，采用**前后端分离**架构，支持**本地优先（Local-First）**的数据处理策略。

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         Chrome 浏览器                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Chrome Extension                       │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │  │
│  │  │ Background   │  │  Content     │  │  Popup/      │  │  │
│  │  │ Service      │  │  Scripts     │  │  Sidepanel    │  │  │
│  │  │ Worker       │  │              │  │              │  │  │
│  │  │ (background.js)│ │(content.js, │  │ (React App)  │  │  │
│  │  │              │  │ pet.js)      │  │              │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │  │
│  │         │                  │                  │         │  │
│  │         └──────────────────┴──────────────────┘         │  │
│  │                           │                              │  │
│  │                    Chrome Storage                        │  │
│  │              (local storage, sessions)                    │  │
│  └───────────────────────────┼──────────────────────────────┘  │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               │ HTTPS API
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    Backend Server                               │
│              (FastAPI + Python)                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  API Endpoints                                            │  │
│  │  ├─ POST /api/v1/search/embedding                        │  │
│  │  ├─ POST /api/v1/search/query                            │  │
│  │  ├─ DELETE /api/v1/tabs/{url}                            │  │
│  │  └─ DELETE /api/v1/sessions/{session_id}                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Search Pipeline                                          │  │
│  │  ├─ Query Enhancement (query_enhance.py)                  │  │
│  │  ├─ Embedding Generation (embed.py)                        │  │
│  │  ├─ Multi-way Recall (pipeline.py)                        │  │
│  │  └─ Re-ranking (rank.py, fuse.py)                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  AI Services                                               │  │
│  │  ├─ DashScope API (通义千问)                              │  │
│  │  │  └─ qwen2.5-vl-embedding (文本+图像)                  │  │
│  │  └─ AI Insight (ai_insight.py)                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               │ PostgreSQL Protocol
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│          Aliyun AnalyticDB PostgreSQL                           │
│              (向量数据库)                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Schema: cleantab                                         │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ opengraph_items_v2                                  │  │  │
│  │  │ ├─ user_id (TEXT)                                   │  │  │
│  │  │ ├─ url (TEXT)                                       │  │  │
│  │  │ ├─ title, description, image, site_name            │  │  │
│  │  │ ├─ text_embedding (vector(1024))                    │  │  │
│  │  │ ├─ image_embedding (vector(1024))                  │  │  │
│  │  │ ├─ status (active/deleted)                         │  │  │
│  │  │ ├─ deleted_at (TIMESTAMP)                          │  │  │
│  │  │ ├─ metadata (JSONB)                                 │  │  │
│  │  │ └─ PRIMARY KEY (user_id, url)                       │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │ Indexes                                             │  │  │
│  │  │ ├─ idx_user_text_embedding (IVFFlat)                │  │  │
│  │  │ ├─ idx_user_image_embedding (IVFFlat)               │  │  │
│  │  │ └─ idx_user_id (B-tree)                             │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 前端架构

### 1. Chrome Extension 结构

#### 1.1 Background Service Worker (`background.js`)

**职责**：
- 协调标签页清理流程
- 管理 OpenGraph 数据收集
- 与后端 API 通信
- 处理截图兜底逻辑

**关键功能**：
```javascript
// 三层保险策略确保图片捕获
1. 注入 opengraph_local.js 提取 OG 数据
2. 轮询等待动态 OG 标签加载（MutationObserver）
3. 截图兜底（captureTabScreenshot）
```

**消息处理**：
- `clean-all`: 清理所有标签页
- `clean-current-tab`: 清理当前标签页
- `clean`: 清理指定标签页

#### 1.2 Content Scripts

**`content.js`**：
- 显示清理卡片 UI
- 处理清理按钮点击
- 显示加载动画
- 从 Chrome Storage 读取 OpenGraph 缓存

**`pet.js`**：
- 桌面宠物功能
- 宠物拖拽和交互
- 清理操作入口

**`opengraph_local.js`**：
- 在页面上下文中提取 OpenGraph 数据
- 支持动态内容（SPA）检测
- URL 变化监听（popstate, hashchange, history API）
- MutationObserver 监听动态 OG 标签

#### 1.3 React 应用（个人空间）

**技术栈**：
- React 18.3.1
- Vite 6.0.4
- Framer Motion（动画）
- Three.js + React Three Fiber（3D 视图）
- Tailwind CSS

**核心组件**：
```
src/screens/PersonalSpace/
├── PersonalSpace.jsx          # 主组件
├── SessionMasonryGrid.jsx      # 网格视图
├── RadialCanvas.jsx            # 放射状视图
├── SessionCard.jsx             # 卡片组件
├── SearchBar.jsx               # 搜索栏
├── ScrollSpyIndicator.jsx     # 滚动指示器
└── hooks/
    ├── useSearch.js            # 搜索逻辑
    ├── useSessionManager.js    # Session 管理
    └── useCanvasInteractions.js # 画布交互
```

**状态管理**：
- React Hooks（useState, useEffect, useRef）
- Chrome Storage API（持久化）
- 全局状态对象（window.__OG_EXTRACTION_STATUS）

### 2. 前端数据流

```
用户操作
  ↓
Chrome Extension (background.js)
  ├─ 收集 OpenGraph 数据
  ├─ 保存到 Chrome Storage (sessions)
  ├─ 关闭标签页
  └─ 打开个人空间
      ↓
React App (PersonalSpace.jsx)
  ├─ 从 Chrome Storage 读取数据
  ├─ 立即渲染（不等待后端）
  └─ 异步发送到后端生成 embedding
      ↓
后端 API (/api/v1/search/embedding)
  ├─ 生成 embedding
  ├─ 保存到向量数据库
  └─ 返回结果
```

---

## 后端架构

### 1. 技术栈

- **框架**: FastAPI (Python 3.9+)
- **数据库**: Aliyun AnalyticDB PostgreSQL (向量数据库)
- **AI 服务**: 阿里云 DashScope API (通义千问)
- **异步**: asyncio, asyncpg

### 2. 核心模块

#### 2.1 API 路由 (`main.py`)

**主要端点**：

```python
POST /api/v1/search/embedding
  - 接收 OpenGraph 数据
  - 生成文本和图像 embedding
  - 保存到向量数据库
  - 支持批量处理

POST /api/v1/search/query
  - 接收查询文本
  - 查询增强（颜色、风格识别）
  - 多路召回（向量、关键词、视觉）
  - 重排序和相似度过滤

DELETE /api/v1/tabs/{url}
  - 软删除单个标签页

DELETE /api/v1/sessions/{session_id}
  - 软删除整个 session
```

#### 2.2 搜索 Pipeline (`search/pipeline.py`)

**流程**：
```
查询文本
  ↓
查询增强 (enhance_query)
  ├─ 颜色识别（蓝色 → blue）
  ├─ 风格识别（现代 → modern）
  └─ 同义词扩展
  ↓
生成查询向量 (embed_text)
  ↓
多路召回
  ├─ 向量搜索 (search_by_text_embedding)
  ├─ 关键词搜索 (fuzzy_score)
  └─ 视觉属性搜索
  ↓
重排序 (fuse_similarity_scores)
  ├─ 自适应权重
  └─ 相似度融合
  ↓
过滤 (MIN_SIMILARITY_THRESHOLD = 0.15)
  ↓
返回结果
```

#### 2.3 Embedding 生成 (`search/embed.py`)

**模型**: `qwen2.5-vl-embedding`
- **维度**: 1024
- **统一向量空间**: 文本和图像在同一空间，可直接比较
- **API**: 阿里云 DashScope

**处理流程**：
```python
文本 Embedding:
  text → embed_text() → vector(1024)

图像 Embedding:
  image_url → download_image() 
    → process_image() (缩放、压缩、Base64)
    → embed_image() → vector(1024)
```

#### 2.4 向量数据库客户端 (`vector_db.py`)

**功能**：
- 连接池管理（asyncpg.Pool）
- Schema 初始化（`init_schema()`）
- CRUD 操作（`upsert_opengraph_item()`, `get_opengraph_item()`）
- 向量搜索（`search_by_text_embedding()`, `search_by_image_embedding()`）
- 软删除（`soft_delete_tab()`, `soft_delete_session_tabs()`）

**用户隔离**：
- 所有查询都包含 `WHERE user_id = $1`
- 复合主键：`(user_id, url)`

---

## 数据库架构

### 1. 表结构

#### `opengraph_items_v2`

```sql
CREATE TABLE cleantab.opengraph_items_v2 (
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    image TEXT,
    site_name TEXT,
    tab_id INTEGER,
    tab_title TEXT,
    text_embedding vector(1024),
    image_embedding vector(1024),
    metadata JSONB,
    status TEXT DEFAULT 'active',  -- 'active' | 'deleted'
    deleted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, url)
);
```

### 2. 索引

```sql
-- 向量索引（IVFFlat，用于快速相似度搜索）
CREATE INDEX idx_user_text_embedding 
  ON opengraph_items_v2 
  USING ivfflat (text_embedding vector_cosine_ops);

CREATE INDEX idx_user_image_embedding 
  ON opengraph_items_v2 
  USING ivfflat (image_embedding vector_cosine_ops);

-- 用户 ID 索引（B-tree，用于快速过滤）
CREATE INDEX idx_user_id 
  ON opengraph_items_v2 (user_id);

-- 状态索引（用于软删除查询）
CREATE INDEX idx_status 
  ON opengraph_items_v2 (status) 
  WHERE status = 'active';
```

### 3. 数据迁移

**旧表**: `opengraph_items` (无 user_id)
**新表**: `opengraph_items_v2` (支持 user_id 和软删除)

**迁移脚本**: `migrate_data.py`
- 将旧数据迁移到新表
- 设置 `user_id = 'anonymous'`
- 设置 `status = 'active'`

---

## 通信协议

### 1. 前端 → 后端

**请求格式**：
```json
POST /api/v1/search/embedding
Headers:
  Content-Type: application/json
  X-User-ID: <user_id>  // 可选，默认 "anonymous"

Body:
{
  "opengraph_items": [
    {
      "url": "https://example.com",
      "title": "Example",
      "description": "...",
      "image": "https://example.com/image.jpg",
      "site_name": "Example Site",
      "is_doc_card": false,
      "is_screenshot": false,
      "success": true
    }
  ]
}
```

**响应格式**：
```json
{
  "ok": true,
  "processed": 5,
  "items": [
    {
      "url": "https://example.com",
      "text_embedding": [0.1, 0.2, ...],  // 1024 维
      "image_embedding": [0.3, 0.4, ...], // 1024 维
      "has_embedding": true
    }
  ]
}
```

### 2. 搜索请求

**请求格式**：
```json
POST /api/v1/search/query
Headers:
  Content-Type: application/json
  X-User-ID: <user_id>

Body:
{
  "query": "蓝色设计",
  "top_k": 20
}
```

**响应格式**：
```json
{
  "ok": true,
  "results": [
    {
      "url": "https://example.com",
      "title": "蓝色设计作品",
      "image": "https://example.com/image.jpg",
      "similarity": 0.85,
      "text_sim": 0.80,
      "image_sim": 0.90
    }
  ]
}
```

### 3. 消息传递（Chrome Extension）

**Background ↔ Content Script**：
```javascript
// Background → Content
chrome.tabs.sendMessage(tabId, {
  action: 'extract-opengraph-with-wait'
});

// Content → Background
chrome.runtime.sendMessage({
  action: 'opengraph-data',
  data: { ... }
});
```

**Content ↔ Page Context**：
```javascript
// Content → Page (opengraph_local.js)
window.postMessage({
  type: 'TAB_CLEANER_GET_OPENGRAPH'
}, '*');

// Page → Content
window.addEventListener('message', (event) => {
  if (event.data.type === 'TAB_CLEANER_OPENGRAPH_DATA') {
    // 处理数据
  }
});
```

---

## 数据流

### 1. 标签页清理流程

```
用户点击"清理所有标签页"
  ↓
background.js: collectTabWithGuaranteedImage()
  ├─ 注入 opengraph_local.js
  ├─ 发送 extract-opengraph-with-wait 消息
  ├─ 轮询等待 OG 数据（最多 8 秒）
  ├─ 如果没有图片，截图兜底
  └─ 收集所有标签页数据
  ↓
保存到 Chrome Storage (sessions)
  ↓
关闭标签页（仅关闭有图片的标签页）
  ↓
打开个人空间（立即渲染，不等待后端）
  ↓
异步发送到后端 (/api/v1/search/embedding)
  ├─ 生成 embedding
  ├─ 保存到向量数据库
  └─ 更新 Chrome Storage
```

### 2. 搜索流程

```
用户在搜索框输入"蓝色设计"
  ↓
前端: performSearch()
  ├─ 调用 searchContent(query)
  ↓
后端: POST /api/v1/search/query
  ├─ 查询增强（"蓝色设计" → "blue design"）
  ├─ 生成查询向量
  ├─ 向量搜索（WHERE user_id = $1）
  ├─ 关键词搜索（fuzzy_score）
  ├─ 视觉属性搜索
  ├─ 重排序（融合多路结果）
  └─ 过滤（similarity >= 0.15）
  ↓
返回结果（按相似度排序）
  ↓
前端: 计算放射状布局
  ├─ 最相关在内环
  └─ 向外递减
  ↓
渲染搜索结果
```

---

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3.1 | UI 框架 |
| Vite | 6.0.4 | 构建工具 |
| Framer Motion | 12.0.0 | 动画库 |
| Three.js | 0.170.0 | 3D 渲染 |
| React Three Fiber | 8.18.0 | Three.js React 绑定 |
| Tailwind CSS | 4.1.17 | CSS 框架 |
| Chrome Extension API | - | 浏览器扩展 API |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| FastAPI | - | Web 框架 |
| Python | 3.9+ | 编程语言 |
| asyncpg | 0.30.0+ | PostgreSQL 异步驱动 |
| asyncio | - | 异步编程 |
| DashScope SDK | - | 阿里云 AI API |

### 数据库

| 技术 | 版本 | 用途 |
|------|------|------|
| Aliyun AnalyticDB PostgreSQL | - | 向量数据库 |
| PostgreSQL | - | 关系型数据库 |
| pgvector | - | 向量扩展 |

### AI 服务

| 服务 | 模型 | 用途 |
|------|------|------|
| 阿里云 DashScope | qwen2.5-vl-embedding | 文本和图像 embedding |
| 阿里云 DashScope | qwen-plus | AI 洞察分析 |

---

## 部署架构

### 前端

- **构建**: `npm run build:full`
- **输出**: `frontend/dist/`
- **打包**: `package-extension.sh` → `tab-cleaner-extension.zip`
- **分发**: Chrome Web Store

### 后端

- **部署平台**: Railway
- **环境变量**:
  - `ADBPG_HOST`: 数据库主机
  - `ADBPG_DBNAME`: 数据库名
  - `ADBPG_USER`: 数据库用户
  - `ADBPG_PASSWORD`: 数据库密码
  - `DASHSCOPE_API_KEY`: AI API 密钥
- **启动**: `uvicorn main:app --host 0.0.0.0 --port 8000`

### 数据库

- **平台**: 阿里云 AnalyticDB PostgreSQL
- **连接**: 通过 `asyncpg` 连接池
- **Schema**: `cleantab`
- **表**: `opengraph_items_v2`

---

## 安全与隐私

### 1. 用户隔离

- 所有数据操作都包含 `user_id` 过滤
- 用户只能访问自己的数据
- 搜索仅返回当前用户的结果

### 2. 软删除

- 删除操作不物理删除数据
- 标记为 `status = 'deleted'`
- 30 天后自动清理或匿名化

### 3. 数据加密

- HTTPS 通信
- 数据库连接使用 SSL（可选）
- API Key 存储在环境变量中

---

## 性能优化

### 1. 前端

- **懒加载**: 图片懒加载
- **缓存**: Chrome Storage 缓存 OpenGraph 数据
- **异步处理**: 后端 embedding 生成不阻塞 UI
- **批量处理**: 批量发送 embedding 请求（每批 5 个）

### 2. 后端

- **连接池**: asyncpg 连接池（min=2, max=10）
- **异步处理**: 所有 I/O 操作异步
- **批量处理**: 批量生成 embedding
- **索引优化**: IVFFlat 向量索引加速搜索

### 3. 数据库

- **向量索引**: IVFFlat 索引加速相似度搜索
- **状态索引**: 部分索引（WHERE status = 'active'）
- **用户索引**: B-tree 索引加速用户过滤

---

## 扩展性

### 1. 水平扩展

- 后端无状态，可部署多个实例
- 数据库支持读写分离（AnalyticDB）
- 连接池支持多实例共享

### 2. 垂直扩展

- 向量索引可调整参数（IVFFlat lists）
- 批量处理大小可配置
- 连接池大小可调整

---

## 监控与日志

### 1. 前端日志

- `console.log` / `console.warn` / `console.error`
- Chrome DevTools 查看

### 2. 后端日志

- FastAPI 自动日志
- 打印到标准输出
- Railway 自动收集

### 3. 数据库监控

- 通过 AnalyticDB 控制台监控
- 查询性能分析
- 连接池状态

---

## 总结

Tab Cleaner MVP 采用**前后端分离**、**本地优先**的架构设计，通过 Chrome Extension 实现标签页管理，通过向量数据库实现语义搜索，通过 AI 服务实现智能分析。整个系统支持用户隔离、软删除、异步处理等特性，具有良好的扩展性和性能。






