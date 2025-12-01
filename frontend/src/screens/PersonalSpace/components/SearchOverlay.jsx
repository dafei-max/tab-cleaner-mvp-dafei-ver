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
  // ✅ 修复：确保 searchResults 是数组
  const safeSearchResults = Array.isArray(searchResults) ? searchResults : [];
  const hasActiveSearch = safeSearchResults.length > 0;
  const searchOverlayConfig = UI_CONFIG.searchOverlay || {};
  
  // 动态调整显示数量：根据结果数量智能调整
  // 1-5 个：全部显示
  // 6-10 个：显示前 8 个
  // 11+ 个：显示前 10 个，并提示更多结果
  // ✅ 修复：使用 safeSearchResults 而不是直接访问 searchResults.length
  const resultCount = safeSearchResults.length;
  let maxDisplayResults = searchOverlayConfig.maxResults ?? 10;
  
  if (resultCount <= 5) {
    maxDisplayResults = resultCount; // 全部显示
  } else if (resultCount <= 10) {
    maxDisplayResults = Math.min(8, resultCount); // 显示前 8 个
  } else {
    maxDisplayResults = Math.min(10, resultCount); // 显示前 10 个
  }
  
  const topSearchResults = hasActiveSearch 
    ? safeSearchResults.slice(0, maxDisplayResults) 
    : [];
  
  const hasMoreResults = resultCount > maxDisplayResults;

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
      
      {/* 搜索结果容器 */}
      <div
        style={{
          position: 'fixed',
          top: '15%', // 顶部对齐，距离顶部 15%
          left: '50%', // 水平居中
          transform: 'translateX(-50%)', // 只水平居中，不垂直居中
          zIndex: 1501,
          pointerEvents: 'auto',
          maxWidth: `${searchOverlayConfig.maxWidthPercent ?? 90}vw`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {/* 结果数量提示 */}
        {hasMoreResults && (
          <div
            style={{
              fontSize: '12px',
              color: 'rgba(255, 255, 255, 0.8)',
              padding: '4px 12px',
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '12px',
              backdropFilter: 'blur(8px)',
            }}
          >
            显示 {maxDisplayResults} / {resultCount} 个结果
          </div>
        )}
        
        {/* 搜索结果水平行（单行排列，可横向滚动） */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start', // 顶部对齐
            gap: `${searchOverlayConfig.gap ?? 16}px`,
            flexWrap: resultCount <= 5 ? 'nowrap' : 'wrap', // 少于 5 个不换行，多于 5 个允许换行
            padding: `0 ${searchOverlayConfig.paddingX ?? 0}px`,
            overflowX: 'auto',
            overflowY: 'visible',
            maxHeight: '70vh', // 限制最大高度，避免占用太多屏幕
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
      </div>
    </>
  );
};



