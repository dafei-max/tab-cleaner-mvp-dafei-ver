# Tab Cleaner 插件打包脚本 (Windows PowerShell)
# 使用方法: .\package-extension.ps1

Write-Host "📦 开始打包 Chrome 插件..." -ForegroundColor Cyan

# 清理旧的打包文件
$zipPath = "..\tab-cleaner-extension.zip"
if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
    Write-Host "✅ 已清理旧的打包文件" -ForegroundColor Green
}

# 检查 dist 目录是否存在
if (-not (Test-Path "dist")) {
    Write-Host "❌ 错误: dist 目录不存在，请先运行 npm run build" -ForegroundColor Red
    exit 1
}

# 进入 dist 目录
Set-Location dist

# 创建 zip 文件
Write-Host "📦 正在创建 ZIP 文件..." -ForegroundColor Cyan
Compress-Archive -Path * -DestinationPath "..\..\tab-cleaner-extension.zip" -Force

# 检查文件大小
$file = Get-Item "..\..\tab-cleaner-extension.zip"
$fileSize = "{0:N2} MB" -f ($file.Length / 1MB)

Write-Host ""
Write-Host "✅ 插件已打包完成！" -ForegroundColor Green
Write-Host "📁 文件位置: ..\tab-cleaner-extension.zip" -ForegroundColor Yellow
Write-Host "📊 文件大小: $fileSize" -ForegroundColor Yellow
Write-Host ""
Write-Host "📋 下一步：" -ForegroundColor Cyan
Write-Host "   1. 检查打包文件内容"
Write-Host "   2. 在 Chrome 中加载未打包的扩展程序测试"
Write-Host "   3. 上传到 Chrome Web Store"

# 返回原目录
Set-Location ..




