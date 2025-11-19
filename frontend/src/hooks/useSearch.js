import { useState, useRef, useEffect } from "react";
import { generateEmbeddings, searchContent } from "../shared/api";

/**
 * 搜索功能 Hook
 * 
 * @param {Array} opengraphData - OpenGraph 数据（通过 ref 访问最新值）
 * @returns {Object} 搜索相关的状态和方法
 */
export const useSearch = (opengraphData = []) => {
  // 使用 ref 保存最新的 opengraphData，避免闭包问题
  const opengraphDataRef = useRef(opengraphData);
  useEffect(() => {
    opengraphDataRef.current = opengraphData;
  }, [opengraphData]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [opengraphWithEmbeddings, setOpengraphWithEmbeddings] = useState([]);
  const [searchResults, setSearchResults] = useState(null);

  // 本地模糊排序（兜底方案）
  const fuzzyRankLocally = (query, items) => {
    const q = query.toLowerCase().trim();
    const qTokens = q.split(/\s+/).filter(Boolean);
    const scored = items.map((it, idx) => {
      const text = ((it.title || it.tab_title || "") + " " + (it.description || "")).toLowerCase();
      let score = 0;
      if (text.includes(q)) score += 3;
      for (const t of qTokens) {
        if (t && text.includes(t)) score += 1;
      }
      const titleText = (it.title || it.tab_title || "").toLowerCase();
      if (titleText.includes(q)) score += 1;
      const normalizedScore = Math.min(score / 10.0, 1.0);
      return { ...it, similarity: normalizedScore, idx };
    });
    scored.sort((a, b) => (b.similarity - a.similarity) || (a.idx - b.idx));
    return scored;
  };

  // 生成 Embedding
  const generateEmbeddingsForData = async (data) => {
    if (!data || data.length === 0) {
      console.warn('[useSearch] No data to process');
      return [];
    }

    try {
      setIsSearching(true);
      console.log('[useSearch] Generating embeddings for', data.length, 'items');
      
      const batchSize = 10;
      const batches = [];
      for (let i = 0; i < data.length; i += batchSize) {
        batches.push(data.slice(i, i + batchSize));
      }

      const allProcessedItems = [];
      for (let i = 0; i < batches.length; i++) {
        console.log(`[useSearch] Processing batch ${i + 1}/${batches.length}`);
        const batch = batches[i];
        const result = await generateEmbeddings(batch);
        
        if (result.ok && result.data) {
          allProcessedItems.push(...result.data);
        }
        
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 检查是否有 embedding（text_embedding 或 image_embedding）
      // 注意：后端现在返回 text_embedding 和 image_embedding，而不是 embedding
      const itemsWithEmbedding = allProcessedItems.filter(item => {
        const hasTextEmb = item.text_embedding && Array.isArray(item.text_embedding) && item.text_embedding.length > 0;
        const hasImageEmb = item.image_embedding && Array.isArray(item.image_embedding) && item.image_embedding.length > 0;
        const hasEmbFlag = item.has_embedding === true;
        return hasTextEmb || hasImageEmb || hasEmbFlag;
      }).length;
      
      const itemsWithTextEmbedding = allProcessedItems.filter(item => 
        item.text_embedding && Array.isArray(item.text_embedding) && item.text_embedding.length > 0
      ).length;
      const itemsWithImageEmbedding = allProcessedItems.filter(item => 
        item.image_embedding && Array.isArray(item.image_embedding) && item.image_embedding.length > 0
      ).length;
      
      console.log('[useSearch] ===== Embedding Generation Summary =====');
      console.log('[useSearch] Total items processed:', allProcessedItems.length);
      console.log('[useSearch]   - Items with embedding (text or image):', itemsWithEmbedding);
      console.log('[useSearch]   - Items with text_embedding:', itemsWithTextEmbedding);
      console.log('[useSearch]   - Items with image_embedding:', itemsWithImageEmbedding);
      if (allProcessedItems.length > 0) {
        const sample = allProcessedItems[0];
        console.log('[useSearch] Sample item:', {
          url: sample.url?.substring(0, 50) || 'no url',
          has_text_emb: !!(sample.text_embedding && Array.isArray(sample.text_embedding) && sample.text_embedding.length > 0),
          has_image_emb: !!(sample.image_embedding && Array.isArray(sample.image_embedding) && sample.image_embedding.length > 0),
          has_embedding_flag: sample.has_embedding,
          text_emb_length: sample.text_embedding?.length || 0,
          image_emb_length: sample.image_embedding?.length || 0,
        });
      }
      
      setOpengraphWithEmbeddings(allProcessedItems);
      return allProcessedItems;
    } catch (error) {
      console.error('[useSearch] Error generating embeddings:', error);
      return [];
    } finally {
      setIsSearching(false);
    }
  };

  // 执行搜索
  const performSearch = async (query, calculateRadialLayout) => {
    if (!query.trim()) {
      setSearchResults(null);
      return [];
    }

    // 使用 ref 获取最新的 opengraphData
    const currentOGData = opengraphDataRef.current || [];
    
    // 检查当前数据是否已经有 embedding（text_embedding 或 image_embedding）
    const hasEmbeddingsInData = currentOGData.some(item => {
      const hasTextEmb = item.text_embedding && Array.isArray(item.text_embedding) && item.text_embedding.length > 0;
      const hasImageEmb = item.image_embedding && Array.isArray(item.image_embedding) && item.image_embedding.length > 0;
      return hasTextEmb || hasImageEmb;
    });
    
    let itemsToSearch = opengraphWithEmbeddings.length > 0 ? opengraphWithEmbeddings : currentOGData;
    
    // 如果数据中没有 embedding，且 opengraphWithEmbeddings 也为空，才生成
    if (!hasEmbeddingsInData && opengraphWithEmbeddings.length === 0 && currentOGData.length > 0) {
      console.log('[useSearch] No embeddings found, generating...');
      const generatedItems = await generateEmbeddingsForData(currentOGData);
      if (generatedItems && generatedItems.length > 0) {
        itemsToSearch = generatedItems;
        const itemsWithEmb = generatedItems.filter(item => {
          const hasTextEmb = item.text_embedding && Array.isArray(item.text_embedding) && item.text_embedding.length > 0;
          const hasImageEmb = item.image_embedding && Array.isArray(item.image_embedding) && item.image_embedding.length > 0;
          return hasTextEmb || hasImageEmb;
        });
        console.log('[useSearch] Using freshly generated embeddings:', itemsWithEmb.length, 'have embedding');
      }
    } else if (hasEmbeddingsInData) {
      // 如果数据中已经有 embedding，直接使用
      console.log('[useSearch] Using existing embeddings from data');
      itemsToSearch = currentOGData;
    }

    try {
      setIsSearching(true);
      console.log('[useSearch] Searching for:', query);
      
      const result = await searchContent(query, null, itemsToSearch);

      let finalList = [];
      if (result && result.ok && Array.isArray(result.data) && result.data.length > 0) {
        finalList = result.data;
      } else {
        console.warn('[useSearch] Backend returned empty, using local fuzzy ranking');
        finalList = fuzzyRankLocally(query, currentOGData);
      }
      
      // 按相似度排序
      finalList.sort((a, b) => {
        const simA = a.similarity ?? 0;
        const simB = b.similarity ?? 0;
        return simB - simA;
      });
      
      // 计算布局位置
      const searchResultItems = (finalList || []).map((item, index) => ({
        ...item,
        id: item.tab_id ? `og-search-${item.tab_id}` : `og-search-${index}-${Date.now()}`,
      }));
      
      const positionedResults = calculateRadialLayout(searchResultItems) || [];
      
      const finalResults = positionedResults.map((item, idx) => ({
        ...item,
        id: item.id || `og-search-${idx}-${Date.now()}`,
        x: item.x ?? 720,
        y: item.y ?? 512,
        width: item.width ?? 120,
        height: item.height ?? 120,
      }));
      
      setSearchResults(finalResults);
      return finalResults;
    } catch (error) {
      console.error('[useSearch] Error searching:', error);
      // 出错也做兜底
      const fallback = fuzzyRankLocally(query, currentOGData);
      fallback.sort((a, b) => {
        const simA = a.similarity ?? 0;
        const simB = b.similarity ?? 0;
        return simB - simA;
      });
      const fallbackItems = fallback.map((item, index) => ({
        ...item,
        id: item.tab_id ? `og-search-${item.tab_id}` : `og-search-${index}-${Date.now()}`,
      }));
      const positioned = calculateRadialLayout(fallbackItems);
      const finalFallback = positioned.map((item, idx) => ({
        ...item,
        id: item.id || `og-search-${idx}-${Date.now()}`,
        x: item.x ?? 720,
        y: item.y ?? 512,
        width: item.width ?? 120,
        height: item.height ?? 120,
      }));
      setSearchResults(finalFallback);
      return finalFallback;
    } finally {
      setIsSearching(false);
    }
  };

  // 清空搜索
  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
    // 清除 opengraphWithEmbeddings 中的相似度标记
    setOpengraphWithEmbeddings(prev => 
      prev.map(item => ({
        ...item,
        similarity: undefined,
      }))
    );
  };

  return {
    searchQuery,
    setSearchQuery,
    isSearching,
    opengraphWithEmbeddings,
    searchResults,
    performSearch,
    clearSearch,
    generateEmbeddingsForData,
  };
};

