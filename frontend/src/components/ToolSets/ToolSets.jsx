import React from "react";
import { ToolButton } from "../ToolButton";
import { getImageUrl } from "../../shared/utils";

/**
 * 工具集组件
 * 包含套索、绘画、文字工具，以及撤销/重做按钮和 AI 聚类按钮
 */
export const ToolSets = ({
  activeTool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onAIClusteringClick,
}) => {
  return (
    <div className="tool-sets">
      <div className="tool">
        <ToolButton
          className="lasso-button"
          alt="Lasso button"
          src={getImageUrl("lasso-button-1.svg")}
          tooltip="套索工具"
          isActive={activeTool === 'lasso'}
          onClick={() => onToolChange(activeTool === 'lasso' ? null : 'lasso')}
        />

        <ToolButton
          className="draw-button"
          alt="Draw button"
          src={getImageUrl("draw-button-1.svg")}
          tooltip="绘画工具"
          isActive={activeTool === 'draw'}
          onClick={() => onToolChange(activeTool === 'draw' ? null : 'draw')}
        />

        <ToolButton
          className="text-button"
          alt="Text button"
          src={getImageUrl("text-button-1.svg")}
          tooltip="文字工具"
          isActive={activeTool === 'text'}
          onClick={() => onToolChange(activeTool === 'text' ? null : 'text')}
        />
      </div>

      <div className="move">
        <img
          className="last-move-button"
          alt="Last move button"
          src={getImageUrl("last-move-button-1.svg")}
          onClick={onUndo}
          style={{ cursor: 'pointer', opacity: canUndo ? 1 : 0.5 }}
          title="撤销 (Undo)"
        />

        <img
          className="next-move-button"
          alt="Next move button"
          src={getImageUrl("next-move-button-1.svg")}
          onClick={onRedo}
          style={{ cursor: 'pointer', opacity: canRedo ? 1 : 0.5 }}
          title="重做 (Redo)"
        />
      </div>

      <div 
        className="AI-clustering-button"
        onClick={onAIClusteringClick}
        style={{ cursor: 'pointer' }}
      >
        <img
          className="ai-clustering-icon"
          alt="Ai clustering icon"
          src={getImageUrl("ai-clustering-icon-1.svg")}
        />

        <div className="text-wrapper-24">AI 聚类</div>
      </div>
    </div>
  );
};

