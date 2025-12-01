# 数据库 Schema 升级指南

## 概述

本指南说明如何升级数据库 Schema，添加 Caption 相关字段和索引。

## 新增字段

### 1. `image_caption TEXT`
- 存储图片的 Caption（描述文本）
- 用于全文搜索和显示

### 2. `caption_embedding vector(1024)`
- 存储 Caption 的 embedding 向量
- 用于语义搜索

### 3. `dominant_colors TEXT[]`
- 存储主要颜色列表（数组）
- 例如：`['blue', 'white', 'gray']`

### 4. `style_tags TEXT[]`
- 存储风格标签列表（数组）
- 例如：`['modern', 'minimalist']`

### 5. `object_tags TEXT[]`
- 存储物体标签列表（数组）
- 例如：`['chair', 'furniture', 'room']`

## 新增索引

### 1. GIN 索引（数组字段）

```sql
-- dominant_colors
CREATE INDEX idx_opengraph_items_v2_dominant_colors_gin
ON cleantab.opengraph_items_v2
USING GIN (dominant_colors);

-- style_tags
CREATE INDEX idx_opengraph_items_v2_style_tags_gin
ON cleantab.opengraph_items_v2
USING GIN (style_tags);

-- object_tags
CREATE INDEX idx_opengraph_items_v2_object_tags_gin
ON cleantab.opengraph_items_v2
USING GIN (object_tags);
```

**用途**：加速数组字段的查询（如 `WHERE 'blue' = ANY(dominant_colors)`）

### 2. IVFFlat 索引（向量字段）

```sql
CREATE INDEX idx_opengraph_items_v2_caption_embedding
ON cleantab.opengraph_items_v2
USING ann(caption_embedding)
WITH (
    distancemeasure = cosine,
    hnsw_m           = 64,
    pq_enable        = 0
);
```

**用途**：加速 Caption embedding 的相似度搜索

### 3. 全文索引（文本字段）

```sql
CREATE INDEX idx_opengraph_items_v2_image_caption_fts
ON cleantab.opengraph_items_v2
USING GIN (to_tsvector('english', COALESCE(image_caption, '')));
```

**用途**：加速 Caption 的全文搜索

## 升级步骤

### 方法 1: 使用升级脚本（推荐）

```bash
cd backend/app
python upgrade_schema_caption.py
```

**功能**：
- 自动检测字段是否存在
- 自动检测索引是否存在
- 只添加缺失的字段和索引
- 安全，不会重复添加

### 方法 2: 手动执行 SQL

如果升级脚本失败，可以手动执行 SQL：

```sql
-- 1. 添加字段
ALTER TABLE cleantab.opengraph_items_v2
ADD COLUMN IF NOT EXISTS image_caption TEXT;

ALTER TABLE cleantab.opengraph_items_v2
ADD COLUMN IF NOT EXISTS caption_embedding vector(1024);

ALTER TABLE cleantab.opengraph_items_v2
ADD COLUMN IF NOT EXISTS dominant_colors TEXT[];

ALTER TABLE cleantab.opengraph_items_v2
ADD COLUMN IF NOT EXISTS style_tags TEXT[];

ALTER TABLE cleantab.opengraph_items_v2
ADD COLUMN IF NOT EXISTS object_tags TEXT[];

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_opengraph_items_v2_dominant_colors_gin
ON cleantab.opengraph_items_v2 USING GIN (dominant_colors);

CREATE INDEX IF NOT EXISTS idx_opengraph_items_v2_style_tags_gin
ON cleantab.opengraph_items_v2 USING GIN (style_tags);

CREATE INDEX IF NOT EXISTS idx_opengraph_items_v2_object_tags_gin
ON cleantab.opengraph_items_v2 USING GIN (object_tags);

CREATE INDEX IF NOT EXISTS idx_opengraph_items_v2_caption_embedding
ON cleantab.opengraph_items_v2
USING ann(caption_embedding)
WITH (distancemeasure = cosine, hnsw_m = 64, pq_enable = 0);

CREATE INDEX IF NOT EXISTS idx_opengraph_items_v2_image_caption_fts
ON cleantab.opengraph_items_v2
USING GIN (to_tsvector('english', COALESCE(image_caption, '')));
```

## 数据迁移

### 从 metadata 迁移到新字段

如果之前的数据存储在 `metadata` JSONB 字段中，可以运行迁移脚本：

```sql
-- 迁移 Caption 数据
UPDATE cleantab.opengraph_items_v2
SET 
    image_caption = metadata->>'caption',
    dominant_colors = ARRAY(SELECT jsonb_array_elements_text(metadata->'dominant_colors')),
    style_tags = ARRAY(SELECT jsonb_array_elements_text(metadata->'style_tags')),
    object_tags = ARRAY(SELECT jsonb_array_elements_text(metadata->'object_tags'))
WHERE metadata->>'caption' IS NOT NULL
  AND (image_caption IS NULL OR image_caption = '');
```

## 验证升级

### 检查字段

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'cleantab'
  AND table_name = 'opengraph_items_v2'
  AND column_name IN ('image_caption', 'caption_embedding', 'dominant_colors', 'style_tags', 'object_tags');
```

### 检查索引

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'cleantab'
  AND tablename = 'opengraph_items_v2'
  AND indexname LIKE '%caption%' OR indexname LIKE '%colors%' OR indexname LIKE '%tags%';
```

## 向后兼容

### 代码兼容性

`batch_enrich_captions.py` 中的 `update_item_caption()` 函数会自动检测新字段是否存在：

- **如果新字段存在**：直接更新新字段
- **如果新字段不存在**：降级到 `metadata` JSONB 字段（向后兼容）

### 查询兼容性

查询代码应该优先使用新字段，但也要支持从 `metadata` 读取（向后兼容）：

```python
# 优先使用新字段
caption = item.get("image_caption") or item.get("metadata", {}).get("caption", "")
colors = item.get("dominant_colors") or item.get("metadata", {}).get("dominant_colors", [])
```

## 性能影响

### 索引大小

- **GIN 索引**：每个数组字段的索引大小约为数据大小的 2-3 倍
- **IVFFlat 索引**：Caption embedding 索引大小约为向量数据大小的 1.5 倍
- **全文索引**：Caption 全文索引大小约为文本大小的 1.2 倍

### 查询性能

- **数组查询**：使用 GIN 索引，查询速度提升 10-100 倍
- **向量搜索**：使用 IVFFlat 索引，查询速度提升 50-200 倍
- **全文搜索**：使用全文索引，查询速度提升 20-50 倍

## 注意事项

1. **升级前备份**：建议在升级前备份数据库
2. **索引创建时间**：索引创建可能需要几分钟（取决于数据量）
3. **并发控制**：升级期间避免大量写入操作
4. **回滚方案**：如果需要回滚，可以删除新字段和索引（数据不会丢失，只是功能降级）

## 故障排查

### 1. 字段已存在错误

```
ERROR: column "image_caption" already exists
```

**解决方案**：这是正常的，升级脚本会自动跳过已存在的字段

### 2. 索引创建失败

```
ERROR: relation "idx_opengraph_items_v2_caption_embedding" already exists
```

**解决方案**：这是正常的，升级脚本会自动跳过已存在的索引

### 3. 权限不足

```
ERROR: permission denied to create index
```

**解决方案**：确保数据库用户有 CREATE INDEX 权限

## 后续步骤

1. **运行升级脚本**：`python upgrade_schema_caption.py`
2. **运行批量处理**：`python search/batch_enrich_captions.py`
3. **验证数据**：检查新字段是否有数据
4. **更新查询代码**：使用新字段进行搜索

