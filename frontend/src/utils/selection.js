/**
 * 选中相关的工具函数
 */

/**
 * 判断点是否在多边形内（射线法）
 */
export const isPointInPolygon = (x, y, polygon) => {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

/**
 * 检查折线是否与矩形相交
 */
export const isPolylineIntersectRect = (polyline, rect) => {
  for (let i = 0; i < polyline.length - 1; i++) {
    const p1 = polyline[i];
    const p2 = polyline[i + 1];
    
    // 检查线段是否与矩形相交
    if (isLineIntersectRect(p1, p2, rect)) {
      return true;
    }
  }
  return false;
};

/**
 * 检查线段是否与矩形相交
 */
const isLineIntersectRect = (p1, p2, rect) => {
  // 快速检查：线段的两端都在矩形外的同一侧
  if ((p1.x < rect.left && p2.x < rect.left) ||
      (p1.x > rect.right && p2.x > rect.right) ||
      (p1.y < rect.top && p2.y < rect.top) ||
      (p1.y > rect.bottom && p2.y > rect.bottom)) {
    return false;
  }
  
  // 检查线段是否与矩形的四条边相交
  return (
    lineSegmentIntersect(p1, p2, { x: rect.left, y: rect.top }, { x: rect.right, y: rect.top }) ||
    lineSegmentIntersect(p1, p2, { x: rect.right, y: rect.top }, { x: rect.right, y: rect.bottom }) ||
    lineSegmentIntersect(p1, p2, { x: rect.right, y: rect.bottom }, { x: rect.left, y: rect.bottom }) ||
    lineSegmentIntersect(p1, p2, { x: rect.left, y: rect.bottom }, { x: rect.left, y: rect.top })
  );
};

/**
 * 检查两条线段是否相交
 */
const lineSegmentIntersect = (p1, p2, p3, p4) => {
  const ccw = (A, B, C) => {
    return (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
  };
  
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
};

/**
 * 处理套索选择
 * 返回选中的 ID 集合
 */
export const handleLassoSelect = (lassoPath, images, opengraphData) => {
  if (!lassoPath || lassoPath.length < 3) return new Set();
  
  const selected = new Set();
  
  // 处理原有图片
  images.forEach(img => {
    const imgRect = {
      left: img.x,
      top: img.y,
      right: img.x + img.width,
      bottom: img.y + img.height,
    };
    
    // 检查图片的四个角和中心点是否在套索内
    const corners = [
      { x: img.x, y: img.y },
      { x: img.x + img.width, y: img.y },
      { x: img.x, y: img.y + img.height },
      { x: img.x + img.width, y: img.y + img.height },
      { x: img.x + img.width / 2, y: img.y + img.height / 2 },
    ];
    
    const hasPointInLasso = corners.some(corner => 
      isPointInPolygon(corner.x, corner.y, lassoPath)
    );
    
    const hasPathIntersection = lassoPath.some(point => 
      point.x >= imgRect.left && point.x <= imgRect.right &&
      point.y >= imgRect.top && point.y <= imgRect.bottom
    );
    
    const hasBoundaryIntersection = isPolylineIntersectRect(lassoPath, imgRect);
    
    if (hasPointInLasso || hasPathIntersection || hasBoundaryIntersection) {
      selected.add(img.id);
    }
  });
  
  // 处理 OpenGraph 图片
  if (opengraphData && Array.isArray(opengraphData)) {
    opengraphData.forEach(og => {
      if (!og || !og.x || !og.y || !og.width || !og.height) return;
      
      const ogRect = {
        left: og.x,
        top: og.y,
        right: og.x + og.width,
        bottom: og.y + og.height,
      };
      
      const corners = [
        { x: og.x, y: og.y },
        { x: og.x + og.width, y: og.y },
        { x: og.x, y: og.y + og.height },
        { x: og.x + og.width, y: og.y + og.height },
        { x: og.x + og.width / 2, y: og.y + og.height / 2 },
      ];
      
      const hasPointInLasso = corners.some(corner => 
        isPointInPolygon(corner.x, corner.y, lassoPath)
      );
      
      const hasPathIntersection = lassoPath.some(point => 
        point.x >= ogRect.left && point.x <= ogRect.right &&
        point.y >= ogRect.top && point.y <= ogRect.bottom
      );
      
      const hasBoundaryIntersection = isPolylineIntersectRect(lassoPath, ogRect);
      
      if (hasPointInLasso || hasPathIntersection || hasBoundaryIntersection) {
        selected.add(og.id);
      }
    });
  }
  
  return selected;
};

