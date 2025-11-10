import React, { useState, useRef, useEffect } from "react";
import { CARD_ANIMATION, calculateDistance, calculateDurationByDistance } from "../../motion";

/**
 * 可拖拽图片组件
 * 支持拖拽和选中功能
 */
export const DraggableImage = ({
  id,
  className,
  src,
  alt,
  initialX,
  initialY,
  width,
  height,
  animationDelay = 0,
  isSelected,
  onSelect,
  onDragEnd,
}) => {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const prevPositionRef = useRef({ x: initialX, y: initialY });
  const imgRef = useRef(null);

  // 当 initialX 或 initialY 改变时（从父组件更新），同步位置并触发动画
  useEffect(() => {
    if (!isDragging) {
      const prevX = prevPositionRef.current.x;
      const prevY = prevPositionRef.current.y;
      
      // 如果位置发生变化，触发动画
      if (prevX !== initialX || prevY !== initialY) {
        const distance = calculateDistance(prevX, prevY, initialX, initialY);
        
        // 只有当距离足够大时才触发动画（避免微小抖动）
        if (distance > 5) {
          setIsAnimating(true);
          setPosition({ x: initialX, y: initialY });
          
          // 根据距离计算动画时长
          const duration = calculateDurationByDistance(
            distance,
            CARD_ANIMATION.MOVE_DURATION,
            CARD_ANIMATION.MOVE_DURATION * 2
          );
          
          // 动画结束后重置状态
          const timer = setTimeout(() => {
            setIsAnimating(false);
          }, duration);
          
          prevPositionRef.current = { x: initialX, y: initialY };
          
          return () => clearTimeout(timer);
        } else {
          // 距离太小，直接更新位置，不触发动画
          setPosition({ x: initialX, y: initialY });
          prevPositionRef.current = { x: initialX, y: initialY };
        }
      }
    }
  }, [initialX, initialY, isDragging]);

  // 鼠标按下
  const handleMouseDown = (e) => {
    // 如果工具激活，不处理图片拖拽
    const canvas = imgRef.current?.closest('.canvas');
    if (canvas && canvas.style.cursor !== 'default') {
      // 有工具激活时，不处理图片拖拽
      return;
    }
    
    // 如果点击的是图片本身，开始拖拽
    if (e.button !== 0) return; // 只处理左键
    
    // 先处理选中
    if (onSelect) {
      onSelect(id, e.shiftKey); // shift 键支持多选
    }

    // 计算鼠标相对于图片的偏移
    const rect = imgRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    setDragOffset({ x: offsetX, y: offsetY });
    setIsDragging(true);
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡
  };

  // 鼠标移动
  useEffect(() => {
    if (!isDragging) return;

    let currentPos = { x: position.x, y: position.y };

    const handleMouseMove = (e) => {
      // 计算新位置（相对于 canvas）
      const canvas = imgRef.current?.closest('.canvas');
      if (!canvas) return;
      
      const canvasRect = canvas.getBoundingClientRect();
      const newX = e.clientX - canvasRect.left - dragOffset.x;
      const newY = e.clientY - canvasRect.top - dragOffset.y;
      
      currentPos = { x: newX, y: newY };
      setPosition(currentPos);
    };

    const handleMouseUp = () => {
      if (onDragEnd) {
        onDragEnd(id, currentPos.x, currentPos.y);
      }
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, id, position.x, position.y, onDragEnd]);

  // 计算动画样式
  const getAnimationStyle = () => {
    if (isDragging || !isAnimating) {
      return {}; // 拖拽时或没有动画时，不使用 transition
    }
    
    const distance = calculateDistance(
      prevPositionRef.current.x,
      prevPositionRef.current.y,
      position.x,
      position.y
    );
    
    const duration = calculateDurationByDistance(
      distance,
      CARD_ANIMATION.MOVE_DURATION,
      CARD_ANIMATION.MOVE_DURATION * 2
    );
    
    return {
      transition: `left ${duration}ms ${CARD_ANIMATION.MOVE_EASING}, top ${duration}ms ${CARD_ANIMATION.MOVE_EASING}`,
      transitionDelay: `${animationDelay}ms`,
    };
  };

  return (
    <img
      ref={imgRef}
      className={`${className} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isAnimating ? 'animating' : ''}`}
      src={src}
      alt={alt}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        borderRadius: className === 'opengraph-image' ? '8px' : undefined,
        objectFit: className === 'opengraph-image' ? 'cover' : undefined,
        ...getAnimationStyle(),
      }}
      onMouseDown={handleMouseDown}
      draggable={false}
    />
  );
};

