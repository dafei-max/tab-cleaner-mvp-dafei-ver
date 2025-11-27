import React from "react";
import { AILabelTag } from "./AILabelTag";
import "./style.css";

export const AIClusteringPanel = ({ 
  show, 
  aiLabels, 
  onClose,
  onLabelRename,
  onLabelDelete,
  onAddLabel,
  onClassify,
  onDiscover,
  isClustering,
  maxLabels = 3
}) => {
  if (!show) return null;

  return (
    <div 
      className="aiclustering-panel"
      onClick={(e) => {
        // 点击面板本身时关闭
        if (e.target.classList.contains('aiclustering-panel')) {
          onClose();
        }
      }}
    >
      {/* 标签列表 */}
      {aiLabels.map((label, index) => (
        <AILabelTag
          key={index}
          label={label}
          index={index}
          onRename={(idx, newLabel) => {
            if (onLabelRename) onLabelRename(idx, newLabel);
          }}
          onDelete={(idx) => {
            if (onLabelDelete) onLabelDelete(idx);
          }}
        />
      ))}

      {/* 添加标签按钮 */}
      {aiLabels.length < maxLabels && (
        <div 
          className="add-tag"
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            if (onAddLabel) onAddLabel();
          }}
        >
          <div className="text-wrapper-19">+ 添加标签</div>
        </div>
      )}

      {/* 按标签分类按钮 */}
      <div 
        className="classify-button"
        style={{ 
          cursor: isClustering ? 'not-allowed' : 'pointer', 
          opacity: isClustering ? 0.6 : 1 
        }}
        onClick={async (e) => {
          e.stopPropagation();
          if (isClustering || aiLabels.length === 0) return;
          if (onClassify) await onClassify();
        }}
      >
        <div className="text-wrapper-20">按标签分类</div>
      </div>

      {/* AI 发现聚类按钮 */}
      <div 
        className="discover-button"
        style={{ 
          cursor: isClustering ? 'not-allowed' : 'pointer', 
          opacity: isClustering ? 0.6 : 1 
        }}
        onClick={async (e) => {
          e.stopPropagation();
          if (isClustering) return;
          if (onDiscover) await onDiscover();
        }}
      >
        <div className="text-wrapper-21">AI 发现聚类</div>
      </div>
    </div>
  );
};






