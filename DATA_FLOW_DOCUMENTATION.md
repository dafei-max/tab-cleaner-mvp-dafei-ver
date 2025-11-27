# 数据流文档

本文档详细说明两个核心数据流程：OpenGraph → Embedding → 保存 → 查询，以及搜索栏输入的数据流。

---

## 一、OpenGraph → Embedding → 保存 → 查询流程

### 📋 完整流程图

```
1. 页面加载阶段
   ↓
   opengraph_local.js (页面上下文)
   ├─ 提取 OpenGraph 数据（og:title, og:image, og:description 等）
   ├─ 提取 Twitter Card 数据
   ├─ 提取第一个 <img> 标签（fallback）
   └─ 保存到 Chrome Storage (recent_opengraph 缓存)
   
2. 一键清理阶段
   ↓
   background.js (Service Worker)
   ├─ 收集所有标签页
   ├─ 通过 chrome.tabs.sendMessage 发送 'fetch-opengraph' 消息
   ↓
   content.js (Content Script)
   ├─ 从 Chrome Storage 读取 recent_opengraph 缓存（优先）
   └─ 如果没有缓存，fallback 到调用 opengraph_local.js
   ↓
   background.js
   ├─ 收集所有 OpenGraph 数据
   ├─ 保存到 Chrome Storage (sessions)
   ├─ 关闭所有标签页
   ├─ 打开个人空间（立即渲染，不等待后端）
   └─ 异步发送到后端生成 embedding
   
3. Embedding 生成阶段（异步，不阻塞 UI）
   ↓
   background.js
   ├─ 批量发送到 /api/v1/search/embedding (每批 5 个)
   ↓
   backend/app/main.py → generate_embeddings()
   ├─ 检查数据库是否已有 embedding (get_opengraph_item)
   │  ├─ 有 → 直接返回，不重新生成 ✅
   │  └─ 无 → 继续生成
   ├─ 调用 process_opengraph_for_search()
   │  ├─ 生成 text_embedding (embed_text)
   │  └─ 生成 image_embedding (embed_image)
   ├─ 保存到向量数据库 (upsert_opengraph_item)
   └─ 返回 embedding 数据
   ↓
   background.js
   ├─ 更新 sessions 中的 embedding 数据
   └─ 个人空间自动刷新（通过 storage.onChanged 监听）
   
4. 查询阶段
   ↓
   用户执行搜索（见第二部分）
   ↓
   backend/app/main.py → search_content()
   ├─ 优先从向量数据库搜索 (search_by_text_embedding / search_by_image_embedding)
   └─ 如果没有结果，使用传入的 opengraph_items 进行本地搜索
```

### 📁 相关脚本文件

#### 前端脚本

1. **`frontend/public/assets/opengraph_local.js`**
   - **作用**: 在页面上下文中提取 OpenGraph 数据
   - **关键函数**:
     - `extractOpenGraphLocal()`: 提取 OG 数据
     - `window.__TAB_CLEANER_GET_OPENGRAPH()`: 暴露给 content script 的全局函数
   - **数据保存**: 通过 `window.postMessage` 发送到 content.js，然后保存到 `chrome.storage.local`

2. **`frontend/public/assets/content.js`**
   - **作用**: Content Script，处理消息传递和缓存读取
   - **关键函数**:
     - `chrome.runtime.onMessage.addListener()`: 监听 'fetch-opengraph' 消息
     - 从 `recent_opengraph` 缓存读取数据（优先）
     - 如果没有缓存，fallback 到调用 `opengraph_local.js`
   - **数据流**: `background.js` → `content.js` → `opengraph_local.js` → `chrome.storage.local`

3. **`frontend/public/assets/background.js`**
   - **作用**: Service Worker，协调整个流程
   - **关键函数**:
     - `chrome.runtime.onMessage.addListener()`: 监听 'clean-all' 消息
     - `chrome.tabs.sendMessage()`: 向每个标签页发送 'fetch-opengraph' 消息
     - `chrome.storage.local.set()`: 保存 sessions 数据
     - 异步调用 `/api/v1/search/embedding` 生成 embedding
   - **关键代码位置**:
     - 行 368-452: 收集 OpenGraph 数据
     - 行 661-744: 异步生成 embedding（不阻塞 UI）

