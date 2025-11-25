import React, { useState } from 'react';
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
  const tooltipBaseStyle = {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0,0,0,0.85)',
    color: '#fff',
    padding: '3px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 20000,
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
              fontSize: '14px',
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
          onClick={onOpenAll}
          title={hasSelected ? `打开选中的 ${selectedCount} 个标签页` : '打开所有标签页'}
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
          onMouseEnter={() => setHoveredAction('open')}
          onMouseLeave={() => setHoveredAction(null)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("open-tab-button (1).png")} 
            alt="Open all"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          {hoveredAction === 'open' && (
            <div className="tooltip" style={tooltipBaseStyle}>
              {hasSelected ? '打开选中标签页' : '打开全部标签页'}
            </div>
          )}
        </motion.button>

        {/* 删除按钮 */}
        <motion.button
          onClick={onDelete}
          title={hasSelected ? `删除选中的 ${selectedCount} 个标签页` : '删除整个 Session'}
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
          onMouseEnter={() => setHoveredAction('delete')}
          onMouseLeave={() => setHoveredAction(null)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("delete-button (1).png")} 
            alt="Delete"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          {hoveredAction === 'delete' && (
            <div className="tooltip" style={tooltipBaseStyle}>
              {hasSelected ? '删除选中标签页' : '删除整个 Session'}
            </div>
          )}
        </motion.button>
      </div>
    </div>
  );
};



