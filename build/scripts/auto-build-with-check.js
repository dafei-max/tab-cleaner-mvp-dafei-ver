#!/usr/bin/env node

/**
 * 自动构建 + 规范检查脚本
 * 监听文件变化，自动构建并检查代码规范
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');
const BUILD_SCRIPT = path.join(FRONTEND_DIR, 'package.json');

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
  const timestamp = new Date().toLocaleTimeString();
  const colorCode = colors[color] || colors.reset;
  console.log(`${colorCode}[${timestamp}] ${message}${colors.reset}`);
}

// 尝试加载 chokidar，如果不存在则使用简单的轮询方式
let chokidar;
try {
  chokidar = require('chokidar');
} catch (error) {
  log('⚠️  chokidar 未安装，将使用简单的文件监听（需要手动安装: npm install --save-dev chokidar）', 'yellow');
  chokidar = null;
}

let buildProcess = null;
let checkProcess = null;
let buildQueue = [];
let isBuilding = false;

// 执行构建
function runBuild() {
  return new Promise((resolve, reject) => {
    log('🔨 开始构建...', 'blue');
    
    const buildCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    buildProcess = spawn(buildCmd, ['run', 'build'], {
      cwd: FRONTEND_DIR,
      stdio: 'inherit',
      shell: true,
    });

    buildProcess.on('close', (code) => {
      buildProcess = null;
      if (code === 0) {
        log('✅ 构建完成', 'green');
        resolve();
      } else {
        log(`❌ 构建失败 (退出码: ${code})`, 'red');
        reject(new Error(`Build failed with code ${code}`));
      }
    });

    buildProcess.on('error', (error) => {
      log(`❌ 构建错误: ${error.message}`, 'red');
      reject(error);
    });
  });
}

// 执行规范检查
function runCheck() {
  return new Promise((resolve) => {
    log('🔍 开始规范检查...', 'cyan');
    
    const checkScript = path.join(__dirname, 'check-rules.js');
    checkProcess = spawn('node', [checkScript], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
    });

    checkProcess.on('close', (code) => {
      checkProcess = null;
      if (code === 0) {
        log('✅ 规范检查通过', 'green');
      } else {
        log('⚠️  规范检查发现问题，请查看上方详情', 'yellow');
      }
      resolve();
    });

    checkProcess.on('error', (error) => {
      log(`❌ 检查错误: ${error.message}`, 'red');
      resolve();
    });
  });
}

// 处理构建队列
async function processBuildQueue() {
  if (isBuilding || buildQueue.length === 0) {
    return;
  }

  isBuilding = true;
  buildQueue = []; // 清空队列，只构建一次

  try {
    await runBuild();
    await runCheck();
  } catch (error) {
    log(`构建或检查失败: ${error.message}`, 'red');
  } finally {
    isBuilding = false;
    
    // 如果队列中还有新的文件变化，继续处理
    if (buildQueue.length > 0) {
      setTimeout(() => processBuildQueue(), 1000);
    }
  }
}

// 文件变化处理
function handleFileChange(filePath) {
  // 忽略 node_modules、dist、.git 等目录
  if (
    filePath.includes('node_modules') ||
    filePath.includes('dist') ||
    filePath.includes('.git') ||
    filePath.includes('.DS_Store') ||
    filePath.endsWith('.log')
  ) {
    return;
  }

  log(`📝 文件变化: ${path.relative(PROJECT_ROOT, filePath)}`, 'cyan');
  
  // 添加到构建队列
  if (!buildQueue.includes(filePath)) {
    buildQueue.push(filePath);
  }

  // 防抖：500ms 后处理
  clearTimeout(handleFileChange.timeout);
  handleFileChange.timeout = setTimeout(() => {
    processBuildQueue();
  }, 500);
}

// 监听文件变化
function startWatching() {
  log('👀 开始监听文件变化...', 'cyan');
  log('   监听目录:', 'cyan');
  log(`   - ${path.join(FRONTEND_DIR, 'src')}`, 'cyan');
  log(`   - ${path.join(FRONTEND_DIR, 'public')}`, 'cyan');
  log('', 'cyan');

  const watchPaths = [
    path.join(FRONTEND_DIR, 'src'),
    path.join(FRONTEND_DIR, 'public'),
  ];

  if (!chokidar) {
    log('⚠️  chokidar 未安装，使用简单模式（仅执行一次构建和检查）', 'yellow');
    log('   安装 chokidar 以获得文件监听功能: npm install --save-dev chokidar', 'yellow');
    log('🚀 执行初始构建和检查...', 'blue');
    processBuildQueue();
    return;
  }

  const watcher = chokidar.watch(watchPaths, {
    ignored: [
      /node_modules/,
      /dist/,
      /\.git/,
      /\.DS_Store/,
      /\.log$/,
    ],
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on('add', handleFileChange)
    .on('change', handleFileChange)
    .on('unlink', handleFileChange)
    .on('error', (error) => {
      log(`❌ 监听错误: ${error.message}`, 'red');
    });

  // 初始构建和检查
  log('🚀 执行初始构建和检查...', 'blue');
  processBuildQueue();

  // 优雅退出
  process.on('SIGINT', () => {
    log('\n👋 停止监听...', 'yellow');
    watcher.close();
    if (buildProcess) {
      buildProcess.kill();
    }
    if (checkProcess) {
      checkProcess.kill();
    }
    process.exit(0);
  });
}

// 检查依赖（可选）
function checkDependencies() {
  // chokidar 是可选的，如果没有安装会使用简单模式
  // 不强制退出
}

// 主函数
function main() {
  log('🎯 自动构建 + 规范检查工具', 'cyan');
  log('', 'cyan');

  checkDependencies();
  startWatching();
}

if (require.main === module) {
  main();
}

module.exports = { runBuild, runCheck };

