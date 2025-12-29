#!/usr/bin/env node

/**
 * 代码规范检查脚本
 * 检查代码是否符合 .cursorrules 中的规范
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');
const RULES_FILE = path.join(PROJECT_ROOT, '.cursorrules');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 读取规则文件
function readRules() {
  try {
    return fs.readFileSync(RULES_FILE, 'utf-8');
  } catch (error) {
    log(`❌ 无法读取规则文件: ${RULES_FILE}`, 'red');
    return null;
  }
}

// 检查文件是否存在 ESLint/Prettier 配置
function checkLinterConfig() {
  const eslintConfigs = [
    '.eslintrc.js',
    '.eslintrc.json',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    'eslint.config.js',
  ];
  
  const prettierConfigs = [
    '.prettierrc',
    '.prettierrc.js',
    '.prettierrc.json',
    'prettier.config.js',
  ];

  const hasEslint = eslintConfigs.some(config => 
    fs.existsSync(path.join(FRONTEND_DIR, config))
  );
  
  const hasPrettier = prettierConfigs.some(config => 
    fs.existsSync(path.join(FRONTEND_DIR, config))
  );

  return { hasEslint, hasPrettier };
}

// 检查代码中的常见问题
function checkCodeIssues() {
  const issues = [];
  const criticalFiles = [
    'frontend/public/assets/background.js',
    'frontend/public/assets/content.js',
    'frontend/src/hooks/useSessionManager.js',
    'frontend/src/hooks/useSearch.js',
    'frontend/src/screens/PersonalSpace/SessionCard.jsx',
  ];

  log('\n📋 检查关键文件...', 'cyan');

  criticalFiles.forEach(file => {
    const filePath = path.join(PROJECT_ROOT, file);
    if (!fs.existsSync(filePath)) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // 检查 1: 硬编码消息类型字符串
    const hardcodedMessages = content.match(/action:\s*['"](extract-opengraph|save-captured-image|sync-to-backend|caption-ready|show-card|hide-card|toggle-card|clean-all-tabs|clean-current-tab)['"]/g);
    if (hardcodedMessages) {
      issues.push({
        file: fileName,
        type: 'error',
        rule: '禁止硬编码消息类型字符串',
        message: `发现硬编码消息类型: ${hardcodedMessages.join(', ')}`,
        suggestion: '应使用 MessageTypes 常量',
      });
    }

    // 检查 2: render 中直接调用 chrome.storage
    if (filePath.includes('.jsx') || filePath.includes('.tsx')) {
      const renderStoragePattern = /(const\s+\w+\s*=\s*\(\)\s*=>\s*\{[^}]*chrome\.storage|function\s+\w+\s*\([^)]*\)\s*\{[^}]*chrome\.storage)/s;
      if (renderStoragePattern.test(content)) {
        issues.push({
          file: fileName,
          type: 'error',
          rule: '禁止在 render 中直接调用 chrome.storage',
          message: '在组件函数中直接调用 chrome.storage API',
          suggestion: '应使用 useEffect 或自定义 Hook',
        });
      }
    }

    // 检查 3: 无限制的 Promise.all
    const unlimitedPromiseAll = /Promise\.all\([^)]*\.map\(/g;
    const matches = content.match(unlimitedPromiseAll);
    if (matches) {
      // 检查是否有并发控制
      const hasConcurrencyControl = /BATCH_SIZE|并发|concurrency|limit/i.test(content);
      if (!hasConcurrencyControl && matches.length > 0) {
        issues.push({
          file: fileName,
          type: 'warning',
          rule: '批量操作必须有并发控制',
          message: '发现无并发控制的 Promise.all',
          suggestion: '应使用分批处理或并发限制',
        });
      }
    }

    // 检查 4: 图片加载无限重试
    const imageErrorHandlers = content.match(/onError\s*=\s*\{[^}]*setImageSrc/g);
    if (imageErrorHandlers) {
      const hasRetryLimit = /MAX_RETRIES|attemptsRef|retryCount|最多.*次/i.test(content);
      if (!hasRetryLimit) {
        issues.push({
          file: fileName,
          type: 'warning',
          rule: '图片加载必须有重试限制',
          message: '图片错误处理可能无限重试',
          suggestion: '应使用 attemptsRef 和 MAX_RETRIES 限制重试次数',
        });
      }
    }

    // 检查 5: chrome.storage 操作缺少错误处理
    const storageOps = content.match(/chrome\.storage\.(local|sync)\.(get|set)\(/g);
    if (storageOps) {
      const hasErrorHandling = /try\s*\{[^}]*chrome\.storage|catch|\.catch\(/s.test(content);
      if (!hasErrorHandling) {
        issues.push({
          file: fileName,
          type: 'warning',
          rule: 'chrome.storage 操作必须有错误处理',
          message: '发现未使用 try-catch 的 storage 操作',
          suggestion: '应使用 safeStorageGet/safeStorageSet 或 try-catch',
        });
      }
    }

    // 检查 6: 缺少 useRef 的状态更新（可能竞态）
    const stateUpdates = content.match(/set\w+\([^)]*await/g);
    if (stateUpdates && filePath.includes('.jsx')) {
      const hasRef = /useRef|Ref\.current/i.test(content);
      if (!hasRef && stateUpdates.length > 2) {
        issues.push({
          file: fileName,
          type: 'info',
          rule: '状态更新防竞态',
          message: '多个异步状态更新，建议使用 useRef 避免闭包陷阱',
          suggestion: '使用 useRef 追踪异步操作状态',
        });
      }
    }
  });

  return issues;
}

// 检查 Fuse.js 实例缓存
function checkFuseCache() {
  const searchFile = path.join(FRONTEND_DIR, 'src/hooks/useSearch.js');
  if (!fs.existsSync(searchFile)) {
    return null;
  }

  const content = fs.readFileSync(searchFile, 'utf-8');
  const hasCache = /fuseRef|dataHashRef|useRef.*Fuse/i.test(content);
  const hasNewFuse = /new\s+Fuse\(/g.test(content);

  if (hasNewFuse && !hasCache) {
    return {
      type: 'warning',
      rule: 'Fuse.js 实例缓存',
      message: 'useSearch.js 中每次搜索可能重建 Fuse 实例',
      suggestion: '应使用 useRef 缓存 Fuse 实例，数据变化时才重建',
    };
  }

  return null;
}

// 检查 Storage 写入防抖
function checkStorageDebounce() {
  const managerFile = path.join(FRONTEND_DIR, 'src/hooks/useSessionManager.js');
  if (!fs.existsSync(managerFile)) {
    return null;
  }

  const content = fs.readFileSync(managerFile, 'utf-8');
  const hasDebounce = /debounce|DEBOUNCE|writeTimeoutRef|pendingWriteRef/i.test(content);
  const hasDirectWrite = /chrome\.storage\.local\.set\([^)]*sessions/g.test(content);

  if (hasDirectWrite && !hasDebounce) {
    return {
      type: 'warning',
      rule: 'Storage 写入防抖',
      message: 'useSessionManager.js 中直接写入 storage，可能频繁写入',
      suggestion: '应使用防抖机制（500ms）合并多次写入',
    };
  }

  return null;
}

// 主检查函数
function runChecks() {
  log('🔍 开始代码规范检查...\n', 'cyan');

  // 1. 检查 Linter 配置
  log('1️⃣ 检查 Linter 配置...', 'blue');
  const { hasEslint, hasPrettier } = checkLinterConfig();
  
  if (!hasEslint) {
    log('   ⚠️  未找到 ESLint 配置，建议添加', 'yellow');
  } else {
    log('   ✅ 找到 ESLint 配置', 'green');
  }

  if (!hasPrettier) {
    log('   ⚠️  未找到 Prettier 配置，建议添加', 'yellow');
  } else {
    log('   ✅ 找到 Prettier 配置', 'green');
  }

  // 2. 检查代码问题
  log('\n2️⃣ 检查代码规范问题...', 'blue');
  const codeIssues = checkCodeIssues();
  
  if (codeIssues.length === 0) {
    log('   ✅ 未发现代码规范问题', 'green');
  } else {
    codeIssues.forEach(issue => {
      const icon = issue.type === 'error' ? '❌' : issue.type === 'warning' ? '⚠️' : 'ℹ️';
      const color = issue.type === 'error' ? 'red' : issue.type === 'warning' ? 'yellow' : 'cyan';
      log(`   ${icon} [${issue.file}] ${issue.rule}`, color);
      log(`      问题: ${issue.message}`, color);
      log(`      建议: ${issue.suggestion}`, color);
      log('');
    });
  }

  // 3. 检查特定优化
  log('3️⃣ 检查性能优化...', 'blue');
  const fuseIssue = checkFuseCache();
  if (fuseIssue) {
    log(`   ⚠️  ${fuseIssue.rule}`, 'yellow');
    log(`      ${fuseIssue.message}`, 'yellow');
    log(`      建议: ${fuseIssue.suggestion}`, 'yellow');
  } else {
    log('   ✅ Fuse.js 实例缓存已实现', 'green');
  }

  const storageIssue = checkStorageDebounce();
  if (storageIssue) {
    log(`   ⚠️  ${storageIssue.rule}`, 'yellow');
    log(`      ${storageIssue.message}`, 'yellow');
    log(`      建议: ${storageIssue.suggestion}`, 'yellow');
  } else {
    log('   ✅ Storage 写入防抖已实现', 'green');
  }

  // 总结
  const errorCount = codeIssues.filter(i => i.type === 'error').length;
  const warningCount = codeIssues.filter(i => i.type === 'warning').length;
  const infoCount = codeIssues.filter(i => i.type === 'info').length;

  log('\n📊 检查总结:', 'cyan');
  log(`   错误: ${errorCount}`, errorCount > 0 ? 'red' : 'green');
  log(`   警告: ${warningCount}`, warningCount > 0 ? 'yellow' : 'green');
  log(`   提示: ${infoCount}`, infoCount > 0 ? 'cyan' : 'green');

  return {
    success: errorCount === 0,
    errors: errorCount,
    warnings: warningCount,
    info: infoCount,
  };
}

// 运行检查
if (require.main === module) {
  const result = runChecks();
  process.exit(result.success ? 0 : 1);
}

module.exports = { runChecks };



