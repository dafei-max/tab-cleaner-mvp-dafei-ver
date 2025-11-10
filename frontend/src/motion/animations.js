/**
 * 动画工具函数
 * 提供通用的动画辅助函数
 */

import { CARD_ANIMATION, CLUSTER_ANIMATION, LAYOUT_ANIMATION, EASING } from './constants';

/**
 * 生成 CSS transition 字符串
 * @param {string} property - CSS 属性名
 * @param {number} duration - 动画时长（毫秒）
 * @param {string} easing - 缓动函数
 * @returns {string} CSS transition 字符串
 */
export const createTransition = (property, duration, easing) => {
  return `${property} ${duration}ms ${easing}`;
};

/**
 * 生成多个属性的 CSS transition
 * @param {Object} properties - 属性对象，如 { transform: 400, opacity: 200 }
 * @param {string} easing - 缓动函数
 * @returns {string} CSS transition 字符串
 */
export const createMultiTransition = (properties, easing = 'ease-out') => {
  const transitions = Object.entries(properties).map(([prop, duration]) => {
    return `${prop} ${duration}ms ${easing}`;
  });
  return transitions.join(', ');
};

/**
 * 计算两点之间的距离
 * @param {number} x1 - 起点 X
 * @param {number} y1 - 起点 Y
 * @param {number} x2 - 终点 X
 * @param {number} y2 - 终点 Y
 * @returns {number} 距离
 */
export const calculateDistance = (x1, y1, x2, y2) => {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
};

/**
 * 根据距离计算动画时长（距离越远，动画越长）
 * @param {number} distance - 距离（像素）
 * @param {number} baseDuration - 基础时长（毫秒）
 * @param {number} maxDuration - 最大时长（毫秒）
 * @returns {number} 计算后的动画时长
 */
export const calculateDurationByDistance = (distance, baseDuration = 300, maxDuration = 800) => {
  const duration = baseDuration + (distance / 10); // 每10px增加1ms
  return Math.min(duration, maxDuration);
};

/**
 * 生成卡片移动的 CSS 样式
 * @param {number} fromX - 起始 X 坐标
 * @param {number} fromY - 起始 Y 坐标
 * @param {number} toX - 目标 X 坐标
 * @param {number} toY - 目标 Y 坐标
 * @param {Object} options - 选项
 * @returns {Object} CSS 样式对象
 */
export const createCardMoveStyle = (fromX, fromY, toX, toY, options = {}) => {
  const {
    duration = CARD_ANIMATION.MOVE_DURATION,
    easing = CARD_ANIMATION.MOVE_EASING,
    delay = 0,
  } = options;

  const distance = calculateDistance(fromX, fromY, toX, toY);
  const actualDuration = calculateDurationByDistance(distance, duration);

  return {
    transform: `translate(${toX - fromX}px, ${toY - fromY}px)`,
    transition: createMultiTransition(
      {
        transform: actualDuration,
      },
      easing
    ),
    transitionDelay: `${delay}ms`,
  };
};

/**
 * 生成淡入动画样式
 * @param {Object} options - 选项
 * @returns {Object} CSS 样式对象
 */
export const createFadeInStyle = (options = {}) => {
  const {
    duration = CARD_ANIMATION.FADE_IN_DURATION,
    easing = EASING.EASE_OUT,
    delay = 0,
  } = options;

  return {
    opacity: 1,
    transition: createTransition('opacity', duration, easing),
    transitionDelay: `${delay}ms`,
  };
};

/**
 * 生成淡出动画样式
 * @param {Object} options - 选项
 * @returns {Object} CSS 样式对象
 */
export const createFadeOutStyle = (options = {}) => {
  const {
    duration = CARD_ANIMATION.FADE_OUT_DURATION,
    easing = EASING.EASE_IN,
    delay = 0,
  } = options;

  return {
    opacity: 0,
    transition: createTransition('opacity', duration, easing),
    transitionDelay: `${delay}ms`,
  };
};

/**
 * 生成缩放动画样式
 * @param {number} scale - 缩放比例
 * @param {Object} options - 选项
 * @returns {Object} CSS 样式对象
 */
export const createScaleStyle = (scale, options = {}) => {
  const {
    duration = CARD_ANIMATION.SCALE_DURATION,
    easing = EASING.EASE_OUT,
    delay = 0,
  } = options;

  return {
    transform: `scale(${scale})`,
    transition: createTransition('transform', duration, easing),
    transitionDelay: `${delay}ms`,
  };
};

