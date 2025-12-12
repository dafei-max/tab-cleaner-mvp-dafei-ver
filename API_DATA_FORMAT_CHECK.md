# API 数据格式检查报告

## 📋 检查范围

1. 前端发送给后端的数据格式
2. 后端返回给前端的数据格式
3. WebSocket 消息格式
4. 数据库存储格式
5. 字段名称一致性

---

## ✅ 已对齐的字段

### 1. Caption 相关字段

**标准字段名**：`image_caption`, `style_tags`, `object_tags`, `dominant_colors`

**使用位置**：
- ✅ 数据库字段：`image_caption`, `style_tags`, `object_tags`, `dominant_colors`
- ✅ WebSocket 消息：`image_caption`, `style_tags`, `object_tags`, `dominant_colors`
- ✅ Batch API 返回：`image_caption`, `style_tags`, `object_tags`, `dominant_colors`
- ✅ 前端使用：`image_caption`, `style_tags`, `object_tags`, `dominant_colors`

**兼容字段**（向后兼容）：
- `quickCaption` → 映射到 `image_caption`
- `tags` → 映射到 `style_tags` + `object_tags`

---

## ⚠️ 发现的问题

### 问题 1: `enrich_item_with_caption` 返回字段名（已解决）

**位置**：`backend/app/search/caption.py` (line 589-590)

**状态**：✅ **已解决**

**说明**：
- `enrich_item_with_caption` 同时返回 `caption` 和 `image_caption` 两个字段
- 代码：`"caption": caption_text, "image_caption": caption_text,`

**但仍有风险**：
- 如果某些路径只返回 `caption`，需要确保映射

---

### 问题 2: `broadcast_caption_updates` 字段映射（已修复）

**位置**：`backend/app/main.py` (line 46-83)

**状态**：✅ **已修复**

**修复内容**：
1. 在 `generate_embeddings` 中，确保字段映射完成（line 437-448）
2. 在 `broadcast_caption_updates` 中，添加字段映射和空值检查（line 59-66）

**修复后代码**：
```python
# ✅ 确保字段映射完成
for item in all_enriched_items:
    if "caption" in item and ("image_caption" not in item or not item.get("image_caption")):
        item["image_caption"] = item.get("caption", "")
    # 确保其他字段存在
    if "style_tags" not in item:
        item["style_tags"] = []
    if "object_tags" not in item:
        item["object_tags"] = []
    if "dominant_colors" not in item:
        item["dominant_colors"] = []

# 在 broadcast_caption_updates 中
image_caption = item.get("image_caption") or item.get("caption") or ""
# 只发送有 Caption 的更新
if not image_caption:
    continue
```

---

## ✅ 已修复的问题

### 修复 1: 字段映射在 `broadcast_caption_updates` 前完成

**位置**：`backend/app/main.py` (line 437-448)

**修复内容**：
- 在合并 `all_enriched_items` 后，立即进行字段映射
- 确保所有项都有 `image_caption` 字段
- 确保其他字段（`style_tags`, `object_tags`, `dominant_colors`）存在

### 修复 2: `broadcast_caption_updates` 中添加字段映射和空值检查

**位置**：`backend/app/main.py` (line 59-66)

**修复内容**：
- 添加字段映射：`image_caption = item.get("image_caption") or item.get("caption") or ""`
- 添加空值检查：只发送有 Caption 的更新
- 确保所有字段都有默认值

---

## 📊 数据格式总结

### 1. 前端 → 后端 (`/api/v1/search/embedding`)

**请求格式**：
```json
{
  "opengraph_items": [
    {
      "url": "https://example.com",
      "title": "...",
      "description": "...",
      "image": "https://example.com/image.jpg",
      "image_caption": null,  // 可选，通常为 null
      "style_tags": null,      // 可选
      "object_tags": null,    // 可选
      "dominant_colors": null // 可选
    }
  ]
}
```

### 2. 后端 → 前端 (WebSocket `/ws/caption`)

**消息格式**：
```json
{
  "type": "caption_ready",
  "user_id": "device_xxx",
  "url": "https://example.com",
  "image_caption": "A beautiful landscape...",
  "style_tags": ["modern", "minimalist"],
  "object_tags": ["mountain", "lake"],
  "dominant_colors": ["#FF5733", "#33FF57"],
  "image": "https://example.com/image.jpg"
}
```

### 3. 后端 → 前端 (`/api/v1/search/batch-captions`)

**响应格式**：
```json
{
  "ok": true,
  "results": [
    {
      "url": "https://example.com",
      "image_caption": "A beautiful landscape...",
      "style_tags": ["modern", "minimalist"],
      "object_tags": ["mountain", "lake"],
      "dominant_colors": ["#FF5733", "#33FF57"],
      // 兼容字段
      "quickCaption": "A beautiful landscape...",
      "tags": ["modern", "minimalist", "mountain", "lake"]
    }
  ],
  "count": 1
}
```

### 4. 数据库存储格式

**字段名**：
- `image_caption` (TEXT)
- `style_tags` (TEXT[])
- `object_tags` (TEXT[])
- `dominant_colors` (TEXT[])
- `caption_embedding` (vector(1024))

---

## ✅ 检查清单

- [x] 数据库字段名：`image_caption`, `style_tags`, `object_tags`, `dominant_colors`
- [x] WebSocket 消息字段名：`image_caption`, `style_tags`, `object_tags`, `dominant_colors`
- [x] Batch API 返回字段名：`image_caption`, `style_tags`, `object_tags`, `dominant_colors`
- [x] 前端使用字段名：`image_caption`, `style_tags`, `object_tags`, `dominant_colors`
- [x] URL 规范化：所有接口都使用 `_normalize_url_for_storage`
- [x] ✅ `enrich_item_with_caption` 同时返回 `caption` 和 `image_caption`
- [x] ✅ `broadcast_caption_updates` 已添加字段映射和空值检查
- [x] ✅ `generate_embeddings` 中已确保字段映射完成

---

## 🎯 总结

### ✅ 已完成

1. **字段映射**：在 `generate_embeddings` 和 `broadcast_caption_updates` 中都已添加字段映射
2. **空值检查**：`broadcast_caption_updates` 只发送有 Caption 的更新
3. **字段对齐**：所有接口都使用 `image_caption` 作为主字段名

### 📝 数据格式规范

**标准字段名**（所有接口统一）：
- `image_caption` - 图片描述（主字段）
- `style_tags` - 风格标签（数组）
- `object_tags` - 物体标签（数组）
- `dominant_colors` - 主要颜色（数组）

**兼容字段名**（向后兼容，但优先使用标准字段）：
- `quickCaption` → 映射到 `image_caption`
- `tags` → 映射到 `style_tags` + `object_tags`

### 🔍 验证方法

1. **检查 WebSocket 消息**：确保包含 `image_caption` 字段
2. **检查 Batch API 返回**：确保返回 `image_caption` 字段
3. **检查数据库存储**：确保使用 `image_caption` 字段名
4. **检查前端使用**：确保使用 `image_caption` 字段名
