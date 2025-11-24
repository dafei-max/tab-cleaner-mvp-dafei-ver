# 搜索准确度提升方案

## 🎯 目标

**不需要 RAG/Chat 生成答案**，只需要**提高检索结果的准确度**，让返回的文档列表更贴近用户查询。

---

## 📊 当前检索流程分析

### 现有流程：
```
用户查询 → embed_text(query) → 向量检索 → 相似度融合 → 返回排序结果
```

### 可能的问题点：
1. **查询 embedding 质量**：简单文本可能不够准确
2. **相似度计算**：只使用余弦相似度，可能不够精细
3. **缺少重排序**：没有对候选结果进行二次精排
4. **查询理解不足**：没有对用户意图进行深入理解

---

## 🚀 提升方案

### 方案 1：查询增强（Query Enhancement）⭐ 推荐

**思路**：在生成 embedding 前，对查询进行增强，提高语义理解。

**实现**：
- 查询扩展：添加同义词、相关词
- 查询重写：将口语化查询转换为更正式的检索词
- 意图识别：识别查询类型（找图、找文档、找代码等）

**优点**：
- 实现简单，效果明显
- 不需要改变现有架构
- 可以结合关键词和语义搜索

**示例**：
```python
# 用户输入："椅子设计"
# 增强后："椅子设计 chair design furniture design 座椅设计"
# 然后生成 embedding
```

---

### 方案 2：交叉编码器重排序（Cross-Encoder Re-ranking）⭐⭐ 最推荐

**思路**：使用更强大的模型对查询-文档对进行精确相似度计算。

**流程**：
```
向量检索（粗排）→ 取 Top 20-30 → 交叉编码器精排 → 返回 Top 10
```

**优点**：
- 准确度提升最明显
- 可以同时考虑查询和文档的完整信息
- 不需要改变现有向量检索流程

**实现**：
- 使用 `qwen-turbo` 或专门的 rerank 模型
- 对每个候选文档，计算 `similarity(query, doc_title + doc_description)`
- 重新排序并返回

**成本**：
- 每次搜索需要调用 LLM（但只对 Top 20-30 个候选）
- 可以使用更便宜的模型（如 `qwen-turbo`）

---

### 方案 3：混合检索（Hybrid Search）

**思路**：结合关键词搜索（BM25）和向量搜索。

**流程**：
```
查询 → 
  ├─ 向量检索（语义相似度）
  └─ 关键词检索（BM25）
  
合并结果 → 加权融合 → 返回
```

**优点**：
- 关键词匹配更精确
- 语义理解更深入
- 两者互补

**缺点**：
- 需要实现 BM25 索引
- 需要调整融合权重

---

### 方案 4：多粒度检索（Multi-Granularity Retrieval）

**思路**：对文档的不同部分分别检索，然后融合。

**实现**：
- 分别计算查询与 `title`、`description`、`image` 的相似度
- 使用不同权重融合（title 权重更高）
- 可以针对不同类型的内容使用不同的 embedding

**优点**：
- 更细粒度的匹配
- 可以突出重要字段（如 title）

**当前已有**：文本和图像 embedding 融合，可以进一步优化权重

---

## 💡 推荐实施路线

### Phase 1：查询增强（1-2天）⭐

**目标**：提高查询 embedding 质量

**实现**：
1. 添加查询预处理函数
2. 识别查询类型（视觉/文本/混合）
3. 根据类型调整查询文本
4. 可选：添加同义词扩展

**代码位置**：`backend/app/search/embed.py` 的 `embed_text()` 函数

---

### Phase 2：交叉编码器重排序（2-3天）⭐⭐

**目标**：对检索结果进行精排

**实现**：
1. 创建 `search/rerank.py` 模块
2. 实现 `rerank_results()` 函数
3. 在搜索 API 中调用重排序
4. 优化 prompt 和参数

**代码位置**：
- 新建：`backend/app/search/rerank.py`
- 修改：`backend/app/main.py` 的 `search_content()` 函数

---

### Phase 3：优化权重和融合策略（1-2天）

**目标**：进一步优化相似度计算

**实现**：
1. 分析不同类型查询的效果
2. 调整文本/图像权重
3. 优化 title vs description 权重
4. A/B 测试不同策略

---

## 🔧 具体实现示例

### 1. 查询增强实现

```python
# backend/app/search/query_enhance.py

def enhance_query(query: str, query_type: str = "auto") -> str:
    """
    增强查询文本，提高 embedding 质量
    
    Args:
        query: 原始查询
        query_type: 查询类型（"visual", "text", "auto"）
    
    Returns:
        增强后的查询文本
    """
    query = query.strip()
    
    # 识别查询类型
    if query_type == "auto":
        visual_keywords = ["图", "图片", "设计", "视觉", "颜色", "风格", "photo", "image", "design", "visual"]
        if any(kw in query.lower() for kw in visual_keywords):
            query_type = "visual"
        else:
            query_type = "text"
    
    # 根据类型增强
    if query_type == "visual":
        # 视觉查询：强调图像相关词汇
        enhanced = f"{query} image visual design"
    else:
        # 文本查询：保持原样或添加相关词
        enhanced = query
    
    return enhanced.strip()
```

---

### 2. 交叉编码器重排序实现

