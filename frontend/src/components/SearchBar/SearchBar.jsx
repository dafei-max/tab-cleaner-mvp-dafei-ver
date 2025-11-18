import React, { useState } from "react";
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
  placeholder = "请输入搜索内容...",
}) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onSearch();
    } else if (e.key === 'Escape') {
      onClear();
    }
  };

  return (
    <div className="search-bar">
      <img className="image-12" alt="Search icon" src={getImageUrl("5.svg")} />
      
      <input
        type="text"
        className="search-input"
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: '16px',
          fontFamily: '"SF Pro Display-Regular", Helvetica',
          color: '#000000',
        }}
      />
      
      {isSearching && (
        <div style={{ fontSize: '12px', color: '#666', marginRight: '8px' }}>
          搜索中...
        </div>
      )}
      
      {searchQuery && (
        <button
          onClick={onClear}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: '12px',
            color: '#666',
          }}
          title="清空搜索"
        >
          ✕
        </button>
      )}
    </div>
  );
};



