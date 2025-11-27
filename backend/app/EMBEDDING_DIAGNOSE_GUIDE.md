# Embedding 诊断与补全指南

## 📋 概述

本指南介绍如何使用诊断脚本检查缺失的 embedding 数据，并批量补全历史数据。

## 🔍 诊断脚本

### 位置
`backend/app/diagnose_embeddings.py`

### 功能

1. **诊断缺失的 embedding**
   - 检查数据库中哪些项缺少 `text_embedding` 或 `image_embedding`
   - 显示统计信息和示例

2. **批量补全 embedding**
   - 为缺失的项生成 embedding
   - 分批处理，避免过载
   - 更新数据库

3. **验证 embedding 质量**
   - 检查 embedding 的完整性
   - 验证向量维度（应该是 1024 维）

## 🚀 使用方法

### 1. 运行诊断脚本

```bash
cd backend/app
python diagnose_embeddings.py
```

### 2. 脚本执行流程

1. **诊断阶段**：检查缺失的 embedding
   ```
   [Diagnose] Total items missing embeddings: 50
   [Diagnose] Breakdown:
     - Missing text_embedding: 30
     - Missing image_embedding: 40
     - Missing both: 20
   ```

2. **验证阶段**：检查 embedding 质量
   ```
   [Verify] Embedding Quality Report:
     - Total items: 1000
     - Items with text_embedding: 970 (97.0%)
     - Items with image_embedding: 960 (96.0%)
     - Items with both: 950 (95.0%)
   ```

3. **补全阶段**（可选）：
   - 询问是否补全
   - 输入 `y` 开始补全
   - 分批处理，显示进度

## 🔧 API 自动补全

### 位置
`backend/app/main.py` → `/api/v1/search/embedding`

### 功能

API 现在会自动检查数据库中已有的 embedding：

1. **检查已有数据**：批量查询数据库，检查哪些 URL 已有 embedding
2. **智能处理**：
   - 如果已有完整的 embedding（text + image），直接使用，跳过生成
   - 如果只有部分 embedding，补全缺失的部分
   - 如果没有 embedding，生成新的
3. **性能优化**：只处理需要生成的项，减少 API 调用

### 工作流程

```
POST /api/v1/search/embedding
  ↓
1. 规范化输入数据
  ↓
2. 批量查询数据库（get_items_by_urls）
  ↓
3. 分类：
   - items_already_done: 已有完整 embedding
   - items_to_process: 需要生成 embedding
  ↓
4. 只为 items_to_process 生成 embedding
  ↓
5. 合并结果并返回
```

## 📊 日志示例

```
[API] Checking database for existing embeddings...
[API] Found 15 items in database
[API] Embedding status: Total=20, Already have=15, To process=5
[API] Generating embeddings for 5 items...
[API] Generated embeddings for 5 items
[API] Total enriched items: 20
```

## ⚙️ 配置

### 环境变量

确保设置了以下环境变量：

```bash
ADBPG_HOST=your-db-host
ADBPG_PORT=5432
ADBPG_DBNAME=postgres
ADBPG_USER=your-username
ADBPG_PASSWORD=your-password
ADBPG_NAMESPACE=cleantab
```

### 批处理大小

在 `diagnose_embeddings.py` 中可以调整批处理大小：

```python
await backfill_embeddings(items, batch_size=10)  # 默认 10
```

## 🐛 故障排除

### 问题 1: 连接数据库失败

**错误**：`Error querying database: ...`

**解决**：
- 检查环境变量是否正确设置
- 确认数据库可访问
- 检查网络连接

### 问题 2: 向量维度不匹配

**错误**：`Warning: text_embedding has X dims, expected 1024`

**解决**：
- 检查 embedding 模型配置
- 确保使用正确的模型（qwen2.5-vl-embedding）

### 问题 3: 补全失败

**错误**：`Failed to generate embedding`

**解决**：
- 检查 API key 是否正确
- 检查网络连接
- 查看详细错误日志

## 📝 注意事项

1. **性能考虑**：
   - 批量查询比单个查询更高效
   - 分批处理避免过载
   - 适当延迟避免 API 限流

2. **数据一致性**：
   - 补全时会更新 `updated_at` 字段
   - 保留原有的其他字段

3. **错误处理**：
   - 单个项失败不影响其他项
   - 记录详细的错误日志

## 🔄 定期维护

建议定期运行诊断脚本：

```bash
# 每周检查一次
python diagnose_embeddings.py
```

这样可以：
- 及时发现缺失的 embedding
- 保持数据完整性
- 优化搜索性能

