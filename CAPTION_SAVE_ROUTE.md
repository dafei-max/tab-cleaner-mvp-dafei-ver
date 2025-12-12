# Caption 生成后的保存路线

## 📋 完整保存流程

### 阶段 1：AI 生成 Caption

```
auto_caption.py: _process_caption_task()
    ↓
调用 Qwen-VL API
    ↓
enrich_item_with_caption()
    ├─ 生成 image_caption（图片描述）
    ├─ 提取 dominant_colors（主要颜色）
    ├─ 提取 style_tags（风格标签）
    ├─ 提取 object_tags（物体标签）
    └─ 生成 caption_embedding（文本向量）
```

**关键代码：**
- `backend/app/search/auto_caption.py:237-241` - 调用 AI 生成
- `backend/app/search/caption.py:437-605` - 生成 caption 和标签

---

### 阶段 2：保存到数据库（PostgreSQL/VectorDB）

```
_process_caption_task()
    ↓
_update_item_caption_in_db()
    ├─ 检查数据库字段是否存在（image_caption）
    ├─ 如果存在新字段：
    │   └─ UPDATE 数据库表：
    │       ├─ image_caption (TEXT)
    │       ├─ caption_embedding (vector(1024))
    │       ├─ dominant_colors (TEXT[])
    │       ├─ style_tags (TEXT[])
    │       └─ object_tags (TEXT[])
    └─ 如果不存在（向后兼容）：
        └─ 保存到 metadata (JSONB)
```

**关键代码：**
- `backend/app/search/auto_caption.py:39-172` - 数据库更新函数
- `backend/app/search/auto_caption.py:255-263` - 调用更新函数

**数据库表结构：**
```sql
-- 新字段（推荐）
image_caption TEXT
caption_embedding vector(1024)
dominant_colors TEXT[]
style_tags TEXT[]
object_tags TEXT[]

-- 兼容字段（旧版本）
metadata JSONB {
  "caption": "...",
  "dominant_colors": [...],
  "style_tags": [...],
  "object_tags": [...]
}
```

---

### 阶段 3：WebSocket 实时推送

```
_update_item_caption_in_db()
    ↓
broadcast_caption_updates([caption_item], user_id)
    ↓
main.py: WebSocket 连接管理
    ├─ 查找所有连接到该 user_id 的 WebSocket 客户端
    └─ 发送 JSON 消息：
        {
          "type": "caption_ready",
          "url": "...",
          "image_caption": "...",
          "style_tags": [...],
          "object_tags": [...],
          "dominant_colors": [...]
        }
```

**关键代码：**
- `backend/app/search/auto_caption.py:138-164` - 发送 WebSocket 通知
- `backend/app/main.py:200-220` - WebSocket 广播函数

---

### 阶段 4：前端接收（Background Script）

```
background.js: WebSocket 连接
    ↓
captionWs.onmessage
    ↓
解析 JSON 消息
    ↓
chrome.tabs.sendMessage(tab.id, { 
  action: 'caption-ready', 
  payload: data 
})
```

**关键代码：**
- `frontend/public/assets/background.js:41-55` - WebSocket 消息处理

---

### 阶段 5：Content Script 转发

```
content.js: chrome.runtime.onMessage
    ↓
监听 'caption-ready' 消息
    ↓
window.postMessage({
  type: 'TAB_CLEANER_CAPTION_PUSH',
  payload: data
})
```

**关键代码：**
- `frontend/public/assets/content.js` - 消息转发

---

### 阶段 6：页面上下文处理（Eagle Storage）

