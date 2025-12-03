import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SessionMasonryGrid } from '../SessionMasonryGrid';
import { RadialCanvas } from '../RadialCanvas';
// import { ScrollSpyIndicator } from '../ScrollSpyIndicator'; // 已禁用，避免影响正常滚动

/**
 * 视图容器组件
 * 管理 masonry 和 radial 视图的切换
 */
export const ViewContainer = ({
  viewMode,
  sessions,
  currentSessionId,
  searchQuery,
  hasActiveSearch,
  // Masonry props
  onCardClick,
  onSessionDelete,
  onSessionOpenAll,
  sessionContainerRef,
  onSessionFocus,
  // Radial props
  canvasRef,
  containerRef,
  showOriginalImages,
  images,
  opengraphData,
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
  onDelete,
  onOpenLink,
  onClusterRename,
  onClusterDrag,
  onLassoSelect,
  onHistoryChange,
  getCanvasCursor,
}) => {
  // ✅ 修复：确保 sessions 是数组
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  
  return (
    <AnimatePresence mode="wait">
      {viewMode === 'masonry' ? (
        <motion.div
          key="masonry"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          style={{ pointerEvents: hasActiveSearch ? 'none' : 'auto' }}
        >
          <SessionMasonryGrid
            sessions={safeSessions}
            searchQuery={searchQuery}
            onCardClick={onCardClick}
            onSessionDelete={onSessionDelete}
            onSessionOpenAll={onSessionOpenAll}
            searchBarHeight={200}
            containerRef={sessionContainerRef}
            onSessionFocus={onSessionFocus}
          />
          {/* Scroll Spy Indicator - 已禁用，避免影响正常滚动 */}
          {/* {safeSessions.length > 1 && (
            <ScrollSpyIndicator 
              sessions={safeSessions} 
              containerRef={sessionContainerRef}
              activeSessionId={currentSessionId}
              onActiveSessionChange={onSessionFocus}
            />
          )} */}
        </motion.div>
      ) : (
        <motion.div
          key="radial"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          style={{ pointerEvents: hasActiveSearch ? 'none' : 'auto' }}
        >
          <RadialCanvas
            canvasRef={canvasRef}
            containerRef={containerRef}
            showOriginalImages={showOriginalImages}
            images={images}
            opengraphData={opengraphData}
            searchQuery={searchQuery}
            selectedIds={selectedIds}
            clusters={clusters}
            clusterDragStartRef={clusterDragStartRef}
            zoom={zoom}
            pan={pan}
            isPanning={isPanning}
            isSpacePressed={isSpacePressed}
            activeTool={activeTool}
            drawPaths={drawPaths}
            setDrawPaths={setDrawPaths}
            textElements={textElements}
            setTextElements={setTextElements}
            onSelect={onSelect}
            onDragEnd={onDragEnd}
            onCanvasClick={onCanvasClick}
            onCardDoubleClick={onCardDoubleClick}
            onDelete={onDelete}
            onOpenLink={onOpenLink}
            onClusterRename={onClusterRename}
            onClusterDrag={onClusterDrag}
            onLassoSelect={onLassoSelect}
            onHistoryChange={onHistoryChange}
            getCanvasCursor={getCanvasCursor}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};



