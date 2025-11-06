import React, { useState, useRef } from "react";

/**
 * 聚类中心标签组件
 * 显示聚类名称，支持双击编辑
 */
export const ClusterLabel = ({ cluster, onRename }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(cluster.name);
  const lastClickRef = useRef({ time: 0, id: null });

  const center = cluster.center || { x: 720, y: 512 };

  const handleClick = (e) => {
    e.stopPropagation();
    // 双击编辑
    const now = Date.now();
    if (lastClickRef.current.id === cluster.id && now - lastClickRef.current.time < 300) {
      setIsEditing(true);
      lastClickRef.current = { time: 0, id: null };
    } else {
      lastClickRef.current = { time: now, id: cluster.id };
      // 单击显示详情
      alert(`聚类：${cluster.name}\n类型：${cluster.type}\n卡片数量：${cluster.item_count || cluster.items?.length || 0}`);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editName.trim() && editName !== cluster.name) {
      // 更新聚类名称
      if (onRename) {
        onRename(cluster.id, editName.trim());
      }
    } else {
      setEditName(cluster.name);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      setEditName(cluster.name);
      setIsEditing(false);
    }
  };

  return (
    <div
      className="cluster-label"
      style={{
        position: 'absolute',
        left: `${center.x}px`,
        top: `${center.y}px`,
        transform: 'translate(-50%, -50%)',
        zIndex: 1000,
        cursor: 'pointer',
        padding: '8px 16px',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        border: '2px solid #0077ff',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        fontSize: '14px',
        fontWeight: 'bold',
        color: '#0077ff',
        minWidth: '80px',
        textAlign: 'center',
        userSelect: 'none',
      }}
      onClick={handleClick}
    >
      {isEditing ? (
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: '#0077ff',
            fontSize: '14px',
            fontWeight: 'bold',
            textAlign: 'center',
            width: '100%',
          }}
        />
      ) : (
        <span>{cluster.name}</span>
      )}
    </div>
  );
};

