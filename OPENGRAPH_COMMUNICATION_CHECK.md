# OpenGraph 数据通信和数据格式检查报告

## ✅ 检查结果总结

### 1. 通信检查 ✅

#### 前端发送配置
- **API 端点**: `POST /api/v1/search/embedding`
- **请求方法**: `POST`
- **Content-Type**: `application/json`
- **API URL 配置**: 
  - Railway 生产环境: `https://tab-cleaner-mvp-production.up.railway.app`
  - 本地开发环境: `http://localhost:8000`
  - 通过 `API_CONFIG.getBaseUrlSync()` 获取

#### 后端接收配置
- **端点定义**: `@app.post("/api/v1/search/embedding")`
- **请求模型**: `EmbeddingRequest`
- **模型字段**: `opengraph_items: List[Dict[str, Any]]`

#### 通信流程
```
前端 (background.js)
  ↓ normalizeItem() 规范化数据
  ↓ POST /api/v1/search/embedding
  ↓ { opengraph_items: [...] }
后端 (main.py)
  ↓ EmbeddingRequest 接收
  ↓ normalize_opengraph_items() 再次规范化
  ↓ process_opengraph_for_search() 生成 embedding
  ↓ batch_upsert_items() 存储到数据库
```

**✅ 通信配置正确**

---

### 2. 数据格式检查 ✅

#### 前端发送的数据格式（background.js normalizeItem）

```javascript
{
  url: String,              // 必需，字符串
  title: String | null,     // 可选，字符串或 null
  description: String | null, // 可选，字符串或 null
  image: String | null,     // 可选，字符串（如果是数组，取第一个）
  site_name: String | null, // 可选，字符串或 null
  tab_id: Number | null,    // 可选，数字或 null
  tab_title: String | null, // 可选，字符串或 null
  is_doc_card: Boolean,     // 布尔值，默认 false
  is_screenshot: Boolean,   // 布尔值，默认 false
  success: Boolean          // 布尔值，默认 true
}
```

#### 后端期望的数据格式（EmbeddingRequest + normalize_opengraph_item）

```python
{
  "url": str,                    # 必需，字符串
  "title": str | None,           # 可选，字符串或 None
  "description": str | None,     # 可选，字符串或 None
  "image": str | None,           # 可选，字符串（如果是数组，取第一个）
  "site_name": str | None,       # 可选，字符串或 None
  "tab_id": int | None,          # 可选，整数或 None
  "tab_title": str | None,       # 可选，字符串或 None
  "is_doc_card": bool,           # 布尔值
  "is_screenshot": bool,         # 布尔值
  "success": bool,               # 布尔值
  "text_embedding": List[float] | None,  # 可选，1024维向量
  "image_embedding": List[float] | None, # 可选，1024维向量
  "metadata": Dict | None        # 可选，字典
}
```

#### 字段匹配检查

| 字段 | 前端 | 后端 | 匹配 |
|------|------|------|------|
| url | ✅ | ✅ | ✅ |
| title | ✅ | ✅ | ✅ |
| description | ✅ | ✅ | ✅ |
| image | ✅ | ✅ | ✅ |
| site_name | ✅ | ✅ | ✅ |
| tab_id | ✅ | ✅ | ✅ |
| tab_title | ✅ | ✅ | ✅ |
| is_doc_card | ✅ | ✅ | ✅ |
| is_screenshot | ✅ | ✅ | ✅ |
| success | ✅ | ✅ | ✅ |
| text_embedding | ❌ (前端不发送) | ✅ | ✅ (后端生成) |
| image_embedding | ❌ (前端不发送) | ✅ | ✅ (后端生成) |
| metadata | ❌ (前端不发送) | ✅ | ✅ (后端生成) |

**✅ 所有必需字段匹配**

---

### 3. 特殊字段处理 ✅

#### image 字段处理

**前端 (background.js)**:
```javascript
let image = item.image;
if (image) {
  if (Array.isArray(image)) {
    // 如果是数组，取第一个元素
    image = image.length > 0 ? String(image[0]).trim() : null;
  } else if (typeof image === 'string') {
    image = image.trim() || null;
  } else {
    image = String(image).trim() || null;
  }
}
normalized.image = image;
```

**后端 (normalize.py)**:
```python
image = item.get("image") or item.get("og:image") or item.get("thumbnail_url")
if image:
    if isinstance(image, list):
        # 如果是数组，取第一个元素
        if len(image) > 0:
            normalized["image"] = str(image[0]).strip()
        else:
            normalized["image"] = None
    elif isinstance(image, str):
        normalized["image"] = image.strip() if image.strip() else None
    else:
        normalized["image"] = str(image).strip() if image else None
```

