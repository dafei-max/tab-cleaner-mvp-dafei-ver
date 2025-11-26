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
    setClusters(prev => prev.map(c => 
      c.id === clusterId ? { ...c, name: newName } : c
    ));
  }, []);

  // 处理聚类拖拽
  const handleClusterDrag = useCallback((clusterId, newCenter, isDragEnd) => {
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

    const offsetX = newCenter.x - dragStart.center.x;
    const offsetY = newCenter.y - dragStart.center.y;

    setClusters(prev => prev.map(c => {
      if (c.id === clusterId) {
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

    if (isDragEnd) {
      clusterDragStartRef.current.delete(clusterId);
    }
  }, [clusters, showOriginalImages, setImages, setOpengraphData]);

  // 添加标签
  const handleAddLabel = useCallback(() => {
    const newLabel = prompt('请输入新标签名称（最多3个标签）：');
    if (newLabel && newLabel.trim() && aiLabels.length < 3) {
      setAiLabels(prev => [...prev, newLabel.trim()]);
    }
  }, [aiLabels.length]);

  // 重命名标签
  const handleLabelRename = useCallback((idx, newLabel) => {
    setAiLabels(prev => prev.map((l, i) => i === idx ? newLabel : l));
  }, []);

  // 删除标签
  const handleLabelDelete = useCallback((idx) => {
    if (window.confirm(`删除标签 "${aiLabels[idx]}"？`)) {
      setAiLabels(prev => prev.filter((_, i) => i !== idx));
    }
  }, [aiLabels]);

  // 按标签分类
  const handleClassify = useCallback(async () => {
    if (isClustering || aiLabels.length === 0) return;
    
    try {
      setIsClustering(true);
      let allItems = showOriginalImages ? images : opengraphData;
      
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
  }, [isClustering, aiLabels, showOriginalImages, images, opengraphData, clusters, setImages, setOpengraphData]);

  // 自动发现聚类
  const handleDiscover = useCallback(async () => {
    if (isClustering) return;
    
    try {
      setIsClustering(true);
      let allItems = showOriginalImages ? images : opengraphData;
      
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

