# Radial 视图距离控制机制说明

## 概述
Radial 视图使用**同心圆布局算法**来控制卡片离画板中心的远近。卡片按照从内到外的顺序，一圈一圈地排列在画布上。

## 核心参数

### 1. `baseRadius` (基础半径)
- **当前值**: 180px
- **作用**: 控制第一层（内圈）的半径大小
- **位置**: `frontend/src/utils/radialLayout.js` 第29行
- **说明**: 这是第一层卡片距离圆心的距离。值越大，第一层卡片离中心越远

### 2. `radiusGap` (半径间距)
- **当前值**: 280px
- **作用**: 控制每层之间的间距
- **位置**: `frontend/src/utils/radialLayout.js` 第30行
- **说明**: 每增加一层，半径会增加 `radiusGap` 的距离

### 3. `centerX` 和 `centerY` (圆心坐标)
- **默认值**: centerX = 720, centerY = 512
- **作用**: 定义画布的中心点位置
- **说明**: 所有卡片都围绕这个中心点排列

## 布局算法

### 层级结构
```
第0层（中心）: 1张卡片，radius = 0（直接在圆心）
第1层: 6张卡片，radius = baseRadius (180px)
第2层: 12张卡片，radius = baseRadius + radiusGap (180 + 280 = 460px)
第3层: 18张卡片，radius = baseRadius + 2 * radiusGap (180 + 560 = 740px)
第n层: n * 6张卡片，radius = baseRadius + (n-1) * radiusGap
```

### 计算公式

对于第 `layer` 层（layer >= 1）：
```javascript
radius = baseRadius + (layer - 1) * radiusGap
```

对于每张卡片的位置：
```javascript
angle = (2 * Math.PI) / cardsInThisLayer * cardIndex
x = centerX + Math.cos(angle) * radius - imageSize / 2
y = centerY + Math.sin(angle) * radius - imageSize / 2
```

## 如何调整距离

### 让卡片更分散（增大间距）
1. **增大 `baseRadius`**: 让第一层卡片离中心更远
2. **增大 `radiusGap`**: 让各层之间的间距更大

### 让卡片更紧凑（减小间距）
1. **减小 `baseRadius`**: 让第一层卡片离中心更近
2. **减小 `radiusGap`**: 让各层之间的间距更小

### 示例
```javascript
// 当前设置（较分散）
const baseRadius = 180;  // 第一层距离中心180px
const radiusGap = 280;    // 每层间距280px

// 更紧凑的设置
const baseRadius = 120;   // 第一层距离中心120px
const radiusGap = 200;    // 每层间距200px

// 更分散的设置
const baseRadius = 250;   // 第一层距离中心250px
const radiusGap = 350;    // 每层间距350px
```

## 文件位置
- **布局算法**: `frontend/src/utils/radialLayout.js`
- **调用位置**: `frontend/src/screens/PersonalSpace/PersonalSpace.jsx` 第131行

## 注意事项
- 调整这些参数会影响所有卡片的布局
- 如果卡片数量很多，可能需要增大 `radiusGap` 以避免重叠
- `imageSize` 参数也会影响间距计算（当前默认120px）

