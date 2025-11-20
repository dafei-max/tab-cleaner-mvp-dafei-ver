# 🔍 OpenGraph 数据通信检查清单

## ✅ 已完成检查

### 1. 通信检查 ✅
- [x] API 端点: POST /api/v1/search/embedding
- [x] 请求格式: { opengraph_items: [...] }
- [x] Content-Type: application/json
- [x] API URL 配置正确

### 2. 数据格式检查 ✅
- [x] 所有必需字段匹配
- [x] image 字段处理（数组→字符串）
- [x] 类型转换正确

### 3. 日志增强 ✅
- [x] 前端请求日志（URL, item count, sample data）
- [x] 前端响应日志（status, statusText）
- [x] 前端错误日志（详细错误信息）
- [x] 后端接收日志（item count, first item sample）

## 🔍 调试步骤

### 步骤 1: 检查前端是否发送请求

在浏览器控制台查看：
```
[Tab Cleaner Background] 📤 Sending batch X to backend:
  - url: https://...
  - itemCount: X
  - items: [...]
```

如果没有这个日志：
- 检查 `opengraphItems` 是否为空
- 检查 `successfulItems` 是否为空
- 检查 `apiUrl` 是否正确

### 步骤 2: 检查后端是否收到请求

在后端日志查看：
```
[API] 📥 Received request with X items for embedding generation
[API] 📋 First item sample: {...}
```

如果没有这个日志：
- 检查 Railway 服务是否运行
- 检查网络连接
- 检查 CORS 配置

### 步骤 3: 检查响应状态

在浏览器控制台查看：
```
[Tab Cleaner Background] 📥 Backend response:
  - status: 200
  - statusText: OK
  - ok: true
```

如果 status 不是 200：
- 检查后端错误日志
- 检查数据格式是否正确
- 检查后端是否有异常

### 步骤 4: 检查数据存储

在后端日志查看：
```
[API] ✓ Stored X/X items to vector DB
```

如果没有这个日志：
- 检查 `ADBPG_HOST` 环境变量
- 检查数据库连接
- 检查 `batch_upsert_items` 是否成功

## 🐛 常见问题

### 问题 1: 前端没有发送请求
**原因**: `opengraphItems` 为空或 `successfulItems` 为空
**解决**: 检查 `chrome.storage.local['recent_opengraph']` 是否有数据

### 问题 2: 后端没有收到请求
**原因**: API URL 错误或网络问题
**解决**: 检查 `api_config.js` 和 Railway 服务状态

### 问题 3: 后端返回错误
**原因**: 数据格式不匹配或后端异常
**解决**: 查看后端错误日志和堆栈跟踪

### 问题 4: 数据没有存储到数据库
**原因**: `ADBPG_HOST` 未配置或数据库连接失败
**解决**: 检查环境变量和数据库连接
