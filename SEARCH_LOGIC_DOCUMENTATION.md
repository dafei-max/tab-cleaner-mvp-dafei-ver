# 搜索功能逻辑文档

## 📋 搜索流程概览

```
用户输入搜索关键词（按 Enter）
    ↓
前端：useSearch.js → performSearch()
    ↓
调用 searchContent(query) API
    ↓
后端：POST /api/v1/search/query
    ↓
1. 生成查询文本的 embedding（embed_text）
    ↓
2. 从向量数据库搜索（search_by_text_embedding）
    ↓
3. 返回按相似度排序的结果
    ↓
前端：处理结果并显示
    ↓
如果后端失败 → 本地模糊搜索兜底
```

---

## 🔍 详细流程

### 1. 前端搜索触发

**文件**: `frontend/src/screens/PersonalSpace/PersonalSpace.jsx`

**触发方式**:
- 用户在搜索框输入关键词
- 按 **Enter** 键触发搜索
- 调用 `handleSearch()` → `performSearch(searchQuery, calculateRadialLayout)`

**代码位置**:
```javascript
const handleSearch = async () => {
  const results = await performSearch(searchQuery, calculateRadialLayout);
  if (results && results.length > 0) {
    setOpengraphData(results);
    setShowOriginalImages(false);
  }
};
```

---

### 2. 前端搜索 Hook

**文件**: `frontend/src/hooks/useSearch.js`

**主要函数**: `performSearch(query, calculateRadialLayout)`

**流程**:
1. 检查查询是否为空
2. 调用 `searchContent(query)` API
3. 处理返回结果：
   - 如果后端返回结果 → 使用数据库结果
   - 如果后端返回空 → 使用本地模糊搜索兜底
4. 按相似度排序
5. 计算布局位置（radial layout）
6. 更新 `searchResults` state

**关键代码**:
```javascript
// ✅ 简化：直接调用 searchContent(query)，后端从数据库读取
const result = await searchContent(query);

let finalList = [];
if (result && result.ok && Array.isArray(result.results) && result.results.length > 0) {
  // ✅ 使用新的响应格式：result.results
  finalList = result.results;
  console.log('[useSearch] Found', finalList.length, 'results from database');
} else {
  console.warn('[useSearch] Backend returned empty, using local fuzzy ranking');
  finalList = fuzzyRankLocally(query, currentOGData || []);
}
```

**本地模糊搜索兜底** (`fuzzyRankLocally`):
- 如果后端搜索失败或返回空结果
- 使用简单的文本匹配算法
- 在 `title`、`description` 中搜索关键词
- 计算相似度分数并排序

---

### 3. API 调用

**文件**: `frontend/src/shared/api.js`

**函数**: `searchContent(query, topK = 20)`

**请求格式**:
```javascript
POST /api/v1/search/query
{
  "query": "搜索关键词",
  "top_k": 20  // 可选，默认 20
}
```

**响应格式**:
```javascript
{
  "ok": true,
  "results": [
    {
      "url": "...",
      "title": "...",
      "description": "...",
      "image": "...",
      "similarity": 0.95,  // 相似度分数（0-1）
      ...
    }
  ]
}
```

---

### 4. 后端搜索 API

**文件**: `backend/app/main.py`

**端点**: `POST /api/v1/search/query`

**请求模型**:
```python
class SearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 20
```

**处理流程**:

#### 步骤 1: 验证请求
```python
if not request.query or not request.query.strip():
    raise HTTPException(status_code=400, detail="query parameter is required")
```

#### 步骤 2: 生成查询 embedding
```python
from search.embed import embed_text
query_embedding = await embed_text(request.query)
```
- 使用 `qwen2.5-vl-embedding` 模型
- 将查询文本转换为 1024 维向量

#### 步骤 3: 从向量数据库搜索
```python
from vector_db import search_by_text_embedding
db_results = await search_by_text_embedding(query_embedding, top_k=top_k)
```
- 使用余弦相似度搜索（`<=>` 操作符）
- 返回最相似的 top_k 个结果
- 每个结果包含相似度分数

#### 步骤 4: 格式化返回结果
```python
results = []
for item in db_results:
    results.append({
        "url": item.get("url"),
        "title": item.get("title") or item.get("tab_title", ""),
        "description": item.get("description", ""),
        "image": item.get("image", ""),
        "site_name": item.get("site_name", ""),
        "tab_id": item.get("tab_id"),
        "tab_title": item.get("tab_title"),
        "similarity": item.get("similarity", 0.0),  # 相似度分数
        ...
    })
```

**日志输出**:
```
[API] Search request: query='搜索关键词', top_k=20
[API] Generated query embedding (dimension: 1024)
[API] Found X results from vector DB
```

---

### 5. 向量数据库搜索

**文件**: `backend/app/vector_db.py`

**函数**: `search_by_text_embedding(query_embedding, top_k=20, threshold=0.0)`

