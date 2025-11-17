import React, { useState } from 'react';
import { MASONRY_CONFIG } from '../../config/masonryConfig';

/**
 * 获取占位符图片（仅在 opengraph 图片不存在时使用）
 * 优先级：screenshot > favicon > 纯色占位符
 */
const getPlaceholderImage = (og) => {
  // 注意：这个函数只在 og.image 不存在或加载失败时调用
  // 1. 尝试使用截图
  if (og.screenshot) {
    return og.screenshot;
  }
  
  // 2. 尝试使用 favicon（如果数据中有）
  if (og.favicon) {
    return og.favicon;
  }
  
  // 3. 尝试从 URL 生成 favicon
  if (og.url) {
    try {
      const urlObj = new URL(og.url);
      const faviconUrl = `${urlObj.protocol}//${urlObj.host}/favicon.ico`;
      return faviconUrl;
    } catch (e) {
      // URL 解析失败，继续下一步
    }
  }
  
  // 4. 使用纯色占位符（根据 URL 生成一个稳定的颜色）
  const color = getColorFromUrl(og.url || 'default');
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="150">
      <rect width="200" height="150" fill="${color}"/>
      <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="Arial" font-size="14" fill="white">
        ${(og.title || 'No Image').substring(0, 20)}
      </text>
    </svg>
  `)}`;
};

/**
 * 根据 URL 生成一个稳定的颜色
 */
const getColorFromUrl = (url) => {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = url.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
};

/**
 * 单个卡片组件（带悬浮功能）
 */
export const SessionCard = ({ 
  og, 
  isSelected, 
  onSelect, 
  onDelete, 
  onOpenLink,
  isTopResult = false 
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const handleCardClick = (e) => {
    // 如果点击的是按钮，不触发卡片点击
    if (e.target.closest('.card-action-button')) {
      return;
    }
    // 可以在这里添加双击打开链接的逻辑
  };

  const handleSelect = (e) => {
    e.stopPropagation();
    if (onSelect) {
      onSelect(og.id);
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(og.id);
    }
  };

  const handleOpenLink = (e) => {
    e.stopPropagation();
    if (onOpenLink) {
      onOpenLink(og.url);
    }
  };

  const isDocCard = og.is_doc_card || false;
  const BASE_HEIGHT = 120;
  let cardWidth, cardHeight;

  if (isDocCard) {
    cardWidth = 200;
    cardHeight = 150;
  } else {
    if (og.image_width && og.image_height) {
      const aspectRatio = og.image_width / og.image_height;
      cardHeight = BASE_HEIGHT;
      cardWidth = BASE_HEIGHT * aspectRatio;
    } else if (og.original_width && og.original_height) {
      const aspectRatio = og.original_width / og.original_height;
      cardHeight = BASE_HEIGHT;
      cardWidth = BASE_HEIGHT * aspectRatio;
    } else if (og.width && og.height) {
      const aspectRatio = og.width / og.height;
      cardHeight = BASE_HEIGHT;
      cardWidth = BASE_HEIGHT * aspectRatio;
    } else {
      cardHeight = BASE_HEIGHT;
      cardWidth = BASE_HEIGHT * (16/9);
    }
  }

  // 使用配置中的固定宽度（Pinterest 风格：固定宽度，fitWidth 要求）
  // 注意：不再使用动态计算的 displayWidth，而是使用配置中的固定 cardWidth
  // 这样可以确保 fitWidth 正常工作
  const fixedCardWidth = MASONRY_CONFIG.columns.getColumnWidth();

  return (
    <div
      className={`masonry-item ${isSelected ? 'selected' : ''}`}
      style={{
        width: `${fixedCardWidth}px`,  // 固定像素值，fitWidth 要求
        marginBottom: `${MASONRY_CONFIG.columns.gutter}px`,  // 使用配置中的 gutter
        breakInside: 'avoid',
        position: 'relative',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
    >
      <div style={{ position: 'relative' }}>
        <img
          src={og.image || getPlaceholderImage(og)}
          alt={og.title || og.url}
          className={`opengraph-image ${isDocCard ? 'doc-card' : ''} ${isTopResult ? 'top-result' : ''} ${isSelected ? 'selected' : ''}`}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: '8px',
            boxShadow: isSelected 
              ? '0 0 0 3px #1a73e8, 0 2px 8px rgba(0,0,0,0.15)' 
              : '0 2px 8px rgba(0,0,0,0.15)',
            cursor: 'pointer',
            transition: 'box-shadow 0.2s ease',
            objectFit: 'contain',
            backgroundColor: '#f5f5f5',
          }}
          onError={(e) => {
            // 图片加载失败时，使用占位符（只有 opengraph 图片失败时才用 favicon 等占位）
            const placeholder = getPlaceholderImage(og);
            if (e.target.src !== placeholder) {
              e.target.src = placeholder;
            }
          }}
        />
        
        {/* 悬浮按钮（底部左侧） */}
        {isHovered && (
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '8px',
              display: 'flex',
              gap: '8px',
              zIndex: 10,
            }}
          >
            {/* 删除按钮 */}
            <button
              className="card-action-button"
              onClick={handleDelete}
              title="删除"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(220, 53, 69, 0.9)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>

            {/* 打开链接按钮 */}
            <button
              className="card-action-button"
              onClick={handleOpenLink}
              title="打开链接"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(26, 115, 232, 0.9)'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 4L12 10M12 4V10H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {/* 单选按钮 */}
            <button
              className="card-action-button"
              onClick={handleSelect}
              title="选择（批量操作）"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: isSelected ? 'rgba(26, 115, 232, 0.9)' : 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.target.style.backgroundColor = 'rgba(26, 115, 232, 0.9)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.target.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                }
              }}
            >
              {isSelected ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 8L6 11L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="3" width="10" height="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

