import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getImageUrl } from "../../shared/utils";
import { UI_CONFIG } from "./uiConfig";
import "./PetSetting.css";

/**
 * 宠物设定页组件
 * 主要功能：桌宠切换
 */
export const PetSetting = ({ onBackToHome }) => {
  // 默认选中小象
  const [selectedPet, setSelectedPet] = useState('elephant');

  // 宠物选项列表
  const petOptions = [
    { id: 'turtle', name: '乌龟', image: 'turtle.svg' },
    { id: 'elephant', name: '大象', image: 'elephant.svg' },
    { id: 'squirrel', name: '松鼠', image: 'squrrial.svg' },
  ];

  // 加载字体
  useEffect(() => {
    const fontFace = new FontFace(
      'FZLanTingYuanS',
      `url('${getImageUrl('方正可变兰亭黑 GBK.TTF')}')`
    );
    fontFace.load().then((loadedFont) => {
      document.fonts.add(loadedFont);
    }).catch((error) => {
      console.warn('[PetSetting] Font loading failed:', error);
    });
  }, []);

  const handlePetSelect = (petId) => {
    setSelectedPet(petId);
    // 保存到 chrome.storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ selectedPet: petId }, () => {
        console.log('[PetSetting] Pet saved to storage:', petId);
        // 触发自定义事件，通知 PetDisplay 更新
        window.dispatchEvent(new CustomEvent('petChanged', { detail: { petId } }));
      });
    }
  };

  // 从 storage 加载选中的宠物
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['selectedPet'], (result) => {
        if (result.selectedPet) {
          setSelectedPet(result.selectedPet);
        }
      });
    }
  }, []);

  // 获取当前选中项的索引
  const selectedIndex = petOptions.findIndex(p => p.id === selectedPet);
  const currentSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  
  // 计算每个宠物的位置和样式（参考 CircleCarousel 逻辑）
  const getPetStyle = (index) => {
    // 计算相对于选中项的位置
    let relativePosition = index - currentSelectedIndex;
    
    // 处理循环：如果距离超过数组长度的一半，说明从另一边绕更近
    if (relativePosition > petOptions.length / 2) {
      relativePosition -= petOptions.length;
    } else if (relativePosition < -petOptions.length / 2) {
      relativePosition += petOptions.length;
    }
    
    const isSelected = index === currentSelectedIndex;
    const gap = UI_CONFIG.petSetting.petSelection.gap; // 从配置中读取间距（边缘到边缘的间距）
    const selectedSize = UI_CONFIG.petSetting.bubble.selectedSize;
    const unselectedSize = UI_CONFIG.petSetting.bubble.unselectedSize;
    
    // 计算中心点之间的间距，考虑左右宠物大小差异
    // 间距 = 边缘间距 + 选中宠物半径 + 未选中宠物半径
    // 左右对称，所以计算方式相同
    const centerGap = relativePosition === 0 
      ? 0 
      : gap + (selectedSize / 2) + (unselectedSize / 2);
    
    const translateX = relativePosition * centerGap;
    
    return {
      translateX, // 直接返回数值，用于 framer-motion
      scale: isSelected ? 1 : 0.7,
      opacity: isSelected ? 1 : 0.6,
      zIndex: isSelected ? 10 : 1,
    };
  };

  return (
    <div className="pet-setting">
      {/* 背景模糊层 */}
      <div className="pet-setting-rectangle" />

      {/* 主要内容区域 */}
      <div className="pet-setting-content">
        {/* 主要按钮：选一只陪伴你的小宠物吧 - 使用 bar-pet.svg */}
        <motion.div
          className="pet-choose-button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          style={{
            width: `${UI_CONFIG.petSetting.bar.width}px`,
            height: `${UI_CONFIG.petSetting.bar.height}px`,
            transform: `translate(-50%, calc(-50% + ${UI_CONFIG.petSetting.bar.offsetY}px))`,
          }}
        >
          <img 
            src={getImageUrl("bar-pet.svg")} 
            alt="Bar background" 
            className="pet-choose-button-bg"
          />
        </motion.div>

        {/* 英文说明文字 */}
        <motion.div
          className="pet-description"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          style={{ 
            transform: `translate(-50%, calc(-50% + ${UI_CONFIG.petSetting.description.offsetY}px))`,
          }}
        >
          <p>choose a little pet to accompany you</p>
          <p>in cleaning up the tab bar of your web page</p>
        </motion.div>

        {/* 宠物选择卡片区域 - 直接显示 */}
        <div 
          className="pet-selection-container"
          style={{
            transform: `translate(calc(-50% + ${UI_CONFIG.petSetting.petSelection.offsetX}px), calc(-50% + ${UI_CONFIG.petSetting.petSelection.offsetY}px))`,
          }}
        >
          {/* 三个宠物选项：选中的在中间（大），未选中的在两侧（小） */}
          <div className="pet-options-layout" style={{ 
            position: 'relative', 
            width: '600px', // 固定宽度，确保居中
            height: '400px', 
            margin: '0 auto', // 水平居中
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center' 
          }}>
            {/* 渲染所有宠物，使用绝对定位和 translateX 实现轮播效果 */}
            {petOptions.map((pet, index) => {
              const isSelected = index === currentSelectedIndex;
              const petStyle = getPetStyle(index);
              
              return (
                <motion.div
                  key={pet.id}
                  className={`pet-option-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => handlePetSelect(pet.id)}
                  initial={false}
                  animate={{
                    x: petStyle.translateX, // 相对于中心的水平偏移（像素值）
                    y: 0, // 垂直居中
                    scale: petStyle.scale,
                    opacity: petStyle.opacity,
                    zIndex: petStyle.zIndex,
                  }}
                  transition={{ 
                    duration: 0.5,
                    ease: [0.34, 1.56, 0.64, 1], // cubic-bezier 缓动函数，带弹性效果
                  }}
                  whileHover={{ scale: isSelected ? 1.05 : 0.75 }}
                  whileTap={{ scale: isSelected ? 0.95 : 0.65 }}
                  style={{
                    position: 'absolute',
                    width: isSelected 
                      ? `${UI_CONFIG.petSetting.bubble.selectedSize}px`
                      : `${UI_CONFIG.petSetting.bubble.unselectedSize}px`,
                    height: isSelected 
                      ? `${UI_CONFIG.petSetting.bubble.selectedSize}px`
                      : `${UI_CONFIG.petSetting.bubble.unselectedSize}px`,
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)', // CSS 初始居中
                    transformOrigin: 'center center', // 确保缩放从中心开始
                  }}
                >
                  <div className="pet-option-bubble">
                    <img 
                      className="pet-option-image" 
                      alt={pet.name} 
                      src={getImageUrl(pet.image)} 
                    />
                  </div>
                  {/* 选中/未选中按钮 */}
                  <img 
                    src={getImageUrl(isSelected ? "chosen.svg" : "unchosen-btn.svg")} 
                    alt={isSelected ? "Chosen" : "Unchosen"} 
                    className="pet-status-button"
                    style={{
                      width: isSelected 
                        ? `${UI_CONFIG.petSetting.statusButton.chosenWidth}px`
                        : `${UI_CONFIG.petSetting.statusButton.unchosenWidth}px`,
                      height: isSelected 
                        ? `${UI_CONFIG.petSetting.statusButton.chosenHeight}px`
                        : `${UI_CONFIG.petSetting.statusButton.unchosenHeight}px`,
                    }}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
