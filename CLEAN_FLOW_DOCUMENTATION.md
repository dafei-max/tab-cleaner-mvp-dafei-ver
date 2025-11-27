# 一键清理完整流程文档

## 概述

本文档详细说明从用户点击"一键清理"按钮开始，到数据保存完成的完整流程，包括 OpenGraph 数据获取和文档类网页的视觉锚点（截图）获取逻辑。

---

## 完整流程

### 阶段 1：用户触发（前端 Content Script）

**位置**：`frontend/public/assets/content.js`

1. **用户点击"一键清理"按钮**
   ```javascript
   cleanBtn.addEventListener("click", () => {
     chrome.runtime.sendMessage({ action: "clean" }, (response) => {
       // 处理响应
     });
   });
   ```

2. **发送消息到 Background Script**
   - 消息内容：`{ action: "clean" }`
   - 目标：`background.js` 的 `chrome.runtime.onMessage` 监听器

---

### 阶段 2：Background Script 处理（前端）

**位置**：`frontend/public/assets/background.js`

#### 2.1 获取所有标签页

```javascript
chrome.tabs.query({}, async (tabs) => {
  // 过滤掉特殊页面
  const validTabs = tabs.filter(tab => {
    const url = tab.url || '';
    return !url.startsWith('chrome://') && 
           !url.startsWith('chrome-extension://') && 
           !url.startsWith('about:') &&
           !url.startsWith('edge://');
  });
});
```

**输出**：`validTabs` - 所有有效的标签页列表

---

#### 2.2 截图文档类标签页（在关闭之前）

**函数**：`captureDocTabScreenshots(validTabs)`

**逻辑**：

1. **识别文档类 URL**
   ```javascript
   function isDocLikeUrl(url) {
     // 检查 URL 是否包含文档类关键词
     // 如：github.com, notion.so, feishu.cn, docs.xiaohongshu.com 等
   }
   ```

2. **对每个文档类标签页**：
   - 切换到该标签页：`chrome.tabs.update(tab.id, { active: true })`
   - 等待标签页激活：`await new Promise(resolve => setTimeout(resolve, 500))`
   - **注入 Content Script 准备页面**：
     ```javascript
     await chrome.scripting.executeScript({
       target: { tabId: tab.id },
       func: () => {
         // 1. 滚动到页面顶部
         window.scrollTo(0, 0);
         
         // 2. 等待页面加载完成
         return new Promise((resolve) => {
           if (document.readyState === 'complete') {
             setTimeout(resolve, 1500); // 等待动态内容加载
           } else {
             window.addEventListener('load', () => {
               setTimeout(resolve, 1500);
             }, { once: true });
           }
         });
       }
     });
     ```
   - **截图**：`chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 85 })`
   - **返回**：`data:image/jpeg;base64,xxx` 格式的 Data URL

3. **收集截图结果**
   ```javascript
   screenshotResults = [
     {
       tabId: 123,
       url: "https://docs.xiaohongshu.com/doc/...",
       title: "小红书文档",
       screenshot: "data:image/jpeg;base64,xxx",
       isScreenshot: true,
     },
     // ...
   ]
   ```

**关键点**：
- ✅ **在关闭标签页之前截图**：确保标签页已打开且可访问
- ✅ **使用 Chrome Extension API**：绕过安全拦截，保持登录状态
- ✅ **只截首屏**：`captureVisibleTab` 只能捕获可见区域，但已足够用于可视化

---

#### 2.3 调用后端 API 抓取 OpenGraph

**请求**：
```javascript
POST http://localhost:8000/api/v1/tabs/opengraph
Body: {
  tabs: [
    { url: "...", title: "...", id: 123 },
    // ...
  ]
}
```

**超时控制**：30 秒超时

---

### 阶段 3：后端处理 OpenGraph（Python FastAPI）

**位置**：`backend/app/main.py` → `backend/app/opengraph.py`

#### 3.1 接收请求

**端点**：`POST /api/v1/tabs/opengraph`

**处理**：
```python
@app.post("/api/v1/tabs/opengraph")
async def fetch_tabs_opengraph(request: OpenGraphRequest):
    urls = [tab.url for tab in request.tabs]
    results = await fetch_multiple_opengraph(urls)  # 并发处理
    return {"ok": True, "data": results}
```

---

#### 3.2 对每个 URL 处理（`fetch_opengraph`）

**位置**：`backend/app/opengraph.py`

**决策树**：

```
对于每个 URL：
│
├─ 是否为文档类 URL？ (is_doc_like_url)
│  │
│  ├─ 是 → 使用后端截图（Playwright）
│  │      └─ 注意：可能失败（安全拦截、登录要求）
│  │
│  └─ 否 → 尝试抓取 OpenGraph
│         │
│         ├─ 成功且有 og:image
│         │  └─ 返回 OpenGraph 数据
│         │
│         ├─ 成功但无 og:image
│         │  └─ 使用截图后备（Playwright）
│         │
│         └─ 失败
│            └─ 使用截图后备（Playwright）
```

