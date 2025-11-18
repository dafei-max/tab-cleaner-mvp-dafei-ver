# 本地 OpenGraph 抓取实现指南

## 为什么在客户端本地抓取？

### 优势 ✅

1. **使用用户的浏览器会话**
   - 可以访问需要登录的页面（小红书、Pinterest 等）
   - 使用用户的真实 cookies 和 session

2. **绕过风控**
   - 使用真实浏览器环境，不会被识别为爬虫
   - 避免云服务器 IP 被拦截（403）

3. **减少后端负载**
   - 不需要后端处理大部分 OpenGraph 抓取
   - 降低服务器成本

4. **更快响应**
   - 直接从页面 DOM 读取，无需网络请求

### 劣势 ⚠️

1. **需要 Content Script**
   - 某些页面可能不支持（chrome://, chrome-extension://）
   - 需要页面加载完成

2. **无法处理动态内容**
   - 如果页面是 JavaScript 渲染的，可能需要等待

## 实现架构

```
用户点击"一键清理"
  ↓
Background Script (background.js)
  ↓
尝试从 Content Script 获取本地 OpenGraph
  ↓
成功？ → 使用本地数据 ✅
失败？ → 调用后端 API（Fallback）🔄
```

## 文件结构

```
frontend/public/assets/
├── background.js          # 主逻辑，优先调用本地抓取
├── content.js            # Content Script，加载 opengraph_local.js
└── opengraph_local.js    # 本地 OpenGraph 抓取工具
```

## 工作流程

### 1. Content Script 加载

`content.js` 自动加载 `opengraph_local.js`：

```javascript
// content.js
const script = document.createElement('script');
script.src = chrome.runtime.getURL('assets/opengraph_local.js');
document.head.appendChild(script);
```

### 2. 本地 OpenGraph 抓取

`opengraph_local.js` 暴露全局函数：

```javascript
window.__TAB_CLEANER_GET_OPENGRAPH()
```

这个函数会：
- 读取页面的 `<meta>` 标签（og:title, og:image 等）
- 提取 Twitter Card 标签
- 查找第一个大图（如果没有 OG 图片）
- 返回 OpenGraph 数据

### 3. Background Script 调用

`background.js` 发送消息到 Content Script：

```javascript
const localOG = await chrome.tabs.sendMessage(tab.id, { 
  action: 'fetch-opengraph' 
});
```

### 4. Fallback 到后端

如果本地抓取失败，自动使用后端 API：

```javascript
if (!localOG || !localOG.success) {
  // 调用后端 API
  const response = await fetch(`${apiUrl}/api/v1/tabs/opengraph`, ...);
}
```

## 数据格式

本地抓取返回的数据格式与后端 API 一致：

```javascript
{
  url: "https://example.com",
  title: "页面标题",
  description: "页面描述",
  image: "https://example.com/image.jpg",
  site_name: "Example",
  success: true,
  error: null,
  is_local_fetch: true  // 标记为本地抓取
}
```

## 支持的页面类型

### ✅ 支持
- 普通网页（http://, https://）
- 需要登录的页面（使用用户会话）
- 动态内容页面（等待加载完成）

### ❌ 不支持
- `chrome://` 页面
- `chrome-extension://` 页面
- `about:` 页面
- Chrome Web Store

这些页面会自动 fallback 到后端 API。

## 性能优化

1. **批量处理**
   - 使用 `Promise.allSettled` 并行抓取多个标签页
   - 失败的自动 fallback 到后端

2. **超时处理**
   - 本地抓取超时：1 秒
   - 后端 API 超时：30 秒

3. **错误处理**
   - 本地抓取失败不影响整体流程
   - 自动 fallback 确保数据完整性

## 测试

### 测试本地抓取

1. 打开一个普通网页（如 https://example.com）
2. 打开 Chrome DevTools Console
3. 运行：
   ```javascript
   window.__TAB_CLEANER_GET_OPENGRAPH()
   ```
4. 应该返回 OpenGraph 数据

### 测试完整流程

1. 打开多个标签页（包括需要登录的页面）
2. 点击"一键清理"
3. 查看 Console 日志：
   - `✅ Got local OpenGraph data` - 本地抓取成功
   - `Using backend API` - Fallback 到后端

## 下一步优化

1. **缓存机制**
   - 缓存已抓取的 OpenGraph 数据
   - 避免重复抓取相同 URL

2. **智能等待**
   - 检测页面是否完全加载
   - 等待动态内容渲染完成

3. **错误重试**
   - 本地抓取失败时，等待后重试
   - 提高成功率