#### 后端脚本

4. **`backend/app/main.py`**
   - **作用**: FastAPI 应用入口，处理 API 请求
   - **关键端点**:
     - `POST /api/v1/search/embedding`: 生成 embedding
     - `POST /api/v1/search/query`: 执行搜索查询
   - **关键函数**:
     - `generate_embeddings()` (行 243-409): 生成 embedding 并保存到数据库
     - `search_content()` (行 412-543): 执行搜索查询
   - **关键代码位置**:
     - 行 255-310: 优先从数据库读取 embedding
     - 行 312-315: 调用 `process_opengraph_for_search()` 生成新 embedding
     - 行 317-347: 保存到向量数据库

5. **`backend/app/search/pipeline.py`**
   - **作用**: 处理 OpenGraph 数据的 embedding 生成
   - **关键函数**:
     - `process_opengraph_for_search()`: 批量处理 OpenGraph 数据，生成 embedding
     - `_build_item_embedding()`: 为单个 item 生成 embedding

6. **`backend/app/search/embed.py`**
   - **作用**: 调用阿里云通义千问 API 生成 embedding
   - **关键函数**:
     - `embed_text()`: 生成文本 embedding
     - `embed_image()`: 生成图像 embedding

7. **`backend/app/vector_db.py`**
   - **作用**: 向量数据库操作
   - **关键函数**:
     - `get_opengraph_item()`: 从数据库读取 OpenGraph 数据（包括 embedding）
     - `upsert_opengraph_item()`: 插入或更新 OpenGraph 数据到数据库
     - `search_by_text_embedding()`: 文本向量搜索
     - `search_by_image_embedding()`: 图像向量搜索

8. **`backend/app/search/preprocess.py`**
   - **作用**: 图像预处理和文本提取
   - **关键函数**:
     - `download_image()`: 下载图像
     - `process_image()`: 处理图像（缩放、压缩、Base64 编码）
     - `extract_text_from_item()`: 从 OpenGraph item 提取文本内容

### 🔄 数据存储位置

1. **Chrome Storage (Local)**
   - `recent_opengraph`: 最近提取的 OpenGraph 数据缓存（按 URL 索引）
   - `sessions`: 所有清理会话的数据（包含 OpenGraph 数据和 embedding）
   - `opengraph_cache_*`: 按 URL 的缓存键

2. **向量数据库 (Alibaba Cloud AnalyticDB PostgreSQL)**
   - **表名**: `{ADBPG_DBNAME}.{ADBPG_NAMESPACE}.opengraph_items`
   - **字段**:
     - `url` (PRIMARY KEY)
     - `title`, `description`, `image`, `site_name`
     - `text_embedding` (vector(1024))
     - `image_embedding` (vector(1024))
     - `metadata` (JSONB)
   - **索引**:
     - `idx_opengraph_url`: URL 索引
     - `idx_text_embedding_cosine`: 文本向量索引（HNSW，余弦相似度）
     - `idx_image_embedding_cosine`: 图像向量索引（HNSW，余弦相似度）

---

## 二、搜索栏输入 → 回车 → 搜索流程

### 📋 完整流程图

```
1. 用户输入阶段
   ↓
   SearchBar.jsx (React 组件)
   ├─ <input> 元素接收用户输入
   ├─ onChange: 更新 searchQuery state
   └─ onKeyDown: 监听 Enter 键
   
2. 回车触发搜索
   ↓
   SearchBar.jsx → handleKeyDown()
   ├─ 检测到 Enter 键
   └─ 调用 onSearch() 回调
   ↓
   PersonalSpace.jsx → handleSearch()
   ├─ 调用 performSearch(searchQuery, calculateRadialLayout)
   ↓
   useSearch.js → performSearch()
   ├─ 检查数据是否已有 embedding
   │  ├─ 有 → 直接使用
   │  └─ 无 → 生成 embedding (generateEmbeddingsForData)
   ├─ 调用 searchContent(query, null, itemsToSearch)
   ↓
   api.js → searchContent()
   ├─ POST /api/v1/search/query
   ├─ 请求体: { query_text, query_image_url, opengraph_items }
   ↓
   backend/app/main.py → search_content()
   ├─ 优先从向量数据库搜索
   │  ├─ 文本搜索: embed_text() → search_by_text_embedding()
   │  └─ 图像搜索: embed_image() → search_by_image_embedding()
   ├─ 如果没有结果，使用传入的 opengraph_items 进行本地搜索
   │  └─ search_relevant_items() (本地相似度计算)
   └─ 返回搜索结果（按相似度排序）
   ↓
   useSearch.js → performSearch()
   ├─ 处理搜索结果
   ├─ 计算布局位置 (calculateRadialLayout)
   └─ 更新 searchResults state
   ↓
   PersonalSpace.jsx → handleSearch()
   ├─ 更新 opengraphData state
   └─ 触发 UI 重新渲染
```

