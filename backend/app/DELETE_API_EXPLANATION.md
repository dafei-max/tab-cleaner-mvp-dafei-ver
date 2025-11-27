# DELETE API 接口说明

## 概述

这两个 DELETE 接口用于**软删除**用户的数据，实现前端个人空间和后端数据库的同步删除。

---

## 1. DELETE /api/v1/tabs/{tab_id}

### 功能
**删除单个标签页（Tab）**

### 具体作用
- 将数据库中该 tab 的 `status` 从 `'active'` 改为 `'deleted'`
- 设置 `deleted_at` 为当前时间
- **不会物理删除数据**，只是标记为已删除
- 删除后，该 tab 不会再出现在搜索结果中
- 删除后，该 tab 不会再出现在用户的 active tabs 列表中

### 使用场景
用户在个人空间中：
- 点击某个卡片的删除按钮
- 想要移除某个不想要的标签页
- 清理误收集的标签页

### 示例

```bash
# 删除一个 tab（URL 需要 URL 编码）
curl -X DELETE "http://localhost:8000/api/v1/tabs/https%3A%2F%2Fexample.com" \
  -H "X-User-ID: user123"
```

**请求**:
- `{tab_id}`: 实际上是 tab 的 URL（需要 URL 编码）
- `X-User-ID`: 用户ID（从请求头获取）

**响应**:
```json
{
  "ok": true,
  "message": "Tab https://example.com... deleted successfully"
}
```

### 数据库操作

```sql
UPDATE cleantab.opengraph_items_v2
SET status = 'deleted',
    deleted_at = NOW(),
    updated_at = NOW()
WHERE user_id = 'user123' 
  AND url = 'https://example.com' 
  AND status = 'active';
```

---

## 2. DELETE /api/v1/sessions/{session_id}

### 功能
**删除整个 Session（洗衣筐）及其下的所有 Tabs**

### 具体作用
- 查找该 session 下的所有 tabs（通过 `metadata->>'session_id'` 字段）
- 将所有找到的 tabs 的 `status` 从 `'active'` 改为 `'deleted'`
- 设置所有 tabs 的 `deleted_at` 为当前时间
- **不会物理删除数据**，只是标记为已删除
- 删除后，该 session 下的所有 tabs 都不会再出现在搜索结果中

### 使用场景
用户在个人空间中：
- 点击"删除洗衣筐"按钮
- 想要清理整个 session 的所有标签页
- 清理不再需要的整个收集批次

### 示例

```bash
# 删除一个 session
curl -X DELETE "http://localhost:8000/api/v1/sessions/session_1234567890" \
  -H "X-User-ID: user123"
```

**请求**:
- `{session_id}`: Session ID（例如：`session_1234567890`）
- `X-User-ID`: 用户ID（从请求头获取）

**响应**:
```json
{
  "ok": true,
  "message": "Session session_1234567890 deleted successfully",
  "deleted_tabs": 15
}
```

### 数据库操作

```sql
UPDATE cleantab.opengraph_items_v2
SET status = 'deleted',
    deleted_at = NOW(),
    updated_at = NOW()
WHERE user_id = 'user123' 
  AND status = 'active'
  AND metadata->>'session_id' = 'session_1234567890';
```

---

## 重要说明

### 1. 软删除 vs 物理删除

- **软删除**（当前实现）：
  - ✅ 数据还在数据库中
  - ✅ 可以通过更新数据库恢复
  - ✅ 30 天后会被定时任务清理（匿名化或物理删除）
  - ✅ 删除后立即从搜索结果中消失

- **物理删除**（未来可选）：
  - ❌ 数据完全删除，无法恢复
  - ✅ 节省存储空间

### 2. Session ID 存储要求

**重要**：Session 删除依赖于 `metadata` 中的 `session_id` 字段。

在存储数据时，必须确保 `metadata` 包含 `session_id`：

```javascript
// 前端存储时
{
  url: "https://example.com",
  metadata: {
    session_id: "session_1234567890",  // ← 必须包含这个
    is_doc_card: false,
    success: true
  }
}
```

### 3. 用户隔离

- ✅ 用户只能删除自己的数据（通过 `user_id` 验证）
- ✅ 删除操作会检查 `user_id`，防止误删其他用户的数据

### 4. 前端同步

删除后，前端需要同步更新 `chrome.storage.local` 中的 `sessions` 数据：

```javascript
// 删除 tab 后
const session = sessions.find(s => s.id === sessionId);
if (session) {
  const updatedData = session.opengraphData.filter(item => item.url !== deletedUrl);
  updateSession(sessionId, { opengraphData: updatedData });
}

// 删除 session 后
deleteSession(sessionId);
```

---

## 测试示例

### 测试删除 Tab

```bash
# 1. 先查看有哪些 tabs
curl http://localhost:8000/api/v1/tabs \
  -H "X-User-ID: test_user"

# 2. 删除一个 tab
curl -X DELETE "http://localhost:8000/api/v1/tabs/https%3A%2F%2Fexample.com" \
  -H "X-User-ID: test_user"

# 3. 再次查看，应该看不到被删除的 tab
curl http://localhost:8000/api/v1/tabs \
  -H "X-User-ID: test_user"
```

### 测试删除 Session

```bash
# 1. 删除一个 session
curl -X DELETE "http://localhost:8000/api/v1/sessions/session_1234567890" \
  -H "X-User-ID: test_user"

# 2. 查看响应，确认删除了多少个 tabs
# 响应: {"ok": true, "message": "...", "deleted_tabs": 15}
```

---

## 数据恢复（如果需要）

如果误删了数据，可以通过 SQL 恢复：

```sql
-- 恢复单个 tab
UPDATE cleantab.opengraph_items_v2
SET status = 'active', deleted_at = NULL
WHERE user_id = 'user123' AND url = 'https://example.com';

-- 恢复整个 session
UPDATE cleantab.opengraph_items_v2
SET status = 'active', deleted_at = NULL
WHERE user_id = 'user123' 
  AND metadata->>'session_id' = 'session_1234567890';
```

---

## 总结

| 接口 | 删除范围 | 使用场景 | 依赖字段 |
|------|---------|---------|---------|
| `DELETE /api/v1/tabs/{tab_id}` | 单个 tab | 删除单个卡片 | `url` |
| `DELETE /api/v1/sessions/{session_id}` | 整个 session 的所有 tabs | 删除整个洗衣筐 | `metadata->>'session_id'` |

两个接口都是**软删除**，数据会保留 30 天，之后由定时任务清理。

