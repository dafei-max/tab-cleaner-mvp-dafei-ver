# 搜索系统完整文档

## 📋 目录

1. [搜索流程详解](#搜索流程详解)
2. [数据库字段和标签分析](#数据库字段和标签分析)
3. [成本分析](#成本分析)
4. [优化建议](#优化建议)

---

## 搜索流程详解

### 整体架构：三阶段漏斗搜索

```
用户查询
    ↓
[阶段0] AI查询增强（可选）
    ↓
[阶段1] 粗召回（Multi-Recall）- 多路径并发召回
    ↓
[阶段2] AI筛选（Smart Filtering）- 智能过滤和排序
    ↓
最终结果
```

---

### 阶段0：AI查询增强（Query Enhancement）

**位置**: `search/ai_intent_enhance.py` → `hybrid_intent_detection()`

**功能**：
- 使用混合策略（规则式 + AI）理解用户真实意图
- 提取颜色、物体、风格等视觉属性
- 增强查询文本（添加相关词条）

**流程**：
1. **规则式提取**：使用 `enhance_visual_query()` 提取基础信息
2. **AI增强**（可选，超时3秒）：
   - 调用 `qwen-turbo` 模型
   - 分析用户意图
   - 提取更丰富的视觉属性
   - 生成增强查询文本
3. **合并结果**：规则式 + AI 结果合并

**示例**：
```
输入: "绿色植物"
输出: {
  "enhanced_query": "green plant plant design tree visual foliage inspiration...",
  "colors": ["green", "emerald", "olive"],
  "objects": ["plant", "tree", "foliage", "vegetation"],
  "styles": ["minimalist", "nature-inspired"]
}
```

**成本**：
- 每次搜索：0-1次 LLM 调用（如果AI增强成功）
- 模型：`qwen-turbo`
- 成本：约 0.001-0.002 元/次（取决于查询长度）

---

### 阶段1：粗召回（Multi-Recall）

**位置**: `search/funnel_search.py` → `search_with_funnel()`

**策略**：多路径并发召回，提高召回率

#### 召回路径（按优先级排序）

##### 路径1：图像向量搜索（Image Vector）
- **函数**: `_coarse_recall_image_vector()`
- **触发条件**: 有 `query_image_url` 或 `query_image_base64`
- **方法**: 
  - 将查询图像 embed 成向量
  - 在 `image_embedding` 列上做余弦相似度搜索
- **阈值**: `IMAGE_EMBEDDING_THRESHOLD = 0.24` (24%)
- **召回数量**: `top_k=80`
- **适用场景**: 以图搜图

##### 路径1b：文本→图像向量搜索（Text-to-Image Vector）
- **函数**: `_coarse_recall_text_to_image_vector()`
- **触发条件**: 始终开启（有查询文本时）
- **方法**:
  - 将查询文本 embed 成向量（使用 `qwen2.5-vl-embedding`）
  - 在 `image_embedding` 列上做相似度搜索（多模态文本搜图）
- **阈值**: `IMAGE_EMBEDDING_THRESHOLD = 0.24` (24%)
- **召回数量**: `top_k=80`
- **适用场景**: 文本搜图（主要信号）

##### 路径2a：Caption Embedding 向量搜索（Caption Embedding）
- **函数**: `_coarse_recall_caption_embedding()`
- **触发条件**: `use_caption=True`（默认开启）且有 `caption_embedding` 字段
- **方法**:
  - 将查询文本 embed 成向量（使用 `qwen2.5-vl-embedding`）
  - 在 `caption_embedding` 列上做余弦相似度搜索（Caption语义搜索）
- **阈值**: `IMAGE_EMBEDDING_THRESHOLD = 0.24` (24%，更宽松)
- **召回数量**: `top_k=60`
- **适用场景**: Caption语义搜索，能理解同义词和语义相似性（如"椅子"可以匹配"chair"、"seating"等）
- **优势**: 比关键词搜索更智能，能理解语义相似性

##### 路径2b：Caption 关键词搜索（Caption Keyword）
- **函数**: `_coarse_recall_caption_keyword()`
- **触发条件**: `use_caption=True`（默认开启）
- **方法**:
  - 使用 `jieba` 分词器处理中文查询
  - 在 `image_caption` 字段上做 ILIKE 模糊匹配
  - 完全匹配 rank=1.0，部分匹配 rank=0.5
- **阈值**: `CAPTION_RANK_THRESHOLD = 0.65` (65%，只保留完全匹配和部分匹配)
- **召回数量**: `top_k=80`
- **适用场景**: 基于图像描述的文本搜索（作为语义搜索的补充）

##### 路径3：视觉属性搜索（Visual Attributes）
- **函数**: `_coarse_recall_visual_attributes()`
- **触发条件**: 查询包含颜色或风格关键词
- **方法**:
  - 提取查询的颜色和风格
  - 在 `dominant_colors` 和 `style_tags` 数组字段上做匹配
- **召回数量**: `top_k=50`
- **适用场景**: 颜色/风格精确匹配

##### 路径4：设计师网站专门召回（Designer Sites）
- **函数**: `_coarse_recall_designer_sites()`
- **触发条件**: 始终开启
- **方法**:
  - 在设计师网站（Pinterest、Behance、Dribbble、小红书等）上做向量搜索
  - 优先使用 `image_embedding`（设计师网站主要是图片）
- **召回数量**: `top_k=100`
- **适用场景**: 确保设计师网站内容被充分召回

##### 路径5：文本向量搜索（Text Vector）
- **函数**: `_coarse_recall_text_vector()`
- **触发条件**: 始终开启
- **方法**:
  - 将查询文本 embed 成向量
  - 在 `text_embedding` 列上做相似度搜索
- **阈值**: `MIN_SIMILARITY_THRESHOLD = 0.28` (28%)
- **召回数量**: `top_k=80`
- **适用场景**: 文本内容搜索（最低优先级）

#### 粗召回后处理

1. **文档类过滤**：
   - 使用 `is_doc_like()` 检测文档类内容
   - 检查 `metadata.is_doc_card` 标记
   - 过滤技术文档、API文档、工作台等

2. **标签匹配过滤**：
   - 如果查询有明确的视觉属性（颜色/物体/风格）
   - 检查结果是否匹配这些属性
   - 过滤完全不匹配的结果（如查询"绿色"但结果是"红色"）

3. **去重**：
   - 基于 URL（标准化，移除查询参数和锚点）
   - 基于标题相似度（过滤重复的周会记录、工作台等）

**成本**：
- 每次搜索：1次 Embedding API 调用（生成查询向量）
- 模型：`qwen2.5-vl-embedding`
- 成本：约 0.0005-0.001 元/次（取决于查询长度）
- 数据库查询：6-7次向量搜索（并发执行，成本可忽略）

---

### 阶段2：AI筛选（Smart Filtering）

**位置**: `search/smart_filter.py` → `smart_filter()`

**策略**：5步智能过滤和排序

#### 步骤1：过滤文档类内容

- 使用 `filter_doc_items()` 过滤文档类内容
- 针对设计师场景，自动过滤技术文档

#### 步骤1.5：提升设计师网站优先级

- 识别设计师网站（Pinterest、Behance、Dribbble、小红书等）
- 对设计师网站结果加分：`similarity += 0.15`（最高到1.0）
- 重新按相似度排序

#### 步骤2：检测查询意图（AI增强）

- 优先使用混合策略：规则式 + AI增强
- AI增强超时：2秒
- 提取信息：
  - 颜色（如：green, blue）
  - 物体（如：plant, chair）
  - 风格（如：minimalist, modern）
- 判断是否为视觉查询

#### 步骤3：第一层规则过滤

**如果是视觉查询**：
- 使用 `smart_filter_by_visual_attributes()` 进行视觉属性匹配
- 匹配规则：
  - 颜色匹配：检查 `dominant_colors` 字段
  - 物体匹配：检查 `object_tags` 字段 + 标题/描述/caption文本
  - 风格匹配：检查 `style_tags` 字段
- 保留策略：
  - 视觉属性匹配的结果：即使相似度较低（≥0.10）也保留
  - 视觉属性不匹配的结果：相似度≥0.10也保留
- 排序：先返回视觉匹配的，再补充其他高质量结果

**如果是非视觉查询**：
- 使用常规阈值过滤（`filter_by_threshold`）
- 根据 `filter_mode`（strict/balanced/relaxed）应用不同阈值

#### 步骤4：VL模型二次审阅（核心AI筛选）

**4.1 调用视觉语言模型（Qwen-VL）**
- 只验证前12个候选结果（节省成本）
- 并发验证（最多3个并发，避免限流）
- 对每张图片：
  1. 下载图片（超时5秒）
  2. 压缩到512px（节省token）
  3. 调用VL API，判断：
     - 是否与查询相关
     - 是否为高质量设计内容
     - 是否应提升优先级

**4.2 根据AI建议过滤/保留**
```python
# AI返回三个列表：
- relevant_indices: 相关结果的索引
- filter_out_indices: 应该过滤的结果索引  
- boost_indices: 应该提升优先级的结果索引
```

过滤逻辑：
1. 如果索引在 `filter_out_indices` 中 → 直接过滤
2. 如果 `relevant` 列表不为空：
   - 索引在 `relevant` 中 → 保留
   - 索引不在 `relevant` 中 → 过滤
3. 如果 `relevant` 列表为空（AI验证失败）：
   - 保留所有结果（除了明确要过滤的）

**4.3 提升优先级**
- 对 `boost_indices` 中的结果：`similarity += 0.05`
- 重新按相似度排序

**4.4 容错机制**
- 如果AI过滤后结果为空 → 回退到原始候选列表
- 如果AI验证失败 → 使用规则过滤结果

#### 步骤5：质量标签

- 根据 `filter_mode` 的质量阈值打标签：
  - `high`: 相似度 >= 高阈值
  - `medium`: 相似度 >= 中阈值
  - `low`: 相似度 < 中阈值

**成本**：
- 每次搜索：0-12次 VL API 调用（只验证前12个结果）
- 模型：`qwen-vl-max`
- 成本：约 0.01-0.12 元/次（取决于验证数量，通常验证8-12个）
- 图片下载：0-12次（并发，成本可忽略）

---

## 数据库字段和标签分析

### 当前使用的字段

#### 核心字段（已使用）

1. **`text_embedding vector(1024)`**
   - ✅ 用于文本向量搜索（路径5）
   - ✅ 用于文本→图像向量搜索（路径1b）

2. **`image_embedding vector(1024)`**
   - ✅ 用于图像向量搜索（路径1）
   - ✅ 用于文本→图像向量搜索（路径1b）
   - ✅ 用于设计师网站召回（路径4）

3. **`image_caption TEXT`**
   - ✅ 用于Caption关键词搜索（路径2）
   - ✅ 用于物体匹配（AI筛选阶段）

4. **`dominant_colors TEXT[]`**
   - ✅ 用于视觉属性搜索（路径3）
   - ✅ 用于颜色匹配（AI筛选阶段）

5. **`style_tags TEXT[]`**
   - ✅ 用于视觉属性搜索（路径3）
   - ✅ 用于风格匹配（AI筛选阶段）

6. **`object_tags TEXT[]`**
   - ✅ 用于物体匹配（AI筛选阶段）

7. **`title`, `description`, `site_name`**
   - ✅ 用于关键词匹配（AI筛选阶段）
   - ✅ 用于文档类检测

8. **`metadata JSONB`**
   - ✅ 用于存储 `is_doc_card` 标记
   - ✅ 用于存储 `caption`（降级方案）

### 未使用但可用的字段

#### 1. **`caption_embedding vector(1024)`** ✅ 已启用

**当前状态**：
- 字段已存在
- 索引已创建（`idx_opengraph_items_v2_caption_embedding`）
- ✅ **已实现**：在搜索流程中使用（路径2a）

**功能**：
- **Caption语义搜索**：在 `caption_embedding` 上做向量搜索
- **优势**：比关键词搜索更智能，能理解语义相似性
- **示例**：查询"椅子"可以匹配"chair"、"seating"、"furniture"等

**实现**：
- 函数：`_coarse_recall_caption_embedding()`（路径2a）
- 优先级：在Caption关键词搜索之前（更智能）
- 阈值：`IMAGE_EMBEDDING_THRESHOLD = 0.24` (24%)

**数据补充**：
- 使用脚本：`batch_generate_caption_embeddings.py`
- 功能：批量将有 `image_caption` 但缺少 `caption_embedding` 的记录补充 embedding

**预期效果**：
- ✅ 提高Caption搜索的召回率和准确率
- ✅ 能理解同义词和语义相似性

---

#### 2. **`screenshot_image TEXT`** ⚠️ 部分使用

**当前状态**：
- 字段已存在
- 在AI筛选阶段用于图片验证（`item.get("screenshot_image") or item.get("image")`）
- 但**未用于embedding生成**

**潜在用途**：
- **截图优先策略**：如果有 `screenshot_image`，优先使用截图生成embedding
- **优势**：截图更能反映用户实际看到的内容

**实现建议**：
```python
# 在 pipeline.py 中
image_url = item.get("screenshot_image") or item.get("image")
```

---

#### 3. **`tab_id INTEGER`, `tab_title TEXT`** ⚠️ 部分使用

**当前状态**：
- 字段已存在
- `tab_title` 用于去重和文档检测
- 但**未用于搜索排序**

**潜在用途**：
- **标签页关联搜索**：同一标签页的内容可能有相关性
- **时间排序**：`tab_id` 可能反映时间顺序（新标签页ID更大）

**实现建议**：
- 在相似度相同时，优先返回同一标签页的内容
- 或者作为辅助排序信号

---

#### 4. **`created_at TIMESTAMP`, `updated_at TIMESTAMP`** ⚠️ 未使用

**当前状态**：
- 字段已存在
- 但**未用于搜索排序**

**潜在用途**：
- **时间衰减**：新内容优先（设计师场景，新设计更有价值）
- **新鲜度加权**：在相似度基础上，新内容加分

**实现建议**：
```python
# 在 smart_filter.py 中
def boost_recent_items(results: List[Dict], boost_factor: float = 0.05):
    """提升最近更新的内容优先级"""
    for item in results:
        updated_at = item.get("updated_at")
        if updated_at:
            days_old = (datetime.now() - updated_at).days
            # 30天内的内容加分
            if days_old <= 30:
                item["similarity"] = min(1.0, item["similarity"] + boost_factor)
    return results
```

---

#### 5. **`metadata` 中的其他字段** ⚠️ 未充分利用

**当前使用的metadata字段**：
- `metadata.is_doc_card` ✅
- `metadata.caption` ✅（降级方案）

**metadata中可能存在的其他字段**（需要确认）：
- `metadata.is_screenshot` - 是否是截图
- `metadata.favicon` - 网站图标
- `metadata.domain` - 域名
- `metadata.tags` - 用户自定义标签

**潜在用途**：
- **用户标签搜索**：如果用户给内容打了标签，可以基于标签搜索
- **域名过滤**：允许用户过滤特定域名的结果

---

### 索引分析

#### 已创建的索引

1. **向量索引**（HNSW）：
   - `idx_opengraph_items_v2_text_embedding` ✅ 使用中
   - `idx_opengraph_items_v2_image_embedding` ✅ 使用中
   - `idx_opengraph_items_v2_caption_embedding` ⚠️ **未使用**

2. **GIN索引**（数组字段）：
   - `idx_opengraph_items_v2_dominant_colors_gin` ✅ 使用中
   - `idx_opengraph_items_v2_style_tags_gin` ✅ 使用中
   - `idx_opengraph_items_v2_object_tags_gin` ✅ 使用中

3. **全文索引**：
   - `idx_opengraph_items_v2_image_caption_fts` ⚠️ **未使用**（当前使用ILIKE，未使用全文搜索）

4. **B-tree索引**：
   - `idx_opengraph_items_v2_user_id` ✅ 使用中

---

## 成本分析

### 单次搜索成本估算

#### 1. Embedding API 调用

**调用次数**：1次（生成查询向量）

**模型**：`qwen2.5-vl-embedding`

**成本**（参考阿里云定价，2024年）：
- 文本embedding：约 0.0005-0.001 元/次（取决于文本长度）
- 图像embedding：约 0.001-0.002 元/次（如果以图搜图）

**总计**：约 **0.0005-0.002 元/次**

---

#### 2. AI查询增强（可选）

**调用次数**：0-1次（如果AI增强成功）

**模型**：`qwen-turbo`

**成本**：
- 输入tokens：约 200-500 tokens（查询文本 + prompt）
- 输出tokens：约 300-800 tokens（增强查询 + 提取信息）
- 成本：约 **0.001-0.002 元/次**

---

#### 3. VL模型验证（核心成本）

**调用次数**：0-12次（只验证前12个候选结果）

**模型**：`qwen-vl-max`

**成本**（参考阿里云定价）：
- 单次调用：约 0.01-0.02 元/次（取决于图片大小和prompt长度）
- 12次调用：约 **0.12-0.24 元/次**

**优化**：
- 当前已优化：只验证前12个结果
- 图片压缩到512px（节省token）
- 并发限制为3个（避免限流）

---

#### 4. 数据库查询

**查询次数**：6-7次向量搜索（并发执行）

**成本**：**可忽略**（数据库查询成本极低）

---

### 总成本估算

#### 典型场景（AI增强成功，验证10个结果）

| 项目 | 调用次数 | 单次成本 | 小计 |
|------|---------|---------|------|
| Embedding API | 1 | 0.001 | 0.001 |
| AI查询增强 | 1 | 0.0015 | 0.0015 |
| VL模型验证 | 10 | 0.015 | 0.15 |
| 数据库查询 | 7 | 0.0001 | 0.0007 |
| **总计** | - | - | **约 0.15-0.20 元/次** |

#### 低成本场景（AI增强失败，验证5个结果）

| 项目 | 调用次数 | 单次成本 | 小计 |
|------|---------|---------|------|
| Embedding API | 1 | 0.001 | 0.001 |
| AI查询增强 | 0 | 0 | 0 |
| VL模型验证 | 5 | 0.015 | 0.075 |
| 数据库查询 | 7 | 0.0001 | 0.0007 |
| **总计** | - | - | **约 0.08-0.10 元/次** |

#### 高成本场景（AI增强成功，验证12个结果）

| 项目 | 调用次数 | 单次成本 | 小计 |
|------|---------|---------|------|
| Embedding API | 1 | 0.001 | 0.001 |
| AI查询增强 | 1 | 0.002 | 0.002 |
| VL模型验证 | 12 | 0.02 | 0.24 |
| 数据库查询 | 7 | 0.0001 | 0.0007 |
| **总计** | - | - | **约 0.24-0.30 元/次** |

---

### 成本优化建议

#### 1. 减少VL验证数量（已实施）

- ✅ 当前：只验证前12个结果
- 💡 可优化：根据相似度阈值动态调整验证数量
  - 如果前5个结果相似度都很高（>0.8），可能不需要验证更多

#### 2. 缓存AI增强结果

- 💡 对常见查询缓存AI增强结果
- 💡 减少重复的LLM调用

#### 3. 批量验证（如果支持）

- 💡 如果VL API支持批量输入，可以减少API调用次数

#### 4. 降级策略

- ✅ 当前：AI验证失败时回退到规则过滤
- 💡 可优化：根据用户等级或查询频率决定是否使用VL验证

---

## 优化建议

### 短期优化（1-2周）

#### 1. 启用 `caption_embedding` 搜索 ✅ 已完成

**优先级**：高

**实现**：
- ✅ 添加 `_coarse_recall_caption_embedding()` 函数
- ✅ 在粗召回阶段加入此路径（路径2a）
- ✅ 创建批量生成脚本 `batch_generate_caption_embeddings.py`
- ✅ 预期提升Caption搜索的召回率和准确率

**成本**：无额外成本（使用已有的embedding）

**下一步**：
- 运行批量生成脚本补充数据：`python search/batch_generate_caption_embeddings.py --user-id anonymous`

---

#### 2. 使用全文索引优化Caption搜索

**优先级**：中

**实现**：
- 将 `_coarse_recall_caption_keyword()` 中的 ILIKE 查询改为全文搜索
- 使用 `to_tsvector()` 和 `ts_rank()` 函数

**优势**：
- 更快的查询速度
- 更好的相关性排序

**成本**：无额外成本

---

#### 3. 添加时间衰减因子

**优先级**：中

**实现**：
- 在AI筛选阶段，对30天内的内容加分
- 提升新内容的优先级

**成本**：无额外成本

---

### 中期优化（1-2月）

#### 1. 智能调整VL验证数量

**优先级**：高

**实现**：
- 根据前N个结果的相似度分布，动态决定验证数量
- 如果前5个结果相似度都很高，可能不需要验证更多

**预期效果**：
- 减少20-40%的VL API调用
- 降低成本到 0.10-0.15 元/次

---

#### 2. 缓存AI增强结果

**优先级**：中

**实现**：
- 对常见查询（如"椅子"、"绿色植物"）缓存AI增强结果
- 使用Redis或内存缓存

**预期效果**：
- 减少30-50%的LLM调用
- 提升响应速度

---

#### 3. 用户标签搜索

**优先级**：低

**实现**：
- 如果用户给内容打了标签，支持基于标签搜索
- 在metadata中存储用户标签

**预期效果**：
- 提升个性化搜索体验

---

### 长期优化（3-6月）

#### 1. 学习用户偏好

**优先级**：中

**实现**：
- 记录用户点击和收藏行为
- 基于用户历史调整排序权重

**预期效果**：
- 提升搜索相关性
- 个性化体验

---

#### 2. 多模态融合优化

**优先级**：低

**实现**：
- 优化文本和图像embedding的融合权重
- 根据查询类型动态调整权重

**预期效果**：
- 提升多模态搜索准确率

---

## 总结

### 当前系统优势

1. ✅ **高召回率**：多路径并发召回，确保不遗漏相关结果
2. ✅ **高准确率**：AI筛选阶段使用VL模型验证，确保结果质量
3. ✅ **成本可控**：只验证前12个结果，成本约0.15-0.20元/次
4. ✅ **容错机制**：AI失败时回退到规则过滤，保证可用性

### 待优化点

1. ⚠️ **`caption_embedding` 未使用**：可以提升Caption搜索效果
2. ⚠️ **全文索引未使用**：可以优化Caption搜索性能
3. ⚠️ **时间因子未使用**：可以提升新内容优先级
4. ⚠️ **成本可进一步优化**：通过智能调整验证数量

### 推荐优先级

1. **高优先级**：启用 `caption_embedding` 搜索
2. **中优先级**：智能调整VL验证数量、使用全文索引
3. **低优先级**：时间衰减、用户标签搜索

---

**文档版本**：v1.0  
**最后更新**：2025-12-03  
**维护者**：Search Team

