/**
 * 聚类动画 Hook
 * 用于管理聚类创建、展开等动画
 */

import { useState, useEffect, useRef } from 'react';
import { CLUSTER_ANIMATION } from './constants';

/**
 * 聚类动画 Hook
 * @param {boolean} isVisible - 是否可见
 * @param {Object} options - 选项
 * @returns {Object} 动画状态和样式
 */
export const useClusterMotion = (isVisible, options = {}) => {
  const [isExpanding, setIsExpanding] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const prevVisibleRef = useRef(isVisible);

  useEffect(() => {
    if (isVisible && !prevVisibleRef.current) {
      // 从不可见到可见：展开动画
      setIsExpanding(true);
      setIsCollapsing(false);
      
      const timer = setTimeout(() => {
        setIsExpanding(false);
      }, CLUSTER_ANIMATION.EXPAND_DURATION);

      return () => clearTimeout(timer);
    } else if (!isVisible && prevVisibleRef.current) {
      // 从可见到不可见：收起动画
      setIsCollapsing(true);
      setIsExpanding(false);
      
      const timer = setTimeout(() => {
        setIsCollapsing(false);
      }, CLUSTER_ANIMATION.COLLAPSE_DURATION);

      return () => clearTimeout(timer);
    }

    prevVisibleRef.current = isVisible;
  }, [isVisible]);

  const expandStyle = isExpanding
    ? {
        opacity: 1,
        transform: 'scale(1)',
        transition: `opacity ${CLUSTER_ANIMATION.EXPAND_DURATION}ms ${CLUSTER_ANIMATION.EXPAND_EASING}, transform ${CLUSTER_ANIMATION.EXPAND_DURATION}ms ${CLUSTER_ANIMATION.EXPAND_EASING}`,
      }
    : {};

  const collapseStyle = isCollapsing
    ? {
        opacity: 0,
        transform: 'scale(0.8)',
        transition: `opacity ${CLUSTER_ANIMATION.COLLAPSE_DURATION}ms ${CLUSTER_ANIMATION.COLLAPSE_EASING}, transform ${CLUSTER_ANIMATION.COLLAPSE_DURATION}ms ${CLUSTER_ANIMATION.COLLAPSE_EASING}`,
      }
    : {};

  return {
    isExpanding,
    isCollapsing,
    expandStyle,
    collapseStyle,
  };
};

/**
 * 计算卡片在聚类中的动画延迟（错开动画时间）
 * @param {number} index - 卡片在聚类中的索引
 * @param {number} total - 聚类中的卡片总数
 * @returns {number} 延迟时间（毫秒）
 */
export const calculateStaggerDelay = (index, total) => {
  return index * CLUSTER_ANIMATION.STAGGER_DELAY;
};

