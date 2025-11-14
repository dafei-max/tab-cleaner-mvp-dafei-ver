# Chrome Web Store 打包指南

根据 [Chrome Web Store 官方文档](https://developer.chrome.com/docs/webstore/publish?hl=zh-tw)，上架需要上传 **ZIP 文件**。

## 📦 需要打包的内容

需要打包的是 `frontend/dist/` 目录下的所有文件，这是构建后的输出目录。

### 必需文件清单

1. **`manifest.json`** - 插件配置文件（必需）
2. **HTML 文件**：
   - `personalspace.html`
   - `popup.html`
   - `sidepanel.html`
   - `blank.html`
3. **`assets/` 目录**：
   - 所有 JS 文件（如 `background.js`, `personalspace.js`, `content.js` 等）
   - 所有 CSS 文件（如 `personalspace.css`, `style.css` 等）
4. **`static/img/` 目录**：
   - 所有图片资源（PNG、SVG 等）

## 🚀 打包步骤

### macOS/Linux

```bash
cd frontend
npm run build          # 1. 先构建项目
./package-extension.sh # 2. 打包成 ZIP
```

打包后会生成 `tab-cleaner-extension.zip` 文件在项目根目录。

### Windows

```powershell
cd frontend
npm run build          # 1. 先构建项目
.\package-extension.ps1 # 2. 打包成 ZIP
```

## 📋 打包后的文件结构

打包后的 ZIP 文件应该包含：

```
tab-cleaner-extension.zip
├── manifest.json
├── personalspace.html
├── popup.html
├── sidepanel.html
├── blank.html
├── assets/
│   ├── background.js
│   ├── personalspace.js
│   ├── personalspace.css
│   └── ...
└── static/
    └── img/
        └── ...
```

## ✅ 打包检查清单

- [ ] `manifest.json` 存在且格式正确
- [ ] 所有 HTML 文件都在根目录
- [ ] `assets/` 目录包含所有 JS/CSS 文件
- [ ] `static/img/` 目录包含所有图片资源
- [ ] 没有包含 `node_modules/`、`.git/`、`.DS_Store` 等开发文件
- [ ] ZIP 文件大小在 200MB 以内（Chrome Web Store 限制）

## 📤 上传到 Chrome Web Store

1. 前往 [Chrome 开发人员信息主页](https://chrome.google.com/webstore/devconsole)
2. 登录开发人员账户
3. 点击「新增项目」按钮
4. 选择「选择文件」> ZIP 文件 > 上传 `tab-cleaner-extension.zip`
5. 填写商品相关信息（商店信息、隐私权、发行等）
6. 提交审核

## ⚠️ 注意事项

1. **文件大小限制**：Chrome Web Store 单个 ZIP 文件最大 200MB，建议控制在 50MB 以内
2. **不要包含**：
   - `node_modules/`
   - `.git/`
   - 源代码文件（`src/`）
   - 开发配置文件
   - `.DS_Store` 等系统文件
   - `.map` 源映射文件（可选，但会增加文件大小）
3. **必须包含**：
   - `manifest.json`（必需）
   - 所有 HTML 文件
   - 所有 JS/CSS 资源
   - 所有图片资源

## 🧪 测试打包文件

上传前建议：

1. **解压 ZIP 文件检查内容**
   ```bash
   unzip -l tab-cleaner-extension.zip
   ```

2. **在 Chrome 中加载测试**
   - 打开 Chrome 浏览器
   - 访问 `chrome://extensions/`
   - 开启「开发者模式」
   - 点击「加载未打包的扩展程序」
   - 选择解压后的文件夹
   - 测试所有功能是否正常

3. **检查文件大小**
   ```bash
   du -sh tab-cleaner-extension.zip
   ```

## 📚 参考资源

- [Chrome Web Store 发布指南](https://developer.chrome.com/docs/webstore/publish?hl=zh-tw)
- [Chrome 扩展程序清单文件](https://developer.chrome.com/docs/extensions/mv3/manifest/)

