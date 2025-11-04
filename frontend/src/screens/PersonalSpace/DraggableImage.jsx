import React, { useState, useRef, useEffect } from "react";

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
  isSelected,
  onSelect,
  onDragEnd,
}) => {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);

  // 当 initialX 或 initialY 改变时（从父组件更新），同步位置
  useEffect(() => {
    if (!isDragging) {
      setPosition({ x: initialX, y: initialY });
    }
  }, [initialX, initialY, isDragging]);

  // 鼠标按下
  const handleMouseDown = (e) => {
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

  return (
    <img
      ref={imgRef}
      className={`${className} ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
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
      }}
      onMouseDown={handleMouseDown}
      draggable={false}
    />
  );
};

