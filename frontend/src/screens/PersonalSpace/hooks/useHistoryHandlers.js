import { useCallback } from 'react';

/**
 * 管理历史记录操作的 Hook
 * 处理撤销/重做逻辑
 */
export const useHistoryHandlers = ({
  history,
  historyIndex,
  setHistoryIndex,
  setDrawPaths,
  setTextElements,
  setSelectedIds,
  setImages,
  setOpengraphData,
}) => {
  // 撤销功能
  const handleUndo = useCallback(() => {
    if (!history || history.length === 0 || historyIndex < 0) return;
    
    const action = history[historyIndex];
    if (!action) return;
    console.log('[Undo] Undoing action:', action);
    
    switch (action.type) {
      case 'draw':
        if (action.action === 'add') {
          setDrawPaths(prev => {
            if (!prev || !Array.isArray(prev)) return [];
            return prev.slice(0, -1);
          });
        }
        break;
      case 'text':
        if (action.action === 'add' && action.element) {
          setTextElements(prev => {
            if (!prev || !Array.isArray(prev)) return [];
            return prev.filter(el => el.id !== action.element.id);
          });
        } else if (action.action === 'delete' && action.element) {
          setTextElements(prev => {
            if (!prev || !Array.isArray(prev)) return [action.element];
            return [...prev, action.element];
          });
        }
        break;
      case 'lasso':
        if (action.action === 'select') {
          const prevAction = (historyIndex > 0 && history && history[historyIndex - 1]) 
            ? history[historyIndex - 1] 
            : null;
          if (prevAction && prevAction.type === 'selection' && prevAction.prevSelectedIds) {
            setSelectedIds(new Set(prevAction.prevSelectedIds));
          } else {
            setSelectedIds(new Set());
          }
        }
        break;
      case 'selection':
        if (action.prevSelectedIds) {
          setSelectedIds(new Set(action.prevSelectedIds));
        }
        break;
      case 'image-move':
        if (action.prevImages && Array.isArray(action.prevImages)) {
          setImages(action.prevImages);
        }
        break;
      case 'opengraph-move':
        if (action.ogId && action.prevX !== undefined && action.prevY !== undefined) {
          setOpengraphData(prev =>
            prev.map(og =>
              og.id === action.ogId ? { ...og, x: action.prevX, y: action.prevY } : og
            )
          );
        }
        break;
      case 'image-delete':
        if (action.prevImages && Array.isArray(action.prevImages)) {
          setImages(action.prevImages);
        }
        break;
      case 'opengraph-delete':
        if (action.prevOG && Array.isArray(action.prevOG)) {
          setOpengraphData(action.prevOG);
        }
        break;
    }
    
    setHistoryIndex(prev => prev - 1);
  }, [history, historyIndex, setHistoryIndex, setDrawPaths, setTextElements, setSelectedIds, setImages, setOpengraphData]);

  // 重做功能
  const handleRedo = useCallback(() => {
    if (!history || !Array.isArray(history) || history.length === 0) return;
    if (historyIndex >= history.length - 1) return;
    
    const nextIndex = historyIndex + 1;
    const action = history[nextIndex];
    if (!action) return;
    console.log('[Redo] Redoing action:', action);
    
    switch (action.type) {
      case 'draw':
        if (action.action === 'add' && action.path) {
          setDrawPaths(prev => {
            if (!prev || !Array.isArray(prev)) return [action.path];
            return [...prev, action.path];
          });
        }
        break;
      case 'text':
        if (action.action === 'add' && action.element) {
          setTextElements(prev => {
            if (!prev || !Array.isArray(prev)) return [action.element];
            return [...prev, action.element];
          });
        } else if (action.action === 'delete' && action.element) {
          setTextElements(prev => {
            if (!prev || !Array.isArray(prev)) return [];
            return prev.filter(el => el.id !== action.element.id);
          });
        }
        break;
      case 'lasso':
        if (action.action === 'select') {
          setSelectedIds(new Set(action.selectedIds || []));
        }
        break;
      case 'selection':
        if (action.selectedIds) {
          setSelectedIds(new Set(action.selectedIds));
        }
        break;
      case 'image-move':
        setImages(prev => prev.map(img =>
          img.id === action.imageId ? { ...img, x: action.x, y: action.y } : img
        ));
        break;
      case 'opengraph-move':
        if (action.ogId && action.x !== undefined && action.y !== undefined) {
          setOpengraphData(prev =>
            prev.map(og =>
              og.id === action.ogId ? { ...og, x: action.x, y: action.y } : og
            )
          );
        }
        break;
      case 'image-delete':
        if (action.deletedIds && Array.isArray(action.deletedIds)) {
          setImages(prev => prev.filter(img => !action.deletedIds.includes(img.id)));
        }
        break;
      case 'opengraph-delete':
        if (action.deletedIds && Array.isArray(action.deletedIds)) {
          setOpengraphData(prev => prev.filter(og => !action.deletedIds.includes(og.id)));
        }
        break;
    }
    
    setHistoryIndex(nextIndex);
  }, [history, historyIndex, setHistoryIndex, setDrawPaths, setTextElements, setSelectedIds, setImages, setOpengraphData]);

  return {
    handleUndo,
    handleRedo,
  };
};

