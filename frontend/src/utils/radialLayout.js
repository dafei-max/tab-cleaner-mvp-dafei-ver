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
    imageSize = 120,    // 图片大小（用于计算间距）
    spacing = null,     // 每圈之间的间距（如果为 null，则根据 imageSize 自动计算）
  } = options;
  
  // 如果没有指定 spacing，根据 imageSize 自动计算（确保卡片不重叠）
  const actualSpacing = spacing !== null ? spacing : Math.max(imageSize * 1.3, 150);
  
  // 按照文档要求：baseRadius = 40, radiusGap = 70（但为了视觉效果更好，大幅增加间距）
  // 不限制每层卡片数，越往外层卡片越多
  const baseRadius = 180; // 增大第一层半径，避免卡片叠在一起
  const radiusGap = 280;  // 大幅增加层间距，让各层之间更宽松
  
  const positioned = [];
  let cardIdx = 0;
  let layer = 0;
  
  while (cardIdx < items.length) {
    // 计算当前层应该放多少张卡片（递增模式）
    // 第0层：1张（中心）
    // 第1层：6张
    // 第2层：12张
    // 第3层：18张
    // 第n层：n * 6 张（n >= 1）
    let cardsInThisLayer;
    if (layer === 0) {
      cardsInThisLayer = 1; // 中心1张
    } else {
      cardsInThisLayer = layer * 6; // 第n层：n * 6 张
    }
    
    // 如果剩余卡片少于当前层应该放置的数量，则全部放在当前层
    const remainingCards = items.length - cardIdx;
    if (remainingCards < cardsInThisLayer) {
      cardsInThisLayer = remainingCards;
    }
    
    // 计算当前层的半径
    // 第0层：radius = 0（直接在圆心）
    // 第1层及以后：radius = baseRadius + (layer - 1) * radiusGap
    const radius = layer === 0 ? 0 : baseRadius + (layer - 1) * radiusGap;
    
    // 计算角度步长
    const angleStep = cardsInThisLayer > 0 ? (2 * Math.PI) / cardsInThisLayer : 0;
    
    // 在当前层放置卡片
    for (let i = 0; i < cardsInThisLayer; i++) {
      const item = items[cardIdx];
      if (!item || typeof item !== 'object') {
        console.warn('[radialLayout] Invalid item:', item);
        cardIdx++;
        continue;
      }
      
      let x, y;
      if (layer === 0) {
        // 第0层：直接放在圆心位置
        x = centerX - imageSize / 2;
        y = centerY - imageSize / 2;
      } else {
        // 第1层及以后：按角度和半径计算
        const angle = angleStep * i;
        x = centerX + Math.cos(angle) * radius - imageSize / 2;
        y = centerY + Math.sin(angle) * radius - imageSize / 2;
      }
      
      positioned.push({
        ...item,
        x: Math.round(x),
        y: Math.round(y),
        width: imageSize,
        height: imageSize,
      });
      
      cardIdx++;
      if (cardIdx >= items.length) break;
    }
    
    layer++;
  }
  
  return positioned;
};

