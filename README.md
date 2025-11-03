# CleanTab MVP

一个最小可运行的前后端项目骨架。

## 目录结构

```
tab-cleaner-mvp/
├─ backend/
│  └─ app/
│     ├─ __init__.py
│     ├─ api/
│     │  └─ __init__.py
│     ├─ main.py              # FastAPI 应用入口
│     ├─ pyproject.toml        # 依赖配置
│     ├─ uv.lock              # 依赖锁定文件
│     ├─ services/             # 业务逻辑服务
│     └─ static/               # 静态资源
└─ frontend/
   ├─ src/
   │   ├─ popup/               # Popup 页面（React）
   │   ├─ sidepanel/           # Side Panel 页面（React）
   │   ├─ background/          # Service Worker
   │   ├─ shared/              # 共享逻辑（API 调用等）
   │   ├─ screens/             # Anima 组件
   │   └─ icons/                # SVG 图标
   ├─ public/                  # 静态资源（构建时会复制到 dist/）
   │   ├─ popup.html
   │   ├─ sidepanel.html
   │   ├─ manifest.json
   │   └─ img/                  # 图片资源
   ├─ dist/                    # 构建输出（Chrome 扩展目录）
   ├─ package.json
   └─ vite.config.js
```

## 快速开始

### 后端（FastAPI）

1. **安装 uv**（若尚未在 PATH）：
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   source "$HOME/.local/bin/env"
   ```

2. **同步依赖并创建虚拟环境**：
   ```bash
   cd backend/app
   uv sync
   ```

3. **启动开发服务器**：
   ```bash
   # 方式一（推荐）：使用 uv 运行
   uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload

   # 方式二：直接用 venv 可执行文件
   ./.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

4. **访问**：
   - 健康检查: `http://127.0.0.1:8000/`（应返回 `{ "ok": true }`）
   - API 文档: `http://127.0.0.1:8000/docs`

### 前端（Chrome 扩展 - React + Vite）

1. **安装依赖**：
   ```bash
   cd frontend
   npm install
   ```

2. **开发模式**（监听文件变化并自动构建）：
   ```bash
   npm run dev
   ```

3. **生产构建**：
   ```bash
   npm run build
   ```
   构建输出在 `dist/` 目录。

4. **加载扩展到 Chrome**：
   - 打开 Chrome → 扩展程序 → 开发者模式
   - 点击"加载已解压的扩展"
   - 选择 `frontend/dist/` 目录
   - 修改代码后重新构建并刷新扩展

## 前后端联调

- 前端 API 端点：`http://localhost:8000/api/v1/...`
- 当前后端仅实现 `/` 健康检查，需要补充以下路由：
  - `POST /api/v1/sessions` - 创建会话
  - `POST /api/v1/tabs` - 添加标签页
  - `POST /api/v1/share` - 生成分享链接

## 后续扩展

### React Three Fiber（3D 可视化）

如需在 sidepanel 中使用 3D 渲染：

```bash
cd frontend
npm install @react-three/fiber @react-three/drei three
```

然后在 `src/sidepanel/SidePanelApp.jsx` 中使用。

## 常见问题

### 后端
- **无法导入 `fastapi`**：未执行 `uv sync` 或未在项目虚拟环境内运行
- **静态资源路径**：若将入口文件移动位置，注意更新 `StaticFiles(directory=...)` 的相对路径

### 前端
- **扩展加载失败**：确保已执行 `npm run build` 并选择 `dist/` 目录
- **静态资源未加载**：检查 `public/img/` 目录是否存在，路径使用相对路径 `./img/...`

## Git 工作流

```bash
# 初始化（首次）
git init
git add .
git commit -m "chore: initial commit"

# 关联远端并推送
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## 技术栈

- **后端**：FastAPI + Python 3.13+ + uv
- **前端**：React 18 + Vite 6 + Chrome MV3 Extension
- **设计**：Anima 生成组件
