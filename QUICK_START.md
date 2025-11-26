# 快速启动指南

## 前置要求

1. **Python 3.13+** 和 **uv**（Python 包管理器）
2. **Node.js >= 16** 和 **npm**
3. **Chrome 浏览器**

---

## 启动步骤

### 1. 启动后端服务

打开**终端1**，执行：

```bash
# 进入后端目录
cd /Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp/backend/app

# 同步依赖（首次运行需要）
uv sync

# 配置环境变量（如果还没有）
# 检查是否有 .env 文件
ls -la .env

# 如果没有，创建并配置 API Key
# cp .env.example .env
# 然后编辑 .env，填入 DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxx

# 启动后端服务
uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**验证后端是否启动成功**：
- 打开浏览器访问：`http://127.0.0.1:8000/`
- 应该看到：`{"ok":true}`
- API 文档：`http://127.0.0.1:8000/docs`

---

### 2. 启动前端开发服务器

打开**终端2**，执行：

```bash
# 进入前端目录
cd /Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp/frontend

# 安装依赖（首次运行需要）
npm install

# 启动开发模式（监听文件变化，自动构建）
npm run dev
```

**注意**：开发模式下，前端会自动监听文件变化并重新构建。

---

### 3. 加载 Chrome 扩展

1. **打开 Chrome 扩展管理页面**：
   - 在地址栏输入：`chrome://extensions/`
   - 或：菜单 → 更多工具 → 扩展程序

2. **开启开发者模式**：
   - 点击右上角的"开发者模式"开关

3. **加载扩展**：
   - 点击"加载已解压的扩展程序"
   - 选择目录：`/Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp/frontend/public/`
   - 点击"选择文件夹"

4. **验证扩展已加载**：
   - 应该看到"Tab Cleaner MVP"扩展
   - 确保扩展已启用（开关打开）

---

### 4. 使用扩展

1. **打开任意网页**（如：`https://www.google.com`）

2. **点击扩展图标**：
   - 在浏览器右上角找到扩展图标
   - 点击图标，应该会显示卡片 UI

3. **测试功能**：
   - **Home Button**：打开个人空间
   - **Clean Button**：一键清理所有标签页（抓取 OpenGraph 数据）
   - **Window Button**：显示/隐藏桌面宠物

---

## 常见问题

### 后端启动失败

**问题**：`ModuleNotFoundError: No module named 'fastapi'`

**解决**：
```bash
cd backend/app
uv sync  # 重新同步依赖
```

**问题**：`uv: command not found`

**解决**：
```bash
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh
source "$HOME/.local/bin/env"
```

---

### 前端启动失败

**问题**：`npm: command not found`

**解决**：
- 安装 Node.js：https://nodejs.org/

**问题**：`npm install` 失败

**解决**：
```bash
# 清除缓存
npm cache clean --force

# 重新安装
rm -rf node_modules package-lock.json
npm install
```

---

### 扩展无法加载

**问题**：扩展加载失败，显示错误

**解决**：
1. 检查 `frontend/public/manifest.json` 是否存在
2. 检查所有文件路径是否正确
3. 查看扩展详情页面的错误信息
4. 点击"重新加载"按钮

**问题**：卡片不显示

**解决**：
1. 打开网页的开发者工具（F12）
2. 查看 Console 是否有错误
3. 检查 Service Worker 日志（`chrome://extensions` → 扩展详情 → Service worker）

---

### 后端 API 无法访问

**问题**：前端报错"无法连接到后端服务器"

**解决**：
1. 确认后端服务已启动（访问 `http://127.0.0.1:8000/`）
2. 检查后端日志是否有错误
3. 确认端口 8000 没有被占用：
   ```bash
   lsof -i :8000
   ```

---

## 开发模式说明

### 后端开发模式

使用 `--reload` 参数，代码修改后自动重启：
```bash
uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 前端开发模式

使用 `npm run dev`，代码修改后自动重新构建：
```bash
npm run dev
```

**注意**：
- 修改 `public/` 目录的文件后，需要点击扩展的"重新加载"按钮
- 修改 `src/` 目录的文件后，会自动重新构建，但需要刷新个人空间页面

---

## 生产模式

### 前端构建

```bash
cd frontend
npm run build
```

构建输出在 `frontend/dist/` 目录。

**加载生产版本**：
- 在 Chrome 扩展管理页面，选择 `frontend/dist/` 目录加载扩展

---

## 完整启动命令（一键复制）

**终端1 - 后端**：
```bash
cd /Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp/backend/app && uv sync && uv run uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**终端2 - 前端**：
```bash
cd /Users/liyihua/Desktop/CleanTab_Assets/tab-cleaner-mvp/frontend && npm install && npm run dev
```

---

## 下一步

启动成功后，可以：

1. **测试 OpenGraph 抓取**：
   - 打开多个标签页
   - 点击扩展卡片上的"Clean Button"
   - 查看个人空间是否显示 OpenGraph 数据

2. **测试搜索功能**：
   - 在个人空间顶部的搜索栏输入关键词
   - 按 Enter 执行搜索
   - 查看搜索结果是否按相关性排列

3. **测试聚类功能**：
   - 选中多个卡片
   - 使用 AI 聚类或手动聚类功能

---

## 需要帮助？

- 查看详细文档：`README.md`
- 查看流程文档：`CLEAN_FLOW_DOCUMENTATION.md`
- 查看架构文档：`ARCHITECTURE_ANALYSIS.md`





