/**
 * 计算放射状布局（从圆心开始，一圈一圈向外）
 * 
 * @param {Array} items - 要布局的项目数组
 * @param {Object} options - 布局选项
 * @param {number} options.centerX - 画布中心 X 坐标（默认 720）
 * @param {number} options.centerY - 画布中心 Y 坐标（默认 512）
 * @param {number} options.imageSize - 图片大小（默认 120）
 * @param {number} options.spacing - 每圈之间的间距（默认 150）
 * @returns {Array} 带位置信息的项目数组
 */
export const calculateRadialLayout = (items, options = {}) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }
  
  const {
    centerX = 720,      // 画布中心 X (1440 / 2)
    centerY = 512,      // 画布中心 Y (1024 / 2)
    imageSize = 120,    // 图片大小
    spacing = 150,      // 每圈之间的间距
  } = options;
  
  const positioned = [];
  let currentRing = 0;
  let currentIndexInRing = 0;
  let itemsInCurrentRing = 1; // 第一圈 1 个，第二圈 6 个，第三圈 12 个...
  
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      console.warn('[radialLayout] Invalid item:', item);
      return;
    }
    
    if (currentIndexInRing >= itemsInCurrentRing) {
      currentRing++;
      currentIndexInRing = 0;
      // 每圈数量：1, 6, 12, 18, 24...
      itemsInCurrentRing = currentRing === 0 ? 1 : currentRing * 6;
    }
    
    const angleStep = (2 * Math.PI) / itemsInCurrentRing;
    const angle = currentIndexInRing * angleStep;
    const radius = currentRing * spacing + (currentRing === 0 ? 0 : spacing / 2);
    
    const x = centerX + Math.cos(angle) * radius - imageSize / 2;
    const y = centerY + Math.sin(angle) * radius - imageSize / 2;
    
    positioned.push({
      ...item,
      x: Math.round(x),
      y: Math.round(y),
      width: imageSize,
      height: imageSize,
    });
    
    currentIndexInRing++;
  });
  
  return positioned;
};

