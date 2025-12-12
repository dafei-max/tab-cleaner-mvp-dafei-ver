# Caption 生成流程详解

## 📋 目录
1. [触发机制](#触发机制)
2. [入队检查](#入队检查)
3. [处理流程](#处理流程)
4. [保存逻辑](#保存逻辑)
5. [为什么已保存的图片无法生成 Caption](#为什么已保存的图片无法生成-caption)
6. [可能被打断的情况](#可能被打断的情况)

---

## 🚀 触发机制

### 触发时机
Caption 生成在以下情况下触发：

**位置**: `backend/app/main.py` (line 475-489)

```python
# 在 generate_embeddings API 中，保存数据到数据库后
saved_count = await batch_upsert_items(items_to_store, user_id=normalized_user_id)
if saved_count > 0:
    # 过滤出需要生成 Caption 的项（有图片但没有 Caption）
    items_for_caption = [
        item for item in items_to_store
        if item.get("image") and not item.get("image_caption")  # ✅ 关键条件
    ]
    if items_for_caption:
        await batch_enqueue_caption_tasks(
            normalized_user_id,
            items_for_caption,
            max_items=50
        )
```

### 触发条件
1. ✅ **有图片** (`item.get("image")`)
2. ✅ **没有 Caption** (`not item.get("image_caption")`)
3. ✅ **成功保存到数据库** (`saved_count > 0`)

### 触发位置
- **API 端点**: `POST /api/v1/search/generate-embeddings`
- **时机**: 数据保存到数据库**之后**
- **批次限制**: 每次最多处理 50 个（避免队列过载）

---

## 🔍 入队检查

### 检查流程
**位置**: `backend/app/search/auto_caption.py` (line 321-370)

```python
async def enqueue_caption_task(user_id: str, item: Dict):
    url = item.get("url")
    if not url:
        return  # ❌ 没有 URL，跳过
    
    # ✅ 去重检查：如果已经入队，跳过
    task_key = (normalized_user_id, url)
    if task_key in _enqueued_tasks:
        return  # ❌ 已入队，跳过
    
    # 检查是否有图片
    image = item.get("image")
    if not image:
        return  # ❌ 没有图片，跳过
    
    # 检查是否已有 Caption
    has_caption = item.get("image_caption") or (
        item.get("metadata", {}).get("caption") if isinstance(item.get("metadata"), dict) else None
    )
    if has_caption:
        return  # ❌ 已有 Caption，跳过
    
    # ✅ 入队
    _caption_task_queue.put_nowait(task)
    _enqueued_tasks.add(task_key)
```

### 入队失败的情况
1. ❌ **没有 URL** - 直接返回
2. ❌ **已入队** - 去重机制，避免重复处理
3. ❌ **没有图片** - 无法生成 Caption
4. ❌ **已有 Caption** - 在传入的 `item` 中已存在

### 队列配置
- **队列类型**: `asyncio.Queue()` (无界队列)
- **Worker 数量**: 6 个（环境变量 `CAPTION_WORKERS`，默认 6）
- **并发限制**: 10 个（环境变量 `CAPTION_CONCURRENCY`，默认 10）
- **去重机制**: `_enqueued_tasks` Set，记录 `(user_id, url)` 元组

---

## ⚙️ 处理流程

### Worker 启动
**位置**: `backend/app/main.py` (line 111-112)

```python
@app.on_event("startup")
async def startup_event():
    from search.auto_caption import start_caption_worker
    start_caption_worker()  # 启动 6 个 worker
```

### 任务处理
**位置**: `backend/app/search/auto_caption.py` (line 178-277)

```python
async def _process_caption_task(task: Dict):
    # 1. 从任务集合中移除（标记为正在处理）
    task_key = (normalized_user_id, url)
    if task_key in _enqueued_tasks:
        _enqueued_tasks.discard(task_key)
    
    # 2. 检查是否有图片
    if not image:
        return  # ❌ 没有图片，跳过
    
    # 3. 检查 item 中是否已有 Caption
    if has_caption:
        return  # ❌ item 中已有 Caption，跳过
    
    # 4. ✅ 查询数据库检查是否已有 Caption（避免重复处理）
    existing_items = await get_items_by_urls(normalized_user_id, [url])
    if existing_items and len(existing_items) > 0:
        existing_item = existing_items[0]
        db_caption = existing_item.get("image_caption") or (
            existing_item.get("metadata", {}).get("caption") if isinstance(existing_item.get("metadata"), dict) else None
        )
        if db_caption:
            return  # ❌ 数据库中已有 Caption，跳过
    
    # 5. ✅ 使用信号量控制并发（最多 10 个同时处理）
    async with _caption_semaphore:
        # 6. 生成 Caption
        enriched_item = await enrich_item_with_caption(item, qwen_client=qwen_client)
        
        # 7. 生成 Caption embedding
        caption_embedding = await embed_text(enriched_item.get("caption", ""))
        
        # 8. 更新数据库
        success = await _update_item_caption_in_db(...)
```

### 处理失败的情况
1. ❌ **没有图片** - 无法生成 Caption
2. ❌ **item 中已有 Caption** - 跳过处理
3. ❌ **数据库中已有 Caption** - 避免重复处理
4. ❌ **Caption 生成失败** - `enrich_item_with_caption` 返回空
5. ❌ **数据库更新失败** - `_update_item_caption_in_db` 返回 False
6. ❌ **异常中断** - 任何未捕获的异常

---

## 💾 保存逻辑

### 数据库保存
**位置**: `backend/app/vector_db.py` (line 520-548)

```python
await conn.execute(f"""
    INSERT INTO {ACTIVE_TABLE} (
        user_id, url, title, description, image, ...,
        image_caption, caption_embedding, dominant_colors, style_tags, object_tags,
        ...
    ) VALUES ($1, $2, $3, $4, $5, ..., $13, $14, $15, $16, $17, ...)
    ON CONFLICT (user_id, url) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        image = EXCLUDED.image,
        ...
        image_caption = EXCLUDED.image_caption,  # ⚠️ 关键：会覆盖！
        caption_embedding = EXCLUDED.caption_embedding,
        dominant_colors = EXCLUDED.dominant_colors,
        style_tags = EXCLUDED.style_tags,
        object_tags = EXCLUDED.object_tags,
        ...
        updated_at = NOW();
""", ..., image_caption, caption_embedding, dominant_colors, style_tags, object_tags)
```

### 关键问题：覆盖逻辑
**⚠️ 严重问题**: `image_caption = EXCLUDED.image_caption`

这意味着：
- 如果传入的 `image_caption` 是 `None`，会**覆盖**数据库中已有的值（即使是 `None`，也会重置 `updated_at`）
- **更严重**：如果数据库中**已有 Caption**，再次保存时传入 `None` 会**覆盖掉已有的 Caption**！

**问题根源**：
在 `main.py` 的 `items_to_store` 中，没有设置 `image_caption`：
```python
items_to_store.append({
    "user_id": normalized_user_id,
    "url": item.get("url"),
    # ... 其他字段 ...
    # ❌ 没有 image_caption！
})
```

所以当调用 `upsert_opengraph_item` 时，`image_caption=item.get("image_caption")` 返回 `None`，会覆盖数据库中已有的 Caption！

### 保存时机
1. **初始保存**: 在 `generate_embeddings` API 中，保存 OpenGraph 数据时
2. **Caption 更新**: 在 `_update_item_caption_in_db` 中，生成 Caption 后更新

---

## ❌ 为什么已保存的图片无法生成 Caption

### 问题场景
假设图片已经保存到数据库（但没有 Caption），现在想要生成 Caption：

### 可能的原因

#### 1. **去重机制阻止入队**
```python
# 如果之前已经入队过（即使处理失败），会被跳过
if task_key in _enqueued_tasks:
    return  # ❌ 已入队，跳过
```

**解决方案**: 任务处理完成后会从 `_enqueued_tasks` 中移除，但如果处理失败或异常中断，可能仍留在 Set 中。

#### 2. **数据库检查跳过处理**
```python
# 如果数据库中已有记录（即使没有 Caption），但检查逻辑可能有问题
existing_items = await get_items_by_urls(normalized_user_id, [url])
if existing_items and len(existing_items) > 0:
    existing_item = existing_items[0]
    db_caption = existing_item.get("image_caption") or ...
    if db_caption:
        return  # ❌ 如果 db_caption 是 None，不会跳过，但如果检查逻辑有问题...
```

**注意**: 这个检查逻辑是正确的，只有当 `db_caption` 有值时才跳过。

#### 3. **再次保存时覆盖**
```python
# 如果再次保存时，传入的 image_caption 是 None
image_caption = EXCLUDED.image_caption  # None 覆盖 None（虽然值相同，但会重置 updated_at）
```

**影响**: 虽然不会丢失 Caption（因为都是 None），但会重置 `updated_at`，可能影响其他逻辑。

#### 4. **Worker 未启动或异常**
```python
# 如果 Worker 未启动或异常退出
if not _caption_worker_running:
    # Worker 未运行，任务会堆积在队列中
```

**检查**: 查看日志中是否有 `[AutoCaption] Worker #X started`。

#### 5. **队列已满**
```python
try:
    _caption_task_queue.put_nowait(task)
except asyncio.QueueFull:
    print(f"[AutoCaption] Queue full, skipping {url[:50]}...")
    return  # ❌ 队列已满，跳过
```

**注意**: `asyncio.Queue()` 默认是无界队列，理论上不会满，但如果有自定义限制可能会满。

#### 6. **Caption 生成失败**
```python
enriched_item = await enrich_item_with_caption(item, qwen_client=qwen_client)
if not enriched_item.get("caption"):
    print(f"[AutoCaption] Failed to generate caption for {url[:50]}...")
    return  # ❌ 生成失败，跳过
```

**可能原因**:
- API 调用失败
- 图片无法访问
- 图片格式不支持
- API 配额用尽

---

## ⚠️ 可能被打断的情况

### 1. **应用重启**
- Worker 进程终止
- 队列中的任务丢失（内存队列）
- 已入队的任务记录丢失（内存 Set）

### 2. **异常中断**
```python
except Exception as e:
    print(f"[AutoCaption] ERROR processing task for {url[:50]}...: {e}")
    # 任务处理失败，但已从 _enqueued_tasks 中移除
    # 如果异常发生在处理前，可能仍留在 Set 中
```

### 3. **并发限制**
```python
async with _caption_semaphore:  # 最多 10 个并发
    # 如果已有 10 个任务在处理，新任务会等待
    # 但如果等待时间过长，可能超时
```

### 4. **数据库连接失败**
```python
existing_items = await get_items_by_urls(normalized_user_id, [url])
# 如果数据库连接失败，会抛出异常，任务处理中断
```

### 5. **API 调用失败**
```python
enriched_item = await enrich_item_with_caption(item, qwen_client=qwen_client)
# 如果 Qwen-VL API 调用失败，会抛出异常，任务处理中断
```

---

## 🔧 解决方案

### 对于已保存但无 Caption 的图片

#### 方案 1: 手动触发（推荐）
创建一个 API 端点，手动触发 Caption 生成：

```python
@app.post("/api/v1/caption/regenerate")
async def regenerate_caption(user_id: str, url: str):
    # 从数据库获取 item
    items = await get_items_by_urls(user_id, [url])
    if not items:
        raise HTTPException(404, "Item not found")
    
    item = items[0]
    # 手动入队
    await enqueue_caption_task(user_id, item)
    return {"status": "enqueued"}
```

#### 方案 2: 批量补齐脚本
创建一个脚本，批量查找无 Caption 的图片并触发生成：

```python
# 查找所有无 Caption 的图片
items = await conn.fetch("""
    SELECT user_id, url, image
    FROM opengraph_items
    WHERE image IS NOT NULL
      AND (image_caption IS NULL OR image_caption = '')
      AND status = 'active'
""")

# 批量入队
for item in items:
    await enqueue_caption_task(item['user_id'], item)
```

#### 方案 3: 优化保存逻辑（推荐）
修改 `upsert_opengraph_item`，避免覆盖已有的 Caption：

```python
# 只在传入的 image_caption 有值时才更新，否则保留数据库中的值
image_caption = COALESCE(EXCLUDED.image_caption, {ACTIVE_TABLE}.image_caption),
caption_embedding = COALESCE(EXCLUDED.caption_embedding, {ACTIVE_TABLE}.caption_embedding),
dominant_colors = COALESCE(EXCLUDED.dominant_colors, {ACTIVE_TABLE}.dominant_colors),
style_tags = COALESCE(EXCLUDED.style_tags, {ACTIVE_TABLE}.style_tags),
object_tags = COALESCE(EXCLUDED.object_tags, {ACTIVE_TABLE}.object_tags),
```

**或者**，在 `main.py` 的 `items_to_store` 中，从数据库读取已有的 Caption 字段：

```python
# 在保存前，先查询数据库中已有的 Caption 字段
existing_items = await get_items_by_urls(normalized_user_id, [item.get("url") for item in items_to_store])
existing_dict = {item["url"]: item for item in existing_items}

for item in items_to_store:
    existing = existing_dict.get(item.get("url"))
    if existing:
        # 保留数据库中已有的 Caption 字段
        item["image_caption"] = existing.get("image_caption")
        item["caption_embedding"] = existing.get("caption_embedding")
        item["dominant_colors"] = existing.get("dominant_colors")
        item["style_tags"] = existing.get("style_tags")
        item["object_tags"] = existing.get("object_tags")
```

---

## 📊 流程图

```
用户打开页面
    ↓
前端发送 OpenGraph 数据
    ↓
后端 generate_embeddings API
    ↓
保存到数据库 (batch_upsert_items)
    ↓
检查: 有图片 && 没有 Caption?
    ↓ (是)
批量入队 (batch_enqueue_caption_tasks)
    ↓
enqueue_caption_task
    ↓
检查: 有 URL? 已入队? 有图片? 有 Caption?
    ↓ (全部通过)
加入队列 (_caption_task_queue)
    ↓
Worker 从队列取任务
    ↓
_process_caption_task
    ↓
检查: 有图片? item 有 Caption? 数据库有 Caption?
    ↓ (全部通过)
获取信号量 (_caption_semaphore)
    ↓
生成 Caption (enrich_item_with_caption)
    ↓
生成 Caption Embedding (embed_text)
    ↓
更新数据库 (_update_item_caption_in_db)
    ↓
发送 WebSocket 通知 (broadcast_caption_updates)
    ↓
完成 ✅
```

---

## 📝 总结

### 触发条件
- ✅ 有图片
- ✅ 没有 Caption（在传入的 item 中）
- ✅ 成功保存到数据库

### 可能失败的原因
1. ❌ 去重机制（已入队）
2. ❌ 数据库中已有 Caption
3. ❌ Worker 未启动或异常
4. ❌ Caption 生成失败
5. ❌ 数据库更新失败
6. ❌ 应用重启（队列丢失）

### 关键问题
- ⚠️ **覆盖逻辑**: `image_caption = EXCLUDED.image_caption` 会覆盖已有值
- ⚠️ **内存队列**: 应用重启后队列中的任务丢失
- ⚠️ **去重机制**: 如果任务处理失败，可能仍留在 Set 中

### 建议
1. ✅ 添加手动触发 API
2. ✅ 优化保存逻辑，避免覆盖已有 Caption
3. ✅ 添加持久化队列（Redis/RabbitMQ）
4. ✅ 添加重试机制
5. ✅ 添加监控和日志
