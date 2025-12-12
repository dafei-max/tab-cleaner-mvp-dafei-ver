# 搜索功能调试总结

## ✅ 搜索功能验证结果

### 测试结果

使用测试脚本 `test_search_debug.py` 验证搜索功能：

```bash
python test_search_debug.py --user-id device_1764658383255_28u4om0xg --query "椅子"
```

**结果**：✅ **搜索功能正常，返回了 3 个结果**

```
📊 搜索结果:
  总结果数: 3

📋 结果详情（前10个）:
  1. https://www.pinterest.com/pin/463237511663116491...
     相似度: 0.6931 (阈值: 0.28) ✅
     标题: 你的个人资料...

  2. https://www.pinterest.com/pin/463237511651807696...
     相似度: 0.6313 (阈值: 0.28) ✅
     标题: Hello Breakout Chair - Product Page...

  3. https://www.pinterest.com/pin/4591701427128108544...
     相似度: 0.4306 (阈值: 0.28) ✅
     标题: 你的个人资料...
```

### 数据统计

- ✅ 用户有 4 条记录
- ✅ 所有记录都有 embedding、caption 和 caption_embedding
- ✅ 有 2 条记录的 caption 包含 '椅子'
- ✅ 搜索返回 3 个结果，相似度都高于阈值 0.28

---

## 🔍 如果前端显示 0 结果

### 可能原因

1. **用户ID不匹配**
   - 前端发送的用户ID与数据存储时的用户ID不一致
   - 检查方法：查看浏览器 Network 标签中的 `X-User-ID` header

2. **前端请求失败**
   - API 请求返回错误
   - 检查方法：查看浏览器 Console 和 Network 标签

3. **前端过滤逻辑**
   - 前端可能有额外的过滤逻辑
   - 检查方法：查看 `useSearch.js` 中的处理逻辑

4. **缓存问题**
   - 浏览器缓存了旧的空结果
   - 解决方法：清除缓存或硬刷新（Cmd+Shift+R）

### 调试步骤

#### 1. 检查前端请求

打开浏览器开发者工具 → Network 标签：

1. 执行搜索操作
2. 找到 `/api/v1/search/query` 请求
3. 检查：
   - **Request Headers**：是否有 `X-User-ID: device_1764658383255_28u4om0xg`
   - **Response**：查看返回的 JSON，应该包含 `results` 数组

**预期响应**：
```json
{
  "ok": true,
  "results": [
    {
      "url": "...",
      "title": "...",
      "similarity": 0.6931,
      ...
    }
  ],
  "count": 3
}
```

#### 2. 检查后端日志

在 Railway Logs 中查看：

```
[API] Search request: query='椅子'
[API] 👤 User ID from header: 'device_1764658383255_28u4om0xg' → normalized: 'device_1764658383255_28u4om0xg'
[API] Found 3 results (dynamic filtering)
[API] Similarity range: min=0.4306, max=0.6931, count=3
```

#### 3. 检查前端 Console

在浏览器 Console 中应该看到：

```
[useSearch] Searching for: 椅子
[useSearch] Found 3 results from database
```

如果看到 `Backend returned empty, using local fuzzy ranking`，说明后端返回了空结果。

---

## 🛠️ 快速测试方法

### 方法1：使用测试脚本

```bash
cd backend/app
python test_search_debug.py --user-id device_1764658383255_28u4om0xg --query "椅子"
```

### 方法2：直接调用 API

```bash
curl -X POST https://tab-cleaner-mvp-app-production.up.railway.app/api/v1/search/query \
  -H "Content-Type: application/json" \
  -H "X-User-ID: device_1764658383255_28u4om0xg" \
  -d '{"query": "椅子", "top_k": 20}'
```

### 方法3：检查数据库

```bash
python diagnose_search_issue.py --user-id device_1764658383255_28u4om0xg --query "椅子"
```

---

## 📋 搜索流程说明

### 后端搜索流程

1. **接收请求**：`/api/v1/search/query`
2. **三阶段漏斗搜索**：
   - Stage 1: Coarse Recall（多路召回）
   - Stage 2: Fine Ranking（精细排序）
   - Stage 3: Smart Filtering（智能过滤）
3. **返回结果**：按相似度排序的结果列表

### 前端搜索流程

1. **用户输入查询**：在搜索框输入
2. **调用 API**：`searchContent(query)`
3. **处理结果**：`useSearch.js` 中的 `performSearch()`
4. **显示结果**：在 `SearchOverlay` 或 `RadialCanvas` 中显示

---

## ✅ 验证清单

- [x] 后端搜索功能正常（测试脚本验证）
- [x] 数据库中有数据（4条记录）
- [x] 所有记录都有 embedding
- [x] 搜索返回结果（3个）
- [x] 相似度都高于阈值（0.28）
- [ ] 前端正确发送用户ID（需要用户验证）
- [ ] 前端正确显示结果（需要用户验证）

---

## 🔧 如果仍然显示 0 结果

### 检查清单

1. **用户ID匹配**
   ```javascript
   // 在浏览器 Console 运行
   chrome.storage.local.get(['user_id'], (result) => {
     console.log('当前用户ID:', result.user_id);
   });
   ```
   应该显示：`device_1764658383255_28u4om0xg`

2. **API 请求**
   - 打开 Network 标签
   - 检查 `/api/v1/search/query` 请求
   - 查看 Response，应该包含 `results` 数组

3. **前端 Console**
   - 查看是否有错误信息
   - 查看 `[useSearch]` 日志

4. **清除缓存**
   - 硬刷新：Cmd+Shift+R (Mac) 或 Ctrl+Shift+R (Windows)
   - 清除浏览器缓存

---

**最后更新**: 2025-12-03






