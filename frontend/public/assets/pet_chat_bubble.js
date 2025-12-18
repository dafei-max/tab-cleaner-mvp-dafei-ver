// pet_chat_bubble.js - 聊天气泡状态机
(() => {
  'use strict';

  // 对话数据（从 dialogue.json 加载）
  let dialogueData = null;

  // 加载对话数据
  async function loadDialogueData(assetFn) {
    if (dialogueData) return dialogueData;
    
    try {
      const response = await fetch(assetFn('assets/dialogue.json'));
      if (response.ok) {
        const data = await response.json();
        dialogueData = data.leo_pet_dialogs || [];
        console.log('[Pet Chat Bubble] Loaded', dialogueData.length, 'dialogues');
        return dialogueData;
      }
    } catch (err) {
      console.warn('[Pet Chat Bubble] Failed to load dialogue.json:', err);
    }
    
    return [];
  }

  // 随机选择对话
  function getRandomDialogue(dialogues, category = null, excludeIds = []) {
    if (!dialogues || dialogues.length === 0) {
      return { content: '...' };
    }
    
    let candidates = dialogues;
    if (category) {
      candidates = dialogues.filter(d => d.category === category);
      if (candidates.length === 0) {
        candidates = dialogues; // 如果分类没有匹配，使用全部
      }
    }
    
    // 排除指定的 id（用于自动显示时排除互动对话）
    if (excludeIds.length > 0) {
      candidates = candidates.filter(d => !excludeIds.includes(d.id));
      // 如果过滤后没有候选，使用全部（避免空列表）
      if (candidates.length === 0) {
        candidates = dialogues.filter(d => !excludeIds.includes(d.id));
      }
    }
    
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
  }

  // 根据 ID 获取对话
  function getDialogueById(dialogues, id) {
    if (!dialogues || dialogues.length === 0) {
      return { content: '...' };
    }
    
    const dialogue = dialogues.find(d => d.id === id);
    return dialogue || { content: '...' };
  }

  // 根据 ID 获取对话
  function getDialogueById(dialogues, id) {
    if (!dialogues || dialogues.length === 0) {
      return { content: '...' };
    }
    
    const dialogue = dialogues.find(d => d.id === id);
    return dialogue || { content: '...' };
  }

  // 创建聊天气泡状态机
  function createChatBubbleStateMachine({
    assetFn,
    chatBubbleEl,
    textContentEl,
    config = {},
  }) {
    const cfg = {
      showIntervalMin: 8000,
      showIntervalMax: 15000,
      displayDuration: 4000,
      fadeInDuration: 300,
      fadeOutDuration: 300,
      ...config,
    };

    let isVisible = false;
    let showTimer = null;
    let hideTimer = null;
    let dialogues = [];

    // 清理定时器
    function clearTimers() {
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }

    // 显示聊天气泡
    async function showBubble(category = null, dialogueId = null, excludeIds = null) {
      // 检查元素是否存在
      if (!chatBubbleEl || !textContentEl) {
        console.warn('[Pet Chat Bubble] Elements not found:', { chatBubbleEl: !!chatBubbleEl, textContentEl: !!textContentEl });
        return;
      }
      // 如果正在显示且不是手动触发（excludeIds 为空数组表示手动触发），则允许覆盖
      if (isVisible && excludeIds !== null && excludeIds.length === 0) {
        // 手动触发时，允许覆盖当前显示
        isVisible = false;
      } else if (isVisible) {
        // 自动显示时，如果已显示则跳过
        return;
      }
      
      // 确保对话数据已加载
      if (dialogues.length === 0) {
        dialogues = await loadDialogueData(assetFn);
      }
      
      // 根据 ID 或分类选择对话
      let dialogue;
      if (dialogueId !== null) {
        dialogue = getDialogueById(dialogues, dialogueId);
      } else {
        // 如果 excludeIds 为 null，默认排除 id:18-26（自动显示时）
        const idsToExclude = excludeIds !== null ? excludeIds : [18, 19, 20, 21, 22, 23, 24, 25, 26];
        dialogue = getRandomDialogue(dialogues, category, idsToExclude);
      }
      textContentEl.textContent = dialogue.content || '...';
      
      // 显示动画
      chatBubbleEl.style.display = 'block';
      chatBubbleEl.style.opacity = '0';
      chatBubbleEl.style.transform = 'translateY(10px) scale(0.9)';
      chatBubbleEl.style.transition = `opacity ${cfg.fadeInDuration}ms ease-out, transform ${cfg.fadeInDuration}ms ease-out`;
      
      requestAnimationFrame(() => {
        chatBubbleEl.style.opacity = '1';
        chatBubbleEl.style.transform = 'translateY(0) scale(1)';
      });
      
      isVisible = true;
      
      // 自动隐藏
      hideTimer = setTimeout(() => {
        hideBubble();
      }, cfg.displayDuration);
    }

    // 隐藏聊天气泡
    function hideBubble() {
      if (!isVisible || !chatBubbleEl) return;
      
      chatBubbleEl.style.transition = `opacity ${cfg.fadeOutDuration}ms ease-out, transform ${cfg.fadeOutDuration}ms ease-out`;
      chatBubbleEl.style.opacity = '0';
      chatBubbleEl.style.transform = 'translateY(6px) scale(0.585)'; /* 同步缩小 scale 到 65% */
      
      setTimeout(() => {
        if (chatBubbleEl) {
          chatBubbleEl.style.display = 'none';
        }
        isVisible = false;
        scheduleNextShow();
      }, cfg.fadeOutDuration);
    }

    // 点击隐藏聊天气泡（用户主动关闭，不影响下次出现）
    function handleBubbleClick(e) {
      if (!isVisible || !chatBubbleEl) return;
      e.stopPropagation(); // 阻止事件冒泡
      hideBubble();
    }

    // 安排下一次显示
    function scheduleNextShow() {
      if (document.hidden) return; // 页面不可见时不排程
      
      clearTimers();
      const delay = cfg.showIntervalMin + Math.random() * (cfg.showIntervalMax - cfg.showIntervalMin);
      
      showTimer = setTimeout(() => {
        if (!document.hidden) {
          showBubble();
        } else {
          scheduleNextShow();
        }
      }, delay);
    }

    // 手动触发显示（带分类或 ID）- 立即显示，不等待
    function triggerShow(category = null, dialogueId = null) {
      clearTimers();
      // 如果正在显示，立即取消淡出动画，直接显示新内容
      if (isVisible && chatBubbleEl) {
        // 取消当前的淡出动画和定时器
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        chatBubbleEl.style.transition = 'none';
        chatBubbleEl.style.opacity = '0';
        chatBubbleEl.style.transform = 'translateY(6px) scale(0.585)';
        isVisible = false;
        // 强制重置状态，确保 showBubble 可以执行
        requestAnimationFrame(() => {
          isVisible = false; // 确保状态已重置
        });
      }
      // 立即显示新内容（不排除任何 id，允许显示所有对话，包括 id:18-26）
      // 使用 setTimeout 确保状态已重置
      setTimeout(() => {
        showBubble(category, dialogueId, []);
      }, 0);
    }

    // 页面可见性变化时暂停/恢复
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          clearTimers();
        } else {
          if (!isVisible) {
            scheduleNextShow();
          }
        }
      });
    }

    // 绑定点击事件：用户点击气泡可以关闭它
    if (chatBubbleEl) {
      chatBubbleEl.addEventListener('click', handleBubbleClick);
      // 确保气泡可以接收点击事件（在显示时）
      // 注意：CSS 中已经设置了 pointer-events: auto
    }

    return {
      show: showBubble,
      hide: hideBubble,
      trigger: triggerShow,
      scheduleNext: scheduleNextShow,
      clearTimers,
    };
  }

  window.TabCleanerPetChatBubble = {
    createChatBubbleStateMachine,
    loadDialogueData,
    getRandomDialogue,
    getDialogueById,
  };
})();

