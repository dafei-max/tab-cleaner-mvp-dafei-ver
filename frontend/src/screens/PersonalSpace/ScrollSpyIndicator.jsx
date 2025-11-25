import React, { useEffect, useRef, useState } from 'react';
import { UI_CONFIG } from './uiConfig';

/**
 * Scroll Spy Indicator 组件
 * 用于快速定位到不同的 session
 */
export const ScrollSpyIndicator = ({ sessions, containerRef }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const indicatorRef = useRef(null);

  // 滚动到指定 session
  const scrollToSession = (sessionId) => {
    if (!containerRef.current) return;
    
    const sessionElement = containerRef.current.querySelector(`[data-session-id="${sessionId}"]`);
    if (sessionElement) {
      sessionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // 监听滚动，更新当前可见的 session（可选，根据需求）
  useEffect(() => {
    if (!containerRef.current) return;

    const handleScroll = () => {
      // 这里可以实现高亮当前可见 session 的逻辑
      // 但根据需求，不需要高亮，所以暂时不实现
    };

    const container = containerRef.current;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef]);

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
          onClick={() => scrollToSession(session.id)}
          title={session.name}
          style={{
            width: `${UI_CONFIG.markerBar.dotSize}px`,
            height: `${UI_CONFIG.markerBar.dotSize}px`,
            borderRadius: '50%',
            border: `${UI_CONFIG.markerBar.borderWidth}px solid ${UI_CONFIG.markerBar.borderColor}`,
            backgroundColor: '#fff',
            cursor: 'pointer',
            padding: 0,
            transition: 'all 0.2s ease',
            boxShadow: UI_CONFIG.markerBar.innerShadow,
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = UI_CONFIG.markerBar.hoverColor;
            e.target.style.borderColor = UI_CONFIG.markerBar.borderColor.replace('0.8', '1');
            e.target.style.transform = 'scale(1.2)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#fff';
            e.target.style.borderColor = UI_CONFIG.markerBar.borderColor;
            e.target.style.transform = 'scale(1)';
          }}
        />
      ))}
    </div>
  );
};