```python
# backend/app/search/rerank.py

import httpx
from typing import List, Dict
from .config import get_api_key

QWEN_CHAT_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"

async def rerank_with_cross_encoder(
    query: str,
    candidates: List[Dict],
    top_k: int = 10
) -> List[Dict]:
    """
    使用交叉编码器对候选结果进行重排序
    
    Args:
        query: 用户查询
        candidates: 候选文档列表（已包含 title, description, url）
        top_k: 返回前 K 个结果
    
    Returns:
        重排序后的文档列表（包含 rerank_score）
    """
    api_key = get_api_key()
    if not api_key:
        print("[Rerank] WARNING: API key not found, skipping rerank")
        return candidates[:top_k]
    
    if len(candidates) == 0:
        return []
    
    # 只对前 30 个候选进行重排序（减少成本）
    candidates_to_rerank = candidates[:min(30, len(candidates))]
    
    # 构建 prompt：让模型对每个文档进行评分
    doc_texts = []
    for i, doc in enumerate(candidates_to_rerank):
        title = doc.get("title") or doc.get("tab_title", "")
        desc = doc.get("description", "")[:150]  # 限制长度
        doc_texts.append(f"{i+1}. {title}\n   {desc}")
    
    prompt = f"""请根据用户查询，对以下文档进行相关性评分（0-10分，10分最相关）。

用户查询：{query}

文档列表：
{chr(10).join(doc_texts)}

请返回 JSON 格式，每个文档一行：
{{"index": 1, "score": 8.5, "reason": "标题和描述都高度相关"}}
{{"index": 2, "score": 6.0, "reason": "部分相关"}}
...

只返回 JSON，不要其他文字。"""

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                QWEN_CHAT_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "qwen-turbo",
                    "input": {
                        "messages": [
                            {
                                "role": "user",
                                "content": prompt,
                            }
                        ]
                    },
                    "parameters": {
                        "max_tokens": 500,
                        "temperature": 0.3,  # 降低温度，提高一致性
                    }
                },
            )
            
            if response.status_code == 200:
                data = response.json()
                output = data.get("output", {})
                choices = output.get("choices", [])
                if choices:
                    # 解析模型返回的评分
                    # 这里简化处理，实际需要解析 JSON
                    # 如果解析失败，回退到原始排序
                    pass
        
        # 简化版本：使用更简单的 prompt，直接让模型排序
        # 或者使用 embedding 相似度作为 rerank_score
        return _simple_rerank(query, candidates_to_rerank, top_k)
        
    except Exception as e:
        print(f"[Rerank] Exception: {e}, falling back to original order")
        return candidates[:top_k]


def _simple_rerank(query: str, candidates: List[Dict], top_k: int) -> List[Dict]:
    """
    简化版重排序：使用查询与文档的文本相似度
    """
    from .embed import embed_text
    import asyncio
    
    # 生成查询 embedding
    query_emb = asyncio.run(embed_text(query))
    if not query_emb:
        return candidates[:top_k]
    
    # 对每个候选文档，计算查询与 title+description 的相似度
    from .fuse import cosine_similarity
    
    for doc in candidates:
        title = doc.get("title") or doc.get("tab_title", "")
        desc = doc.get("description", "")[:200]
        doc_text = f"{title} {desc}".strip()
        
        # 生成文档文本的 embedding
        doc_emb = asyncio.run(embed_text(doc_text))
        if doc_emb:
            # 计算相似度
            rerank_score = cosine_similarity(query_emb, doc_emb)
            doc["rerank_score"] = rerank_score
        else:
            doc["rerank_score"] = doc.get("similarity", 0.0)  # 回退到原始相似度
    
    # 按 rerank_score 排序
    candidates.sort(key=lambda x: x.get("rerank_score", 0.0), reverse=True)
    return candidates[:top_k]
```

---

### 3. 集成到搜索 API

```python
# backend/app/main.py (修改 search_content 函数)

@app.post("/api/v1/search/query")
async def search_content(request: SearchRequest):
    # ... 现有代码 ...
    
    # 1. 查询增强
    from search.query_enhance import enhance_query
    enhanced_query = enhance_query(request.query)
    query_embedding = await embed_text(enhanced_query)  # 使用增强后的查询
    
    # ... 向量检索 ...
    
    # 2. 交叉编码器重排序（可选）
    use_rerank = request.use_rerank if hasattr(request, 'use_rerank') else True
    
    if use_rerank and len(ranked_results) > 0:
        from search.rerank import rerank_with_cross_encoder
        final_results = await rerank_with_cross_encoder(
            query=request.query,  # 使用原始查询
            candidates=ranked_results[:30],  # 只对前30个重排序
            top_k=top_k
        )
    else:
        final_results = ranked_results[:top_k]
    
    # ... 返回结果 ...
```

---

## 📈 预期效果

### 当前问题：
- ❌ 某些查询返回的结果不够相关
- ❌ 相似度计算可能不够精确
- ❌ 没有考虑查询意图

### 优化后：
- ✅ 查询增强提高 embedding 质量
- ✅ 重排序提高 Top 结果准确度
- ✅ 更贴近用户意图的检索结果

---

## 💰 成本考虑

### 方案 1（查询增强）：
- **成本**：几乎为 0（只是文本处理）
- **效果**：中等提升

### 方案 2（交叉编码器重排序）：
- **成本**：每次搜索 +1 次 LLM 调用（对 Top 30 候选）
- **效果**：显著提升
- **估算**：约 +0.01-0.02 元/次搜索

### 优化建议：
- 只对 Top 20-30 个候选重排序（不是全部）
- 使用 `qwen-turbo`（成本较低）
- 可以添加开关，让用户选择是否启用重排序

---

## ✅ 推荐实施顺序

1. **先实施查询增强**（简单、快速、有效）
2. **再实施交叉编码器重排序**（效果最明显）
3. **最后优化权重和融合策略**（精细调整）

---

## 🎯 总结

**不需要 RAG/Chat**，只需要：
1. ✅ **查询增强**：提高查询 embedding 质量
2. ✅ **交叉编码器重排序**：对检索结果精排
3. ✅ **优化权重**：调整文本/图像融合策略

这些方案可以显著提高检索准确度，让返回的文档列表更贴近用户查询。


