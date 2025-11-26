import React, { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { getImageUrl } from "../../shared/utils";
import { UI_CONFIG } from "./uiConfig";
import "./style.css";

export const ViewButtons = ({ viewMode, onViewModeChange }) => {
  const [hoveredButton, setHoveredButton] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  
  const calculateTooltipPosition = (buttonElement) => {
    if (!buttonElement) return;
    const rect = buttonElement.getBoundingClientRect();
    const placement = UI_CONFIG.viewButtons.tooltip?.placement || 'top';
    const offset = UI_CONFIG.viewButtons.tooltip?.offset || 8;
    
    let top, left, transform;
    
    if (placement === 'top') {
      top = rect.top - offset;
      left = rect.left + rect.width / 2;
      transform = 'translateX(-50%) translateY(-100%)';
    } else if (placement === 'bottom') {
      top = rect.bottom + offset;
      left = rect.left + rect.width / 2;
      transform = 'translateX(-50%)';
    } else if (placement === 'left') {
      top = rect.top + rect.height / 2;
      left = rect.left - offset;
      transform = 'translateX(-100%) translateY(-50%)';
    } else { // right
      top = rect.top + rect.height / 2;
      left = rect.right + offset;
      transform = 'translateY(-50%)';
    }
    
    setTooltipPosition({ top, left, transform });
  };
  
  const getTooltipStyle = () => {
    if (!hoveredButton) return { display: 'none' };
    return {
      position: 'fixed',
      top: `${tooltipPosition.top}px`,
      left: `${tooltipPosition.left}px`,
      transform: tooltipPosition.transform || 'translateX(-50%)',
      padding: '4px 8px',
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      color: '#fff',
      fontSize: '11px',
      borderRadius: '4px',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 99999,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    };
  };
  return (
    <div className="view-buttons" style={{ position: 'relative' }}>
      {/* Pan 背景（垫在下面） */}
      <div
        style={{
          position: 'absolute',
          bottom: `${UI_CONFIG.viewButtons.pan.bottom}px`,
          left: `${UI_CONFIG.viewButtons.pan.left}%`,
          transform: `translateX(${UI_CONFIG.viewButtons.pan.translateX}%)`,
          width: 'auto',
          height: 'auto',
          zIndex: 0,
          pointerEvents: 'none',
          maxWidth: 'none',
        }}
      >
        <img 
          src={getImageUrl("pan.png")} 
          alt="Pan background"
          style={{ 
            width: `${UI_CONFIG.viewButtons.pan.width}%`,
            height: 'auto', 
            display: 'block',
            maxWidth: 'none',
            objectFit: 'contain',
          }}
        />
      </div>

      {/* 按钮容器 */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${UI_CONFIG.viewButtons.gap}px` }}>
        {/* 网格视图按钮（GridCollection） */}
        <motion.button
          className={`view-button ${viewMode === 'masonry' ? 'active' : ''}`}
          onClick={() => onViewModeChange('masonry')}
          style={{
            width: `${UI_CONFIG.viewButtons.buttonSize}px`,
            height: `${UI_CONFIG.viewButtons.buttonSize}px`,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            position: 'relative',
            boxShadow: 'none',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            calculateTooltipPosition(e.currentTarget);
            setHoveredButton('grid');
          }}
          onMouseLeave={() => {
            setHoveredButton(null);
            setTooltipPosition({ top: 0, left: 0 });
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("Grid-visualize-button.png")} 
            alt="Grid view"
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
          {hoveredButton === 'grid' && createPortal(
            <div className="tooltip" style={getTooltipStyle()}>
              网格视图
            </div>,
            document.body
          )}
        </motion.button>

        {/* 聚类视图按钮 */}
        <motion.button
          className={`view-button ${viewMode === 'radial' ? 'active' : ''}`}
          onClick={() => onViewModeChange('radial')}
          style={{
            width: `${UI_CONFIG.viewButtons.buttonSize}px`,
            height: `${UI_CONFIG.viewButtons.buttonSize}px`,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            position: 'relative',
            boxShadow: 'none',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            calculateTooltipPosition(e.currentTarget);
            setHoveredButton('cluster');
          }}
          onMouseLeave={() => {
            setHoveredButton(null);
            setTooltipPosition({ top: 0, left: 0 });
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("cluster-visualize-button.png")} 
            alt="Cluster view"
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
          {hoveredButton === 'cluster' && createPortal(
            <div className="tooltip" style={getTooltipStyle()}>
              聚类视图
            </div>,
            document.body
          )}
        </motion.button>
      </div>
    </div>
  );
};