**详细逻辑**：

1. **检查是否为文档类 URL**
   ```python
   should_use_screenshot = is_doc_like_url(url)
   # 检查关键词：github.com, notion.so, feishu.cn, docs.xiaohongshu.com 等
   ```

2. **如果是文档类 URL**：
   ```python
   if should_use_screenshot:
       # 尝试使用后端截图（但可能失败）
       screenshot_b64 = await get_screenshot_as_base64(url)
       if screenshot_b64:
           return {
               "image": screenshot_b64,  # Base64 截图
               "is_screenshot": True,
               "success": True,
           }
   ```
   **注意**：后端截图可能失败（安全拦截），但前端已经截图了，所以这里主要是作为后备。

3. **如果不是文档类 URL**：
   ```python
   # 尝试抓取 OpenGraph
   response = await httpx.get(url)
   soup = BeautifulSoup(response.text, 'html.parser')
   
   # 提取 OpenGraph 标签
   og_title = soup.find('meta', property='og:title')
   og_description = soup.find('meta', property='og:description')
   og_image = soup.find('meta', property='og:image')
   og_site_name = soup.find('meta', property='og:site_name')
   
   # 处理结果
   if og_image:
       # 有图片，返回 OpenGraph 数据
       return {
           "image": og_image_url,  # URL
           "is_screenshot": False,
           "success": True,
       }
   elif use_screenshot_fallback:
       # 无图片，使用截图后备
       screenshot_b64 = await get_screenshot_as_base64(url)
       return {
           "image": screenshot_b64,  # Base64 截图
           "is_screenshot": True,
           "success": True,
       }
   ```

4. **如果 OpenGraph 抓取失败**：
   ```python
   except Exception as e:
       if use_screenshot_fallback:
           # 使用截图后备
           screenshot_b64 = await get_screenshot_as_base64(url)
           return {
               "image": screenshot_b64,
               "is_screenshot": True,
               "success": True,
           }
   ```

**返回数据结构**：
```python
{
    "url": "https://example.com",
    "title": "页面标题",
    "description": "页面描述",
    "image": "https://example.com/image.jpg" 或 "data:image/jpeg;base64,xxx",
    "site_name": "站点名称",
    "success": True,
    "error": None,
    "is_screenshot": False 或 True,
    "tab_id": 123,
    "tab_title": "标签页标题",
}
```

---

### 阶段 4：合并截图数据（前端 Background Script）

**位置**：`frontend/public/assets/background.js`

**函数**：`mergeScreenshotsIntoOpenGraph(opengraphItems, screenshotResults)`

**逻辑**：

1. **创建截图映射**
   ```javascript
   const screenshotMap = new Map();
   screenshotResults.forEach(result => {
     if (result.screenshot && result.url) {
       screenshotMap.set(result.url, result.screenshot);
     }
   });
   ```

2. **合并数据**
   ```javascript
   return opengraphItems.map(item => {
     const screenshot = screenshotMap.get(item.url);
     if (screenshot) {
       // 前端截图优先（更可靠）
       return {
         ...item,
         image: screenshot,  // 使用前端截图
         is_screenshot: true,
       };
     }
     return item;  // 使用后端返回的数据
   });
   ```

**优先级**：
1. **前端截图**（优先）：从已打开的标签页截图，绕过安全拦截
2. **后端 OpenGraph**：正常网页的 og:image
3. **后端截图**：作为后备方案

---

### 阶段 5：保存数据并关闭标签页（前端 Background Script）

**位置**：`frontend/public/assets/background.js`

1. **保存到 Chrome Storage**
   ```javascript
   await chrome.storage.local.set({ 
     opengraphData: {
       ok: true,
       data: mergedData  // 合并后的数据
     },
     lastCleanTime: Date.now()
   });
   ```

2. **关闭标签页**
   ```javascript
   for (const tabId of tabIds) {
     try {
       await chrome.tabs.remove(tabId);
     } catch (error) {
       // 忽略已关闭的标签页
     }
   }
   ```

3. **打开个人空间**
   ```javascript
   chrome.tabs.create({
     url: chrome.runtime.getURL("personalspace.html")
   });
   ```

---

### 阶段 6：个人空间加载数据（前端 React）

**位置**：`frontend/src/screens/PersonalSpace/PersonalSpace.jsx`

1. **从 Chrome Storage 加载数据**
   ```javascript
   useEffect(() => {
     chrome.storage.local.get(['opengraphData'], (result) => {
       const ogData = result.opengraphData?.data || [];
       
       // 计算圆形布局
       const positionedOG = calculateRadialLayout(ogData).map((og, index) => ({
         ...og,
         id: `og-${index}-${Date.now()}`,
       }));
       
       setOpengraphData(positionedOG);
     });
   }, []);
   ```

2. **渲染卡片**
   - 使用 `DraggableImage` 组件渲染每个 OpenGraph 卡片
   - 图片源：`og.image`（可能是 URL 或 Base64 Data URL）
   - 如果 `is_screenshot: true`，说明是截图

