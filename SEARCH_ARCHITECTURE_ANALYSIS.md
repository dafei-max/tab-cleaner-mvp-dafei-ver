# 搜索架构分析文档

## 📋 目录

1. [Caption 接收流程](#caption-接收流程)
2. [本地搜索流程](#本地搜索流程)
3. [整合 Vectordb 检索方案](#整合-vectordb-检索方案)

---

## 1. Caption 接收流程

### 🔄 数据流向

```
后端 WebSocket (/ws/caption)
    ↓
background.js (WebSocket 客户端)
    ↓ chrome.tabs.sendMessage(action: 'caption-ready')
content.js (content script)
    ↓ window.postMessage(TAB_CLEANER_CAPTION_PUSH)
eagle_storage.js (页面上下文)
    ↓
更新 IndexedDB + 触发 UI 更新
```

### 📁 相关脚本

1. **`backend/app/main.py`**
   - WebSocket 端点：`/ws/caption`
   - 函数：`broadcast_caption_updates()` - 推送 caption 到所有连接的客户端

2. **`frontend/public/assets/background.js`**
   - WebSocket 客户端：`connectCaptionWs()`
   - 监听 `caption_ready` 消息
   - 通过 `chrome.tabs.sendMessage` 转发到所有标签页

3. **`frontend/public/assets/content.js`**
   - 监听 `chrome.runtime.onMessage` (action: `'caption-ready'`)
   - 通过 `window.postMessage` 转发到页面上下文

4. **`frontend/public/assets/eagle_storage.js`**
   - 监听 `window.addEventListener('message')` (type: `TAB_CLEANER_CAPTION_PUSH`)
   - 函数：`updateImageCaption()` - 更新 IndexedDB
   - 函数：`updatePinterestCardTitle()` - 触发 UI 更新

### 🔑 关键代码位置

- **WebSocket 推送处理** (`eagle_storage.js` 约第 1650 行)：
  ```javascript
  window.addEventListener('message', async (event) => {
    const data = event.data || {};
    if (data.type !== 'TAB_CLEANER_CAPTION_PUSH' || !data.payload) return;
    // ... 处理 caption 推送
  });
  ```

---

## 2. 本地搜索流程

### 🔄 数据流向

```
PersonalSpace.jsx (用户输入搜索)
    ↓
useSearch.js → performSearch()
    ↓
步骤1: fuzzyRankLocally() (本地模糊搜索，立即显示)
    ↓
步骤2: searchContent() API (异步，完成后更新)
    ↓
后端 /api/v1/search/query
    ↓
向量数据库搜索 (vectordb)
    ↓
返回结果（如果失败，使用本地模糊搜索兜底）
```

### 📁 相关脚本

1. **`frontend/src/screens/PersonalSpace/PersonalSpace.jsx`**
   - 触发：`handleSearch()` → `performSearch()`

2. **`frontend/src/hooks/useSearch.js`**
   - 主函数：`performSearch(query, calculateRadialLayout, filterUrls, filterTabIds)`
   - 本地搜索：`fuzzyRankLocally()` - 使用 Fuse.js 进行模糊匹配
   - API 调用：`searchContent()` - 调用后端搜索 API

3. **`frontend/src/shared/api.js`**
   - 函数：`searchContent(query, topK, filterUrls, filterTabIds)`
   - 请求：`POST /api/v1/search/query`

4. **`backend/app/main.py`**
   - 端点：`POST /api/v1/search/query`
   - 处理：调用 `search_with_funnel()` 进行向量数据库搜索

5. **`frontend/public/assets/eagle_storage.js`** (⚠️ 目前未使用)
   - 函数：`searchImages(options)` - 基于 IndexedDB 的本地搜索
   - 搜索范围：caption、tags、时间范围
   - **注意**：此函数已实现但未被 `useSearch.js` 调用

### 🔑 关键代码位置

- **搜索执行** (`useSearch.js` 约第 180 行)：
  ```javascript
  const performSearch = async (query, calculateRadialLayout, filterUrls, filterTabIds) => {
    // 步骤1: 本地模糊搜索（立即显示）
    const localResults = fuzzyRankLocally(query, currentOGData || []);
    
    // 步骤2: AI 搜索（异步，完成后更新）
    searchContent(query, 20, filterUrls, filterTabIds).then(result => {
      // 使用 AI 结果更新
    });
  };
  ```

---

## 3. 整合 Vectordb 检索方案

### 🎯 目标

让本地搜索（`eagle_storage.js` 的 `searchImages`）也能同时查询 vectordb，实现**混合搜索**：
- **本地搜索**：快速、离线可用、基于 IndexedDB
- **Vectordb 搜索**：语义理解、更准确、基于 embedding

### 📊 当前状态

- ✅ **后端已有 vectordb 搜索**：`/api/v1/search/query` 端点已实现
- ✅ **前端已调用 vectordb**：`useSearch.js` 已使用 `searchContent()` API
- ⚠️ **`eagle_storage.js` 的 `searchImages` 未使用**：此函数只搜索 IndexedDB，未调用 vectordb

### 🚀 实现方案

#### 方案 A：在 `eagle_storage.js` 中集成 vectordb 搜索（推荐）

**优点**：
- 统一搜索入口
- 可以同时返回本地和 vectordb 结果
- 支持混合排序

**实现步骤**：

1. **修改 `eagle_storage.js` 的 `searchImages` 函数**：
   ```javascript
   async function searchImages(options = {}) {
     // 1. 本地 IndexedDB 搜索（现有逻辑）
     const localResults = await searchIndexedDB(options);
     
     // 2. 并行调用 vectordb 搜索
     const vectordbResults = await searchVectordb(options.query);
     
     // 3. 合并和去重结果
     const mergedResults = mergeResults(localResults, vectordbResults);
     
     return mergedResults;
   }
   ```

2. **添加 vectordb 搜索函数**：
   ```javascript
   async function searchVectordb(query) {
     try {
       // 通过 content script 调用 background.js，再调用后端 API
       const response = await requestSearchViaContent(query);
       return response.results || [];
     } catch (error) {
       console.warn('[Eagle Storage] Vectordb search failed:', error);
       return [];
     }
   }
   ```

3. **添加通信桥接**（类似 caption 请求）：
   ```javascript
   function requestSearchViaContent(query) {
     return new Promise((resolve, reject) => {
       const messageId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
       const timeout = setTimeout(() => {
         window.removeEventListener('message', onMessage);
         resolve({ results: [] }); // 超时返回空结果
       }, 10000);
       
       function onMessage(event) {
         if (event.source !== window) return;
         const data = event.data || {};
         if (data.type !== 'TAB_CLEANER_SEARCH_RESPONSE' || data.messageId !== messageId) return;
         window.removeEventListener('message', onMessage);
         clearTimeout(timeout);
         resolve(data);
       }
       
       window.addEventListener('message', onMessage);
       window.postMessage({
         type: 'TAB_CLEANER_SEARCH_REQUEST',
         messageId,
         query,
       }, '*');
     });
   }
   ```

4. **在 `content.js` 中添加搜索请求处理**：
   ```javascript
   // 搜索请求：页面 -> content -> background -> API
   if (event.data && event.data.type === 'TAB_CLEANER_SEARCH_REQUEST') {
     const { messageId, query } = event.data;
     chrome.runtime.sendMessage({
       action: 'search-vectordb',
       query,
     }, (response) => {
       window.postMessage({
         type: 'TAB_CLEANER_SEARCH_RESPONSE',
         messageId,
         results: response?.results || [],
       }, '*');
     });
   }
   ```

5. **在 `background.js` 中添加搜索处理**：
   ```javascript
   if (message?.action === 'search-vectordb') {
     (async () => {
       try {
         const { query } = message;
         const userId = await getUserId();
         const resp = await fetch(`${API_BASE}/api/v1/search/query`, {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'X-User-ID': userId,
           },
           body: JSON.stringify({ query, top_k: 20 }),
         });
         const result = await resp.json();
         sendResponse({ results: result.results || [] });
       } catch (err) {
         sendResponse({ results: [] });
       }
     })();
     return true;
   }
   ```

#### 方案 B：在 `useSearch.js` 中同时调用 `eagle_storage.searchImages`

**优点**：
- 改动较小
- 复用现有 API 调用逻辑

**实现步骤**：

1. **修改 `useSearch.js` 的 `performSearch`**：
   ```javascript
   const performSearch = async (query, calculateRadialLayout, filterUrls, filterTabIds) => {
     // 步骤1: 本地模糊搜索（现有）
     const localResults = fuzzyRankLocally(query, currentOGData || []);
     
     // 🆕 步骤1.5: IndexedDB 搜索（通过 eagle_storage）
     const indexedDBResults = await window.__TAB_CLEANER_EAGLE_STORAGE?.searchImages({
       query,
       limit: 20,
     }) || [];
     
     // 步骤2: Vectordb 搜索（现有）
     const vectordbResults = await searchContent(query, 20, filterUrls, filterTabIds);
     
     // 🆕 合并所有结果
     const allResults = mergeResults(localResults, indexedDBResults, vectordbResults);
     
     return allResults;
   };
   ```

### 🎨 推荐方案

**推荐使用方案 A**，原因：
1. **统一搜索入口**：`eagle_storage.js` 成为统一的搜索接口
2. **更好的封装**：搜索逻辑集中在 `eagle_storage.js`
3. **易于扩展**：未来可以添加更多搜索源（如标签搜索、颜色搜索等）

### 📝 实现检查清单

- [ ] 在 `eagle_storage.js` 中添加 `searchVectordb()` 函数
- [ ] 在 `eagle_storage.js` 中添加 `requestSearchViaContent()` 通信桥接
- [ ] 在 `content.js` 中添加 `TAB_CLEANER_SEARCH_REQUEST` 处理
- [ ] 在 `background.js` 中添加 `search-vectordb` action 处理
- [ ] 修改 `searchImages()` 函数，集成 vectordb 搜索
- [ ] 实现结果合并和去重逻辑
- [ ] 测试混合搜索功能

---

## 📌 总结

### Caption 接收涉及的脚本
1. `backend/app/main.py` - WebSocket 端点
2. `frontend/public/assets/background.js` - WebSocket 客户端
3. `frontend/public/assets/content.js` - 消息桥接
4. `frontend/public/assets/eagle_storage.js` - 最终处理和存储

### 本地搜索涉及的脚本
1. `frontend/src/screens/PersonalSpace/PersonalSpace.jsx` - 触发搜索
2. `frontend/src/hooks/useSearch.js` - 搜索逻辑
3. `frontend/src/shared/api.js` - API 调用
4. `backend/app/main.py` - 后端搜索端点
5. `frontend/public/assets/eagle_storage.js` - IndexedDB 搜索（目前未使用）

### 整合 Vectordb 的建议
- 在 `eagle_storage.js` 中集成 vectordb 搜索
- 使用与 caption 请求相同的通信桥接模式
- 实现混合搜索：本地 + vectordb，合并结果




