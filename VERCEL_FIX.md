# Vercel 部署修复指南

## 问题

Vercel 找不到 FastAPI 入口点，因为代码在 `backend/app/main.py`，但 Vercel 只在特定位置查找：
- `api/main.py` ✅
- `app/main.py`
- `src/main.py`
- 等等

## 解决方案

创建了 `api/main.py` 作为 Vercel 入口文件，它会：
1. 添加 `backend/app` 到 Python 路径
2. 导入真正的应用代码

## 文件结构

```
tab-cleaner-mvp/
├── api/
│   ├── main.py          # Vercel 入口文件（导入 backend/app）
│   └── requirements.txt # 依赖文件
├── backend/
│   └── app/
│       ├── main.py      # 真正的应用代码
│       ├── opengraph.py
│       └── ...
└── vercel.json          # Vercel 配置
```

## Vercel Dashboard 设置

**Root Directory:** （留空，使用项目根目录）

**Build Command:** （留空，Vercel 会自动检测）

**Output Directory:** （留空）

**Install Command:** `pip install -r api/requirements.txt`

或者更简单的方式：

**Root Directory:** `backend/app`

**Install Command:** `pip install -r requirements.txt`

## 两种部署方式

### 方式 1：使用 api/ 目录（当前方案）

- ✅ 符合 Vercel 标准结构
- ✅ 不需要修改 Root Directory
- ⚠️ 需要维护两个 requirements.txt

### 方式 2：设置 Root Directory 为 backend/app（推荐）

在 Vercel Dashboard → Settings → General → Root Directory 设置为：
```
backend/app
```

然后：
- ✅ 只需要一个 requirements.txt
- ✅ 代码结构更清晰
- ⚠️ 需要手动设置 Root Directory

## 推荐配置

**推荐使用方式 2**，在 Vercel Dashboard 设置：
- Root Directory: `backend/app`
- Install Command: `pip install -r requirements.txt`

这样就不需要 `api/` 目录了。


