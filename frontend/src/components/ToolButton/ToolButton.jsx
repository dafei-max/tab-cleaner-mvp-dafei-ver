import React, { useState, useRef } from "react";

/**
 * 工具按钮组件（带 tooltip）
 */
export const ToolButton = ({ className, alt, src, tooltip, isActive, onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef(null);

  return (
    <div
      className={`tool-button-wrapper ${isActive ? 'active' : ''}`}
      ref={buttonRef}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={onClick}
      style={{ position: 'relative', cursor: 'pointer' }}
    >
      <img
        className={className}
        alt={alt}
        src={src}
        style={{
          opacity: isActive ? 1 : 0.7,
          filter: isActive ? 'none' : 'grayscale(20%)',
        }}
      />
      {showTooltip && (
        <div
          className="tool-tooltip"
          style={{
            position: 'absolute',
            bottom: '-30px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
};



