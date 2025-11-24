import React, { useEffect, useRef, useState } from 'react';

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
        right: '20px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        alignItems: 'center',
      }}
    >
      {sessions.map((session, index) => (
        <button
          key={session.id}
          onClick={() => scrollToSession(session.id)}
          title={session.name}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: '2px solid #999',
            backgroundColor: '#fff',
            cursor: 'pointer',
            padding: 0,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#1a73e8';
            e.target.style.borderColor = '#1a73e8';
            e.target.style.transform = 'scale(1.2)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#fff';
            e.target.style.borderColor = '#999';
            e.target.style.transform = 'scale(1)';
          }}
        />
      ))}
    </div>
  );
};




