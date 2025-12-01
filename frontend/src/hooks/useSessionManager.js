import { useState, useEffect, useCallback } from 'react';

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

  // 从 storage 加载 sessions
  const loadSessions = useCallback(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        try {
          // ✅ 修复：确保 loadedSessions 是数组
          const rawSessions = result[STORAGE_KEY];
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
      });
    } else {
      setSessions([]);
      setCurrentSessionId(null);
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // 监听 storage 变化，自动更新 sessions
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const listener = (changes, areaName) => {
        if (areaName === 'local' && changes[STORAGE_KEY]) {
          console.log('[SessionManager] Storage changed, reloading sessions...');
          loadSessions();
        }
      };
      
      chrome.storage.onChanged.addListener(listener);
      
      return () => {
        chrome.storage.onChanged.removeListener(listener);
      };
    }
  }, [loadSessions]);

  // 保存 sessions 到 storage
  const saveSessions = useCallback((newSessions) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ [STORAGE_KEY]: newSessions }, () => {
        if (chrome.runtime.lastError) {
          console.error('[SessionManager] Failed to save sessions:', chrome.runtime.lastError);
        }
      });
    }
  }, []);

  // 创建新 session
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
    setSessions(newSessions);
    setCurrentSessionId(newSession.id);
    saveSessions(newSessions);

    return newSession;
  }, [sessions, saveSessions]);

  // 更新 session 数据
  const updateSession = useCallback((sessionId, updates) => {
    // ✅ 修复：确保 sessions 是数组
    const safeSessions = Array.isArray(sessions) ? sessions : [];
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
    setSessions(newSessions);
    saveSessions(newSessions);
  }, [sessions, saveSessions]);

  // 删除 session
  const deleteSession = useCallback((sessionId) => {
    // ✅ 修复：确保 sessions 是数组
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const newSessions = safeSessions.filter(s => s && s.id !== sessionId);
    setSessions(newSessions);
    saveSessions(newSessions);
    
    // 如果删除的是当前 session，切换到最新的
    if (sessionId === currentSessionId) {
      if (newSessions.length > 0) {
        setCurrentSessionId(newSessions[0].id);
      } else {
        setCurrentSessionId(null);
      }
    }
  }, [sessions, currentSessionId, saveSessions]);

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

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    isLoading,
    createSession,
    updateSession,
    deleteSession,
    getCurrentSession,
    renameSession,
    createSessionFromClean,
  };
};



