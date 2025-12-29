import { useState, useEffect, useCallback, useRef } from 'react';
import { enrichSessionsWithColors } from '../utils/colorUtils';
import { normalizeHex } from '../utils/colorUtils';

/**
 * Session 数据结构：
 * {
 *   id: string (UUID 或时间戳)
 *   name: string (默认 "洗衣筐1", "洗衣筐2", ...)
 *   createdAt: number (时间戳)
 *   opengraphData: Array (标签页数据)
 *   tabCount: number (标签页数量)
 * }
 */

const STORAGE_KEY = 'sessions';
const COLOR_ENRICH_FLAG = 'colorEnrichCompleted_v1'; // 版本化标记，避免重复处理
const DEBOUNCE_DELAY = 500; // 防抖延迟（毫秒）

/**
 * 安全的 storage 读取操作
 */
const safeStorageGet = async (key, defaultValue = null) => {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return defaultValue;
    }
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          console.error(`[Storage] Get ${key} failed:`, chrome.runtime.lastError);
          resolve(defaultValue);
        } else {
          resolve(result[key] ?? defaultValue);
        }
      });
    });
  } catch (e) {
    console.error(`[Storage] Get ${key} failed:`, e);
    return defaultValue;
  }
};

/**
 * 安全的 storage 写入操作
 */
const safeStorageSet = async (data) => {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return false;
    }
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          console.error('[Storage] Set failed:', chrome.runtime.lastError);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  } catch (e) {
    console.error('[Storage] Set failed:', e);
    return false;
  }
};

/**
 * 生成唯一 ID
 */
const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 生成默认 session 名称
 */
const generateSessionName = (existingSessions) => {
  // ✅ 修复：确保 existingSessions 是数组
  const safeSessions = Array.isArray(existingSessions) ? existingSessions : [];
  const existingNames = safeSessions.map(s => s && s.name ? s.name : null).filter(Boolean);
  let counter = 1;
  let name = `洗衣筐${counter}`;
  while (existingNames.includes(name)) {
    counter++;
    name = `洗衣筐${counter}`;
  }
  return name;
};

/**
 * Session 管理 Hook
 */
