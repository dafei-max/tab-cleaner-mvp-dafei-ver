import React, { useState, useRef, useEffect, useCallback } from "react";
import { Component } from "../../components/Component";
import { SearchBar } from "../../components/SearchBar";
import { ToolSets } from "../../components/ToolSets";
import { getImageUrl } from "../../shared/utils";
import { initialImages } from "./imageData";
import { OpenGraphCard } from "./OpenGraphCard";
import { SelectionPanel } from "./SelectionPanel";
import { ViewButtons } from "./ViewButtons";
import { MasonryGrid } from "./MasonryGrid";
import { SessionMasonryGrid } from "./SessionMasonryGrid";
import { RadialCanvas } from "./RadialCanvas";
import { AIClusteringPanel } from "./AIClusteringPanel";
import { ScrollSpyIndicator } from "./ScrollSpyIndicator";
import { useSessionManager } from "../../hooks/useSessionManager";
import { useHistory } from "../../hooks/useHistory";
import { useSearch } from "../../hooks/useSearch";
import { calculateRadialLayout } from "../../utils/radialLayout";
import { handleLassoSelect as handleLassoSelectUtil } from "../../utils/selection";
import { calculateMultipleClustersLayout } from "../../utils/clusterLayout";
import { createManualCluster, classifyByLabels, discoverClusters } from "../../shared/api";
import { calculateStaggerDelay, CLUSTER_ANIMATION } from "../../motion";
import { useClusterSpringAnimation } from "../../hooks/useClusterSpringAnimation";
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
  const clusterDragStartRef = useRef(new Map()); // 拖动开始时保存每个聚类的初始位置和卡片位置

  // 视图模式：'radial' 或 'masonry'
  const [viewMode, setViewMode] = useState('masonry'); // 默认使用 masonry 视图

  // Session 管理（使用 hook）
  const {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    isLoading: isSessionsLoading,
    createSession,
    updateSession,
    deleteSession,
    getCurrentSession,
    renameSession,
  } = useSessionManager();

  // 搜索相关状态（使用 hook）
  // 注意：对于 masonry 视图，搜索应该基于所有 sessions 的数据
  // 对于 radial 视图，搜索基于当前 session 的数据
  const allOpengraphData = sessions.flatMap(s => s.opengraphData || []);
  const currentSession = getCurrentSession();
  const currentSessionOpengraphData = currentSession ? (currentSession.opengraphData || []) : [];
  
  // 根据视图模式选择搜索数据源
  const searchDataSource = viewMode === 'masonry' ? allOpengraphData : currentSessionOpengraphData;
  
  const {
    searchQuery,
    setSearchQuery,
    isSearching,
    opengraphWithEmbeddings,
    searchResults,
    performSearch,
    clearSearch,
  } = useSearch(searchDataSource);
  
  // Radial 视图使用的数据（当前 session）
  // 如果当前 session 有数据，使用 session 数据；否则使用旧的 opengraphData（向后兼容）
  const radialOpengraphData = viewMode === 'radial' 
    ? (currentSessionOpengraphData.length > 0 ? currentSessionOpengraphData : opengraphData)
    : opengraphData;

  // 当切换到 radial 视图或切换 session 时，同步更新 clusters 和 opengraphData
  useEffect(() => {
    if (viewMode === 'radial' && radialOpengraphData.length > 0) {
      // 计算放射状布局位置
      const positionedOG = calculateRadialLayout(radialOpengraphData, {
        centerX: 720,
        centerY: 512,
      }).map((og, index) => ({
        ...og,
        id: og.id || `og-${index}-${Date.now()}`,
      }));
      
      // 调试：检查计算出的位置
      console.log('[Radial View] Calculated positions:', positionedOG.slice(0, 3).map(og => ({
        id: og.id,
        x: og.x,
        y: og.y,
        title: og.title?.substring(0, 20)
      })));
      
      // 确保每个 item 都有 x, y 坐标
      const positionedOGWithCoords = positionedOG.map(og => {
        if (og.x === undefined || og.y === undefined) {
          console.warn('[Radial View] Missing coordinates for:', og.id, 'x:', og.x, 'y:', og.y);
        }
        return {
          ...og,
          x: og.x ?? 720,
          y: og.y ?? 512,
        };
      });
      
      // 调试：检查最终数据
      console.log('[Radial View] Final opengraphData:', positionedOGWithCoords.slice(0, 3).map(og => ({
        id: og.id,
        x: og.x,
        y: og.y,
      })));
      
      // 更新 opengraphData（用于 Radial 视图）
      setOpengraphData(positionedOGWithCoords);
      setShowOriginalImages(false);
      
      // 更新 clusters：如果有现有聚类，保留；否则创建默认聚类
      setClusters(prev => {
        if (prev.length === 0) {
          // 创建默认聚类包含所有卡片（items 需要包含 x, y 坐标，供 Spring 动画使用）
          return [{
            id: 'default-cluster',
            name: '未分类',
            type: 'default',
          items: positionedOGWithCoords.map(og => ({
            ...og,
            // 确保 items 中包含 x, y 坐标
            x: og.x,
            y: og.y,
          })),
            center: { x: 720, y: 512 },
            radius: 200,
            item_count: positionedOG.length,
          }];
        } else {
          // 更新现有聚类中的 items，确保数据同步
          // 重要：需要从 positionedOG 中获取最新的 x, y 坐标
          // 同时，对于不在现有聚类中的新 items，需要添加到默认聚类或创建新聚类
          const existingItemIds = new Set(
            prev.flatMap(c => (c.items || []).map(item => item.id))
          );
          const newItems = positionedOGWithCoords.filter(og => !existingItemIds.has(og.id));
          
          return prev.map(cluster => {
            const updatedItems = cluster.items
              .filter(item => positionedOGWithCoords.some(og => og.id === item.id))
              .map(item => {
                // 从 positionedOGWithCoords 中获取最新的位置信息
                const latestOG = positionedOGWithCoords.find(og => og.id === item.id);
                if (latestOG) {
                  return {
                    ...item,
                    x: latestOG.x,
                    y: latestOG.y,
                    width: latestOG.width,
                    height: latestOG.height,
                  };
                }
                return item;
              });
            
            return {
              ...cluster,
              items: updatedItems,
              item_count: updatedItems.length,
            };
          })
          .filter(cluster => cluster.item_count > 0)
          .concat(newItems.length > 0 ? [{
            id: 'default-cluster',
            name: '未分类',
            type: 'default',
            items: newItems.map(og => ({
              ...og,
              x: og.x,
              y: og.y,
            })),
            center: { x: 720, y: 512 },
            radius: 200,
            item_count: newItems.length,
          }] : []);
        }
      });
    } else if (viewMode === 'radial' && radialOpengraphData.length === 0) {
      // 如果切换到 radial 视图但没有数据，清空 clusters
      setClusters([]);
      setOpengraphData([]);
    }
  }, [viewMode, currentSessionId, radialOpengraphData]);

  // 从 storage 加载数据（兼容旧数据，但优先使用 sessions）
  // 当 sessions 加载完成后，检查是否需要迁移旧数据
  useEffect(() => {
    // 等待 sessions 加载完成
    if (isSessionsLoading) {
      return;
    }

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(['opengraphData', 'currentSessionId'], (result) => {
        try {
          // 如果有旧的 opengraphData 但没有 sessions，迁移到第一个 session
          if (sessions.length === 0 && result.opengraphData) {
            const ogData = Array.isArray(result.opengraphData) 
              ? result.opengraphData 
              : (result.opengraphData.data || []);
            
            if (Array.isArray(ogData) && ogData.length > 0) {
              console.log('[PersonalSpace] Migrating old opengraphData to session...', ogData.length, 'items');
              
              // 过滤掉失败的数据
              const validOG = ogData.filter(item => 
                item && 
                typeof item === 'object' && 
                (item.success || item.is_doc_card) &&  
                (item.image || (item.title && item.title !== item.url))
              );
              
              if (validOG.length > 0) {
                // 创建第一个 session 包含旧数据
                const newSession = createSession(validOG);
                console.log('[PersonalSpace] Created session from old data:', newSession);
                
                // 同时设置 opengraphData 用于 Radial 视图兼容
                const positionedOG = calculateRadialLayout(validOG, {
                  centerX: 720,
                  centerY: 512,
                }).map((og, index) => ({
                  ...og,
                  id: og.id || `og-${index}-${Date.now()}`,
                }));
                setOpengraphData(positionedOG);
                setShowOriginalImages(false);
                
                // 创建默认聚类
                setTimeout(() => {
                  setClusters(prev => {
                    if (prev.length === 0) {
                      return [{
                        id: 'default-cluster',
                        name: '未分类',
                        type: 'default',
                        items: positionedOG,
                        center: { x: 720, y: 512 },
                        radius: 200,
                        item_count: positionedOG.length,
                      }];
                    }
                    return prev;
                  });
                }, 100);
              }
            }
          }
          
          // 设置当前 session（如果有）
          if (result.currentSessionId && sessions.length > 0) {
            const sessionExists = sessions.some(s => s.id === result.currentSessionId);
            if (sessionExists) {
              setCurrentSessionId(result.currentSessionId);
            }
          }
        } catch (error) {
          console.error('[PersonalSpace] Error loading OpenGraph data:', error);
        }
      });
    }
  }, [isSessionsLoading, sessions.length, createSession, setCurrentSessionId]);

  // Spring 动画：更新卡片位置
  const updateCardPosition = useCallback((cardId, x, y) => {
    // 只有在启用 Spring 动画时才更新位置
    // 如果只有默认聚类，不应该更新位置（直接使用计算好的位置）
    const shouldUpdate = viewMode === 'radial' && clusters.length > 0 && 
      !(clusters.length === 1 && clusters[0].id === 'default-cluster' && clusters[0].type === 'default');
    
    if (!shouldUpdate) {
      // 禁用 Spring 动画时，不更新位置
      return;
    }
    
    // 更新 opengraphData 或 images 中对应卡片的位置
    if (showOriginalImages) {
      setImages(prev => prev.map(item => {
        if (item.id === cardId) {
          return { ...item, x, y };
        }
        return item;
      }));
    } else {
      setOpengraphData(prev => prev.map(item => {
        if (item.id === cardId) {
          return { ...item, x, y };
        }
        return item;
      }));
    }
  }, [showOriginalImages, viewMode, clusters]);

  // Spring 动画：更新聚类中心位置
  const updateClusterCenter = useCallback((clusterId, x, y) => {
    // 更新聚类状态
    setClusters(prev => prev.map(c => {
      if (c.id === clusterId) {
        return { ...c, center: { x, y } };
      }
      return c;
    }));
  }, []);

  // 使用 Spring 动画系统（每帧更新聚类圆心和卡片位置）
  // 注意：只有在 radial 视图且有聚类时才启用 Spring 动画
  // 如果没有聚类（只有默认聚类），直接使用计算好的位置，不需要 Spring 动画
  const shouldUseSpringAnimation = viewMode === 'radial' && clusters.length > 0 && 
    !(clusters.length === 1 && clusters[0].id === 'default-cluster' && clusters[0].type === 'default');
  
  useClusterSpringAnimation(
    shouldUseSpringAnimation ? clusters : [],
    updateCardPosition,
    updateClusterCenter
  );


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
    // 恢复原始数据（清除相似度标记）
    if (viewMode === 'radial') {
      // Radial 视图：恢复原始布局
      const currentSession = getCurrentSession();
      const currentSessionOpengraphData = currentSession ? (currentSession.opengraphData || []) : [];
      if (currentSessionOpengraphData.length > 0) {
        // 清除相似度标记
        const cleanedData = currentSessionOpengraphData.map(item => ({
          ...item,
          similarity: undefined,
        }));
        const originalData = calculateRadialLayout(cleanedData);
        setOpengraphData(originalData);
      }
    } else {
      // Masonry 视图：清除所有 session 的相似度标记
      // 这个会在 SessionMasonryGrid 中自动处理（因为 hasSearchResults 会变为 false）
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

      // 处理卡片双击
      const handleCardDoubleClick = useCallback((og) => {
        const now = Date.now();
        if (lastOGClickRef.current.id === og.id && now - lastOGClickRef.current.time < 300) {
          setSelectedOG(og);
          lastOGClickRef.current = { time: 0, id: null };
        } else {
          lastOGClickRef.current = { time: now, id: og.id };
        }
      }, []);

      // 处理聚类重命名
      const handleClusterRename = useCallback((clusterId, newName) => {
        setClusters(prev => prev.map(c => 
          c.id === clusterId ? { ...c, name: newName } : c
        ));
      }, []);

      // 处理聚类拖拽
      const handleClusterDrag = useCallback((clusterId, newCenter, isDragEnd) => {
        // 如果是拖动开始（第一次调用），保存初始位置
        if (!clusterDragStartRef.current.has(clusterId)) {
          const cluster = clusters.find(c => c.id === clusterId);
          if (cluster) {
            const initialCenter = cluster.center || { x: 720, y: 512 };
            const initialItems = (cluster.items || []).map(item => ({
              id: item.id,
              x: item.x || initialCenter.x,
              y: item.y || initialCenter.y,
            }));
            clusterDragStartRef.current.set(clusterId, {
              center: initialCenter,
              items: initialItems,
            });
          }
        }

        const dragStart = clusterDragStartRef.current.get(clusterId);
        if (!dragStart) return;

        // 计算偏移量（基于拖动开始时的初始位置）
        const offsetX = newCenter.x - dragStart.center.x;
        const offsetY = newCenter.y - dragStart.center.y;

        // 更新聚类的中心位置
        setClusters(prev => prev.map(c => {
          if (c.id === clusterId) {
            // 更新聚类中的 items 位置（保持相对位置不变）
            const updatedItems = (c.items || []).map(item => {
              const initialItem = dragStart.items.find(init => init.id === item.id);
              if (initialItem) {
                return {
                  ...item,
                  x: initialItem.x + offsetX,
                  y: initialItem.y + offsetY,
                };
              }
              return item;
            });

            return {
              ...c,
              center: newCenter,
              items: updatedItems,
            };
          }
          return c;
        }));

        // 实时更新画布中的卡片位置（拖动过程中和拖动结束时都更新）
        if (showOriginalImages) {
          setImages(prevImages => prevImages.map(img => {
            const initialItem = dragStart.items.find(init => init.id === img.id);
            if (initialItem) {
              return {
                ...img,
                x: initialItem.x + offsetX,
                y: initialItem.y + offsetY,
              };
            }
            return img;
          }));
        } else {
          setOpengraphData(prevOG => prevOG.map(og => {
            const initialItem = dragStart.items.find(init => init.id === og.id);
            if (initialItem) {
              return {
                ...og,
                x: initialItem.x + offsetX,
                y: initialItem.y + offsetY,
              };
            }
            return og;
          }));
        }

        // 拖动结束时，清除保存的初始位置
        if (isDragEnd) {
          clusterDragStartRef.current.delete(clusterId);
        }
      }, [clusters, showOriginalImages]);

      // AI 聚类处理函数
      const handleAddLabel = useCallback(() => {
        const newLabel = prompt('请输入新标签名称（最多3个标签）：');
        if (newLabel && newLabel.trim() && aiLabels.length < 3) {
          setAiLabels(prev => [...prev, newLabel.trim()]);
        }
      }, [aiLabels.length]);

      const handleLabelRename = useCallback((idx, newLabel) => {
        setAiLabels(prev => prev.map((l, i) => i === idx ? newLabel : l));
      }, []);

      const handleLabelDelete = useCallback((idx) => {
        if (window.confirm(`删除标签 "${aiLabels[idx]}"？`)) {
          setAiLabels(prev => prev.filter((_, i) => i !== idx));
        }
      }, [aiLabels]);

      const handleClassify = useCallback(async () => {
        if (isClustering || aiLabels.length === 0) return;
        
        try {
          setIsClustering(true);
          let allItems = showOriginalImages ? images : opengraphData;
          
          if (!showOriginalImages && opengraphWithEmbeddings.length > 0) {
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
          
          const clusteredItemIds = clusters
            .filter(c => c.type === 'manual')
            .flatMap(c => (c.items || []).map(item => item.id))
            .filter(Boolean);
          
          const itemsWithEmbedding = allItems.filter(item => 
            item.text_embedding || item.image_embedding
          );
          
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
            const updatedClusters = [...clusters, ...result.clusters];
            const repositionedClusters = calculateMultipleClustersLayout(updatedClusters, {
              canvasWidth: 1440,
              canvasHeight: 1024,
              clusterSpacing: 500,
              clusterCenterRadius: 250,
            });
            setClusters(repositionedClusters);
            
            const classifiedItemIds = new Set(
              result.clusters.flatMap(c => (c.items || []).map(item => item.id))
            );
            
            if (showOriginalImages) {
              setImages(prev => {
                const remaining = prev.filter(img => !classifiedItemIds.has(img.id));
                return calculateRadialLayout(remaining);
              });
            } else {
              setOpengraphData(prev => {
                const remaining = prev.filter(og => !classifiedItemIds.has(og.id));
                return calculateRadialLayout(remaining);
              });
            }
          }
        } catch (error) {
          console.error('[Clustering] Failed to classify by labels:', error);
          alert('AI 分类失败：' + (error.message || '未知错误'));
        } finally {
          setIsClustering(false);
        }
      }, [isClustering, aiLabels, showOriginalImages, images, opengraphData, opengraphWithEmbeddings, clusters]);

      const handleDiscover = useCallback(async () => {
        if (isClustering) return;
        
        try {
          setIsClustering(true);
          let allItems = showOriginalImages ? images : opengraphData;
          
          if (!showOriginalImages && opengraphWithEmbeddings.length > 0) {
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
          
          const clusteredItemIds = clusters
            .filter(c => c.type === 'manual')
            .flatMap(c => (c.items || []).map(item => item.id))
            .filter(Boolean);
          
          const itemsWithEmbedding = allItems.filter(item => 
            item.text_embedding || item.image_embedding
          );
          
          if (itemsWithEmbedding.length < 3) {
            alert('至少需要3个有 embedding 的卡片才能进行自动聚类');
            return;
          }
          
          const result = await discoverClusters(
            itemsWithEmbedding,
            clusteredItemIds.length > 0 ? clusteredItemIds : null,
            null
          );
          
          if (result && result.ok && result.clusters) {
            const updatedClusters = [...clusters, ...result.clusters];
            const repositionedClusters = calculateMultipleClustersLayout(updatedClusters, {
              canvasWidth: 1440,
              canvasHeight: 1024,
              clusterSpacing: 500,
              clusterCenterRadius: 250,
            });
            setClusters(repositionedClusters);
            
            const clusteredItemIds = new Set(
              result.clusters.flatMap(c => (c.items || []).map(item => item.id))
            );
            
            if (showOriginalImages) {
              setImages(prev => {
                const remaining = prev.filter(img => !clusteredItemIds.has(img.id));
                return calculateRadialLayout(remaining);
              });
            } else {
              setOpengraphData(prev => {
                const remaining = prev.filter(og => !clusteredItemIds.has(og.id));
                return calculateRadialLayout(remaining);
              });
            }
          }
        } catch (error) {
          console.error('[Clustering] Failed to discover clusters:', error);
          alert('AI 发现聚类失败：' + (error.message || '未知错误'));
        } finally {
          setIsClustering(false);
        }
      }, [isClustering, showOriginalImages, images, opengraphData, opengraphWithEmbeddings, clusters]);

      // Session 容器 ref（用于 ScrollSpy）
      const sessionContainerRef = useRef(null);

      // 处理 Session 删除
      const handleSessionDelete = useCallback((sessionId, selectedCardIds = null) => {
        if (selectedCardIds && selectedCardIds.length > 0) {
          // 删除选中的卡片
          const session = sessions.find(s => s.id === sessionId);
          if (session) {
            const updatedData = session.opengraphData.filter(item => !selectedCardIds.includes(item.id));
            updateSession(sessionId, { opengraphData: updatedData });
          }
        } else {
          // 删除整个 session
          deleteSession(sessionId);
        }
      }, [sessions, updateSession, deleteSession]);

      // 处理 Session 全部打开
      const handleSessionOpenAll = useCallback((sessionId, selectedCardIds = null) => {
        const session = sessions.find(s => s.id === sessionId);
        if (!session) return;

        const urlsToOpen = selectedCardIds && selectedCardIds.length > 0
          ? session.opengraphData
              .filter(item => selectedCardIds.includes(item.id))
              .map(item => item.url)
              .filter(Boolean)
          : session.opengraphData
              .map(item => item.url)
              .filter(Boolean);

        // 去重：使用 Set 确保每个 URL 只打开一次
        const uniqueUrls = [...new Set(urlsToOpen)];
        
        uniqueUrls.forEach(url => {
          chrome.tabs.create({ url });
        });
      }, [sessions]);

      // 调试日志
      useEffect(() => {
        console.log('[PersonalSpace] Sessions state:', {
          sessionsCount: sessions.length,
          isLoading: isSessionsLoading,
          currentSessionId,
          sessions: sessions.map(s => ({
            id: s.id,
            name: s.name,
            itemCount: s.opengraphData?.length || 0,
            hasOpengraphData: !!s.opengraphData,
          })),
        });
      }, [sessions, isSessionsLoading, currentSessionId]);

      return (
        <div className="personal-space" ref={containerRef}>
          {viewMode === 'masonry' ? (
            <>
              <SessionMasonryGrid
                sessions={sessions}
                searchQuery={searchQuery}
                onCardClick={handleCardDoubleClick}
                onSessionDelete={handleSessionDelete}
                onSessionOpenAll={handleSessionOpenAll}
                searchBarHeight={125} // 搜索栏高度 + 间距
                containerRef={sessionContainerRef}
              />
              {/* Scroll Spy Indicator */}
              {sessions.length > 1 && (
                <ScrollSpyIndicator 
                  sessions={sessions} 
                  containerRef={sessionContainerRef}
                />
              )}
            </>
          ) : (
            <RadialCanvas
              canvasRef={canvasRef}
              containerRef={containerRef}
              showOriginalImages={showOriginalImages}
              images={images}
              opengraphData={opengraphData} // 使用已计算位置的 opengraphData（在 radial 视图时已通过 calculateRadialLayout 处理）
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
              onSelect={handleSelect}
              onDragEnd={handleDragEnd}
              onCanvasClick={handleCanvasClick}
              onCardDoubleClick={handleCardDoubleClick}
              onClusterRename={handleClusterRename}
              onClusterDrag={handleClusterDrag}
              onLassoSelect={handleLassoSelect}
              onHistoryChange={handleHistoryChange}
              getCanvasCursor={getCanvasCursor}
            />
          )}

      <div className="space-function">
        <div 
          className="add-new-session"
          onClick={() => {
            // 创建新的空 session
            const newSession = createSession([]);
            setCurrentSessionId(newSession.id);
            // 切换到 masonry 视图
            setViewMode('masonry');
          }}
          style={{ cursor: 'pointer' }}
        >
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

      <ViewButtons 
        viewMode={viewMode} 
        onViewModeChange={setViewMode} 
      />

      <Component className="side-panel" property1="one" />
      
      <AIClusteringPanel
        show={showAIClusteringPanel}
        aiLabels={aiLabels}
        onClose={() => setShowAIClusteringPanel(false)}
        onLabelRename={handleLabelRename}
        onLabelDelete={handleLabelDelete}
        onAddLabel={handleAddLabel}
        onClassify={handleClassify}
        onDiscover={handleDiscover}
        isClustering={isClustering}
      />


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
                      
                      // 获取所有卡片数据
                      const allItems = showOriginalImages ? images : opengraphData;
                      
                      // ✅ 修复：只计算新聚类中的卡片 ID（不包括旧聚类）
                      const newClusterItemIds = new Set(selectedArray);
                      
                      // ✅ 获取剩余未聚类的卡片（从所有卡片中移除新聚类的卡片）
                      const remainingItems = allItems.filter(item => !newClusterItemIds.has(item.id));
                      
                      // ✅ 获取已有聚类中的卡片（不包括新聚类和剩余卡片）
                      // 排除旧的默认聚类，避免重复
                      const existingClusters = clusters.filter(c => c.id !== 'default-cluster');
                      
                      // ✅ 构建最终的聚类列表
                      const updatedClusters = [...existingClusters, cluster];
                      
                      // ✅ 如果有剩余卡片，添加默认聚类
                      if (remainingItems.length > 0) {
                        const defaultCluster = {
                          id: 'default-cluster',
                          name: '未分类',
                          type: 'default',
                          // ✅ 深拷贝，确保每个字段都被复制，包括坐标
                          items: remainingItems.map(item => ({
                            ...item,
                            id: item.id,
                            x: item.x,
                            y: item.y,
                            width: item.width || (item.is_doc_card ? 200 : 120),
                            height: item.height || (item.is_doc_card ? 150 : 120),
                            image: item.image,
                            title: item.title,
                            url: item.url,
                            is_doc_card: item.is_doc_card,
                            // 保留其他必要字段
                            text_embedding: item.text_embedding,
                            image_embedding: item.image_embedding,
                          })),
                          center: { x: 720, y: 512 }, // 临时位置，会被重新计算
                          radius: 200,
                          item_count: remainingItems.length,
                        };
                        // 总是添加新的默认聚类（因为已经排除了旧的）
                        updatedClusters.push(defaultCluster);
                      }
                      
                      // 重新计算所有聚类的位置（避免重叠）- 这设置了聚类圆心的目标位置
                      // 当有2个聚类时，默认聚类会移动到左侧（水平对称布局）
                      const repositionedClusters = calculateMultipleClustersLayout(updatedClusters, {
                        canvasWidth: 1440,
                        canvasHeight: 1024,
                        clusterSpacing: 500, // 增加间距以避免重叠
                        clusterCenterRadius: 250, // 增加半径以让聚类更分散
                      });
                      
                      // 更新聚类列表（Spring 系统会自动处理圆心和卡片位置的动画）
                      setClusters(repositionedClusters);
                      
                      // ✅ 调试日志
                      const isDev = process.env.NODE_ENV === 'development';
                      if (isDev) {
                        console.log('[Clustering] Manual cluster created:', {
                          newCluster: cluster.id,
                          newClusterItems: cluster.items?.length || 0,
                          remainingItems: remainingItems.length,
                          totalClusters: repositionedClusters.length,
                          clusterDetails: repositionedClusters.map(c => ({
                            id: c.id,
                            name: c.name,
                            type: c.type,
                            itemCount: c.items?.length || 0,
                            center: c.center,
                          })),
                        });
                      }
                      
                      // 重要：不移除已聚类的卡片，保留在 opengraphData/images 中
                      // Spring 系统需要这些卡片数据来计算和更新位置
                      
                      // 重要：剩余卡片应该由默认聚类的 Spring 系统处理
                      // 不需要手动重新计算位置，Spring 系统会根据默认聚类的中心位置自动排列
                      // 默认聚类的中心位置已经在 calculateMultipleClustersLayout 中重新计算了
                      
                      // 注意：不再直接设置卡片位置，Spring 系统会自动处理
                      // Spring 系统会：
                      // 1. 根据聚类圆心的目标位置（repositionedClusters[].center）更新圆心 Spring
                      // 2. 根据当前圆心位置计算卡片目标位置（同心圆排列）
                      // 3. 更新卡片 Spring，平滑移动到目标位置
                      
                      // 不自动取消选中（根据需求）
                      console.log('[Clustering] Manual cluster created, total clusters:', repositionedClusters.length);
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
                  // 使用 Railway 生产环境地址
                  const apiUrl = 'https://tab-cleaner-mvp-production.up.railway.app';
                  const response = await fetch(`${apiUrl}/api/v1/ai/insight`, {
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

