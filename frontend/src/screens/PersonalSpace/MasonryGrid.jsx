import React, { useRef } from "react";
import { usePackeryLayout } from "../../hooks/usePackeryLayout";
import { MASONRY_CONFIG } from "../../config/masonryConfig";
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

  // 找到最接近的搜索结果
  const hasSearchResults = searchQuery.trim() && opengraphData.some(item => item.similarity !== undefined && item.similarity > 0);
  const topResult = hasSearchResults
    ? opengraphData.find(item => item.similarity !== undefined && item.similarity > 0)
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
        {opengraphData && Array.isArray(opengraphData) && opengraphData.length > 0 && opengraphData.map((og) => {
          if (!og || typeof og !== 'object' || !og.id) {
            return null;
          }
          
          const isDocCard = og.is_doc_card || false;
          const isTopResult = topResultId === og.id;

          return (
            <div
              key={og.id}
              className="masonry-item"
              style={{
                width: `${cardWidth}px`,  // Pinterest 风格：固定宽度
                marginBottom: `${MASONRY_CONFIG.columns.gutter}px`,  // 使用 gutter 作为间距
                breakInside: 'avoid',
              }}
            >
              <img
                src={og.image || MASONRY_CONFIG.imageLoading.placeholder}
                alt={og.title || og.url}
                className={`opengraph-image ${isDocCard ? 'doc-card' : ''} ${isTopResult ? 'top-result' : ''}`}
                style={{
                  width: '100%',
                  height: 'auto',  // Pinterest 风格：高度自适应，保持原始宽高比
                  display: 'block',
                  borderRadius: `${MASONRY_CONFIG.card.borderRadius}px`,
                  boxShadow: MASONRY_CONFIG.card.boxShadow,
                  cursor: MASONRY_CONFIG.draggable.enabled ? 'move' : 'pointer',
                  objectFit: 'cover',  // 确保图片填充整个宽度
                }}
                loading="lazy"  // 懒加载
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

