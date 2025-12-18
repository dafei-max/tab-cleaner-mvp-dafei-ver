(() => {
  const globalCfg = window.__TAB_CLEANER_PET_CONFIG || {};
  const DEFAULT_CFG = {
    roamIntervalMin: 40000,  // 默认 40s 后才开始漫步
    roamIntervalMax: 70000,  // 40-70s 随机，降低频率
    walkSpeed: 80,           // px/s，降低移动速度
    walkDurationMin: 4000,   // ms
    walkDurationMax: 8000,   // ms
    idlePlaybackRate: 0.7,   // idle 动画播放速度（0.7 = 70%，更慢）
    walkPlaybackRate: 0.7,   // 走路动画播放速度（0.7 = 70%，更慢）
    walkStrideMin: 0.6,      // 最小步幅倍数（相对于计算距离）
    walkStrideMax: 1.2,      // 最大步幅倍数（相对于计算距离）
  };

  const PET_STATES = {
    IDLE: 'idle',
    WAVE: 'wave',
    ATTENTION: 'raise-attention',
    LIFTED: 'lifted',
    WALK_LEFT: 'walk-left',
    WALK_RIGHT: 'walk-right',
    CLEAN_WAIT: 'clean-wait',
    CLEAN_SUCCESS: 'clean-success',
    ERROR: 'error',
    DIZZY: 'dizzy',
    QUESTION: 'question',
  };

  const PET_VIDEO_MAP = {
    [PET_STATES.IDLE]: 'static/video/idle-elephant.webm',
    [PET_STATES.WAVE]: 'static/video/wave-hand.webm',
    [PET_STATES.ATTENTION]: 'static/video/raise-attention-elephant.webm',
    [PET_STATES.LIFTED]: 'static/video/lifted-elephant.webm',
    [PET_STATES.WALK_LEFT]: 'static/video/walking-elephant.webm',
    [PET_STATES.WALK_RIGHT]: 'static/video/walking-elephant.webm',
    [PET_STATES.CLEAN_WAIT]: 'static/video/clean-elephant.webm',
    [PET_STATES.CLEAN_SUCCESS]: 'static/video/clean-successful-elephant.webm',
    [PET_STATES.ERROR]: 'static/video/error-elephant.webm',
    [PET_STATES.DIZZY]: 'static/video/dizzy-elephant.webm',
    [PET_STATES.QUESTION]: 'static/video/question-elephant.webm',
  };

  function getVideoSrcForState(state, assetFn) {
    const path = PET_VIDEO_MAP[state] || PET_VIDEO_MAP[PET_STATES.IDLE] || 'static/video/idle-elephant.webm';
    return assetFn(path);
  }

  function createPetStateMachine({
    assetFn,
    petContainerRef,
    videoElRef,
    getPetId,
    getIsDragging,
    openPersonalSpace,
    config = {},
  }) {
    const cfg = { ...DEFAULT_CFG, ...globalCfg, ...config };
    let petState = null;
    let roamTimer = null;
    let petStateEndHandler = null;

    function clearRoamTimer() {
      if (roamTimer) {
        clearTimeout(roamTimer);
        roamTimer = null;
      }
    }

    function scheduleRoam() {
      if (document.hidden) return; // 页面不可见时不排程漫步
      clearRoamTimer();
      const delay = cfg.roamIntervalMin + Math.random() * Math.max(0, cfg.roamIntervalMax - cfg.roamIntervalMin);
      roamTimer = setTimeout(() => {
        startRoaming();
      }, delay);
    }

    // 🎭 边缘检测函数
    function detectEdgePosition(petContainer) {
      const rect = petContainer.getBoundingClientRect();
      const threshold = 50; // 距离边缘 50px 内
      
      return {
        nearLeft: rect.left < threshold,
        nearRight: rect.right > window.innerWidth - threshold,
        nearTop: rect.top < threshold,
        nearBottom: rect.bottom > window.innerHeight - threshold,
        // 角落检测
        inCorner: (rect.left < threshold && rect.top < threshold) ||
                  (rect.left < threshold && rect.bottom > window.innerHeight - threshold) ||
                  (rect.right > window.innerWidth - threshold && rect.top < threshold) ||
                  (rect.right > window.innerWidth - threshold && rect.bottom > window.innerHeight - threshold),
      };
    }

    function startRoaming() {
      if (document.hidden) {
        scheduleRoam();
        return;
      }
      const petContainer = petContainerRef?.();
      const avatarVideoEl = videoElRef?.();
      if (!petContainer || !avatarVideoEl || getIsDragging?.()) {
        scheduleRoam();
        return;
      }
      if (getPetId?.() !== 'elephant') {
        scheduleRoam();
        return;
      }
      const margin = 20;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const petW = petContainer.offsetWidth || 315;
      const petH = petContainer.offsetHeight || 246;
      
      // 从 left/top 中获取当前位置
      const currentLeft = parseFloat(petContainer.style.left || `${(viewportW - petW) / 2}`);
      const currentTop = parseFloat(petContainer.style.top || `${(viewportH - petH) / 2}`);
      
      const targetLeft = Math.max(margin, Math.min(Math.random() * (viewportW - petW - margin * 2) + margin, viewportW - petW - margin));
      const targetTop = Math.max(margin, Math.min(Math.random() * (viewportH - petH - margin * 2) + margin, viewportH - petH - margin));
      const direction = targetLeft >= currentLeft ? PET_STATES.WALK_RIGHT : PET_STATES.WALK_LEFT;
      const dx = targetLeft - currentLeft;
      const dy = targetTop - currentTop;
      const baseDistance = Math.hypot(dx, dy);
      
      // 🎲 随机步幅：在最小和最大倍数之间随机
      const strideMultiplier = cfg.walkStrideMin + Math.random() * (cfg.walkStrideMax - cfg.walkStrideMin);
      const distance = baseDistance * strideMultiplier;
      
      const speed = cfg.walkSpeed;
      const minDuration = cfg.walkDurationMin;
      const maxDuration = cfg.walkDurationMax;
      const moveDuration = Math.max(minDuration, Math.min(maxDuration, (distance / speed) * 1000));

      setState(direction, { loop: true });
      petContainer.style.transition = 'none';
      requestAnimationFrame(() => {
        // 使用 left/top 定位（简化版本）
        petContainer.style.transition = `left ${moveDuration}ms ease-in-out, top ${moveDuration}ms ease-in-out`;
        petContainer.style.left = `${targetLeft}px`;
        petContainer.style.top = `${targetTop}px`;
      });
      setTimeout(() => {
        petContainer.style.transition = '';
        
        // 🎭 到达目标后检测边缘，触发有趣行为
        const edge = detectEdgePosition(petContainer);
        if (edge.inCorner) {
          // 🎭 有趣行为：被挤到角落，晕头转向
          setState(PET_STATES.DIZZY, {
            loop: false,
            nextState: PET_STATES.IDLE,
          });
        } else if (edge.nearLeft || edge.nearRight) {
          // 🎭 有趣行为：探出头往外看
          setState(PET_STATES.ATTENTION, {
            loop: false,
            nextState: PET_STATES.IDLE,
          });
        } else {
          setState(PET_STATES.IDLE, { loop: true });
        }
        scheduleRoam();
      }, moveDuration + 200);
    }

    function setState(state, options = {}) {
      if (getPetId?.() !== 'elephant') return;
      const avatarVideoEl = videoElRef?.();
      if (!avatarVideoEl) return;

      if (petStateEndHandler) {
        avatarVideoEl.removeEventListener('ended', petStateEndHandler);
        petStateEndHandler = null;
      }

      petState = state;

      if (state === PET_STATES.WALK_RIGHT) {
        avatarVideoEl.style.transform = 'scaleX(-1)';
      } else {
        avatarVideoEl.style.transform = 'scaleX(1)';
      }

      const src = getVideoSrcForState(state, assetFn);
      const shouldLoop = options.loop ?? (state === PET_STATES.IDLE || state === PET_STATES.CLEAN_WAIT);
      const nextState = options.nextState;
      const nextOptions = options.nextOptions || {};

      const needSwitch = avatarVideoEl.dataset.currentSrc !== src;
      if (needSwitch) {
        avatarVideoEl.pause();
        avatarVideoEl.src = src;
        avatarVideoEl.dataset.currentSrc = src;
      }

      avatarVideoEl.loop = !!shouldLoop;
      avatarVideoEl.muted = true;
      avatarVideoEl.autoplay = true;
      avatarVideoEl.playsInline = true;
      avatarVideoEl.preload = 'auto';
      avatarVideoEl.currentTime = 0;

      // 根据状态调整播放速度
      if (state === PET_STATES.CLEAN_SUCCESS) {
        avatarVideoEl.playbackRate = 0.75;
      } else if (state === PET_STATES.IDLE) {
        // idle 动画播放慢一点
        avatarVideoEl.playbackRate = cfg.idlePlaybackRate || 0.7;
      } else if (state === PET_STATES.WALK_LEFT || state === PET_STATES.WALK_RIGHT) {
        // 走路动画播放慢一点
        avatarVideoEl.playbackRate = cfg.walkPlaybackRate || 0.7;
      } else {
        avatarVideoEl.playbackRate = 1.0;
      }

      const playPromise = avatarVideoEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(err => {
          console.warn('[Tab Cleaner Pet] Video autoplay failed:', err);
        });
      }

      if (nextState || options.onEnded) {
        petStateEndHandler = () => {
          options.onEnded?.();
          if (nextState) {
            setState(nextState, nextOptions);
          }
        };
        avatarVideoEl.addEventListener('ended', petStateEndHandler, { once: true });
      }

      if (state === PET_STATES.IDLE) {
        scheduleRoam();
      } else if (state !== PET_STATES.WALK_LEFT && state !== PET_STATES.WALK_RIGHT) {
        clearRoamTimer();
      }
    }

    // 页面可见性变化时暂停/恢复漫步与视频，防止长时间后台消耗资源
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        const video = videoElRef?.();
        if (document.hidden) {
          clearRoamTimer();
          if (video) {
            video.pause();
          }
        } else {
          if (petState === PET_STATES.IDLE) {
            scheduleRoam();
          }
          if (video) {
            const playPromise = video.play();
            if (playPromise && typeof playPromise.catch === 'function') {
              playPromise.catch(() => {});
            }
          }
        }
      });
    }

    return {
      PET_STATES,
      setState,
      scheduleRoam,
      clearRoamTimer,
      startRoaming,
      getVideoSrcForState: (state) => getVideoSrcForState(state, assetFn),
    };
  }

  window.TabCleanerPetFSM = {
    PET_STATES,
    PET_VIDEO_MAP,
    getVideoSrcForState,
    createPetStateMachine,
  };
})();

