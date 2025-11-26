import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { getImageUrl } from '../../shared/utils';
import './PetDisplay.css';

/**
 * 宠物显示组件
 * 功能：
 * 1. 悬浮态显示
 * 2. 鼠标悬停时外边缘发呼吸白光
 * 3. 自动在视口内游走
 * 4. 可拖拽到任意位置
 */
export const PetDisplay = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const petRef = useRef(null);
  const walkIntervalRef = useRef(null);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const xSpring = useSpring(x, { damping: 20, stiffness: 100 });
  const ySpring = useSpring(y, { damping: 20, stiffness: 100 });

  // 初始化位置：右下角
  useEffect(() => {
    const initialX = window.innerWidth - 160; // 120px width + 40px margin
    const initialY = window.innerHeight - 160; // 120px height + 40px margin
    setPosition({ x: initialX, y: initialY });
    x.set(initialX);
    y.set(initialY);
  }, [x, y]);

  // 自动游走功能
  useEffect(() => {
    if (isDragging) return; // 拖拽时停止自动游走

    const moveToRandomPosition = () => {
      if (!petRef.current) return;
      
      const petWidth = 120;
      const petHeight = 120;
      const margin = 40;
      
      // 计算可移动范围（视口内）
      const maxX = window.innerWidth - petWidth - margin;
      const minX = margin;
      const maxY = window.innerHeight - petHeight - margin;
      const minY = margin;
      
      // 生成随机目标位置
      const randomX = Math.random() * (maxX - minX) + minX;
      const randomY = Math.random() * (maxY - minY) + minY;
      
      x.set(randomX);
      y.set(randomY);
      setPosition({ x: randomX, y: randomY });
    };

    // 初始延迟后开始游走
    const initialDelay = setTimeout(() => {
      moveToRandomPosition();
      
      // 每 3-6 秒随机游走一次
      walkIntervalRef.current = setInterval(() => {
        moveToRandomPosition();
      }, 3000 + Math.random() * 3000);
    }, 2000);

    return () => {
      clearTimeout(initialDelay);
      if (walkIntervalRef.current) {
        clearInterval(walkIntervalRef.current);
      }
    };
  }, [isDragging, x, y]);

  // 处理拖拽
  const handleDragStart = () => {
    setIsDragging(true);
    if (walkIntervalRef.current) {
      clearInterval(walkIntervalRef.current);
    }
  };

  const handleDrag = (event, info) => {
    const newX = position.x + info.delta.x;
    const newY = position.y + info.delta.y;
    
    // 限制在视口内
    const petWidth = 120;
    const petHeight = 120;
    const margin = 40;
    
    const constrainedX = Math.max(margin, Math.min(window.innerWidth - petWidth - margin, newX));
    const constrainedY = Math.max(margin, Math.min(window.innerHeight - petHeight - margin, newY));
    
    setPosition({ x: constrainedX, y: constrainedY });
    x.set(constrainedX);
    y.set(constrainedY);
  };

  const handleDragEnd = (event, info) => {
    const newX = position.x + info.delta.x;
    const newY = position.y + info.delta.y;
    
    // 限制在视口内
    const petWidth = 120;
    const petHeight = 120;
    const margin = 40;
    
    const constrainedX = Math.max(margin, Math.min(window.innerWidth - petWidth - margin, newX));
    const constrainedY = Math.max(margin, Math.min(window.innerHeight - petHeight - margin, newY));
    
    setPosition({ x: constrainedX, y: constrainedY });
    x.set(constrainedX);
    y.set(constrainedY);
    
    // 延迟后恢复自动游走
    setTimeout(() => {
      setIsDragging(false);
    }, 1000);
  };

  return (
    <motion.div
      ref={petRef}
      className={`pet-display ${isHovered ? 'hovered' : ''}`}
      style={{
        position: 'fixed',
        left: xSpring,
        top: ySpring,
        width: '120px',
        height: '120px',
        zIndex: 1000,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      drag
      dragMomentum={false}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <div className="pet-glow" />
      <img 
        src={getImageUrl("pet (1).svg")} 
        alt="Pet"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  );
};

