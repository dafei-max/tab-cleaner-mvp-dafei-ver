# AI 用户意图强化模块（RAG 增强）

## 📋 概述

`ai_intent_enhance.py` 模块使用 LLM（通义千问）来理解和增强用户搜索意图，作为 RAG（检索增强生成）的一部分，提高搜索准确性。

## 🎯 功能

### 1. 用户意图分析（Query Intent Analysis）

**位置**: `enhance_query_intent_with_ai()`

**功能**:
- 分析用户查询的真实意图
- 提取颜色、物体、风格、概念等信息
- 扩展同义词和相关词
- 生成搜索建议（优先网站、过滤类型、相似度阈值）

**Prompt 位置**: `get_intent_analysis_prompt()`

**Prompt 示例**:
```
你是一个专业的设计师搜索助手。请分析用户的搜索查询，理解其真实意图。

用户查询："蓝色设计"

请分析以下内容，并以 JSON 格式返回：
1. 查询类型（visual/object/color/style/concept/general）
2. 提取的关键信息（colors/objects/styles/concepts）
3. 查询增强（扩展同义词和相关词）
4. 搜索建议（优先网站、过滤类型、相似度阈值）
```

### 2. 搜索结果验证（Result Validation）

**位置**: `validate_search_results_with_ai()`

**功能**:
- 二次验证搜索结果的相关性
- 识别应该过滤的结果
- 识别应该提升优先级的结果

**Prompt 位置**: `get_result_validation_prompt()`

### 3. 混合策略（Hybrid Strategy）

**位置**: `hybrid_intent_detection()`

**功能**:
- 规则式方法（快速，毫秒级）
- AI 增强（异步，不阻塞）
- 超时控制（默认2秒）
- 缓存支持（避免重复调用）

**工作流程**:
```
用户查询
  ↓
规则式快速检测（立即返回）
  ↓
异步调用 AI 增强（不阻塞）
  ↓
如果 AI 成功 → 使用 AI 结果
如果 AI 失败/超时 → 使用规则式结果
```

## 📝 Prompt 配置

### 意图分析 Prompt

**文件**: `ai_intent_enhance.py` → `get_intent_analysis_prompt()`

**关键要素**:
1. **角色设定**: "专业的设计师搜索助手"
2. **任务**: 分析用户查询的真实意图
3. **输出格式**: JSON（包含 query_type, extracted_info, enhanced_query, search_suggestions）
4. **设计场景**: 针对设计师找图场景优化

### 结果验证 Prompt

**文件**: `ai_intent_enhance.py` → `get_result_validation_prompt()`

**关键要素**:
1. **任务**: 验证搜索结果的相关性
2. **输出格式**: JSON（包含 relevant_indices, filter_out_indices, boost_indices）
3. **分析维度**: 相关性、过滤建议、优先级提升

## 🔧 使用方法

### 基本使用

```python
from search.ai_intent_enhance import hybrid_intent_detection

# 混合意图检测（规则式 + AI）
intent = await hybrid_intent_detection(
    query="蓝色设计",
    use_ai=True,
    ai_timeout=2.0,
    cache={}
)

print(intent["enhanced_query"])  # AI增强后的查询
print(intent["query_type"])      # 查询类型
print(intent["extracted_info"])  # 提取的信息
```

### 在搜索流程中集成

**文件**: `smart_filter.py`

```python
# 检测查询意图（支持AI增强）
from .ai_intent_enhance import hybrid_intent_detection

enhanced_intent = await hybrid_intent_detection(
    query,
    use_ai=True,
    ai_timeout=2.0,
    cache={}
)
```

## ⚙️ 配置

### API 密钥

**环境变量**: `DASHSCOPE_API_KEY`

**获取方式**: 阿里云 DashScope 控制台

### 模型选择

**当前使用**: `qwen-turbo`（快速，成本低）

**可选**: `qwen-plus`（更准确，但更慢更贵）

**位置**: `ai_intent_enhance.py` → `call_llm_for_intent()`

```python
response = Generation.call(
    model="qwen-turbo",  # 或 "qwen-plus"
    prompt=prompt,
    temperature=0.3,
    max_tokens=1000,
)
```

### 超时控制

**默认**: 2秒

**位置**: `hybrid_intent_detection()` → `ai_timeout` 参数

**原因**: 避免AI调用太慢影响搜索响应时间

## 📊 性能考虑

### 成本

- **qwen-turbo**: 约 $0.001-0.01 每次查询
- **qwen-plus**: 约 $0.01-0.05 每次查询

### 延迟

- **规则式方法**: < 10ms
- **AI增强**: 100-2000ms（取决于网络和模型）
- **混合策略**: 规则式立即返回，AI异步增强

### 缓存

- **支持**: 是（通过 `cache` 参数）
- **建议**: 在应用级别维护缓存，避免重复调用

## 🎨 设计场景优化

### 设计师网站优先级

**Prompt 中指定**:
```json
{
    "search_suggestions": {
        "prioritize_sites": ["pinterest", "behance", "dribbble"],
        "filter_types": ["documentation", "api", "tutorial"]
    }
}
```

### 视觉查询识别

**Prompt 中识别**:
- `visual`: 视觉查询（找图片、设计灵感）
- `object`: 物体查询（找特定物品）
- `color`: 颜色查询（找特定颜色的设计）
- `style`: 风格查询（找特定风格的设计）

## 🔄 与现有系统的集成

### 1. 规则式方法（现有）

**文件**: `smart_filter.py` → `detect_query_intent()`

**特点**: 快速、可预测、无成本

### 2. AI增强（新增）

**文件**: `ai_intent_enhance.py`

**特点**: 更准确、理解复杂意图、有成本

### 3. 混合策略（推荐）

**文件**: `ai_intent_enhance.py` → `hybrid_intent_detection()`

**特点**: 兼顾速度和准确性

## 📈 效果评估

### 优势

✅ **理解复杂查询**: "适合做海报的配色方案"  
✅ **处理同义词**: "椅子" → "chair", "seat", "seating"  
✅ **上下文理解**: "蓝色" → "blue", "azure", "navy"  
✅ **设计师场景优化**: 自动识别设计师网站优先级

### 限制

⚠️ **成本**: 每次查询需要调用 LLM API  
⚠️ **延迟**: 增加 100-2000ms 延迟  
⚠️ **依赖**: 需要 API 密钥和网络连接

## 🚀 未来改进

1. **本地模型**: 使用本地 LLM（如 Ollama）降低成本
2. **批量处理**: 批量分析多个查询，提高效率
3. **学习机制**: 从用户反馈中学习，优化 Prompt
4. **多语言支持**: 支持更多语言的意图分析








