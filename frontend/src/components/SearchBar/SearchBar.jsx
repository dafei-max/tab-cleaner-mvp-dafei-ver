import React, { useState } from "react";
import { motion } from "framer-motion";
import { getImageUrl } from "../../shared/utils";
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
      <div className="search-bar" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {/* 搜索栏背景 */}
        <img 
          src={getImageUrl("search-bar.png")} 
          alt="Search bar background"
          style={{
            position: 'absolute',
            width: '100%',
            height: '85%',
            objectFit: 'cover',
            zIndex: 0,
          }}
        />
        
        {/* 搜索按钮（左侧） */}
        <motion.button
          onClick={onSearch}
          style={{
            position: 'relative',
            zIndex: 1,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            marginLeft: '-30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("search-button.png")} 
            alt="Search button"
            style={{ width: '96px', height: '96px', objectFit: 'contain' }}
          />
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
            padding: '0 12px',
            margin: 0,
          }}
        />
        
        {/* 提交按钮（右侧） */}
        {searchQuery && (
          <motion.button
            onClick={onSearch}
            style={{
              position: 'relative',
              zIndex: 1,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: 0,
              marginRight: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <img 
              src={getImageUrl("search-submit-button.png")} 
              alt="Submit button"
              style={{ width: '40px', height: '40px', objectFit: 'contain' }}
            />
          </motion.button>
        )}
        
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
      </div>

      {/* 大象图标入口（宠物设定空间） */}
      {onPetSettingsClick && (
        <motion.button
          onClick={onPetSettingsClick}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          title="宠物设定空间"
        >
          <img 
            src={getImageUrl("icon-elephant (1).png")} 
            alt="Pet settings"
            style={{ width: '96px', height: '96px', objectFit: 'contain' }}
          />
        </motion.button>
      )}
    </div>
  );
};




