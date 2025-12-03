# 前端 API URL 更新总结

## ✅ 已更新的文件

已将前端所有 API URL 从 `tab-cleaner-mvp-production.up.railway.app` 更新为 `tab-cleaner-mvp-app-production.up.railway.app`

### 1. `frontend/src/shared/api.js`
- ✅ 更新 `RAILWAY_API_URL`

### 2. `frontend/public/assets/api_config.js`
- ✅ 更新 `RAILWAY_API_URL`
- ✅ 更新注释中的 URL

### 3. `frontend/public/manifest.json`
- ✅ 更新 CSP 中的 `connect-src` URL

### 4. `frontend/src/screens/PersonalSpace/PersonalSpace.jsx`
- ✅ 更新硬编码的 `apiUrl`

---

## 🔄 下一步操作

### 1. 重新构建前端

```bash
cd frontend
npm run build
```

### 2. 重新加载 Chrome 扩展

1. 打开 `chrome://extensions/`
2. 找到 "Tab Cleaner MVP" 扩展
3. 点击"重新加载"按钮

### 3. 测试连接

1. 打开扩展
2. 执行一个操作（如搜索）
3. 打开开发者工具 → Network
4. 确认请求发送到：`https://tab-cleaner-mvp-app-production.up.railway.app`

---

## ✅ 验证

### 测试后端 API

```bash
# 测试根路径
curl https://tab-cleaner-mvp-app-production.up.railway.app/

# 测试搜索 API
curl -X POST https://tab-cleaner-mvp-app-production.up.railway.app/api/v1/search/query \
  -H "Content-Type: application/json" \
  -H "X-User-ID: test" \
  -d '{"query":"test"}'
```

---

**更新日期**: 2025-12-03

