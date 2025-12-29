# 虚拟滚动使用指南

## 概述

`SessionMasonryGridVirtualized.jsx` 是使用 `@tanstack/react-virtual` 实现的虚拟滚动版本的 Masonry Grid 组件，用于优化大量卡片（1000+）的渲染性能。

## 安装依赖

```bash
cd frontend
npm install @tanstack/react-virtual
```

## 使用方法

### 方式 1: 直接替换（推荐用于测试）

在 `ViewContainer.jsx` 中替换导入：

```jsx
// 原版本
import { SessionMasonryGrid } from '../SessionMasonryGrid';

// 虚拟滚动版本
import { SessionMasonryGridVirtualized as SessionMasonryGrid } from '../SessionMasonryGridVirtualized';
```

### 方式 2: 条件切换（用于 A/B 测试）

在 `ViewContainer.jsx` 中添加条件渲染：

```jsx
import { SessionMasonryGrid } from '../SessionMasonryGrid';
import { SessionMasonryGridVirtualized } from '../SessionMasonryGridVirtualized';

// 在组件中
const USE_VIRTUAL_SCROLL = true; // 或从环境变量读取

{USE_VIRTUAL_SCROLL ? (
  <SessionMasonryGridVirtualized {...props} />
) : (
  <SessionMasonryGrid {...props} />
)}
```

## 功能特性

### ✅ 已实现

1. **虚拟滚动**: 只渲染可见区域的卡片，大幅提升性能
2. **Masonry 布局**: 保持原有的瀑布流布局效果
3. **动态高度**: 支持基于图片宽高比的动态高度计算
4. **滚动位置恢复**: 支持从 localStorage 恢复滚动位置
5. **所有原有功能**: 卡片选择、删除、打开链接等功能完全兼容

### 🔧 技术细节

- **列分配算法**: 使用最短列优先算法分配卡片到列
- **行分组**: 将卡片按 top 位置分组为行，用于虚拟化
- **高度估算**: 基于图片宽高比估算卡片高度，支持动态调整
- **Overscan**: 渲染额外的 3 行以提高滚动流畅度

## 性能优化

### 预期性能提升

- **初始渲染**: 从渲染所有卡片到只渲染可见区域（约 20-30 个卡片）
- **滚动性能**: 60fps 流畅滚动，即使有 1000+ 卡片
- **内存占用**: 大幅降低 DOM 节点数量

### 测试建议

1. **测试数据量**: 使用 1000+ 卡片的 Session 测试
2. **滚动测试**: 快速滚动、慢速滚动、跳转到底部
3. **功能测试**: 验证卡片点击、删除、选择等功能
4. **布局测试**: 验证 Masonry 布局是否正确

## 已知限制

1. **高度估算**: 卡片高度是估算的，可能与实际高度有差异（会在加载后自动调整）
2. **多 Session**: 每个 Session 独立虚拟化，但整体容器共享滚动
3. **拖拽功能**: 虚拟滚动版本暂不支持拖拽（原版本也禁用了）

## 故障排除

### 问题: 卡片位置不正确

**原因**: 高度估算不准确

**解决**: 
- 检查 `estimateCardHeight` 函数
- 确保图片宽高比数据正确
- 查看控制台是否有高度测量警告

### 问题: 滚动位置未恢复

**原因**: localStorage 不可用或数据格式错误

**解决**:
- 检查浏览器是否允许 localStorage
- 查看控制台是否有错误
- 检查 `handleScroll` 是否正常触发

### 问题: 性能未提升

**原因**: 卡片数量太少或虚拟化未生效

**解决**:
- 确保有足够多的卡片（建议 100+）
- 检查 `virtualRows` 是否正确计算
- 使用 React DevTools 检查渲染的 DOM 节点数量

## 未来优化

- [ ] 支持拖拽功能（需要特殊处理虚拟滚动）
- [ ] 更精确的高度测量（使用 ResizeObserver）
- [ ] 支持横向虚拟滚动（如果需要）
- [ ] 优化多 Session 场景的性能

