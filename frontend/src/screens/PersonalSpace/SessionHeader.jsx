import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { getImageUrl } from '../../shared/utils';
import { UI_CONFIG } from './uiConfig';

/**
 * Session 标题栏组件（带操作按钮）
 */
export const SessionHeader = ({ 
  session, 
  selectedCount = 0,
  onOpenAll, 
  onDelete,
  onRename 
}) => {
  const hasSelected = selectedCount > 0;
  const [hoveredAction, setHoveredAction] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const buttonRefs = useRef({ open: null, delete: null });
  
  // 计算 tooltip 位置，始终显示在按钮下方
  const calculateTooltipPosition = (buttonElement) => {
    if (!buttonElement) return;
    const rect = buttonElement.getBoundingClientRect();
    const margin = 8;
    
    // 始终显示在按钮下方
    const top = rect.bottom + margin;
    const left = rect.left + rect.width / 2;
    
    setTooltipPosition({ top, left });
  };
  
  const getTooltipStyle = () => {
    // 只有在有 hoveredAction 时才显示 tooltip
    if (!hoveredAction) {
      return { display: 'none' };
    }
    
    return {
      position: 'fixed',
      top: `${tooltipPosition.top}px`,
      left: `${tooltipPosition.left}px`,
      transform: 'translateX(-50%)',
      backgroundColor: 'rgba(0,0,0,0.9)',
      color: '#fff',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '11px',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      zIndex: 99999,
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    };
  };

  return (
    <div
      className="session-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: 'none',
        backgroundColor: 'transparent', // 隐藏白色背景
      }}
    >
      {/* 左侧：Session 名称和标签页数量 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: `${UI_CONFIG.sessionHeader.title.marginLeft}px` }}>
        <div
          style={{
            fontSize: `${UI_CONFIG.sessionHeader.title.fontSize}px`,
            fontWeight: 400,
            color: '#ffffff',
          }}
        >
          {session.name}
        </div>
        <div
          style={{
            fontSize: `${UI_CONFIG.sessionHeader.tabCount.fontSize}px`,
            color: '#ffffff',
          }}
        >
          {session.tabCount} 个标签页
        </div>
        {hasSelected && (
          <div
            style={{
              fontSize: '12px',
              color: '#1a73e8',
              fontWeight: 500,
            }}
          >
            已选择 {selectedCount} 个
          </div>
        )}
      </div>

      {/* 右侧：操作按钮 - 往左移，右对齐masonry最右边 */}
      <div style={{ display: 'flex', gap: `${UI_CONFIG.sessionHeader.actionButtons.gap}px`, alignItems: 'center', marginRight: `${UI_CONFIG.sessionHeader.actionButtons.marginRight}px` }}>
        {/* 全部打开按钮 */}
        <motion.button
          ref={(el) => { buttonRefs.current.open = el; }}
          onClick={onOpenAll}
          style={{
            padding: 0,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            width: `${UI_CONFIG.sessionHeader.actionButtons.size}px`,
            height: `${UI_CONFIG.sessionHeader.actionButtons.size}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            calculateTooltipPosition(e.currentTarget);
            setHoveredAction('open');
          }}
          onMouseLeave={() => {
            setHoveredAction(null);
            setTooltipPosition({ top: 0, left: 0 });
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("open-tab-button (1).png")} 
            alt="Open all"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          {hoveredAction === 'open' && createPortal(
            <div className="tooltip" style={getTooltipStyle()}>
              {hasSelected ? '打开选中标签页' : '打开全部标签页'}
            </div>,
            document.body
          )}
        </motion.button>

        {/* 删除按钮 */}
        <motion.button
          ref={(el) => { buttonRefs.current.delete = el; }}
          onClick={onDelete}
          style={{
            padding: 0,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            width: `${UI_CONFIG.sessionHeader.actionButtons.size}px`,
            height: `${UI_CONFIG.sessionHeader.actionButtons.size}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
          onMouseEnter={(e) => {
            calculateTooltipPosition(e.currentTarget);
            setHoveredAction('delete');
          }}
          onMouseLeave={() => {
            setHoveredAction(null);
            setTooltipPosition({ top: 0, left: 0 });
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("delete-button (1).png")} 
            alt="Delete"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          {hoveredAction === 'delete' && createPortal(
            <div className="tooltip" style={getTooltipStyle()}>
              {hasSelected ? '删除选中标签页' : '删除整个 Session'}
            </div>,
            document.body
          )}
        </motion.button>
      </div>
    </div>
  );
};



