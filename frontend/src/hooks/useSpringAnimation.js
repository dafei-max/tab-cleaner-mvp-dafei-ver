/**
 * Spring 动画 Hook
 * 用于在 React 组件中使用 Spring 动画
 */

import { useState, useEffect, useRef } from 'react';
import { Spring2D, SPRING_CONFIG, globalSpringManager } from '../motion/spring';

/**
 * 使用 Spring 动画的 Hook
 * @param {number} initialX - 初始 X 坐标
 * @param {number} initialY - 初始 Y 坐标
 * @param {Object} config - Spring 配置（可选）
 * @returns {Object} { x, y, setTarget, isAnimating }
 */
export const useSpringAnimation = (initialX, initialY, config = SPRING_CONFIG.card) => {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const springRef = useRef(null);
  const isAnimatingRef = useRef(false);

  // 初始化 Spring
  useEffect(() => {
    springRef.current = new Spring2D(initialX, initialY, initialX, initialY, config);
    globalSpringManager.add(springRef.current);

    // 更新循环
    const updatePosition = () => {
      if (springRef.current) {
        const currentPos = springRef.current.getValue();
        const wasAnimating = isAnimatingRef.current;
        const isAtTarget = springRef.current.isAtTarget(1); // 1px 容差
        
        isAnimatingRef.current = !isAtTarget;
        
        // 只有当位置变化或动画状态变化时才更新
        if (
          Math.abs(currentPos.x - position.x) > 0.1 ||
          Math.abs(currentPos.y - position.y) > 0.1 ||
          wasAnimating !== isAnimatingRef.current
        ) {
          setPosition(currentPos);
        }
        
        if (isAnimatingRef.current) {
          requestAnimationFrame(updatePosition);
        }
      }
    };

    updatePosition();

    return () => {
      if (springRef.current) {
        globalSpringManager.remove(springRef.current);
      }
    };
  }, []); // 只在组件挂载时初始化

  // 当初始位置改变时，更新 Spring 的初始值
  useEffect(() => {
    if (springRef.current) {
      const current = springRef.current.getValue();
      // 如果初始位置变化很大，重置 Spring
      const distance = Math.sqrt(
        (initialX - current.x) ** 2 + (initialY - current.y) ** 2
      );
      if (distance > 10) {
        springRef.current.springX.value = initialX;
        springRef.current.springY.value = initialY;
        springRef.current.springX.velocity = 0;
        springRef.current.springY.velocity = 0;
        setPosition({ x: initialX, y: initialY });
      }
    }
  }, [initialX, initialY]);

  const setTarget = (x, y) => {
    if (springRef.current) {
      springRef.current.setTarget(x, y);
      isAnimatingRef.current = true;
      // 触发更新循环
      const updatePosition = () => {
        if (springRef.current) {
          const currentPos = springRef.current.getValue();
          const isAtTarget = springRef.current.isAtTarget(1);
          
          isAnimatingRef.current = !isAtTarget;
          setPosition(currentPos);
          
          if (isAnimatingRef.current) {
            requestAnimationFrame(updatePosition);
          }
        }
      };
      updatePosition();
    }
  };

  return {
    x: position.x,
    y: position.y,
    setTarget,
    isAnimating: isAnimatingRef.current,
  };
};




