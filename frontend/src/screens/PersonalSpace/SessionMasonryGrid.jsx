import React, { useState, useRef, useEffect } from 'react';
import { SessionCard } from './SessionCard';
import { SessionHeader } from './SessionHeader';
import { usePackeryLayout } from '../../hooks/usePackeryLayout';
import { MASONRY_CONFIG } from '../../config/masonryConfig';
import './style.css';

/**
 * 支持多 Session 的 Masonry Grid 组件
 */
export const SessionMasonryGrid = ({ 
  sessions,
  searchQuery,
  onCardClick,
  onSessionDelete,
  onSessionOpenAll,
  searchBarHeight = 80, // 搜索栏高度（包括间距）
  containerRef, // 从父组件传入
}) => {
  const [selectedCardIds, setSelectedCardIds] = useState(new Set());
  const [sessionSelectedCounts, setSessionSelectedCounts] = useState(new Map());
  
  // 如果 containerRef 未传入，创建本地 ref（但应该从父组件传入）
  const localContainerRef = useRef(null);
  const actualContainerRef = containerRef || localContainerRef;

  // 计算视口高度（减去搜索栏高度）
  const viewportHeight = window.innerHeight - searchBarHeight;

  // 找到最接近的搜索结果
  const hasSearchResults = searchQuery.trim() && sessions.some(session => 
    session.opengraphData.some(item => item.similarity !== undefined && item.similarity > 0)
  );

  // 处理卡片选择
  const handleCardSelect = (cardId) => {
    setSelectedCardIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  // 处理卡片删除
  const handleCardDelete = (cardId) => {
    // 找到卡片所属的 session
    const session = sessions.find(s => 
      s.opengraphData.some(item => item.id === cardId)
    );
    if (session && onSessionDelete) {
      onSessionDelete(session.id, [cardId]);
    }
    // 从选中列表中移除
    setSelectedCardIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(cardId);
      return newSet;
    });
  };

  // 处理打开链接
  const handleOpenLink = (url) => {
    if (url) {
      chrome.tabs.create({ url });
    }
  };

  // 处理 Session 删除
  const handleSessionDelete = (sessionId, selectedIds) => {
    if (selectedIds && selectedIds.size > 0) {
      // 删除选中的卡片
      if (onSessionDelete) {
        onSessionDelete(sessionId, Array.from(selectedIds));
      }
      // 清除该 session 的选中状态
      setSelectedCardIds(prev => {
        const newSet = new Set(prev);
        selectedIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // 删除整个 session
      if (onSessionDelete) {
        onSessionDelete(sessionId);
      }
      // 清除所有选中状态
      setSelectedCardIds(new Set());
    }
  };

  // 处理 Session 全部打开
  const handleSessionOpenAll = (session, selectedIds) => {
    const urlsToOpen = selectedIds.size > 0
      ? session.opengraphData
          .filter(item => selectedIds.has(item.id))
          .map(item => item.url)
          .filter(Boolean)
      : session.opengraphData
          .map(item => item.url)
          .filter(Boolean);

    if (urlsToOpen.length > 0) {
      urlsToOpen.forEach(url => {
        chrome.tabs.create({ url });
      });
    }

    if (onSessionOpenAll) {
      onSessionOpenAll(session.id, selectedIds);
    }
  };

  // 更新每个 session 的选中数量
  useEffect(() => {
    const counts = new Map();
    sessions.forEach(session => {
      const count = session.opengraphData.filter(item => selectedCardIds.has(item.id)).length;
      counts.set(session.id, count);
    });
    setSessionSelectedCounts(counts);
  }, [sessions, selectedCardIds]);

  return (
    <div
      ref={actualContainerRef}
      className="session-masonry-container"
      style={{
        width: '100%',
        maxWidth: '1440px',
        margin: '0 auto',
        padding: '0 20px',
        overflowY: 'auto',
        overflowX: 'hidden',
        height: `${viewportHeight}px`,
      }}
    >
      {sessions && sessions.length > 0 ? (
        sessions.map((session, sessionIndex) => {
          const sessionSelectedIds = new Set(
            session.opengraphData
              .filter(item => selectedCardIds.has(item.id))
              .map(item => item.id)
          );
          const selectedCount = sessionSelectedIds.size;

          // 找到该 session 中的 top result
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
              {/* Session 标题栏 */}
              <SessionHeader
                session={session}
                selectedCount={selectedCount}
                onOpenAll={() => handleSessionOpenAll(session, sessionSelectedIds)}
                onDelete={() => handleSessionDelete(session.id, sessionSelectedIds)}
              />

              {/* Session 内容网格 */}
              <SessionMasonryGridContent
                session={session}
                selectedCardIds={sessionSelectedIds}
                topResultId={topResultId}
                onCardSelect={handleCardSelect}
                onCardDelete={handleCardDelete}
                onOpenLink={handleOpenLink}
                onCardClick={onCardClick}
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

/**
 * 单个 Session 的 Masonry Grid 内容
 */
const SessionMasonryGridContent = ({
  session,
  selectedCardIds,
  topResultId,
  onCardSelect,
  onCardDelete,
  onOpenLink,
  onCardClick,
}) => {
  // 调试：检查数据
  useEffect(() => {
    console.log('[SessionMasonryGridContent] Session data:', {
      sessionId: session.id,
      sessionName: session.name,
      opengraphDataLength: session.opengraphData?.length || 0,
      opengraphData: session.opengraphData,
    });
  }, [session]);

  // usePackeryLayout 返回 { masonryRef, masonryInstanceRef }
  // 每个 session 需要独立的 masonry 实例（带拖拽功能）
  const { masonryRef } = usePackeryLayout('masonry', session.opengraphData || []);

  // 使用配置计算卡片宽度（Pinterest 风格：固定宽度，必须是固定像素值）
  const cardWidth = MASONRY_CONFIG.columns.getColumnWidth();
  
  // 确保 cardWidth 是固定像素值（fitWidth 要求）
  if (typeof cardWidth !== 'number' || cardWidth <= 0) {
    console.error('[SessionMasonryGrid] Invalid cardWidth:', cardWidth);
  }

  return (
    <div
      ref={masonryRef}
      className="masonry-grid"
      style={{
        margin: '0 auto',
        paddingTop: '20px',
      }}
    >
      {session.opengraphData && Array.isArray(session.opengraphData) && session.opengraphData.length > 0 ? (
        session.opengraphData.map((og, index) => {
          if (!og || typeof og !== 'object') {
            console.warn('[SessionMasonryGrid] Invalid og item:', og);
            return null;
          }
          
          // 确保有 id，如果没有则生成一个
          const itemId = og.id || og.url || `og-${session.id}-${index}`;
          if (!og.id) {
            og.id = itemId;
          }

          const isSelected = selectedCardIds.has(itemId);
          const isTopResult = topResultId === itemId;

          return (
            <SessionCard
              key={itemId}
              og={og}
              isSelected={isSelected}
              isTopResult={isTopResult}
              onSelect={onCardSelect}
              onDelete={onCardDelete}
              onOpenLink={onOpenLink}
            />
          );
        })
      ) : (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 20px',
          color: '#999',
        }}>
          该 Session 暂无标签页
          {session.opengraphData ? ` (数据: ${JSON.stringify(session.opengraphData).substring(0, 100)})` : ' (无数据)'}
        </div>
      )}
    </div>
  );
};

