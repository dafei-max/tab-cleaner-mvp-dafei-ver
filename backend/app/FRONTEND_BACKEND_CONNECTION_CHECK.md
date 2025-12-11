# 前端后端连接检查指南

## 🔍 问题诊断

### 当前情况

1. **前端配置的 URL**：
   - `https://tab-cleaner-mvp-production.up.railway.app`

2. **你提到的 URL**：
   - `tab-cleaner-mvp-app-production.up.railway.app`

3. **测试结果**：
   - ✅ 两个 URL 都能访问根路径（返回 `{"ok":true,"message":"Hello Tab Cleaner"}`）
   - ⚠️ 需要确认哪个是正确的部署地址

---

## 🛠️ 排查步骤

### 1. 确认正确的 Railway URL

在 Railway Dashboard 中：
1. 进入项目 `tab-cleaner-mvp-app`
2. 点击 **Settings** → **Networking**
3. 查看 **Public Domain** 显示的完整 URL
4. 应该是：`https://tab-cleaner-mvp-app-production.up.railway.app` 或 `https://tab-cleaner-mvp-production.up.railway.app`

### 2. 检查前端是否使用了正确的 URL

#### 方法 1：检查浏览器控制台

1. 打开 Chrome 扩展
2. 打开开发者工具（F12）
3. 切换到 **Console** 标签
4. 查看是否有 CORS 错误或网络错误
5. 切换到 **Network** 标签
6. 执行一个操作（如搜索）
7. 查看请求发送到哪个 URL

#### 方法 2：检查前端代码

前端 API 配置在以下文件中：
- `frontend/src/shared/api.js`
- `frontend/public/assets/api_config.js`
- `frontend/public/manifest.json` (CSP 配置)

### 3. 测试后端 API

#### 测试根路径
```bash
curl https://tab-cleaner-mvp-app-production.up.railway.app/
# 应该返回: {"ok":true,"message":"Hello Tab Cleaner"}
```

#### 测试搜索 API
```bash
curl -X POST https://tab-cleaner-mvp-app-production.up.railway.app/api/v1/search/query \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test" \
  -d '{"query":"test"}'
```

#### 测试 Embedding API
```bash
curl -X POST https://tab-cleaner-mvp-app-production.up.railway.app/api/v1/search/embedding \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test" \
  -d '{"opengraph_items":[]}'
```

---

## 🔧 修复方法

### 如果 URL 不匹配

#### 情况 1：前端配置错误

如果正确的 URL 是 `tab-cleaner-mvp-app-production.up.railway.app`，需要更新前端配置：

1. **更新 `frontend/src/shared/api.js`**：
```javascript
const RAILWAY_API_URL = 'https://tab-cleaner-mvp-app-production.up.railway.app';
```

2. **更新 `frontend/public/assets/api_config.js`**：
```javascript
const RAILWAY_API_URL = 'https://tab-cleaner-mvp-app-production.up.railway.app';
```

3. **更新 `frontend/public/manifest.json`** (CSP)：
```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; connect-src 'self' https://tab-cleaner-mvp-app-production.up.railway.app http://localhost:8000"
}
```

4. **重新构建前端**：
```bash
cd frontend
npm run build
```

5. **重新加载扩展**：
   - 打开 `chrome://extensions/`
   - 点击扩展的"重新加载"按钮

#### 情况 2：CORS 问题

后端已配置 CORS 允许所有来源：
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

如果仍有 CORS 错误，检查：
1. 后端是否正常运行
2. Railway 日志中是否有错误
3. 请求头是否正确

---

## 📋 检查清单

- [ ] 确认 Railway 项目的正确 Public Domain
- [ ] 检查前端代码中的 API URL 配置
- [ ] 检查 `manifest.json` 中的 CSP 配置
- [ ] 测试后端 API 是否可访问
- [ ] 检查浏览器控制台的错误信息
- [ ] 检查 Network 标签中的请求状态
- [ ] 确认前端已重新构建并重新加载扩展

---

## 🐛 常见问题

### Q1: 前端请求没有反应

**可能原因**：
1. URL 配置错误
2. CORS 被阻止
3. 后端服务未运行
4. 网络连接问题

**排查步骤**：
1. 打开浏览器开发者工具 → Network
2. 查看请求是否发送
3. 查看请求的 URL 是否正确
4. 查看响应状态码和错误信息

### Q2: 返回 404 错误

**可能原因**：
- API 路径错误
- 后端路由未配置

**检查**：
- 确认 API 路径是 `/api/v1/...`
- 检查后端 `main.py` 中的路由定义

### Q3: 返回 500 错误

**可能原因**：
- 后端代码错误
- 环境变量未配置
- 数据库连接失败

**检查**：
- 查看 Railway 的 Deploy Logs
- 检查环境变量是否设置
- 检查数据库连接配置

### Q4: CORS 错误

**可能原因**：
- CSP 配置不允许连接
- 后端 CORS 配置问题

**检查**：
- `manifest.json` 中的 `connect-src` 是否包含后端 URL
- 后端 CORS 中间件是否正确配置

---

## ✅ 验证连接

### 1. 测试根路径
```bash
curl https://tab-cleaner-mvp-app-production.up.railway.app/
```

### 2. 测试搜索 API
```bash
curl -X POST https://tab-cleaner-mvp-app-production.up.railway.app/api/v1/search/query \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test" \
  -d '{"query":"test"}'
```

### 3. 在浏览器中测试
1. 打开扩展
2. 执行搜索操作
3. 查看 Network 标签
4. 确认请求成功（状态码 200）

---

**最后更新**: 2025-12-03





