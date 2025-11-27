import React from 'react';
import { SessionCard } from '../SessionCard';
import { UI_CONFIG } from '../uiConfig';

/**
 * 搜索遮罩层组件
 * 显示搜索结果的全屏遮罩层
 */
export const SearchOverlay = ({
  searchResults,
  onCardClick,
  onClearSearch,
}) => {
  const hasActiveSearch = Array.isArray(searchResults) && searchResults.length > 0;
  const searchOverlayConfig = UI_CONFIG.searchOverlay || {};
  const topSearchResults = hasActiveSearch 
    ? searchResults.slice(0, searchOverlayConfig.maxResults ?? 5) 
    : [];

  if (!hasActiveSearch) {
    return null;
  }

  return (
    <>
      {/* 模糊背景遮罩层 */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backdropFilter: `blur(${searchOverlayConfig.backdropBlur ?? 12}px)`,
          backgroundColor: searchOverlayConfig.backdropColor ?? 'rgba(0, 0, 0, 0.3)',
          zIndex: 1500,
          pointerEvents: 'auto',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClearSearch();
          }
        }}
      />
      
      {/* 搜索结果水平行（单行排列，可横向滚动） */}
      <div
        style={{
          position: 'fixed',
          top: `${searchOverlayConfig.positionYPercent ?? 50}%`,
          left: `${searchOverlayConfig.positionXPercent ?? 50}%`,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: `${searchOverlayConfig.gap ?? 16}px`,
          zIndex: 1501,
          pointerEvents: 'auto',
          maxWidth: `${searchOverlayConfig.maxWidthPercent ?? 90}vw`,
          flexWrap: 'nowrap',
          padding: `0 ${searchOverlayConfig.paddingX ?? 0}px`,
          overflowX: 'auto',
          overflowY: 'visible',
        }}
      >
        {topSearchResults.map((result, index) => {
          const normalizedResult = result.id
            ? result
            : { ...result, id: result.url || `search-result-${index}` };
          
          const animationConfig = searchOverlayConfig.animation || {};
          const staggerDelay = animationConfig.staggerDelay ?? 0.08;
          const appearDelay = index * staggerDelay;
          
          return (
            <SessionCard
              key={normalizedResult.id}
              og={normalizedResult}
              isSelected={false}
              onSelect={undefined}
              onDelete={undefined}
              onOpenLink={(url) => {
                if (normalizedResult.url) {
                  window.open(normalizedResult.url, '_blank');
                } else if (url) {
                  window.open(url, '_blank');
                }
              }}
              onCardClick={() => onCardClick(normalizedResult)}
              isSearchResult
              similarity={normalizedResult.similarity ?? 0}
              hasSearchResults={true}
              appearDelay={appearDelay}
              variant="searchOverlay"
              cardWidthOverride={searchOverlayConfig.cardWidth}
              style={{ flex: '0 0 auto' }}
            />
          );
        })}
      </div>
    </>
  );
};



