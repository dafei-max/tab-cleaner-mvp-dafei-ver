#!/usr/bin/env node
/**
 * 监听 public/assets/ 目录变化，自动同步到 dist/assets/
 * 用于开发时实时同步 assets 文件
 */

import { watch } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceDir = join(__dirname, 'public', 'assets');

console.log(`[Watch] Watching ${sourceDir} for changes...`);
console.log(`[Watch] Press Ctrl+C to stop`);

// 监听目录变化
const watcher = watch(sourceDir, { recursive: false }, (eventType, filename) => {
  if (filename && (eventType === 'change' || eventType === 'rename')) {
    console.log(`[Watch] Detected change: ${filename}`);
    
    // 执行同步
    execAsync('node sync-assets.js')
      .then(({ stdout, stderr }) => {
        if (stdout) console.log(stdout.trim());
        if (stderr) console.error(stderr.trim());
      })
      .catch(err => {
        console.error(`[Watch] Sync failed:`, err.message);
      });
  }
});

// 处理退出
process.on('SIGINT', () => {
  console.log('\n[Watch] Stopping...');
  watcher.close();
  process.exit(0);
});

