import React from "react";
import { motion } from "framer-motion";
import { getImageUrl } from "../../shared/utils";
import "./style.css";

export const ViewButtons = ({ viewMode, onViewModeChange }) => {
  return (
    <div className="view-buttons" style={{ position: 'relative' }}>
      {/* Pan 背景（垫在下面） */}
      <div
        style={{
          position: 'absolute',
          bottom: '65px',
          left: '50%',
          transform: 'translateX(-50%) translateY(50%)',
          width: 'auto',
          height: 'auto',
          zIndex: 0,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img 
          src={getImageUrl("pan.png")} 
          alt="Pan background"
          style={{ width: '420%', height: 'auto', display: 'block' }}
        />
      </div>

      {/* 按钮容器 */}
      <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '48px' }}>
        {/* 网格视图按钮（GridCollection） */}
        <motion.button
          className={`view-button ${viewMode === 'masonry' ? 'active' : ''}`}
          onClick={() => onViewModeChange('masonry')}
          title="网格视图"
          style={{
            width: '40px',
            height: '40px',
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
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("Grid-visualize-button.png")} 
            alt="Grid view"
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        </motion.button>

        {/* 聚类视图按钮 */}
        <motion.button
          className={`view-button ${viewMode === 'radial' ? 'active' : ''}`}
          onClick={() => onViewModeChange('radial')}
          title="聚类视图"
          style={{
            width: '40px',
            height: '40px',
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
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <img 
            src={getImageUrl("cluster-visualize-button.png")} 
            alt="Cluster view"
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        </motion.button>
      </div>
    </div>
  );
};




