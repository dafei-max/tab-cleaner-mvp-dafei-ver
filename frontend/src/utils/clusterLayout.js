/**
 * 聚类布局工具函数
 * 用于计算多个聚类的位置，避免重叠
 */

/**
 * 计算多个聚类的布局位置，避免重叠
 * 使用螺旋布局算法，从中心向外扩散
 * 
 * @param {Array} clusters - 聚类列表，每个聚类包含 items 和 center 信息
 * @param {Object} options - 布局选项
 * @param {number} options.canvasWidth - 画布宽度（默认 1440）
 * @param {number} options.canvasHeight - 画布高度（默认 1024）
 * @param {number} options.clusterSpacing - 聚类之间的最小间距（默认 500）
 * @returns {Array} 更新了 center 位置的聚类列表
 */
export const calculateMultipleClustersLayout = (clusters, options = {}) => {
  if (!clusters || clusters.length === 0) {
    return [];
  }

  const {
    canvasWidth = 1440,
    canvasHeight = 1024,
    clusterSpacing = 500,
  } = options;

  // 计算每个聚类的半径（基于其 items 数量）
  const clusterRadii = clusters.map(cluster => {
    const items = cluster.items || [];
    const itemCount = items.length;
    // 估算聚类半径：基于圆形排列的最大半径
    // 假设每圈6个，计算需要多少圈
    if (itemCount <= 1) {
      return 100;
    }
    const rings = Math.ceil((itemCount - 1) / 6) + 1;
    return rings * 150 + 100; // 每圈150间距，加上边距
  });

  // 使用螺旋布局：从画布中心开始，按螺旋向外排列
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  const positionedClusters = [];
  const usedPositions = []; // 记录已使用的位置，用于碰撞检测

  clusters.forEach((cluster, idx) => {
    const items = cluster.items || [];
    const clusterRadius = clusterRadii[idx];

    let centerXPos, centerYPos;

    // 如果这是第一个聚类，放在中心
    if (idx === 0) {
      centerXPos = centerX;
      centerYPos = centerY;
    } else {
      // 从中心开始螺旋搜索
      let bestPosition = null;
      let bestDistance = Infinity;
      const angleStep = Math.PI / 3; // 每60度一个位置

      for (let ring = 1; ring < 10; ring++) {
        for (let angleIdx = 0; angleIdx < ring * 6; angleIdx++) {
          const angle = angleIdx * angleStep;
          // 螺旋半径随圈数增加
          const spiralR = ring * clusterSpacing;
          const testX = centerX + Math.cos(angle) * spiralR;
          const testY = centerY + Math.sin(angle) * spiralR;

          // 检查是否与已有聚类重叠
          let overlaps = false;
          for (const usedPos of usedPositions) {
            const [usedX, usedY, usedR] = usedPos;
            const distance = Math.sqrt((testX - usedX) ** 2 + (testY - usedY) ** 2);
            if (distance < (clusterRadius + usedR + 50)) { // 50px 安全边距
              overlaps = true;
              break;
            }
          }

          // 检查是否超出画布
          if (testX - clusterRadius < 0 || testX + clusterRadius > canvasWidth ||
              testY - clusterRadius < 0 || testY + clusterRadius > canvasHeight) {
            continue;
          }

          if (!overlaps) {
            // 选择距离中心最近的位置（优先）
            const distanceFromCenter = Math.sqrt((testX - centerX) ** 2 + (testY - centerY) ** 2);
            if (distanceFromCenter < bestDistance) {
              bestDistance = distanceFromCenter;
              bestPosition = [testX, testY];
            }
          }
        }

        if (bestPosition) {
          break;
        }
      }

      if (bestPosition) {
        [centerXPos, centerYPos] = bestPosition;
      } else {
        // 如果找不到合适位置，使用简单的网格布局作为后备
        const cols = Math.ceil(Math.sqrt(clusters.length));
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        centerXPos = 200 + col * clusterSpacing;
        centerYPos = 200 + row * clusterSpacing;
      }
    }

    // 更新聚类的中心位置
    cluster.center = { x: centerXPos, y: centerYPos };

    positionedClusters.push(cluster);

    // 记录已使用的位置
    usedPositions.push([centerXPos, centerYPos, clusterRadius]);
  });

  return positionedClusters;
};

