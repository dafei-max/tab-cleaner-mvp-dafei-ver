# 本地优先工作流程（Local-First Workflow）

## 概述

新的工作流程完全基于**本地 OpenGraph 抓取**，后端仅用于生成 embedding（异步，不阻塞）。

## 工作流程

```
用户点击"一键清理"
  ↓
步骤 1: 本地抓取 OpenGraph（每个网站）
  - Content Script 从页面 DOM 提取 OpenGraph 数据
  - 使用用户的浏览器会话（可访问需要登录的页面）
  - 完全本地处理，无需后端
  ↓
步骤 2: 立即保存到 Chrome Storage
  - 不等待 embedding 生成
  - 立即保存 OpenGraph 数据
  - 创建新 session
  ↓
步骤 3: 关闭所有标签页
  - OpenGraph 数据已获取完成
  - 逐个关闭标签页
  ↓
步骤 4: 打开个人空间展示结果
  - 立即显示卡片（不等待 embedding）
  - 用户可以立即看到结果
  ↓
步骤 5: 异步生成 embedding（后台）
  - 批量发送到后端生成 embedding
  - 每批 5 个，避免过载
  - 完成后更新 session 数据
  - 不阻塞主流程
```

## 优势

### 1. **更快响应**
- 本地抓取 OpenGraph：毫秒级响应
- 立即显示卡片：用户无需等待
- 异步生成 embedding：不阻塞主流程

### 2. **绕过风控**
- 使用真实浏览器环境
- 使用用户的登录会话
- 无需处理 IP 限制、Cookie 等问题

### 3. **减少后端负载**
- 后端不再需要抓取 OpenGraph
- 后端只负责生成 embedding
- 减少网络请求和服务器压力

### 4. **更好的用户体验**
- 立即看到结果
- 卡片可以立即渲染
- Embedding 生成在后台进行

## 技术实现

### 前端（Chrome Extension）

#### 1. Content Script (`content.js`)
- 注入 `opengraph_local.js`
- 监听 `fetch-opengraph` 消息
- 调用 `window.__TAB_CLEANER_GET_OPENGRAPH()`

#### 2. OpenGraph 本地抓取 (`opengraph_local.js`)
- 从页面 DOM 提取 OpenGraph 数据
- 支持 Pinterest、小红书等特殊处理
- 返回完整的 OpenGraph 对象

#### 3. Background Script (`background.js`)
- `clean-all` 动作：完全本地抓取
- `clean` 动作：完全本地抓取
- 立即保存到 Chrome Storage
- 异步生成 embedding

### 后端（FastAPI）

#### 1. Embedding 生成 API (`/api/v1/search/embedding`)
- 接收 OpenGraph 数据
- 生成 text_embedding 和 image_embedding
- 返回 embedding 数据

#### 2. 不再需要 OpenGraph 抓取 API
- `/api/v1/tabs/opengraph` 可以保留作为 fallback
- 但主要流程不再使用

## 数据流

### 本地抓取阶段
```
Content Script → opengraph_local.js → DOM 解析 → OpenGraph 对象
```

### 保存阶段
```
Background Script → Chrome Storage → Session 对象
```

### Embedding 生成阶段（异步）
```
Background Script → Backend API → Embedding → 更新 Session
```

## 错误处理

### 本地抓取失败
- 创建基础记录（包含 URL、标题）
- `success: false`
- 仍然保存到 session
- 前端可以显示占位符卡片

### Embedding 生成失败
- 不影响主流程
- 记录警告日志
- 卡片仍然可以显示（只是没有 embedding）
- 搜索功能可能受限

## 性能优化

### 批量处理
- Embedding 生成：每批 5 个
- 批次间延迟：200ms
- 避免后端过载

### 异步处理
- Embedding 生成完全异步
- 不阻塞主流程
- 后台静默更新

## 兼容性

### 向后兼容
- 保留后端 OpenGraph API（作为 fallback）
- 保留旧的数据格式
- 平滑迁移

### 降级策略
- 如果本地抓取失败，可以回退到后端
- 如果后端不可用，仍然可以显示卡片（无 embedding）

## 测试

### 本地测试
1. 打开多个标签页
2. 点击"一键清理"
3. 检查 Console 日志
4. 验证卡片立即显示
5. 验证 embedding 异步生成

### 后端测试
1. 检查 embedding API 是否正常
2. 验证批量处理是否正常
3. 检查 session 更新是否正常

## 未来优化

1. **增量更新**：只更新有变化的卡片
2. **缓存机制**：缓存已生成的 embedding
3. **离线支持**：完全离线模式（无后端）
4. **智能重试**：自动重试失败的 embedding



