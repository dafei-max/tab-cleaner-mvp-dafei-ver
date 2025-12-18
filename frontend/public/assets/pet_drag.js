// pet_drag.js - 拖拽交互模块
(() => {
  'use strict';

  const PET_DEFAULT_WIDTH = 315;
  const PET_DEFAULT_HEIGHT = 246;
  const LONG_PRESS_THRESHOLD = 200; // 长按阈值（ms）
  const SHAKE_VELOCITY_THRESHOLD = 800; // px/s（用于触发晃动动画）

  /**
   * 初始化拖拽功能
   */
  function setupDragHandlers({
    petContainer,
    shadow,
    avatar,
    avatarVideo,
    petMainEl,
    setButtonsVisible,
    petFsm,
    petStates,
    savePetState,
  }) {
    const globalCfg = window.__TAB_CLEANER_PET_CONFIG || {};
    const DRAG_ANCHOR = {
      x: globalCfg.dragAnchorX ?? 0.75,
      y: globalCfg.dragAnchorY ?? 0.15,
    };
    
    let isDragging = false;
    let lastPositions = [];
    let dragStartTime = 0;
    let dragStartX = 0;
    let dragStartY = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let animationFrameId = null;
    
    // 连续点击检测
    let clickCount = 0;
    let lastClickTime = 0;
    const DIZZY_CLICK_THRESHOLD = globalCfg.dizzyClickThreshold ?? 3;
    const DIZZY_CLICK_RESET_TIME = globalCfg.dizzyClickResetTime ?? 1000;
    
    // 获取锚点偏移
    const getAnchorOffset = () => {
      const containerWidth = petContainer.offsetWidth || PET_DEFAULT_WIDTH;
      const containerHeight = petContainer.offsetHeight || PET_DEFAULT_HEIGHT;
      const currentCfg = window.__TAB_CLEANER_PET_CONFIG || {};
      const currentAnchorX = currentCfg.dragAnchorX ?? DRAG_ANCHOR.x;
      const currentAnchorY = currentCfg.dragAnchorY ?? DRAG_ANCHOR.y;
      return {
        x: containerWidth * currentAnchorX,
        y: containerHeight * currentAnchorY
      };
    };
    
    // 节流函数
    function throttle(fn, delay = 16) {
      let lastCall = 0;
      return function(...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
          lastCall = now;
          fn.apply(this, args);
        }
      };
    }
    
    // 计算速度
    function calculateVelocity() {
      if (lastPositions.length < 2) return 0;
      const now = performance.now();
      const recent = lastPositions.filter(p => now - p.time < 100);
      if (recent.length < 2) return 0;
      
      const first = recent[0];
      const last = recent[recent.length - 1];
      const dt = (last.time - first.time) / 1000;
      if (dt === 0) return 0;
      const distance = Math.hypot(last.x - first.x, last.y - first.y);
      return distance / dt;
    }
    
    function trackVelocity(x, y) {
      const now = performance.now();
      lastPositions.push({ x, y, time: now });
      lastPositions = lastPositions.filter(p => now - p.time < 100);
    }

    // 创建 Ripple 效果
    function createRipple(x, y) {
      const ripple = document.createElement('div');
      ripple.style.cssText = `
        position: fixed;
        left: ${x - 10}px;
        top: ${y - 10}px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.9);
        background: rgba(255, 255, 255, 0.2);
        pointer-events: none;
        z-index: 2147483647;
        transform-origin: center;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.6);
        animation: pet-ripple-animation 0.6s ease-out forwards;
      `;
      
      if (!document.getElementById('pet-ripple-style')) {
        const style = document.createElement('style');
        style.id = 'pet-ripple-style';
        style.textContent = `
          @keyframes pet-ripple-animation {
            0% { transform: scale(0); opacity: 0.8; }
            50% { opacity: 0.4; }
            100% { transform: scale(4); opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(ripple);
      setTimeout(() => {
        if (ripple.parentNode) ripple.remove();
      }, 600);
    }

    // 垂摆动画
    function updatePendulumAnimation() {
      if (!isDragging) {
        animationFrameId = null;
        return;
      }
      
      const damping = 0.15;
      const dx = targetX - currentX;
      const dy = targetY - currentY;
      
      currentX += dx * damping;
      currentY += dy * damping;
      
      petContainer.style.left = `${currentX}px`;
      petContainer.style.top = `${currentY}px`;
      
      animationFrameId = requestAnimationFrame(updatePendulumAnimation);
    }

    // 鼠标按下
    const handleMouseDown = (e) => {
      const target = e.target;
      if (target.closest('.action-button') || target.closest('.choice-overlay')) {
        return;
      }
      
      dragStartTime = Date.now();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      
      const rect = petContainer.getBoundingClientRect();
      currentX = rect.left;
      currentY = rect.top;
      
      lastPositions = [];
      petContainer.style.cursor = 'grabbing';
      e.preventDefault();
      
      const longPressTimer = setTimeout(() => {
        isDragging = true;
        
        const anchorOffset = getAnchorOffset();
        targetX = dragStartX - anchorOffset.x;
        targetY = dragStartY - anchorOffset.y;
        
        const containerWidth = petContainer.offsetWidth || PET_DEFAULT_WIDTH;
        const containerHeight = petContainer.offsetHeight || PET_DEFAULT_HEIGHT;
        const maxLeft = window.innerWidth - containerWidth * 0.7;
        const maxTop = window.innerHeight - containerHeight * 0.8;
        const minLeft = -containerWidth * 0.3;
        const minTop = -containerHeight * 0.2;
        
        targetX = Math.max(minLeft, Math.min(targetX, maxLeft));
        targetY = Math.max(minTop, Math.min(targetY, maxTop));
        
        petContainer.style.left = `${targetX}px`;
        petContainer.style.top = `${targetY}px`;
        currentX = targetX;
        currentY = targetY;
        
        petContainer.classList.remove('released', 'shaken', 'landed');
        petContainer.style.transition = 'transform 0.15s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        requestAnimationFrame(() => {
          petContainer.style.transform = 'scale(1.05) rotate(2deg)';
          setTimeout(() => {
            petContainer.style.transition = '';
            petContainer.style.transform = '';
          }, 150);
        });

        if (petFsm && petStates && petStates.LIFTED) {
          try {
            petFsm.setState(petStates.LIFTED, { loop: true });
          } catch (err) {
            console.warn('[Tab Cleaner Pet] Failed to set LIFTED state:', err);
          }
        }
        
        if (!animationFrameId) {
          updatePendulumAnimation();
        }
      }, LONG_PRESS_THRESHOLD);
      
      petContainer._longPressTimer = longPressTimer;
    };

    // 鼠标移动
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const anchorOffset = getAnchorOffset();
      let newTargetX = e.clientX - anchorOffset.x;
      let newTargetY = e.clientY - anchorOffset.y;
      
      const containerWidth = petContainer.offsetWidth || PET_DEFAULT_WIDTH;
      const containerHeight = petContainer.offsetHeight || PET_DEFAULT_HEIGHT;
      const maxLeft = window.innerWidth - containerWidth * 0.7;
      const maxTop = window.innerHeight - containerHeight * 0.8;
      const minLeft = -containerWidth * 0.3;
      const minTop = -containerHeight * 0.2;
      
      targetX = Math.max(minLeft, Math.min(newTargetX, maxLeft));
      targetY = Math.max(minTop, Math.min(newTargetY, maxTop));
      
      if (!animationFrameId) {
        updatePendulumAnimation();
      }
      trackVelocity(e.clientX, e.clientY);
    };
    
    const throttledMouseMove = throttle(handleMouseMove, 16);

    // 鼠标释放
    const handleMouseUp = (e) => {
      if (petContainer._longPressTimer) {
        clearTimeout(petContainer._longPressTimer);
        petContainer._longPressTimer = null;
      }
      
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      
      if (isDragging) {
        isDragging = false;
        petContainer.style.cursor = '';
        
        const velocity = calculateVelocity();
        petContainer.classList.remove('released', 'shaken', 'landed');
        petContainer.style.transition = '';
        petContainer.style.transform = '';
        
        if (velocity > SHAKE_VELOCITY_THRESHOLD) {
          petContainer.classList.add('shaken');
          setTimeout(() => petContainer.classList.remove('shaken'), 500);
        } else {
          petContainer.classList.add('landed');
          setTimeout(() => petContainer.classList.remove('landed'), 400);
        }

        if (petFsm && petStates && petStates.IDLE) {
          try {
            petFsm.setState(petStates.IDLE, { loop: true });
          } catch (err) {
            console.warn('[Tab Cleaner Pet] Failed to set IDLE state after drag:', err);
          }
        }
        
        if (savePetState) {
          savePetState();
        }
      }
    };

    // 点击处理
    const handleAvatarClick = (e) => {
      if (isDragging) return;
      e.stopPropagation();
      
      createRipple(e.clientX, e.clientY);
      
      const now = Date.now();
      if (now - lastClickTime < DIZZY_CLICK_RESET_TIME) {
        clickCount++;
      } else {
        clickCount = 1;
      }
      lastClickTime = now;
      
      if (clickCount >= DIZZY_CLICK_THRESHOLD) {
        console.log('[Pet] 连续点击触发 DIZZY，点击次数:', clickCount);
        if (petFsm && petStates && petStates.DIZZY) {
          try {
            petFsm.setState(petStates.DIZZY, {
              loop: false,
              nextState: petStates.IDLE,
            });
            clickCount = 0;
            return;
          } catch (err) {
            console.warn('[Tab Cleaner Pet] Failed to set DIZZY state on click:', err);
          }
        }
      }
      
      // 🎬 播放 question 动画（单击时）
      if (petFsm && petStates && petStates.QUESTION) {
        try {
          petFsm.setState(petStates.QUESTION, {
            loop: false,
            nextState: petStates.IDLE,
          });
        } catch (err) {
          console.warn('[Tab Cleaner Pet] Failed to set QUESTION state on click:', err);
        }
      }
      
      // 💬 触发互动对话（点击小象时显示 id:26 的对话）
      if (window.__TAB_CLEANER_PET_CHAT_BUBBLE && window.__TAB_CLEANER_PET_CHAT_BUBBLE.trigger) {
        try {
          // 点击小象时显示 id:26 的对话："嘿，你来啦～Prrru…有什么我能帮你的吗？"
          window.__TAB_CLEANER_PET_CHAT_BUBBLE.trigger(null, 26);
        } catch (err) {
          console.warn('[Tab Cleaner Pet] Failed to trigger chat bubble on click:', err);
        }
      }
      
      // 使用传入的 setButtonsVisible 函数，需要获取当前状态
      if (setButtonsVisible) {
        // 通过检查 choiceOverlay 的 visible class 来判断当前状态
        const choiceOverlay = shadow.querySelector('.choice-overlay');
        const isCurrentlyVisible = choiceOverlay && choiceOverlay.classList.contains('visible');
        setButtonsVisible(!isCurrentlyVisible);
      }
    };
    
    // 绑定事件
    petContainer.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', throttledMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    petContainer.style.cursor = 'grab';
    petContainer.style.userSelect = 'none';
    
    if (avatar) avatar.addEventListener('click', handleAvatarClick);
    if (avatarVideo) avatarVideo.addEventListener('click', handleAvatarClick);
    if (!avatar && !avatarVideo && petMainEl) {
      petMainEl.addEventListener('click', handleAvatarClick);
    }

    // 首次展示提示
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['petDragHintShown'], (items) => {
          if (items.petDragHintShown) return;
          const main = shadow.querySelector('.desktop-pet-main');
          if (!main) return;

          const hint = document.createElement('div');
          hint.textContent = '拖拽网页图片到我这里即可收藏';
          hint.style.cssText = `
            position: absolute;
            bottom: 210px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15,23,42,0.92);
            color: #F9FAFB;
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            box-shadow: 0 6px 18px rgba(15,23,42,0.4);
            z-index: 9999;
            opacity: 0;
            pointer-events: none;
            white-space: nowrap;
            transition: opacity 0.25s ease-out, transform 0.25s ease-out;
          `;

          main.appendChild(hint);
          requestAnimationFrame(() => {
            hint.style.opacity = '1';
            hint.style.transform = 'translateX(-50%) translateY(-4px)';
          });
          setTimeout(() => {
            hint.style.opacity = '0';
            hint.style.transform = 'translateX(-50%) translateY(0)';
            setTimeout(() => hint.remove(), 250);
          }, 3500);
          chrome.storage.local.set({ petDragHintShown: true }, () => {});
        });
      }
    } catch (e) {
      // 忽略提示错误
    }

    return {
      isDragging: () => isDragging,
    };
  }

  // 导出 API
  window.TabCleanerPetDrag = {
    setupDragHandlers,
  };
})();

