import React, { useState, useEffect, useRef } from 'react';
import './PixelCard.css';

/**
 * Pixel Card 组件 - 基于 reactbits.dev
 * 在悬停时显示像素化的边框效果
 */
export const PixelCard = ({
  children,
  variant = 'default',
  gap = 4,
  speed = 1,
  colors = '#f8fafc,#f1f5f9,#cbd5e1',
  noFocus = false,
  className = '',
  style = {},
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef(null);
  const animationRef = useRef(null);

  const colorArray = colors.split(',').map(c => c.trim());

  useEffect(() => {
    if (isHovered || isFocused) {
      // 像素动画效果
      const animate = () => {
        if (containerRef.current) {
          const pixels = containerRef.current.querySelectorAll('.pixel');
          pixels.forEach((pixel, index) => {
            const delay = (index % (gap * 2)) * (speed * 10);
            setTimeout(() => {
              pixel.style.opacity = Math.random() > 0.5 ? '1' : '0.3';
            }, delay);
          });
        }
        animationRef.current = requestAnimationFrame(animate);
      };
      animate();
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isHovered, isFocused, gap, speed]);

  const handleFocus = () => {
    if (!noFocus) {
      setIsFocused(true);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  return (
    <div
      ref={containerRef}
      className={`pixel-card pixel-card-${variant} ${className}`}
      style={{
        position: 'relative',
        ...style,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      tabIndex={noFocus ? -1 : 0}
    >
      {children}
      {(isHovered || isFocused) && (
        <div
          className="pixel-border"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            border: `2px solid ${variant === 'blue' ? '#3b82f6' : colorArray[0]}`,
            borderRadius: '8px',
            backgroundImage: `
              repeating-linear-gradient(
                0deg,
                transparent 0px,
                transparent ${gap - 2}px,
                ${variant === 'blue' ? '#3b82f6' : colorArray[0]} ${gap - 2}px,
                ${variant === 'blue' ? '#3b82f6' : colorArray[0]} ${gap}px
              ),
              repeating-linear-gradient(
                90deg,
                transparent 0px,
                transparent ${gap - 2}px,
                ${variant === 'blue' ? '#3b82f6' : colorArray[0]} ${gap - 2}px,
                ${variant === 'blue' ? '#3b82f6' : colorArray[0]} ${gap}px
              )
            `,
            backgroundSize: `${gap * 2}px ${gap * 2}px`,
            opacity: 0.7,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}
    </div>
  );
};

export default PixelCard;

