(() => {
  // 全局可覆写：window.__TAB_CLEANER_PET_CONFIG
  const defaults = {
    roamIntervalMin: 20000,
    roamIntervalMax: 40000,
    walkSpeed: 140,        // px/s
    walkDurationMin: 2800, // ms
    walkDurationMax: 6500, // ms
  };
  if (!window.__TAB_CLEANER_PET_CONFIG) {
    window.__TAB_CLEANER_PET_CONFIG = { ...defaults };
  } else {
    window.__TAB_CLEANER_PET_CONFIG = { ...defaults, ...window.__TAB_CLEANER_PET_CONFIG };
  }
})();

