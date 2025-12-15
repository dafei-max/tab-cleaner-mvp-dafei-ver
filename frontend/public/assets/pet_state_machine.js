(() => {
  const globalCfg = window.__TAB_CLEANER_PET_CONFIG || {};
  const DEFAULT_CFG = {
    roamIntervalMin: 20000,
    roamIntervalMax: 40000,
    walkSpeed: 140,        // px/s
    walkDurationMin: 2800, // ms
    walkDurationMax: 6500, // ms
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
      clearRoamTimer();
      const delay = cfg.roamIntervalMin + Math.random() * Math.max(0, cfg.roamIntervalMax - cfg.roamIntervalMin);
      roamTimer = setTimeout(() => {
        startRoaming();
      }, delay);
    }

    function startRoaming() {
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
      const currentLeft = parseFloat(petContainer.style.left || `${(viewportW - petW) / 2}`);
      const currentTop = parseFloat(petContainer.style.top || `${(viewportH - petH) / 2}`);
      const targetLeft = Math.max(margin, Math.min(Math.random() * (viewportW - petW - margin * 2) + margin, viewportW - petW - margin));
      const targetTop = Math.max(margin, Math.min(Math.random() * (viewportH - petH - margin * 2) + margin, viewportH - petH - margin));
      const direction = targetLeft >= currentLeft ? PET_STATES.WALK_RIGHT : PET_STATES.WALK_LEFT;
      const dx = targetLeft - currentLeft;
      const dy = targetTop - currentTop;
      const distance = Math.hypot(dx, dy);
      const speed = cfg.walkSpeed;
      const minDuration = cfg.walkDurationMin;
      const maxDuration = cfg.walkDurationMax;
      const moveDuration = Math.max(minDuration, Math.min(maxDuration, (distance / speed) * 1000));

      setState(direction, { loop: true });
      petContainer.style.transition = 'none';
      requestAnimationFrame(() => {
        petContainer.style.transition = `left ${moveDuration}ms ease-in-out, top ${moveDuration}ms ease-in-out`;
        petContainer.style.left = `${targetLeft}px`;
        petContainer.style.top = `${targetTop}px`;
      });
      setTimeout(() => {
        petContainer.style.transition = '';
        setState(PET_STATES.IDLE, { loop: true });
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