### 📁 相关脚本文件

#### 前端脚本

1. **`frontend/src/components/SearchBar/SearchBar.jsx`**
   - **作用**: 搜索栏 UI 组件
   - **关键函数**:
     - `handleKeyDown()`: 监听键盘事件（Enter 触发搜索，Escape 清空）
     - `onChange`: 更新搜索查询文本
   - **Props**:
     - `searchQuery`: 当前搜索查询文本
     - `onSearchQueryChange`: 更新搜索查询的回调
     - `onSearch`: 执行搜索的回调
     - `onClear`: 清空搜索的回调
     - `isSearching`: 是否正在搜索

2. **`frontend/src/screens/PersonalSpace/PersonalSpace.jsx`**
   - **作用**: 个人空间主组件，协调搜索流程
   - **关键函数**:
     - `handleSearch()` (行 412-434): 执行搜索并更新 UI
     - `handleClearSearch()` (行 437-457): 清空搜索并恢复原始数据
   - **关键代码位置**:
     - 行 100: 根据视图模式选择搜索数据源
     - 行 102-110: 使用 `useSearch` hook
     - 行 1342-1344: 渲染 SearchBar 组件

3. **`frontend/src/hooks/useSearch.js`**
   - **作用**: 搜索功能 Hook，封装搜索逻辑
   - **关键函数**:
     - `performSearch()` (行 117-221): 执行搜索的核心函数
     - `generateEmbeddingsForData()` (行 42-114): 生成 embedding（如果需要）
     - `fuzzyRankLocally()` (行 22-39): 本地模糊排序（兜底方案）
     - `clearSearch()`: 清空搜索结果
   - **关键代码位置**:
     - 行 124-131: 检查数据是否已有 embedding
     - 行 136-152: 如果没有 embedding，生成新的
     - 行 154-158: 调用 `searchContent()` API
     - 行 160-173: 处理搜索结果

4. **`frontend/src/shared/api.js`**
   - **作用**: API 调用封装
   - **关键函数**:
     - `searchContent()` (行 61-76): 调用搜索 API
     - `generateEmbeddings()` (行 48-59): 调用生成 embedding API
   - **关键代码位置**:
     - 行 62-70: POST `/api/v1/search/query` 请求

#### 后端脚本

5. **`backend/app/main.py`**
   - **作用**: FastAPI 应用入口，处理搜索 API 请求
   - **关键端点**:
     - `POST /api/v1/search/query`: 执行搜索查询
   - **关键函数**:
     - `search_content()` (行 412-543): 搜索内容的核心函数
   - **关键代码位置**:
     - 行 427-475: 优先从向量数据库搜索
     - 行 479-487: 如果没有结果，使用本地搜索
     - 行 490-501: 格式化返回结果

6. **`backend/app/vector_db.py`**
   - **作用**: 向量数据库操作
   - **关键函数**:
     - `search_by_text_embedding()`: 文本向量搜索（使用 `<=>` 操作符）
     - `search_by_image_embedding()`: 图像向量搜索（使用 `<=>` 操作符）

7. **`backend/app/search/pipeline.py`**
   - **作用**: 搜索相关处理逻辑
   - **关键函数**:
     - `search_relevant_items()`: 本地相似度搜索（兜底方案）

