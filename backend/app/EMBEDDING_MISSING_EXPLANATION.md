# Missing Embedding 判断逻辑说明

## 🔍 判断依据

"Missing embedding" 是通过检查**数据库表中的字段值是否为 NULL** 来判断的。

## 📊 数据库表结构

```sql
CREATE TABLE cleantab.opengraph_items (
    url TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    image TEXT,
    text_embedding vector(1024),      -- 文本 embedding（允许 NULL）
    image_embedding vector(1024),    -- 图像 embedding（允许 NULL）
    ...
);
```

**关键点**：
- `text_embedding` 和 `image_embedding` 字段**允许为 NULL**
- 如果字段值是 `NULL`，就认为是 "missing"

## 🔎 诊断逻辑

### 诊断脚本的查询

```sql
SELECT url, title, 
       CASE WHEN text_embedding IS NULL THEN true ELSE false END as missing_text,
       CASE WHEN image_embedding IS NULL THEN true ELSE false END as missing_image
FROM cleantab.opengraph_items
WHERE text_embedding IS NULL OR image_embedding IS NULL
```

### 判断标准

1. **Missing text_embedding**：
   - `text_embedding IS NULL` → `missing_text = true`
   - `text_embedding IS NOT NULL` → `missing_text = false`

2. **Missing image_embedding**：
   - `image_embedding IS NULL` → `missing_image = true`
   - `image_embedding IS NOT NULL` → `missing_image = false`

3. **Missing both**：
   - `text_embedding IS NULL AND image_embedding IS NULL`

## 📋 可能的情况

### 情况 1: 新插入的数据
```
INSERT INTO opengraph_items (url, title, ...)
VALUES ('https://example.com', 'Title', ...)
-- text_embedding 和 image_embedding 都是 NULL
→ Missing both
```

### 情况 2: 只生成了文本 embedding
```
text_embedding = [0.1, 0.2, ...]  (1024维向量)
image_embedding = NULL
→ Missing image_embedding only
```

### 情况 3: 只生成了图像 embedding
```
text_embedding = NULL
image_embedding = [0.3, 0.4, ...]  (1024维向量)
→ Missing text_embedding only
```

### 情况 4: 完整的 embedding
```
text_embedding = [0.1, 0.2, ...]  (1024维向量)
image_embedding = [0.3, 0.4, ...]  (1024维向量)
→ Not missing (不会出现在诊断结果中)
```

## 🔄 数据流程

### 正常流程（应该有 embedding）

```
1. 前端收集 OpenGraph 数据
   ↓
2. 调用 /api/v1/search/embedding
   ↓
3. 生成 text_embedding 和 image_embedding
   ↓
4. 存储到数据库
   ↓
5. text_embedding 和 image_embedding 都有值（不是 NULL）
```

### 缺失 embedding 的原因

1. **历史数据**：
   - 在实现 embedding 功能之前的数据
   - 这些数据只有基础字段（url, title, image），没有 embedding

2. **生成失败**：
   - API 调用失败
   - 网络问题
   - 模型服务不可用

3. **部分生成**：
   - 只生成了 text_embedding，image_embedding 失败
   - 或反之

4. **数据迁移**：
   - 从旧系统迁移的数据
   - 旧数据没有 embedding 字段

## ✅ 补全策略

诊断脚本会：

1. **找出所有 missing 的项**：
   ```sql
   WHERE text_embedding IS NULL OR image_embedding IS NULL
   ```

2. **从数据库读取完整数据**：
   - 包括 title, description, image 等字段

3. **重新生成 embedding**：
   - 调用 `process_opengraph_for_search()`
   - 生成缺失的 embedding

4. **更新数据库**：
   ```sql
   UPDATE opengraph_items
   SET text_embedding = $1::vector(1024),
       image_embedding = $2::vector(1024),
       updated_at = NOW()
   WHERE url = $3
   ```

## 📊 统计示例

```
[Diagnose] Total items missing embeddings: 50
[Diagnose] Breakdown:
  - Missing text_embedding: 30      ← text_embedding IS NULL
  - Missing image_embedding: 40     ← image_embedding IS NULL
  - Missing both: 20                ← 两者都是 NULL
```

## 🎯 总结

**"Missing embedding" 的判断标准**：
- ✅ **对比数据库表结构**：字段定义为 `vector(1024)`，允许 NULL
- ✅ **检查字段值**：如果字段值是 `NULL`，就是 missing
- ✅ **不是对比其他数据**：只检查当前记录自己的字段值

**简单来说**：
- 有值（非 NULL）→ 不是 missing
- 无值（NULL）→ 是 missing





