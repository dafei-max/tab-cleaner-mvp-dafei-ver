import React, { useEffect, useRef, useState } from 'react';
import { UI_CONFIG } from './uiConfig';

/**
 * Scroll Spy Indicator 组件
 * 用于快速定位到不同的 session
 */
export const ScrollSpyIndicator = ({ sessions, containerRef, activeSessionId, onActiveSessionChange }) => {
  const [observedSessionId, setObservedSessionId] = useState(activeSessionId || sessions[0]?.id);
  const indicatorRef = useRef(null);

  // 滚动到指定 session
  const scrollToSession = (sessionId) => {
    if (!containerRef.current) return;
    
    const sessionElement = containerRef.current.querySelector(`[data-session-id="${sessionId}"]`);
    if (sessionElement) {
      // 对于最后一个 session，使用 'end' 确保滚动到底部
      const sessionIndex = sessions.findIndex(s => s.id === sessionId);
      const isLastSession = sessionIndex === sessions.length - 1;
      
      // 使用 'end' 对于最后两个 session，确保能滚动到底部
      const blockValue = (isLastSession || sessionIndex >= sessions.length - 2) ? 'end' : 'start';
      
      sessionElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: blockValue,
        inline: 'nearest'
      });
      
      // 对于最后两个 session，额外添加一些底部 padding，确保完全可见
      if (isLastSession || sessionIndex >= sessions.length - 2) {
        setTimeout(() => {
          const container = containerRef.current;
          if (container) {
            const scrollHeight = container.scrollHeight;
            const clientHeight = container.clientHeight;
            const maxScroll = scrollHeight - clientHeight;
            // 如果当前滚动位置没有到达底部，继续滚动到底部
            if (container.scrollTop < maxScroll - 50) {
              container.scrollTo({
                top: maxScroll,
                behavior: 'smooth'
              });
            }
          }
        }, 300); // 等待 scrollIntoView 完成后再检查
      }
    }
  };

  useEffect(() => {
    if (activeSessionId) {
      setObservedSessionId(activeSessionId);
    }
  }, [activeSessionId]);

  // 监听可见 session，自动更新激活状态
  useEffect(() => {
    // ✅ 修复：确保 sessions 是数组
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    if (!containerRef?.current || !safeSessions.length) return;

    const container = containerRef.current;
    const sections = Array.from(container.querySelectorAll('[data-session-id]'));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => {
            // 优先选择 intersectionRatio 更大的
            if (Math.abs(b.intersectionRatio - a.intersectionRatio) > 0.1) {
              return b.intersectionRatio - a.intersectionRatio;
            }
            // 如果 intersectionRatio 相近，选择更靠近视口顶部的
            const rectA = a.boundingClientRect;
            const rectB = b.boundingClientRect;
            const containerRect = container.getBoundingClientRect();
            const topA = rectA.top - containerRect.top;
            const topB = rectB.top - containerRect.top;
            return topA - topB;
          });
        
        if (visibleEntries.length === 0) {
          return;
        }
        
        const newActiveId = visibleEntries[0].target.dataset.sessionId;
        
        // 防止抖动：只有在 intersectionRatio 足够大时才更新
        const topEntry = visibleEntries[0];
        if (topEntry.intersectionRatio < 0.1) {
          return; // 如果可见度太低，不更新
        }
        
        setObservedSessionId(prev => {
          // 防止频繁切换：如果当前已经是这个 session，不更新
          if (prev === newActiveId) {
            return prev;
          }
          return newActiveId;
        });
        
        if (onActiveSessionChange && newActiveId !== activeSessionId) {
          onActiveSessionChange(newActiveId);
        }
      },
      {
        root: container,
        rootMargin: '-10% 0px -10% 0px', // 添加边距，减少抖动
        threshold: [0.1, 0.25, 0.5, 0.75, 0.9], // 更细粒度的阈值
      }
    );

    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [sessions, containerRef, onActiveSessionChange, activeSessionId]);

  // ✅ 修复：确保 sessions 是数组
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  if (!safeSessions || safeSessions.length === 0) {
    return null;
  }

  return (
    <div
      ref={indicatorRef}
      className="scroll-spy-indicator"
      style={{
        position: 'fixed',
        right: `${UI_CONFIG.markerBar.right}px`,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: `${UI_CONFIG.markerBar.gap}px`,
        alignItems: 'center',
      }}
    >
      {safeSessions.map((session, index) => (
        <button
          key={session.id}
          onClick={() => {
            scrollToSession(session.id);
            if (onActiveSessionChange) {
              onActiveSessionChange(session.id);
            }
          }}
          title={session.name}
          aria-pressed={session.id === (activeSessionId || observedSessionId)}
          style={{
            width: `${UI_CONFIG.markerBar.dotSize}px`,
            height: `${UI_CONFIG.markerBar.dotSize}px`,
            borderRadius: '50%',
            border: `${UI_CONFIG.markerBar.borderWidth}px solid ${session.id === (activeSessionId || observedSessionId)
              ? UI_CONFIG.markerBar.activeBorderColor
              : UI_CONFIG.markerBar.borderColor
            }`,
            backgroundColor: session.id === (activeSessionId || observedSessionId)
              ? UI_CONFIG.markerBar.activeColor
              : UI_CONFIG.markerBar.inactiveColor,
            cursor: 'pointer',
            padding: 0,
            transition: 'all 0.2s ease',
            boxShadow: session.id === (activeSessionId || observedSessionId)
              ? '0 0 12px rgba(64, 158, 255, 0.6)'
              : UI_CONFIG.markerBar.innerShadow,
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = UI_CONFIG.markerBar.hoverColor;
            e.target.style.borderColor = UI_CONFIG.markerBar.borderColor.replace('0.8', '1');
            e.target.style.transform = 'scale(1.2)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = session.id === (activeSessionId || observedSessionId)
              ? UI_CONFIG.markerBar.activeColor
              : UI_CONFIG.markerBar.inactiveColor;
            e.target.style.borderColor = session.id === (activeSessionId || observedSessionId)
              ? UI_CONFIG.markerBar.activeBorderColor
              : UI_CONFIG.markerBar.borderColor;
            e.target.style.transform = 'scale(1)';
          }}
        />
      ))}
    </div>
  );
};




