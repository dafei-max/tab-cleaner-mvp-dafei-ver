import React, { useRef } from "react";
import { useMasonryLayout } from "../../hooks/useMasonryLayout";
import "./style.css";

/**
 * Calculate card dimensions based on OpenGraph data
 */
const calculateCardSize = (og) => {
  const isDocCard = og.is_doc_card || false;
  let cardWidth, cardHeight;

  if (isDocCard) {
    cardWidth = 200;
    cardHeight = 150;
  } else {
    const BASE_HEIGHT = 120;
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

  return { cardWidth, cardHeight };
};

export const MasonryGrid = ({ 
  opengraphData, 
  searchQuery,
  onCardClick,
  lastOGClickRef 
}) => {
  const { masonryRef } = useMasonryLayout('masonry', opengraphData);

  // 计算实际显示的卡片宽度（限制最大宽度以适配 5 列布局）
  const containerWidth = 1440 - 40; // 减去左右 padding
  const gutter = 16;
  const maxColumns = 5;
  const maxCardWidth = (containerWidth - (gutter * (maxColumns - 1))) / maxColumns;

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
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '20px',
        overflowY: 'auto',
        height: '100vh',
      }}
    >
      <div 
        ref={masonryRef}
        className="masonry-grid"
        style={{
          margin: '0 auto',
        }}
      >
        {opengraphData && Array.isArray(opengraphData) && opengraphData.length > 0 && opengraphData.map((og) => {
          if (!og || typeof og !== 'object' || !og.id) {
            return null;
          }
          
          const { cardWidth } = calculateCardSize(og);
          const isDocCard = og.is_doc_card || false;
          const isTopResult = topResultId === og.id;
          const displayWidth = Math.min(cardWidth, maxCardWidth);

          return (
            <div
              key={og.id}
              className="masonry-item"
              style={{
                width: `${displayWidth}px`,
                marginBottom: '16px',
                breakInside: 'avoid',
              }}
            >
              <img
                src={og.image || 'https://via.placeholder.com/120'}
                alt={og.title || og.url}
                className={`opengraph-image ${isDocCard ? 'doc-card' : ''} ${isTopResult ? 'top-result' : ''}`}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                }}
                onClick={() => {
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
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

