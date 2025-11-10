import React, { useState, useRef, useEffect } from "react";
import { Component } from "../../components/Component";
import { SearchBar } from "../../components/SearchBar";
import { ToolSets } from "../../components/ToolSets";
import { getImageUrl } from "../../shared/utils";
import { DraggableImage } from "./DraggableImage";
import { initialImages } from "./imageData";
import { CanvasTools } from "./CanvasTools";
import { OpenGraphCard } from "./OpenGraphCard";
import { SelectionPanel } from "./SelectionPanel";
import { ClusterLabel } from "./ClusterLabel";
import { AILabelTag } from "./AILabelTag";
import { useHistory } from "../../hooks/useHistory";
import { useSearch } from "../../hooks/useSearch";
import { calculateRadialLayout } from "../../utils/radialLayout";
import { handleLassoSelect as handleLassoSelectUtil } from "../../utils/selection";
import { calculateMultipleClustersLayout } from "../../utils/clusterLayout";
import { createManualCluster, classifyByLabels, discoverClusters } from "../../shared/api";
import { calculateStaggerDelay, CLUSTER_ANIMATION } from "../../motion";
import "./style.css";

export const PersonalSpace = () => {
  // OpenGraph 数据
  const [opengraphData, setOpengraphData] = useState([]);
  const [selectedOG, setSelectedOG] = useState(null); // 选中的 OpenGraph 卡片（用于显示详情）
  const lastOGClickRef = useRef({ time: 0, id: null }); // 用于双击检测
  
  // 管理图片位置和选中状态
  // 如果有 OpenGraph 数据，隐藏原有图片；否则显示原有图片
  const [showOriginalImages, setShowOriginalImages] = useState(true);
  const [images, setImages] = useState(() =>
    initialImages.map(img => ({
      ...img,
      src: getImageUrl(img.imageName),
    }))
  );
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeTool, setActiveTool] = useState(null); // 'draw' | 'lasso' | 'text' | null
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // 画布缩放和平移状态
  const [zoom, setZoom] = useState(1); // 缩放比例，1 = 100%
  const [pan, setPan] = useState({ x: 0, y: 0 }); // 平移位置
  
  // 拖拽画布状态
  const [isPanning, setIsPanning] = useState(false);
  // 记录拖拽开始时的鼠标位置与初始 pan（避免因 transform 导致的 rect 变化抖动）
  const [panStartMouse, setPanStartMouse] = useState({ x: 0, y: 0 });
  const [panStartPan, setPanStartPan] = useState({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // 画布工具状态（由父组件管理，支持撤销/重做）
  const [drawPaths, setDrawPaths] = useState([]);
  const [textElements, setTextElements] = useState([]);
  
  // 撤销/重做历史记录（使用 hook）
  const { history, historyIndex, addToHistory, canUndo, canRedo, setHistoryIndex } = useHistory(50);

  // AI 聚类面板显示状态
  const [showAIClusteringPanel, setShowAIClusteringPanel] = useState(false);

  // 选中分组名称
  const [selectedGroupName, setSelectedGroupName] = useState("未命名分组");

  // 聚类相关状态
  const [clusters, setClusters] = useState([]); // 所有聚类列表
  const [isClustering, setIsClustering] = useState(false); // 是否正在聚类
  const [aiLabels, setAiLabels] = useState(["设计", "工作文档"]); // AI 聚类标签（预设两个）

  // 搜索相关状态（使用 hook）
  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    opengraphWithEmbeddings,
    searchResults,
    performSearch,
    clearSearch,
  } = useSearch(opengraphData);

  // 从 storage 加载 OpenGraph 数据
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['opengraphData'], (result) => {
        try {
          if (result.opengraphData) {
            // 处理两种可能的数据结构：{data: [...]} 或直接是数组
            const ogData = Array.isArray(result.opengraphData) 
              ? result.opengraphData 
              : (result.opengraphData.data || []);
            
            console.log('[PersonalSpace] Loaded OpenGraph data:', ogData);
            
            // 确保 ogData 是数组
            if (!Array.isArray(ogData)) {
              console.warn('[PersonalSpace] OpenGraph data is not an array:', ogData);
              return;
            }
            
            // 过滤掉失败的数据
            const validOG = ogData.filter(item => 
              item && 
              typeof item === 'object' && 
              item.success && 
              item.image
            );
            
            if (validOG.length > 0) {
              setShowOriginalImages(false); // 隐藏原有图片
              
              // 计算放射状布局位置，并为每个 OpenGraph 图片生成唯一 ID
              const positionedOG = calculateRadialLayout(validOG).map((og, index) => ({
                ...og,
                id: `og-${index}-${Date.now()}`, // 生成唯一 ID
              }));
              setOpengraphData(positionedOG);
            }
          }
        } catch (error) {
          console.error('[PersonalSpace] Error loading OpenGraph data:', error);
        }
      });
    }
  }, []);

  // 执行搜索（使用 hook）
  const handleSearch = async () => {
    const results = await performSearch(searchQuery, calculateRadialLayout);
    if (results && results.length > 0) {
      // 确保搜索结果包含 embedding（从 opengraphWithEmbeddings 中获取）
      const resultsWithEmbedding = results.map(result => {
        // 尝试从 opengraphWithEmbeddings 中找到对应的 embedding
        const withEmbedding = opengraphWithEmbeddings.find(item => 
          item.url === result.url || item.tab_id === result.tab_id
        );
        if (withEmbedding) {
          return {
            ...result,
            text_embedding: withEmbedding.text_embedding,
            image_embedding: withEmbedding.image_embedding,
            embedding: withEmbedding.embedding,
          };
        }
        return result;
      });
      setOpengraphData(resultsWithEmbedding);
      setShowOriginalImages(false);
    }
  };

  // 清空搜索（使用 hook）
  const handleClearSearch = () => {
    clearSearch();
    // 恢复原始数据
    if (opengraphData.length > 0) {
      const originalData = calculateRadialLayout(opengraphData);
      setOpengraphData(originalData);
    }
  };

  // 处理选中
  const handleSelect = (id, isMultiSelect) => {
    setSelectedIds(prev => {
      const prevSelected = new Set(prev);
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
      // 记录选中状态到历史
      addToHistory({ type: 'selection', action: 'select', selectedIds: Array.from(newSet), prevSelectedIds: Array.from(prevSelected) });
      return newSet;
    });
  };

  // 处理拖拽结束
  const handleDragEnd = (id, x, y) => {
    // 如果是 OpenGraph 图片
    if (id.startsWith('og-')) {
      setOpengraphData(prev =>
        prev.map(og =>
          og.id === id ? { ...og, x, y } : og
        )
      );
      // 记录到历史
      const prevOG = opengraphData.find(og => og.id === id);
      if (prevOG) {
        addToHistory({ 
          type: 'opengraph-move', 
          action: 'move', 
          ogId: id, 
          x, 
          y, 
          prevX: prevOG.x, 
          prevY: prevOG.y 
        });
      }
    } else {
      // 原有图片
      setImages(prev =>
        prev.map(img =>
          img.id === id ? { ...img, x, y } : img
        )
      );
      // 记录到历史
      const prevImg = images.find(img => img.id === id);
      if (prevImg) {
        addToHistory({ 
          type: 'image-move', 
          action: 'move', 
          imageId: id, 
          x, 
          y, 
          prevImages: images 
        });
      }
    }
  };

  // 套索选择（使用工具函数）
  const handleLassoSelect = (lassoPath) => {
    const prevSelected = new Set(selectedIds);
    const selected = handleLassoSelectUtil(lassoPath, images, opengraphData);
    setSelectedIds(selected);
    // 记录选中状态到历史
    addToHistory({ 
      type: 'selection', 
      action: 'select', 
      selectedIds: Array.from(selected), 
      prevSelectedIds: Array.from(prevSelected) 
    });
  };

  // 处理画布工具的历史记录变化
  const handleHistoryChange = (action) => {
    addToHistory(action);
  };

  // 撤销功能
  const handleUndo = () => {
    if (!history || history.length === 0 || historyIndex < 0) return;
    
    const action = history[historyIndex];
    if (!action) return;
    console.log('[Undo] Undoing action:', action);
    
    // 根据操作类型执行撤销
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
          // 套索选择的撤销需要恢复之前的选中状态
          // 注意：这里需要从历史记录中查找前一个选中状态
          // 简化处理：如果历史记录中有前一个选中操作，恢复它
          const prevAction = (historyIndex > 0 && history && history[historyIndex - 1]) ? history[historyIndex - 1] : null;
          if (prevAction && prevAction.type === 'selection' && prevAction.prevSelectedIds) {
            setSelectedIds(new Set(prevAction.prevSelectedIds));
          } else {
            // 如果没有前一个选中状态，清空选中
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
        // 恢复图片位置
        if (action.prevImages && Array.isArray(action.prevImages)) {
          setImages(action.prevImages);
        }
        break;
          case 'opengraph-move':
            // 恢复 OpenGraph 图片位置
            if (action.ogId && action.prevX !== undefined && action.prevY !== undefined) {
              setOpengraphData(prev =>
                prev.map(og =>
                  og.id === action.ogId ? { ...og, x: action.prevX, y: action.prevY } : og
                )
              );
            }
            break;
          case 'image-delete':
            // 恢复删除的图片
            if (action.prevImages && Array.isArray(action.prevImages)) {
              setImages(action.prevImages);
            }
            break;
          case 'opengraph-delete':
            // 恢复删除的 OpenGraph 图片
            if (action.prevOG && Array.isArray(action.prevOG)) {
              setOpengraphData(action.prevOG);
            }
            break;
    }
    
    setHistoryIndex(prev => prev - 1);
  };

  // 重做功能
  const handleRedo = () => {
    if (!history || !Array.isArray(history) || history.length === 0) return;
    if (historyIndex >= history.length - 1) return;
    
    const nextIndex = historyIndex + 1;
    const action = history[nextIndex];
    if (!action) return;
    console.log('[Redo] Redoing action:', action);
    
    // 根据操作类型执行重做
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
        // 恢复图片位置
        setImages(prev => prev.map(img =>
          img.id === action.imageId ? { ...img, x: action.x, y: action.y } : img
        ));
        break;
          case 'opengraph-move':
            // 恢复 OpenGraph 图片位置
            if (action.ogId && action.x !== undefined && action.y !== undefined) {
              setOpengraphData(prev =>
                prev.map(og =>
                  og.id === action.ogId ? { ...og, x: action.x, y: action.y } : og
                )
              );
            }
            break;
          case 'image-delete':
            // 重做删除（再次删除）
            if (action.deletedIds && Array.isArray(action.deletedIds)) {
              setImages(prev => prev.filter(img => !action.deletedIds.includes(img.id)));
            }
            break;
          case 'opengraph-delete':
            // 重做删除（再次删除）
            if (action.deletedIds && Array.isArray(action.deletedIds)) {
              setOpengraphData(prev => prev.filter(og => !action.deletedIds.includes(og.id)));
            }
            break;
    }
    
    setHistoryIndex(nextIndex);
  };

  // 根据工具设置光标样式（使用 SVG 图标）
  const getCanvasCursor = () => {
    switch (activeTool) {
      case 'draw': {
        const drawIconUrl = getImageUrl('draw-button-1.svg');
        return `url(${drawIconUrl}) 8 8, crosshair`; // 8 8 是热点位置（图标中心）
      }
      case 'lasso': {
        const lassoIconUrl = getImageUrl('lasso-button-1.svg');
        return `url(${lassoIconUrl}) 10 10, crosshair`; // 10 10 是热点位置
      }
      case 'text':
        return 'text';
      default:
        return 'default';
    }
  };

  // 判断是否点击在画布空白区域（而非图片/控件等）
  const isBlankCanvasTarget = (e) => {
    const target = e.target;
    if (!target) return false;
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const isCanvas = target === canvas || (target.classList && target.classList.contains('canvas'));
    const inPersonalSpace = target.closest('.personal-space');
    // 排除图片、工具按钮、文字元素、输入框、SVG 等
    if (target.closest('img') ||
        target.closest('.tool-button-wrapper') ||
        target.closest('.canvas-text-element') ||
        target.closest('input') ||
        target.closest('svg') ||
        target.closest('path')) {
      return false;
    }
    // 允许：点击在 canvas 本身，或点击在个人空间背景（不在图片/控件上）
    return isCanvas || !!inPersonalSpace;
  };

      // 处理点击空白处取消选择
      const handleCanvasClick = (e) => {
        // 如果有工具激活（套索、绘画、文字），不处理点击取消选择
        // 因为工具需要处理自己的点击事件
        if (activeTool) {
          return;
        }
        
        // 如果点击的是 canvas 本身（不是图片、工具按钮、文字元素等）
        // 排除点击图片、工具按钮、文字元素、SVG 路径等
        if (
          e.target === canvasRef.current || 
          (e.target.classList && e.target.classList.contains('canvas')) ||
          (e.target.tagName === 'DIV' && e.target.classList.contains('canvas'))
        ) {
          // 确保不是点击了图片、按钮或其他元素
          if (!e.target.closest('img') && 
              !e.target.closest('.tool-button-wrapper') && 
              !e.target.closest('.canvas-text-element') &&
              !e.target.closest('input') &&
              !e.target.closest('svg') &&
              !e.target.closest('path')) {
            setSelectedIds(new Set());
          }
        }
      };

      // 处理空格键按下/释放（用于拖拽画布）
      useEffect(() => {
        const handleKeyDown = (e) => {
          if (e.code === 'Space' && !activeTool) {
            e.preventDefault();
            setIsSpacePressed(true);
            // 改变光标为抓取手型
            if (canvasRef.current) {
              canvasRef.current.style.cursor = 'grab';
            }
          }
        };

        const handleKeyUp = (e) => {
          if (e.code === 'Space') {
            setIsSpacePressed(false);
            setIsPanning(false);
            // 恢复光标
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
      }, [activeTool]);

      // 处理鼠标拖拽画布（空格键 + 拖拽 或 中键拖拽）
      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleMouseDown = (e) => {
          // 左键点击画布空白处即可拖拽；中键拖拽；或空格+左键
          const leftOnBlank = (e.button === 0) && isBlankCanvasTarget(e);
          const shouldPan = leftOnBlank || e.button === 1 || (isSpacePressed && e.button === 0);
          
          if (shouldPan && !activeTool) {
            e.preventDefault();
            setIsPanning(true);
            // 记录开始时的屏幕坐标与初始 pan
            setPanStartMouse({ x: e.clientX, y: e.clientY });
            setPanStartPan({ x: pan.x, y: pan.y });
            canvas.style.cursor = 'grabbing';
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
            canvas.style.cursor = isSpacePressed ? 'grab' : getCanvasCursor();
          }
        };

        // 阻止中键默认行为（打开新标签页）
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
      }, [isPanning, panStartMouse, panStartPan, isSpacePressed, activeTool, pan]);

      // 处理鼠标滚轮缩放（优化版，更平滑）
      useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e) => {
          // 如果正在使用工具或正在拖拽，不处理滚轮事件
          if (activeTool || isPanning) {
            return;
          }
          
          // 检查鼠标是否在 canvas 内
          const rect = canvas.getBoundingClientRect();
          const mouseX = e.clientX;
          const mouseY = e.clientY;
          
          if (
            mouseX < rect.left ||
            mouseX > rect.right ||
            mouseY < rect.top ||
            mouseY > rect.bottom
          ) {
            return; // 鼠标不在 canvas 内，不处理
          }
          
          // 阻止默认滚动行为（仅在 canvas 内）
          e.preventDefault();
          
          // 计算鼠标相对于视口中心的位置
          const viewportCenterX = window.innerWidth / 2;
          const viewportCenterY = window.innerHeight / 2;
          
          // 鼠标相对于视口中心的位置
          const offsetX = mouseX - viewportCenterX;
          const offsetY = mouseY - viewportCenterY;
          
          // 计算缩放前的鼠标在画布内容空间中的位置
          const contentX = (offsetX - pan.x) / zoom;
          const contentY = (offsetY - pan.y) / zoom;
          
          // 计算新的缩放比例（更平滑的缩放速度，支持 Ctrl/Cmd 键加速）
          const isAccelerated = e.ctrlKey || e.metaKey;
          const baseZoomSpeed = 0.05;
          const zoomSpeed = isAccelerated ? baseZoomSpeed * 2 : baseZoomSpeed;
          const zoomDelta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
          const newZoom = Math.max(0.05, Math.min(10, zoom + zoomDelta));
          
          // 计算新的平移位置，使鼠标指向的内容位置保持不变
          const newPanX = offsetX - contentX * newZoom;
          const newPanY = offsetY - contentY * newZoom;
          
          setZoom(newZoom);
          setPan({ x: newPanX, y: newPanY });
        };

        // 添加非被动事件监听器
        canvas.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
          canvas.removeEventListener('wheel', handleWheel);
        };
      }, [activeTool, zoom, pan, isPanning]);

      return (
        <div className="personal-space" ref={containerRef}>
          <div 
            className="canvas" 
            ref={canvasRef}
            style={{ 
              cursor: isPanning ? 'grabbing' : (isSpacePressed ? 'grab' : getCanvasCursor()),
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
              transition: isPanning ? 'none' : 'transform 0.1s ease-out', // 平滑过渡（拖拽时禁用）
            }}
            onClick={handleCanvasClick}
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
            onSelect={handleSelect}
            onDragEnd={handleDragEnd}
          />
        ))}

        {/* OpenGraph 图片（使用 DraggableImage，支持拖拽和工具） */}
        {!showOriginalImages && opengraphData && Array.isArray(opengraphData) && opengraphData.length > 0 && opengraphData.map((og, index) => {
          // 确保有必要的字段
          if (!og || typeof og !== 'object' || !og.id) {
            return null;
          }
          // 如果没有 x, y，使用默认值（中心位置）
          const x = og.x ?? 720;
          const y = og.y ?? 512;
          
          // 直接使用 DraggableImage，位置由组件内部管理
          // 如果有 animationDelay，传递给组件用于错开动画
          return (
            <DraggableImage
              key={og.id}
              id={og.id}
              className="opengraph-image"
              src={og.image || 'https://via.placeholder.com/120'}
              alt={og.title || og.url}
              initialX={x}
              initialY={y}
              width={og.width || 120}
              height={og.height || 120}
              animationDelay={og.animationDelay || 0}
              isSelected={selectedIds.has(og.id)}
              onSelect={(id, isMultiSelect) => {
                handleSelect(id, isMultiSelect);
                // 快速双击显示 OpenGraph 卡片（300ms 内两次点击同一图片）
                const now = Date.now();
                if (lastOGClickRef.current.id === id && now - lastOGClickRef.current.time < 300) {
                  setSelectedOG(og);
                  lastOGClickRef.current = { time: 0, id: null };
                } else {
                  lastOGClickRef.current = { time: now, id };
                }
              }}
              onDragEnd={handleDragEnd}
            />
          );
        })}

        {/* 聚类中心标签 */}
        {clusters.map((cluster) => (
          <ClusterLabel
            key={cluster.id}
            cluster={cluster}
            onRename={(clusterId, newName) => {
              setClusters(prev => prev.map(c => 
                c.id === clusterId ? { ...c, name: newName } : c
              ));
            }}
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
          onLassoSelect={handleLassoSelect}
          selectedIds={selectedIds}
          drawPaths={drawPaths}
          setDrawPaths={setDrawPaths}
          textElements={textElements}
          setTextElements={setTextElements}
          onHistoryChange={handleHistoryChange}
        />
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

      <SearchBar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearch={handleSearch}
        onClear={handleClearSearch}
        isSearching={isSearching}
      />

      <img
        className="view-buttons"
        alt="View buttons"
        src={getImageUrl("viewbuttons-1.svg")}
      />

      <Component className="side-panel" property1="one" />
      {showAIClusteringPanel && (
        <div 
          className="aiclustering-panel"
          onClick={(e) => {
            // 点击面板本身时关闭
            if (e.target.classList.contains('aiclustering-panel')) {
              setShowAIClusteringPanel(false);
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
              setAiLabels(prev => prev.map((l, i) => i === idx ? newLabel : l));
            }}
            onDelete={(idx) => {
              if (window.confirm(`删除标签 "${aiLabels[idx]}"？`)) {
                setAiLabels(prev => prev.filter((_, i) => i !== idx));
              }
            }}
          />
        ))}

        {/* 添加标签按钮 */}
        {aiLabels.length < 3 && (
          <div 
            className="add-tag"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              const newLabel = prompt('请输入新标签名称（最多3个标签）：');
              if (newLabel && newLabel.trim() && aiLabels.length < 3) {
                setAiLabels(prev => [...prev, newLabel.trim()]);
              }
            }}
          >
            <div className="text-wrapper-22">+</div>
          </div>
        )}

        {/* 上传按钮（触发按标签分类） */}
        <div 
          className="upload"
          style={{ cursor: isClustering ? 'not-allowed' : 'pointer', opacity: isClustering ? 0.6 : 1 }}
          onClick={async (e) => {
            e.stopPropagation();
            if (isClustering || aiLabels.length === 0) return;
            
            try {
              setIsClustering(true);
              // 优先使用 opengraphWithEmbeddings（包含 embedding），否则使用 opengraphData
              let allItems = showOriginalImages ? images : opengraphData;
              
              // 如果 opengraphWithEmbeddings 有数据，优先使用（包含 embedding）
              if (!showOriginalImages && opengraphWithEmbeddings.length > 0) {
                // 合并 opengraphData 的位置信息和 opengraphWithEmbeddings 的 embedding
                allItems = opengraphData.map(item => {
                  const withEmbedding = opengraphWithEmbeddings.find(e => 
                    e.url === item.url || e.tab_id === item.tab_id
                  );
                  if (withEmbedding) {
                    return {
                      ...item,
                      text_embedding: withEmbedding.text_embedding,
                      image_embedding: withEmbedding.image_embedding,
                      embedding: withEmbedding.embedding,
                    };
                  }
                  return item;
                });
              }
              
              // 获取已聚类的卡片 ID（排除用户自定义聚类）
              const clusteredItemIds = clusters
                .filter(c => c.type === 'manual')
                .flatMap(c => (c.items || []).map(item => item.id))
                .filter(Boolean);
              
              // 确保 items 包含 embedding
              const itemsWithEmbedding = allItems.filter(item => 
                item.text_embedding || item.image_embedding
              );
              
              console.log('[Clustering] Total items:', allItems.length, 'Items with embedding:', itemsWithEmbedding.length);
              
              if (itemsWithEmbedding.length === 0) {
                alert('请先为卡片生成 embedding（可以通过搜索功能自动生成）');
                return;
              }
              
              const result = await classifyByLabels(
                aiLabels,
                itemsWithEmbedding,
                clusteredItemIds.length > 0 ? clusteredItemIds : null
              );
              
              if (result && result.ok && result.clusters) {
                // 添加聚类到列表
                const updatedClusters = [...clusters, ...result.clusters];
                
                // 重新计算所有聚类的位置（避免重叠）
                const repositionedClusters = calculateMultipleClustersLayout(updatedClusters);
                setClusters(repositionedClusters);
                
                // 从原数据中移除已聚类的卡片
                const classifiedItemIds = new Set(
                  result.clusters.flatMap(c => (c.items || []).map(item => item.id))
                );
                
                // 更新剩余卡片的位置（补位）
                if (showOriginalImages) {
                  setImages(prev => {
                    const remaining = prev.filter(img => !classifiedItemIds.has(img.id));
                    // 重新计算剩余卡片的圆形布局（从中心开始）
                    return calculateRadialLayout(remaining);
                  });
                } else {
                  setOpengraphData(prev => {
                    const remaining = prev.filter(og => !classifiedItemIds.has(og.id));
                    // 重新计算剩余卡片的圆形布局（从中心开始）
                    return calculateRadialLayout(remaining);
                  });
                }
                
                // 将聚类中的卡片添加到画布（使用重新计算的位置）
                // 需要为每个聚类内的 items 重新计算圆形布局，并添加错开动画
                repositionedClusters.slice(clusters.length).forEach((cluster, clusterIndex) => {
                  const clusterItems = cluster.items || [];
                  if (clusterItems.length > 0) {
                    // 使用聚类中心位置重新计算圆形布局
                    const positionedItems = calculateRadialLayout(clusterItems, {
                      centerX: cluster.center.x,
                      centerY: cluster.center.y,
                    }).map((item, itemIndex) => ({
                      ...item,
                      // 添加动画延迟，错开动画时间
                      animationDelay: calculateStaggerDelay(itemIndex, clusterItems.length) + (clusterIndex * 100),
                    }));
                    if (showOriginalImages) {
                      setImages(prev => [...prev, ...positionedItems]);
                    } else {
                      setOpengraphData(prev => [...prev, ...positionedItems]);
                    }
                  }
                });
                
                console.log('[Clustering] AI classify completed:', result.clusters);
              }
            } catch (error) {
              console.error('[Clustering] Failed to classify by labels:', error);
              alert('AI 分类失败：' + (error.message || '未知错误'));
            } finally {
              setIsClustering(false);
            }
          }}
        >
          <div className="upload-tag">
            <div className="image-wrapper">
              <img className="image-13" alt="Image" src={getImageUrl("1.svg")} />
            </div>
          </div>
        </div>

        <div className="rectangle" />

        {/* 自动聚类按钮 */}
        <div 
          className="auto-cluster"
          style={{ cursor: isClustering ? 'not-allowed' : 'pointer', opacity: isClustering ? 0.6 : 1 }}
          onClick={async (e) => {
            e.stopPropagation();
            if (isClustering) return;
            
            try {
              setIsClustering(true);
              // 优先使用 opengraphWithEmbeddings（包含 embedding），否则使用 opengraphData
              let allItems = showOriginalImages ? images : opengraphData;
              
              // 如果 opengraphWithEmbeddings 有数据，优先使用（包含 embedding）
              if (!showOriginalImages && opengraphWithEmbeddings.length > 0) {
                // 合并 opengraphData 的位置信息和 opengraphWithEmbeddings 的 embedding
                allItems = opengraphData.map(item => {
                  const withEmbedding = opengraphWithEmbeddings.find(e => 
                    e.url === item.url || e.tab_id === item.tab_id
                  );
                  if (withEmbedding) {
                    return {
                      ...item,
                      text_embedding: withEmbedding.text_embedding,
                      image_embedding: withEmbedding.image_embedding,
                      embedding: withEmbedding.embedding,
                    };
                  }
                  return item;
                });
              }
              
              // 获取已聚类的卡片 ID（排除用户自定义聚类）
              const clusteredItemIds = clusters
                .filter(c => c.type === 'manual')
                .flatMap(c => (c.items || []).map(item => item.id))
                .filter(Boolean);
              
              // 确保 items 包含 embedding
              const itemsWithEmbedding = allItems.filter(item => 
                item.text_embedding || item.image_embedding
              );
              
              console.log('[Clustering] Total items:', allItems.length, 'Items with embedding:', itemsWithEmbedding.length);
              
              if (itemsWithEmbedding.length < 3) {
                alert('至少需要3个有 embedding 的卡片才能进行自动聚类');
                return;
              }
              
              const result = await discoverClusters(
                itemsWithEmbedding,
                clusteredItemIds.length > 0 ? clusteredItemIds : null,
                null // 自动确定聚类数量
              );
              
              if (result && result.ok && result.clusters) {
                // 添加聚类到列表
                const updatedClusters = [...clusters, ...result.clusters];
                
                // 重新计算所有聚类的位置（避免重叠）
                const repositionedClusters = calculateMultipleClustersLayout(updatedClusters);
                setClusters(repositionedClusters);
                
                // 从原数据中移除已聚类的卡片
                const clusteredItemIds = new Set(
                  result.clusters.flatMap(c => (c.items || []).map(item => item.id))
                );
                
                // 更新剩余卡片的位置（补位）
                if (showOriginalImages) {
                  setImages(prev => {
                    const remaining = prev.filter(img => !clusteredItemIds.has(img.id));
                    // 重新计算剩余卡片的圆形布局（从中心开始）
                    return calculateRadialLayout(remaining);
                  });
                } else {
                  setOpengraphData(prev => {
                    const remaining = prev.filter(og => !clusteredItemIds.has(og.id));
                    // 重新计算剩余卡片的圆形布局（从中心开始）
                    return calculateRadialLayout(remaining);
                  });
                }
                
                // 将聚类中的卡片添加到画布（使用重新计算的位置）
                // 需要为每个聚类内的 items 重新计算圆形布局，并添加错开动画
                repositionedClusters.slice(clusters.length).forEach((cluster, clusterIndex) => {
                  const clusterItems = cluster.items || [];
                  if (clusterItems.length > 0) {
                    // 使用聚类中心位置重新计算圆形布局
                    const positionedItems = calculateRadialLayout(clusterItems, {
                      centerX: cluster.center.x,
                      centerY: cluster.center.y,
                    }).map((item, itemIndex) => ({
                      ...item,
                      // 添加动画延迟，错开动画时间
                      animationDelay: calculateStaggerDelay(itemIndex, clusterItems.length) + (clusterIndex * 100),
                    }));
                    if (showOriginalImages) {
                      setImages(prev => [...prev, ...positionedItems]);
                    } else {
                      setOpengraphData(prev => [...prev, ...positionedItems]);
                    }
                  }
                });
                
                console.log('[Clustering] AI discover completed:', result.clusters);
              }
            } catch (error) {
              console.error('[Clustering] Failed to discover clusters:', error);
              alert('自动聚类失败：' + (error.message || '未知错误'));
            } finally {
              setIsClustering(false);
            }
          }}
        >
          <div className="frame-wrapper">
            <div className="frame-10">
              <div className="text-wrapper-23">自动聚类</div>
            </div>
          </div>
        </div>
      </div>
      )}

      <ToolSets
        activeTool={activeTool}
        onToolChange={setActiveTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onAIClusteringClick={() => setShowAIClusteringPanel(!showAIClusteringPanel)}
      />

          {/* OpenGraph 卡片（点击图片后显示） */}
          {selectedOG && (
            <OpenGraphCard
              data={selectedOG}
              onClose={() => setSelectedOG(null)}
            />
          )}

          {/* 选中面板（有图片被选中时显示） */}
          {selectedIds && selectedIds.size > 0 && (
            <SelectionPanel
              selectedCount={selectedIds.size}
              groupName={selectedGroupName}
              onDelete={() => {
                console.log('[SelectionPanel] Delete clicked');
                const selectedArray = Array.from(selectedIds);
                
                // 从画布移除图片
                if (showOriginalImages) {
                  // 移除原有图片
                  setImages(prev => {
                    const prevImages = [...prev];
                    const newImages = prev.filter(img => !selectedIds.has(img.id));
                    addToHistory({ 
                      type: 'image-delete', 
                      action: 'delete', 
                      deletedIds: selectedArray,
                      prevImages: prevImages
                    });
                    return newImages;
                  });
                } else {
                  // 移除 OpenGraph 图片
                  setOpengraphData(prev => {
                    const prevOG = [...prev];
                    const newOG = prev.filter(og => !selectedIds.has(og.id));
                    addToHistory({ 
                      type: 'opengraph-delete', 
                      action: 'delete', 
                      deletedIds: selectedArray,
                      prevOG: prevOG
                    });
                    return newOG;
                  });
                }
                
                // 清空选中状态
                setSelectedIds(new Set());
              }}
              onRename={async (newName) => {
                console.log('[SelectionPanel] Rename to:', newName);
                setSelectedGroupName(newName);
                
                // 重命名后立即自动创建聚类
                if (selectedIds.size > 0 && newName.trim()) {
                  try {
                    const selectedArray = Array.from(selectedIds);
                    const allItems = showOriginalImages ? images : opengraphData;
                    
                    // 计算聚类中心位置（在选中卡片的中心）
                    let centerX = 720;
                    let centerY = 512;
                    if (selectedArray.length > 0) {
                      const selectedItems = allItems.filter(item => selectedIds.has(item.id));
                      if (selectedItems.length > 0) {
                        const sumX = selectedItems.reduce((sum, item) => sum + (item.x || 720), 0);
                        const sumY = selectedItems.reduce((sum, item) => sum + (item.y || 512), 0);
                        centerX = sumX / selectedItems.length;
                        centerY = sumY / selectedItems.length;
                      }
                    }
                    
                    const result = await createManualCluster(
                      selectedArray,
                      newName.trim(),
                      allItems,
                      centerX,
                      centerY
                    );
                    
                    if (result && result.ok && result.cluster) {
                      const cluster = result.cluster;
                      
                      // 添加聚类到列表
                      const updatedClusters = [...clusters, cluster];
                      
                      // 重新计算所有聚类的位置（避免重叠）
                      const repositionedClusters = calculateMultipleClustersLayout(updatedClusters);
                      setClusters(repositionedClusters);
                      
                      // 从原数据中移除已聚类的卡片，并更新画布
                      // 更新剩余卡片的位置（补位）
                      if (showOriginalImages) {
                        setImages(prev => {
                          const remaining = prev.filter(img => !selectedIds.has(img.id));
                          // 重新计算剩余卡片的圆形布局（从中心开始）
                          return calculateRadialLayout(remaining);
                        });
                      } else {
                        setOpengraphData(prev => {
                          const remaining = prev.filter(og => !selectedIds.has(og.id));
                          // 重新计算剩余卡片的圆形布局（从中心开始）
                          return calculateRadialLayout(remaining);
                        });
                      }
                      
                      // 将聚类中的卡片添加到画布（使用重新计算的位置）
                      const finalCluster = repositionedClusters[repositionedClusters.length - 1];
                      const clusterItems = finalCluster.items || [];
                      if (clusterItems.length > 0) {
                        // 使用聚类中心位置重新计算圆形布局，并添加错开动画
                        const positionedItems = calculateRadialLayout(clusterItems, {
                          centerX: finalCluster.center.x,
                          centerY: finalCluster.center.y,
                        }).map((item, itemIndex) => ({
                          ...item,
                          // 添加动画延迟，错开动画时间
                          animationDelay: calculateStaggerDelay(itemIndex, clusterItems.length),
                        }));
                        if (showOriginalImages) {
                          setImages(prev => [...prev, ...positionedItems]);
                        } else {
                          setOpengraphData(prev => [...prev, ...positionedItems]);
                        }
                      }
                      
                      // 不自动取消选中（根据需求）
                      console.log('[Clustering] Manual cluster created:', finalCluster);
                    }
                  } catch (error) {
                    console.error('[Clustering] Failed to create manual cluster:', error);
                    alert('创建聚类失败：' + (error.message || '未知错误'));
                  }
                }
              }}
              onOpen={() => {
                console.log('[SelectionPanel] Open clicked');
                // TODO: 实现打开选中图片对应的 URL
                const selectedArray = Array.from(selectedIds);
                selectedArray.forEach(id => {
                  if (id.startsWith('og-')) {
                    const og = opengraphData.find(item => item.id === id);
                    if (og && og.url) {
                      window.open(og.url, '_blank');
                    }
                  }
                });
              }}
              onDownload={() => {
                console.log('[SelectionPanel] Download clicked');
                const selectedArray = Array.from(selectedIds);
                const urlList = [];
                
                // 收集选中图片的 URL
                selectedArray.forEach(id => {
                  if (id.startsWith('og-')) {
                    const og = opengraphData.find(item => item.id === id);
                    if (og) {
                      urlList.push({
                        id: og.id,
                        url: og.url || '',
                        title: og.title || og.tab_title || '',
                        description: og.description || '',
                        image: og.image || '',
                        site_name: og.site_name || '',
                      });
                    }
                  } else {
                    // 原有图片（如果有 URL 信息）
                    const img = images.find(item => item.id === id);
                    if (img) {
                      urlList.push({
                        id: img.id,
                        url: img.url || '',
                        title: img.alt || '',
                        image: img.src || '',
                      });
                    }
                  }
                });
                
                // 生成 JSON 并下载
                const jsonContent = JSON.stringify(urlList, null, 2);
                const blob = new Blob([jsonContent], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `selected_urls_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
              onAIInsight={async () => {
                try {
                  console.log('[SelectionPanel] AI Insight clicked');
                  const selectedArray = Array.from(selectedIds);
                  const opengraphItems = [];
                  
                  // 收集选中图片的 OpenGraph 数据
                  selectedArray.forEach(id => {
                    if (id.startsWith('og-')) {
                      const og = opengraphData.find(item => item.id === id);
                      if (og) {
                        opengraphItems.push({
                          url: og.url || '',
                          title: og.title || og.tab_title || '',
                          description: og.description || '',
                          image: og.image || '',
                          site_name: og.site_name || '',
                        });
                      }
                    } else {
                      // 原有图片（如果有 URL 信息）
                      const img = images.find(item => item.id === id);
                      if (img && img.url) {
                        opengraphItems.push({
                          url: img.url || '',
                          title: img.alt || '',
                          description: '',
                          image: img.src || '',
                          site_name: '',
                        });
                      }
                    }
                  });
                  
                  if (opengraphItems.length === 0) {
                    alert('选中的图片没有可用的 URL 信息');
                    return;
                  }
                  
                  // 调用后端 AI 洞察 API
                  const response = await fetch('http://localhost:8000/api/v1/ai/insight', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      opengraph_items: opengraphItems
                    })
                  });
                  
                  if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                  }
                  
                  const result = await response.json();
                  
                  if (result && result.ok && result.summary) {
                    // 显示 AI 洞察结果（使用 alert，后续可以改为更优雅的 UI）
                    const summaryText = result.summary || '无总结内容';
                    alert('AI 洞察总结：\n\n' + summaryText);
                  } else {
                    const errorMsg = (result && result.error) ? result.error : '未知错误';
                    alert('AI 洞察失败：' + errorMsg);
                  }
                } catch (error) {
                  console.error('[SelectionPanel] AI Insight error:', error);
                  const errorMessage = error && error.message ? error.message : '请求失败';
                  alert('AI 洞察请求失败：' + errorMessage);
                }
              }}
            />
          )}
        </div>
      );
    };

