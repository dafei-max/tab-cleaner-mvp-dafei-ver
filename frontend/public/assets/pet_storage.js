// pet_storage.js - 存储同步模块
(() => {
  'use strict';

  const DEFAULT_PET_ID = 'elephant';

  /**
   * 加载宠物状态从 Chrome Storage
   */
  async function loadPetState({
    petContainer,
    isPetVisible,
    setPetVisible,
    showPet,
    createPet,
  }) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await new Promise((resolve) => {
          chrome.storage.local.get(['petVisible', 'petPosition', 'selectedPet'], (items) => {
            resolve(items);
          });
        });
        
        // ✅ 修复：初次安装时，如果 petVisible 未设置，默认显示宠物（小象）
        let shouldBeVisible = result.petVisible === true;
        const isFirstInstall = result.petVisible === undefined;
        
        if (isFirstInstall) {
          console.log('[Tab Cleaner Pet] 🎉 First install detected, showing pet by default (elephant)');
          shouldBeVisible = true;
          // 设置默认值：显示宠物，默认小象
          await new Promise((resolve) => {
            chrome.storage.local.set({
              petVisible: true,
              selectedPet: DEFAULT_PET_ID, // 默认小象
            }, () => {
              console.log('[Tab Cleaner Pet] ✅ Default pet state saved');
              resolve();
            });
          });
        }
        
        console.log('[Tab Cleaner Pet] Loaded pet state from storage:', {
          petVisible: shouldBeVisible,
          petPosition: result.petPosition,
          selectedPet: result.selectedPet || DEFAULT_PET_ID,
          isFirstInstall: isFirstInstall
        });
        
        // ✅ v2.2: 根据存储状态立即显示或隐藏（模块已加载，响应更快）
        if (shouldBeVisible) {
          // ✅ 立即显示，减少延迟
          const showAndRestorePosition = async () => {
            await showPet();
            // ✅ 恢复位置（在容器创建后）
            if (result.petPosition && petContainer) {
              petContainer.style.left = result.petPosition.left || '0px';
              petContainer.style.top = result.petPosition.top || '0px';
              console.log('[Tab Cleaner Pet] Position restored:', result.petPosition);
            }
          };
          
          // ✅ 如果 DOM 已加载，立即执行；否则等待 DOMContentLoaded
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
              showAndRestorePosition();
            }, { once: true });
          } else {
            // DOM 已就绪，立即执行
            showAndRestorePosition();
          }
        } else {
          // ✅ v2.2: 如果应该隐藏，确保容器已创建但隐藏（为后续显示做准备）
          console.log('[Tab Cleaner Pet] Pet should be hidden, ensuring container is ready but hidden');
          if (!petContainer) {
            // 创建容器但不显示（为后续快速显示做准备）
            await createPet();
          }
          // 确保是隐藏状态
          if (petContainer) {
            petContainer.style.display = "none";
            setPetVisible(false);
          }
        }
        
        return {
          petVisible: shouldBeVisible,
          petPosition: result.petPosition,
          selectedPet: result.selectedPet || DEFAULT_PET_ID,
        };
      }
    } catch (e) {
      console.warn('[Tab Cleaner Pet] Failed to load pet state:', e);
    }
    return null;
  }
  
  /**
   * 保存宠物状态到 Chrome Storage
   */
  async function savePetState({
    petContainer,
    isPetVisible,
  }) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        // 扩展上下文失效时跳过
        if (!chrome.runtime?.id) {
          console.warn('[Tab Cleaner Pet] Extension context invalidated, skip save');
          return;
        }
        const position = petContainer ? {
          left: petContainer.style.left || '0px',
          top: petContainer.style.top || '0px'
        } : null;
        
        await new Promise((resolve) => {
          chrome.storage.local.set({
            petVisible: isPetVisible,
            petPosition: position
          }, () => {
            if (chrome.runtime.lastError) {
              // 过滤已知的无害错误
              if (!chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
                console.warn('[Tab Cleaner Pet] Failed to save pet state:', chrome.runtime.lastError);
              }
            } else {
              console.log('[Tab Cleaner Pet] Pet state saved:', { petVisible: isPetVisible, position });
            }
            resolve();
          });
        });
        
        // 通知所有标签页更新（通过 storage.onChanged 事件）
        // 这个事件会自动触发所有标签页的 chrome.storage.onChanged 监听器
      }
    } catch (e) {
      console.warn('[Tab Cleaner Pet] Failed to save pet state:', e);
    }
  }
  
  /**
   * 监听存储变化，同步宠物状态到所有标签页
   * ✅ v2.3: 确保监听器只设置一次，避免重复监听
   */
  function setupStorageSync({
    showPet,
    hidePet,
    petContainer,
    setPetVisible,
  }) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) {
      console.warn('[Tab Cleaner Pet] chrome.storage.onChanged not available');
      return;
    }
    
    // ✅ v2.3: 检查是否已经设置过监听器（通过全局标志）
    if (window.__TAB_CLEANER_PET_STORAGE_SYNC_SETUP) {
      console.log('[Tab Cleaner Pet] Storage sync already setup, skipping');
      return;
    }
    window.__TAB_CLEANER_PET_STORAGE_SYNC_SETUP = true;
    
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      
      // ✅ 只响应其他标签页的变化（避免自己触发自己）
      if (changes.petVisible) {
        const newValue = changes.petVisible.newValue;
        console.log('[Tab Cleaner Pet] Storage changed: petVisible =', newValue);
        
        if (newValue === true) {
          showPet();
        } else if (newValue === false) {
          hidePet();
        }
      }
      
      // ✅ 同步位置变化
      if (changes.petPosition && petContainer) {
        const newPosition = changes.petPosition.newValue;
        if (newPosition) {
          petContainer.style.left = newPosition.left || '0px';
          petContainer.style.top = newPosition.top || '0px';
          console.log('[Tab Cleaner Pet] Position synced from storage:', newPosition);
        }
      }
    });
    
    console.log('[Tab Cleaner Pet] ✅ Storage sync listener setup complete');
  }

  // 导出 API
  window.TabCleanerPetStorage = {
    loadPetState,
    savePetState,
    setupStorageSync,
  };
})();

