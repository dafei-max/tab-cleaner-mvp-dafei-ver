import React from "react";
import { DraggableImage } from "./DraggableImage";
import { ClusterLabel } from "./ClusterLabel";
import { CanvasTools } from "./CanvasTools";
import "./style.css";

/**
 * Calculate card dimensions based on OpenGraph data
 */
const calculateCardSize = (og) => {
  const isDocCard = og.is_doc_card || false;
  let cardWidth, cardHeight;

  if (isDocCard) {
    cardWidth = 200;
    cardHeight = 150;
  } else {
    const BASE_HEIGHT = 120;
    if (og.image_width && og.image_height) {
      const aspectRatio = og.image_width / og.image_height;
      cardHeight = BASE_HEIGHT;
      cardWidth = BASE_HEIGHT * aspectRatio;
    } else if (og.original_width && og.original_height) {
      const aspectRatio = og.original_width / og.original_height;
      cardHeight = BASE_HEIGHT;
      cardWidth = BASE_HEIGHT * aspectRatio;
    } else if (og.width && og.height) {
      const aspectRatio = og.width / og.height;
      cardHeight = BASE_HEIGHT;
      cardWidth = BASE_HEIGHT * aspectRatio;
    } else {
      cardHeight = BASE_HEIGHT;
      cardWidth = BASE_HEIGHT * (16/9);
    }
  }

  return { cardWidth, cardHeight, isDocCard };
};

export const RadialCanvas = ({
  canvasRef,
  containerRef,
  showOriginalImages,
  images,
  opengraphData,
  searchQuery,
  selectedIds,
  clusters,
  clusterDragStartRef,
  zoom,
  pan,
  isPanning,
  isSpacePressed,
  activeTool,
  drawPaths,
  setDrawPaths,
  textElements,
  setTextElements,
  onSelect,
  onDragEnd,
  onCanvasClick,
  onCardDoubleClick,
  onClusterRename,
  onClusterDrag,
  onLassoSelect,
  onHistoryChange,
  getCanvasCursor,
}) => {
  // 找到最接近的搜索结果
  const hasSearchResults = searchQuery.trim() && opengraphData.some(og => og.similarity !== undefined && og.similarity > 0);
  const topResult = hasSearchResults
    ? opengraphData.find(og => og.similarity !== undefined && og.similarity > 0)
    : null;
  const topResultId = topResult?.id;

  return (
    <div 
      className="canvas" 
      ref={canvasRef}
      style={{ 
        cursor: isPanning ? 'grabbing' : (isSpacePressed ? 'grab' : getCanvasCursor()),
        transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        transformOrigin: 'center center',
        transition: isPanning ? 'none' : 'transform 0.1s ease-out',
      }}
      onClick={onCanvasClick}
    >
      {/* 原有图片（仅在未加载 OpenGraph 时显示） */}
      {showOriginalImages && images.map(img => (
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
          onSelect={onSelect}
          onDragEnd={onDragEnd}
          zoom={zoom}
          pan={pan}
        />
      ))}

      {/* OpenGraph 图片 */}
      {!showOriginalImages && opengraphData && Array.isArray(opengraphData) && opengraphData.length > 0 && opengraphData.map((og) => {
        if (!og || typeof og !== 'object' || !og.id) {
          return null;
        }
        
        const x = og.x ?? 720;
        const y = og.y ?? 512;
        const { cardWidth, cardHeight, isDocCard } = calculateCardSize(og);
        const isTopResult = topResultId === og.id;

        return (
          <DraggableImage
            key={og.id}
            id={og.id}
            className={`opengraph-image ${isDocCard ? 'doc-card' : ''} ${isTopResult ? 'top-result' : ''}`}
            src={og.image || 'https://via.placeholder.com/120'}
            alt={og.title || og.url}
            initialX={x}
            initialY={y}
            width={cardWidth}
            height={cardHeight}
            animationDelay={og.animationDelay || 0}
            isSelected={selectedIds.has(og.id)}
            onSelect={onSelect}
            zoom={zoom}
            pan={pan}
            onDragEnd={onDragEnd}
            onClick={() => onCardDoubleClick(og)}
          />
        );
      })}

      {/* 聚类中心标签 */}
      {clusters.map((cluster) => (
        <ClusterLabel
          key={cluster.id}
          cluster={cluster}
          onRename={onClusterRename}
          onDrag={onClusterDrag}
        />
      ))}

      {/* 保留非图片元素 */}
      <div className="i-leave-you-love-and" />
      <div className="live-NEAR" />
      <div className="flow-on-the-edge" />
      <div className="text-wrapper-15">视觉参考</div>

      {/* 画布工具层 */}
      <CanvasTools
        canvasRef={canvasRef}
        activeTool={activeTool}
        onLassoSelect={onLassoSelect}
        selectedIds={selectedIds}
        drawPaths={drawPaths}
        setDrawPaths={setDrawPaths}
        textElements={textElements}
        setTextElements={setTextElements}
        onHistoryChange={onHistoryChange}
      />
    </div>
  );
};

