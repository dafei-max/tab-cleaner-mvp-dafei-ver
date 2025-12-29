# 构建和检查脚本

## 脚本说明

### 1. `check-rules.js` - 代码规范检查

检查代码是否符合 `.cursorrules` 中的规范要求。

**功能：**
- ✅ 检查 ESLint/Prettier 配置
- ✅ 检查硬编码消息类型字符串
- ✅ 检查 render 中直接调用 chrome.storage
- ✅ 检查无限制的 Promise.all
- ✅ 检查图片加载重试限制
- ✅ 检查 chrome.storage 错误处理
- ✅ 检查状态更新防竞态
- ✅ 检查 Fuse.js 实例缓存
- ✅ 检查 Storage 写入防抖

**使用方法：**
```bash
# 在项目根目录
npm run check:rules

# 或直接运行
node build/scripts/check-rules.js
```

### 2. `auto-build-with-check.js` - 自动构建 + 规范检查

监听文件变化，自动构建并检查代码规范。

**功能：**
- 👀 监听 `frontend/src` 和 `frontend/public` 目录
- 🔨 文件变化时自动构建（500ms 防抖）
- 🔍 构建完成后自动执行规范检查
- 📊 显示构建和检查结果

**使用方法：**
```bash
# 在项目根目录
npm run build:watch

# 或直接运行
node build/scripts/auto-build-with-check.js
```

**依赖：**
需要安装 `chokidar`：
```bash
npm install --save-dev chokidar
```

## 集成到开发流程

### 方式 1: 使用 npm scripts

在 `frontend/package.json` 中已添加：
- `npm run check:rules` - 手动检查规范
- `npm run build:watch` - 自动构建 + 检查

### 方式 2: 使用 Git Hooks

在 `.git/hooks/pre-commit` 中添加：
```bash
#!/bin/sh
npm run check:rules
```

### 方式 3: 使用 CI/CD

在 CI 流程中添加：
```yaml
- name: Check Code Rules
  run: npm run check:rules
```

## 检查规则说明

### 错误级别 (❌)
必须修复的问题：
- 硬编码消息类型字符串
- render 中直接调用 chrome.storage

### 警告级别 (⚠️)
建议修复的问题：
- 无并发控制的 Promise.all
- 图片加载无限重试
- chrome.storage 缺少错误处理
- Fuse.js 实例未缓存
- Storage 写入未防抖

### 提示级别 (ℹ️)
优化建议：
- 状态更新防竞态
- 其他性能优化建议

## 自定义检查规则

编辑 `check-rules.js` 可以添加自定义检查规则。

## 注意事项

1. 检查脚本基于静态分析，可能无法检测所有问题
2. 建议配合 ESLint 和 Prettier 使用
3. 检查结果仅供参考，需要人工审查