8. **`backend/app/search/embed.py`**
   - **作用**: 调用阿里云通义千问 API 生成 embedding
   - **关键函数**:
     - `embed_text()`: 生成查询文本的 embedding
     - `embed_image()`: 生成查询图像的 embedding

### 🔄 数据流传递

1. **用户输入** → `SearchBar.jsx` → `searchQuery` state
2. **回车触发** → `SearchBar.jsx` → `handleKeyDown()` → `onSearch()` callback
3. **执行搜索** → `PersonalSpace.jsx` → `handleSearch()` → `useSearch.performSearch()`
4. **检查 embedding** → `useSearch.js` → 检查数据是否已有 embedding
5. **生成 embedding** (如果需要) → `useSearch.js` → `generateEmbeddingsForData()` → `api.generateEmbeddings()` → `/api/v1/search/embedding`
6. **调用搜索 API** → `useSearch.js` → `api.searchContent()` → `POST /api/v1/search/query`
7. **后端搜索** → `main.py` → `search_content()` → 向量数据库搜索或本地搜索
8. **返回结果** → `main.py` → 返回搜索结果（按相似度排序）
9. **处理结果** → `useSearch.js` → 计算布局位置 → 更新 `searchResults` state
10. **更新 UI** → `PersonalSpace.jsx` → `setOpengraphData()` → UI 重新渲染

---

## 三、关键数据结构和 API

### OpenGraph 数据结构

```javascript
{
  url: string,                    // 网页 URL（唯一标识）
  title: string,                  // 标题
  description: string,             // 描述
  image: string,                   // 图片 URL
  site_name: string,               // 站点名称
  tab_id: number,                  // 标签页 ID
  tab_title: string,               // 标签页标题
  text_embedding: number[],        // 文本 embedding（1024维）
  image_embedding: number[],       // 图像 embedding（1024维）
  success: boolean,                // 是否成功提取
  is_doc_card: boolean,            // 是否是文档卡片
  similarity?: number,              // 相似度分数（搜索结果）
  x?: number,                      // X 坐标（布局）
  y?: number,                      // Y 坐标（布局）
}
```

### API 端点

#### 1. `POST /api/v1/search/embedding`
- **请求体**:
  ```json
  {
    "opengraph_items": [
      {
        "url": "...",
        "title": "...",
        "description": "...",
        "image": "...",
        "site_name": "...",
        "is_doc_card": false
      }
    ]
  }
  ```
- **响应**:
  ```json
  {
    "ok": true,
    "data": [
      {
        "url": "...",
        "title": "...",
        "text_embedding": [...],
        "image_embedding": [...],
        "has_embedding": true
      }
    ]
  }
  ```

#### 2. `POST /api/v1/search/query`
- **请求体**:
  ```json
  {
    "query_text": "搜索关键词",
    "query_image_url": null,
    "opengraph_items": [...]
  }
  ```
- **响应**:
  ```json
  {
    "ok": true,
    "data": [
      {
        "url": "...",
        "title": "...",
        "similarity": 0.95,
        ...
      }
    ]
  }
  ```

---

## 四、关键优化点

1. **缓存优先**: 优先从 `recent_opengraph` 缓存读取，避免重复提取
2. **异步处理**: Embedding 生成是异步的，不阻塞 UI 渲染
3. **批量处理**: Embedding 生成和搜索都支持批量处理，提高效率
4. **数据库优先**: 搜索时优先从向量数据库查询，如果没有结果才使用本地搜索
5. **避免重复生成**: 检查数据库是否已有 embedding，避免重复生成

---

## 五、调试和日志

### 前端日志关键词
- `[Tab Cleaner Background]`: background.js 的日志
- `[Tab Cleaner Content]`: content.js 的日志
- `[OpenGraph Local]`: opengraph_local.js 的日志
- `[useSearch]`: useSearch.js 的日志
- `[PersonalSpace]`: PersonalSpace.jsx 的日志

### 后端日志关键词
- `[API]`: main.py 的 API 日志
- `[OpenGraph]`: opengraph.py 的日志
- `[VectorDB]`: vector_db.py 的日志
- `[Search]`: search 相关模块的日志




