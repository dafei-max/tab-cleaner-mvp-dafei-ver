# 批量填充 Caption 和标签数据指南

## 快速开始

### 方法 1: 使用 Shell 脚本（推荐）

```bash
cd backend/app
./fill_captions.sh
```

### 方法 2: 直接运行 Python 脚本

```bash
cd backend/app
python search/batch_enrich_captions.py
```

## 使用示例

### 1. 基本使用（处理所有用户，最多 100 项）

```bash
python search/batch_enrich_captions.py
```

### 2. 处理特定用户

```bash
python search/batch_enrich_captions.py --user-id user123
```

### 3. 自定义批量大小和并发数

```bash
python search/batch_enrich_captions.py \
  --batch-size 20 \
  --concurrent 10 \
  --max-items 200
```

### 4. 不生成 Caption embedding（节省 API 调用）

```bash
python search/batch_enrich_captions.py --no-caption-embedding
```

### 5. 使用 Shell 脚本

```bash
# 基本使用
./fill_captions.sh

# 处理特定用户
./fill_captions.sh --user-id user123

# 自定义参数
./fill_captions.sh --batch-size 20 --concurrent 10 --max-items 200

# 不生成 embedding
./fill_captions.sh --no-embedding
```

## 完整流程

### 步骤 1: 升级数据库 Schema（如果还没升级）

```bash
cd backend/app
python upgrade_schema_caption.py
```

这会添加以下字段：
- `image_caption TEXT`
- `caption_embedding vector(1024)`
- `dominant_colors TEXT[]`
- `style_tags TEXT[]`
- `object_tags TEXT[]`

### 步骤 2: 运行批量填充脚本

```bash
# 处理所有用户的数据（最多 100 项）
python search/batch_enrich_captions.py

# 或者处理更多数据
python search/batch_enrich_captions.py --max-items 500
```

### 步骤 3: 验证数据

```sql
-- 检查有多少项有 Caption
SELECT COUNT(*) 
FROM cleantab.opengraph_items_v2
WHERE image_caption IS NOT NULL 
  AND image_caption != '';

-- 查看示例数据
SELECT url, image_caption, dominant_colors, style_tags, object_tags
FROM cleantab.opengraph_items_v2
WHERE image_caption IS NOT NULL
LIMIT 10;
```

## 处理流程

```
1. 从数据库查询没有 Caption 的数据
   ↓
   查询条件：
   - status = 'active'
   - image_caption IS NULL OR image_caption = ''
   - metadata->>'caption' IS NULL OR metadata->>'caption' = ''
   - image IS NOT NULL AND image != ''
   ↓
2. 分批处理（每批 batch_size 项）
   ↓
3. 并发生成 Caption（concurrent 个并发）
   ├─ 调用 Qwen-VL API 生成 Caption
   ├─ 使用 K-Means 提取颜色
   ├─ 规则式提取风格和物体标签
   └─ 生成 Caption embedding（可选）
   ↓
4. 更新数据库
   ├─ 更新新字段（如果存在）
   │  ├─ image_caption
   │  ├─ caption_embedding
   │  ├─ dominant_colors
   │  ├─ style_tags
   │  └─ object_tags
   └─ 或更新 metadata（向后兼容）
   ↓
5. 显示统计信息
```

## 参数说明

| 参数 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `--user-id` | 只处理特定用户的数据 | 所有用户 | `--user-id user123` |
| `--batch-size` | 批量大小（每次处理的项数） | 10 | `--batch-size 20` |
| `--max-items` | 最多处理数量 | 100 | `--max-items 500` |
| `--concurrent` | 并发数量 | 5 | `--concurrent 10` |
| `--no-caption-embedding` | 不生成 Caption embedding | 生成 | `--no-caption-embedding` |

## 性能优化建议

### 1. 批量大小

- **小批量（5-10）**：适合 API 限流严格的情况
- **中批量（10-20）**：平衡性能和稳定性（推荐）
- **大批量（20+）**：适合 API 限流宽松的情况

### 2. 并发数

- **低并发（3-5）**：适合 API 限流严格的情况
- **中并发（5-10）**：平衡速度和稳定性（推荐）
- **高并发（10+）**：适合 API 限流宽松的情况

### 3. 处理大量数据

如果数据库中有大量数据需要处理：

