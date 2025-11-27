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
      sessionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    if (activeSessionId) {
      setObservedSessionId(activeSessionId);
    }
  }, [activeSessionId]);

  // 监听可见 session，自动更新激活状态
  useEffect(() => {
    if (!containerRef?.current || !sessions.length) return;

    const container = containerRef.current;
    const sections = Array.from(container.querySelectorAll('[data-session-id]'));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visibleEntries.length === 0) {
          return;
        }
        const newActiveId = visibleEntries[0].target.dataset.sessionId;
        setObservedSessionId(prev => (prev === newActiveId ? prev : newActiveId));
        if (onActiveSessionChange && newActiveId !== activeSessionId) {
          onActiveSessionChange(newActiveId);
        }
      },
      {
        root: container,
        threshold: [0.25, 0.5, 0.75],
      }
    );

    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [sessions, containerRef, onActiveSessionChange, activeSessionId]);

  if (!sessions || sessions.length === 0) {
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
      {sessions.map((session, index) => (
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




