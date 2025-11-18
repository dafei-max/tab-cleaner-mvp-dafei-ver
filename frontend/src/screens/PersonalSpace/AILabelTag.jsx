import React, { useState } from "react";

/**
 * AI 聚类标签组件
 * 支持点击重命名，右上角删除按钮
 */
export const AILabelTag = ({ label, index, onRename, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label);

  // 当外部 label 改变时，同步内部状态
  React.useEffect(() => {
    setEditLabel(label);
  }, [label]);

  return (
    <div 
      className={index === 0 ? "design-tag" : "workdoc-tag"}
      style={{ cursor: 'pointer', position: 'relative' }}
      onClick={(e) => {
        e.stopPropagation();
        // 点击标签重命名（不是删除）
        setIsEditing(true);
      }}
    >
      {isEditing ? (
        <input
          type="text"
          value={editLabel}
          onChange={(e) => setEditLabel(e.target.value)}
          onBlur={() => {
            setIsEditing(false);
            if (editLabel.trim() && editLabel !== label && onRename) {
              onRename(index, editLabel.trim());
            } else {
              setEditLabel(label);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.target.blur();
            } else if (e.key === 'Escape') {
              setEditLabel(label);
              setIsEditing(false);
            }
          }}
          autoFocus
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'white',
            fontSize: 'inherit',
            fontFamily: 'inherit',
            textAlign: 'center',
            width: '100%',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className={index === 0 ? "text-wrapper-20" : "text-wrapper-21"}>{label}</div>
      )}
      {/* 删除按钮（右上角） */}
      <div
        style={{
          position: 'absolute',
          top: '-6px',
          right: '-6px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: '#999',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '12px',
          color: 'white',
          zIndex: 10,
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (onDelete) {
            onDelete(index);
          }
        }}
      >
        ×
      </div>
    </div>
  );
};