```
eagle_storage.js: window.addEventListener('message')
    ↓
监听 'TAB_CLEANER_CAPTION_PUSH'
    ↓
提取数据：
    ├─ url
    ├─ image_caption
    ├─ style_tags
    ├─ object_tags
    └─ dominant_colors
    ↓
updateImageCaption(hash, image_caption, style_tags, object_tags, dominant_colors)
    ├─ 从 IndexedDB 读取图片数据
    ├─ 更新新字段（DB_VERSION 3+）：
    │   ├─ image_caption
    │   ├─ style_tags
    │   ├─ object_tags
    │   └─ dominant_colors
    ├─ 更新兼容字段（向后兼容）：
    │   ├─ quickCaption = image_caption
    │   └─ tags = [...style_tags, ...object_tags]
    └─ 保存回 IndexedDB
```

**关键代码：**
- `frontend/public/assets/eagle_storage.js:222-243` - 监听 WebSocket 推送
- `frontend/public/assets/eagle_storage.js:682-710` - 更新 IndexedDB

---

### 阶段 7：PersonalSpace 更新 Sessions

```
PersonalSpace.jsx: chrome.runtime.onMessage
    ↓
监听 'caption-ready' 消息
    ↓
方案 C（混合方案）：
    ├─ 步骤 1：如果 WebSocket 消息包含完整数据
    │   └─ 直接更新 sessions（Chrome Storage Local）
    └─ 步骤 2：如果数据不完整
        └─ 累积到待拉取列表
            └─ 防抖 500ms
                └─ 批量拉取 /api/v1/search/batch-captions
                    └─ 更新 sessions
```

**关键代码：**
- `frontend/src/screens/PersonalSpace/PersonalSpace.jsx:523-660` - Caption 更新监听

**Sessions 数据结构（Chrome Storage Local）：**
```javascript
{
  sessions: [
    {
      id: "session_123",
      opengraphData: [
        {
          url: "...",
          image_caption: "...",      // ✅ 保存 caption
          style_tags: [...],          // ✅ 保存标签
          object_tags: [...],         // ✅ 保存标签
          dominant_colors: [...]      // ✅ 保存颜色
        }
      ]
    }
  ]
}
```

---

## 📊 完整保存路线图

```
┌─────────────────────────────────────────────────────────────┐
│ 阶段 1: AI 生成                                              │
│ auto_caption.py: _process_caption_task()                    │
│   └─ enrich_item_with_caption()                              │
│       ├─ image_caption                                       │
│       ├─ dominant_colors                                     │
│       ├─ style_tags                                          │
│       ├─ object_tags                                         │
│       └─ caption_embedding                                  │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 2: 保存到数据库                                         │
│ _update_item_caption_in_db()                                 │
│   └─ UPDATE PostgreSQL/VectorDB                             │
│       ├─ image_caption (TEXT)                               │
│       ├─ caption_embedding (vector(1024))                   │
│       ├─ dominant_colors (TEXT[])                           │
│       ├─ style_tags (TEXT[])                                │
│       └─ object_tags (TEXT[])                               │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 3: WebSocket 推送                                      │
│ broadcast_caption_updates()                                 │
│   └─ 发送到所有连接的客户端                                 │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 4: Background Script 接收                              │
│ background.js: captionWs.onmessage                         │
│   └─ chrome.tabs.sendMessage()                              │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 5: Content Script 转发                                │
│ content.js: chrome.runtime.onMessage                        │
│   └─ window.postMessage()                                   │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 6: IndexedDB 更新（并行）                              │
│ eagle_storage.js: window.addEventListener('message')        │
│   └─ updateImageCaption()                                   │
│       └─ 保存到 IndexedDB                                    │
│           ├─ image_caption (新字段)                         │
│           ├─ style_tags (新字段)                            │
│           ├─ object_tags (新字段)                           │
│           ├─ dominant_colors (新字段)                       │
│           ├─ quickCaption (兼容字段)                        │
│           └─ tags (兼容字段)                                 │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 7: Sessions 更新（并行）                               │
│ PersonalSpace.jsx: chrome.runtime.onMessage                 │
│   └─ 更新 sessions (Chrome Storage Local)                  │
│       └─ opengraphData[].image_caption                       │
│       └─ opengraphData[].style_tags                         │
│       └─ opengraphData[].object_tags                         │
│       └─ opengraphData[].dominant_colors                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 数据同步路径

### 路径 1：实时推送（主要路径）

```
数据库 → WebSocket → Background → Content → Eagle Storage → IndexedDB
                                              ↓
                                         PersonalSpace → Sessions
