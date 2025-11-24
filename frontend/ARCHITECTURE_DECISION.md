# 架构决策：React Hooks vs OOP

## 决策：使用 React Hooks 方式（函数式）

### 原因分析

#### 1. **性能问题**
OOP 方式（CardManager）每帧都更新 React 状态：
```javascript
// ❌ 每帧都调用 setState（60次/秒）
const update = () => {
  managerRef.current.update();
  syncState(); // 导致大量重渲染
  requestAnimationFrame(update);
};
```

React Hooks 方式只在位置变化时更新：
```javascript
// ✅ 只在位置变化足够大时才更新（优化性能）
if (Math.abs(position.x - lastPos.x) > 0.5 || ...) {
  updateCardPosition(cardId, position.x, position.y);
}
```

#### 2. **React 生态最佳实践**
- ✅ 使用 `useRef` 存储动画对象（不触发重渲染）
- ✅ 使用 `useCallback` 优化函数引用
- ✅ 使用 `useEffect` 管理副作用
- ✅ 函数式组件和纯函数
- ✅ 声明式渲染

#### 3. **代码组织**
- ✅ 逻辑清晰，易于理解
- ✅ 符合 React 开发者的习惯
- ✅ 易于测试和维护
- ✅ 与现有代码风格一致

#### 4. **效果一致性**
两种方式都能实现相同的视觉效果：
- Spring 物理动画 ✅
- 多边形布局 ✅
- 同心圆排列 ✅
- 平滑过渡 ✅

## 实现方式

### 核心架构
```
useClusterSpringAnimation (Hook)
  ├── Spring2D (类) - 动画物理引擎
  ├── calculateRadialLayout (函数) - 同心圆布局
  └── calculateMultipleClustersLayout (函数) - 多边形布局
```

### 更新循环顺序（与文档一致）
1. 更新聚类圆心的目标位置到多边形
2. 更新聚类圆心的实际位置（Spring）
3. 根据新的圆心位置更新卡片目标位置
4. 更新卡片位置（Spring）

### 性能优化
- 使用 `useRef` 存储动画对象（不触发重渲染）
- 位置变化检测（只在变化 > 0.5px 时更新状态）
- 使用 `useCallback` 优化函数引用
- 使用 `requestAnimationFrame` 管理动画循环

## 结论

**保持现有的 React Hooks 方式**，因为：
1. ✅ 性能更好（减少不必要的重渲染）
2. ✅ 更符合 React 生态
3. ✅ 代码更清晰易维护
4. ✅ 效果完全一致

OOP 方式虽然逻辑更集中，但在 React 中会导致性能问题，不适合用于高频更新的动画场景。




