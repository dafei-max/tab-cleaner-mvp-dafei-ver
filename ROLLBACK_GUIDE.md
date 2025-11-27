# 回退到 commit 479bb78 的指南

## ⚠️ 重要提示
回退操作会丢失之后的提交，请先备份重要数据！

## 方法 1：完全回退（推荐用于测试）

### 1.1 创建备份分支（推荐）
```bash
# 创建备份分支，保存当前状态
git branch backup-before-rollback

# 回退到目标版本
git reset --hard 479bb78

# 强制推送到远程（如果需要）
git push origin main --force
```

### 1.2 直接回退（不推荐，会丢失数据）
```bash
# ⚠️ 危险：会丢失之后的所有提交
git reset --hard 479bb78
```

## 方法 2：只回退特定文件

```bash
# 只回退 opengraph.py 文件
git checkout 479bb78 -- backend/app/opengraph.py

# 只回退前端文件
git checkout 479bb78 -- frontend/src/screens/PersonalSpace/DraggableImage.jsx
git checkout 479bb78 -- frontend/src/screens/PersonalSpace/RadialCanvas.jsx
git checkout 479bb78 -- frontend/src/utils/imagePlaceholder.js
```

## 方法 3：创建新分支测试旧版本（最安全）

```bash
# 创建新分支，基于旧版本
git checkout -b test-old-version 479bb78

# 测试完成后，可以切换回 main
git checkout main
```

## 方法 4：查看差异后再决定

```bash
# 查看从 479bb78 到现在的所有改动
git diff 479bb78..HEAD

# 查看特定文件的改动
git diff 479bb78..HEAD -- backend/app/opengraph.py
```

## 回退后需要做的事情

1. **重新构建前端**（如果回退了前端文件）
   ```bash
   cd frontend
   npm run build
   ```

2. **重启后端服务**（如果回退了后端文件）
   - Railway 会自动重新部署
   - 或本地重启：`uvicorn app.main:app --reload`

3. **测试功能**
   - 测试 Pinterest OpenGraph 获取
   - 测试其他功能是否正常

## 如果需要恢复

```bash
# 如果创建了备份分支
git checkout backup-before-rollback
git checkout -b main-restored

# 或者查看所有分支
git branch -a
```




