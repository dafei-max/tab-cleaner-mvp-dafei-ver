import React, { useEffect, useRef, useState } from 'react';
import { UI_CONFIG } from './uiConfig';

/**
 * Scroll Spy Indicator 组件（工业级稳健版）
 * 核心改进：
 * 1. 使用 intersectionRatio（最大可见面积）算法，解决"矮个子 Session"被跳过的问题
 * 2. 严格的防抖锁，防止点击跳转和 Observer 监听互相干扰
 * 3. 触底检测，确保最后一个 Session 能被选中
 */
export const ScrollSpyIndicator = ({ sessions, containerRef, activeSessionId, onActiveSessionChange }) => {
  const [currentActiveId, setCurrentActiveId] = useState(activeSessionId || sessions[0]?.id);
  
  // 🔒 核心锁：标记是否正在进行"点击跳转"
  const isClickScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef(null);

  // 避免 useEffect 闭包陷阱
  const onActiveSessionChangeRef = useRef(onActiveSessionChange);
  useEffect(() => {
    onActiveSessionChangeRef.current = onActiveSessionChange;
  }, [onActiveSessionChange]);

  // 🟢 点击跳转逻辑 (Dot -> Scroll)
  const handleDotClick = (sessionId) => {
    if (!containerRef?.current) return;
    
    // ✅ 调试：记录点击跳转
    console.log(`[DEBUG-SPY] 🚨 点击跳转! 目标ID: ${sessionId}, 当前锁状态: ${isClickScrollingRef.current}`);
    
    // 1. 上锁：告诉 Observer 闭嘴，我现在要手动接管滚动
    isClickScrollingRef.current = true;
    
    // 2. 立即更新 UI 状态 (让用户觉得反应很快)
    setCurrentActiveId(sessionId);
    if (onActiveSessionChangeRef.current) {
      onActiveSessionChangeRef.current(sessionId);
    }

    // 3. 执行平滑滚动
    const container = containerRef.current;
    const targetElement = container.querySelector(`[data-session-id="${sessionId}"]`);
    
    if (targetElement) {
      // 这里的 behavior: 'smooth' 是关键，但也需要配合 timeout 解锁
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 4. 设置解锁定时器 (给滚动动画预留 800ms，超时自动解锁)
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isClickScrollingRef.current = false;
      console.log(`[DEBUG-SPY] 🔓 解锁，Observer 重新接管`);
      // 再次确认一下位置（防止动画结束还没对齐）
    }, 800);
  };

  // 🟢 监听逻辑 (Scroll -> Dot)
  useEffect(() => {
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    if (!containerRef?.current || !safeSessions.length) return;

    const container = containerRef.current;
    const sections = Array.from(container.querySelectorAll('[data-session-id]'));
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 🔒 如果是点击触发的滚动，Observer 不许插手，直接返回
        if (isClickScrollingRef.current) {
          console.log(`[DEBUG-SPY] 🙈 滚动中，忽略 Observer 回调`);
          return;
        }

        // 🧠 核心算法升级：谁的"可见比例"最大，谁就是老大
        // 这解决了"矮个子"Session 被跳过的问题
        let maxRatio = 0;
        let bestCandidateId = null;

        entries.forEach(entry => {
          // entry.intersectionRatio: 0 到 1 之间的数值，表示可见百分比
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            bestCandidateId = entry.target.dataset.sessionId;
          }
        });

        // ✅ 调试：记录检测结果
        if (entries.length > 0) {
          console.log(`[DEBUG-SPY] 👀 Observer 检测结果:
            - 检测到的元素数量: ${entries.length}
            - 最大可见比例: ${maxRatio.toFixed(3)}
            - 最佳候选ID: ${bestCandidateId}
            - 当前激活ID: ${currentActiveId}
          `);
          
          entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
              console.log(`[DEBUG-SPY]   可见元素 #${index + 1}: ${entry.target.dataset.sessionId}, 
                intersectionRatio: ${entry.intersectionRatio.toFixed(3)}`);
            }
          });
        }

        // 只有找到了更合适的候选人，才切换状态
        if (bestCandidateId && bestCandidateId !== currentActiveId) {
          console.log(`[DEBUG-SPY] ✅ 切换激活状态: ${currentActiveId} -> ${bestCandidateId}`);
          setCurrentActiveId(bestCandidateId);
          // ⚠️ 关键：这里不要调用 onActiveSessionChange 触发外部滚动，只更新指示器自身！
          // 防止死循环：Scroll -> Observer -> SetId -> Parent Effect -> ScrollTo -> Loop
        }
      },
      {
        root: container,
        rootMargin: '-10% 0px -40% 0px', // 缩小判定范围，专注于屏幕中上方区域
        threshold: [0, 0.25, 0.5, 0.75, 1], // 增加采样点，让 intersectionRatio 更精确
      }
    );

    sections.forEach(section => observer.observe(section));

    // 🟢 补充：触底检测 (防止最后一个 Session 怎么都选不中)
    const handleScroll = () => {
      if (isClickScrollingRef.current) return; // 同样受锁控制

      const { scrollTop, scrollHeight, clientHeight } = container;
      // 如果距离底部小于 50px
      if (scrollHeight - scrollTop - clientHeight < 50) {
        const lastSession = safeSessions[safeSessions.length - 1];
        if (lastSession && lastSession.id !== currentActiveId) {
          console.log(`[DEBUG-SPY] 📍 触底检测：切换到最后一个 Session: ${lastSession.id}`);
          setCurrentActiveId(lastSession.id);
        }
      }
    };

    container.addEventListener('scroll', handleScroll);

    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [sessions, containerRef, currentActiveId]); // 依赖项

  // 同步外部状态 (例如从其他地方删除了 Session)
  useEffect(() => {
    if (activeSessionId && activeSessionId !== currentActiveId) {
      // 只有当外部 ID 真的变了，且不是我们在点击导致的，才同步
      if (!isClickScrollingRef.current) {
        setCurrentActiveId(activeSessionId);
      }
    }
  }, [activeSessionId, currentActiveId]);

  const safeSessions = Array.isArray(sessions) ? sessions : [];
  if (!safeSessions.length) return null;

  return (
    <div
      className="scroll-spy-indicator"
      style={{
        position: 'fixed',
        right: `${UI_CONFIG.markerBar.right}px`,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: `${UI_CONFIG.markerBar.gap}px`,
        alignItems: 'center',
      }}
    >
      {safeSessions.map((session) => {
        const isActive = session.id === currentActiveId;
        
        return (
          <button
            key={session.id}
            onClick={() => handleDotClick(session.id)} // 使用新的点击处理函数
            title={session.name}
            aria-pressed={isActive}
            style={{
              width: `${UI_CONFIG.markerBar.dotSize}px`,
              height: `${UI_CONFIG.markerBar.dotSize}px`,
              borderRadius: '50%',
              border: `${UI_CONFIG.markerBar.borderWidth}px solid ${
                isActive
                  ? UI_CONFIG.markerBar.activeBorderColor
                  : UI_CONFIG.markerBar.borderColor
              }`,
              backgroundColor: isActive
                ? UI_CONFIG.markerBar.activeColor
                : UI_CONFIG.markerBar.inactiveColor,
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.2s ease',
              boxShadow: isActive
                ? '0 0 12px rgba(64, 158, 255, 0.6)'
                : UI_CONFIG.markerBar.innerShadow,
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = UI_CONFIG.markerBar.hoverColor;
              e.target.style.borderColor = UI_CONFIG.markerBar.borderColor.replace('0.8', '1');
              e.target.style.transform = 'scale(1.2)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = isActive
                ? UI_CONFIG.markerBar.activeColor
                : UI_CONFIG.markerBar.inactiveColor;
              e.target.style.borderColor = isActive
                ? UI_CONFIG.markerBar.activeBorderColor
                : UI_CONFIG.markerBar.borderColor;
              e.target.style.transform = 'scale(1)';
            }}
          />
        );
      })}
    </div>
  );
};
