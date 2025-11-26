# 一键清理流程检查清单

## 触发入口

有两个入口可以触发"一键清理"：

1. **卡片按钮** (`content.js`) → 发送 `{ action: "clean" }`
2. **宠物按钮** (`pet.js`) → 发送 `{ action: "clean-all" }`

两个流程完全相同，都执行以下步骤。

---

## 完整执行流程

### ✅ 步骤 1: 获取并过滤标签页

**位置**: `background.js` → `clean` / `clean-all` action handler

```javascript
chrome.tabs.query({}, async (tabs) => {
  // 1.1 过滤特殊页面
  const validTabs = tabs.filter(tab => {
    // 排除: chrome://, chrome-extension://, about:, edge://
    // 排除: Chrome Web Store 页面
  });
  
  // 1.2 去重（相同 URL 只保留一个）
  const uniqueTabs = validTabs.filter(...);
});
```

**输出**: `uniqueTabs` - 去重后的有效标签页列表

---

### ✅ 步骤 2: 本地抓取 OpenGraph（每个标签页）

**位置**: `background.js` → `Promise.allSettled` 并行抓取

```javascript
const localOGResults = await Promise.allSettled(
  uniqueTabs.map(async (tab) => {
    // 2.1 发送消息到 content script
    const localOG = await chrome.tabs.sendMessage(tab.id, { 
      action: 'fetch-opengraph' 
    });
    
    // 2.2 content script 调用 opengraph_local.js
    // opengraph_local.js 从页面 DOM 提取 OpenGraph 数据
    
    // 2.3 opengraph_local.js 通过 window.postMessage 保存到 Chrome Storage
    // content.js 监听 postMessage 并保存到 chrome.storage.local
    
    return {
      ...localOG,
      url: localOG.url || tab.url,
      title: localOG.title || tab.title || tab.url,
      id: localOG.id || `og_${Date.now()}_${Math.random()}`,
    };
  })
);
```

**数据流**:
```
background.js 
  → chrome.tabs.sendMessage(tab.id, { action: 'fetch-opengraph' })
    → content.js (监听消息)
      → window.__TAB_CLEANER_GET_OPENGRAPH() (opengraph_local.js)
        → 提取 OpenGraph 数据
          → window.postMessage({ type: 'TAB_CLEANER_CACHE_OPENGRAPH', data: ... })
            → content.js (监听 postMessage)
              → chrome.storage.local.set() (保存到 recent_opengraph)
```

**输出**: `opengraphItems` - 所有标签页的 OpenGraph 数据（包括失败的）

---

### ✅ 步骤 3: 立即保存到 Chrome Storage

**位置**: `background.js` → 创建新 session

```javascript
// 3.1 创建新 session
const sessionId = `session_${Date.now()}_${Math.random()}`;
const sessionName = `洗衣筐${counter}`; // 自动递增

const newSession = {
  id: sessionId,
  name: sessionName,
  createdAt: Date.now(),
  opengraphData: opengraphItems, // 先保存没有 embedding 的数据
  tabCount: opengraphItems.length,
};

// 3.2 保存到 Chrome Storage
await chrome.storage.local.set({ 
  sessions: [newSession, ...existingSessions],
  lastCleanTime: Date.now(),
  currentSessionId: sessionId,
});
```

**关键点**:
- ✅ **不等待 embedding** - 立即保存，用户可以马上看到结果
- ✅ **数据完整性** - 即使 OpenGraph 抓取失败，也会保存基础记录（URL、title）
- ✅ **自动命名** - 洗衣筐1, 洗衣筐2, ... 自动递增

---

### ✅ 步骤 4: 关闭所有标签页

**位置**: `background.js` → 关闭标签页

```javascript
const allTabIds = uniqueTabs.map(tab => tab.id).filter(id => id !== undefined);

for (const tabId of allTabIds) {
  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {
    console.warn(`Tab ${tabId} already closed:`, error.message);
  }
}
```

**关键点**:
- ✅ **OpenGraph 已获取完成** - 确保数据已保存后再关闭
- ✅ **错误处理** - 如果标签页已关闭，忽略错误

---

### ✅ 步骤 5: 打开个人空间

**位置**: `background.js` → 创建新标签页

```javascript
await chrome.tabs.create({
  url: chrome.runtime.getURL("personalspace.html")
});
```

**关键点**:
- ✅ **立即显示** - 不等待 embedding 生成
- ✅ **自动加载最新 session** - PersonalSpace 会读取 `currentSessionId`

---

### ✅ 步骤 6: 异步生成 Embedding（后台）

**位置**: `background.js` → 异步处理（不阻塞主流程）

