# Railway 后端部署详细指南

## 📋 前置准备

1. **Railway 账号**
   - 访问 [railway.app](https://railway.app)
   - 使用 GitHub 账号登录（推荐）

2. **GitHub 仓库**
   - 确保代码已推送到 GitHub
   - Railway 需要连接 GitHub 仓库

3. **API Key**
   - 准备好阿里云 DashScope API Key
   - 如果没有，访问 [阿里云 DashScope](https://dashscope.console.aliyun.com/)

---

## 🚀 部署步骤

### 方法 1：通过 Railway Web 界面（推荐）

#### 步骤 1：创建新项目

1. 登录 [Railway Dashboard](https://railway.app/dashboard)
2. 点击 **"New Project"**
3. 选择 **"Deploy from GitHub repo"**
4. 授权 Railway 访问你的 GitHub
5. 选择你的仓库：`CleanTab_Assets` 或 `tab-cleaner-mvp`

#### 步骤 2：配置项目

1. Railway 会自动检测项目
2. **重要**：设置根目录为 `backend/app`
   - 点击项目设置（Settings）
   - 找到 "Root Directory"
   - 设置为：`backend/app`

#### 步骤 3：设置环境变量

1. 在项目页面，点击 **"Variables"** 标签
2. 添加以下环境变量：

```
DASHSCOPE_API_KEY=你的阿里云API密钥
```

**注意**：
- 变量名必须完全匹配：`DASHSCOPE_API_KEY`
- 值是你的实际 API Key（不要加引号）

#### 步骤 4：配置构建和启动

Railway 会自动检测到：
- `pyproject.toml` → 使用 `uv` 安装依赖
- `Procfile` → 使用 `uvicorn` 启动服务

如果自动检测失败，可以手动设置：

**Build Command**（构建命令）：
```bash
pip install uv && uv pip install --system -r pyproject.toml && playwright install chromium
```

**Start Command**（启动命令）：
```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

#### 步骤 5：部署

1. Railway 会自动开始部署
2. 等待构建完成（通常 2-5 分钟）
3. 查看日志确认部署成功

#### 步骤 6：获取部署 URL

1. 部署完成后，Railway 会生成一个 URL
2. 格式类似：`https://your-app-name.up.railway.app`
3. 点击 **"Settings"** → **"Generate Domain"** 可以自定义域名

---

### 方法 2：使用 Railway CLI（高级）

#### 安装 Railway CLI

```bash
npm install -g @railway/cli
```

#### 登录

```bash
railway login
```

#### 初始化项目

```bash
cd backend/app
railway init
```

#### 设置环境变量

```bash
railway variables set DASHSCOPE_API_KEY=你的API密钥
```

#### 部署

```bash
railway up
```

---

## 🔧 配置说明

### 端口配置

Railway 会自动设置 `$PORT` 环境变量，代码中已经使用：

```python
# main.py 中 uvicorn 启动时使用 $PORT
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### 依赖安装

Railway 使用 `uv` 来安装 Python 依赖（因为项目使用 `pyproject.toml`）。

如果遇到问题，可以：

1. **使用 requirements.txt**（备选方案）：
   ```bash
   # 创建 requirements.txt
   uv pip compile pyproject.toml -o requirements.txt
   ```

2. **修改构建命令**：
   ```bash
   pip install -r requirements.txt && playwright install chromium
   ```

### Playwright 浏览器

Playwright 需要安装 Chromium 浏览器，构建命令中已包含：
```bash
playwright install chromium
```

如果构建时间过长，可以考虑：
- 使用 Docker 镜像（预装 Playwright）
- 或者禁用截图功能（如果不需要）

---

## ✅ 验证部署

### 1. 检查健康状态

访问你的 Railway URL：
```
https://your-app.up.railway.app/
```

应该返回：
```json
{"ok": true, "message": "Hello Tab Cleaner"}
```

### 2. 检查 API 端点

访问：
```
https://your-app.up.railway.app/api/v1/
```

### 3. 查看日志

在 Railway Dashboard 中：
1. 点击项目
2. 点击 **"Deployments"**
3. 查看最新部署的日志

---

## 🔗 更新前端 API 地址

部署成功后，需要更新前端代码中的 API 地址：

### 1. 修改 `frontend/src/shared/api.js`

```javascript
// 开发环境
// const API = "http://localhost:8000/api/v1";

// 生产环境（替换为你的 Railway URL）
const API = "https://your-app.up.railway.app/api/v1";
```

### 2. 修改 `frontend/public/assets/background.js`

找到所有 `http://localhost:8000` 替换为你的 Railway URL：

```javascript
// 替换前
const response = await fetch('http://localhost:8000/api/v1/tabs/opengraph', {

// 替换后
const response = await fetch('https://your-app.up.railway.app/api/v1/tabs/opengraph', {
```

### 3. 重新构建前端

```bash
cd frontend
npm run build
```

---

## 🐛 常见问题

### Q1: 构建失败 - "Python version not found"

**解决方案**：
- Railway 可能不支持 Python 3.13
- 修改 `pyproject.toml` 中的 `requires-python`：
  ```toml
  requires-python = ">=3.11"
  ```

### Q2: 构建失败 - "Playwright install failed"

**解决方案**：
1. 检查构建日志
2. 可能需要更多构建时间
3. 或者暂时禁用 Playwright（如果不需要截图功能）

### Q3: 部署后无法访问

**检查清单**：
- [ ] 端口是否正确（使用 `$PORT`）
- [ ] 环境变量是否设置
- [ ] 日志中是否有错误
- [ ] CORS 配置是否正确

### Q4: API 返回 500 错误

**可能原因**：
- API Key 未设置或错误
- 依赖未正确安装
- 查看 Railway 日志获取详细错误信息

### Q5: 构建时间过长

**优化建议**：
- 使用 `.railwayignore` 排除不需要的文件
- 使用 Docker 缓存
- 考虑使用预构建的 Docker 镜像

---

## 📝 创建 .railwayignore（可选）

在 `backend/app` 目录创建 `.railwayignore`：

```
__pycache__/
*.pyc
*.pyo
*.pyd
.Python
*.so
*.egg
*.egg-info/
dist/
build/
.env
*.log
*.json
clustering/results/
search_results_*.json
screenshot_test_results_*.json
```

---

## 🔄 自动部署

Railway 默认会在你推送代码到 GitHub 时自动重新部署。

### 禁用自动部署

1. 进入项目 Settings
2. 找到 "Source"
3. 取消勾选 "Auto Deploy"

### 手动触发部署

1. 进入项目
2. 点击 "Deployments"
3. 点击 "Redeploy"

---

## 💰 费用说明

- **免费套餐**：$5/月免费额度
- **通常足够**：小型项目每月使用量
- **超出后**：按使用量付费

---

## 📞 获取帮助

- [Railway 文档](https://docs.railway.app/)
- [Railway Discord](https://discord.gg/railway)
- [Railway GitHub](https://github.com/railwayapp)

---

## 🎉 部署完成后的下一步

1. ✅ 验证后端 API 可以访问
2. ✅ 更新前端 API 地址
3. ✅ 重新构建前端
4. ✅ 测试插件功能
5. ✅ 打包插件准备上架



