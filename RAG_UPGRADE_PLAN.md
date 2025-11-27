# RAG 升级方案：从向量检索到专业 AI 搜索

## 📊 当前架构分析

### 现有能力 ✅

1. **向量检索（Retrieval）**
   - ✅ 使用 AnalyticDB PostgreSQL 进行向量存储
   - ✅ 支持 `text_embedding` 和 `image_embedding` 双路检索
   - ✅ 使用 `qwen2.5-vl-embedding` 生成统一向量空间（1024维）
   - ✅ 余弦相似度计算和融合排序

2. **LLM 基础设施**
   - ✅ 已有 Qwen Chat API 调用（`clustering/ai_discover.py`, `ai_insight.py`）
   - ✅ DashScope API Key 配置
   - ✅ 已有 prompt 构建经验

### 缺失能力 ❌

1. **Augmentation（增强）**
   - ❌ 没有将检索到的文档构建为上下文
   - ❌ 没有构建 RAG prompt

2. **Generation（生成）**
   - ❌ 搜索只返回文档列表，没有生成答案
   - ❌ 没有使用 LLM 基于上下文生成回答

---

## 🎯 RAG 升级目标

### 方案 A：纯后端 RAG（推荐）

**流程**：
```
用户查询 → embedding → 向量检索 → 构建 prompt → LLM 生成答案 → 返回答案 + 文档列表
```

**优点**：
- 搜索准确度显著提升
- 可以生成自然语言答案
- 保持现有向量检索能力

**缺点**：
- 需要调用 LLM，增加延迟和成本
- 需要处理 prompt 长度限制

### 方案 B：混合模式（灵活）

**流程**：
```
用户查询 → embedding → 向量检索 → 
  ├─ 返回文档列表（现有功能）
  └─ 可选：调用 LLM 生成答案摘要
```

**优点**：
- 向后兼容现有前端
- 可以逐步迁移
- 用户可以选择是否使用 AI 答案

---

## 📋 升级步骤

### 步骤 1：创建 RAG 模块

**文件**：`backend/app/search/rag.py`

**功能**：
- `build_rag_prompt()`: 构建 RAG prompt
- `generate_answer()`: 调用 LLM 生成答案
- `rag_search()`: 完整的 RAG 搜索流程

### 步骤 2：修改搜索 API

**文件**：`backend/app/main.py`

**修改**：
- 添加可选参数 `use_rag: bool = False`
- 如果启用 RAG，调用 `rag_search()`
- 返回格式：`{ "answer": "...", "results": [...], "sources": [...] }`

### 步骤 3：优化 Prompt 构建

**考虑因素**：
- 检索到的文档数量（top_k）
- Prompt 长度限制（Qwen 支持 8K tokens）
- 文档内容提取（title + description + image URL）

### 步骤 4：前端适配（可选）

**修改**：
- 显示 AI 生成的答案摘要
- 显示检索到的文档列表
- 支持切换"向量检索"和"RAG 搜索"模式

---

## 🔧 技术实现细节

### 1. Prompt 模板设计

```python
RAG_PROMPT_TEMPLATE = """你是一个智能搜索助手。请根据以下检索到的网页信息，回答用户的问题。

用户问题：{query}

检索到的相关网页：
{context}

要求：
1. 基于检索到的信息回答问题
2. 如果信息不足，说明原因
3. 引用具体的网页来源
4. 回答要简洁准确，不超过200字

回答："""
```

### 2. 上下文构建

```python
def build_context_from_results(results: List[Dict], max_items: int = 5) -> str:
    """从检索结果构建上下文"""
    context_parts = []
    for i, item in enumerate(results[:max_items], 1):
        title = item.get("title") or item.get("tab_title", "无标题")
        desc = item.get("description", "")[:200]  # 限制长度
        url = item.get("url", "")
        context_parts.append(f"{i}. {title}\n   描述：{desc}\n   链接：{url}")
    return "\n\n".join(context_parts)
```

### 3. LLM 调用

使用已有的 Qwen Chat API：
- Endpoint: `https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation`
- Model: `qwen-turbo` 或 `qwen-plus`
- Max tokens: 200-500（根据需求）

---

## 📈 预期效果

### 当前向量检索的问题：
- ❌ 只返回相似度排序的文档列表
- ❌ 用户需要自己阅读文档理解答案
- ❌ 对于复杂查询，准确度可能不够

### RAG 升级后的优势：
- ✅ LLM 基于检索到的文档生成直接答案
- ✅ 答案更准确，因为基于实际文档内容
- ✅ 可以引用具体来源，增强可信度
- ✅ 支持复杂查询和推理

---

## 💰 成本考虑

### 当前成本：
- Embedding API：每次搜索 1 次调用
- 向量检索：数据库查询（低成本）

