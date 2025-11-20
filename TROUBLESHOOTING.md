# 🔧 OpenGraph 本地抓取问题排查指南

## 问题现象

1. `window.__TAB_CLEANER_GET_OPENGRAPH` 函数未找到
2. 后端没有接收到 OpenGraph 数据
3. "一键清理"功能不工作

## 已实施的修复

### 1. 多层回退机制

```
尝试1: 加载脚本并等待函数暴露
  ↓ 失败
尝试2: 从缓存读取数据（recent_opengraph）
  ↓ 失败
尝试3: 使用强制回退函数（基础 OG 提取）
  ↓ 失败
返回错误（但不会崩溃）
```

### 2. 强制回退函数

如果 `opengraph_local.js` 脚本执行失败，会强制暴露一个基础函数：
- 提取基本的 OG 标签（title, image, description）
- 返回基础数据结构
- 确保函数始终可用

### 3. 缓存优先策略

- 优先从 `chrome.storage.local` 的 `recent_opengraph` 读取
- 如果缓存中有数据，直接返回
- 减少对脚本加载的依赖

## 调试步骤

### 步骤1: 检查脚本是否加载

在浏览器控制台运行：
```javascript
// 检查脚本是否在 DOM 中
document.querySelector('script[src*="opengraph_local.js"]')

// 检查函数是否可用
typeof window.__TAB_CLEANER_GET_OPENGRAPH
```

### 步骤2: 检查缓存数据

在浏览器控制台运行：
```javascript
chrome.storage.local.get(['recent_opengraph'], (items) => {
  console.log('Cached data:', items.recent_opengraph);
});
```

### 步骤3: 检查控制台错误

查看是否有：
- `[OpenGraph Local]` 开头的错误日志
- `[Tab Cleaner Content]` 开头的错误日志
- CSP（Content Security Policy）错误

### 步骤4: 手动测试函数

在浏览器控制台运行：
```javascript
// 如果函数存在，手动调用
if (typeof window.__TAB_CLEANER_GET_OPENGRAPH === 'function') {
  window.__TAB_CLEANER_GET_OPENGRAPH(false).then(console.log);
}
```

## 常见问题

### Q1: 函数为什么找不到？

**可能原因**:
1. CSP 阻止脚本执行
2. 脚本执行时出错（检查控制台）
3. 脚本加载但未执行到暴露函数的代码

**解决方案**:
- 检查浏览器控制台的错误日志
- 检查 `manifest.json` 的 CSP 配置
- 使用强制回退函数（已实现）

### Q2: 后端为什么没收到数据？

**原因**: 
- `/api/v1/tabs/opengraph` 端点期望 `local_opengraph_data` 字段
- 但 `clean-all` 流程中，数据是直接发送到 `/api/v1/search/embedding` 的
- 这两个端点不同！

**解决方案**:
- `clean-all` 流程正确：数据发送到 `/api/v1/search/embedding` ✅
- `/api/v1/tabs/opengraph` 端点只用于接收客户端数据 ✅

### Q3: 如何确保数据被发送到后端？

**检查点**:
1. `background.js` 中的 `normalizeItem()` 是否正确规范化数据
2. `successfulItems` 是否包含数据
3. `/api/v1/search/embedding` 端点是否收到请求

**调试代码**:
```javascript
// 在 background.js 中添加日志
console.log('[Background] Sending to embedding API:', normalizedBatch);
```

## 下一步

如果问题仍然存在，请提供：
1. 浏览器控制台的完整错误日志
2. Network 标签中 `/api/v1/search/embedding` 的请求和响应
3. `chrome.storage.local` 中的 `recent_opengraph` 数据
