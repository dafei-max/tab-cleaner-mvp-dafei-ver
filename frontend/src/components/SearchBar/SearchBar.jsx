import React, { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { getImageUrl } from "../../shared/utils";
import { UI_CONFIG } from "../../screens/PersonalSpace/uiConfig";
import "./SearchBar.css";

/**
 * 搜索栏组件
 * 支持搜索输入、加载状态显示、清空功能
 */
export const SearchBar = ({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onClear,
  isSearching = false,
  placeholder = "What do you want to see ?",
  onPetSettingsClick, // 新增：宠物设定空间入口回调
}) => {
  const [hoveredButton, setHoveredButton] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  
  const calculateTooltipPosition = (buttonElement) => {
    if (!buttonElement) return;
    const rect = buttonElement.getBoundingClientRect();
    const placement = UI_CONFIG.searchBar.tooltip?.placement || 'top';
    const offset = UI_CONFIG.searchBar.tooltip?.offset || 8;
    
    let top, left, transform;
    
    if (placement === 'top') {
      top = rect.top - offset;
      left = rect.left + rect.width / 2;
      transform = 'translateX(-50%) translateY(-100%)';
    } else if (placement === 'bottom') {
      top = rect.bottom + offset;
      left = rect.left + rect.width / 2;
      transform = 'translateX(-50%)';
    } else if (placement === 'left') {
      top = rect.top + rect.height / 2;
      left = rect.left - offset;
      transform = 'translateX(-100%) translateY(-50%)';
    } else { // right
      top = rect.top + rect.height / 2;
      left = rect.right + offset;
      transform = 'translateY(-50%)';
    }
    
    setTooltipPosition({ top, left, transform });
  };
  
  const getTooltipStyle = () => {
    if (!hoveredButton) return { display: 'none' };
    return {
      position: 'fixed',
      top: `${tooltipPosition.top}px`,
      left: `${tooltipPosition.left}px`,
      transform: tooltipPosition.transform || 'translateX(-50%)',
      padding: '4px 8px',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      color: '#fff',
      fontSize: '11px',
      borderRadius: '4px',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 99999,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    };
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onSearch();
    } else if (e.key === 'Escape') {
      onClear();
    }
  };

  return (
    <div className="search-bar-container" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {/* 搜索栏 */}
      <motion.div 
        className={`search-bar ${isSearching ? 'searching' : ''}`}
        style={{ 
          position: 'relative', 
          display: 'flex', 
          alignItems: 'center',
          overflow: 'visible', // 确保背景图可以穿透
          "--search-bar-width": `${UI_CONFIG.searchBar.width}px`,
          "--search-bar-min-width": `${UI_CONFIG.searchBar.width}px`,
          "--search-bar-radius": `${UI_CONFIG.searchBar.borderRadius}px`,
          "--search-bar-height": `${UI_CONFIG.searchBar.height}px`,
        }}
      >
        {/* 搜索栏背景 - 穿透容器，不被裁剪 */}
        <img 
          src={getImageUrl("search-bar.png")} 
          alt="Search bar background"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) scaleY(0.85)', // 只压缩垂直方向，让它变扁
            width: `${UI_CONFIG.searchBar.width}px`, // 使用配置的宽度
            height: `${UI_CONFIG.searchBar.height}px`, // 使用配置的高度
            objectFit: 'contain', // 改为 contain，保持完整显示
            zIndex: 0,
            borderRadius: `${UI_CONFIG.searchBar.borderRadius}px`,
            opacity: 0.7, // 降低透明度，让它变淡
            pointerEvents: 'none', // 让背景图片不拦截鼠标事件，只作为视觉装饰
          }}
        />
        
        {/* 搜索按钮（左侧） */}
        <motion.button
          onClick={onSearch}
          title="执行搜索"
          style={{
            position: 'relative',
            zIndex: 1,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            marginLeft: `${UI_CONFIG.searchBar.searchButton.marginLeft}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            calculateTooltipPosition(e.currentTarget);
            setHoveredButton('search');
          }}
          onMouseLeave={() => {
            setHoveredButton(null);
            setTooltipPosition({ top: 0, left: 0 });
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("search-button.png")} 
            alt="Search button"
            style={{ 
              width: `${UI_CONFIG.searchBar.searchButton.size}px`, 
              height: `${UI_CONFIG.searchBar.searchButton.size}px`, 
              objectFit: 'contain' 
            }}
          />
          {hoveredButton === 'search' && createPortal(
            <div className="tooltip" style={getTooltipStyle()}>
              执行搜索
            </div>,
            document.body
          )}
        </motion.button>
        
        {/* 输入框 */}
        <input
          type="text"
          className="search-input"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '16px',
            fontFamily: '"SF Pro Display-Regular", Helvetica',
            color: '#000000',
            padding: `0 12px 0 ${UI_CONFIG.searchBar.inputPaddingLeft}px`,
            margin: 0,
            "--search-placeholder-color": UI_CONFIG.searchBar.placeholderColor,
          }}
        />
        {/* 搜索中提示 */}
        {isSearching && (
          <div 
            className="search-status" 
            style={{ 
              zIndex: 1,
              fontSize: `${UI_CONFIG.searchBar.statusText.fontSize}px`,
              color: UI_CONFIG.searchBar.statusText.color,
              marginRight: `${UI_CONFIG.searchBar.statusText.marginRight}px`,
            }}
          >
            搜索中...
          </div>
        )}

        {/* 提交按钮（右侧）- 使用 Send-btn.png */}
        <motion.button
          onClick={onSearch}
          title="提交搜索请求"
          style={{
            position: 'relative',
            zIndex: 1,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            marginRight: `${UI_CONFIG.searchBar.submitButton.marginRight}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: searchQuery ? 1 : 0.5, // 有输入时显示，无输入时半透明
          }}
          onMouseEnter={(e) => {
            calculateTooltipPosition(e.currentTarget);
            setHoveredButton('submit');
          }}
          onMouseLeave={() => {
            setHoveredButton(null);
            setTooltipPosition({ top: 0, left: 0 });
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          disabled={!searchQuery} // 无输入时禁用
        >
          <img 
            src={getImageUrl("Send-btn.png")} 
            alt="Submit button"
            style={{ 
              width: `${UI_CONFIG.searchBar.submitButton.size}px`, 
              height: `${UI_CONFIG.searchBar.submitButton.size}px`, 
              objectFit: 'contain' 
            }} 
          />
          {hoveredButton === 'submit' && createPortal(
            <div className="tooltip" style={getTooltipStyle()}>
              发送请求
            </div>,
            document.body
          )}
        </motion.button>
        
      </motion.div>

      {/* 大象图标入口（宠物设定空间） */}
      {onPetSettingsClick && (
        <motion.button
          onClick={onPetSettingsClick}
          title="打开宠物设定空间"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: `${UI_CONFIG.searchBar.elephantIcon.marginLeft}px`,
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            calculateTooltipPosition(e.currentTarget);
            setHoveredButton('pet');
          }}
          onMouseLeave={() => {
            setHoveredButton(null);
            setTooltipPosition({ top: 0, left: 0 });
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("icon-elephant (1).png")} 
            alt="Pet settings"
            style={{ 
              width: `${UI_CONFIG.searchBar.elephantIcon.size}px`, 
              height: `${UI_CONFIG.searchBar.elephantIcon.size}px`, 
              objectFit: 'contain' 
            }}
          />
          {hoveredButton === 'pet' && createPortal(
            <div className="tooltip" style={getTooltipStyle()}>
              宠物设定空间
            </div>,
            document.body
          )}
        </motion.button>
      )}
    </div>
  );
};