```javascript
(async () => {
  const successfulItems = opengraphItems.filter(item => item.success);
  
  // 批量生成 embedding（每批 5 个）
  const batchSize = 5;
  for (let i = 0; i < successfulItems.length; i += batchSize) {
    const batch = successfulItems.slice(i, i + batchSize);
    
    // 调用后端 API
    const embedResponse = await fetch(`${apiUrl}/api/v1/search/embedding`, {
      method: 'POST',
      body: JSON.stringify({ opengraph_items: batch }),
    });
    
    // 更新 session 中的 embedding 数据
    const sessions = await chrome.storage.local.get(['sessions']);
    // ... 更新逻辑 ...
    await chrome.storage.local.set({ sessions });
  }
})();
```

**关键点**:
- ✅ **异步处理** - 不阻塞主流程，用户立即看到结果
- ✅ **批量处理** - 每批 5 个，避免过载
- ✅ **自动更新** - 生成后自动更新 session 数据

---

## 数据存储位置

### 1. **Chrome Storage Local**

**键名**:
- `sessions` - 所有 session 列表
- `currentSessionId` - 当前 session ID
- `lastCleanTime` - 最后清理时间
- `recent_opengraph` - 最近提取的 OpenGraph 数据（由 opengraph_local.js 保存）
- `opengraph_cache_${url}` - 每个 URL 的独立缓存

**数据结构**:
```javascript
{
  sessions: [
    {
      id: "session_1234567890_abc",
      name: "洗衣筐1",
      createdAt: 1234567890,
      opengraphData: [
        {
          id: "og_1234567890_xyz",
          url: "https://example.com",
          title: "Example Title",
          image: "https://example.com/image.jpg",
          description: "Example description",
          success: true,
          // ... 其他字段
        }
      ],
      tabCount: 1
    }
  ],
  currentSessionId: "session_1234567890_abc",
  lastCleanTime: 1234567890
}
```

---

## 错误处理

### 1. **OpenGraph 抓取失败**

- ✅ 仍然保存基础记录（URL、title）
- ✅ `success: false`，包含 `error` 字段
- ✅ 不影响其他标签页的处理

### 2. **标签页已关闭**

- ✅ 忽略错误，继续处理其他标签页
- ✅ 记录警告日志

### 3. **Storage 配额超限**

- ✅ 自动清理旧数据（只保留最新 10 个 sessions）
- ✅ 重试保存

### 4. **后端 API 失败**

- ✅ Embedding 生成失败不影响主流程
- ✅ 记录警告日志
- ✅ 用户仍能看到 OpenGraph 数据（只是没有 embedding）

---

## 关键检查点

### ✅ 1. OpenGraph 数据完整性

- [x] 每个标签页都有对应的 OpenGraph 记录
- [x] 即使抓取失败，也有基础记录（URL、title）
- [x] 图片链接被正确保存（`image` 字段）

### ✅ 2. 数据保存

- [x] Session 立即保存到 Chrome Storage
- [x] `recent_opengraph` 列表被更新（由 opengraph_local.js 保存）
- [x] `currentSessionId` 被正确设置

### ✅ 3. 标签页关闭

- [x] 所有标签页都被关闭（除了个人空间）
- [x] 错误处理正确（已关闭的标签页不会报错）

### ✅ 4. 个人空间显示

- [x] 个人空间正确打开
- [x] 最新 session 被正确加载
- [x] 卡片正确显示（即使没有 embedding）

### ✅ 5. Embedding 生成

- [x] 异步生成，不阻塞主流程
- [x] 批量处理，避免过载
- [x] 自动更新 session 数据

---

## 性能优化

### ✅ 1. 并行抓取

- 使用 `Promise.allSettled` 并行抓取所有标签页的 OpenGraph
- 不等待所有完成，失败不影响其他

### ✅ 2. 立即保存

- 不等待 embedding 生成，立即保存 session
- 用户可以马上看到结果

### ✅ 3. 异步 Embedding

- Embedding 生成在后台进行
- 不阻塞主流程

### ✅ 4. 批量处理

- Embedding 批量生成（每批 5 个）
- 批次间延迟 200ms，避免过载

---

## 总结

**完整流程**:
```
用户点击"一键清理"
  ↓
步骤 1: 获取并过滤标签页 ✅
  ↓
步骤 2: 本地抓取 OpenGraph（并行）✅
  ├─ content.js 调用 opengraph_local.js
  └─ opengraph_local.js 保存到 Chrome Storage
  ↓
步骤 3: 立即保存 Session ✅
  ↓
步骤 4: 关闭所有标签页 ✅
  ↓
步骤 5: 打开个人空间 ✅
  ↓
步骤 6: 异步生成 Embedding（后台）✅
```

**关键特性**:
- ✅ 完全本地优先 - OpenGraph 抓取在客户端完成
- ✅ 立即响应 - 不等待 embedding，立即显示结果
- ✅ 数据完整性 - 即使失败也有基础记录
- ✅ 错误处理 - 完善的错误处理和恢复机制



