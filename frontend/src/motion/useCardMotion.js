/**
 * 卡片动画 Hook
 * 用于管理卡片的位置变化动画
 */

import { useState, useEffect, useRef } from 'react';
import { createCardMoveStyle, calculateDistance } from './animations';
import { CARD_ANIMATION } from './constants';

/**
 * 卡片动画 Hook
 * @param {number} initialX - 初始 X 坐标
 * @param {number} initialY - 初始 Y 坐标
 * @param {Object} options - 选项
 * @returns {Object} 动画状态和样式
 */
export const useCardMotion = (initialX, initialY, options = {}) => {
  const [currentX, setCurrentX] = useState(initialX);
  const [currentY, setCurrentY] = useState(initialY);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevPositionRef = useRef({ x: initialX, y: initialY });

  useEffect(() => {
    // 如果位置发生变化，触发动画
    if (currentX !== prevPositionRef.current.x || currentY !== prevPositionRef.current.y) {
      setIsAnimating(true);
      
      // 动画结束后重置状态
      const distance = calculateDistance(
        prevPositionRef.current.x,
        prevPositionRef.current.y,
        currentX,
        currentY
      );
      const duration = CARD_ANIMATION.MOVE_DURATION + (distance / 10);
      
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, duration);

      prevPositionRef.current = { x: currentX, y: currentY };
      
      return () => clearTimeout(timer);
    }
  }, [currentX, currentY]);

  const moveTo = (targetX, targetY, animationOptions = {}) => {
    setCurrentX(targetX);
    setCurrentY(targetY);
  };

  const style = isAnimating
    ? createCardMoveStyle(
        prevPositionRef.current.x,
        prevPositionRef.current.y,
        currentX,
        currentY,
        options
      )
    : {};

  return {
    x: currentX,
    y: currentY,
    isAnimating,
    moveTo,
    style,
  };
};