**✅ 前后端都正确处理 image 数组→字符串转换**

---

### 4. 错误处理 ✅

#### 前端错误处理
- ✅ 检查 `embedResponse.ok`
- ✅ 解析 `embedResponse.json()`
- ✅ 使用 `try/catch` 捕获错误
- ✅ 记录错误日志

#### 后端错误处理
- ✅ 使用 `try/except` 捕获错误
- ✅ 使用 `HTTPException` 返回错误
- ✅ 记录详细错误日志
- ✅ 打印堆栈跟踪

**✅ 错误处理完善**

---

### 5. 数据流完整性 ✅

```
1. opengraph_local.js
   ↓ 提取 OpenGraph 数据
   ↓ window.postMessage({ type: 'TAB_CLEANER_CACHE_OPENGRAPH', data: {...} })

2. content.js
   ↓ 监听 window.addEventListener('message')
   ↓ 保存到 chrome.storage.local['recent_opengraph']

3. background.js (clean-all 或 clean-current-tab)
   ↓ chrome.storage.local.get(['recent_opengraph'])
   ↓ 查找当前 URL 的数据
   ↓ normalizeItem() 规范化

4. background.js
   ↓ POST /api/v1/search/embedding
   ↓ { opengraph_items: normalizedBatch }

5. main.py
   ↓ EmbeddingRequest 接收
   ↓ normalize_opengraph_items() 再次规范化
   ↓ process_opengraph_for_search() 生成 embedding
   ↓ batch_upsert_items() 存储到数据库

6. main.py
   ↓ 返回 { ok: True, saved: <count>, data: [...] }
```

**✅ 数据流完整**

---

## 🔍 潜在问题检查

### 问题 1: API URL 配置
- **检查**: 前端使用 `API_CONFIG.getBaseUrlSync()` 获取 API URL
- **默认**: Railway 生产环境
- **状态**: ✅ 配置正确

### 问题 2: 数据规范化
- **检查**: 前端和后端都进行规范化
- **状态**: ✅ 双重规范化确保数据一致性

### 问题 3: 空数据处理
- **检查**: 后端检查 `if not request.opengraph_items`
- **状态**: ✅ 正确处理空数据

### 问题 4: 数据库存储
- **检查**: 后端检查 `ADBPG_HOST` 环境变量
- **状态**: ✅ 有环境变量检查

---

## 📋 测试建议

### 1. 测试前端发送
在浏览器控制台运行：
```javascript
// 检查 API URL
chrome.storage.local.get(['api_url', 'use_local_api'], (items) => {
  console.log('API Config:', items);
});

// 检查缓存数据
chrome.storage.local.get(['recent_opengraph'], (items) => {
  console.log('Cached OG Data:', items.recent_opengraph);
});
```

### 2. 测试后端接收
查看后端日志：
```
[API] Processing X items for embedding generation
[API] Normalized X items from X input items
[API] Generated embeddings for X items
[API] ✓ Stored X/X items to vector DB
```

### 3. 测试完整流程
1. 打开一个网页
2. 点击"一键清理"
3. 检查浏览器控制台日志
4. 检查后端日志
5. 检查数据库是否存储成功

---

## ✅ 结论

**通信检查**: ✅ 通过
- API 端点配置正确
- 请求格式正确
- Content-Type 正确

**数据格式检查**: ✅ 通过
- 所有必需字段匹配
- 特殊字段处理正确（image 数组→字符串）
- 类型转换正确（字符串、数字、布尔值）

**数据流检查**: ✅ 通过
- 数据流路径完整
- 规范化步骤正确
- 错误处理完善

**总体评估**: ✅ **后端可以正常接收前端发送的 OpenGraph 数据**

---

## 🐛 如果后端没有接收到数据，可能的原因：

1. **API URL 配置错误**
   - 检查 `api_config.js` 中的 URL
   - 检查 `chrome.storage.local` 中的配置

2. **网络问题**
   - 检查 Railway 服务是否运行
   - 检查 CORS 配置

3. **数据格式问题**
   - 检查前端发送的数据是否包含 `opengraph_items` 字段
   - 检查每个 item 是否包含必需的 `url` 字段

4. **缓存问题**
   - 检查 `chrome.storage.local['recent_opengraph']` 是否有数据
   - 检查 `content.js` 是否正确保存了数据

5. **后端日志**
   - 查看后端日志是否有 `[API] Processing X items` 消息
   - 如果没有，说明请求没有到达后端