---

## 数据流图

```
用户点击"一键清理"
    ↓
[Content Script] 发送消息 { action: "clean" }
    ↓
[Background Script] 接收消息
    ↓
├─ 获取所有标签页 (chrome.tabs.query)
    ↓
├─ 截图文档类标签页 (captureDocTabScreenshots)
│   ├─ 识别文档类 URL (isDocLikeUrl)
│   ├─ 切换到标签页
│   ├─ 注入 Content Script（滚动到顶部，等待加载）
│   └─ 截图 (chrome.tabs.captureVisibleTab)
│       └─ 返回: data:image/jpeg;base64,xxx
    ↓
├─ 调用后端 API (POST /api/v1/tabs/opengraph)
    ↓
[Backend] 处理每个 URL
    ├─ 文档类 URL → 尝试后端截图（可能失败）
    └─ 普通 URL → 抓取 OpenGraph
        ├─ 成功 → 返回 og:image URL
        └─ 失败 → 尝试后端截图（可能失败）
    ↓
[Background Script] 接收后端响应
    ↓
├─ 合并截图数据 (mergeScreenshotsIntoOpenGraph)
│   └─ 前端截图优先，后端数据作为补充
    ↓
├─ 保存到 Chrome Storage
    ↓
├─ 关闭标签页
    ↓
└─ 打开个人空间
    ↓
[PersonalSpace] 加载数据并渲染
```

---

## 关键设计决策

### 1. 为什么前端先截图？

- ✅ **绕过安全拦截**：标签页已打开，不需要重新访问
- ✅ **保持登录状态**：用户已登录的页面可以直接截图
- ✅ **更可靠**：使用浏览器原生 API，兼容性更好

### 2. 为什么后端还要尝试截图？

- **后备方案**：如果前端截图失败，后端可以尝试
- **非文档类 URL**：如果 OpenGraph 抓取失败，后端截图作为后备
- **注意**：后端截图可能失败（安全拦截），但至少尝试了

### 3. 数据合并策略

- **前端截图优先**：更可靠，绕过安全拦截
- **后端 OpenGraph 次之**：正常网页的 og:image
- **后端截图最后**：作为后备方案

### 4. 为什么只截首屏？

- **性能**：全页截图需要多次滚动和合并，速度慢
- **存储**：首屏截图文件更小
- **用例**：标签页管理，首屏预览已足够

---

## 数据格式

### 前端截图结果

```javascript
{
  tabId: 123,
  url: "https://docs.xiaohongshu.com/doc/...",
  title: "小红书文档",
  screenshot: "data:image/jpeg;base64,/9j/4AAQSkZJRg...",  // 完整的 Data URL
  isScreenshot: true,
}
```

### 后端 OpenGraph 结果

```python
{
    "url": "https://example.com",
    "title": "页面标题",
    "description": "页面描述",
    "image": "https://example.com/image.jpg",  # URL 或 Base64
    "site_name": "站点名称",
    "success": True,
    "is_screenshot": False,  # 或 True（如果是截图）
    "tab_id": 123,
    "tab_title": "标签页标题",
}
```

### 最终合并后的数据

```javascript
{
    "url": "https://docs.xiaohongshu.com/doc/...",
    "title": "小红书文档",
    "description": "网页截图",
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",  // 前端截图（优先）
    "site_name": "docs.xiaohongshu.com",
    "success": true,
    "is_screenshot": true,  // 标记为截图
    "tab_id": 123,
    "tab_title": "标签页标题",
    "x": 720,  // 布局位置（由 calculateRadialLayout 计算）
    "y": 512,
    "id": "og-0-1234567890",  // 唯一 ID
}
```

---

## 错误处理

### 前端截图失败

- 继续执行，使用后端数据
- 如果后端也没有数据，显示占位图片

### 后端 OpenGraph 抓取失败

- 尝试后端截图（可能失败）
- 如果都失败，返回错误信息，前端使用占位图片

### 后端截图失败

- 返回错误信息
- 前端已有截图，不受影响

---

## 性能考虑

1. **并发处理**：后端使用 `asyncio.gather` 并发抓取多个 URL
2. **批量处理**：前端截图按顺序处理，避免过快切换标签页
3. **超时控制**：前端 30 秒超时，后端 10 秒超时
4. **延迟控制**：每个标签页之间添加延迟（300-500ms）

---

## 总结

**核心逻辑**：
1. **前端优先**：从已打开的标签页截图（绕过安全拦截）
2. **后端补充**：抓取 OpenGraph 数据（正常网页）
3. **智能合并**：前端截图优先，后端数据作为补充
4. **首屏足够**：只截首屏，性能好，已足够用于可视化

**优势**：
- ✅ 绕过安全拦截（标签页已打开）
- ✅ 保持登录状态（用户已登录）
- ✅ 性能好（使用浏览器原生 API）
- ✅ 可靠性高（前端截图 + 后端 OpenGraph 双重保障）