**SQL 查询**:
```sql
SELECT 
    url, title, description, image, site_name,
    tab_id, tab_title, text_embedding, image_embedding, metadata,
    1 - (text_embedding <=> $1::vector(1024)) AS similarity
FROM {NAMESPACE}.opengraph_items
WHERE text_embedding IS NOT NULL
  AND (1 - (text_embedding <=> $1::vector(1024))) >= $2
ORDER BY text_embedding <=> $1::vector(1024)
LIMIT $3;
```

**说明**:
- `<=>` 是 PostgreSQL 的余弦距离操作符
- `1 - distance` 转换为相似度分数（0-1）
- 按距离排序（距离越小，相似度越高）
- 只返回相似度 >= threshold 的结果

**返回格式**:
```python
[
    {
        "url": "...",
        "title": "...",
        "description": "...",
        "image": "...",
        "similarity": 0.95,  # 相似度分数
        ...
    }
]
```

---

### 6. Embedding 生成

**文件**: `backend/app/search/embed.py`

**函数**: `embed_text(text: str) -> List[float]`

**流程**:
1. 调用 `qwen2.5-vl-embedding` API
2. 将文本转换为 1024 维向量
3. 返回向量列表

**API 调用**:
```python
response = await httpx.post(
    "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
    headers={"Authorization": f"Bearer {api_key}"},
    json={"model": "text-embedding-v2", "input": {"text": text}}
)
```

---

## 🎯 关键特性

### 1. 数据库优先策略
- ✅ 优先从向量数据库搜索（使用 embedding 相似度）
- ✅ 如果数据库没有结果，使用本地模糊搜索兜底

### 2. 相似度计算
- **向量搜索**: 使用余弦相似度（`1 - cosine_distance`）
- **本地搜索**: 使用文本匹配分数

### 3. 结果排序
- 按相似度分数降序排序
- 相似度越高，排名越靠前

### 4. 布局计算
- 搜索结果会计算 radial layout 位置
- 在 PersonalSpace 中显示为水平行（top 3-5 个结果）

---

## 📊 数据流图

```
┌─────────────────┐
│  用户输入查询    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ PersonalSpace   │
│ handleSearch()  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  useSearch.js    │
│ performSearch() │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   api.js         │
│ searchContent() │
└────────┬────────┘
         │ POST /api/v1/search/query
         ▼
┌─────────────────┐
│  main.py        │
│ search_content()│
└────────┬────────┘
         │
         ├─► embed_text() → 生成查询 embedding
         │
         ▼
┌─────────────────┐
│  vector_db.py   │
│search_by_text_  │
│  embedding()    │
└────────┬────────┘
         │ SQL: SELECT ... ORDER BY similarity
         ▼
┌─────────────────┐
│  返回结果列表   │
│  (按相似度排序) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  前端显示结果   │
│  (radial layout)│
└─────────────────┘
```

---

## 🔄 兜底机制

如果后端搜索失败或返回空结果：

1. **前端检测**: `useSearch.js` 检测到 `result.results` 为空
2. **本地搜索**: 调用 `fuzzyRankLocally(query, currentOGData)`
3. **文本匹配**: 在 `title`、`description` 中搜索关键词
4. **相似度计算**: 基于文本匹配计算分数
5. **返回结果**: 返回本地搜索结果

---

## 📝 日志追踪

### 前端日志（浏览器控制台）:
```
[useSearch] Searching for: 搜索关键词
[useSearch] Found X results from database
[useSearch] Search completed, X results
```

### 后端日志（服务器控制台）:
```
[API] Search request: query='搜索关键词', top_k=20
[API] Generated query embedding (dimension: 1024)
[API] Found X results from vector DB
```

---

## 🎨 UI 显示

**搜索模式**:
- 当 `searchResults` 非空时，显示搜索模式
- 背景模糊 + 暗化
- 顶部显示 top 3-5 个搜索结果（水平排列）
- 原始 canvas 卡片不可交互

**清空搜索**:
- 按 Backspace 删除所有字符时，自动清空搜索
- 恢复原始 canvas 布局

---

## ✅ 总结

**当前搜索逻辑**:
1. ✅ 用户输入查询 → 按 Enter
2. ✅ 前端调用 `searchContent(query)` API
3. ✅ 后端生成查询 embedding
4. ✅ 从向量数据库搜索（余弦相似度）
5. ✅ 返回按相似度排序的结果
6. ✅ 前端显示搜索结果（radial layout）
7. ✅ 如果后端失败 → 本地模糊搜索兜底

**数据来源**:
- ✅ 数据库优先：从 `opengraph_items` 表搜索（包含 text_embedding）
- ✅ 数据已通过 `/api/v1/search/embedding` 端点存储到数据库

**性能优化**:
- ✅ 使用向量索引（ANN）加速搜索
- ✅ 只返回 top_k 个结果
- ✅ 相似度阈值过滤（threshold）




