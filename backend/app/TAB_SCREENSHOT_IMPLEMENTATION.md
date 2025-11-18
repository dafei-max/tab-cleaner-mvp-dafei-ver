# 标签页截图实现方案

## 问题分析

直接在后端使用 Playwright 访问文档类网站（如 Notion、飞书、Google Docs、微信公众号等）会遇到以下问题：

1. **安全拦截**：这些网站有反爬虫机制，会阻止自动化访问
2. **登录要求**：某些页面需要登录才能访问
3. **CORS 限制**：跨域请求可能被阻止
4. **性能问题**：每次都要启动无头浏览器，速度慢

## 解决方案

**使用 Chrome Extension API 从已打开的标签页截图**

### 工作流程

1. **用户打开标签页**：标签页已经在浏览器中打开，用户已经登录或访问权限已建立
2. **扩展程序截图**：使用 `chrome.tabs.captureVisibleTab` API 从已打开的标签页截图
3. **合并数据**：将截图数据合并到 OpenGraph 数据中
4. **关闭标签页**：截图完成后关闭标签页

### 优势

- ✅ **绕过安全拦截**：标签页已经打开，不需要重新访问
- ✅ **保持登录状态**：用户已经登录的页面可以直接截图
- ✅ **性能更好**：不需要启动无头浏览器，直接使用浏览器 API
- ✅ **更可靠**：使用浏览器原生 API，兼容性更好

## 实现细节

### 1. 文档类 URL 识别

在 `background.js` 中实现 `isDocLikeUrl()` 函数，识别需要截图的文档类网站：

```javascript
function isDocLikeUrl(url) {
  const docKeywords = [
    "github.com", "notion.so", "feishu.cn", "docs.google.com",
    "docs.xiaohongshu.com", "mp.weixin.qq.com", // ... 等等
  ];
  return docKeywords.some(keyword => url.toLowerCase().includes(keyword));
}
```

### 2. 截图流程

```javascript
async function captureDocTabScreenshots(tabs) {
  const screenshotResults = [];
  const currentWindow = await chrome.windows.getCurrent();
  
  for (const tab of tabs) {
    if (!isDocLikeUrl(tab.url)) continue;
    
    // 1. 切换到该标签页
    await chrome.tabs.update(tab.id, { active: true });
    
    // 2. 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. 截图
    const dataUrl = await chrome.tabs.captureVisibleTab(currentWindow.id, {
      format: 'jpeg',
      quality: 85,
    });
    
    screenshotResults.push({
      tabId: tab.id,
      url: tab.url,
      screenshot: dataUrl, // data:image/jpeg;base64,xxx
      isScreenshot: true,
    });
  }
  
  return screenshotResults;
}
```

### 3. 数据合并

```javascript
function mergeScreenshotsIntoOpenGraph(opengraphItems, screenshotResults) {
  const screenshotMap = new Map();
  screenshotResults.forEach(result => {
    if (result.screenshot && result.url) {
      screenshotMap.set(result.url, result.screenshot);
    }
  });
  
  return opengraphItems.map(item => {
    const screenshot = screenshotMap.get(item.url);
    if (screenshot) {
      return {
        ...item,
        image: screenshot,
        is_screenshot: true,
      };
    }
    return item;
  });
}
```

### 4. 完整流程

```javascript
// 1. 获取所有标签页
const validTabs = tabs.filter(/* ... */);

// 2. 先截图文档类标签页（在关闭之前）
const screenshotResults = await captureDocTabScreenshots(validTabs);

// 3. 调用后端 API 抓取 OpenGraph
const opengraphData = await fetch(/* ... */);

// 4. 合并截图数据
const mergedData = mergeScreenshotsIntoOpenGraph(opengraphData.data, screenshotResults);

// 5. 保存到 storage
await chrome.storage.local.set({ opengraphData: { data: mergedData } });

// 6. 关闭标签页
await chrome.tabs.remove(/* ... */);
```

## 注意事项

### 1. 标签页切换

- `chrome.tabs.captureVisibleTab` 只能截取当前活动标签页
- 需要先切换到目标标签页：`chrome.tabs.update(tabId, { active: true })`
- 切换后需要等待页面加载完成

### 2. 等待时间

- 文档类页面可能需要更长的加载时间
- 建议等待 2-3 秒，确保动态内容加载完成
- 可以根据网站类型调整等待时间

### 3. 窗口管理

- 需要获取当前窗口 ID：`chrome.windows.getCurrent()`
- 确保标签页在可见窗口中

### 4. 错误处理

- 某些标签页可能无法截图（如 chrome:// 页面）
- 需要捕获异常，避免一个失败导致全部失败
- 失败的标签页可以回退到 OpenGraph 数据

## 权限要求

`chrome.tabs.captureVisibleTab` 需要以下权限：

- `tabs` 权限（已包含）
- `activeTab` 权限（已包含）

**注意**：`chrome.tabs.captureVisibleTab` 不需要额外的 `tabCapture` 权限，`tabs` 权限已经足够。

## 测试

1. 打开几个文档类网站（Notion、飞书、GitHub 等）
2. 点击"清理"按钮
3. 检查控制台日志，确认截图成功
4. 在个人空间查看，确认截图正确显示

## 性能优化

1. **批量处理**：可以并发截图多个标签页（但需要小心窗口切换）
2. **延迟控制**：每个标签页之间添加延迟，避免过快切换
3. **缓存机制**：相同 URL 的截图可以缓存

## 后续改进

1. **智能等待**：根据页面加载状态动态调整等待时间
2. **首屏截图**：对于长页面，可以只截取首屏
3. **压缩优化**：在前端压缩截图，减少存储空间
4. **错误重试**：失败的截图可以重试



