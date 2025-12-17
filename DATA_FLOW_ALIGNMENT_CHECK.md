# 数据流对齐检查报告

## 📊 数据传递路径总览

```
后端生成 Caption
    ↓
WebSocket 推送
    ↓
Background 转发
    ↓
PersonalSpace 接收
    ↓
更新 Sessions + IndexedDB
```

## 1️⃣ 后端生成 Caption (auto_caption.py)

**位置**: `backend/app/search/auto_caption.py:151-157`

**数据格式**:
```python
caption_item = {
    "url": url,
    "image_caption": caption,  # ✅ 主字段
    "dominant_colors": dominant_colors if dominant_colors else [],
    "style_tags": style_tags if style_tags else [],
    "object_tags": object_tags if object_tags else [],
}
```

**✅ 状态**: 字段名正确，与数据库字段名一致

---

## 2️⃣ WebSocket 推送 (main.py)

**位置**: `backend/app/main.py:46-69`

**数据格式**:
```python
payload = {
    "type": "caption_ready",
    "user_id": user_id,
    "url": item.get("url"),
    "image_caption": item.get("image_caption"),  # ✅ 主字段
    "style_tags": item.get("style_tags", []),
    "object_tags": item.get("object_tags", []),
    "dominant_colors": item.get("dominant_colors", []),
    "image": item.get("image"),  # 额外字段
}
```

**✅ 状态**: 字段名正确，包含完整数据

---

## 3️⃣ Background 转发 (background.js)

**位置**: `frontend/public/assets/background.js:41-50`

**接收**: WebSocket 消息 `{type: 'caption_ready', ...}`

**转发格式**:
```javascript
{
  action: 'caption-ready',
  payload: data  // data 是整个 WebSocket payload
}
```

**✅ 状态**: 正确转发，payload 包含所有字段

---

## 4️⃣ PersonalSpace 接收 (PersonalSpace.jsx)

**位置**: `frontend/src/screens/PersonalSpace/PersonalSpace.jsx:797-875`

**接收格式**:
```javascript
const payload = message.payload || {};
const { url, image_caption, dominant_colors, style_tags, object_tags } = payload;
```

**更新 Sessions**:
```javascript
updatedData[idx] = {
  ...updatedData[idx],
  image_caption: image_caption || updatedData[idx].image_caption,
  dominant_colors: dominant_colors || updatedData[idx].dominant_colors || [],
  style_tags: style_tags || updatedData[idx].style_tags || [],
  object_tags: object_tags || updatedData[idx].object_tags || [],
};
```

**✅ 状态**: 字段名正确，URL 匹配已修复（规范化 + 多字段匹配）

---

## 5️⃣ 批量 API 返回 (main.py)

**位置**: `backend/app/main.py:648-729`

**返回格式**:
```python
{
    "ok": True,
    "results": [
        {
            "url": item.get("url", ""),
            "image_caption": image_caption,  # ✅ 主字段
            "style_tags": style_tags or [],
            "object_tags": object_tags or [],
            "dominant_colors": dominant_colors or [],
            # 兼容字段
            "quickCaption": image_caption,  # 向后兼容
            "tags": (style_tags or []) + (object_tags or []),  # 向后兼容
        }
    ]
}
```

**✅ 状态**: 字段名正确，包含兼容字段

---

## 6️⃣ IndexedDB 存储 (eagle_storage.js)

**位置**: `frontend/public/assets/eagle_storage.js:682-712`

**函数签名**:
```javascript
async function updateImageCaption(
  hash, 
  image_caption,      // ✅ 主字段
  style_tags = [],    // ✅ 主字段
  object_tags = [],   // ✅ 主字段
  dominant_colors = [] // ✅ 主字段
)
```

**存储格式**:
```javascript
imageData.image_caption = image_caption;
imageData.style_tags = Array.isArray(style_tags) ? style_tags : [];
imageData.object_tags = Array.isArray(object_tags) ? object_tags : [];
imageData.dominant_colors = Array.isArray(dominant_colors) ? dominant_colors : [];

// 向后兼容
imageData.quickCaption = image_caption;
imageData.tags = [...imageData.style_tags, ...imageData.object_tags];
```

**✅ 状态**: 字段名正确，包含向后兼容字段

---

## 7️⃣ Eagle Storage 监听 (eagle_storage.js)

**位置**: `frontend/public/assets/eagle_storage.js:222-243`

**接收格式**:
```javascript
const { url, image_caption, style_tags = [], object_tags = [], dominant_colors = [] } = data.payload;
```

**✅ 状态**: 字段名正确

---

## 🔍 URL 匹配对齐检查

### 问题修复历史

1. **URL 规范化**: 
   - ✅ 后端: `_normalize_url_for_storage()` 移除尾部斜杠、查询参数、锚点
   - ✅ 前端: `normalizeUrl()` 函数已添加，与后端逻辑一致

2. **多字段匹配**:
   - ✅ 前端同时匹配 `item.url` 和 `item.original_image_url`
   - ✅ 后端同时查询 `url` 字段和 `image` 字段

3. **匹配位置**:
   - ✅ WebSocket 实时更新: `PersonalSpace.jsx:820-824` (已修复)
   - ✅ 批量拉取: `PersonalSpace.jsx:418-423` (已修复)
   - ✅ 批量更新旧卡片: `PersonalSpace.jsx:397-402` (已修复)

---

## ✅ 对齐检查结果

### 字段名对齐 ✅

| 环节 | image_caption | style_tags | object_tags | dominant_colors |
|------|---------------|------------|-------------|-----------------|
| 后端生成 | ✅ | ✅ | ✅ | ✅ |
| WebSocket | ✅ | ✅ | ✅ | ✅ |
| Background | ✅ (转发) | ✅ (转发) | ✅ (转发) | ✅ (转发) |
| PersonalSpace | ✅ | ✅ | ✅ | ✅ |
| 批量 API | ✅ | ✅ | ✅ | ✅ |
| IndexedDB | ✅ | ✅ | ✅ | ✅ |

### URL 匹配对齐 ✅

| 环节 | 规范化 | 多字段匹配 |
|------|--------|-----------|
| 后端查询 | ✅ | ✅ (url + image) |
| 前端发送 | ✅ | ✅ (original_image_url 优先) |
| 前端匹配 | ✅ | ✅ (url + original_image_url) |

### 数据流完整性 ✅

1. ✅ 后端生成 → WebSocket 推送: 字段完整
2. ✅ WebSocket → Background: 正确转发
3. ✅ Background → PersonalSpace: 正确接收
4. ✅ PersonalSpace → Sessions: 正确更新
5. ✅ PersonalSpace → IndexedDB: 正确更新
6. ✅ 批量 API → PersonalSpace: 字段完整
7. ✅ 批量 API → IndexedDB: 正确更新

---

## 🎯 结论

**所有数据传递路径已对齐** ✅

- 字段名统一使用: `image_caption`, `style_tags`, `object_tags`, `dominant_colors`
- URL 规范化已实现
- 多字段匹配已实现
- 向后兼容字段已保留 (`quickCaption`, `tags`)

**实时更新机制完整** ✅

- WebSocket 推送包含完整数据
- PersonalSpace 正确接收和更新
- IndexedDB 同步更新
- 兜底机制（批量拉取）已实现



