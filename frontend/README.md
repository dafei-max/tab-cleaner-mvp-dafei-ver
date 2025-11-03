# Tab Cleaner Frontend

Chrome MV3 扩展前端，使用 React + Vite 构建。

## 开发

1. 安装依赖：
```bash
npm install
```

2. 开发模式（监听文件变化并自动构建）：
```bash
npm run dev
```

3. 生产构建：
```bash
npm run build
```

构建输出在 `dist/` 目录。

## 加载扩展

1. 构建项目：`npm run build`
2. 打开 Chrome → 扩展程序 → 开发者模式
3. 点击"加载已解压的扩展"
4. 选择 `dist/` 目录

## 项目结构

```
frontend/
├── src/
│   ├── popup/          # Popup 页面（React）
│   ├── sidepanel/      # Side Panel 页面（React）
│   ├── background/     # Service Worker
│   ├── shared/         # 共享逻辑（API 调用等）
│   ├── screens/        # Anima 组件
│   └── icons/          # SVG 图标
├── public/             # 静态资源（构建时会复制到 dist/）
│   ├── popup.html
│   ├── sidepanel.html
│   ├── manifest.json
│   └── img/            # 图片资源
└── dist/               # 构建输出（Chrome 扩展目录）
```

## 后续扩展

如需接入 React Three Fiber：
```bash
npm install @react-three/fiber @react-three/drei three
```

然后在 `sidepanel/SidePanelApp.jsx` 中使用。
