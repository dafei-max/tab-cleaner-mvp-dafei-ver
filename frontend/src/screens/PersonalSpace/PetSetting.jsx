import React from "react";
import { getImageUrl } from "../../shared/utils";
import "./PetSetting.css";

/**
 * 宠物设定页组件
 * 参考 AnimaPackage-React-VUyCe 的实现
 */
export const PetSetting = ({ onBackToHome }) => {
  return (
    <div className="pet-setting">
      <div className="pet-setting-background" />
      
      {/* 宠物选择区域 */}
      <div className="pet-selection-area">
        {/* 这里可以添加宠物选择逻辑 */}
        <div className="pet-options">
          {/* 宠物选项卡片 */}
          <div className="pet-option-card">
            <img 
              className="pet-option-image" 
              alt="Pet option" 
              src={getImageUrl("pet (1).svg")} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

