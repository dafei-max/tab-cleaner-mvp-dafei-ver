# API 配置更新说明

## 📋 更新内容

已将前端代码中的硬编码 `http://localhost:8000` 替换为 Railway 生产环境地址。

## 🔧 修改的文件

### 1. `public/assets/api_config.js` (新建)
- 创建了统一的 API 配置模块
- 默认使用 Railway 生产环境：`https://tab-cleaner-mvp-production.up.railway.app`
- 支持通过 `chrome.storage` 动态切换本地/生产环境

### 2. `public/assets/background.js`
- 导入 `api_config.js`
- 所有 API 调用改为使用 `API_CONFIG.getBaseUrlSync()` 获取地址
- 修改的位置：
  - `clean` action: OpenGraph 和 Embedding API
  - `clean-all` action: OpenGraph 和 Embedding API
  - `clean-current-tab` action: OpenGraph API

### 3. `src/shared/api.js`
- 更新 API 基础 URL 为 Railway 地址
- 所有 API 调用自动使用新的地址

### 4. `src/screens/PersonalSpace/PersonalSpace.jsx`
- AI Insight API 调用改为使用 Railway 地址

### 5. `public/manifest.json`
- 添加了 Content Security Policy，允许连接到 Railway 域名

## 🚀 Railway 配置

**生产环境地址**: `https://tab-cleaner-mvp-production.up.railway.app`

**端口**: Railway 自动处理端口映射（内部端口 8080，外部通过 HTTPS 访问）

## 🔄 环境切换

### 使用生产环境（默认）
无需配置，默认使用 Railway 生产环境。

### 切换到本地开发环境

如果需要使用本地开发环境，可以在浏览器控制台执行：

```javascript
// 设置使用本地 API
chrome.storage.local.set({ use_local_api: true });

// 或直接设置 API URL
chrome.storage.local.set({ api_url: 'http://localhost:8000' });

// 恢复使用生产环境
chrome.storage.local.set({ use_local_api: false });
chrome.storage.local.remove('api_url');
```

## ✅ 验证

1. **重新加载扩展**
   - 打开 `chrome://extensions/`
   - 点击扩展的"重新加载"按钮

2. **测试一键清理功能**
   - 点击"一键清理"按钮
   - 应该能正常连接到 Railway 后端

3. **检查网络请求**
   - 打开开发者工具 → Network
   - 查看请求是否发送到 `https://tab-cleaner-mvp-production.up.railway.app`

## 🐛 故障排查

### 问题：仍然无法连接

1. **检查 Railway 服务状态**
   - 访问 Railway Dashboard
   - 确认服务正在运行

2. **检查 CORS 配置**
   - Railway 后端需要允许 Chrome 扩展的请求
   - 检查 `main.py` 中的 CORS 配置

3. **检查 HTTPS**
   - Railway 使用 HTTPS，确保后端支持 HTTPS

4. **查看浏览器控制台**
   - 检查是否有 CSP 错误
   - 检查网络请求的错误信息

### 问题：CORS 错误

如果遇到 CORS 错误，需要在后端 `main.py` 中添加扩展的 origin：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*"],  # 允许所有 Chrome 扩展
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 📝 注意事项

- Railway 域名可能会变化，如果域名更新，需要更新 `api_config.js` 中的 `RAILWAY_API_URL`
- 本地开发时，确保本地后端服务运行在 `http://localhost:8000`
- 生产环境使用 HTTPS，本地开发使用 HTTP



