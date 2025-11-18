import React from "react";
import "./style.css";

export const ViewButtons = ({ viewMode, onViewModeChange }) => {
  return (
    <div className="view-buttons">
      {/* 网格视图按钮（GridCollection） */}
      <button
        className={`view-button ${viewMode === 'masonry' ? 'active' : ''}`}
        onClick={() => onViewModeChange('masonry')}
        title="网格视图"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '8px',
          border: 'none',
          background: viewMode === 'masonry' ? '#000' : '#979797',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '23px',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 3H10V10H3V3Z" fill="white"/>
          <path d="M14 3H21V10H14V3Z" fill="white"/>
          <path d="M3 14H10V21H3V14Z" fill="white"/>
          <path d="M14 14H21V21H14V14Z" fill="white"/>
        </svg>
      </button>

      {/* 聚类视图按钮 */}
      <button
        className="view-button"
        onClick={() => onViewModeChange('radial')}
        title="聚类视图"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '8px',
          border: 'none',
          background: viewMode === 'radial' ? '#000' : '#979797',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '23px',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="2" fill="white"/>
          <circle cx="6" cy="8" r="1.5" fill="white"/>
          <circle cx="18" cy="8" r="1.5" fill="white"/>
          <circle cx="6" cy="16" r="1.5" fill="white"/>
          <circle cx="18" cy="16" r="1.5" fill="white"/>
          <circle cx="8" cy="12" r="1.5" fill="white"/>
          <circle cx="16" cy="12" r="1.5" fill="white"/>
          <circle cx="12" cy="6" r="1.5" fill="white"/>
          <circle cx="12" cy="18" r="1.5" fill="white"/>
        </svg>
      </button>

      {/* 历史视图按钮（暂未实现） */}
      <button
        className="view-button"
        onClick={() => {}}
        title="历史视图"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '8px',
          border: 'none',
          background: '#979797',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2" fill="none"/>
          <path d="M12 8V12L15 15" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
};



