# 核心 OOP 架构

按照文档 `cursor_prompt.md` 的要求，实现了完全 OOP 的聚类排布系统。

## 类结构

### 1. Card 类 (`Card.js`)
管理单个卡片的位置、动画和状态。

**主要方法：**
- `setTargetPosition(x, y)` - 设置目标位置
- `update()` - 使用 Spring 物理模拟更新位置
- `contains(px, py)` - 检测点是否在卡片内
- `getCenter()` - 获取卡片中心点
- `setSelected(selected)` - 设置选中状态

### 2. Cluster 类 (`Cluster.js`)
管理聚类的圆心、卡片列表和同心圆布局。

**主要方法：**
- `getCardPositions()` - 计算同心圆排布
- `updateCardPositions(cards)` - 更新所有卡片的目标位置
- `setTargetCenter(x, y)` - 设置圆心目标位置
- `update()` - 更新圆心位置（Spring 动画）
- `getRadius()` - 获取聚类占用的最大半径

### 3. CardManager 类 (`CardManager.js`)
协调管理所有卡片和聚类，管理更新循环。

**主要方法：**
- `initCards(items)` - 初始化卡片
- `getClusterCenterPositions()` - 计算聚类圆心的多边形排列
- `createCluster(cardIds, name, type)` - 创建新聚类
- `update()` - 每帧更新（关键！）
- `getCardAtPoint(px, py)` - 获取指定点的卡片
- `getCardsForRender()` - 获取所有卡片的位置信息（用于React渲染）
- `getClustersForRender()` - 获取所有聚类信息（用于React渲染）

## React 桥接

### useCardManager Hook (`hooks/useCardManager.js`)
桥接 CardManager 和 React 状态，提供响应式的状态更新。

**使用示例：**
```javascript
import { useCardManager } from '../hooks/useCardManager';

const MyComponent = () => {
  const {
    cards,           // 卡片数组（用于渲染）
    clusters,        // 聚类数组（用于渲染）
    isSelecting,     // 是否在选择模式
    selectedCardIds, // 选中的卡片ID列表
    initCards,       // 初始化卡片
    enterSelectionMode, // 进入选择模式
    selectCard,      // 选择卡片
    confirmSelection, // 确认创建聚类
    createCluster,   // 创建聚类
    getCardAtPoint,  // 获取指定点的卡片
  } = useCardManager(1440, 1024, initialItems);

  // 渲染卡片
  return (
    <div>
      {cards.map(card => (
        <div
          key={card.id}
          style={{
            position: 'absolute',
            left: `${card.x}px`,
            top: `${card.y}px`,
            width: `${card.width}px`,
            height: `${card.height}px`,
          }}
        >
          {/* 卡片内容 */}
        </div>
      ))}
    </div>
  );
};
```

## 更新循环顺序

CardManager 的 `update()` 方法必须按照以下顺序执行：

1. **更新聚类圆心的目标位置到多边形** - `updateClusterCenters()`
2. **更新所有聚类的圆心位置** - `cluster.update()`
3. **根据新的圆心位置更新卡片的目标位置** - `cluster.updateCardPositions(cards)`
4. **更新所有卡片位置** - `card.update()`

这个顺序确保了卡片能够正确跟随聚类圆心移动。

## Spring 动画参数

- **卡片动画：** `accel = 0.08`, `damping = 0.92`
- **聚类圆心动画：** `accel = 0.06`, `damping = 0.90`

## 多边形布局

- 1个聚类：中心
- 2个聚类：水平对称
- 3个聚类：正三角形
- 4个聚类：正方形（菱形）
- 5个聚类：正五边形
- 6-8个聚类：正多边形
- 9个及以上：使用固定半径

