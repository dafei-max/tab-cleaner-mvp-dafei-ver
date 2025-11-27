# 诊断脚本检查范围说明

## ❓ 问题：诊断脚本对比的是什么？

**答案**：诊断脚本只检查**数据库（后端）**，**不检查个人空间（前端）**的数据。

---

## 📊 数据存储位置对比

### 1. 个人空间（前端）的数据

**存储位置**：`chrome.storage.local` → `sessions`

**数据结构**：
```javascript
{
  sessions: [
    {
      id: "session_123",
      name: "洗衣筐1",
      createdAt: 1234567890,
      opengraphData: [
        {
          url: "https://example.com",
          title: "Example",
          image: "https://example.com/image.jpg",
          // 可能没有 embedding（如果还没发送到后端）
        }
      ],
      tabCount: 10
    }
  ]
}
```

**特点**：
- ✅ 存储在用户的浏览器本地
- ✅ 只包含当前用户的数据
- ✅ 可能没有 embedding（如果还没发送到后端）
- ❌ 用户删除 session 后数据就没了
- ❌ 换设备后数据丢失

---

### 2. 数据库（后端）的数据

**存储位置**：阿里云 AnalyticDB PostgreSQL → `cleantab.opengraph_items` 表

**数据结构**：
```sql
CREATE TABLE cleantab.opengraph_items (
    url TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    image TEXT,
    text_embedding vector(1024),      -- 可能为 NULL
    image_embedding vector(1024),    -- 可能为 NULL
    ...
);
```

**特点**：
- ✅ 存储在云端数据库
- ✅ 包含所有用户的历史数据
- ✅ 持久化存储（不会因为用户操作而丢失）
- ✅ 支持跨设备访问
- ❌ 可能没有 embedding（历史数据、生成失败等）

---

## 🔍 诊断脚本的检查范围

### 当前实现

```python
# diagnose_embeddings.py
async def diagnose_missing_embeddings():
    # 只查询数据库
    query = f"""
        SELECT url, title, 
               CASE WHEN text_embedding IS NULL THEN true ELSE false END as missing_text,
               CASE WHEN image_embedding IS NULL THEN true ELSE false END as missing_image
        FROM {NAMESPACE}.opengraph_items  -- ← 只检查数据库
        WHERE text_embedding IS NULL OR image_embedding IS NULL
    """
```

**检查范围**：
- ✅ **只检查数据库**：`cleantab.opengraph_items` 表
- ❌ **不检查前端**：不读取 `chrome.storage.local`
- ❌ **不检查个人空间**：不检查 `sessions` 数据

---

## 🔄 数据同步关系

### 数据流

```
1. 用户点击"一键清理"
   ↓
2. 前端收集 OpenGraph 数据
   ↓
3. 保存到 chrome.storage.local (sessions)  ← 个人空间显示这个
   ↓
4. 异步发送到后端 /api/v1/search/embedding
   ↓
5. 后端生成 embedding
   ↓
6. 保存到数据库 (opengraph_items)  ← 诊断脚本检查这个
```

### 可能的不同步情况

#### 情况 1：前端有数据，数据库没有
```
个人空间：有数据（chrome.storage.local）
数据库：没有数据（还没发送到后端）
→ 诊断脚本：不会发现这个问题
```

#### 情况 2：数据库有数据，前端没有
```
个人空间：没有数据（用户删除了 session）
数据库：有数据（历史数据保留）
→ 诊断脚本：会发现 missing embedding
```

#### 情况 3：数据库有数据但没有 embedding
```
个人空间：有数据（chrome.storage.local）
数据库：有数据但没有 embedding（历史数据、生成失败）
→ 诊断脚本：会发现 missing embedding ✅
```

---

## 🎯 为什么只检查数据库？

### 原因 1：搜索功能依赖数据库
- 搜索功能从数据库读取 embedding
- 个人空间的数据不用于搜索
- 所以只需要确保数据库的 embedding 完整

### 原因 2：数据持久化
- 数据库的数据是持久化的
- 个人空间的数据可能被用户删除
- 诊断脚本的目标是修复持久化数据

### 原因 3：跨设备一致性
- 数据库的数据可以在所有设备上访问
- 个人空间的数据只在当前设备
- 诊断脚本修复数据库后，所有设备都能受益

---

## 💡 如果需要检查个人空间的数据

如果将来需要同时检查个人空间的数据，可以：

### 方案 1：扩展诊断脚本
```python
async def diagnose_missing_embeddings_from_storage():
    """检查 chrome.storage.local 中的数据"""
    # 需要前端配合，通过 API 发送 sessions 数据
    # 然后检查哪些 URL 在数据库中缺少 embedding
    pass
```

### 方案 2：前端诊断工具
```javascript
// 前端脚本
async function diagnoseFrontendData() {
  const { sessions } = await chrome.storage.local.get(['sessions']);
  const allUrls = sessions.flatMap(s => s.opengraphData.map(og => og.url));
  
  // 调用后端 API 检查这些 URL 的 embedding 状态
  const response = await fetch('/api/v1/diagnose/check-urls', {
    method: 'POST',
    body: JSON.stringify({ urls: allUrls })
  });
}
```

---

## 📋 总结

| 检查范围 | 个人空间（前端） | 数据库（后端） |
|---------|----------------|---------------|
| **诊断脚本检查** | ❌ 不检查 | ✅ 检查 |
| **数据来源** | `chrome.storage.local` | `opengraph_items` 表 |
| **用途** | 个人空间展示 | 搜索功能 |
| **持久化** | ❌ 可能被删除 | ✅ 持久化 |
| **跨设备** | ❌ 仅当前设备 | ✅ 所有设备 |

**结论**：
- 诊断脚本只检查数据库，不检查个人空间
- 这是**设计上的选择**，因为搜索功能依赖数据库
- 如果需要检查个人空间的数据，需要额外的工具

