import React, { useRef } from "react";
import { usePackeryLayout } from "../../hooks/usePackeryLayout";
import { MASONRY_CONFIG } from "../../config/masonryConfig";
import { getBestImageSource, handleImageError } from "../../utils/imagePlaceholder";
import "./style.css";

export const MasonryGrid = ({ 
  opengraphData, 
  searchQuery,
  onCardClick,
  lastOGClickRef 
}) => {
  const { masonryRef } = usePackeryLayout('masonry', opengraphData);

  // 使用配置计算卡片宽度（Pinterest 风格：固定宽度）
  const cardWidth = MASONRY_CONFIG.columns.getColumnWidth();

  // 检查是否有搜索结果
  const hasSearchResults = searchQuery.trim() && opengraphData.some(item => item.similarity !== undefined && item.similarity > 0);
  
  // 如果有搜索结果，按相似度排序（最相似的排前面）
  const sortedData = hasSearchResults 
    ? [...opengraphData].sort((a, b) => {
        const simA = a.similarity ?? 0;
        const simB = b.similarity ?? 0;
        return simB - simA; // 降序：相似度高的在前
      })
    : opengraphData;
  
  const topResult = hasSearchResults
    ? sortedData.find(item => item.similarity !== undefined && item.similarity > 0)
    : null;
  const topResultId = topResult?.id;

  return (
    <div 
      className="masonry-container"
      style={{
        width: '100%',
        maxWidth: `${MASONRY_CONFIG.container.maxWidth}px`,
        margin: '0 auto',
        padding: `${MASONRY_CONFIG.container.padding}px`,
        overflowY: 'auto',
        height: '100vh',
      }}
    >
      <div 
        ref={masonryRef}
        className="masonry-grid"
        style={{
          margin: '0 auto',
          display: 'block',
        }}
      >
        {sortedData && Array.isArray(sortedData) && sortedData.length > 0 && sortedData.map((og) => {
          if (!og || typeof og !== 'object' || !og.id) {
            return null;
          }
          
          const isDocCard = og.is_doc_card || false;
          const isTopResult = topResultId === og.id;
          // 判断是否为搜索结果
          const isSearchResult = hasSearchResults && og.similarity !== undefined && og.similarity > 0;
          const similarity = og.similarity ?? 0;

          return (
            <div
              key={og.id}
              className={`masonry-item ${isSearchResult ? 'search-result' : ''} ${hasSearchResults && !isSearchResult ? 'search-blur' : ''}`}
              style={{
                width: `${cardWidth}px`,  // Pinterest 风格：固定宽度
                marginBottom: `${MASONRY_CONFIG.columns.gutter}px`,  // 使用 gutter 作为间距
                breakInside: 'avoid',
                // 搜索结果发光效果
                boxShadow: isSearchResult 
                  ? `0 0 ${8 + Math.min(similarity * 2, 1) * 12}px rgba(26, 115, 232, ${Math.min(similarity * 2, 1) * 0.8}), 0 0 ${4 + Math.min(similarity * 2, 1) * 8}px rgba(26, 115, 232, ${Math.min(similarity * 2, 1) * 0.8}), 0 2px 8px rgba(0,0,0,0.15)`
                  : undefined,
                // 非搜索结果的模糊效果
                filter: hasSearchResults && !isSearchResult ? 'blur(3px)' : 'none',
                opacity: hasSearchResults && !isSearchResult ? 0.4 : 1,
                transition: 'all 0.3s ease',
                zIndex: isSearchResult ? 10 : 1,
                pointerEvents: hasSearchResults && !isSearchResult ? 'none' : 'auto',
              }}
            >
              <img
                src={getBestImageSource(og, 'text', cardWidth, cardWidth * 0.75)}
                alt={og.title || og.url}
                className={`opengraph-image ${isDocCard ? 'doc-card' : ''} ${isTopResult ? 'top-result' : ''}`}
                style={{
                  width: '100%',
                  height: 'auto',  // Pinterest 风格：高度自适应，保持原始宽高比
                  display: 'block',
                  borderRadius: `${MASONRY_CONFIG.card.borderRadius}px`,
                  boxShadow: isSearchResult ? 'none' : MASONRY_CONFIG.card.boxShadow, // 搜索结果的外框发光在父元素上
                  cursor: MASONRY_CONFIG.draggable.enabled ? 'move' : 'pointer',
                  objectFit: 'cover',  // 确保图片填充整个宽度
                  backgroundColor: '#f5f5f5',  // 占位符背景色
                }}
                loading="lazy"  // 懒加载
                onError={(e) => handleImageError(e, og, 'text', cardWidth, cardWidth * 0.75)}
                onClick={(e) => {
                  // 如果启用了拖拽，点击事件可能会被拖拽拦截
                  // 只有在没有拖拽的情况下才触发点击
                  if (!MASONRY_CONFIG.draggable.enabled) {
                    if (onCardClick) {
                      onCardClick(og);
                    } else {
                      // 默认双击逻辑
                      const now = Date.now();
                      if (lastOGClickRef && lastOGClickRef.current) {
                        if (lastOGClickRef.current.id === og.id && now - lastOGClickRef.current.time < 300) {
                          lastOGClickRef.current = { time: 0, id: null };
                        } else {
                          lastOGClickRef.current = { time: now, id: og.id };
                        }
                      }
                    }
                  }
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

