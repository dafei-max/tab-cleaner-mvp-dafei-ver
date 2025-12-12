# Caption 生成修复总结

## 🔧 修复内容

### 1. ✅ 修复覆盖问题（关键修复）

**问题**：在 `upsert_opengraph_item` 中，使用 `image_caption = EXCLUDED.image_caption` 会覆盖数据库中已有的 Caption。

**修复**：使用 `COALESCE` 避免覆盖已有的 Caption 字段。

**位置**：`backend/app/vector_db.py` (line 538-542)

**修改前**：
```sql
image_caption = EXCLUDED.image_caption,
caption_embedding = EXCLUDED.caption_embedding,
dominant_colors = EXCLUDED.dominant_colors,
style_tags = EXCLUDED.style_tags,
object_tags = EXCLUDED.object_tags,
```

**修改后**：
```sql
-- ✅ 修复：只在传入值非空时才更新，否则保留数据库中的值
image_caption = COALESCE(NULLIF(EXCLUDED.image_caption, ''), {ACTIVE_TABLE}.image_caption),
caption_embedding = COALESCE(EXCLUDED.caption_embedding, {ACTIVE_TABLE}.caption_embedding),
dominant_colors = COALESCE(EXCLUDED.dominant_colors, {ACTIVE_TABLE}.dominant_colors),
style_tags = COALESCE(EXCLUDED.style_tags, {ACTIVE_TABLE}.style_tags),
object_tags = COALESCE(EXCLUDED.object_tags, {ACTIVE_TABLE}.object_tags),
```

**效果**：
- ✅ 如果传入的 `image_caption` 是 `None` 或空字符串，保留数据库中的值
- ✅ 如果传入的 `image_caption` 有值，更新数据库中的值
- ✅ 避免覆盖已有的 Caption

---

### 2. ✅ 添加自动补齐机制

**问题**：如果图片已经保存到数据库（但没有 Caption），再次保存时不会触发 Caption 生成。

**修复**：在 `batch_upsert_items` 中，保存前检查数据库中已有但无 Caption 的项，自动触发生成。

**位置**：`backend/app/vector_db.py` (line 1098-1148)

**逻辑**：
1. 检查所有要保存的项，找出有图片但传入的 item 中没有 caption 的项
2. 批量查询数据库，检查这些项是否在数据库中已有但无 Caption
3. 如果有需要补齐的项，异步触发 Caption 生成任务

**代码**：
```python
# ✅ 自动补齐机制：检查已保存但无 Caption 的项，自动触发生成
items_needing_caption = []
try:
    from search.normalize import _normalize_url_for_storage
    
    # 批量检查所有要保存的项，找出数据库中已有但无 Caption 的
    urls_to_check = []
    items_map = {}
    for item in all_items_to_save:
        url = item.get("url")
        image = item.get("image")
        # 只检查有图片但传入的 item 中没有 caption 的项
        if image and not item.get("image_caption"):
            normalized_url = _normalize_url_for_storage(url)
            urls_to_check.append(normalized_url)
            items_map[normalized_url] = item
    
    # 批量查询数据库
    if urls_to_check:
        existing_items = await get_items_by_urls(user_id, urls_to_check)
        existing_dict = {_normalize_url_for_storage(item.get("url", "")): item for item in existing_items}
        
        # 检查哪些项在数据库中已有但无 Caption
        for normalized_url, item in items_map.items():
            existing_item = existing_dict.get(normalized_url)
            if existing_item:
                # 如果数据库中有记录但没有 caption，需要补齐
                existing_caption = existing_item.get("image_caption") or (
                    existing_item.get("metadata", {}).get("caption") if isinstance(existing_item.get("metadata"), dict) else None
                )
                if not existing_caption:
                    items_needing_caption.append(item)
    
    # 如果有需要补齐的项，异步触发 Caption 生成
    if items_needing_caption:
        try:
            from search.auto_caption import batch_enqueue_caption_tasks
            await batch_enqueue_caption_tasks(
                user_id,
                items_needing_caption,
                max_items=50  # 每次最多处理 50 个，避免队列过载
            )
            print(f"[VectorDB] ✅ 自动触发 {len(items_needing_caption)} 个已保存但无 Caption 的项进行补齐")
        except Exception as caption_error:
            print(f"[VectorDB] ⚠️ 自动触发 Caption 生成失败: {caption_error}")
            import traceback
            traceback.print_exc()
except Exception as e:
    print(f"[VectorDB] ⚠️ 自动补齐检查失败（非关键错误）: {e}")
    import traceback
    traceback.print_exc()
    # 不阻止保存流程
```

