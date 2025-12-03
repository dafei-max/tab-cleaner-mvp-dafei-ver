# 重复请求处理修复

## 🐛 问题描述

从 Railway 日志可以看到，同一个 URL 被多次发送到 `/api/v1/search/embedding` 端点，导致：

1. **重复处理**：同一个 URL 被多次处理，生成多次 embedding
2. **资源浪费**：重复调用 AI API，浪费 token 和计算资源
3. **数据库检查失效**：并发请求时，第一个请求还没保存完，第二个请求检查数据库时返回 0，导致都认为需要处理

### 日志示例

```
[API] 📥 Received request with 1 items for embedding generation
[API] 👤 User ID from header: 'device_1764658383255_28u4om0xg'
[API] 📋 First item sample: {'url': 'https://www.pinterest.com/pin/463237511651807696/'}
[API] Found 0 items in database  ← 第一次检查，返回0
[API] Generating embeddings for 1 items...

[API] 📥 Received request with 1 items for embedding generation  ← 重复请求
[API] 👤 User ID from header: 'device_1764658383255_28u4om0xg'
[API] 📋 First item sample: {'url': 'https://www.pinterest.com/pin/463237511651807696/'}
[API] Found 0 items in database  ← 第二次检查，还是返回0（因为第一个还没保存完）
[API] Generating embeddings for 1 items...
```

## ✅ 修复方案

### 1. 添加请求去重机制

在 API 层面添加"正在处理"标记，防止同一个 URL 被并发处理。

**实现位置**: `main.py`

**关键代码**:

```python
# ✅ 请求去重：记录正在处理的 URL（user_id + url）
_processing_urls = defaultdict(set)  # {user_id: set of urls}
_processing_lock = asyncio.Lock()

@app.post("/api/v1/search/embedding")
async def generate_embeddings(...):
    # ✅ 步骤 0.3: 请求去重 - 检查是否有正在处理的相同URL
    async with _processing_lock:
        processing_urls_for_user = _processing_urls[normalized_user_id]
        urls_to_check = [item.get("url") for item in normalized_items if item.get("url")]
        duplicate_urls = [url for url in urls_to_check if url in processing_urls_for_user]
        
        if duplicate_urls:
            print(f"[API] ⚠️  Detected {len(duplicate_urls)} URLs already being processed, skipping...")
            # 过滤掉正在处理的URL
            normalized_items = [item for item in normalized_items 
                               if not item.get("url") or item.get("url") not in duplicate_urls]
            if not normalized_items:
                return {"ok": True, "saved": 0, "data": [], "skipped": len(duplicate_urls), "reason": "already_processing"}
        
        # 标记这些URL为正在处理
        for item in normalized_items:
            url = item.get("url")
            if url:
                processing_urls_for_user.add(url)
    
    try:
        # ... 处理逻辑 ...
    finally:
        # ✅ 清理正在处理的URL标记（无论成功或失败都要清理）
        async with _processing_lock:
            processing_urls_for_user = _processing_urls[normalized_user_id]
            for item in normalized_items:
                url = item.get("url")
                if url:
                    processing_urls_for_user.discard(url)
            if not processing_urls_for_user:
                _processing_urls.pop(normalized_user_id, None)
```

### 2. 工作原理

1. **请求到达时**：
   - 检查该用户是否有正在处理的相同 URL
   - 如果有，跳过这些 URL，只处理新的
   - 如果没有，标记这些 URL 为"正在处理"

2. **处理完成后**：
   - 无论成功或失败，都会清理"正在处理"标记
   - 确保不会永久锁定 URL

3. **并发保护**：
   - 使用 `asyncio.Lock()` 确保线程安全
   - 使用 `defaultdict(set)` 按用户隔离

### 3. 预期效果

**修复前**：
```
请求1: URL A → 检查数据库 → 0 → 开始处理
请求2: URL A → 检查数据库 → 0 → 开始处理（重复！）
请求3: URL A → 检查数据库 → 0 → 开始处理（重复！）
```

**修复后**：
```
请求1: URL A → 标记为"正在处理" → 检查数据库 → 0 → 开始处理
请求2: URL A → 检测到"正在处理" → 跳过，返回 early
请求3: URL A → 检测到"正在处理" → 跳过，返回 early
请求1: 处理完成 → 清理"正在处理"标记
```

## 📋 检查清单

- [x] 添加全局 `_processing_urls` 字典记录正在处理的 URL
- [x] 添加 `_processing_lock` 确保线程安全
- [x] 在请求开始时检查并标记 URL
- [x] 在请求结束时清理标记（finally 块）
- [x] 按用户隔离（user_id + url）

## 🔍 验证方法

1. **查看日志**：
   - 应该看到 `[API] ⚠️  Detected X URLs already being processed, skipping...`
   - 不应该看到同一个 URL 被多次处理

2. **检查数据库**：
   - 同一个 URL 应该只有一条记录
   - 不应该有重复的 embedding

3. **监控资源使用**：
   - AI API 调用次数应该减少
   - 数据库写入次数应该减少

---

**最后更新**: 2025-12-03

