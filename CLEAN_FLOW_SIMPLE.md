# 一键清理流程（简化版）

## 快速概览

```
用户点击"一键清理"
    ↓
[前端] 获取所有标签页
    ↓
[前端] 截图文档类标签页（在关闭之前）
    │   └─ 使用 chrome.tabs.captureVisibleTab
    │       └─ 返回: data:image/jpeg;base64,xxx
    ↓
[前端] 调用后端 API 抓取 OpenGraph
    ↓
[后端] 对每个 URL 处理
    ├─ 文档类 URL → 尝试后端截图（可能失败，但前端已截图）
    └─ 普通 URL → 抓取 OpenGraph
        ├─ 成功 → 返回 og:image URL
        └─ 失败 → 尝试后端截图（可能失败）
    ↓
[前端] 合并数据（前端截图优先）
    ↓
[前端] 保存到 Chrome Storage
    ↓
[前端] 关闭标签页
    ↓
[前端] 打开个人空间
    ↓
[前端] 加载数据并渲染卡片
```

---

## 详细步骤

### 步骤 1：用户点击按钮

**位置**：`content.js`（卡片上的"一键清理"按钮）

```javascript
cleanBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "clean" });
});
```

---

### 步骤 2：前端截图文档类标签页

**位置**：`background.js` → `captureDocTabScreenshots()`

**流程**：
1. 遍历所有标签页
2. 识别文档类 URL（`isDocLikeUrl()`）
3. 对每个文档类标签页：
   - 切换到该标签页
   - 注入 Content Script：
     - 滚动到顶部：`window.scrollTo(0, 0)`
     - 等待页面加载完成
   - 截图：`chrome.tabs.captureVisibleTab()`
   - 返回：`data:image/jpeg;base64,xxx`

**结果**：
```javascript
screenshotResults = [
  {
    url: "https://docs.xiaohongshu.com/doc/...",
    screenshot: "data:image/jpeg;base64,xxx",
    isScreenshot: true,
  },
  // ...
]
```

---

### 步骤 3：后端抓取 OpenGraph

**位置**：`backend/app/opengraph.py` → `fetch_opengraph()`

**对每个 URL 的处理逻辑**：

```
URL 输入
    ↓
是否为文档类 URL？
    ├─ 是 → 尝试后端截图（可能失败，但前端已截图）
    │       └─ 返回: { image: base64, is_screenshot: true }
    │
    └─ 否 → 抓取 OpenGraph
            ├─ 成功且有 og:image
            │   └─ 返回: { image: url, is_screenshot: false }
            │
            ├─ 成功但无 og:image
            │   └─ 尝试后端截图（可能失败）
            │       └─ 返回: { image: base64, is_screenshot: true }
            │
            └─ 失败
                └─ 尝试后端截图（可能失败）
                    └─ 返回: { image: base64, is_screenshot: true }
```

**返回数据**：
```python
{
    "url": "https://example.com",
    "title": "页面标题",
    "description": "页面描述",
    "image": "https://example.com/image.jpg" 或 "data:image/jpeg;base64,xxx",
    "is_screenshot": False 或 True,
    "success": True,
}
```

---

### 步骤 4：前端合并数据

**位置**：`background.js` → `mergeScreenshotsIntoOpenGraph()`

**逻辑**：
```javascript
// 1. 创建前端截图映射
const screenshotMap = new Map();
screenshotResults.forEach(result => {
  screenshotMap.set(result.url, result.screenshot);
});

// 2. 合并数据（前端截图优先）
return opengraphItems.map(item => {
  const frontendScreenshot = screenshotMap.get(item.url);
  if (frontendScreenshot) {
    // 使用前端截图（更可靠）
    return { ...item, image: frontendScreenshot, is_screenshot: true };
  }
  // 使用后端数据
  return item;
});
```

**优先级**：
1. **前端截图**（最优先）：从已打开标签页截图，绕过安全拦截
2. **后端 OpenGraph**：正常网页的 og:image URL
3. **后端截图**：作为后备方案

