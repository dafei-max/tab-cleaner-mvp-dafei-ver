import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MASONRY_CONFIG } from '../../config/masonryConfig';
import { getBestImageSource, handleImageError } from '../../utils/imagePlaceholder';
import { getImageUrl } from '../../shared/utils';
import { UI_CONFIG } from './uiConfig';

/**
 * 单个卡片组件（带悬浮功能）
 */
export const SessionCard = ({ 
  og, 
  isSelected, 
  onSelect, 
  onDelete, 
  onOpenLink,
  isTopResult = false,
  isSearchResult = false,
  similarity = 0,
  hasSearchResults = false,
  appearDelay = 0,
}) => {
  const [isHovered, setIsHovered] = useState(false);
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
    opacity: 1,
  };

  const handleSelect = (e) => {
    if (onSelect) {
      onSelect(og.id, e?.shiftKey);
    }
  };

  const handleCardClick = (e) => {
    // 如果点击的是按钮，不触发卡片点击
    if (e.target.closest('.card-action-button')) {
      return;
    }
    handleSelect(e);
    // 可以在这里添加双击打开链接的逻辑
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

  const handleCopyLink = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(og.url || '');
      // 可以添加一个提示，比如显示 "已复制"
      console.log('链接已复制到剪贴板');
    } catch (err) {
      console.error('复制失败:', err);
      // 降级方案：使用传统方法
      const textArea = document.createElement('textarea');
      textArea.value = og.url || '';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        console.log('链接已复制到剪贴板（降级方案）');
      } catch (err) {
        console.error('复制失败:', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleDownloadImage = async (e) => {
    e.stopPropagation();
    try {
      const imageUrl = getBestImageSource(og, 'text', fixedCardWidth, fixedCardWidth * 0.75);
      
      // 使用 fetch 获取图片
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${og.title || 'image'}_${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('图片下载成功');
    } catch (err) {
      console.error('下载失败:', err);
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

  // 计算发光效果强度（基于相似度）
  const glowIntensity = isSearchResult ? Math.min(similarity * 2, 1) : 0;
  const glowColor = `rgba(26, 115, 232, ${glowIntensity * 0.8})`; // 蓝色发光

  // 获取 favicon URL
  const getFaviconUrl = () => {
    if (og.favicon) return og.favicon;
    if (og.url) {
      try {
        const urlObj = new URL(og.url);
        return `${urlObj.protocol}//${urlObj.host}/favicon.ico`;
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  // Google favicon fallback（更高成功率）
  const getFallbackFavicon = () => {
    if (!og.url) return null;
    try {
      return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(og.url)}`;
    } catch (e) {
      return null;
    }
  };

  // 获取网页名称（优先使用 title，否则使用 site_name，最后使用 URL）
  const getPageName = () => {
    if (og.title) return og.title;
    if (og.site_name) return og.site_name;
    if (og.url) {
      try {
        const urlObj = new URL(og.url);
        return urlObj.hostname.replace('www.', '');
      } catch (e) {
        return og.url;
      }
    }
    return '未知网页';
  };

  const [faviconSrc, setFaviconSrc] = useState(() => getFaviconUrl() || getFallbackFavicon());
  const pageName = getPageName();
  
  const shouldAnimate = !(hasSearchResults && !isSearchResult);
  const baseOpacity = hasSearchResults && !isSearchResult ? 0.4 : 1;

  return (
    <div
      className={`masonry-item ${isSelected ? 'selected' : ''} ${isSearchResult ? 'search-result' : ''} ${hasSearchResults && !isSearchResult ? 'search-blur' : ''}`}
      style={{
        width: `${fixedCardWidth}px`,  // 固定像素值，fitWidth 要求
        marginBottom: `${MASONRY_CONFIG.columns.gutter}px`,  // 使用配置中的 gutter
        breakInside: 'avoid',
        position: 'relative',
        backgroundColor: '#fff',
        borderRadius: '8px',
        overflow: 'visible',
        // 搜索结果发光效果
        boxShadow: isSearchResult 
          ? `0 0 ${8 + glowIntensity * 12}px ${glowColor}, 0 0 ${4 + glowIntensity * 8}px ${glowColor}, 0 2px 8px rgba(0,0,0,0.15)`
          : '0 2px 8px rgba(0,0,0,0.15)',
        filter: hasSearchResults && !isSearchResult ? 'blur(3px)' : 'none',
        opacity: shouldAnimate ? 0 : baseOpacity,
        transition: 'all 0.3s ease',
        zIndex: isSearchResult ? 10 : 1,
        border: isSelected ? '3px solid #1a73e8' : 'none',
        animation: shouldAnimate ? `masonryFadeIn 0.6s ease forwards` : 'none',
        animationDelay: shouldAnimate ? `${appearDelay}s` : '0s',
        transform: shouldAnimate ? 'translateY(12px)' : 'none',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
    >

      {/* 灰色圆角 Header */}
      <div
        style={{
          backgroundColor: UI_CONFIG.cardHeader.background,
          padding: UI_CONFIG.cardHeader.padding,
          display: 'flex',
          alignItems: 'center',
          gap: `${UI_CONFIG.cardHeader.gap}px`,
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px',
          borderBottom: `1px solid ${UI_CONFIG.cardHeader.borderColor}`,
          minHeight: UI_CONFIG.cardHeader.height ? `${UI_CONFIG.cardHeader.height}px` : 'auto',
        }}
      >
        {/* Favicon */}
        {faviconSrc ? (
          <img
            src={faviconSrc}
            alt=""
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '2px',
              objectFit: 'contain',
              flexShrink: 0,
            }}
            onError={(e) => {
              if (e.target.dataset.fallback !== 'true') {
                const fallback = getFallbackFavicon();
                if (fallback && fallback !== faviconSrc) {
                  e.target.dataset.fallback = 'true';
                  setFaviconSrc(fallback);
                  e.target.style.display = '';
                  return;
                }
              }
              // 如果 favicon 加载失败，显示默认图标
              e.target.style.display = 'none';
              const placeholder = e.target.nextElementSibling;
              if (placeholder) {
                placeholder.style.display = 'flex';
              }
            }}
          />
        ) : null}
        {/* 默认 Favicon 占位符 */}
        <div
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '2px',
            backgroundColor: '#CCCCCC',
            display: faviconSrc ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: '10px',
            color: '#666',
            fontWeight: 'bold',
          }}
        >
          {pageName.charAt(0).toUpperCase()}
        </div>
        {/* 网页名称 */}
        <div
          style={{
            fontSize: `${UI_CONFIG.cardHeader.fontSize}px`,
            color: '#333',
            fontWeight: 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
          title={pageName}
        >
          {pageName}
        </div>
      </div>

      {/* 图片内容 */}
      <div style={{ position: 'relative' }}>
        <img
          src={getBestImageSource(og, 'text', fixedCardWidth, fixedCardWidth * 0.75)}
          alt={og.title || og.url}
          className={`opengraph-image ${isDocCard ? 'doc-card' : ''} ${isTopResult ? 'top-result' : ''} ${isSelected ? 'selected' : ''}`}
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            borderRadius: '0 0 8px 8px',
            cursor: 'pointer',
            transition: 'box-shadow 0.2s ease',
            objectFit: 'contain',
            backgroundColor: '#f5f5f5',
          }}
          onError={(e) => handleImageError(e, og, 'text')}
        />
        
        {/* 悬浮按钮（底部靠右） */}
        {isHovered && (
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              display: 'flex',
              gap: '8px',
              zIndex: 10,
              alignItems: 'center',
            }}
          >
            {/* 复制链接按钮 */}
            <motion.button
              className="card-action-button"
              onClick={handleCopyLink}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              style={{
                position: 'relative',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#F5F5F5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#87CEEB';
                setHoveredButton('copy');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F5F5F5';
                setHoveredButton(null);
              }}
            >
              <img
                src={getImageUrl('copy icon.png')}
                alt="复制链接"
                style={{ width: '14px', height: '14px', objectFit: 'contain' }}
              />
              {/* 提示文字 */}
              {hoveredButton === 'copy' && (
                <div
                  className="tooltip"
                  style={tooltipBaseStyle}
                >
                  复制链接
                </div>
              )}
            </motion.button>

            {/* 删除按钮 */}
            <motion.button
              className="card-action-button"
              onClick={handleDelete}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, delay: 0.05 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              style={{
                position: 'relative',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#F5F5F5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#87CEEB';
                setHoveredButton('delete');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F5F5F5';
                setHoveredButton(null);
              }}
            >
              <img
                src={getImageUrl('delete icon.png')}
                alt="删除此卡片"
                style={{ width: '14px', height: '14px', objectFit: 'contain' }}
              />
              {/* 提示文字 */}
              {hoveredButton === 'delete' && (
                <div
                  className="tooltip"
                  style={tooltipBaseStyle}
                >
                  删除此卡片
                </div>
              )}
            </motion.button>

            {/* 下载图片按钮 */}
            <motion.button
              className="card-action-button"
              onClick={handleDownloadImage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              style={{
                position: 'relative',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#F5F5F5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#87CEEB';
                setHoveredButton('download');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F5F5F5';
                setHoveredButton(null);
              }}
            >
              <img
                src={getImageUrl('download icon.png')}
                alt="下载此图"
                style={{ width: '14px', height: '14px', objectFit: 'contain' }}
              />
              {/* 提示文字 */}
              {hoveredButton === 'download' && (
                <div
                  className="tooltip"
                  style={tooltipBaseStyle}
                >
                  下载此图
                </div>
              )}
            </motion.button>

            {/* 打开链接按钮 */}
            <motion.button
              className="card-action-button"
              onClick={handleOpenLink}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2, delay: 0.15 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              style={{
                position: 'relative',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: '#F5F5F5',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#87CEEB';
                setHoveredButton('redirect');
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F5F5F5';
                setHoveredButton(null);
              }}
            >
              <img
                src={getImageUrl('Redirect.png')}
                alt="打开链接"
                style={{ width: '14px', height: '14px', objectFit: 'contain' }}
              />
              {/* 提示文字 */}
              {hoveredButton === 'redirect' && (
                <div
                  className="tooltip"
                  style={tooltipBaseStyle}
                >
                  打开链接
                </div>
              )}
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
};