```

**特点：**
- ✅ 实时性最好
- ✅ 数据完整
- ✅ 自动同步

### 路径 2：批量拉取（兜底机制）

```
PersonalSpace 检测到数据不完整
    ↓
累积待拉取 URL（防抖 500ms）
    ↓
POST /api/v1/search/batch-captions
    ↓
从数据库批量查询
    ↓
返回结果
    ↓
更新 Sessions + IndexedDB
```

**特点：**
- ✅ 确保数据完整性
- ✅ 处理 WebSocket 失败的情况
- ⚠️ 有延迟（防抖 500ms）

### 路径 3：主动补齐（现有卡片）

```
页面加载（延迟 12 秒）
    ↓
检查所有现有卡片
    ↓
收集缺少 caption 的卡片
    ↓
批量拉取 /api/v1/search/batch-captions
    ↓
更新 Sessions + IndexedDB
```

**特点：**
- ✅ 自动补齐旧卡片
- ✅ 方便本地查询
- ⚠️ 只在页面加载时执行一次

---

## 📝 关键存储位置

| 存储位置 | 字段名 | 更新时机 | 持久化 |
|---------|--------|---------|--------|
| **PostgreSQL/VectorDB** | `image_caption`<br>`style_tags`<br>`object_tags`<br>`dominant_colors` | AI 生成后立即更新 | ✅ 永久 |
| **IndexedDB** | `image_caption`<br>`style_tags`<br>`object_tags`<br>`dominant_colors`<br>`quickCaption` (兼容)<br>`tags` (兼容) | WebSocket 推送时 | ✅ 永久 |
| **Chrome Storage Local** | `sessions[].opengraphData[].image_caption`<br>`sessions[].opengraphData[].style_tags`<br>`sessions[].opengraphData[].object_tags`<br>`sessions[].opengraphData[].dominant_colors` | WebSocket 推送时<br>批量拉取后<br>主动补齐时 | ✅ 持久化 |

---

## 🎯 数据一致性保证

1. **数据库是唯一数据源**：所有 caption 数据首先保存到 PostgreSQL/VectorDB
2. **WebSocket 实时同步**：数据库更新后立即通过 WebSocket 推送到前端
3. **批量拉取兜底**：如果 WebSocket 失败或数据不完整，前端会主动批量拉取
4. **双重更新**：前端同时更新 IndexedDB 和 Sessions，确保数据一致性
5. **字段对齐**：所有存储位置使用统一的字段名（`image_caption`、`style_tags`、`object_tags`、`dominant_colors`）

---

## 🔍 调试日志

### 后端日志

```
[AutoCaption] Processing {url}...
[Caption] Enriched item: {url}...
  - Caption: {caption}...
  - Colors: {colors}
  - Styles: {styles}
  - Objects: {objects}
[AutoCaption] ✅ WebSocket notification sent for {url}...
```

### 前端日志

```
[Eagle Storage] ✅ [CAPTION PUSH] Saved caption from backend push: {url}
[PersonalSpace] 📨 Received caption-ready notification: {url}
[PersonalSpace] ✅ Caption updated via WebSocket (real-time): {url}
[PersonalSpace] 📦 Batch fetching captions (fallback) for X URLs
[PersonalSpace] ✅ Batch caption update complete (fallback): X sessions updated
```

---

## 📚 相关文档

- `CAPTION_SYNC_FLOW.md` - 完整的数据同步流程
- `backend/app/search/auto_caption.py` - Caption 生成和数据库更新
- `backend/app/main.py` - WebSocket 广播
- `frontend/public/assets/eagle_storage.js` - IndexedDB 更新
- `frontend/src/screens/PersonalSpace/PersonalSpace.jsx` - Sessions 更新