---

### 步骤 5：保存和展示

1. **保存到 Chrome Storage**
2. **关闭标签页**
3. **打开个人空间**
4. **个人空间加载数据并渲染**

---

## 关键点总结

### 1. 为什么前端先截图？

- ✅ 标签页已打开，绕过安全拦截
- ✅ 用户已登录，可以直接截图
- ✅ 使用浏览器原生 API，更可靠

### 2. 后端的作用？

- **正常网页**：抓取 OpenGraph（og:image URL）
- **文档类网页**：尝试后端截图（但可能失败，前端已截图）
- **后备方案**：如果 OpenGraph 失败，尝试后端截图

### 3. 数据合并策略？

- **前端截图优先**：更可靠，绕过安全拦截
- **后端 OpenGraph 次之**：正常网页
- **后端截图最后**：作为后备

### 4. 为什么只截首屏？

- 性能好（单次截图）
- 文件小（节省存储）
- 已足够用于可视化（首屏包含最重要信息）

---

## 实际数据示例

### 文档类网站（小红书文档）

**前端截图**：
```javascript
{
  url: "https://docs.xiaohongshu.com/doc/ce75a9e4e08e8dc94ed436cd90637ef1",
  screenshot: "data:image/jpeg;base64,/9j/4AAQSkZJRg...",  // 前端截图
  isScreenshot: true,
}
```

**后端处理**：
```python
# 识别为文档类 URL，尝试后端截图（可能失败）
{
  "image": "data:image/jpeg;base64,xxx",  # 如果成功
  "is_screenshot": True,
}
```

**最终合并**：
```javascript
{
  "url": "https://docs.xiaohongshu.com/doc/...",
  "image": "data:image/jpeg;base64,xxx",  // 使用前端截图（优先）
  "is_screenshot": true,
}
```

### 普通网站（有 OpenGraph）

**前端**：
```javascript
// 不是文档类 URL，不截图
```

**后端**：
```python
{
  "image": "https://example.com/og-image.jpg",  // OpenGraph 图片 URL
  "is_screenshot": False,
}
```

**最终合并**：
```javascript
{
  "url": "https://example.com",
  "image": "https://example.com/og-image.jpg",  // 使用 OpenGraph 图片
  "is_screenshot": false,
}
```

---

## 流程图（ASCII）

```
用户点击"一键清理"
    │
    ├─ [前端] 获取所有标签页
    │       │
    │       ├─ [前端] 截图文档类标签页
    │       │   └─ chrome.tabs.captureVisibleTab
    │       │       └─ 返回: data:image/jpeg;base64,xxx
    │       │
    │       └─ [前端] 调用后端 API
    │               │
    │               └─ [后端] 处理每个 URL
    │                       │
    │                       ├─ 文档类 URL
    │                       │   └─ 尝试后端截图（可能失败）
    │                       │
    │                       └─ 普通 URL
    │                           ├─ 抓取 OpenGraph
    │                           │   ├─ 成功 → 返回 og:image URL
    │                           │   └─ 失败 → 尝试后端截图
    │
    ├─ [前端] 合并数据（前端截图优先）
    │
    ├─ [前端] 保存到 Chrome Storage
    │
    ├─ [前端] 关闭标签页
    │
    └─ [前端] 打开个人空间
            │
            └─ [前端] 加载数据并渲染卡片
```

---

## 总结

**核心逻辑**：
1. **前端优先截图**：从已打开标签页截图（绕过安全拦截）
2. **后端抓取 OpenGraph**：正常网页的 og:image
3. **智能合并**：前端截图优先，后端数据补充
4. **首屏足够**：只截首屏，性能好，已足够

**优势**：
- ✅ 绕过安全拦截（标签页已打开）
- ✅ 保持登录状态（用户已登录）
- ✅ 双重保障（前端截图 + 后端 OpenGraph）
- ✅ 性能好（使用浏览器原生 API）




