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

### 问题 1: `enrich_item_with_caption` 返回字段名不一致

**位置**：`backend/app/search/caption.py`

**问题**：
- `enrich_item_with_caption` 返回的是 `caption` 字段
- 但数据库和 API 使用的是 `image_caption` 字段

**影响**：
- 在 `broadcast_caption_updates` 中，使用 `item.get("image_caption")` 可能获取不到值
- 在 `batch_upsert_items` 中，字段映射逻辑需要处理这个差异

**当前处理**：
在 `batch_upsert_items` 中已有映射逻辑（line 1080-1084）：
```python
# 将生成的字段映射到正确的字段名（enrich_item_with_caption 返回的是 "caption"，需要映射到 "image_caption"）
for enriched_item in enriched_items:
    # enrich_item_with_caption 返回 "caption"，需要映射到 "image_caption"
    if "caption" in enriched_item:
        if "image_caption" not in enriched_item or not enriched_item.get("image_caption"):
            enriched_item["image_caption"] = enriched_item.get("caption", "")
```

**但问题**：
- `broadcast_caption_updates` 中直接使用 `item.get("image_caption")`，可能获取不到值
- 需要确保在调用 `broadcast_caption_updates` 前，字段已经映射

---

### 问题 2: `broadcast_caption_updates` 可能获取不到 Caption

**位置**：`backend/app/main.py` (line 46-83)

**问题**：
```python
payload = {
    "type": "caption_ready",
    "user_id": user_id,
    "url": item.get("url"),
    "image_caption": item.get("image_caption"),  # ⚠️ 可能为 None
    "style_tags": item.get("style_tags", []),
    "object_tags": item.get("object_tags", []),
    "dominant_colors": item.get("dominant_colors", []),
    "image": item.get("image"),
}
```

**原因**：
- `all_enriched_items` 可能包含 `caption` 字段而不是 `image_caption`
- 字段映射在 `batch_upsert_items` 中，但 `broadcast_caption_updates` 在保存前调用

**影响**：
- WebSocket 消息可能不包含 Caption 数据
- 前端无法实时更新 Caption

---

## 🔧 修复建议

### 修复 1: 确保字段映射在 `broadcast_caption_updates` 前完成

**位置**：`backend/app/main.py` (line 427-434)

**修改**：
```python
# 合并结果：已有的 + 新生成的
all_enriched_items = items_already_done + enriched_items
print(f"[API] Total enriched items: {len(all_enriched_items)}")

# ✅ 修复：确保字段映射完成（enrich_item_with_caption 返回 "caption"，需要映射到 "image_caption"）
for item in all_enriched_items:
    if "caption" in item and ("image_caption" not in item or not item.get("image_caption")):
        item["image_caption"] = item.get("caption", "")
    # 确保其他字段也存在
    if "style_tags" not in item:
        item["style_tags"] = []
    if "object_tags" not in item:
        item["object_tags"] = []
    if "dominant_colors" not in item:
        item["dominant_colors"] = []

# 🆕 推送 caption 更新（如果有 WS 连接）
try:
    await broadcast_caption_updates(all_enriched_items, normalized_user_id)
except Exception as e:
    print(f"[API] ⚠️ Broadcast caption updates failed: {e}")
```

---

### 修复 2: 在 `broadcast_caption_updates` 中添加字段映射

**位置**：`backend/app/main.py` (line 46-83)

**修改**：
```python
async def broadcast_caption_updates(items: list[dict], user_id: str):
  """将 caption 结果推送给所有活跃的 WS 客户端"""
  if not _ws_clients or not items:
    if not _ws_clients:
      print(f"[WS] ⚠️ No WebSocket clients connected, skipping broadcast for {len(items)} items")
    return
  
  print(f"[WS] 📡 Broadcasting {len(items)} caption updates to {len(_ws_clients)} clients (user_id: {user_id})")
  
  dead = set()
  success_count = 0
  for ws in list(_ws_clients):
    try:
      for item in items:
        # ✅ 修复：确保字段映射（enrich_item_with_caption 返回 "caption"，需要映射到 "image_caption"）
        image_caption = item.get("image_caption") or item.get("caption") or ""
        style_tags = item.get("style_tags", [])
        object_tags = item.get("object_tags", [])
        dominant_colors = item.get("dominant_colors", [])
        
        payload = {
          "type": "caption_ready",
          "user_id": user_id,
          "url": item.get("url"),
          "image_caption": image_caption,
          "style_tags": style_tags,
          "object_tags": object_tags,
          "dominant_colors": dominant_colors,
          "image": item.get("image"),
        }
        await ws.send_json(payload)
        success_count += 1
        print(f"[WS] ✅ Sent caption update for {item.get('url', '')[:50]}... to client")
    except Exception as e:
      print(f"[WS] ⚠️ send failed for client: {e}")
      dead.add(ws)
  
  for ws in dead:
    _ws_clients.discard(ws)
    print(f"[WS] 🗑️ Removed dead client (remaining: {len(_ws_clients)})")
  
  if success_count > 0:
    print(f"[WS] ✅ Successfully broadcasted {success_count} messages to {len(_ws_clients)} clients")
```

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
- [ ] ⚠️ `enrich_item_with_caption` 返回 `caption` 需要映射到 `image_caption`
- [ ] ⚠️ `broadcast_caption_updates` 需要处理字段映射

---

## 🎯 建议

1. **立即修复**：在 `broadcast_caption_updates` 中添加字段映射
2. **长期优化**：修改 `enrich_item_with_caption` 直接返回 `image_caption` 字段
3. **统一规范**：所有 Caption 相关字段统一使用 `image_caption` 作为主字段名
