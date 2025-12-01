# 融合权重调整指南

## 概述

搜索结果的排序由五路分数融合决定，可以通过调整权重来优化搜索效果。

## 五路分数说明

1. **text_similarity** (文本向量相似度)
   - 基于文本 embedding 的相似度
   - 适用于：文本内容匹配

2. **image_similarity** (图像向量相似度)
   - 基于图像 embedding 的相似度
   - 适用于：视觉内容匹配（最重要）

3. **caption_similarity** (Caption 相似度)
   - 基于图片描述文本的相似度
   - 适用于：语义理解

4. **keyword_match** (关键词匹配)
   - 基于标题、描述、Caption 的关键词匹配
   - 适用于：精确关键词搜索

5. **visual_attributes** (视觉属性匹配)
   - 基于颜色、风格、物体标签的匹配
   - 适用于：视觉属性查询（如"蓝色设计"）

## 当前权重配置

### 默认权重（设计师找图场景）

```python
{
    "text_similarity": 0.10,      # 10% - 文本向量相似度（已降低）
    "image_similarity": 0.40,      # 40% - 图像向量相似度（最高）
    "caption_similarity": 0.25,    # 25% - Caption 相似度
    "keyword_match": 0.10,         # 10% - 关键词匹配（已降低）
    "visual_attributes": 0.15,     # 15% - 视觉属性匹配
}
```

**特点**：
- 图像相似度权重最高（40%）
- 文本相关权重较低（text + keyword = 20%）
- 适合设计师找图场景

## 调整方法

### 方法1: 修改代码（推荐）

编辑 `backend/app/search/fusion_weights.py`：

```python
# 默认权重配置
DEFAULT_FUSION_WEIGHTS = {
    "text_similarity": 0.05,      # 进一步降低文本权重
    "image_similarity": 0.45,      # 进一步提高图像权重
    "caption_similarity": 0.30,    # 提高 Caption 权重
    "keyword_match": 0.05,         # 进一步降低关键词权重
    "visual_attributes": 0.15,     # 保持视觉属性权重
}
```

### 方法2: 使用环境变量

设置环境变量选择预设模式：

```bash
# 视觉优先模式（更偏向图像）
export FUSION_WEIGHT_MODE=visual

# 文本优先模式（文档/博客场景）
export FUSION_WEIGHT_MODE=text

# 平衡模式（所有维度均衡）
export FUSION_WEIGHT_MODE=balanced

# 默认模式（设计师找图场景）
export FUSION_WEIGHT_MODE=default
```

### 方法3: 在代码中动态调整

在 `funnel_search.py` 的 `_fine_ranking` 函数中：

```python
# 自定义权重
custom_weights = {
    "text_similarity": 0.05,      # 降低文本权重
    "image_similarity": 0.45,      # 提高图像权重
    "caption_similarity": 0.30,    # 提高 Caption 权重
    "keyword_match": 0.05,         # 降低关键词权重
    "visual_attributes": 0.15,     # 保持视觉属性权重
}

weights = custom_weights  # 使用自定义权重
```

## 预设权重模式

### 1. 视觉优先模式 (visual)

```python
{
    "text_similarity": 0.05,      # 5% - 最低
    "image_similarity": 0.45,      # 45% - 最高
    "caption_similarity": 0.30,    # 30%
    "keyword_match": 0.05,         # 5% - 最低
    "visual_attributes": 0.15,     # 15%
}
```

**适用场景**：
- Pinterest、Behance、Dribbble 等视觉站
- 设计师找图
- 视觉参考搜索

### 2. 文本优先模式 (text)

```python
{
    "text_similarity": 0.30,      # 30% - 提高
    "image_similarity": 0.20,      # 20% - 降低
    "caption_similarity": 0.20,    # 20%
    "keyword_match": 0.20,         # 20% - 提高
    "visual_attributes": 0.10,     # 10% - 降低
}
```

**适用场景**：
- 文档、博客、技术文章
- 文本内容搜索

### 3. 平衡模式 (balanced)

```python
{
    "text_similarity": 0.20,      # 20%
    "image_similarity": 0.20,      # 20%
    "caption_similarity": 0.20,    # 20%
    "keyword_match": 0.20,         # 20%
    "visual_attributes": 0.20,     # 20%
}
```

**适用场景**：
- 通用搜索
- 不确定内容类型

## 权重调整建议

### 如果文本权重太高

**问题**：文本匹配的结果排得太靠前，但视觉上不相关

**解决方案**：
1. 降低 `text_similarity`（从 0.15 → 0.05-0.10）
2. 降低 `keyword_match`（从 0.15 → 0.05-0.10）
3. 提高 `image_similarity`（从 0.35 → 0.40-0.45）
4. 提高 `caption_similarity`（从 0.20 → 0.25-0.30）

### 如果图像权重太高

**问题**：视觉相似但语义不相关的结果排得太靠前

**解决方案**：
1. 降低 `image_similarity`（从 0.40 → 0.30-0.35）
2. 提高 `text_similarity`（从 0.10 → 0.15-0.20）
3. 提高 `caption_similarity`（从 0.25 → 0.30）

### 如果视觉属性查询效果不好

**问题**：搜索"蓝色设计"时，颜色匹配的结果不够靠前

**解决方案**：
1. 提高 `visual_attributes`（从 0.15 → 0.20-0.25）
2. 确保 `enhance_visual_query` 正确提取颜色/风格

## 测试权重调整

运行测试脚本查看效果：

```bash
cd backend/app
python test_search.py --user-id anonymous
```

观察搜索结果：
- 相似度分数分布
- 召回路径（哪些路径贡献了结果）
- 视觉匹配情况

## 注意事项

1. **权重总和必须为 1.0**：所有权重加起来应该等于 1.0（允许小误差）
2. **权重范围 [0, 1]**：每个权重应该在 0 到 1 之间
3. **测试验证**：调整后需要测试不同查询，确保效果符合预期
4. **逐步调整**：不要一次性大幅调整，建议每次调整 0.05-0.10

## 当前推荐配置（已优化）

针对设计师找图场景，已降低文本权重：

```python
{
    "text_similarity": 0.10,      # 降低：从 0.15 → 0.10
    "image_similarity": 0.40,      # 提高：从 0.35 → 0.40
    "caption_similarity": 0.25,    # 提高：从 0.20 → 0.25
    "keyword_match": 0.10,         # 降低：从 0.15 → 0.10
    "visual_attributes": 0.15,     # 保持：0.15
}
```

**效果**：
- 图像和视觉内容权重更高（40% + 15% = 55%）
- 文本相关权重降低（10% + 10% = 20%）
- 更适合设计师找图场景

