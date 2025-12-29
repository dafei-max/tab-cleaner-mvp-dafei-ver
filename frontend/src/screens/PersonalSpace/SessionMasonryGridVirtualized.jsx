import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SessionCard } from './SessionCard';
import { SessionHeader } from './SessionHeader';
import { MASONRY_CONFIG } from '../../config/masonryConfig';
import './style.css';

/**
 * 虚拟滚动版本的 SessionMasonryGridContent
 * 使用 @tanstack/react-virtual 实现虚拟化，保持 Masonry 布局效果
 */
const SessionMasonryGridContentVirtualized = ({
  session,
  selectedCardIds,
  topResultId,
  searchQuery,
  hasSearchResults,
  onCardSelect,
  onCardDelete,
  onOpenLink,
  onCardClick,
  selectedColorFilter,
  onColorsExtracted,
  onThumbnailGenerated,
  parentRef, // 滚动容器 ref
}) => {
  const cardWidth = MASONRY_CONFIG.columns.getColumnWidth();
  const gutter = MASONRY_CONFIG.columns.gutter;
  const columnCount = MASONRY_CONFIG.columns.getActualColumns();
  
  // 估算卡片高度（基于图片宽高比）
  const estimateCardHeight = useCallback((og) => {
    const BASE_HEIGHT = 120;
    const TEXT_HEIGHT = 80; // 文本内容高度
    
    if (og.is_doc_card) {
      return 150 + TEXT_HEIGHT;
    }
    
    let aspectRatio = 16 / 9; // 默认宽高比
    if (og.image_width && og.image_height) {
      aspectRatio = og.image_width / og.image_height;
    } else if (og.original_width && og.original_height) {
      aspectRatio = og.original_width / og.original_height;
    } else if (og.width && og.height) {
      aspectRatio = og.width / og.height;
    }
    
    // 图片高度 = 卡片宽度 / 宽高比
    const imageHeight = cardWidth / aspectRatio;
    return imageHeight + TEXT_HEIGHT;
  }, [cardWidth]);

  // 过滤有效卡片
  const validItems = useMemo(() => {
    if (!session.opengraphData || !Array.isArray(session.opengraphData)) {
      return [];
    }
    
    return session.opengraphData.filter((og, index) => {
      if (!og || typeof og !== 'object') {
        console.warn('[SessionMasonryGridVirtualized] Invalid og item at index', index, ':', og);
        return false;
      }
      if (!og.url && !og.title) {
        console.warn('[SessionMasonryGridVirtualized] Item missing both url and title at index', index, ':', og);
        return false;
      }
      if (selectedColorFilter) {
        const isMatched = og._colorMatched === true || (og.similarity !== undefined && og.similarity > 0.1);
        if (!isMatched) {
          return false;
        }
      }
      return true;
    });
  }, [session.opengraphData, selectedColorFilter]);

  // 将卡片分配到列（Masonry 布局）
  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => []);
    const colHeights = Array(columnCount).fill(0);
    
    validItems.forEach((og, index) => {
      // 找到最短的列
      const shortestCol = colHeights.indexOf(Math.min(...colHeights));
      
      // 估算卡片高度
      const estimatedHeight = estimateCardHeight(og);
      
      const itemId = og.id || og.url || `og-${session.id}-${index}`;
      if (!og.id) {
        og.id = itemId;
      }
      
      cols[shortestCol].push({
        ...og,
        originalIndex: index,
        estimatedHeight,
        columnIndex: shortestCol,
        top: colHeights[shortestCol],
        itemId,
      });
      
      colHeights[shortestCol] += estimatedHeight + gutter;
    });
    
    return cols;
  }, [validItems, columnCount, estimateCardHeight, gutter, session.id]);

  // 扁平化为行（用于虚拟化）
  // 将卡片按 top 位置分组为行
  const rows = useMemo(() => {
    const allItems = columns.flat();
    
    // 按 top 位置排序
    allItems.sort((a, b) => a.top - b.top);
    
    // 分组为行（每行包含大约同一高度的卡片）
    const ROW_HEIGHT_THRESHOLD = 200; // 行高阈值
    const rowMap = new Map();
    
    allItems.forEach(item => {
      const rowIndex = Math.floor(item.top / ROW_HEIGHT_THRESHOLD);
      if (!rowMap.has(rowIndex)) {
        rowMap.set(rowIndex, []);
      }
      rowMap.get(rowIndex).push(item);
    });
    
    return [...rowMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, cards]) => {
        // 计算行高度（该行中最高的卡片）
        const maxHeight = Math.max(...cards.map(c => c.estimatedHeight));
        const rowTop = Math.min(...cards.map(c => c.top));
        
        return {
          index,
          cards,
          height: maxHeight + gutter,
          top: rowTop,
        };
      });
  }, [columns, gutter]);

  // 存储实际测量的卡片高度（用于动态调整）
  const [measuredHeights, setMeasuredHeights] = useState(new Map());
  
  // 更新测量高度
  const updateMeasuredHeight = useCallback((itemId, height) => {
    setMeasuredHeights(prev => {
      const next = new Map(prev);
      if (next.get(itemId) !== height) {
        next.set(itemId, height);
        return next;
      }
      return prev;
    });
  }, []);

  // 虚拟化配置
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index) => {
      return rows[index]?.height || 200;
    }, [rows]),
    overscan: 3, // 渲染额外的 3 行以提高滚动流畅度
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  return (
    <div
      className="masonry-grid-virtualized"
      style={{
        position: 'relative',
        width: '100%',
        height: totalHeight,
      }}
    >
      {virtualRows.map((virtualRow) => {
        const row = rows[virtualRow.index];
        if (!row) return null;
        
        return (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: virtualRow.size,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {row.cards.map((item) => {
              const isSelected = selectedCardIds.has(item.itemId);
              const isTopResult = topResultId === item.itemId;
              const isSearchResult = hasSearchResults && item.similarity !== undefined && item.similarity > 0;
              const similarity = item.similarity ?? 0;
              
              // 计算卡片在行内的相对位置
              const rowTop = Math.min(...row.cards.map(c => c.top));
              const relativeTop = item.top - rowTop;
              
              return (
                <div
                  key={item.itemId}
                  style={{
                    position: 'absolute',
                    left: item.columnIndex * (cardWidth + gutter),
                    width: cardWidth,
                    top: relativeTop,
                  }}
                  ref={(el) => {
                    // 测量实际高度
                    if (el) {
                      const measuredHeight = el.offsetHeight;
                      if (measuredHeight > 0 && measuredHeight !== item.estimatedHeight) {
                        updateMeasuredHeight(item.itemId, measuredHeight);
                      }
                    }
                  }}
                >
                  <SessionCard
                    og={item}
                    isSelected={isSelected}
                    isTopResult={isTopResult}
                    isSearchResult={isSearchResult}
                    similarity={similarity}
                    hasSearchResults={hasSearchResults}
                    appearDelay={Math.min(item.originalIndex * 0.05, 1.2)}
                    onSelect={onCardSelect}
                    onDelete={onCardDelete}
                    onOpenLink={onOpenLink}
                    onCardClick={onCardClick}
                    variant="masonry"
                    onColorsExtracted={onColorsExtracted}
                    onThumbnailGenerated={onThumbnailGenerated}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/**
 * 支持虚拟滚动的 SessionMasonryGrid
 */
export const SessionMasonryGridVirtualized = ({
  sessions,
  searchQuery,
  onCardClick,
  onSessionDelete,
  onSessionOpenAll,
  searchBarHeight = 80,
  containerRef,
  onSessionFocus,
  selectedColorFilter,
  onColorsExtracted,
  onThumbnailGenerated,
}) => {
  const [selectedCardIds, setSelectedCardIds] = useState(new Set());
  const [sessionSelectedCounts, setSessionSelectedCounts] = useState(new Map());
  const [scrollPositions, setScrollPositions] = useState(new Map()); // 存储滚动位置
  
  const localContainerRef = useRef(null);
  const actualContainerRef = containerRef || localContainerRef;

  const viewportHeight = window.innerHeight - searchBarHeight;

  // 检查是否有搜索结果
  const hasSearchResults = searchQuery.trim() && sessions.some(session => 
    session.opengraphData && session.opengraphData.some(item => 
      item.similarity !== undefined && item.similarity > 0
    )
  );
  
  // 排序 sessions
  const sortedSessions = hasSearchResults 
    ? sessions.map(session => ({
        ...session,
        opengraphData: [...(session.opengraphData || [])].sort((a, b) => {
          const simA = a.similarity ?? 0;
          const simB = b.similarity ?? 0;
          return simB - simA;
        })
      }))
    : sessions.map(session => ({
        ...session,
        opengraphData: [...(session.opengraphData || [])].sort((a, b) => {
          const timeA = a.created_at || a.timestamp || a.createdAt || a.added_at || 0;
          const timeB = b.created_at || b.timestamp || b.createdAt || b.added_at || 0;
          const numA = typeof timeA === 'string' ? new Date(timeA).getTime() : timeA;
          const numB = typeof timeB === 'string' ? new Date(timeB).getTime() : timeB;
          return numB - numA;
        })
      }));

  // 处理卡片选择
  const handleCardSelect = useCallback((cardId) => {
    setSelectedCardIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  }, []);

  // 处理卡片删除
  const handleCardDelete = useCallback((cardId) => {
    const session = sessions.find(s => 
      s.opengraphData.some(item => item.id === cardId)
    );
    if (session && onSessionDelete) {
      onSessionDelete(session.id, [cardId]);
    }
    setSelectedCardIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(cardId);
      return newSet;
    });
  }, [sessions, onSessionDelete]);

  // 处理打开链接
  const handleOpenLink = useCallback((url) => {
    if (url) {
      chrome.tabs.create({ url });
    }
  }, []);

  // 处理 Session 删除
  const handleSessionDelete = useCallback((sessionId, selectedIds) => {
    if (selectedIds && selectedIds.size > 0) {
      if (onSessionDelete) {
        onSessionDelete(sessionId, Array.from(selectedIds));
      }
      setSelectedCardIds(prev => {
        const newSet = new Set(prev);
        selectedIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      if (onSessionDelete) {
        onSessionDelete(sessionId);
      }
      setSelectedCardIds(new Set());
    }
  }, [onSessionDelete]);

  // 处理 Session 全部打开
  const handleSessionOpenAll = useCallback((session, selectedIds) => {
    const selectedIdsArray = selectedIds.size > 0 ? Array.from(selectedIds) : null;
    if (onSessionOpenAll) {
      onSessionOpenAll(session.id, selectedIdsArray);
    }
  }, [onSessionOpenAll]);

  // 更新每个 session 的选中数量
  useEffect(() => {
    const counts = new Map();
    sessions.forEach(session => {
      const count = session.opengraphData.filter(item => selectedCardIds.has(item.id)).length;
      counts.set(session.id, count);
    });
    setSessionSelectedCounts(counts);
  }, [sessions, selectedCardIds]);

  // 保存滚动位置（使用 localStorage 持久化）
  const handleScroll = useCallback(() => {
    if (actualContainerRef.current) {
      const scrollTop = actualContainerRef.current.scrollTop;
      setScrollPositions(prev => {
        const next = new Map(prev);
        next.set('main', scrollTop);
        return next;
      });
      // 保存到 localStorage（可选，用于跨会话恢复）
      try {
        localStorage.setItem('sessionMasonryScrollPosition', scrollTop.toString());
      } catch (e) {
        // localStorage 可能不可用（隐私模式等）
      }
    }
  }, []);

  // 恢复滚动位置（从 localStorage 或 state）
  useEffect(() => {
    if (actualContainerRef.current) {
      let savedPosition = scrollPositions.get('main');
      
      // 如果没有 state 中的位置，尝试从 localStorage 恢复
      if (savedPosition === undefined) {
        try {
          const stored = localStorage.getItem('sessionMasonryScrollPosition');
          if (stored) {
            savedPosition = parseInt(stored, 10);
          }
        } catch (e) {
          // localStorage 不可用
        }
      }
      
      if (savedPosition !== undefined && savedPosition > 0) {
        // 使用 requestAnimationFrame 确保在 DOM 更新后恢复
        requestAnimationFrame(() => {
          if (actualContainerRef.current) {
            actualContainerRef.current.scrollTop = savedPosition;
          }
        });
      }
    }
  }, []); // 只在挂载时执行一次

  // 处理点击空白处取消所有选择
  const handleContainerClick = useCallback((e) => {
    if (!e.target.closest('.masonry-item')) {
      setSelectedCardIds(new Set());
    }
  }, []);

  return (
    <div
      ref={actualContainerRef}
      className="session-masonry-container"
      style={{
        width: '100%',
        maxWidth: '1800px',
        margin: '0 auto',
        padding: '0 20px',
        overflowY: 'auto',
        overflowX: 'visible',
        height: `${viewportHeight}px`,
      }}
      onClick={handleContainerClick}
      onScroll={handleScroll}
    >
      {sortedSessions && sortedSessions.length > 0 ? (
        sortedSessions.map((session) => {
          const sessionSelectedIds = new Set(
            session.opengraphData
              .filter(item => selectedCardIds.has(item.id))
              .map(item => item.id)
          );
          const selectedCount = sessionSelectedIds.size;

          const topResult = hasSearchResults
            ? session.opengraphData.find(item => 
                item.similarity !== undefined && item.similarity > 0
              )
            : null;
          const topResultId = topResult?.id;

          return (
            <div
              key={session.id}
              data-session-id={session.id}
              className="session-section"
              style={{
                marginBottom: '40px',
              }}
            >
              <SessionHeader
                session={session}
                selectedCount={selectedCount}
                onOpenAll={() => handleSessionOpenAll(session, sessionSelectedIds)}
                onDelete={() => handleSessionDelete(session.id, sessionSelectedIds)}
              />

              <SessionMasonryGridContentVirtualized
                session={session}
                selectedCardIds={sessionSelectedIds}
                topResultId={topResultId}
                searchQuery={searchQuery}
                hasSearchResults={hasSearchResults}
                onCardSelect={handleCardSelect}
                onCardDelete={handleCardDelete}
                onOpenLink={handleOpenLink}
                onCardClick={onCardClick}
                selectedColorFilter={selectedColorFilter}
                onColorsExtracted={onColorsExtracted}
                onThumbnailGenerated={onThumbnailGenerated}
                parentRef={actualContainerRef}
              />
            </div>
          );
        })
      ) : (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px 20px',
          color: '#999',
        }}>
          暂无 Session，点击"加新洗衣筐"创建新 Session
        </div>
      )}
    </div>
  );
};

export default SessionMasonryGridVirtualized;

