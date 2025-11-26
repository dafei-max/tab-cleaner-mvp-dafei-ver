import { useState, useRef, useEffect, useCallback } from 'react';
import { getImageUrl } from '../../../shared/utils';

/**
 * 管理画布交互逻辑的 Hook
 * 包括：缩放、平移、工具、光标样式、拖拽等
 */
export const useCanvasInteractions = (activeTool, containerRef) => {
  const canvasRef = useRef(null);
  
  // 画布缩放和平移状态
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  // 拖拽画布状态
  const [isPanning, setIsPanning] = useState(false);
  const [panStartMouse, setPanStartMouse] = useState({ x: 0, y: 0 });
  const [panStartPan, setPanStartPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // 根据工具设置光标样式
  const getCanvasCursor = useCallback(() => {
    switch (activeTool) {
      case 'draw': {
        const drawIconUrl = getImageUrl('draw-button-1.svg');
        return `url(${drawIconUrl}) 8 8, crosshair`;
      }
      case 'lasso': {
        const lassoIconUrl = getImageUrl('lasso-button-1.svg');
        return `url(${lassoIconUrl}) 10 10, crosshair`;
      }
      case 'text':
        return 'text';
      default:
        return 'default';
    }
  }, [activeTool]);

  // 判断是否点击在画布空白区域
  const isBlankCanvasTarget = useCallback((e) => {
    const target = e.target;
    if (!target) return false;
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const isCanvas = target === canvas || (target.classList && target.classList.contains('canvas'));
    const inPersonalSpace = target.closest('.personal-space');
    
    if (target.closest('img') ||
        target.closest('.tool-button-wrapper') ||
        target.closest('.canvas-text-element') ||
        target.closest('input') ||
        target.closest('svg') ||
        target.closest('path')) {
      return false;
    }
    
    return isCanvas || !!inPersonalSpace;
  }, []);

  // 处理空格键按下/释放
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !activeTool) {
        e.preventDefault();
        setIsSpacePressed(true);
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'grab';
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
        if (canvasRef.current) {
          canvasRef.current.style.cursor = getCanvasCursor();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTool, getCanvasCursor]);

  // 处理鼠标拖拽画布
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const canvas = canvasRef.current;

    const handleMouseDown = (e) => {
      const leftOnBlank = (e.button === 0) && isBlankCanvasTarget(e);
      const shouldPan = leftOnBlank || e.button === 1 || (isSpacePressed && e.button === 0);
      
      if (shouldPan && !activeTool) {
        e.preventDefault();
        setIsPanning(true);
        setPanStartMouse({ x: e.clientX, y: e.clientY });
        setPanStartPan({ x: pan.x, y: pan.y });
        if (canvas) {
          canvas.style.cursor = 'grabbing';
        }
      }
    };

    const handleMouseMove = (e) => {
      if (isPanning) {
        e.preventDefault();
        const dx = e.clientX - panStartMouse.x;
        const dy = e.clientY - panStartMouse.y;
        setPan({ x: panStartPan.x + dx, y: panStartPan.y + dy });
      }
    };

    const handleMouseUp = (e) => {
      if (isPanning) {
        e.preventDefault();
        setIsPanning(false);
        if (canvas) {
          canvas.style.cursor = isSpacePressed ? 'grab' : getCanvasCursor();
        }
      }
    };

    const handleAuxClick = (e) => {
      if (e.button === 1 && !activeTool) {
        e.preventDefault();
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('auxclick', handleAuxClick);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('auxclick', handleAuxClick);
    };
  }, [isPanning, panStartMouse, panStartPan, isSpacePressed, activeTool, pan, containerRef, isBlankCanvasTarget, getCanvasCursor]);

  // 处理鼠标滚轮缩放
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e) => {
      if (activeTool || isPanning) {
        return;
      }
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      
      if (
        mouseX < rect.left ||
        mouseX > rect.right ||
        mouseY < rect.top ||
        mouseY > rect.bottom
      ) {
        return;
      }
      
      e.preventDefault();
      
      const viewportCenterX = window.innerWidth / 2;
      const viewportCenterY = window.innerHeight / 2;
      const offsetX = mouseX - viewportCenterX;
      const offsetY = mouseY - viewportCenterY;
      const contentX = (offsetX - pan.x) / zoom;
      const contentY = (offsetY - pan.y) / zoom;
      
      const isAccelerated = e.ctrlKey || e.metaKey;
      const baseZoomSpeed = 0.05;
      const zoomSpeed = isAccelerated ? baseZoomSpeed * 2 : baseZoomSpeed;
      const zoomDelta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
      const newZoom = Math.max(0.05, Math.min(10, zoom + zoomDelta));
      
      const newPanX = offsetX - contentX * newZoom;
      const newPanY = offsetY - contentY * newZoom;
      
      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [activeTool, zoom, pan, isPanning]);

  return {
    canvasRef,
    zoom,
    pan,
    isPanning,
    isSpacePressed,
    getCanvasCursor,
    isBlankCanvasTarget,
  };
};

