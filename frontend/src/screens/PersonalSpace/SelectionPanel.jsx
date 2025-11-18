import React, { useState } from "react";
import "./SelectionPanel.css";

/**
 * 选中面板组件
 * 当有图片被选中时，显示在右侧的操作面板
 */
export const SelectionPanel = ({ 
  selectedCount, 
  onDelete, 
  onRename, 
  onOpen, 
  onDownload, 
  onAIInsight,
  groupName = "未命名分组"
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newGroupName, setNewGroupName] = useState(groupName);

  const handleRename = () => {
    if (isRenaming) {
      // 确认重命名
      if (onRename && newGroupName.trim()) {
        onRename(newGroupName.trim());
      }
      setIsRenaming(false);
    } else {
      // 开始重命名
      setIsRenaming(true);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setNewGroupName(groupName);
      setIsRenaming(false);
    }
  };

  return (
    <div className="selection-panel">
      <div className="selection-panel-info-card">
        <div className="selection-panel-status-sentence">
          <div className="selection-panel-text-wrapper">您已选择</div>
          <div className="selection-panel-div">网页</div>
          <div className="selection-panel-selected-number">{selectedCount}个</div>
        </div>

        <div className="selection-panel-button-function">
          <div className="selection-panel-text-wrapper">此组命名为</div>
          {isRenaming ? (
            <input
              className="selection-panel-rename-input"
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleRename}
              autoFocus
              style={{
                fontFamily: '"FZLanTingYuanS-R-GB-Regular", Helvetica',
                fontSize: '10px',
                color: '#0077ff',
                border: '1px solid #0077ff',
                borderRadius: '2px',
                padding: '0 4px',
                outline: 'none',
                background: '#fff',
              }}
            />
          ) : (
            <div className="selection-panel-rename-string">{groupName}</div>
          )}
        </div>
      </div>

      <div className="selection-panel-frame">
        <div 
          className="selection-panel-delete-button"
          onClick={onDelete}
          style={{ cursor: 'pointer' }}
        >
          <div className="selection-panel-text-wrapper-2">删除</div>
        </div>

        <div 
          className="selection-panel-name-button"
          onClick={handleRename}
          style={{ cursor: 'pointer' }}
        >
          <div className="selection-panel-text-wrapper-3">命名分组</div>
        </div>

        <div 
          className="selection-panel-openurl-button"
          onClick={onOpen}
          style={{ cursor: 'pointer' }}
        >
          <div className="selection-panel-text-wrapper-4">打开</div>
        </div>

        <div 
          className="selection-panel-download-url-button"
          onClick={onDownload}
          style={{ cursor: 'pointer' }}
        >
          <div className="selection-panel-text-wrapper-5">下载链接</div>
        </div>

        <div 
          className="selection-panel-div-wrapper"
          onClick={onAIInsight}
          style={{ cursor: 'pointer' }}
        >
          <div className="selection-panel-text-wrapper-6">AI洞察</div>
        </div>
      </div>
    </div>
  );
};




