import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { getImageUrl } from '../../../shared/utils';
import { UI_CONFIG } from '../uiConfig';

/**
 * PersonalSpace 头部组件
 * 包含：标题、添加按钮、分享按钮
 */
export const PersonalSpaceHeader = ({
  currentPage,
  onBackToHome,
  onCreateSession,
  onViewModeChange,
}) => {
  const [showAddTooltip, setShowAddTooltip] = useState(false);
  const addButtonRef = useRef(null);

  return (
    <>
      {/* 添加 Session 按钮 - 只在主页显示 */}
      {currentPage === 'home' && (
        <div 
          className="space-function"
          style={{
            right: `max(${UI_CONFIG.addSessionButton.rightOffset}px, calc(50% - 720px + ${UI_CONFIG.addSessionButton.rightOffset}px))`,
            top: `${UI_CONFIG.addSessionButton.top}px`,
          }}
        >
        <motion.div 
          ref={addButtonRef}
          className="add-new-session"
          onMouseEnter={() => setShowAddTooltip(true)}
          onMouseLeave={() => setShowAddTooltip(false)}
          onClick={() => {
            onCreateSession();
            onViewModeChange('masonry');
          }}
          style={{ cursor: 'pointer', position: 'relative' }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            className="image-10" 
            alt="Add button" 
            src={getImageUrl("add-button.png")} 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          {showAddTooltip && addButtonRef.current && createPortal(
            <div
              className="tooltip"
              style={{
                position: 'fixed',
                top: `${addButtonRef.current.getBoundingClientRect().bottom + 8}px`,
                left: `${addButtonRef.current.getBoundingClientRect().left + addButtonRef.current.getBoundingClientRect().width / 2}px`,
                transform: 'translateX(-50%)',
                padding: '4px 8px',
                backgroundColor: 'rgba(0,0,0,0.9)',
                color: '#fff',
                fontSize: '11px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 99999,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              }}
            >
              新增 Session
            </div>,
            document.body
          )}
        </motion.div>

        <div className="share">
          <img className="image-11" alt="Image" src={getImageUrl("4.svg")} />
          <div className="text-wrapper-17">分享</div>
        </div>
      </div>
      )}

      {/* 标题 - 在宠物设定页时，图标可点击返回 */}
      <div className="space-title" style={{
        left: `max(${UI_CONFIG.spaceTitle.leftOffset}px, calc(50% - 720px + ${UI_CONFIG.spaceTitle.leftOffset}px))`,
        top: `${UI_CONFIG.spaceTitle.top}px`,
        width: 'auto',
        zIndex: 1000, // 确保在宠物设定页也在最上层
      }}>
        <motion.img
          className="basket-icon"
          alt="Space name icon"
          src={getImageUrl("space-name-icon.png")}
          onClick={currentPage === 'petSetting' ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('[PersonalSpaceHeader] Icon clicked, going back to home');
            if (onBackToHome) {
              onBackToHome();
            }
          } : undefined}
          style={{ 
            cursor: currentPage === 'petSetting' ? 'pointer' : 'default',
            pointerEvents: 'auto',
            position: 'relative',
            zIndex: currentPage === 'petSetting' ? 1001 : 'auto',
          }}
          whileHover={currentPage === 'petSetting' ? { scale: 1.15, rotate: 8 } : { scale: 1.1, rotate: 5 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        />
        <div className="text-wrapper-18" style={{ fontSize: `${UI_CONFIG.spaceTitle.fontSize}px` }}>
          洗衣房
        </div>
      </div>
    </>
  );
};

