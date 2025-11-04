# Commit Message 建议

## 简洁版

```
feat: 实现个人空间画布拖拽和选中功能

- 侧边栏左对齐页面左上角
- 画布图片支持鼠标拖拽
- 选中图片显示蓝色外发光效果
- 新增 DraggableImage 组件实现拖拽逻辑
- 新增 imageData.js 集中管理图片位置数据
```

## 详细版

```
feat: 实现个人空间画布交互功能

功能更新：
- 侧边栏布局优化：左对齐页面左上角，使用 fixed 定位
- 画布图片拖拽：支持鼠标拖拽移动图片位置
- 选中效果：选中图片显示蓝色外发光（box-shadow + outline）
- 多选支持：按住 Shift 键可多选图片

技术实现：
- 新增 DraggableImage 组件封装拖拽逻辑
- 新增 imageData.js 统一管理图片初始位置数据
- 使用 React Hooks 管理图片位置和选中状态
- 优化拖拽体验，实时更新位置

文件变更：
- frontend/src/screens/PersonalSpace/PersonalSpace.jsx
- frontend/src/screens/PersonalSpace/DraggableImage.jsx (新增)
- frontend/src/screens/PersonalSpace/imageData.js (新增)
- frontend/src/screens/PersonalSpace/style.css
- frontend/src/components/Component/style.css
```

## GitHub Commit 命令

```bash
cd tab-cleaner-mvp

# 添加文件
git add frontend/src/screens/PersonalSpace/
git add frontend/src/components/Component/style.css

# 提交（使用简洁版）
git commit -m "feat: 实现个人空间画布拖拽和选中功能

- 侧边栏左对齐页面左上角
- 画布图片支持鼠标拖拽
- 选中图片显示蓝色外发光效果
- 新增 DraggableImage 组件实现拖拽逻辑
- 新增 imageData.js 集中管理图片位置数据"

# 推送到 GitHub
git push
```

## PR 描述模板（如果需要）

```markdown
## 🎯 功能更新

实现个人空间画布的交互功能，提升用户体验。

### ✨ 新功能

1. **侧边栏布局优化**
   - 侧边栏固定在页面左上角
   - 使用 `position: fixed` 确保始终可见

2. **画布图片拖拽**
   - 所有图片支持鼠标拖拽移动
   - 实时更新位置，拖拽体验流畅

3. **选中效果**
   - 点击图片选中，显示蓝色外发光
   - 支持 Shift 键多选

### 🔧 技术实现

- 新增 `DraggableImage` 组件封装拖拽逻辑
- 新增 `imageData.js` 统一管理图片数据
- 使用 React Hooks 管理状态
- CSS 优化选中和拖拽样式

### 📝 文件变更

- `frontend/src/screens/PersonalSpace/PersonalSpace.jsx` - 主组件更新
- `frontend/src/screens/PersonalSpace/DraggableImage.jsx` - 新增拖拽组件
- `frontend/src/screens/PersonalSpace/imageData.js` - 新增数据文件
- `frontend/src/screens/PersonalSpace/style.css` - 样式更新
- `frontend/src/components/Component/style.css` - 侧边栏样式更新
```

