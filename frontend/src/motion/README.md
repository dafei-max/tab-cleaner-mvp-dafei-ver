# Motion 动画模块

用于实现卡片位移、聚类动画等视觉效果。

## 计划功能

1. **卡片位移动画**
   - 卡片移动到新位置时的平滑过渡
   - 支持多种缓动函数（ease-in, ease-out, ease-in-out）
   - 可配置动画时长和延迟

2. **聚类动画**
   - 聚类创建时的展开动画
   - 卡片从原位置移动到聚类位置的动画
   - 剩余卡片补位时的动画

3. **布局动画**
   - 搜索结果的渐入动画
   - 聚类结果的渐入动画

## 技术方案

可以使用以下方案之一：
- **CSS Transitions**: 简单快速，适合基础动画
- **Framer Motion**: React 动画库，功能强大
- **GSAP**: 专业动画库，性能优秀
- **React Spring**: 基于物理的动画库

## 文件结构

```
motion/
├── README.md           # 本文件
├── animations.js       # 动画工具函数
├── useCardMotion.js    # 卡片动画 Hook
├── useClusterMotion.js # 聚类动画 Hook
└── constants.js        # 动画常量（时长、缓动函数等）
```

