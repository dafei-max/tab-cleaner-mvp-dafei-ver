import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { getImageUrl } from '../../shared/utils';
import './PetDisplay.css';

// 宠物选项映射
const PET_IMAGES = {
  turtle: 'turtle.svg',
  elephant: 'elephant.svg',
  squirrel: 'squrrial.svg',
};

/**
 * 宠物显示组件
 * 功能：
 * 1. 悬浮态显示
 * 2. 鼠标悬停时外边缘发呼吸白光
 * 3. 固定在右下角（不自动移动）
 * 4. 可拖拽到任意位置
 */
export const PetDisplay = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedPet, setSelectedPet] = useState('elephant'); // 默认小象
  const petRef = useRef(null);
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const xSpring = useSpring(x, { damping: 20, stiffness: 100 });
  const ySpring = useSpring(y, { damping: 20, stiffness: 100 });

  // 从 storage 加载选中的宠物
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['selectedPet'], (result) => {
        if (result.selectedPet && PET_IMAGES[result.selectedPet]) {
          setSelectedPet(result.selectedPet);
        }
      });
    }

    // 监听宠物切换事件
    const handlePetChange = (event) => {
      const { petId } = event.detail;
      if (PET_IMAGES[petId]) {
        setSelectedPet(petId);
      }
    };

    window.addEventListener('petChanged', handlePetChange);
    return () => {
      window.removeEventListener('petChanged', handlePetChange);
    };
  }, []);

  // 初始化位置：右下角
  useEffect(() => {
    const petWidth = 120;
    const petHeight = 120;
    const margin = 40;
    const initialX = window.innerWidth - petWidth - margin;
    const initialY = window.innerHeight - petHeight - margin;
    setPosition({ x: initialX, y: initialY });
    x.set(initialX);
    y.set(initialY);
  }, [x, y]);

  // 处理拖拽
  const handleDragStart = () => {
    setIsDragging(true);
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
    
    setIsDragging(false);
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
      <motion.img 
        key={selectedPet} // 使用 key 触发重新渲染和动画
        src={getImageUrl(PET_IMAGES[selectedPet] || PET_IMAGES.elephant)} 
        alt="Pet"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
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

