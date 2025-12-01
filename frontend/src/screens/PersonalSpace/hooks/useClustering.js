import { useState, useRef, useCallback } from 'react';
import { calculateMultipleClustersLayout } from '../../../utils/clusterLayout';
import { calculateRadialLayout } from '../../../utils/radialLayout';
import { createManualCluster, classifyByLabels, discoverClusters } from '../../../shared/api';

/**
 * 管理聚类相关逻辑的 Hook
 */
export const useClustering = ({
  showOriginalImages,
  images,
  opengraphData,
  setImages,
  setOpengraphData,
}) => {
  const [clusters, setClusters] = useState([]);
  const [isClustering, setIsClustering] = useState(false);
  const [aiLabels, setAiLabels] = useState(["设计", "工作文档"]);
  const clusterDragStartRef = useRef(new Map());

  // 处理聚类重命名
  const handleClusterRename = useCallback((clusterId, newName) => {
    setClusters(prev => {
      // ✅ 修复：确保 prev 是数组
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.map(c => 
        c && c.id === clusterId ? { ...c, name: newName } : c
      );
    });
  }, []);

  // 处理聚类拖拽
  const handleClusterDrag = useCallback((clusterId, newCenter, isDragEnd) => {
    // ✅ 修复：确保 clusters 是数组
    const safeClusters = Array.isArray(clusters) ? clusters : [];
    
    if (!clusterDragStartRef.current.has(clusterId)) {
      const cluster = safeClusters.find(c => c && c.id === clusterId);
      if (cluster) {
        const initialCenter = cluster.center || { x: 720, y: 512 };
        const initialItems = (Array.isArray(cluster.items) ? cluster.items : []).map(item => ({
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

    const offsetX = newCenter.x - dragStart.center.x;
    const offsetY = newCenter.y - dragStart.center.y;

    setClusters(prev => {
      // ✅ 修复：确保 prev 是数组
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.map(c => {
        if (c && c.id === clusterId) {
          const updatedItems = (Array.isArray(c.items) ? c.items : []).map(item => {
            const initialItem = dragStart.items.find(init => init && init.id === item.id);
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
      });
    });

    if (showOriginalImages) {
      setImages(prevImages => {
        // ✅ 修复：确保 prevImages 是数组
        const safePrevImages = Array.isArray(prevImages) ? prevImages : [];
        return safePrevImages.map(img => {
          const initialItem = dragStart.items.find(init => init && init.id === img.id);
          if (initialItem) {
            return {
              ...img,
              x: initialItem.x + offsetX,
              y: initialItem.y + offsetY,
            };
          }
          return img;
        });
      });
    } else {
      setOpengraphData(prevOG => {
        // ✅ 修复：确保 prevOG 是数组
        const safePrevOG = Array.isArray(prevOG) ? prevOG : [];
        return safePrevOG.map(og => {
          const initialItem = dragStart.items.find(init => init && init.id === og.id);
          if (initialItem) {
            return {
              ...og,
              x: initialItem.x + offsetX,
              y: initialItem.y + offsetY,
            };
          }
          return og;
        });
      });
    }

    if (isDragEnd) {
      clusterDragStartRef.current.delete(clusterId);
    }
  }, [clusters, showOriginalImages, setImages, setOpengraphData]);

  // 添加标签
  const handleAddLabel = useCallback(() => {
    // ✅ 修复：确保 aiLabels 是数组
    const safeAiLabels = Array.isArray(aiLabels) ? aiLabels : [];
    const newLabel = prompt('请输入新标签名称（最多3个标签）：');
    if (newLabel && newLabel.trim() && safeAiLabels.length < 3) {
      setAiLabels(prev => {
        const safePrev = Array.isArray(prev) ? prev : [];
        return [...safePrev, newLabel.trim()];
      });
    }
  }, [aiLabels]);

  // 重命名标签
  const handleLabelRename = useCallback((idx, newLabel) => {
    setAiLabels(prev => {
      // ✅ 修复：确保 prev 是数组
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.map((l, i) => i === idx ? newLabel : l);
    });
  }, []);

  // 删除标签
  const handleLabelDelete = useCallback((idx) => {
    // ✅ 修复：确保 aiLabels 是数组
    const safeAiLabels = Array.isArray(aiLabels) ? aiLabels : [];
    if (safeAiLabels[idx] && window.confirm(`删除标签 "${safeAiLabels[idx]}"？`)) {
      setAiLabels(prev => {
        const safePrev = Array.isArray(prev) ? prev : [];
        return safePrev.filter((_, i) => i !== idx);
      });
    }
  }, [aiLabels]);

  // 按标签分类
  const handleClassify = useCallback(async () => {
    // ✅ 修复：确保 aiLabels 是数组
    const safeAiLabels = Array.isArray(aiLabels) ? aiLabels : [];
    if (isClustering || safeAiLabels.length === 0) return;
    
    try {
      setIsClustering(true);
      // ✅ 修复：确保数据是数组
      const safeImages = Array.isArray(images) ? images : [];
      const safeOpengraphData = Array.isArray(opengraphData) ? opengraphData : [];
      let allItems = showOriginalImages ? safeImages : safeOpengraphData;
      
      // ✅ 修复：确保 clusters 是数组
      const safeClusters = Array.isArray(clusters) ? clusters : [];
      const clusteredItemIds = safeClusters
        .filter(c => c && c.type === 'manual')
        .flatMap(c => (Array.isArray(c.items) ? c.items : []).map(item => item && item.id ? item.id : null).filter(Boolean));
      
      const itemsWithEmbedding = allItems.filter(item => 
        item && (item.text_embedding || item.image_embedding)
      );
      
      if (itemsWithEmbedding.length === 0) {
        alert('请先为卡片生成 embedding（可以通过搜索功能自动生成）');
        return;
      }
      
      const result = await classifyByLabels(
        safeAiLabels,
        itemsWithEmbedding,
        clusteredItemIds.length > 0 ? clusteredItemIds : null
      );
      
      if (result && result.ok && result.clusters) {
        const updatedClusters = [...safeClusters, ...result.clusters];
        const repositionedClusters = calculateMultipleClustersLayout(updatedClusters, {
          canvasWidth: 1440,
          canvasHeight: 1024,
          clusterSpacing: 500,
          clusterCenterRadius: 250,
        });
        setClusters(repositionedClusters);
        
        const classifiedItemIds = new Set(
          result.clusters.flatMap(c => (Array.isArray(c.items) ? c.items : []).map(item => item && item.id ? item.id : null).filter(Boolean))
        );
        
        if (showOriginalImages) {
          setImages(prev => {
            // ✅ 修复：确保 prev 是数组
            const safePrev = Array.isArray(prev) ? prev : [];
            const remaining = safePrev.filter(img => img && !classifiedItemIds.has(img.id));
            return calculateRadialLayout(remaining);
          });
        } else {
          setOpengraphData(prev => {
            // ✅ 修复：确保 prev 是数组
            const safePrev = Array.isArray(prev) ? prev : [];
            const remaining = safePrev.filter(og => og && !classifiedItemIds.has(og.id));
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
  }, [isClustering, aiLabels, showOriginalImages, images, opengraphData, clusters, setImages, setOpengraphData]);

  // 自动发现聚类
  const handleDiscover = useCallback(async () => {
    if (isClustering) return;
    
    try {
      setIsClustering(true);
      // ✅ 修复：确保数据是数组
      const safeImages = Array.isArray(images) ? images : [];
      const safeOpengraphData = Array.isArray(opengraphData) ? opengraphData : [];
      let allItems = showOriginalImages ? safeImages : safeOpengraphData;
      
      // ✅ 修复：确保 clusters 是数组
      const safeClusters = Array.isArray(clusters) ? clusters : [];
      const clusteredItemIds = safeClusters
        .filter(c => c && c.type === 'manual')
        .flatMap(c => (Array.isArray(c.items) ? c.items : []).map(item => item && item.id ? item.id : null).filter(Boolean));
      
      const itemsWithEmbedding = allItems.filter(item => 
        item && (item.text_embedding || item.image_embedding)
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
        const updatedClusters = [...safeClusters, ...result.clusters];
        const repositionedClusters = calculateMultipleClustersLayout(updatedClusters, {
          canvasWidth: 1440,
          canvasHeight: 1024,
          clusterSpacing: 500,
          clusterCenterRadius: 250,
        });
        setClusters(repositionedClusters);
        
        const clusteredItemIds = new Set(
          result.clusters.flatMap(c => (Array.isArray(c.items) ? c.items : []).map(item => item && item.id ? item.id : null).filter(Boolean))
        );
        
        if (showOriginalImages) {
          setImages(prev => {
            // ✅ 修复：确保 prev 是数组
            const safePrev = Array.isArray(prev) ? prev : [];
            const remaining = safePrev.filter(img => img && !clusteredItemIds.has(img.id));
            return calculateRadialLayout(remaining);
          });
        } else {
          setOpengraphData(prev => {
            // ✅ 修复：确保 prev 是数组
            const safePrev = Array.isArray(prev) ? prev : [];
            const remaining = safePrev.filter(og => og && !clusteredItemIds.has(og.id));
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
  }, [isClustering, showOriginalImages, images, opengraphData, clusters, setImages, setOpengraphData]);

  return {
    clusters,
    setClusters,
    isClustering,
    aiLabels,
    clusterDragStartRef,
    handleClusterRename,
    handleClusterDrag,
    handleAddLabel,
    handleLabelRename,
    handleLabelDelete,
    handleClassify,
    handleDiscover,
  };
};