### RAG 升级后成本：
- Embedding API：每次搜索 1 次调用（不变）
- LLM API：每次搜索 1 次调用（新增）
- 成本增加：约 +0.01-0.05 元/次搜索（取决于模型）

### 优化建议：
- 使用 `qwen-turbo`（成本较低）
- 限制 `max_tokens`（200-300）
- 缓存常见查询的答案

---

## 🚀 实施优先级

### Phase 1：基础 RAG（1-2天）
1. 创建 `search/rag.py` 模块
2. 实现 `build_rag_prompt()` 和 `generate_answer()`
3. 在搜索 API 中添加可选 RAG 模式

### Phase 2：优化和测试（2-3天）
1. 优化 prompt 模板
2. 处理边界情况（无结果、API 失败等）
3. 性能测试和成本评估

### Phase 3：前端集成（可选，1-2天）
1. 添加 RAG 模式切换
2. 显示 AI 答案和文档列表
3. 用户体验优化

---

## 📝 代码示例

### 基础 RAG 实现

```python
# backend/app/search/rag.py

import httpx
from typing import List, Dict, Optional
from .config import get_api_key

QWEN_CHAT_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation"

RAG_PROMPT_TEMPLATE = """你是一个智能搜索助手。请根据以下检索到的网页信息，回答用户的问题。

用户问题：{query}

检索到的相关网页：
{context}

要求：
1. 基于检索到的信息回答问题
2. 如果信息不足，说明原因
3. 引用具体的网页来源（使用序号）
4. 回答要简洁准确，不超过200字

回答："""

def build_context_from_results(results: List[Dict], max_items: int = 5) -> str:
    """从检索结果构建上下文"""
    context_parts = []
    for i, item in enumerate(results[:max_items], 1):
        title = item.get("title") or item.get("tab_title", "无标题")
        desc = item.get("description", "")[:200]
        url = item.get("url", "")
        context_parts.append(f"{i}. 【{title}】\n   描述：{desc}\n   链接：{url}")
    return "\n\n".join(context_parts)

async def generate_rag_answer(
    query: str,
    retrieved_results: List[Dict],
    max_context_items: int = 5
) -> Optional[str]:
    """
    使用 RAG 生成答案
    
    Args:
        query: 用户查询
        retrieved_results: 检索到的文档列表
        max_context_items: 最多使用多少个文档作为上下文
    
    Returns:
        LLM 生成的答案，失败返回 None
    """
    api_key = get_api_key()
    if not api_key:
        print("[RAG] ERROR: API key not found")
        return None
    
    if not retrieved_results:
        return None
    
    # 构建上下文
    context = build_context_from_results(retrieved_results, max_context_items)
    
    # 构建 prompt
    prompt = RAG_PROMPT_TEMPLATE.format(query=query, context=context)
    
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
                        "max_tokens": 300,
                        "temperature": 0.7,
                    }
                },
            )
            
            if response.status_code == 200:
                data = response.json()
                output = data.get("output", {})
                choices = output.get("choices", [])
                if choices and len(choices) > 0:
                    answer = choices[0].get("message", {}).get("content", "").strip()
                    print(f"[RAG] Generated answer: {len(answer)} characters")
                    return answer
            else:
                print(f"[RAG] API error: {response.status_code}, {response.text[:200]}")
                return None
    except Exception as e:
        print(f"[RAG] Exception: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return None
```

---

## 🔍 阿里云 AnalyticDB PostgreSQL RAG 服务

根据搜索结果，阿里云 AnalyticDB PostgreSQL 提供了**原生 RAG 服务**，可以：

1. **直接使用 AnalyticDB 的 RAG 功能**
   - 在数据库层面集成检索和生成
   - 减少应用层代码复杂度
   - 更好的性能优化

2. **或者自己实现 RAG（当前方案）**
   - 更灵活的控制
   - 可以自定义 prompt
   - 适合现有架构

**建议**：先自己实现 RAG，验证效果后再考虑迁移到 AnalyticDB 原生 RAG 服务。

---

## ✅ 下一步行动

1. **确认需求**：是否需要立即实现 RAG？
2. **选择方案**：纯后端 RAG 还是混合模式？
3. **实施开发**：按照 Phase 1 开始实现
4. **测试验证**：对比 RAG 和向量检索的效果
5. **优化迭代**：根据测试结果优化 prompt 和参数

---

## 📚 参考资料

- [阿里云 AnalyticDB PostgreSQL RAG 服务文档](https://help.aliyun.com/zh/analyticdb/analyticdb-for-postgresql/user-guide/what-is-rag-service)
- [DashScope Qwen Chat API 文档](https://help.aliyun.com/zh/model-studio/developer-reference/api-details-9)
- [RAG 最佳实践](https://www.alibabacloud.com/help/zh/pai/user-guide/knowledge-base-management)




