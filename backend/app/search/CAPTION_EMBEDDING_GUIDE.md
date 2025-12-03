# Caption Embedding 使用指南

## 概述

`caption_embedding` 字段用于存储图像 Caption 的向量表示，支持语义搜索。相比关键词搜索，语义搜索能理解同义词和语义相似性，提升搜索效果。

## 功能

### 1. 批量生成 Caption Embedding

**脚本位置**: `search/batch_generate_caption_embeddings.py`

**功能**: 将所有有 `image_caption` 但缺少 `caption_embedding` 的记录补充 embedding

### 2. Caption Embedding 搜索路径

**函数**: `_coarse_recall_caption_embedding()`（路径2a）

**优先级**: 在 Caption 关键词搜索之前（更智能）

**优势**: 
- 能理解语义相似性（如"椅子"可以匹配"chair"、"seating"等）
- 比关键词搜索更智能

---

## 使用方法

### 步骤1：检查数据状态

```bash
cd backend/app
python check_missing_tags.py --user-id anonymous
```

查看有多少记录缺少 `caption_embedding`。

### 步骤2：批量生成 Embedding（预览模式）

```bash
python search/batch_generate_caption_embeddings.py \
  --user-id anonymous \
  --batch-size 50 \
  --max-items 100 \
  --dry-run
```

**参数说明**：
- `--user-id`: 用户ID（默认: anonymous）
- `--batch-size`: 每批处理数量（默认: 50）
- `--max-items`: 最大处理数量（默认: 处理所有）
- `--dry-run`: 预览模式，不实际更新数据库

### 步骤3：实际生成 Embedding

```bash
python search/batch_generate_caption_embeddings.py \
  --user-id anonymous \
  --batch-size 50
```

**注意**：
- 脚本会自动处理所有缺少 `caption_embedding` 的记录
- 会避免API限流（每批之间有延迟）
- 可以随时中断，下次运行会继续处理未完成的记录

### 步骤4：验证结果

```bash
python check_missing_tags.py --user-id anonymous
```

确认所有记录都有 `caption_embedding`。

---

## 搜索流程

### 当前召回路径优先级

1. **图像向量搜索**（路径1）
2. **文本→图像向量搜索**（路径1b）
3. **Caption Embedding 向量搜索**（路径2a）✅ **新增**
4. **Caption 关键词搜索**（路径2b）
5. **视觉属性搜索**（路径3）
6. **设计师网站召回**（路径4）
7. **文本向量搜索**（路径5）

### 搜索示例

**查询**: "椅子"

**Caption Embedding 搜索**（路径2a）：
- 将"椅子" embed 成向量
- 在 `caption_embedding` 列上做相似度搜索
- 可以匹配包含 "chair"、"seating"、"furniture" 等语义相似词的 Caption

**Caption 关键词搜索**（路径2b）：
- 使用 jieba 分词："椅子"
- 在 `image_caption` 字段上做 ILIKE 模糊匹配
- 只能匹配包含"椅子"关键词的 Caption

---

## 成本

### 批量生成成本

- **API调用**: 每个 Caption 1次 Embedding API 调用
- **模型**: `qwen2.5-vl-embedding`
- **成本**: 约 0.0005-0.001 元/条（取决于 Caption 长度）

**示例**：
- 1000条记录：约 0.5-1.0 元
- 10000条记录：约 5-10 元

### 搜索成本

- **无额外成本**：Caption Embedding 搜索使用已有的 embedding，不产生新的 API 调用

---

## 注意事项

1. **字段检查**：脚本会自动检查 `caption_embedding` 字段是否存在，如果不存在会提示先运行升级脚本

2. **API限流**：脚本会自动控制请求频率，避免触发限流

3. **中断恢复**：可以随时中断脚本，下次运行会继续处理未完成的记录（因为只处理 `caption_embedding IS NULL` 的记录）

4. **数据完整性**：建议在生成完所有 embedding 后再进行搜索，以获得最佳效果

---

## 故障排查

### 问题1：字段不存在

**错误**: `caption_embedding column not found`

**解决**: 运行升级脚本
```bash
python upgrade_schema_caption.py
```

### 问题2：API调用失败

**错误**: `生成失败: ...`

**解决**: 
- 检查 API key 是否正确设置
- 检查网络连接
- 查看错误日志

### 问题3：处理速度慢

**原因**: API限流或网络延迟

**解决**: 
- 减小 `--batch-size` 参数
- 检查 `EMBED_SLEEP_S` 配置（在 `config.py` 中）

---

## 相关文件

- **批量生成脚本**: `search/batch_generate_caption_embeddings.py`
- **搜索函数**: `search/funnel_search.py` → `_coarse_recall_caption_embedding()`
- **数据库函数**: `vector_db.py` → `search_by_caption_embedding()`
- **检查脚本**: `check_missing_tags.py`

---

**最后更新**: 2025-12-03

