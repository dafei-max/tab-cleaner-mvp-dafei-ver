# 项目文档目录

本目录包含项目的所有文档文件，已按模块分类整理。

## 目录结构

```
doc/
├── README.md (本文件)
├── backend/          # 后端文档
│   └── app/         # 后端应用文档
│       ├── search/  # 搜索相关文档
│       └── clustering/ # 聚类相关文档
├── frontend/        # 前端文档
│   └── src/         # 前端源码文档
│       ├── motion/  # 动画模块
│       └── core/    # 核心模块
└── [根目录文档]     # 项目级文档
```

## 文档分类

### 项目级文档（根目录）
- `RAILWAY_DEPLOYMENT.md` - Railway 部署指南
- `RESTART_BACKEND.md` - 后端重启指南
- `CHROME_STORE_DESCRIPTION.md` - Chrome 商店描述
- `CHROME_STORE_PACKAGING.md` - 打包指南
- `CHROME_STORE_REVIEW_FORM.md` - 审核表单（中文）
- `CHROME_STORE_REVIEW_FORM_EN.md` - 审核表单（英文）
- `CHROME_STORE_SUBMISSION.md` - 提交指南
- `PERSONALSPACE_REALTIME_UPDATE_CHECK.md` - PersonalSpace 实时更新检查
- `网页数据存储流程说明.md` - 网页数据存储流程说明

### 后端文档 (`backend/`)
详见 [backend/README.md](./backend/README.md)

包含：
- 核心功能文档（自动标题、嵌入、搜索等）
- 数据库和架构文档
- 部署和运维文档
- 调试和诊断文档
- 用户和数据管理文档

### 前端文档 (`frontend/`)
详见 [frontend/README.md](./frontend/README.md)

包含：
- 架构和设计文档
- 功能使用指南
- 用户 ID 相关文档
- 模块文档（动画、核心等）

## 文档迁移说明

所有文档已从以下位置迁移到此目录：
- `backend/app/*.md` → `doc/backend/app/`
- `backend/app/search/*.md` → `doc/backend/app/search/`
- `backend/app/clustering/README.md` → `doc/backend/app/clustering/`
- `frontend/*.md` → `doc/frontend/`
- `frontend/src/motion/README.md` → `doc/frontend/src/motion/`
- `frontend/src/core/README.md` → `doc/frontend/src/core/`

**注意**: `README.md` 文件保留在原位置（项目根目录或模块目录），因为这些文件通常用于模块说明。

## 其他文档位置

- **根目录**: `README.md` - 项目主文档
- **build/scripts/**: 构建脚本文档（保留在原位置）

