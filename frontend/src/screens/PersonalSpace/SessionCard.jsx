import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MASONRY_CONFIG } from '../../config/masonryConfig';
import { getBestImageSource, handleImageError, getPlaceholderImage } from '../../utils/imagePlaceholder';
import { getImageUrl } from '../../shared/utils';
import { UI_CONFIG } from './uiConfig';

/**
 * 带错误处理和重试的图片组件
 * 确保即使图片加载失败，也会显示占位符
 */
const ImageWithFallback = ({ og, isDocCard, isTopResult, isSelected, resolvedCardWidth, appearDelay }) => {
  const [imageSrc, setImageSrc] = useState(() => 
    getBestImageSource(og, 'text', resolvedCardWidth, resolvedCardWidth * 0.75)
  );
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 2; // 最多重试 2 次
  
  // 当 og 改变时，重置状态
  useEffect(() => {
    const newSrc = getBestImageSource(og, 'text', resolvedCardWidth, resolvedCardWidth * 0.75);
    setImageSrc(newSrc);
    setHasError(false);
    setRetryCount(0);
  }, [og, resolvedCardWidth]);
  
  const handleError = (e) => {
    const img = e.target;
    const currentSrc = img.src;
    
    console.warn('[ImageWithFallback] Image load failed:', {
      url: og.url?.substring(0, 50),
      currentSrc: currentSrc.substring(0, 50),
      retryCount
    });
    
    // 如果已经是占位符，不再重试
    if (currentSrc.startsWith('data:image/svg+xml') || 
        currentSrc.startsWith('data:image/jpeg') || 
        currentSrc.startsWith('data:image/png')) {
      setHasError(true);
      return;
    }
    
    // 重试机制
    if (retryCount < maxRetries) {
      // 尝试修复 URL
      let fixedUrl = currentSrc;
      
      // 如果是相对路径，尝试使用 og.url 作为基础
      if (og && og.url && !fixedUrl.startsWith('http://') && !fixedUrl.startsWith('https://') && !fixedUrl.startsWith('data:')) {
        try {
          const baseUrl = new URL(og.url);
          fixedUrl = new URL(fixedUrl, baseUrl.origin).href;
        } catch (e) {
          // URL 解析失败
        }
      }
      
      // 如果是协议相对 URL，添加 https
      if (fixedUrl.startsWith('//')) {
        fixedUrl = 'https:' + fixedUrl;
      }
      
      // 如果 URL 被修复了，重试
      if (fixedUrl !== currentSrc) {
        setRetryCount(prev => prev + 1);
        setImageSrc(fixedUrl);
        console.log('[ImageWithFallback] Retrying with fixed URL:', fixedUrl.substring(0, 50));
        return;
      }
      
      // 尝试使用截图
      if (og.screenshot_image && og.screenshot_image.trim() && currentSrc !== og.screenshot_image) {
        setRetryCount(prev => prev + 1);
        setImageSrc(og.screenshot_image);
        console.log('[ImageWithFallback] Retrying with screenshot');
        return;
      }
    }
    
    // 所有重试都失败，使用占位符
    const placeholder = getPlaceholderImage(og, 'text', resolvedCardWidth, resolvedCardWidth * 0.75);
    if (placeholder) {
      setImageSrc(placeholder);
      setHasError(true);
      console.log('[ImageWithFallback] Using placeholder');
    }
  };
  
  const handleLoad = () => {
    setHasError(false);
    if (process.env.NODE_ENV === 'development') {
      console.log('[ImageWithFallback] Image loaded successfully:', og.url?.substring(0, 50));
    }
  };
  
  return (
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
        minHeight: hasError ? '120px' : 'auto', // 确保占位符有足够高度
      }}
      // ✅ 改进：对于前几张图片（前 10 张），不使用懒加载，确保立即加载
      loading={appearDelay < 10 ? 'eager' : 'lazy'}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
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
  isTopResult = false,
  isSearchResult = false,
  similarity = 0,
  hasSearchResults = false,
  appearDelay = 0,
  variant = 'masonry',
  disableActions = false,
  cardWidthOverride,
  style: customStyle,
  onCardClick,
  searchIndex,        // 搜索结果中的索引（用于计算圆形分布位置）
  searchTotal,        // 搜索结果总数
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  
  // 计算 tooltip 位置的函数
  const calculateTooltipPosition = (buttonElement) => {
    if (!buttonElement) return;
    const rect = buttonElement.getBoundingClientRect();
    setTooltipPosition({
      top: rect.top - 30, // 按钮上方 30px
      left: rect.left + rect.width / 2, // 按钮水平中心
    });
  };
  
  const tooltipBaseStyle = {
    position: 'fixed', // 使用 fixed 定位，避免被父容器裁剪
    top: `${tooltipPosition.top}px`,
    left: `${tooltipPosition.left}px`,
    transform: 'translateX(-50%)',
    padding: '4px 8px', // 稍微增加内边距，确保文字显示完整
    backgroundColor: 'rgba(0, 0, 0, 0.9)', // 稍微增加不透明度，确保文字清晰
    color: '#fff',
    fontSize: '11px', // 稍微增大字体，确保可读性
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 99999, // 使用更高的 z-index，确保在所有层级之上
    opacity: 1,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)', // 添加阴影，增强可见性
  };

  const isSelectable = typeof onSelect === 'function';

  const handleSelect = (e) => {
    if (isSelectable) {
      onSelect(og.id, e?.shiftKey);
    }
  };

  const handleCardClick = (e) => {
    // 如果点击的是按钮，不触发卡片点击
    if (e.target.closest('.card-action-button')) {
      return;
    }
    
    // 在 masonry 视图中，单次点击只触发选中
    if (variant === 'masonry' && isSelectable) {
      handleSelect(e);
    } else if (onCardClick && variant !== 'masonry') {
      // 在其他视图中，如果有 onCardClick，调用它
      onCardClick(og);
    }
  };

  const handleCardDoubleClick = (e) => {
    // 如果点击的是按钮，不触发双击
    if (e.target.closest('.card-action-button')) {
      return;
    }
    
    // 双击时触发 onCardClick（用于打开详情）
    if (onCardClick) {
      onCardClick(og);
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
      // 优先使用 og.image（原始图片 URL），如果没有则使用卡片显示的图片
      let imageUrl = og.image || og.og_image || og.image_url;
      
      // 如果还是没有，使用卡片实际显示的图片源
      if (!imageUrl) {
        imageUrl = getBestImageSource(og, 'text', resolvedCardWidth, resolvedCardWidth * 0.75);
      }
      
      // 如果是 data URL 或 blob URL，直接下载
      if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = `${og.title || og.tab_title || 'image'}_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        console.log('图片下载成功');
        return;
      }
      
      // 方法1: 尝试使用 fetch（如果支持 CORS）
      try {
        const response = await fetch(imageUrl, { mode: 'cors' });
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const extension = blob.type.split('/')[1] || imageUrl.split('.').pop()?.split('?')[0] || 'png';
          a.download = `${og.title || og.tab_title || 'image'}_${Date.now()}.${extension}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log('图片下载成功（fetch）');
          return;
        }
      } catch (fetchErr) {
        console.log('Fetch 失败，尝试使用 Canvas 方法:', fetchErr);
      }
      
      // 方法2: 使用 Canvas 转换图片（绕过 CORS）
      const img = new Image();
      img.crossOrigin = 'anonymous'; // 尝试跨域
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => {
          // 如果跨域失败，尝试不使用 crossOrigin
          const img2 = new Image();
          img2.onload = resolve;
          img2.onerror = reject;
          img2.src = imageUrl;
        };
        img.src = imageUrl;
      });
      
      // 创建 canvas 并绘制图片
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      // 将 canvas 转换为 blob
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${og.title || og.tab_title || 'image'}_${Date.now()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          console.log('图片下载成功（Canvas）');
        } else {
          throw new Error('Canvas 转换失败');
        }
      }, 'image/png');
      
    } catch (err) {
      console.error('下载失败:', err);
      // 最后的降级方案：直接打开图片链接
      try {
        const imageUrl = og.image || og.og_image || og.image_url || getBestImageSource(og, 'text', resolvedCardWidth, resolvedCardWidth * 0.75);
        if (imageUrl && !imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
          // 尝试在新标签页打开，让用户手动保存
          window.open(imageUrl, '_blank');
          console.log('已在新标签页打开图片，请手动保存');
        }
      } catch (fallbackErr) {
        console.error('所有下载方法都失败:', fallbackErr);
        alert('下载失败，请检查图片链接是否有效');
      }
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
  const resolvedCardWidth = cardWidthOverride ?? fixedCardWidth;

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
  
  const hasAnimatedRef = useRef(false);
  useLayoutEffect(() => {
    if (!hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
    }
  }, []);
  const shouldAnimate = variant === 'masonry' && !(hasSearchResults && !isSearchResult) && !hasAnimatedRef.current;
  const baseOpacity = hasSearchResults && !isSearchResult ? 0.4 : 1;

  // 搜索结果动画配置
  const searchAnimationConfig = variant === 'searchOverlay' && isSearchResult 
    ? (UI_CONFIG.searchOverlay.animation || {})
    : null;
  
  const baseBoxShadow = isSearchResult 
    ? `0 0 ${8 + glowIntensity * 12}px ${glowColor}, 0 0 ${4 + glowIntensity * 8}px ${glowColor}, 0 2px 8px rgba(0,0,0,0.15)`
    : '0 2px 8px rgba(0,0,0,0.15)';
  const selectedBoxShadow = '0 0 18px rgba(79, 179, 255, 0.7), 0 0 32px rgba(79, 179, 255, 0.35)';

  // 搜索结果动画配置 - 完全参考 card-explosion-demo.jsx 的方式
  // 关键：使用状态驱动的条件样式，transition 在状态改变时自动触发
  const isSearchOverlay = variant === 'searchOverlay' && isSearchResult;
  const [hasAnimated, setHasAnimated] = useState(false);
  
  // 当搜索结果出现时，触发动画（类似 exploded 状态）
  useEffect(() => {
    if (isSearchOverlay && searchAnimationConfig) {
      // 使用 setTimeout 确保初始状态先渲染，然后触发动画
      const timer = setTimeout(() => {
        setHasAnimated(true);
      }, 10); // 很小的延迟，确保初始样式先应用
      return () => clearTimeout(timer);
    } else {
      setHasAnimated(false);
    }
  }, [isSearchOverlay, searchAnimationConfig]);
  
  // 计算动画样式 - 完全参考示例的写法
  const getSearchStyle = () => {
    if (!isSearchOverlay || !searchAnimationConfig) {
      return {};
    }
    
    const baseDuration = searchAnimationConfig.baseDuration || 0.8;
    const staggerDelay = searchAnimationConfig.staggerDelay || 0.05;
    const delay = appearDelay || 0;
    // 参考示例：0.8 + index * 0.05 - 这是总时长，不是 delay
    // 但为了产生 stagger 效果，我们需要 delay
    const totalDuration = baseDuration; // 基础时长
    const easing = searchAnimationConfig.easing || 'cubic-bezier(0.34, 1.56, 0.64, 1)';
    const scaleFrom = searchAnimationConfig.scaleFrom ?? 0;
    const scaleTo = searchAnimationConfig.scaleTo ?? 1;
    
    // 参考示例的写法：根据状态设置不同的 transition 和 transform
    return {
      // transform 和 opacity 根据 hasAnimated 状态改变
      transform: `scale(${hasAnimated ? scaleTo : scaleFrom})`,
      opacity: hasAnimated ? 1 : 0,
      // 关键：transition 在状态改变时自动触发
      // 参考示例：exploded ? 'transform 0.3s ease, z-index 0s' : `all ${0.8 + index * 0.05}s cubic-bezier(...)`
      // 注意：参考代码中 0.8 + index * 0.05 是 duration，但我们用 delay 来产生 stagger
      transition: hasAnimated 
        ? 'transform 0.3s ease, opacity 0.3s ease'  // 已动画完成，快速响应 hover
        : `all ${totalDuration}s ${easing}`,         // 初始动画，带弹性效果
      transitionDelay: hasAnimated ? '0s' : `${delay}s`, // stagger 延迟
    };
  };
  
  const searchStyle = getSearchStyle();
  const CardWrapper = 'div';

  return (
    <CardWrapper
      className={`masonry-item ${isSelected ? 'selected' : ''} ${isSearchResult ? 'search-result' : ''} ${hasSearchResults && !isSearchResult ? 'search-blur' : ''} ${variant === 'searchOverlay' ? 'search-overlay-card' : ''}`}
      style={{
        width: `${resolvedCardWidth}px`,
        marginBottom: variant === 'masonry' ? `${MASONRY_CONFIG.columns.gutter}px` : '0',
        breakInside: variant === 'masonry' ? 'avoid' : 'initial',
        position: 'relative',
        backgroundColor: '#fff',
        borderRadius: '8px',
        overflow: 'visible',
        boxShadow: isSelected ? selectedBoxShadow : baseBoxShadow,
        filter: hasSearchResults && !isSearchResult ? 'blur(3px)' : 'none',
        // 搜索结果动画 - 完全参考 card-explosion-demo.jsx 的写法
        ...(isSearchOverlay ? searchStyle : {
          opacity: shouldAnimate ? 0 : baseOpacity,
          transition: 'all 0.3s ease',
          transform: shouldAnimate && variant === 'masonry' ? 'translateY(12px)' : 'none',
        }),
        zIndex: isSearchResult ? 10 : 1,
        border: isSelected ? '3px solid #1a73e8' : 'none',
        animation: isSelected ? 'selectedBlueGlow 2.2s ease-in-out infinite' : (variant === 'masonry' && shouldAnimate ? `masonryFadeIn 0.6s ease forwards` : (variant === 'searchOverlay' && isSearchResult ? 'searchResultGlow 2s ease-in-out infinite' : 'none')),
        animationDelay: shouldAnimate && variant === 'masonry' ? `${appearDelay}s` : '0s',
        cursor: onCardClick ? 'pointer' : 'default',
        ...customStyle,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
      onDoubleClick={handleCardDoubleClick}
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
        <ImageWithFallback
          og={og}
          isDocCard={isDocCard}
          isTopResult={isTopResult}
          isSelected={isSelected}
          resolvedCardWidth={resolvedCardWidth}
          appearDelay={appearDelay}
        />
        
        {/* 悬浮按钮（底部靠右） */}
        {isHovered && !disableActions && (
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
                calculateTooltipPosition(e.currentTarget);
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
                calculateTooltipPosition(e.currentTarget);
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
                calculateTooltipPosition(e.currentTarget);
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
                calculateTooltipPosition(e.currentTarget);
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

        {isSearchResult && (
          <div className="similarity-badge">
            相似度 {(similarity * 100).toFixed(1)}%
          </div>
        )}
      </div>
    </CardWrapper>
  );
};

