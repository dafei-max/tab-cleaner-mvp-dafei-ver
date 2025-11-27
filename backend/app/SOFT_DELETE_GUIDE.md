# 软删除机制使用指南

## 概述

已实现完整的软删除机制，支持：
- ✅ Tab 级别的软删除
- ✅ Session 级别的软删除
- ✅ 自动过滤已删除记录（所有读取接口只返回 `status='active'` 的记录）
- ✅ 定时清理任务（30天后物理删除或匿名化）

## 数据库 Schema

### 新增字段

```sql
ALTER TABLE cleantab.opengraph_items_v2
ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted'));
ADD COLUMN deleted_at TIMESTAMP;
```

- `status`: 记录状态，`'active'` 或 `'deleted'`
- `deleted_at`: 删除时间戳

## API 接口

### 1. 删除 Tab

```http
DELETE /api/v1/tabs/{tab_id}
X-User-ID: {user_id}
```

**参数**:
- `tab_id`: Tab 的 URL（作为唯一标识）

**响应**:
```json
{
  "ok": true,
  "message": "Tab {url}... deleted successfully"
}
```

### 2. 删除 Session

```http
DELETE /api/v1/sessions/{session_id}
X-User-ID: {user_id}
```

**参数**:
- `session_id`: Session ID（需要存储在 metadata 中）

**响应**:
```json
{
  "ok": true,
  "message": "Session {session_id} deleted successfully",
  "deleted_tabs": 10
}
```

**注意**: Session 删除依赖于 `metadata->>'session_id'` 字段，确保在存储时包含此字段。

## 数据迁移

### 从旧表迁移到新表

```bash
cd backend/app
python migrate_data.py
```

迁移脚本会：
1. 检查旧表 `opengraph_items` 是否存在
2. 批量迁移数据到新表 `opengraph_items_v2`
3. 所有迁移的数据 `user_id` 设为 `'anonymous'`（共享向量库）
4. 所有迁移的数据 `status` 设为 `'active'`

## 定时清理任务

### 运行清理任务

```bash
cd backend/app

# 匿名化（默认，保留 embedding 用于搜索）
python cleanup_deleted_data.py --days 30

# 物理删除
python cleanup_deleted_data.py --days 30 --delete
```

### 配置 Cron Job（Linux/macOS）

```bash
# 每天凌晨 2 点运行清理任务（匿名化）
0 2 * * * cd /path/to/backend/app && python cleanup_deleted_data.py --days 30

# 或物理删除
0 2 * * * cd /path/to/backend/app && python cleanup_deleted_data.py --days 30 --delete
```

### 使用 APScheduler（Python 定时任务）

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from cleanup_deleted_data import cleanup_deleted_data

scheduler = AsyncIOScheduler()
scheduler.add_job(
    cleanup_deleted_data,
    trigger='cron',
    hour=2,
    minute=0,
    args=[30, True]  # days_threshold=30, anonymize=True
)
scheduler.start()
```

## 搜索行为

### 共享向量库

搜索接口已改为**共享向量库**模式：
- ✅ 搜索时忽略 `user_id`，搜索所有用户的 `active` 记录
- ✅ 只返回 `status='active'` 的记录
- ✅ 已删除的记录不会出现在搜索结果中

### 示例

```python
# 搜索所有用户的 active 记录
results = await search_by_text_embedding(
    user_id=None,  # 忽略 user_id
    query_embedding=embedding,
    top_k=20
)
```

## 前端同步

### 存储时包含 session_id

在调用 `/api/v1/search/embedding` 时，确保 `metadata` 包含 `session_id`：

```javascript
{
  url: "https://example.com",
  title: "Example",
  metadata: {
    session_id: "session_1234567890",
    is_doc_card: false,
    is_screenshot: false,
    success: true
  }
}
```

### 删除 Tab

```javascript
// 前端调用
await fetch(`/api/v1/tabs/${encodeURIComponent(tabUrl)}`, {
  method: 'DELETE',
  headers: {
    'X-User-ID': userId
  }
});
```

### 删除 Session

```javascript
// 前端调用
await fetch(`/api/v1/sessions/${sessionId}`, {
  method: 'DELETE',
  headers: {
    'X-User-ID': userId
  }
});
```

## 注意事项

1. **Session ID 存储**: 确保在存储 OpenGraph 数据时，`metadata` 中包含 `session_id`，否则无法通过 session 删除对应的 tabs。

2. **用户隔离**: 虽然搜索是共享的，但删除操作仍然需要 `user_id` 来确保用户只能删除自己的数据。

3. **数据恢复**: 软删除的数据可以通过直接更新数据库恢复：
   ```sql
   UPDATE cleantab.opengraph_items_v2
   SET status = 'active', deleted_at = NULL
   WHERE user_id = 'user123' AND url = 'https://example.com';
   ```

4. **性能考虑**: 大量软删除记录可能影响查询性能，建议定期运行清理任务。

5. **备份**: 在运行物理删除之前，建议先备份数据库。

## 测试

### 测试软删除

```bash
# 1. 创建一些测试数据
curl -X POST http://localhost:8000/api/v1/search/embedding \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test_user" \
  -d '{"opengraph_items": [...]}'

# 2. 删除一个 tab
curl -X DELETE http://localhost:8000/api/v1/tabs/https%3A%2F%2Fexample.com \
  -H "X-User-ID: test_user"

# 3. 验证已删除（应该返回 404 或空结果）
curl http://localhost:8000/api/v1/tabs/https%3A%2F%2Fexample.com \
  -H "X-User-ID: test_user"
```

