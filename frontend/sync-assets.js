#!/usr/bin/env node
/**
 * 同步 public/assets/ 到 dist/assets/
 * 用于开发时快速同步 assets 文件，无需完整构建
 */

import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceDir = join(__dirname, 'public', 'assets');
const targetDir = join(__dirname, 'dist', 'assets');

// 确保目标目录存在
if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
  console.log(`[Sync] Created directory: ${targetDir}`);
}

// 读取源目录中的所有文件
const files = readdirSync(sourceDir);

let syncedCount = 0;
let skippedCount = 0;

files.forEach(file => {
  const sourcePath = join(sourceDir, file);
  const targetPath = join(targetDir, file);
  
  // 只处理文件，跳过目录
  const stats = statSync(sourcePath);
  if (!stats.isFile()) {
    return;
  }
  
  // 检查是否需要同步（比较修改时间）
  let shouldSync = true;
  if (existsSync(targetPath)) {
    const sourceTime = statSync(sourcePath).mtimeMs;
    const targetTime = statSync(targetPath).mtimeMs;
    if (sourceTime <= targetTime) {
      shouldSync = false;
    }
  }
  
  if (shouldSync) {
    copyFileSync(sourcePath, targetPath);
    syncedCount++;
    console.log(`[Sync] ✅ ${file}`);
  } else {
    skippedCount++;
  }
});

console.log(`[Sync] Complete: ${syncedCount} synced, ${skippedCount} skipped`);

