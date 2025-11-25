import React, { useRef } from 'react';
import './GlareHover.css';

/**
 * Glare Hover 组件 - 基于 reactbits.dev 官方实现
 * 使用 CSS 变量和 ::before 伪元素实现光晕效果
 */
const GlareHover = ({
  children,
  width,
  height,
  background,
  borderRadius = '8px',
  border,
  glareColor = '#ffffff',
  glareOpacity = 0.5,
  glareAngle = 0,
  glareSize = 225,
  transitionDuration = 800,
  playOnce = false,
  className = '',
  style = {},
}) => {
  const containerRef = useRef(null);

  // 将 hex 颜色转换为 rgba
  const hexToRgba = (hex, opacity) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  const rgbaColor = glareColor.startsWith('#') 
    ? hexToRgba(glareColor, glareOpacity)
    : glareColor;

  // 处理鼠标移动，更新 CSS 变量
  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    containerRef.current.style.setProperty('--mouse-x', `${x}%`);
    containerRef.current.style.setProperty('--mouse-y', `${y}%`);
  };

  const cssVars = {
    '--glare-width': width || '100%',
    '--glare-height': height || '100%',
    '--glare-background': background || 'transparent',
    '--glare-border-radius': borderRadius,
    '--glare-border': border || 'none',
    '--glare-color': rgbaColor,
    '--glare-angle': `${glareAngle}deg`,
    '--glare-size': `${glareSize}%`,
    '--glare-transition-duration': `${transitionDuration}ms`,
    '--mouse-x': '50%',
    '--mouse-y': '50%',
  };

  const combinedClassName = `glare-hover ${playOnce ? 'glare-hover--play-once' : ''} ${className}`.trim();

  return (
    <div
      ref={containerRef}
      className={combinedClassName}
      style={{
        ...cssVars,
        ...style,
      }}
      onMouseMove={handleMouseMove}
    >
      {children}
    </div>
  );
};

export default GlareHover;
export { GlareHover };
