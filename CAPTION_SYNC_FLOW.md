# Caption 数据同步流程文档

## 📋 目录

1. [完整数据流](#完整数据流)
2. [关键脚本和函数](#关键脚本和函数)
3. [数据格式对齐检查](#数据格式对齐检查)
4. [本地缓存机制](#本地缓存机制)

---

## 🔄 完整数据流

### 阶段 1：数据保存和 Caption 生成触发

```
用户清理标签页
    ↓
background.js: 收集 OpenGraph 数据
    ↓
POST /api/v1/search/embedding
    ↓
main.py: generate_embeddings()
    ├─ 生成 text_embedding 和 image_embedding
    ├─ batch_upsert_items() → 保存到 vectordb
    └─ batch_enqueue_caption_tasks() → 入队 Caption 任务
```

**关键代码位置：**
- `backend/app/main.py:277-540` - `/api/v1/search/embedding` 端点
- `backend/app/main.py:462-480` - Caption 任务入队

---

### 阶段 2：异步 Caption 生成

```
auto_caption.py: _caption_worker (后台工作线程)
    ↓
从队列取任务
    ↓
检查是否已有 Caption（避免重复）
    ├─ 检查 item 中是否有 image_caption
    └─ 查询数据库检查是否已有 caption
    ↓
调用 Qwen-VL API 生成 Caption
    ├─ enrich_item_with_caption()
    ├─ 生成 image_caption
    ├─ 提取 dominant_colors
    ├─ 提取 style_tags
    └─ 提取 object_tags
    ↓
_update_item_caption_in_db()
    ├─ 更新数据库字段：
    │   ├─ image_caption (TEXT)
    │   ├─ caption_embedding (vector(1024))
    │   ├─ dominant_colors (TEXT[])
    │   ├─ style_tags (TEXT[])
    │   └─ object_tags (TEXT[])
    └─ 发送 WebSocket 通知
```

**关键代码位置：**
- `backend/app/search/auto_caption.py:248-275` - 工作线程
- `backend/app/search/auto_caption.py:175-246` - 任务处理
- `backend/app/search/auto_caption.py:39-172` - 数据库更新

---

### 阶段 3：WebSocket 实时推送（方案 C：混合方案）

```
auto_caption.py: _update_item_caption_in_db()
    ↓
broadcast_caption_updates([caption_item], user_id)
    ↓
main.py: broadcast_caption_updates()
    ├─ 构造 payload:
    │   ├─ type: "caption_ready"
    │   ├─ user_id: user_id
    │   ├─ url: url
    │   ├─ image_caption: caption
    │   ├─ style_tags: [...]
    │   ├─ object_tags: [...]
    │   └─ dominant_colors: [...]
    └─ ws.send_json(payload) → 推送到所有连接的客户端
    ↓
background.js: captionWs.onmessage
    ├─ 解析 JSON 数据
    └─ chrome.tabs.sendMessage(tab.id, { action: 'caption-ready', payload: data })
    ↓
【路径 A：PersonalSpace 页面】
PersonalSpace.jsx: chrome.runtime.onMessage
    ├─ 步骤 1：检查数据完整性
    │   └─ 如果数据完整 → 直接更新 sessions ✅
    └─ 步骤 2：如果数据不完整 → 累积到待拉取列表
        └─ 防抖 500ms → 批量拉取

【路径 B：普通网页（通过 content script）】
content.js: chrome.runtime.onMessage
    └─ window.postMessage({ type: 'TAB_CLEANER_CAPTION_PUSH', payload: data })
    ↓
eagle_storage.js: window.addEventListener('message')
    ├─ 更新 IndexedDB: updateImageCaption(hash, image_caption, tags)
    └─ 如果是 Pinterest → updatePinterestCardTitle()
```

**关键代码位置：**
- `backend/app/main.py:46-69` - WebSocket 推送函数
- `backend/app/search/auto_caption.py:138-164` - 发送通知
- `frontend/public/assets/background.js:41-55` - WebSocket 客户端
- `frontend/public/assets/content.js:1284-1291` - Content Script 转发
- `frontend/public/assets/eagle_storage.js:205-226` - 页面上下文接收
- `frontend/src/screens/PersonalSpace/PersonalSpace.jsx:523-650` - PersonalSpace 接收和更新

---

### 阶段 4：批量拉取兜底（方案 C）

```
PersonalSpace.jsx: 检测到数据不完整
    ↓
累积 URL 到 pendingUrls（防抖 500ms）
    ↓
POST /api/v1/search/batch-captions
    ├─ 请求: { urls: [...] }
    └─ Header: X-User-ID: user_id
    ↓
main.py: batch_get_captions()
    ├─ vector_db.get_items_by_urls(user_id, urls)
    ├─ 从数据库读取：
    │   ├─ image_caption
    │   ├─ style_tags
    │   ├─ object_tags
    │   └─ dominant_colors
    └─ 返回: { ok: true, results: [...] }
    ↓
PersonalSpace.jsx: 批量更新 sessions
    └─ updateSession(sessionId, { opengraphData: updatedData })
```

**关键代码位置：**
- `backend/app/main.py:648-717` - 批量查询 API
- `backend/app/vector_db.py:644-680` - `get_items_by_urls` 函数
- `frontend/src/screens/PersonalSpace/PersonalSpace.jsx:576-650` - 批量拉取逻辑

---

## 🔧 关键脚本和函数

### 后端脚本

| 文件 | 函数/类 | 作用 |
|------|---------|------|
| `backend/app/main.py` | `broadcast_caption_updates()` | WebSocket 推送 caption 数据 |
| `backend/app/main.py` | `batch_get_captions()` | 批量查询 caption API |
| `backend/app/search/auto_caption.py` | `start_caption_worker()` | 启动 Caption 工作线程 |
| `backend/app/search/auto_caption.py` | `_caption_worker()` | 工作线程（从队列取任务） |
| `backend/app/search/auto_caption.py` | `_process_caption_task()` | 处理单个 Caption 任务 |
| `backend/app/search/auto_caption.py` | `_update_item_caption_in_db()` | 更新数据库并发送通知 |
| `backend/app/search/auto_caption.py` | `enqueue_caption_task()` | 入队单个任务 |
| `backend/app/search/auto_caption.py` | `batch_enqueue_caption_tasks()` | 批量入队任务 |
| `backend/app/vector_db.py` | `get_items_by_urls()` | 批量查询数据库（包含 caption 字段） |
| `backend/app/vector_db.py` | `upsert_opengraph_item()` | 插入/更新数据（包含 caption 字段） |

### 前端脚本

| 文件 | 函数/事件 | 作用 |
|------|----------|------|
| `frontend/public/assets/background.js` | `connectCaptionWs()` | 连接 WebSocket |
| `frontend/public/assets/background.js` | `captionWs.onmessage` | 接收 WebSocket 消息 |
| `frontend/public/assets/content.js` | `chrome.runtime.onMessage` (caption-ready) | 转发消息到页面上下文 |
| `frontend/public/assets/eagle_storage.js` | `window.addEventListener('message')` | 接收页面消息并更新 IndexedDB |
| `frontend/public/assets/eagle_storage.js` | `updateImageCaption()` | 更新 IndexedDB 缓存 |
| `frontend/src/screens/PersonalSpace/PersonalSpace.jsx` | `useEffect` (caption-ready) | 监听 caption 更新 |
| `frontend/src/screens/PersonalSpace/PersonalSpace.jsx` | `handleCaptionReady()` | 处理 caption 更新消息 |

---

## ✅ 数据格式对齐检查

### 数据库字段（vectordb）

```sql
-- 表结构：cleantab.opengraph_items_v2
image_caption TEXT,              -- ✅ 主字段
caption_embedding vector(1024),  -- Caption embedding
dominant_colors TEXT[],          -- 颜色数组
style_tags TEXT[],               -- 风格标签数组
object_tags TEXT[]               -- 物体标签数组
```

### WebSocket 推送格式

```json
{
  "type": "caption_ready",
  "user_id": "user123",
  "url": "https://example.com",
  "image_caption": "一张红色金属户外椅...",
  "style_tags": ["modern", "minimalist"],
  "object_tags": ["chair", "furniture"],
  "dominant_colors": ["#FF0000", "#FFFFFF"],
  "image": "https://example.com/image.jpg"
}
```

**字段对齐：** ✅ 完全对齐

### 批量查询 API 返回格式

```json
{
  "ok": true,
  "results": [
    {
      "url": "https://example.com",
      "image_caption": "一张红色金属户外椅...",
      "style_tags": ["modern", "minimalist"],
      "object_tags": ["chair", "furniture"],
      "dominant_colors": ["#FF0000", "#FFFFFF"],
      "quickCaption": "一张红色金属户外椅...",  // 兼容字段
      "tags": ["modern", "minimalist", "chair", "furniture"]  // 兼容字段
    }
  ],
  "count": 1
}
```

**字段对齐：** ✅ 已修复（`get_items_by_urls` 现在包含 caption 字段）

### 前端 sessions 数据格式

```javascript
{
  id: "session_123",
  name: "洗衣筐1",
  opengraphData: [
    {
      url: "https://example.com",
      title: "Example",
      image_caption: "一张红色金属户外椅...",  // ✅ 与数据库字段名一致
      style_tags: ["modern", "minimalist"],     // ✅ 与数据库字段名一致
      object_tags: ["chair", "furniture"],      // ✅ 与数据库字段名一致
      dominant_colors: ["#FF0000", "#FFFFFF"]   // ✅ 与数据库字段名一致
    }
  ]
}
```

**字段对齐：** ✅ 完全对齐

---

## 💾 本地缓存机制

### 1. Chrome Storage Local（sessions 数据）

**存储位置：** `chrome.storage.local`

**数据结构：**
```javascript
{
  sessions: [
    {
      id: "session_123",
      opengraphData: [
        {
          url: "...",
          image_caption: "...",  // ✅ 缓存 caption
          style_tags: [...],     // ✅ 缓存 tags
          object_tags: [...],    // ✅ 缓存 tags
          dominant_colors: [...] // ✅ 缓存颜色
        }
      ]
    }
  ]
}
```

**更新时机：**
- WebSocket 推送时立即更新
- 批量拉取后更新
- 用户操作时更新

**缓存优势：**
- 页面刷新后数据保留
- 离线时可以使用缓存数据
- 本地搜索可以使用缓存数据

### 2. IndexedDB（Eagle Storage）

**存储位置：** `tab_cleaner_images` (IndexedDB)

**数据结构：**
```javascript
{
  hash: "url_hash",
  originalUrl: "https://example.com",
  dataUrl: "data:image/jpeg;base64,...",
  colors: ["#FF0000", "#FFFFFF"],
  // ✅ 新字段（与数据库字段名一致，DB_VERSION 3+）
  image_caption: "一张红色金属户外椅...",  // ✅ 主字段
  style_tags: ["modern", "minimalist"],     // ✅ 风格标签
  object_tags: ["chair", "furniture"],      // ✅ 物体标签
  dominant_colors: ["#FF0000", "#FFFFFF"],  // ✅ 主要颜色
  // ⚠️ 兼容字段（向后兼容，但优先使用新字段）
  quickCaption: "一张红色金属户外椅...",  // 兼容旧代码
  tags: ["modern", "chair"],              // 兼容旧代码（包含 style_tags + object_tags）
  dateTime: "2024-01-01T00:00:00.000Z",
  timestamp: 1234567890
}
```

**更新时机：**
1. **图片保存时**：生成本地 caption（占位符）
   - `saveImage()` → `generateQuickCaption()` → 本地生成占位符
   - 同时保存到 `image_caption` 和 `quickCaption`（兼容）
   - 异步调用 API 生成更好的 caption（通过队列）

2. **WebSocket 推送时**：更新真实 caption
   - `eagle_storage.js` 监听 `TAB_CLEANER_CAPTION_PUSH` 消息
   - 调用 `updateImageCaption(hash, image_caption, style_tags, object_tags, dominant_colors)` 更新 IndexedDB
   - ✅ 同时更新新字段和兼容字段
   - 同时更新 Pinterest 卡片标题（如果是 Pinterest 页面）

3. **批量拉取后**：通过 `enrichSessionImagesFromVectordb()` 更新

**字段对齐状态：**
- ✅ **已对齐**：IndexedDB 现在使用 `image_caption`、`style_tags`、`object_tags`、`dominant_colors`（DB_VERSION 3+）
- ✅ **向后兼容**：同时保留 `quickCaption` 和 `tags` 字段
- ✅ **同步机制**：IndexedDB 的 caption 会通过 WebSocket 推送同步到 sessions

**关键代码位置：**
- `frontend/public/assets/eagle_storage.js:682-710` - `updateImageCaption()` 函数（已更新支持新字段）
- `frontend/public/assets/eagle_storage.js:692-756` - `saveImage()` 函数（已更新支持新字段）
- `frontend/public/assets/eagle_storage.js:200-226` - WebSocket 推送处理（已更新）

**缓存流程：**
```
WebSocket 推送
    ↓
eagle_storage.js: 监听 TAB_CLEANER_CAPTION_PUSH
    ↓
updateImageCaption(hash, image_caption, style_tags, object_tags, dominant_colors)
    ├─ 从 IndexedDB 读取图片数据
    ├─ 更新新字段（与数据库字段名一致）：
    │   ├─ image_caption = image_caption
    │   ├─ style_tags = style_tags
    │   ├─ object_tags = object_tags
    │   └─ dominant_colors = dominant_colors
    ├─ 更新兼容字段（向后兼容）：
    │   ├─ quickCaption = image_caption
    │   └─ tags = [...style_tags, ...object_tags]
    └─ 保存回 IndexedDB
    ↓
如果是 Pinterest 页面 → updatePinterestCardTitle()
    ↓
触发 UI 更新事件
```

---

## 🔍 数据格式对齐总结

### ✅ 已对齐的字段

| 位置 | 字段名 | 状态 |
|------|--------|------|
| 数据库 | `image_caption` | ✅ |
| WebSocket | `image_caption` | ✅ |
| 批量查询 API | `image_caption` | ✅ |
| 前端 sessions | `image_caption` | ✅ |
| 数据库 | `style_tags` | ✅ |
| WebSocket | `style_tags` | ✅ |
| 批量查询 API | `style_tags` | ✅ |
| 前端 sessions | `style_tags` | ✅ |
| 数据库 | `object_tags` | ✅ |
| WebSocket | `object_tags` | ✅ |
| 批量查询 API | `object_tags` | ✅ |
| 前端 sessions | `object_tags` | ✅ |
| 数据库 | `dominant_colors` | ✅ |
| WebSocket | `dominant_colors` | ✅ |
| 批量查询 API | `dominant_colors` | ✅ |
| 前端 sessions | `dominant_colors` | ✅ |

### ⚠️ 需要注意的兼容字段

| 位置 | 字段名 | 用途 | 状态 |
|------|--------|------|------|
| 批量查询 API | `quickCaption` | 向后兼容 | ✅ 兼容 |
| 批量查询 API | `tags` | 向后兼容 | ✅ 兼容 |
| IndexedDB | `quickCaption` | 本地缓存 | ⚠️ 旧字段名 |
| IndexedDB | `tags` | 本地缓存 | ⚠️ 旧字段名 |

**处理方式：**
- 前端优先使用 `image_caption`，如果没有则使用 `quickCaption`（向后兼容）
- IndexedDB 的 `quickCaption` 会同步到 sessions 的 `image_caption`

---

## 🚀 优化建议

### 1. 统一 IndexedDB 字段名

建议将 IndexedDB 的 `quickCaption` 和 `tags` 迁移到 `image_caption`、`style_tags`、`object_tags`，保持与数据库一致。

### 2. 添加缓存检查

在批量拉取前，先检查本地 sessions 缓存，避免不必要的 API 请求。

### 3. 添加调试日志

在关键节点添加日志，便于排查数据同步问题。

---

## 📝 验证步骤

### 1. 检查数据库字段

```sql
SELECT url, image_caption, style_tags, object_tags, dominant_colors
FROM cleantab.opengraph_items_v2
WHERE user_id = 'your_user_id'
  AND image_caption IS NOT NULL
LIMIT 5;
```

### 2. 检查 WebSocket 推送

在浏览器控制台查看：
```javascript
// background.js 应该输出：
[Background][WS] ✅ Connected
[Background][WS] 📨 Received: { type: 'caption_ready', image_caption: '...', ... }
```

### 3. 检查前端接收

在 PersonalSpace 控制台查看：
```javascript
[PersonalSpace] 📨 Received caption-ready notification: { url: '...', hasCaption: true, ... }
[PersonalSpace] ✅ Caption updated via WebSocket: ...
```

### 4. 检查批量拉取

```javascript
[PersonalSpace] 📦 Batch fetching captions (fallback) for X URLs
[PersonalSpace] ✅ Batch caption update complete: X sessions updated
```

---

## 🎯 总结

### ✅ 数据格式对齐检查结果

**数据库字段（vectordb）：**
- ✅ `image_caption TEXT` - 主字段
- ✅ `style_tags TEXT[]` - 风格标签数组
- ✅ `object_tags TEXT[]` - 物体标签数组
- ✅ `dominant_colors TEXT[]` - 颜色数组

**WebSocket 推送格式：**
- ✅ 使用 `image_caption`（与数据库一致）
- ✅ 使用 `style_tags`（与数据库一致）
- ✅ 使用 `object_tags`（与数据库一致）
- ✅ 使用 `dominant_colors`（与数据库一致）

**批量查询 API 返回格式：**
- ✅ 使用 `image_caption`（主字段）
- ✅ 使用 `style_tags`、`object_tags`、`dominant_colors`
- ✅ 包含兼容字段 `quickCaption` 和 `tags`（向后兼容）
- ✅ **已修复**：`get_items_by_urls` 现在包含所有 caption 相关字段

**前端 sessions 数据格式：**
- ✅ 使用 `image_caption`（与数据库一致）
- ✅ 使用 `style_tags`、`object_tags`、`dominant_colors`（与数据库一致）

**IndexedDB 缓存格式：**
- ⚠️ 使用 `quickCaption` 和 `tags`（旧字段名，但会同步到 sessions）
- ✅ WebSocket 推送时会更新 IndexedDB 缓存

### ✅ 本地缓存检查结果

**1. Chrome Storage Local（sessions）：**
- ✅ **有缓存**：存储完整的 caption 和 tags 数据
- ✅ **字段名**：`image_caption`、`style_tags`、`object_tags`、`dominant_colors`
- ✅ **更新时机**：WebSocket 推送时、批量拉取后、用户操作时
- ✅ **持久化**：页面刷新后数据保留

**2. IndexedDB（Eagle Storage）：**
- ✅ **有缓存**：存储图片数据和 caption
- ✅ **字段名（DB_VERSION 3+）**：`image_caption`、`style_tags`、`object_tags`、`dominant_colors`（已对齐）
- ✅ **兼容字段**：同时保留 `quickCaption` 和 `tags`（向后兼容）
- ✅ **更新时机**：
  - 图片保存时生成本地占位符（保存到新字段）
  - WebSocket 推送时更新真实 caption（更新新字段）
  - 批量拉取后更新（更新新字段）
- ✅ **持久化**：永久保存，不受页面刷新影响
- ✅ **字段对齐**：已与数据库字段名完全对齐（DB_VERSION 3+）

### ✅ 流程完整性检查

**数据流完整性：**
1. ✅ 数据保存 → `batch_upsert_items()` → 保存到 vectordb
2. ✅ Caption 生成 → `_process_caption_task()` → 调用 Qwen-VL API
3. ✅ 数据库更新 → `_update_item_caption_in_db()` → 更新字段
4. ✅ WebSocket 推送 → `broadcast_caption_updates()` → 实时推送
5. ✅ 前端接收 → `PersonalSpace.jsx` / `eagle_storage.js` → 更新 UI
6. ✅ 批量拉取兜底 → `batch_get_captions()` → 确保数据完整性

**消息转发链路：**
1. ✅ WebSocket → `background.js` → `chrome.tabs.sendMessage`
2. ✅ Content Script → `content.js` → `window.postMessage`
3. ✅ 页面上下文 → `eagle_storage.js` → 更新 IndexedDB
4. ✅ PersonalSpace → `PersonalSpace.jsx` → 更新 sessions

### ✅ 已修复的问题

1. ✅ **`get_items_by_urls` 缺少 caption 字段** - 已修复，现在包含所有 caption 相关字段
2. ✅ **字段名不统一** - 已统一为 `image_caption`、`style_tags`、`object_tags`、`dominant_colors`
3. ✅ **前端兼容处理** - 添加了对 `quickCaption` 的兼容支持
4. ✅ **IndexedDB 字段对齐** - 已升级到 DB_VERSION 3，使用新字段名，同时保留兼容字段

### 📊 数据格式对齐矩阵

| 位置 | image_caption | style_tags | object_tags | dominant_colors | 状态 |
|------|---------------|------------|-------------|-----------------|------|
| 数据库字段 | ✅ | ✅ | ✅ | ✅ | 完全对齐 |
| WebSocket 推送 | ✅ | ✅ | ✅ | ✅ | 完全对齐 |
| 批量查询 API | ✅ | ✅ | ✅ | ✅ | 完全对齐 |
| 前端 sessions | ✅ | ✅ | ✅ | ✅ | 完全对齐 |
| IndexedDB (v3+) | ✅ | ✅ | ✅ | ✅ | ✅ **已对齐**（同时保留兼容字段 `quickCaption` 和 `tags`） |

### 🎯 最终结论

✅ **所有关键数据格式已对齐**：数据库、WebSocket、API、前端 sessions 都使用统一的字段名

✅ **本地缓存机制完善**：
- Chrome Storage Local：缓存 sessions 数据（包含完整 caption 和 tags）
- IndexedDB：缓存图片数据（DB_VERSION 3+ 已对齐字段名，同时保留兼容字段）

✅ **流程完整且可靠**：
- 实时推送：WebSocket 优先推送完整数据
- 兜底机制：批量拉取确保数据完整性
- 本地缓存：支持离线使用和快速搜索
