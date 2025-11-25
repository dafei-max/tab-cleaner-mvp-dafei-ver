import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import './FluidGlassCursor.css';

/**
 * 放大镜效果自定义光标组件
 * 基于放大镜示例，添加呼吸感动画
 */
export const FluidGlassCursor = () => {
  const [isHovering, setIsHovering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  
  const springConfig = { damping: 25, stiffness: 700 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  useEffect(() => {
    // 强制隐藏所有光标
    const style = document.createElement('style');
    style.id = 'hide-cursor-style';
    style.textContent = `
      *, *::before, *::after {
        cursor: none !important;
      }
      html, body {
        cursor: none !important;
      }
    `;
    document.head.appendChild(style);

    const moveCursor = (e) => {
      // 标准光标指尖通常在左上角，所以需要将圆心向左上偏移
      // 偏移量约为光标大小的 1/4 到 1/3
      const offsetX = -8; // 向左偏移
      const offsetY = -8; // 向上偏移
      cursorX.set(e.clientX + offsetX);
      cursorY.set(e.clientY + offsetY);
      if (!isVisible) setIsVisible(true);
    };

    const checkHover = (e) => {
      const target = e.target;
      const isInteractive = 
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('a') ||
        target.closest('.card-action-button') ||
        target.closest('.view-button') ||
        target.closest('.masonry-item') ||
        target.closest('.radial-card') ||
        target.closest('.add-new-session') ||
        target.closest('.search-bar') ||
        target.closest('.search-bar-container') ||
        window.getComputedStyle(target).cursor === 'pointer';
      
      setIsHovering(isInteractive);
    };

    const handleMouseOut = () => {
      setIsVisible(false);
    };

    window.addEventListener('mousemove', moveCursor);
    window.addEventListener('mousemove', checkHover);
    document.addEventListener('mouseout', handleMouseOut);

    return () => {
      window.removeEventListener('mousemove', moveCursor);
      window.removeEventListener('mousemove', checkHover);
      document.removeEventListener('mouseout', handleMouseOut);
      // 移除样式
      const styleEl = document.getElementById('hide-cursor-style');
      if (styleEl) {
        styleEl.remove();
      }
    };
  }, [cursorX, cursorY, isVisible]);

  return (
    <>
      {/* 放大镜光标 */}
      {isVisible && (
        <motion.div
          className="magnifier-cursor"
          style={{
            left: cursorXSpring,
            top: cursorYSpring,
          }}
          animate={{
            scale: isHovering ? [1, 1.2, 1] : [1, 1.1, 1],
          }}
          transition={{
            scale: {
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            },
          }}
        >
          {/* 外层圆圈 */}
          <div className="magnifier-outer" />
          
          {/* 内层圆圈 */}
          <div className="magnifier-inner" />
        </motion.div>
      )}
    </>
  );
};

export default FluidGlassCursor;
