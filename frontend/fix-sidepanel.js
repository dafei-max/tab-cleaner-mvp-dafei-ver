/**
 * 构建后修复脚本：修复 sidepanel.html 的路径
 * 因为 Vite 构建时，sidepanel.html 在 public/ 目录下，路径是 ../assets/
 * 但输出到根目录时，路径应该是 ./assets/
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distSidepanelPath = resolve(__dirname, 'dist/sidepanel.html');
const distPublicSidepanelPath = resolve(__dirname, 'dist/public/sidepanel.html');

try {
  // 读取 public/sidepanel.html（路径正确）
  const publicContent = readFileSync(distPublicSidepanelPath, 'utf-8');
  
  // 修复路径：将 ../assets/ 替换为 ./assets/
  const fixedContent = publicContent.replace(/\.\.\/assets\//g, './assets/');
  
  // 写入根目录的 sidepanel.html
  writeFileSync(distSidepanelPath, fixedContent, 'utf-8');
  
  console.log('✅ Fixed sidepanel.html paths');
} catch (error) {
  console.error('❌ Failed to fix sidepanel.html:', error);
  process.exit(1);
}

