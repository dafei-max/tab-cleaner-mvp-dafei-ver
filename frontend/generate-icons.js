#!/usr/bin/env node

/**
 * 将 SVG favicon 转换为不同尺寸的 PNG 图标
 * 用于 Chrome 扩展
 */

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgPath = process.argv[2] || '/Users/liyihua/Downloads/favicon.svg';
const outputDir = join(__dirname, 'public/static/img');

const sizes = [16, 48, 128];

async function generateIcons() {
  try {
    console.log(`📦 读取 SVG: ${svgPath}`);
    const svgBuffer = readFileSync(svgPath);
    
    console.log(`📦 生成图标到: ${outputDir}`);
    
    for (const size of sizes) {
      const outputPath = join(outputDir, `icon-${size}.png`);
      
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ 已生成: icon-${size}.png (${size}x${size})`);
    }
    
    console.log('\n✅ 所有图标生成完成！');
  } catch (error) {
    console.error('❌ 生成图标失败:', error);
    process.exit(1);
  }
}

generateIcons();