**效果**：
- ✅ 自动检测数据库中已有但无 Caption 的项
- ✅ 自动触发 Caption 生成任务
- ✅ 不阻塞保存流程（即使检查失败也不影响保存）

---

## 📊 修复前后对比

### 修复前

**场景 1：已保存的图片再次保存**
```
用户打开页面 → 前端发送数据 → 后端保存
    ↓
传入 image_caption = None
    ↓
SQL: image_caption = EXCLUDED.image_caption (None)
    ↓
❌ 覆盖数据库中已有的 Caption（如果有）
❌ 不会触发 Caption 生成（因为去重机制）
```

**场景 2：已保存但无 Caption 的图片**
```
图片已保存到数据库（无 Caption）
    ↓
用户再次打开页面 → 前端发送数据 → 后端保存
    ↓
传入 image_caption = None
    ↓
SQL: image_caption = EXCLUDED.image_caption (None)
    ↓
❌ 不会触发 Caption 生成（因为去重机制或已入队）
```

### 修复后

**场景 1：已保存的图片再次保存**
```
用户打开页面 → 前端发送数据 → 后端保存
    ↓
传入 image_caption = None
    ↓
SQL: image_caption = COALESCE(NULLIF(EXCLUDED.image_caption, ''), opengraph_items.image_caption)
    ↓
✅ 保留数据库中已有的 Caption
```

**场景 2：已保存但无 Caption 的图片**
```
图片已保存到数据库（无 Caption）
    ↓
用户再次打开页面 → 前端发送数据 → 后端保存
    ↓
自动补齐机制检查：
    - 数据库中有记录
    - 数据库中没有 Caption
    ↓
✅ 自动触发 Caption 生成任务
    ↓
SQL: image_caption = COALESCE(NULLIF(EXCLUDED.image_caption, ''), opengraph_items.image_caption)
    ↓
✅ 保留数据库中的值（None），等待 Caption 生成完成
```

---

## 🎯 解决的问题

1. ✅ **覆盖问题**：不再覆盖数据库中已有的 Caption
2. ✅ **自动补齐**：已保存但无 Caption 的图片会自动触发生成
3. ✅ **向后兼容**：修复不影响现有功能

---

## 📝 使用说明

### 对于已保存但无 Caption 的图片

**自动补齐**：
- 当用户再次打开页面时，后端会自动检测并触发 Caption 生成
- 不需要手动操作，系统会自动处理

**触发条件**：
- 图片已保存到数据库
- 数据库中没有 Caption（`image_caption` 为空）
- 传入的 item 中有图片但无 Caption
- 保存操作成功

**处理流程**：
1. 保存数据到数据库（使用 COALESCE 避免覆盖）
2. 检查数据库中已有但无 Caption 的项
3. 自动触发 Caption 生成任务
4. Caption 生成完成后，通过 WebSocket 通知前端

---

## 🔍 验证方法

### 1. 检查覆盖问题是否修复

```sql
-- 查询一个已有 Caption 的记录
SELECT url, image_caption FROM opengraph_items WHERE image_caption IS NOT NULL LIMIT 1;

-- 再次保存该记录（不传 image_caption）
-- 检查 Caption 是否被保留
SELECT url, image_caption FROM opengraph_items WHERE url = '...';
```

### 2. 检查自动补齐是否工作

```python
# 1. 创建一个无 Caption 的记录
# 2. 再次保存该记录（不传 image_caption）
# 3. 检查日志中是否有：
#    "[VectorDB] ✅ 自动触发 X 个已保存但无 Caption 的项进行补齐"
# 4. 等待 Caption 生成完成
# 5. 检查数据库中是否有 Caption
```

---

## 📚 相关文档

- [Caption 生成流程详解](./CAPTION_GENERATION_FLOW.md)
- [数据流对齐检查](./DATA_FLOW_ALIGNMENT_CHECK.md)

---

## ✅ 总结

通过这两个修复：
1. **覆盖问题已解决**：使用 COALESCE 避免覆盖已有的 Caption
2. **自动补齐已实现**：已保存但无 Caption 的图片会自动触发生成
3. **向后兼容**：修复不影响现有功能

现在系统可以：
- ✅ 保护已有的 Caption，不会被覆盖
- ✅ 自动补齐缺失的 Caption
- ✅ 在用户再次打开页面时自动触发生成
