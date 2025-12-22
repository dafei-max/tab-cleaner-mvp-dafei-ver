/**
 * 构建后修复脚本：修复 sidepanel.html 的路径
 * 因为 Vite 构建时，sidepanel.html 在 public/ 目录下，路径是 ../assets/
 * 但输出到根目录时，路径应该是 ./assets/
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
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

// 🆕 确保 ps_color_analyzer.js 和 eagle_storage.js 被正确复制到 dist/assets/
try {
  const scripts = ['ps_color_analyzer.js', 'eagle_storage.js'];
  const publicDir = join(__dirname, 'public', 'assets');
  const distDir = join(__dirname, 'dist', 'assets');
  
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  
  scripts.forEach(script => {
    const src = join(publicDir, script);
    const dest = join(distDir, script);
    
    if (existsSync(src)) {
      copyFileSync(src, dest);
      console.log(`✅ Copied ${script} to dist/assets/`);
    } else {
      console.warn(`⚠️  ${script} not found in public/assets/`);
    }
  });
} catch (error) {
  console.error('❌ Failed to copy non-bundled scripts:', error);
  // 不退出，因为这不是致命错误
}

