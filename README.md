# CleanTab MVP

一个最小可运行的前后端项目骨架。

## 目录结构

```
/Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp
├─ backend
│  └─ app
│     ├─ __init__.py
│     ├─ __pycache__/
│     ├─ api/
│     │  └─ __init__.py
│     ├─ main.py
│     ├─ pyproject.toml
│     ├─ README.md
│     ├─ services/
│     ├─ static/
│     └─ uv.lock
└─ frontend/
   ├─ background.js
   ├─ manifest.json
   ├─ popup.html
   ├─ popup.js
   └─ sidepanel.html
```

说明：
- 后端位于 `backend/app`，当前应用入口是 `backend/app/main.py`（FastAPI）。
- `services/` 与 `static/` 暂为空目录，预留后续扩展与静态资源。
- 依赖由 `uv` 管理，定义在 `pyproject.toml`，已锁定于 `uv.lock`。
- 前端目录 `frontend/` 目前为空。
 - 前端目录 `frontend/` 包含一个最小可运行的 Chrome 扩展（MV3）。

## 快速开始（后端）

1. 安装 uv（若尚未在 PATH）：
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   # 临时生效
   source "$HOME/.local/bin/env"
   ```

2. 同步依赖并创建虚拟环境：
   ```bash
   cd "/Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp/backend/app"
   uv sync
   ```

3. 启动开发服务器：
   ```bash
   # 方式一（推荐）：使用 uv 运行
   uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload

   # 方式二：直接用 venv 可执行文件
   ./.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

4. 访问：
   - 健康检查: `http://127.0.0.1:8000/`（应返回 `{ "ok": true }`）
   - 文档: `http://127.0.0.1:8000/docs`

## 前端（Chrome 扩展）

1. 目录说明：
   - `manifest.json`：MV3 清单
   - `background.js`：Service Worker（`type:"module"`）
   - `popup.html`/`popup.js`：工具栏弹窗
   - `sidepanel.html`：侧边栏页面

2. 安装与调试：
   - 打开 Chrome → 扩展程序 → 开发者模式 → 加载已解压的扩展
   - 选择目录：`tab-cleaner-mvp/frontend`
   - 若修改了文件，点击“刷新”扩展即可生效

3. 与后端联调：
   - `popup.js` 默认请求 `http://localhost:8000/api/v1/...`
   - 当前后端仅实现 `/` 健康检查，如需联调请在后端补充对应路由或先改为现有接口进行验证

4. manifest 注意点：
   - `permissions` 建议为：`["tabs", "storage", "activeTab"]`
   - 使用侧边栏只需 `"side_panel"` 字段，无需额外 `"sidePanel"` 权限声明

## 常见问题

- 无法导入 `fastapi`：未执行 `uv sync` 或未在项目虚拟环境内运行。
- 静态资源：若将入口文件移动位置，注意更新 `StaticFiles(directory=...)` 的相对路径。

## Git 工作流（建议）

```bash
# 初始化（首次）
git init
git add .
git commit -m "chore: initial commit with backend app skeleton"

# 关联远端并推送
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```


