# AI Prompt 配置指南

## 概述

`ai_prompt_config.py` 是集中管理所有 AI 相关 prompt 的配置文件，方便调整和优化各个环节的 AI 接入部分。

## 文件位置

```
backend/app/search/ai_prompt_config.py
```

## 包含的 Prompt

### 1. Caption 生成 Prompt

**函数**：`get_caption_prompt(include_attributes: bool = True)`

**用途**：生成图片的详细描述和视觉属性（颜色、风格、物体标签）

**关键改进**：
- ✅ **角色定位**：专业设计师和图片描述专家
- ✅ **颜色准确性**：必须准确描述主要物体的颜色（例如："一个黄色的烤奶酪三明治"而不是"一个烤奶酪三明治"）
- ✅ **主体优先**：优先描述和提取主体物体的颜色、形状、材质等信息
- ✅ **细节观察**：注意物体的细节特征（如：拉丝的奶酪、融化的状态、纹理、光泽等）
- ✅ **颜色描述要具体**：使用准确的颜色名称（如：yellow, red, blue, green, golden, amber, lemon, crimson, navy, emerald 等）

**使用位置**：
- `search/qwen_vl_client.py` - `generate_caption()` 方法

**调整方法**：
直接编辑 `ai_prompt_config.py` 中的 `get_caption_prompt()` 函数，修改 prompt 文本即可。

---

### 2. 意图分析 Prompt

**函数**：`get_intent_analysis_prompt(query: str)`

**用途**：分析用户搜索意图，提取颜色、物体、风格等信息，生成增强查询

**使用位置**：
- `search/ai_intent_enhance.py` - `enhance_query_intent_with_ai()` 函数

**调整方法**：
直接编辑 `ai_prompt_config.py` 中的 `get_intent_analysis_prompt()` 函数。

---

### 3. 结果验证 Prompt

**函数**：`get_result_validation_prompt(query: str, results: list)`

**用途**：验证搜索结果是否与用户查询匹配，识别相关结果、不相关结果、优质结果

**使用位置**：
- `search/ai_intent_enhance.py` - `validate_search_results_with_ai()` 函数

**调整方法**：
直接编辑 `ai_prompt_config.py` 中的 `get_result_validation_prompt()` 函数。

---

### 4. VL 验证 Prompt

**函数**：`get_vl_validation_prompt(query: str)`

**用途**：使用视觉语言模型验证图片中是否包含查询的内容

**使用位置**：
- `search/ai_intent_enhance.py` - `validate_search_results_with_vl()` 函数

**调整方法**：
直接编辑 `ai_prompt_config.py` 中的 `get_vl_validation_prompt()` 函数。

---

## 使用示例

### 在代码中使用

```python
from search.ai_prompt_config import (
    get_caption_prompt,
    get_intent_analysis_prompt,
    get_result_validation_prompt,
    get_vl_validation_prompt,
)

# 获取 Caption prompt
caption_prompt = get_caption_prompt(include_attributes=True)

# 获取意图分析 prompt
intent_prompt = get_intent_analysis_prompt("黄色三明治")

# 获取结果验证 prompt
validation_prompt = get_result_validation_prompt("黄色三明治", results)

# 获取 VL 验证 prompt
vl_prompt = get_vl_validation_prompt("黄色三明治")
```

---

## 常见调整场景

### 场景 1：改进 Caption 的颜色识别准确性

**问题**：Caption 没有准确描述主要物体的颜色（如：黄色三明治被描述为"一个烤奶酪三明治"）

**解决方案**：
1. 打开 `ai_prompt_config.py`
2. 找到 `get_caption_prompt()` 函数
3. 在 prompt 中强调：
   - **必须准确描述主要物体的颜色**
   - **颜色描述要具体**（使用准确的颜色名称）
   - **不要遗漏主要物体的颜色**

**示例修改**：
```python
def get_caption_prompt(include_attributes: bool = True) -> str:
    if include_attributes:
        return """你是一位专业的设计师和图片描述专家...
        
        **重要提示**：
        - **颜色准确性至关重要**：如果图片中的主体物体有明显的颜色（如黄色三明治、红色椅子、蓝色背景），必须在 caption 和 dominant_colors 中准确反映
        - **主体优先**：优先描述和提取主体物体的颜色、形状、材质等信息
        ...
        """
```

---

### 场景 2：调整意图分析的提取规则

**问题**：意图分析没有准确提取颜色、物体等信息

**解决方案**：
1. 打开 `ai_prompt_config.py`
2. 找到 `get_intent_analysis_prompt()` 函数
3. 修改提取规则和示例

---

### 场景 3：调整结果验证的严格程度

**问题**：结果验证太严格或太宽松

**解决方案**：
1. 打开 `ai_prompt_config.py`
2. 找到 `get_result_validation_prompt()` 或 `get_vl_validation_prompt()` 函数
3. 调整验证规则和判断标准

---

## 最佳实践

1. **集中管理**：所有 AI prompt 都应该在 `ai_prompt_config.py` 中定义，不要在业务代码中硬编码
2. **版本控制**：修改 prompt 时，建议在代码注释中记录修改原因和日期
3. **测试验证**：修改 prompt 后，建议测试相关功能，确保效果符合预期
4. **逐步优化**：根据实际效果逐步优化 prompt，不要一次性大幅修改

---

## 相关文件

- `search/qwen_vl_client.py` - 使用 Caption prompt
- `search/ai_intent_enhance.py` - 使用意图分析、结果验证、VL 验证 prompt
- `search/caption.py` - 调用 Caption 生成功能

---

## 注意事项

1. **向后兼容**：`ai_intent_enhance.py` 中保留了原有的函数定义，但内部调用新的配置函数，确保向后兼容
2. **导入顺序**：确保在使用 prompt 之前正确导入 `ai_prompt_config`
3. **错误处理**：如果 prompt 配置有问题，相关功能会回退到默认行为或报错

