import React, { useState } from "react";
import { Component } from "../../components/Component";
import { getImageUrl } from "../../shared/utils";
import { DraggableImage } from "./DraggableImage";
import { initialImages } from "./imageData";
import "./style.css";

export const PersonalSpace = () => {
  // 管理图片位置和选中状态
  const [images, setImages] = useState(() =>
    initialImages.map(img => ({
      ...img,
      src: getImageUrl(img.imageName),
    }))
  );
  const [selectedIds, setSelectedIds] = useState(new Set());

  // 处理选中
  const handleSelect = (id, isMultiSelect) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (isMultiSelect) {
        // Shift 键：切换选中状态
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
      } else {
        // 普通点击：单选
        newSet.clear();
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 处理拖拽结束
  const handleDragEnd = (id, x, y) => {
    setImages(prev =>
      prev.map(img =>
        img.id === id ? { ...img, x, y } : img
      )
    );
  };

  return (
    <div className="personal-space">
      <div className="canvas">
        {images.map(img => (
          <DraggableImage
            key={img.id}
            id={img.id}
            className={img.className}
            src={img.src}
            alt={img.alt}
            initialX={img.x}
            initialY={img.y}
            width={img.width}
            height={img.height}
            isSelected={selectedIds.has(img.id)}
            onSelect={handleSelect}
            onDragEnd={handleDragEnd}
          />
        ))}

        {/* 保留非图片元素 */}
        <div className="i-leave-you-love-and" />
        <div className="live-NEAR" />
        <div className="flow-on-the-edge" />

        <div className="text-wrapper-15">视觉参考</div>
      </div>

      <div className="space-function">
        <div className="add-new-session">
          <img className="image-10" alt="Image" src={getImageUrl("3.svg")} />

          <div className="text-wrapper-16">加新洗衣筐</div>
        </div>

        <div className="share">
          <img className="image-11" alt="Image" src={getImageUrl("4.svg")} />

          <div className="text-wrapper-17">分享</div>
        </div>
      </div>

      <div className="space-title">
        <img
          className="basket-icon"
          alt="Basket icon"
          src={getImageUrl("basket-icon-1.png")}
        />

        <div className="text-wrapper-18">我的收藏</div>
      </div>

      <div className="search-bar">
        <img className="image-12" alt="Image" src={getImageUrl("5.svg")} />

        <div className="text-wrapper-19">大促物料参考</div>
      </div>

      <img
        className="view-buttons"
        alt="View buttons"
        src={getImageUrl("viewbuttons-1.svg")}
      />

      <Component className="side-panel" property1="one" />
      <div className="aiclustering-panel">
        <div className="design-tag">
          <div className="text-wrapper-20">设计</div>
        </div>

        <div className="workdoc-tag">
          <div className="text-wrapper-21">工作文档</div>
        </div>

        <div className="add-tag">
          <div className="text-wrapper-22"></div>
        </div>

        <div className="upload">
          <div className="upload-tag">
            <div className="image-wrapper">
              <img className="image-13" alt="Image" src={getImageUrl("1.svg")} />
            </div>
          </div>
        </div>

        <div className="rectangle" />

        <div className="auto-cluster">
          <div className="frame-wrapper">
            <div className="frame-10">
              <div className="text-wrapper-23">自动聚类</div>
            </div>
          </div>
        </div>
      </div>

      <div className="tool-sets">
        <div className="tool">
          <img
            className="lasso-button"
            alt="Lasso button"
            src={getImageUrl("lasso-button-1.svg")}
          />

          <img
            className="draw-button"
            alt="Draw button"
            src={getImageUrl("draw-button-1.svg")}
          />

          <img
            className="text-button"
            alt="Text button"
            src={getImageUrl("text-button-1.svg")}
          />
        </div>

        <div className="move">
          <img
            className="last-move-button"
            alt="Last move button"
            src={getImageUrl("last-move-button-1.svg")}
          />

          <img
            className="next-move-button"
            alt="Next move button"
            src={getImageUrl("next-move-button-1.svg")}
          />
        </div>

        <div className="AI-clustering-button">
          <img
            className="ai-clustering-icon"
            alt="Ai clustering icon"
            src={getImageUrl("ai-clustering-icon-1.svg")}
          />

          <div className="text-wrapper-24">AI 聚类</div>
        </div>
      </div>
    </div>
  );
};
