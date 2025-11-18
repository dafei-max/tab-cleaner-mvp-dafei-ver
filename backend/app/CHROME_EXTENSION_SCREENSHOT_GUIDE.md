# Chrome 扩展程序截图实现指南

## Chrome Extension API 截图能力

根据 Chrome 扩展程序的能力限制，有以下几种截图方式：

### 1. `chrome.tabs.captureVisibleTab`（推荐）

**能力**：
- ✅ 可以捕获当前活动标签页的**可见区域**
- ✅ 不需要额外权限（`tabs` 权限已足够）
- ✅ 性能好，速度快
- ❌ **只能捕获可见区域**，不能自动滚动捕获全页

**使用场景**：
- 捕获首屏内容（适合我们的用例）
- 捕获当前可见的页面内容
- 不需要全页截图的情况

**实现方式**：
```javascript
// 切换到目标标签页
await chrome.tabs.update(tabId, { active: true });

// 等待页面加载
await new Promise(resolve => setTimeout(resolve, 2000));

// 截图（只能捕获可见区域）
const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
  format: 'jpeg',
  quality: 85,
});
```

### 2. Content Script + 多次截图（全页截图）

**能力**：
- ✅ 可以实现全页截图（像 GoFullPage）
- ❌ 需要多次调用 `captureVisibleTab`
- ❌ 需要合并多个截图
- ❌ 实现复杂，性能较差

**实现方式**（GoFullPage 的做法）：
```javascript
// 1. 在 content script 中滚动页面
// 2. 每次滚动后调用 captureVisibleTab
// 3. 将多个截图合并成一张长图
```

**注意**：对于我们的用例（文档类网站可视化），**不需要全页截图**，首屏截图已经足够。

### 3. 后端 Playwright（不推荐）

**问题**：
- ❌ 会被安全拦截（反爬虫）
- ❌ 无法访问需要登录的页面
- ❌ 性能差，需要启动无头浏览器

## 我们的实现方案

### 当前实现

使用 `chrome.tabs.captureVisibleTab` 捕获首屏内容：

1. **识别文档类 URL**：自动识别需要截图的文档类网站
2. **切换到标签页**：`chrome.tabs.update(tabId, { active: true })`
3. **准备页面**：使用 content script 滚动到顶部，等待加载
4. **截图**：`chrome.tabs.captureVisibleTab` 捕获可见区域
5. **合并数据**：将截图合并到 OpenGraph 数据中

### 为什么只截首屏？

1. **性能考虑**：全页截图需要多次滚动和截图，速度慢
2. **用户体验**：首屏内容通常包含最重要的信息（标题、开头内容）
3. **存储空间**：首屏截图文件更小，节省存储
4. **符合用例**：对于标签页管理，首屏预览已经足够

### 如果需要全页截图

如果将来需要全页截图，可以参考以下实现：

```javascript
async function captureFullPageScreenshot(tabId) {
  // 1. 注入 content script
  await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const screenshots = [];
      const viewportHeight = window.innerHeight;
      const totalHeight = document.documentElement.scrollHeight;
      
      // 滚动并截图
      for (let scrollTop = 0; scrollTop < totalHeight; scrollTop += viewportHeight) {
        window.scrollTo(0, scrollTop);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 发送消息给 background script 截图
        chrome.runtime.sendMessage({
          action: 'captureVisibleTab',
          scrollTop: scrollTop
        }, (response) => {
          screenshots.push(response.dataUrl);
        });
      }
      
      // 合并截图（需要在前端或后端处理）
      return screenshots;
    }
  });
}
```

**注意**：全页截图实现复杂，需要：
- 多次滚动和截图
- 合并多个截图
- 处理重叠区域
- 性能优化

## 最佳实践

### 1. 等待页面加载

```javascript
// 方法1：固定等待时间（简单但可能不够准确）
await new Promise(resolve => setTimeout(resolve, 2000));

// 方法2：使用 content script 等待页面加载（推荐）
await chrome.scripting.executeScript({
  target: { tabId },
  func: () => {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        setTimeout(resolve, 1500);
      } else {
        window.addEventListener('load', () => {
          setTimeout(resolve, 1500);
        }, { once: true });
      }
    });
  }
});
```

### 2. 滚动到顶部

```javascript
await chrome.scripting.executeScript({
  target: { tabId },
  func: () => {
    window.scrollTo(0, 0);
  }
});
```

### 3. 错误处理

```javascript
try {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'jpeg',
    quality: 85,
  });
} catch (error) {
  // 处理错误，回退到 OpenGraph 数据
  console.error('Screenshot failed:', error);
}
```

## 权限要求

使用 `chrome.tabs.captureVisibleTab` 需要：

- `tabs` 权限（已包含）
- `activeTab` 权限（已包含）
- `scripting` 权限（用于注入 content script，已包含）

**不需要**：
- `tabCapture` 权限（这是用于录制标签页视频的）
- `desktopCapture` 权限（这是用于屏幕录制的）

## 性能优化

1. **批量处理**：可以并发处理多个标签页，但需要小心窗口切换
2. **延迟控制**：每个标签页之间添加延迟，避免过快切换
3. **缓存机制**：相同 URL 的截图可以缓存

## 总结

对于我们的用例（文档类网站可视化），使用 `chrome.tabs.captureVisibleTab` 捕获首屏内容是最合适的方案：

- ✅ 符合 Chrome 扩展程序能力限制
- ✅ 性能好，速度快
- ✅ 实现简单，维护容易
- ✅ 首屏内容已经足够用于可视化

如果需要全页截图，可以参考 GoFullPage 的实现方式，但会增加复杂度和性能开销。



