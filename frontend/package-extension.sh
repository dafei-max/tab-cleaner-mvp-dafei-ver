#!/bin/bash

# Tab Cleaner 插件打包脚本
# 使用方法: ./package-extension.sh

echo "📦 开始打包 Chrome 插件..."

# 清理旧的打包文件
if [ -f "../tab-cleaner-extension.zip" ]; then
  rm -f ../tab-cleaner-extension.zip
  echo "✅ 已清理旧的打包文件"
fi

# 检查 dist 目录是否存在
if [ ! -d "dist" ]; then
  echo "❌ 错误: dist 目录不存在，请先运行 npm run build"
  exit 1
fi

# 进入 dist 目录
cd dist

# 创建 zip 文件（排除不需要的文件）
echo "📦 正在创建 ZIP 文件..."
zip -r ../../tab-cleaner-extension.zip . \
  -x "*.DS_Store" \
  -x "*/.DS_Store" \
  -x "**/.DS_Store" \
  -x "*node_modules/*" \
  -x "*.git/*" \
  -x "*.md" \
  -x "*.log" \
  -x "*.map" \
  > /dev/null 2>&1

# 检查文件大小
FILE_SIZE=$(du -h ../../tab-cleaner-extension.zip | cut -f1)

echo "✅ 插件已打包完成！"
echo "📁 文件位置: ../tab-cleaner-extension.zip"
echo "📊 文件大小: $FILE_SIZE"
echo ""
echo "📋 下一步："
echo "   1. 检查打包文件内容"
echo "   2. 在 Chrome 中加载未打包的扩展程序测试"
echo "   3. 上传到 Chrome Web Store"

