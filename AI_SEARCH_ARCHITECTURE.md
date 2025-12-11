# Tab Cleaner MVP - AI 搜索 Flow 和技术架构文档

## 📋 目录

1. [搜索系统概览](#搜索系统概览)
2. [完整搜索流程](#完整搜索流程)
3. [核心技术组件](#核心技术组件)
4. [向量数据库架构](#向量数据库架构)
5. [查询增强策略](#查询增强策略)
6. [多路召回机制](#多路召回机制)
7. [重排序算法](#重排序算法)
8. [性能优化](#性能优化)

---

## 搜索系统概览

Tab Cleaner MVP 的 AI 搜索系统采用**多模态向量搜索**架构，使用阿里云通义千问的 `qwen2.5-vl-embedding` 模型，实现文本和图像的统一向量空间表示，支持语义搜索、视觉搜索和关键词搜索的融合。

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户查询输入                             │
│                    "蓝色设计" / "blue design"                │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   查询增强模块                                │
│              (search/query_enhance.py)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. 查询类型识别                                        │   │
│  │    - 视觉查询 (visual)                                │   │
│  │    - 技术文档查询 (tech)                              │   │
│  │    - 通用查询 (general)                                │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2. 颜色/风格提取                                        │   │
│  │    - "蓝色" → ["blue", "azure", "navy", ...]          │   │
│  │    - "现代" → ["modern", "contemporary", ...]         │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3. 同义词扩展                                          │   │
│  │    - "设计" → ["design", "creative", "visual"]        │   │
│  │    - "图片" → ["image", "photo", "picture"]          │   │
│  └──────────────────────────────────────────────────────┘   │
│  输出: "蓝色设计 blue azure design visual image"            │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Embedding 生成模块                           │
│                  (search/embed.py)                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ DashScope API (qwen2.5-vl-embedding)                  │   │
│  │ 输入: 增强后的查询文本                                 │   │
│  │ 输出: 1024 维向量                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│  输出: query_vector (1024 维)                               │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   多路召回模块                                │
│              (search/pipeline.py)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 路径1: 向量搜索│  │ 路径2: 关键词│  │ 路径3: 视觉属性│      │
│  │              │  │ 搜索        │  │ 搜索        │      │
│  │ text_embedding│ │ fuzzy_score │  │ color/style │      │
│  │ image_embedding││ (title/desc)│  │ matching    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │              │
│         └─────────────────┴──────────────────┘              │
│                            │                                │
│                    召回结果合并                              │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   重排序模块                                  │
│            (search/rank.py, search/fuse.py)                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. 相似度计算                                          │   │
│  │    - 文本相似度 (cosine_similarity)                    │   │
│  │    - 图像相似度 (cosine_similarity)                    │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2. 自适应权重选择                                      │   │
│  │    - 视觉站点: (0.05, 0.95) 文本5%:图像95%            │   │
│  │    - 文档站点: (0.6, 0.4) 文本60%:图像40%             │   │
│  │    - 默认: (0.2, 0.8) 文本20%:图像80%                 │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3. 分数融合                                            │   │
│  │    - fuse_similarity_scores(text_sim, image_sim)      │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 4. 相似度过滤                                          │   │
│  │    - MIN_SIMILARITY_THRESHOLD = 0.15                  │   │
│  └──────────────────────────────────────────────────────┘   │
│  输出: 排序后的结果列表（similarity >= 0.15）                │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   前端渲染                                    │
│              (PersonalSpace.jsx)                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 放射状布局计算                                        │   │
│  │    - 最相关在内环                                      │   │
│  │    - 向外递减                                         │   │
│  └──────────────────────────────────────────────────────┘   │
│  输出: 搜索结果卡片（放射状排列）                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 完整搜索流程

### 流程 1: 用户查询 → 搜索结果

#### 步骤 1: 用户输入

**Input**:
- 用户在搜索框输入: `"蓝色设计"`

**Process**:
- 前端捕获 Enter 键事件
- 调用 `performSearch(query)`

**Output**:
- 搜索请求发送到后端

---

#### 步骤 2: 查询增强

**Input**:
- 原始查询: `"蓝色设计"`

**Process** (`query_enhance.py`):

```python
1. 查询类型识别
   - 检测到 "设计" → visual 类型
   - default_to_visual = True（设计师找图场景）

2. 颜色提取
   - 检测到 "蓝色" → ["blue", "azure", "navy", "cobalt", ...]
   - 添加到增强查询

3. 同义词扩展
   - "设计" → ["design", "creative", "visual"]
   - 添加到增强查询

4. 视觉关键词添加
   - 添加 ["image", "visual", "design", "photo"]
```

**Output**:
- 增强后的查询: `"蓝色设计 blue azure navy design visual image photo"`

---

#### 步骤 3: 生成查询向量

**Input**:
- 增强后的查询文本

**Process** (`embed.py`):

```python
1. 调用 DashScope API
   - 模型: qwen2.5-vl-embedding
   - 输入: 增强后的查询文本
   - 输出: 1024 维向量

2. 向量归一化（API 自动处理）
```

**Output**:
- 查询向量: `[0.123, -0.456, 0.789, ...]` (1024 维)

---

#### 步骤 4: 多路召回

**Input**:
- 查询向量 (1024 维)
- 用户 ID
- 查询文本（原始 + 增强）

**Process** (`pipeline.py`):

##### 路径 1: 向量搜索

```python
# 文本相似度搜索
SELECT *, 
       1 - (text_embedding <=> $1::vector) as text_similarity
FROM opengraph_items_v2
WHERE user_id = $2
  AND text_embedding IS NOT NULL
  AND 1 - (text_embedding <=> $1::vector) > 0.15
ORDER BY text_embedding <=> $1::vector
LIMIT 20

# 图像相似度搜索
SELECT *, 
       1 - (image_embedding <=> $1::vector) as image_similarity
FROM opengraph_items_v2
WHERE user_id = $2
  AND image_embedding IS NOT NULL
  AND 1 - (image_embedding <=> $1::vector) > 0.15
ORDER BY image_embedding <=> $1::vector
LIMIT 20
```

**Output**:
- 文本搜索结果: `[{url, title, text_similarity: 0.85}, ...]`
- 图像搜索结果: `[{url, title, image_similarity: 0.90}, ...]`

##### 路径 2: 关键词搜索

```python
# 模糊匹配（fuzzy_score）
for item in user_items:
    title = item.get("title", "")
    desc = item.get("description", "")
    score = fuzzy_score("蓝色设计", title, desc)
    # score = 0.6 if "蓝色" in text
    # score += 0.4 * (matched_tokens / total_tokens)
    # score += 0.15 if query in title
```

**Output**:
- 关键词搜索结果: `[{url, title, fuzzy_score: 0.75}, ...]`

##### 路径 3: 视觉属性搜索

```python
# 颜色匹配
enhanced_query = enhance_visual_query("蓝色设计")
# enhanced_query["colors"] = ["blue", "azure", "navy"]

for item in user_items:
    # 检查 item 的 title/description 是否包含颜色词
    color_match = any(color in item.get("title", "").lower() 
                     for color in enhanced_query["colors"])
    if color_match:
        visual_score += 0.3
```

**Output**:
- 视觉属性搜索结果: `[{url, title, visual_score: 0.65}, ...]`

---

#### 步骤 5: 结果融合与重排序

**Input**:
- 多路召回结果（向量、关键词、视觉）

**Process** (`rank.py`, `fuse.py`):

```python
1. 合并结果（去重）
   all_results = {}
   for item in vector_results + keyword_results + visual_results:
       if item["url"] not in all_results:
           all_results[item["url"]] = item
       else:
           # 合并相似度分数
           all_results[item["url"]]["text_sim"] = max(
               all_results[item["url"]].get("text_sim", 0),
               item.get("text_similarity", 0)
           )
           all_results[item["url"]]["image_sim"] = max(
               all_results[item["url"]].get("image_sim", 0),
               item.get("image_similarity", 0)
           )
           all_results[item["url"]]["fuzzy_score"] = max(
               all_results[item["url"]].get("fuzzy_score", 0),
               item.get("fuzzy_score", 0)
           )

2. 计算融合相似度
   for item in all_results.values():
       # 选择自适应权重
       weights = _choose_weights(item)
       # 例如: (0.2, 0.8) 文本20%:图像80%
       
       # 融合文本和图像相似度
       text_sim = item.get("text_sim", 0)
       image_sim = item.get("image_sim", 0)
       vector_sim = fuse_similarity_scores(
           text_sim, image_sim, weights=weights
       )
       
       # 融合向量相似度和关键词相似度
       fuzzy_sim = item.get("fuzzy_score", 0)
       final_sim = 0.7 * vector_sim + 0.3 * fuzzy_sim
       
       item["similarity"] = final_sim

3. 排序
   results = sorted(all_results.values(), 
                   key=lambda x: x["similarity"], 
                   reverse=True)

4. 过滤
   filtered_results = [
       r for r in results 
       if r["similarity"] >= MIN_SIMILARITY_THRESHOLD  # 0.15
   ]
```

**Output**:
- 排序后的结果: `[{url, title, similarity: 0.85}, ...]` (最多 20 个)

---

#### 步骤 6: 前端渲染

**Input**:
- 搜索结果数组

**Process** (`PersonalSpace.jsx`):

```javascript
1. 计算放射状布局
   const radius = 200; // 内环半径
   const angleStep = (2 * Math.PI) / results.length;
   
   results.forEach((item, index) => {
     const angle = index * angleStep;
     const distance = radius * (1 - item.similarity); // 相似度越高，越靠近中心
     item.x = Math.cos(angle) * distance;
     item.y = Math.sin(angle) * distance;
   });

2. 更新状态
   setOpengraphData(results);
   setShowOriginalImages(false);

3. 触发渲染
   React 自动重新渲染卡片
```

**Output**:
- 搜索结果以放射状布局显示
- 最相关的卡片在内环
- 相似度向外递减

---

## 核心技术组件

### 1. Embedding 模型

#### 模型信息

- **模型**: `qwen2.5-vl-embedding`
- **提供商**: 阿里云 DashScope
- **维度**: 1024
- **特点**: 统一向量空间（文本和图像在同一空间）

#### 使用场景

```python
# 文本 Embedding
text_vector = await embed_text("蓝色设计")
# 输出: [0.123, -0.456, 0.789, ...] (1024 维)

# 图像 Embedding
image_vector = await embed_image(image_base64)
# 输出: [0.234, -0.567, 0.890, ...] (1024 维)

# 直接比较（同一向量空间）
similarity = cosine_similarity(text_vector, image_vector)
# 输出: 0.85 (相似度分数)
```

---

### 2. 向量数据库

#### 数据库信息

- **平台**: Aliyun AnalyticDB PostgreSQL
- **扩展**: pgvector
- **索引**: IVFFlat (Inverted File with Flat Compression)

#### 表结构

```sql
CREATE TABLE cleantab.opengraph_items_v2 (
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    description TEXT,
    image TEXT,
    text_embedding vector(1024),
    image_embedding vector(1024),
    status TEXT DEFAULT 'active',
    PRIMARY KEY (user_id, url)
);

-- 向量索引
CREATE INDEX idx_user_text_embedding 
  ON opengraph_items_v2 
  USING ivfflat (text_embedding vector_cosine_ops);

CREATE INDEX idx_user_image_embedding 
  ON opengraph_items_v2 
  USING ivfflat (image_embedding vector_cosine_ops);
```

#### 搜索查询

```sql
-- 文本相似度搜索
SELECT *, 
       1 - (text_embedding <=> $1::vector) as similarity
FROM opengraph_items_v2
WHERE user_id = $2
  AND text_embedding IS NOT NULL
  AND status = 'active'
  AND 1 - (text_embedding <=> $1::vector) > 0.15
ORDER BY text_embedding <=> $1::vector
LIMIT 20;
```

**说明**:
- `<=>` 是 pgvector 的余弦距离操作符
- `1 - (a <=> b)` 转换为相似度分数 [0, 1]
- `WHERE user_id = $2` 确保用户隔离

---

### 3. 查询增强模块

#### 功能

1. **查询类型识别**
   - 视觉查询（visual）
   - 技术文档查询（tech）
   - 通用查询（general）

2. **颜色/风格提取**
   - 中文颜色词 → 英文同义词列表
   - 中文风格词 → 英文同义词列表

3. **同义词扩展**
   - 中英文同义词映射
   - 自动添加相关关键词

#### 代码示例

```python
# 基础增强
enhanced = enhance_query("蓝色设计")
# 输出: "蓝色设计 blue azure design visual image"

# 视觉查询增强
visual_result = enhance_visual_query("蓝色设计")
# 输出: {
#   "original": "蓝色设计",
#   "enhanced": "蓝色设计 blue azure design visual image",
#   "colors": ["blue", "azure", "navy"],
#   "styles": [],
#   "keywords": ["设计"]
# }
```

---

### 4. 多路召回模块

#### 召回路径

| 路径 | 方法 | 适用场景 | 权重 |
|------|------|----------|------|
| 向量搜索 | 余弦相似度 | 语义匹配 | 70% |
| 关键词搜索 | 模糊匹配 | 精确匹配 | 20% |
| 视觉属性搜索 | 颜色/风格匹配 | 视觉查询 | 10% |

#### 融合策略

```python
# 多路召回结果
vector_results = [...]  # 向量搜索
keyword_results = [...]  # 关键词搜索
visual_results = [...]   # 视觉属性搜索

# 合并去重
all_results = merge_results(vector_results, keyword_results, visual_results)

# 融合分数
for item in all_results:
    final_score = (
        0.7 * item["vector_sim"] +
        0.2 * item["fuzzy_score"] +
        0.1 * item["visual_score"]
    )
    item["similarity"] = final_score
```

---

### 5. 重排序模块

#### 自适应权重

```python
def _choose_weights(item: Dict) -> Tuple[float, float]:
    """根据内容类型选择融合权重"""
    url = item.get("url", "").lower()
    
    # 视觉站点（Pinterest, 小红书等）
    if any(k in url for k in ["pinterest", "xiaohongshu", "behance"]):
        return (0.05, 0.95)  # 文本5%:图像95%
    
    # 文档站点（GitHub, 文档站等）
    if any(k in url for k in ["github.com", "/docs/", "stackoverflow"]):
        return (0.6, 0.4)  # 文本60%:图像40%
    
    # 默认（设计师找图场景）
    return (0.2, 0.8)  # 文本20%:图像80%
```

#### 相似度融合

```python
def fuse_similarity_scores(
    text_sim: float,
    image_sim: float,
    weights: Tuple[float, float] = (0.2, 0.8),
) -> float:
    """融合文本和图像相似度"""
    wt, wi = weights
    return wt * text_sim + wi * image_sim
```

---

## 向量数据库架构

### 1. 数据存储

#### Embedding 生成流程

```
OpenGraph 数据
  ↓
process_opengraph_for_search()
  ├─ 提取文本: title + description
  ├─ 生成文本 embedding (embed_text)
  ├─ 下载/处理图像
  └─ 生成图像 embedding (embed_image)
  ↓
保存到数据库
  ├─ text_embedding: vector(1024)
  └─ image_embedding: vector(1024)
```

#### 批量处理

```python
# 批量生成 embedding（每批 5 个）
items = [item1, item2, ..., item10]
batch_size = 5

for i in range(0, len(items), batch_size):
    batch = items[i:i+batch_size]
    enriched = await process_opengraph_for_search(batch)
    await batch_upsert_items(enriched, user_id)
    await asyncio.sleep(0.2)  # 节流
```

---

### 2. 索引优化

#### IVFFlat 索引

```sql
CREATE INDEX idx_user_text_embedding 
  ON opengraph_items_v2 
  USING ivfflat (text_embedding vector_cosine_ops)
  WITH (lists = 100);
```

**参数说明**:
- `lists`: 聚类中心数量（默认 100）
- 适用于: 大规模向量搜索（> 10,000 条记录）
- 优势: 快速近似搜索，适合实时查询

#### 部分索引

```sql
CREATE INDEX idx_status 
  ON opengraph_items_v2 (status) 
  WHERE status = 'active';
```

**优势**: 只索引活跃数据，减少索引大小

---

## 查询增强策略

### 1. 颜色识别

```python
COLOR_MAP = {
    "蓝色": ["blue", "azure", "navy", "cobalt", "sky blue"],
    "红色": ["red", "crimson", "scarlet", "burgundy"],
    "绿色": ["green", "emerald", "olive", "lime"],
    # ...
}

# 使用
if "蓝色" in query:
    enhanced_query += " blue azure navy"
```

---

### 2. 风格识别

```python
STYLE_MAP = {
    "简约": ["minimalist", "simple", "clean", "minimal design"],
    "现代": ["modern", "contemporary", "sleek"],
    "复古": ["vintage", "retro", "classic"],
    # ...
}
```

---

### 3. 同义词扩展

```python
SYNONYM_MAP = {
    "设计": ["design", "creative", "visual"],
    "图片": ["image", "photo", "picture", "pic"],
    "教程": ["tutorial", "guide", "how to"],
    # ...
}
```

---

## 多路召回机制

### 1. 向量召回

**优势**: 语义理解，支持模糊匹配

**示例**:
- 查询: "蓝色设计"
- 匹配: "blue design", "azure creative", "navy visual"

---

### 2. 关键词召回

**优势**: 精确匹配，支持部分匹配

**示例**:
- 查询: "蓝色设计"
- 匹配: title 或 description 中包含 "蓝色" 或 "设计"

---

### 3. 视觉属性召回

**优势**: 颜色/风格匹配，适合视觉查询

**示例**:
- 查询: "蓝色设计"
- 匹配: 标题或描述中包含 "blue", "azure" 等颜色词

---

## 重排序算法

### 1. 相似度计算

```python
# 文本相似度
text_sim = cosine_similarity(query_vec, item["text_embedding"])

# 图像相似度
image_sim = cosine_similarity(query_vec, item["image_embedding"])

# 融合相似度
final_sim = fuse_similarity_scores(
    text_sim, image_sim, 
    weights=_choose_weights(item)
)
```

---

### 2. 自适应权重

| 内容类型 | 文本权重 | 图像权重 | 说明 |
|----------|----------|----------|------|
| 视觉站点 | 5% | 95% | Pinterest, 小红书等 |
| 文档站点 | 60% | 40% | GitHub, 文档站等 |
| 默认 | 20% | 80% | 其他站点（设计师找图场景） |

---

### 3. 相似度阈值

```python
MIN_SIMILARITY_THRESHOLD = 0.15

# 过滤低质量结果
filtered_results = [
    r for r in results 
    if r["similarity"] >= MIN_SIMILARITY_THRESHOLD
]
```

**说明**: 相似度 < 0.15 的结果被认为是无关结果，会被过滤掉

---

## 性能优化

### 1. 批量处理

```python
# 批量生成 embedding（每批 5 个）
batch_size = 5
for i in range(0, len(items), batch_size):
    batch = items[i:i+batch_size]
    await process_opengraph_for_search(batch)
    await asyncio.sleep(0.2)  # 节流
```

---

### 2. 缓存机制

```python
# 检查数据库是否已有 embedding
existing = await get_opengraph_item(user_id, url)
if existing and existing.get("text_embedding") and existing.get("image_embedding"):
    # 跳过，不重新生成
    return existing
```

---

### 3. 索引优化

- **IVFFlat 索引**: 加速向量搜索
- **部分索引**: 只索引活跃数据
- **用户索引**: 加速用户过滤

---

## 错误处理

### 1. Embedding 生成失败

```python
try:
    text_vec = await embed_text(text)
except Exception as e:
    print(f"Embedding generation failed: {e}")
    text_vec = None  # 使用 None，后续会 fallback 到关键词搜索
```

---

### 2. 数据库查询失败

```python
try:
    results = await search_by_text_embedding(query_vec, user_id)
except Exception as e:
    print(f"Database query failed: {e}")
    # Fallback 到本地模糊搜索
    results = fuzzy_search_locally(query, user_items)
```

---

### 3. 空结果处理

```python
if not results or len(results) == 0:
    # 使用本地模糊搜索兜底
    results = fuzzy_rank_locally(query, opengraph_items)
```

---

## 总结

Tab Cleaner MVP 的 AI 搜索系统采用**多模态向量搜索**架构，通过查询增强、多路召回、重排序等机制，实现了高准确度的语义搜索。系统支持文本和图像的统一向量空间表示，能够理解用户的查询意图，并返回最相关的结果。

**核心特点**:
1. **统一向量空间**: 文本和图像在同一空间，可直接比较
2. **多路召回**: 向量、关键词、视觉属性三路召回
3. **自适应权重**: 根据内容类型自动调整文本/图像权重
4. **用户隔离**: 每个用户只能搜索自己的数据
5. **性能优化**: 批量处理、缓存、索引优化

**适用场景**:
- 设计师找图（视觉查询）
- 技术文档搜索（文本查询）
- 混合内容搜索（文本+图像）





