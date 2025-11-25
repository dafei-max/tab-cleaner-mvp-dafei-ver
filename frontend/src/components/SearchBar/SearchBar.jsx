import React, { useState } from "react";
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

  const tooltipBaseStyle = {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: 'translateX(-50%)',
    marginBottom: '6px',
    padding: '3px 6px',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    color: '#fff',
    fontSize: '10px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 20000,
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
          "--search-bar-width": `${UI_CONFIG.searchBar.width}px`,
          "--search-bar-min-width": `${UI_CONFIG.searchBar.width}px`,
          "--search-bar-radius": `${UI_CONFIG.searchBar.borderRadius}px`,
          "--search-bar-height": `${UI_CONFIG.searchBar.height}px`,
        }}
      >
        {/* 搜索栏背景 */}
        <img 
          src={getImageUrl("search-bar.png")} 
          alt="Search bar background"
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0,
            borderRadius: 'inherit',
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
          onMouseEnter={() => setHoveredButton('search')}
          onMouseLeave={() => setHoveredButton(null)}
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
          {hoveredButton === 'search' && (
            <div className="tooltip" style={tooltipBaseStyle}>
              执行搜索
            </div>
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
          onMouseEnter={() => setHoveredButton('submit')}
          onMouseLeave={() => setHoveredButton(null)}
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
          {hoveredButton === 'submit' && (
            <div className="tooltip" style={tooltipBaseStyle}>
              发送请求
            </div>
          )}
        </motion.button>
        
        {isSearching && (
          <div style={{ 
            position: 'relative',
            zIndex: 1,
            fontSize: '12px', 
            color: '#666', 
            marginRight: '12px' 
          }}>
            搜索中...
          </div>
        )}
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
          onMouseEnter={() => setHoveredButton('pet')}
          onMouseLeave={() => setHoveredButton(null)}
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
          {hoveredButton === 'pet' && (
            <div className="tooltip" style={tooltipBaseStyle}>
              宠物设定空间
            </div>
          )}
        </motion.button>
      )}
    </div>
  );
};




