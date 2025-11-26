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

  // 分离选中的和未选中的宠物
  const selectedPetData = selectedPet ? petOptions.find(p => p.id === selectedPet) : null;
  const unselectedPets = petOptions.filter(p => p.id !== selectedPet);

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
            transform: `translate(-50%, calc(-50% + ${UI_CONFIG.petSetting.petSelection.offsetY}px))`,
          }}
        >
          {/* 三个宠物选项：选中的在中间（大），未选中的在两侧（小） */}
          <div className="pet-options-layout">
            {/* 左侧未选中的宠物 */}
            {unselectedPets.length > 0 && (
              <motion.div
                className="pet-option-card pet-option-left"
                onClick={() => handlePetSelect(unselectedPets[0].id)}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  width: `${UI_CONFIG.petSetting.bubble.unselectedSize}px`,
                  height: `${UI_CONFIG.petSetting.bubble.unselectedSize}px`,
                }}
              >
                <div 
                  className="pet-option-bubble"
                >
                  <img 
                    className="pet-option-image" 
                    alt={unselectedPets[0].name} 
                    src={getImageUrl(unselectedPets[0].image)} 
                  />
                </div>
                {/* 未选中按钮 */}
                <img 
                  src={getImageUrl("unchosen-btn.svg")} 
                  alt="Unchosen" 
                  className="pet-status-button"
                  style={{
                    width: `${UI_CONFIG.petSetting.statusButton.unchosenWidth}px`,
                    height: `${UI_CONFIG.petSetting.statusButton.unchosenHeight}px`,
                  }}
                />
              </motion.div>
            )}

            {/* 中间选中的宠物（最大） */}
            {selectedPetData ? (
              <motion.div
                className="pet-option-card pet-option-center selected"
                onClick={() => handlePetSelect(selectedPetData.id)}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  width: `${UI_CONFIG.petSetting.bubble.selectedSize}px`,
                  height: `${UI_CONFIG.petSetting.bubble.selectedSize}px`,
                }}
              >
                <div 
                  className="pet-option-bubble"
                >
                  <img 
                    className="pet-option-image" 
                    alt={selectedPetData.name} 
                    src={getImageUrl(selectedPetData.image)} 
                  />
                </div>
                {/* 选中按钮 */}
                <img 
                  src={getImageUrl("chosen.svg")} 
                  alt="Chosen" 
                  className="pet-status-button"
                  style={{
                    width: `${UI_CONFIG.petSetting.statusButton.chosenWidth}px`,
                    height: `${UI_CONFIG.petSetting.statusButton.chosenHeight}px`,
                  }}
                />
              </motion.div>
            ) : (
              // 如果没有选中，显示第一个宠物在中间
              <motion.div
                className="pet-option-card pet-option-center"
                onClick={() => handlePetSelect(petOptions[0].id)}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  width: `${UI_CONFIG.petSetting.bubble.selectedSize}px`,
                  height: `${UI_CONFIG.petSetting.bubble.selectedSize}px`,
                }}
              >
                <div 
                  className="pet-option-bubble"
                >
                  <img 
                    className="pet-option-image" 
                    alt={petOptions[0].name} 
                    src={getImageUrl(petOptions[0].image)} 
                  />
                </div>
                {/* 未选中按钮 */}
                <img 
                  src={getImageUrl("unchosen-btn.svg")} 
                  alt="Unchosen" 
                  className="pet-status-button"
                  style={{
                    width: `${UI_CONFIG.petSetting.statusButton.unchosenWidth}px`,
                    height: `${UI_CONFIG.petSetting.statusButton.unchosenHeight}px`,
                  }}
                />
              </motion.div>
            )}

            {/* 右侧未选中的宠物 */}
            {unselectedPets.length > 1 && (
              <motion.div
                className="pet-option-card pet-option-right"
                onClick={() => handlePetSelect(unselectedPets[1].id)}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{
                  width: `${UI_CONFIG.petSetting.bubble.unselectedSize}px`,
                  height: `${UI_CONFIG.petSetting.bubble.unselectedSize}px`,
                }}
              >
                <div 
                  className="pet-option-bubble"
                >
                  <img 
                    className="pet-option-image" 
                    alt={unselectedPets[1].name} 
                    src={getImageUrl(unselectedPets[1].image)} 
                  />
                </div>
                {/* 未选中按钮 */}
                <img 
                  src={getImageUrl("unchosen-btn.svg")} 
                  alt="Unchosen" 
                  className="pet-status-button"
                  style={{
                    width: `${UI_CONFIG.petSetting.statusButton.unchosenWidth}px`,
                    height: `${UI_CONFIG.petSetting.statusButton.unchosenHeight}px`,
                  }}
                />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
