import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CARD_ANIMATION, calculateDistance, calculateDurationByDistance } from '../../motion';
import { getBestImageSource, handleImageError } from '../../utils/imagePlaceholder';
import { getImageUrl } from '../../shared/utils';
import { UI_CONFIG } from './uiConfig';

/**
 * 聚类视图卡片组件（统一样式和功能）
 * 结合了 SessionCard 的样式和 DraggableImage 的拖拽功能
 */
export const RadialCard = ({
  og,
  initialX,
  initialY,
  width,
  height,
  animationDelay = 0,
  isSelected,
  onSelect,
  onDelete,
  onOpenLink,
  onDragEnd,
  onClick,
  zoom = 1,
  pan = { x: 0, y: 0 },
  isTopResult = false,
  isSearchResult = false,
  similarity = 0,
  hasSearchResults = false,
}) => {
  const [position, setPosition] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
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
  };
  const [imageSrc, setImageSrc] = useState(getBestImageSource(og, 'initials', width, height));
  const [faviconSrc, setFaviconSrc] = useState(null);
  const prevPositionRef = useRef({ x: initialX, y: initialY });
  const cardRef = useRef(null);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);

  const isDocCard = og.is_doc_card || false;

  // 当 og、width 或 height 改变时，更新图片源
  useEffect(() => {
    setImageSrc(getBestImageSource(og, 'initials', width, height));
  }, [og, width, height]);

  useEffect(() => {
    setFaviconSrc(getFaviconUrl() || getFallbackFavicon());
  }, [og]);

  // 当 initialX 或 initialY 改变时，同步位置并触发动画
  useEffect(() => {
    if (!isDragging) {
      const prevX = prevPositionRef.current.x;
      const prevY = prevPositionRef.current.y;
      
      if (prevX !== initialX || prevY !== initialY) {
        const distance = calculateDistance(prevX, prevY, initialX, initialY);
        
        if (distance > 5) {
          setIsAnimating(true);
          setPosition({ x: initialX, y: initialY });
          
          const duration = calculateDurationByDistance(
            distance,
            CARD_ANIMATION.MOVE_DURATION,
            CARD_ANIMATION.MOVE_DURATION * 2
          );
          
          const timer = setTimeout(() => {
            setIsAnimating(false);
          }, duration);
          
          prevPositionRef.current = { x: initialX, y: initialY };
          return () => clearTimeout(timer);
        } else {
          setPosition({ x: initialX, y: initialY });
          prevPositionRef.current = { x: initialX, y: initialY };
        }
      }
    }
  }, [initialX, initialY, isDragging]);

  // 鼠标按下处理拖拽
  const handleMouseDown = (e) => {
    const canvas = cardRef.current?.closest('.canvas');
    if (canvas && canvas.style.cursor !== 'default') {
      return;
    }
    
    if (e.button !== 0) return;
    if (e.target.closest('.card-action-button')) {
      return; // 如果点击的是按钮，不处理拖拽
    }
    
    if (onSelect) {
      onSelect(og.id, e.shiftKey);
    }

    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    hasMovedRef.current = false;

    const rect = cardRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    setDragOffset({ x: offsetX, y: offsetY });
    setIsDragging(true);
    e.preventDefault();
    e.stopPropagation();
  };

  // 鼠标移动处理拖拽
  useEffect(() => {
    if (!isDragging) return;

    let currentPos = { x: position.x, y: position.y };

    const handleMouseMove = (e) => {
      const moveDistance = Math.sqrt(
        Math.pow(e.clientX - dragStartPosRef.current.x, 2) +
        Math.pow(e.clientY - dragStartPosRef.current.y, 2)
      );
      
      if (moveDistance > 5) {
        hasMovedRef.current = true;
      }
      
      const canvas = cardRef.current?.closest('.canvas');
      if (!canvas) return;
      
      const canvasRect = canvas.getBoundingClientRect();
      const canvasCenterX = canvasRect.left + canvasRect.width / 2;
      const canvasCenterY = canvasRect.top + canvasRect.height / 2;
      
      const screenOffsetX = e.clientX - canvasCenterX;
      const screenOffsetY = e.clientY - canvasCenterY;
      
      const canvasOffsetX = screenOffsetX / zoom;
      const canvasOffsetY = screenOffsetY / zoom;
      
      const canvasCenterInCanvas = { 
        x: 720 + pan.x, 
        y: 512 + pan.y 
      };
      
      const mouseXInCanvas = canvasCenterInCanvas.x + canvasOffsetX;
      const mouseYInCanvas = canvasCenterInCanvas.y + canvasOffsetY;
      
      const dragOffsetInCanvas = {
        x: dragOffset.x / zoom,
        y: dragOffset.y / zoom
      };
      
      const newX = mouseXInCanvas - dragOffsetInCanvas.x;
      const newY = mouseYInCanvas - dragOffsetInCanvas.y;
      
      currentPos = { x: newX, y: newY };
      setPosition(currentPos);
    };

    const handleMouseUp = () => {
      if (!hasMovedRef.current && onClick) {
        onClick();
      }
      
      if (hasMovedRef.current && onDragEnd) {
        onDragEnd(og.id, currentPos.x, currentPos.y);
      }
      
      setIsDragging(false);
      hasMovedRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, og.id, position.x, position.y, onDragEnd, zoom, pan, onClick]);

  // 计算动画样式
  const getAnimationStyle = () => {
    if (isDragging || !isAnimating) {
      return {};
    }
    
    const distance = calculateDistance(
      prevPositionRef.current.x,
      prevPositionRef.current.y,
      position.x,
      position.y
    );
    
    const duration = calculateDurationByDistance(
      distance,
      CARD_ANIMATION.MOVE_DURATION,
      CARD_ANIMATION.MOVE_DURATION * 2
    );
    
    return {
      transition: `left ${duration}ms ${CARD_ANIMATION.MOVE_EASING}, top ${duration}ms ${CARD_ANIMATION.MOVE_EASING}`,
      transitionDelay: `${animationDelay}ms`,
    };
  };

  const handleCardClick = (e) => {
    if (e.target.closest('.card-action-button')) {
      return;
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

  const handleCopyLink = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(og.url || '');
      console.log('链接已复制到剪贴板');
    } catch (err) {
      console.error('复制失败:', err);
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
      const imageUrl = getBestImageSource(og, 'initials', width, height);
      
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
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

  // 计算发光效果强度
  const glowIntensity = isSearchResult ? Math.min(similarity * 2, 1) : 0;
  const glowColor = `rgba(26, 115, 232, ${glowIntensity * 0.8})`;

  // 获取 Favicon URL
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

  const getFallbackFavicon = () => {
    if (!og.url) return null;
    try {
      return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(og.url)}`;
    } catch (e) {
      return null;
    }
  };

  // 获取网页名称
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

  const faviconUrl = getFaviconUrl();
  const pageName = getPageName();

  return (
    <div
      ref={cardRef}
      className={`radial-card ${isSelected ? 'selected' : ''} ${isSearchResult ? 'search-result' : ''} ${hasSearchResults && !isSearchResult ? 'search-blur' : ''} ${isDragging ? 'dragging' : ''} ${isAnimating ? 'animating' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${width}px`,
        backgroundColor: '#fff',
        borderRadius: '8px',
        overflow: 'visible',
        boxShadow: isSearchResult 
          ? `0 0 ${8 + glowIntensity * 12}px ${glowColor}, 0 0 ${4 + glowIntensity * 8}px ${glowColor}, 0 2px 8px rgba(0,0,0,0.15)`
          : '0 2px 8px rgba(0,0,0,0.15)',
        filter: hasSearchResults && !isSearchResult ? 'blur(3px)' : 'none',
        opacity: hasSearchResults && !isSearchResult ? 0.4 : (isDragging ? 0.8 : 1),
        transition: isDragging ? 'none' : 'all 0.3s ease',
        zIndex: isDragging ? 200 : (isSearchResult ? 10 : 1),
        border: isSelected ? '3px solid #1a73e8' : 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        ...getAnimationStyle(),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
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
          src={imageSrc}
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
          onError={(e) => handleImageError(e, og, 'initials')}
        />
        
        {/* 悬浮按钮（底部靠右） */}
        {isHovered && !isDragging && (
          <div
            style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              display: 'flex',
              gap: '6px',
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
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#F5F5F5',
                color: '#333',
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
                style={{ width: '12px', height: '12px', objectFit: 'contain' }}
              />
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
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#F5F5F5',
                color: '#333',
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
                style={{ width: '12px', height: '12px', objectFit: 'contain' }}
              />
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
                width: '20px',
                height: '20px',
                borderRadius: '4px',
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
                style={{ width: '12px', height: '12px', objectFit: 'contain' }}
              />
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
                width: '20px',
                height: '20px',
                borderRadius: '4px',
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
                style={{ width: '12px', height: '12px', objectFit: 'contain' }}
              />
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