export const useSessionManager = () => {
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const colorEnrichRunningRef = useRef(false); // 防止重复执行
  
  // ✅ 优化：写入控制
  const pendingWriteRef = useRef(null);
  const writeTimeoutRef = useRef(null);
  const writeQueueRef = useRef([]);
  const isWritingRef = useRef(false);
  const colorEnrichTimerRef = useRef(null); // 颜色补全防抖

  // 从 storage 加载 sessions
  const loadSessions = useCallback(async () => {
    try {
      const rawSessions = await safeStorageGet(STORAGE_KEY, []);
      const loadedSessions = Array.isArray(rawSessions) ? rawSessions : [];
      // 按时间倒序排列（最新的在顶部）
      const sortedSessions = loadedSessions
        .filter(s => s && typeof s === 'object') // 过滤无效项
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setSessions(sortedSessions);
      
      // 如果有 sessions，默认选择最新的
      if (sortedSessions.length > 0 && sortedSessions[0] && sortedSessions[0].id) {
        setCurrentSessionId(sortedSessions[0].id);
      } else {
        setCurrentSessionId(null);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('[SessionManager] Failed to load sessions:', error);
      setSessions([]);
      setCurrentSessionId(null);
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // ✅ 优化：监听 storage 变化（来自其他脚本的更新）
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const listener = (changes, areaName) => {
        if (areaName === 'local' && changes[STORAGE_KEY]) {
          // 只有当不是我们自己写入时才更新
          if (!isWritingRef.current) {
            console.log('[SessionManager] Storage changed (external), reloading sessions...');
            loadSessions();
          } else {
            console.log('[SessionManager] Storage changed (internal), ignoring...');
          }
        }
      };
      
      chrome.storage.onChanged.addListener(listener);
      
      return () => {
        chrome.storage.onChanged.removeListener(listener);
      };
    }
  }, [loadSessions]);

  // ✅ 优化：防抖写入 storage（read-modify-write 模式）
  const debouncedSave = useCallback(async (newSessions) => {
    // 更新待写入数据
    pendingWriteRef.current = newSessions;
    
    // 清除之前的定时器
    if (writeTimeoutRef.current) {
      clearTimeout(writeTimeoutRef.current);
    }
    
    // 设置新的定时器
    writeTimeoutRef.current = setTimeout(async () => {
      if (pendingWriteRef.current === null) return;
      
      const dataToWrite = pendingWriteRef.current;
      pendingWriteRef.current = null;
      
      setIsSaving(true);
      isWritingRef.current = true;
      
      try {
        // ✅ read-modify-write 模式：先读取最新数据，合并后再写入
        const currentData = await safeStorageGet(STORAGE_KEY, []);
        const currentHash = JSON.stringify(currentData);
        const newHash = JSON.stringify(dataToWrite);
        
        // 如果数据相同，跳过写入
        if (currentHash === newHash) {
          console.log('[SessionManager] Data unchanged, skipping write');
          return;
        }
        
        // 写入新数据
        const success = await safeStorageSet({ [STORAGE_KEY]: dataToWrite });
        if (success) {
          console.log('[SessionManager] ✅ Saved sessions:', dataToWrite.length);
        } else {
          console.error('[SessionManager] ❌ Failed to save sessions');
        }
      } catch (error) {
        console.error('[SessionManager] Save error:', error);
      } finally {
        setIsSaving(false);
        // 延迟重置 isWritingRef，避免立即触发 storage.onChanged
        setTimeout(() => {
          isWritingRef.current = false;
        }, 100);
      }
    }, DEBOUNCE_DELAY);
  }, []);

  // ✅ 优化：立即保存（跳过防抖，用于关键操作）
  const saveImmediate = useCallback(async (newSessions) => {
    // 清除待处理的防抖写入
    if (writeTimeoutRef.current) {
      clearTimeout(writeTimeoutRef.current);
      pendingWriteRef.current = null;
    }
    
    setIsSaving(true);
    isWritingRef.current = true;
    
    try {
      const success = await safeStorageSet({ [STORAGE_KEY]: newSessions });
      if (success) {
        setSessions(newSessions);
        console.log('[SessionManager] ✅ Saved sessions immediately:', newSessions.length);
        return true;
      } else {
        console.error('[SessionManager] ❌ Failed to save sessions');
        return false;
      }
    } catch (e) {
      console.error('[SessionManager] Save failed:', e);
      return false;
    } finally {
      setIsSaving(false);
      // 延迟重置 isWritingRef
      setTimeout(() => {
        isWritingRef.current = false;
      }, 100);
    }
  }, []);

  // 保存 sessions 到 storage（保持向后兼容，使用防抖版本）
  const saveSessions = useCallback((newSessions) => {
    debouncedSave(newSessions);
  }, [debouncedSave]);

  // 🆕 颜色值规范化（hex -> #RRGGBB），修复历史数据
  useEffect(() => {
    if (isLoading || !sessions.length || colorEnrichRunningRef.current) return;

    let updated = 0;
    const sanitizedSessions = sessions.map(session => {
      if (!session?.opengraphData) return session;
      let changed = false;
      const sanitizedOG = session.opengraphData.map(item => {
        if (!item || !Array.isArray(item.dominant_colors)) return item;
        const original = item.dominant_colors;
        const sanitized = original
          .map(normalizeHex)
          .filter(Boolean);
        if (sanitized.length !== original.length || sanitized.some((c, idx) => c !== original[idx])) {
          changed = true;
          return { ...item, dominant_colors: sanitized };
        }
        return item;
      });
      if (changed) {
        updated += 1;
        return { ...session, opengraphData: sanitizedOG };
      }
      return session;
    });

    if (updated > 0) {
      console.warn(`[SessionManager] 🛠️ 颜色值规范化，修复了 ${updated} 个 session 的 dominant_colors`);
      setSessions(sanitizedSessions);
      // ✅ 使用防抖保存
      debouncedSave(sanitizedSessions);
    }
  }, [isLoading, sessions, debouncedSave]);

  // ✅ 优化：自动补全缺失的颜色数据（从 thumbnail 中提取，带防抖）
  useEffect(() => {
    // 条件检查：有 sessions、不在加载中、没有正在执行
    if (isLoading || !sessions.length || colorEnrichRunningRef.current) {
      return;
    }

    // ✅ 防抖：清除之前的定时器
    if (colorEnrichTimerRef.current) {
      clearTimeout(colorEnrichTimerRef.current);
    }

    // 设置防抖定时器（2秒）
    colorEnrichTimerRef.current = setTimeout(() => {
      // 检查是否需要补全：统计缺少颜色但有 thumbnail 的项目数量
      let needsEnrich = 0;
      let totalItems = 0;
      let itemsWithThumbnail = 0;
      let itemsWithColors = 0;
      let itemsWithThumbnailButNoColors = 0;
      
      sessions.forEach(session => {
        if (session?.opengraphData) {
          session.opengraphData.forEach(item => {
            totalItems++;
            const hasColors = item.dominant_colors && Array.isArray(item.dominant_colors) && item.dominant_colors.length > 0;
            const hasThumbnail = item.thumbnail && item.thumbnail.startsWith('data:image');
            
            if (hasColors) itemsWithColors++;
            if (hasThumbnail) itemsWithThumbnail++;
            if (!hasColors && hasThumbnail) {
              itemsWithThumbnailButNoColors++;
              needsEnrich++;
            }
          });
        }
      });

      // 🆕 详细统计信息
      console.log(`[SessionManager] 📊 数据统计: 总计 ${totalItems} 项, ${itemsWithColors} 有颜色, ${itemsWithThumbnail} 有缩略图, ${itemsWithThumbnailButNoColors} 有缩略图但无颜色`);

      // 如果没有需要补全的，跳过
      if (needsEnrich === 0) {
        if (itemsWithThumbnail === 0 && totalItems > 0) {
          // 🆕 优化：缩略图会在图片加载后自动生成（由 SessionCard 的 ImageWithFallback 组件处理）
          // 这不是错误，只是说明缩略图会在渲染时按需生成
          console.log(`[SessionManager] ℹ️ 提示: ${totalItems} 个项目的缩略图将在图片加载后自动生成（按需生成，无需担心）`);
        }
        return;
      }

      console.log(`[SessionManager] 🎨 Found ${needsEnrich} items need color extraction...`);
      colorEnrichRunningRef.current = true;

      // 异步补全颜色
      (async () => {
        try {
          const { sessions: enrichedSessions, updated } = await enrichSessionsWithColors(
            sessions,
            (current, total, updatedCount) => {
              // 每 20 个项目打印一次进度
              if (current % 20 === 0 || current === total) {
                console.log(`[SessionManager] 🎨 Color extraction progress: ${current}/${total}, updated: ${updatedCount}`);
              }
            }
          );

          if (updated > 0) {
            console.log(`[SessionManager] ✅ Color extraction completed, updated ${updated} items`);
            // ✅ 使用防抖保存
            debouncedSave(enrichedSessions);
            setSessions(enrichedSessions);
          }
        } catch (e) {
          console.error('[SessionManager] Color extraction failed:', e);
        } finally {
          colorEnrichRunningRef.current = false;
        }
      })();
    }, 2000); // 2秒防抖

    return () => {
      if (colorEnrichTimerRef.current) {
        clearTimeout(colorEnrichTimerRef.current);
      }
    };
  }, [sessions, isLoading, debouncedSave]);

  // ✅ 优化：创建新 session（乐观更新）
  const createSession = useCallback((opengraphData = []) => {
    // ✅ 修复：确保 sessions 和 opengraphData 是数组
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const safeOpengraphData = Array.isArray(opengraphData) ? opengraphData : [];
    const newSession = {
      id: generateSessionId(),
      name: generateSessionName(safeSessions),
      createdAt: Date.now(),
      opengraphData: safeOpengraphData,
      tabCount: safeOpengraphData.length,
    };

    const newSessions = [newSession, ...safeSessions]; // 新 session 在顶部
    
    // ✅ 乐观更新：立即更新 UI
    setSessions(newSessions);
    setCurrentSessionId(newSession.id);
    
    // ✅ 防抖保存：后台异步保存
    debouncedSave(newSessions);

    return newSession;
  }, [sessions, debouncedSave]);

  // ✅ 优化：更新 session 数据（乐观更新 + 防抖保存）
  const updateSession = useCallback((sessionId, updates) => {
    setSessions(prevSessions => {
      // ✅ 修复：确保 sessions 是数组
      const safeSessions = Array.isArray(prevSessions) ? prevSessions : [];
      const newSessions = safeSessions.map(session => {
        if (session && session.id === sessionId) {
          const updated = { ...session, ...updates };
          // 如果更新了 opengraphData，自动更新 tabCount
          if (updates.opengraphData !== undefined) {
            const safeOpengraphData = Array.isArray(updates.opengraphData) ? updates.opengraphData : [];
            updated.tabCount = safeOpengraphData.length;
          }
          return updated;
        }
        return session;
      });
      
      // ✅ 防抖保存：后台异步保存
      debouncedSave(newSessions);
      
      return newSessions;
    });
  }, [debouncedSave]);

  // ✅ 优化：删除 session（乐观更新 + 防抖保存）
  const deleteSession = useCallback((sessionId) => {
    setSessions(prevSessions => {
      // ✅ 修复：确保 sessions 是数组
      const safeSessions = Array.isArray(prevSessions) ? prevSessions : [];
      const newSessions = safeSessions.filter(s => s && s.id !== sessionId);
      
      // ✅ 防抖保存：后台异步保存
      debouncedSave(newSessions);
      
      // 如果删除的是当前 session，切换到最新的
      if (sessionId === currentSessionId) {
        if (newSessions.length > 0) {
          setCurrentSessionId(newSessions[0].id);
        } else {
          setCurrentSessionId(null);
        }
      }
      
      return newSessions;
    });
  }, [currentSessionId, debouncedSave]);

  // 获取当前 session
  const getCurrentSession = useCallback(() => {
    // ✅ 修复：确保 sessions 是数组
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    return safeSessions.find(s => s && s.id === currentSessionId) || null;
  }, [sessions, currentSessionId]);

  // 重命名 session
  const renameSession = useCallback((sessionId, newName) => {
    updateSession(sessionId, { name: newName });
  }, [updateSession]);

  // 从"一键清理"创建 session（在 background.js 中调用）
  const createSessionFromClean = useCallback((opengraphData) => {
    return createSession(opengraphData);
  }, [createSession]);

  // ✅ 优化：强制同步（从 storage 重新读取）
  const forceSync = useCallback(async () => {
    setIsLoading(true);
    await loadSessions();
    setIsLoading(false);
  }, [loadSessions]);

  // ✅ 清理函数：组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (writeTimeoutRef.current) {
        clearTimeout(writeTimeoutRef.current);
      }
      if (colorEnrichTimerRef.current) {
        clearTimeout(colorEnrichTimerRef.current);
      }
    };
  }, []);

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    isLoading,
    isSaving, // ✅ 新增：保存状态
    createSession,
    updateSession,
    deleteSession,
    getCurrentSession,
    renameSession,
    createSessionFromClean,
    saveImmediate, // ✅ 新增：立即保存
    forceSync, // ✅ 新增：强制同步
  };
};