```bash
# 第一次：处理 100 项
python search/batch_enrich_captions.py --max-items 100

# 第二次：处理 200 项
python search/batch_enrich_captions.py --max-items 200

# 或者循环处理
for i in {1..10}; do
    echo "处理批次 $i..."
    python search/batch_enrich_captions.py --max-items 100
    sleep 60  # 等待 1 分钟避免限流
done
```

## 输出示例

```
============================================================
批量生成 Caption 脚本
============================================================
配置:
  - 用户 ID: 所有用户
  - 批量大小: 10
  - 最多处理: 100 项
  - 并发数量: 5
  - 生成 Caption Embedding: True
============================================================

[BatchEnrich] 正在从数据库获取数据...
[BatchEnrich] Found 50 items without caption

[BatchEnrich] 找到 50 项需要处理

[BatchEnrich] Processing batch 1/5 (10 items)...
  Progress: 0/50 items
[QwenVL] SUCCESS: Caption generated, colors: 3, styles: 2, objects: 3
[BatchEnrich] ✓ [1/50] Generated caption embedding (1024 dims)
[BatchEnrich] ✅ [1/50] Updated: https://example.com/image1...
  Caption: A modern blue chair in a minimalist living room...
  Colors: ['blue', 'white', 'gray']
  Styles: ['modern', 'minimalist']

...

============================================================
处理完成 - 统计信息
============================================================
  总计: 50 项
  成功: 48 项
  失败: 1 项
  跳过: 1 项
  成功率: 96.0%
============================================================
```

## 故障排查

### 1. 没有找到数据

```
[BatchEnrich] Found 0 items without caption
✅ 没有需要处理的数据
```

**可能原因**：
- 所有数据都已经有 Caption
- 数据库中没有活跃的数据
- 查询条件太严格

**解决方案**：
- 检查数据库：`SELECT COUNT(*) FROM cleantab.opengraph_items_v2 WHERE status = 'active' AND image IS NOT NULL;`
- 检查是否有 Caption：`SELECT COUNT(*) FROM cleantab.opengraph_items_v2 WHERE image_caption IS NOT NULL;`

### 2. API 限流

```
[QwenVL] Rate limited, waiting 2s before retry...
```

**解决方案**：
- 降低并发数：`--concurrent 3`
- 减小批量大小：`--batch-size 5`
- 增加批次间延迟

### 3. 数据库连接失败

```
[VectorDB] Error connecting to database...
```

**解决方案**：
- 检查 `.env` 文件中的数据库配置
- 确保数据库服务正在运行
- 检查网络连接

### 4. 图片下载失败

```
[Caption] Failed to download image: https://...
```

**解决方案**：
- 检查图片 URL 是否可访问
- 某些网站需要特殊 headers（已在代码中处理）
- 如果图片 URL 无效，该项会被跳过

## 数据验证

### 检查填充进度

```sql
-- 统计有 Caption 的数据
SELECT 
    COUNT(*) as total_items,
    COUNT(image_caption) as items_with_caption,
    COUNT(image_caption) * 100.0 / COUNT(*) as caption_percentage
FROM cleantab.opengraph_items_v2
WHERE status = 'active' AND image IS NOT NULL;
```

### 查看填充的数据

```sql
-- 查看示例数据
SELECT 
    url,
    image_caption,
    dominant_colors,
    style_tags,
    object_tags
FROM cleantab.opengraph_items_v2
WHERE image_caption IS NOT NULL
LIMIT 10;
```

### 检查数据质量

```sql
-- 检查颜色分布
SELECT 
    unnest(dominant_colors) as color,
    COUNT(*) as count
FROM cleantab.opengraph_items_v2
WHERE dominant_colors IS NOT NULL
GROUP BY color
ORDER BY count DESC;

-- 检查风格分布
SELECT 
    unnest(style_tags) as style,
    COUNT(*) as count
FROM cleantab.opengraph_items_v2
WHERE style_tags IS NOT NULL
GROUP BY style
ORDER BY count DESC;
```

## 后续步骤

1. **集成到 Pipeline**：在生成 embedding 时自动生成 Caption
2. **搜索优化**：使用 Caption 和视觉属性进行搜索匹配
3. **定期更新**：设置定时任务定期填充新数据

## 注意事项

1. **API 成本**：Qwen-VL API 按 token 计费，注意控制处理数量
2. **处理时间**：每项大约需要 2-5 秒（包括 API 调用和图片处理）
3. **数据备份**：建议在处理前备份数据库
4. **错误处理**：脚本会自动跳过失败项，继续处理下一项

