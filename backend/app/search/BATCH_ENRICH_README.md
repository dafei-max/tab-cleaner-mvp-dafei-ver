# 批量生成 Caption 脚本使用指南

## 概述

`batch_enrich_captions.py` 用于批量从数据库获取没有 Caption 的数据，调用 Qwen-VL API 生成 Caption 和视觉属性，并更新数据库。

## 功能特性

1. **自动检测**：从数据库获取没有 Caption 的数据（`metadata->>'caption' IS NULL`）
2. **批量处理**：支持分批处理，避免内存溢出
3. **并发处理**：支持并发生成 Caption（默认 5 个并发）
4. **进度显示**：实时显示处理进度和统计信息
5. **错误处理**：自动重试和错误记录
6. **用户隔离**：支持按用户 ID 过滤

## 使用方法

### 基本使用

```bash
cd backend/app
python search/batch_enrich_captions.py
```

### 命令行参数

```bash
python search/batch_enrich_captions.py [OPTIONS]
```

**参数说明**：

- `--user-id USER_ID`: 只处理特定用户的数据（默认：处理所有用户）
- `--batch-size N`: 批量大小，每次处理的项数（默认：10）
- `--max-items N`: 最多处理数量（默认：100）
- `--concurrent N`: 并发数量（默认：5）
- `--no-caption-embedding`: 不生成 Caption embedding（默认：生成）

### 使用示例

#### 1. 处理所有用户的数据（最多 100 项）

```bash
python search/batch_enrich_captions.py
```

#### 2. 只处理特定用户的数据

```bash
python search/batch_enrich_captions.py --user-id user123
```

#### 3. 自定义批量大小和并发数

```bash
python search/batch_enrich_captions.py \
  --batch-size 20 \
  --concurrent 10 \
  --max-items 200
```

#### 4. 不生成 Caption embedding（节省 API 调用）

```bash
python search/batch_enrich_captions.py --no-caption-embedding
```

## 处理流程

```
1. 从数据库查询没有 Caption 的数据
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
   ├─ 更新 metadata 字段
   │  ├─ caption: 图片描述
   │  ├─ dominant_colors: 主要颜色列表
   │  ├─ style_tags: 风格标签列表
   │  ├─ object_tags: 物体标签列表
   │  └─ caption_generated_at: 生成时间
   └─ 更新 updated_at 时间戳
   ↓
5. 显示统计信息
```

## 数据库更新

### Metadata 字段结构

更新后的 `metadata` JSONB 字段包含：

```json
{
  "caption": "A modern blue chair in a minimalist living room...",
  "dominant_colors": ["blue", "white", "gray"],
  "style_tags": ["modern", "minimalist"],
  "object_tags": ["chair", "furniture", "room"],
  "caption_generated_at": "2025-11-27T20:00:00.000000"
}
```

### 查询条件

脚本会查询满足以下条件的数据：

- `status = 'active'`（只处理活跃数据）
- `metadata->>'caption' IS NULL OR metadata->>'caption' = ''`（没有 Caption）
- `image IS NOT NULL AND image != ''`（有图片）

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

## 注意事项

### 1. API 限制

- **Qwen-VL API**：按 token 计费，注意控制并发数
- **限流**：如果遇到 429 错误，脚本会自动重试（指数退避）
- **超时**：单个请求超时时间为 60 秒

### 2. 性能优化

- **批量大小**：建议 10-20（太小效率低，太大内存占用高）
- **并发数**：建议 5-10（根据 API 限流情况调整）
- **批次延迟**：批次之间自动延迟 1 秒，避免限流

### 3. 错误处理

- **网络错误**：自动重试（最多 3 次）
- **API 错误**：记录错误并继续处理下一项
- **数据库错误**：记录错误并继续处理

### 4. 数据安全

- **只处理活跃数据**：`status = 'active'`
- **不覆盖已有 Caption**：只处理没有 Caption 的数据
- **保留原始数据**：只更新 `metadata` 字段，不修改其他字段

## 环境变量

确保以下环境变量已设置：

```bash
# 阿里云 DashScope API Key
DASHSCOPE_API_KEY=your_api_key_here

# 数据库配置
ADBPG_HOST=your_db_host
ADBPG_PORT=5432
ADBPG_DBNAME=postgres
ADBPG_USER=your_db_user
ADBPG_PASSWORD=your_db_password
ADBPG_NAMESPACE=cleantab
```

## 故障排查

### 1. API Key 未找到

```
❌ 错误: 未找到 DASHSCOPE_API_KEY 环境变量
```

**解决方案**：在 `.env` 文件中设置 `DASHSCOPE_API_KEY`

### 2. 数据库连接失败

```
[VectorDB] Error connecting to database...
```

**解决方案**：检查数据库配置和环境变量

### 3. 没有找到数据

```
✅ 没有需要处理的数据
```

**解决方案**：检查数据库中是否有满足条件的数据（有图片且没有 Caption）

### 4. API 限流

```
[QwenVL] Rate limited, waiting 2s before retry...
```

**解决方案**：降低并发数（`--concurrent 3`）或增加批次延迟

## 后续步骤

1. **集成到 Pipeline**：在生成 embedding 时自动生成 Caption
2. **搜索优化**：使用 Caption 和视觉属性进行搜索匹配
3. **缓存机制**：缓存已生成的 Caption，避免重复调用

