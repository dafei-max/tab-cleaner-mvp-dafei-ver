# 自动构建和规范检查使用指南

## 快速开始

### 方式 1: 自动构建 + 规范检查（推荐）

监听文件变化，自动构建并检查代码规范：

```bash
cd frontend
npm run build:watch
```

**功能：**
- 👀 监听 `src/` 和 `public/` 目录
- 🔨 文件变化时自动构建（500ms 防抖）
- 🔍 构建完成后自动执行规范检查
- 📊 显示构建和检查结果

**依赖（可选）：**
```bash
npm install --save-dev chokidar
```
如果不安装 `chokidar`，会使用简单模式（仅执行一次构建和检查）。

### 方式 2: 手动规范检查

仅检查代码规范，不构建：

```bash
cd frontend
npm run check:rules
```

## 检查内容

### 错误级别 (❌) - 必须修复

1. **硬编码消息类型字符串**
   - 问题：在代码中直接使用字符串作为消息类型
   - 建议：使用 `MessageTypes` 常量
   - 示例：
     ```javascript
     // ❌ 错误
     chrome.runtime.sendMessage({ action: 'extract-opengraph' });
     
     // ✅ 正确
     chrome.runtime.sendMessage({ action: MessageTypes.EXTRACT_OPENGRAPH });
     ```

2. **render 中直接调用 chrome.storage**
   - 问题：在组件函数中直接调用 chrome.storage API
   - 建议：使用 `useEffect` 或自定义 Hook
   - 示例：
     ```javascript
     // ❌ 错误
     const Component = () => {
       chrome.storage.local.get('sessions', ...);
       return <div>...</div>;
     };
     
     // ✅ 正确
     const Component = () => {
       useEffect(() => {
         chrome.storage.local.get('sessions', ...);
       }, []);
       return <div>...</div>;
     };
     ```

### 警告级别 (⚠️) - 建议修复

1. **无并发控制的 Promise.all**
   - 问题：并行处理所有项，可能导致内存爆炸或 API 限流
   - 建议：使用分批处理或并发限制

2. **图片加载无限重试**
   - 问题：图片错误处理可能无限重试
   - 建议：使用 `attemptsRef` 和 `MAX_RETRIES` 限制重试次数

3. **chrome.storage 缺少错误处理**
   - 问题：未使用 try-catch 的 storage 操作
   - 建议：使用 `safeStorageGet/safeStorageSet` 或 try-catch

4. **Fuse.js 实例未缓存**
   - 问题：每次搜索都重建 Fuse 实例
   - 建议：使用 `useRef` 缓存 Fuse 实例，数据变化时才重建

5. **Storage 写入未防抖**
   - 问题：直接写入 storage，可能频繁写入
   - 建议：使用防抖机制（500ms）合并多次写入

### 提示级别 (ℹ️) - 优化建议

1. **状态更新防竞态**
   - 问题：多个异步状态更新，可能产生竞态条件
   - 建议：使用 `useRef` 追踪异步操作状态

## 集成到开发流程

### Git Hooks

在 `.git/hooks/pre-commit` 中添加：

```bash
#!/bin/sh
cd frontend
npm run check:rules
if [ $? -ne 0 ]; then
  echo "❌ 规范检查失败，请修复后重试"
  exit 1
fi
```

### CI/CD

已在 `.github/workflows/check-rules.yml` 中配置 GitHub Actions，每次 push 和 PR 都会自动检查。

### VS Code 任务

在 `.vscode/tasks.json` 中添加：

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Check Rules",
      "type": "shell",
      "command": "npm run check:rules",
      "options": {
        "cwd": "${workspaceFolder}/frontend"
      },
      "problemMatcher": []
    },
    {
      "label": "Build & Watch",
      "type": "shell",
      "command": "npm run build:watch",
      "options": {
        "cwd": "${workspaceFolder}/frontend"
      },
      "isBackground": true,
      "problemMatcher": []
    }
  ]
}
```

## 常见问题

### Q: 检查脚本报错找不到文件？

A: 确保在项目根目录或 `frontend/` 目录运行脚本。

### Q: chokidar 安装失败？

A: `chokidar` 是可选的，如果不安装，自动构建工具会使用简单模式。

### Q: 如何添加自定义检查规则？

A: 编辑 `build/scripts/check-rules.js`，在 `checkCodeIssues()` 函数中添加新的检查逻辑。

### Q: 检查结果不准确？

A: 检查脚本基于静态分析，可能无法检测所有问题。建议配合 ESLint 和 Prettier 使用。

## 下一步

1. 安装 ESLint 和 Prettier（推荐）
2. 配置 Git Hooks 自动检查
3. 在 CI/CD 中集成检查流程
4. 根据检查结果修复代码问题



