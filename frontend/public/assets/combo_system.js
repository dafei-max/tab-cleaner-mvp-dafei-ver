// combo_system.js - Combo 连击系统模块（蓝白水色系）
(() => {
  'use strict';

  console.log('[Combo System] 🎮 Combo system module loaded');

  /**
   * 🎮 Combo 系统配置（蓝白水色系）
   */
  const COMBO_CONFIG = {
    comboWindow: 2000, // 2秒内连续喂图才算 combo
    tiers: [
      { count: 1,  name: '',         color: '#B0C4DE', scale: 1.0,  shake: 0 },      // 淡蓝灰
      { count: 2,  name: '二连!',    color: '#87CEEB', scale: 1.1,  shake: 4 },      // 天蓝色（增强）
      { count: 3,  name: '三连!',    color: '#5F9EA0', scale: 1.15, shake: 6 },      // 钢青色（增强）
      { count: 5,  name: '五连!!',   color: '#4682B4', scale: 1.2,  shake: 8 },     // 钢蓝色（增强）
      { count: 7,  name: '七连!!!',  color: '#1E90FF', scale: 1.25, shake: 10 },     // 道奇蓝（增强）
      { count: 10, name: '十连!!!!', color: '#00BFFF', scale: 1.3,  shake: 12 },     // 深天蓝（增强）
      { count: 15, name: '超神!!!!!', color: '#00CED1', scale: 1.35, shake: 15 },   // 深青色（增强）
      { count: 20, name: '无敌!!!!!!', color: '#00FFFF', scale: 1.4, shake: 18 },   // 青色（增强）
    ],
    particles: {
      count: 8, // 增加基础粒子数
      countPerCombo: 3, // 增加每连击增加的粒子数
      maxCount: 35, // 增加最大粒子数
      colors: ['#87CEEB', '#5F9EA0', '#4682B4', '#1E90FF', '#00BFFF', '#00CED1', '#00FFFF', '#B0E0E6', '#E0F6FF', '#F0F8FF'],
      size: { min: 6, max: 18 }, // 增大粒子尺寸
      speed: { min: 120, max: 300 }, // 增加粒子速度
      lifetime: 900, // 延长粒子生命周期
    },
    text: {
      fontSize: { base: 36, perCombo: 5, max: 72 }, // 增大字体
      duration: 1000, // 延长显示时间
    },
  };

  let comboCount = 0;
  let lastFeedTime = 0;
  let comboTimer = null;

  /**
   * 🎮 获取当前 Combo 等级
   */
  function getCurrentTier() {
    let tier = COMBO_CONFIG.tiers[0];
    for (const t of COMBO_CONFIG.tiers) {
      if (comboCount >= t.count) tier = t;
    }
    return tier;
  }

  /**
   * 🎮 应用 Combo 打击动画（增强版：pet一起震动）
   */
  function applyComboHitAnimation(pet, tier) {
    if (!pet) return;
    
    // ✅ 应用缩放动画
    pet.style.setProperty('--combo-scale', tier.scale);
    pet.classList.remove('combo-hit', 'combo-shake');
    void pet.offsetWidth; // 强制重排
    pet.classList.add('combo-hit');
    
    // ✅ 应用震动动画（增强打击感）
    if (tier.shake > 0) {
      // 增强震动幅度
      const shakeX = tier.shake * 1.5; // 增加X方向震动
      const shakeY = tier.shake * 1.0; // Y方向震动
      pet.style.setProperty('--shake-x', `${shakeX}px`);
      pet.style.setProperty('--shake-y', `${shakeY}px`);
      pet.classList.add('combo-shake');
    }
    
    // ✅ 同时震动整个容器（增强打击感）
    const petContainer = pet.closest('#tab-cleaner-pet-container') || pet;
    if (petContainer && tier.shake > 0) {
      petContainer.classList.add('combo-shake');
      petContainer.style.setProperty('--shake-x', `${tier.shake * 1.5}px`);
      petContainer.style.setProperty('--shake-y', `${tier.shake * 1.0}px`);
    }
    
    setTimeout(() => {
      if (pet) {
        pet.classList.remove('combo-hit', 'combo-shake');
      }
      if (petContainer) {
        petContainer.classList.remove('combo-shake');
      }
    }, 400);
  }

  /**
   * 🎮 生成粒子效果
   */
  function spawnComboParticles(x, y, tier) {
    const particleCount = Math.min(
      COMBO_CONFIG.particles.count + comboCount * COMBO_CONFIG.particles.countPerCombo,
      COMBO_CONFIG.particles.maxCount
    );
    
    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'combo-particle';
      
      const size = COMBO_CONFIG.particles.size.min + 
        Math.random() * (COMBO_CONFIG.particles.size.max - COMBO_CONFIG.particles.size.min);
      const color = COMBO_CONFIG.particles.colors[
        Math.floor(Math.random() * COMBO_CONFIG.particles.colors.length)
      ];
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
      const speed = COMBO_CONFIG.particles.speed.min + 
        Math.random() * (COMBO_CONFIG.particles.speed.max - COMBO_CONFIG.particles.speed.min);
      
      Object.assign(particle.style, {
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        borderRadius: '50%',
        boxShadow: `0 0 ${size * 3}px ${color}, 0 0 ${size * 5}px ${color}80`, // 增强发光
        pointerEvents: 'none',
        zIndex: '2147483647', // 最上层
      });
      
      document.body.appendChild(particle);
      
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 80;
      const gravity = 400;
      const startTime = performance.now();
      const startX = x;
      const startY = y;
      
      function animate() {
        const elapsed = performance.now() - startTime;
        const t = elapsed / 1000;
        
        if (elapsed > COMBO_CONFIG.particles.lifetime) {
          particle.remove();
          return;
        }
        
        const px = startX + vx * t;
        const py = startY + vy * t + 0.5 * gravity * t * t;
        const opacity = 1 - elapsed / COMBO_CONFIG.particles.lifetime;
        const scale = 1 - elapsed / COMBO_CONFIG.particles.lifetime * 0.5;
        
        particle.style.left = `${px}px`;
        particle.style.top = `${py}px`;
        particle.style.opacity = opacity;
        particle.style.transform = `scale(${scale})`;
        
        requestAnimationFrame(animate);
      }
      
      requestAnimationFrame(animate);
    }
  }

  /**
   * 🎮 显示 Combo 文字
   */
  function showComboText(x, y, tier) {
    if (!tier.name) return;
    
    const text = document.createElement('div');
    text.className = 'combo-text';
    text.textContent = tier.name;
    
    const fontSize = Math.min(
      COMBO_CONFIG.text.fontSize.base + comboCount * COMBO_CONFIG.text.fontSize.perCombo,
      COMBO_CONFIG.text.fontSize.max
    );
    
    Object.assign(text.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y - 50}px`,
      fontSize: `${fontSize}px`,
      color: tier.color,
      fontFamily: 'Arial Black, Helvetica Neue, sans-serif',
      fontWeight: '900',
      textShadow: `3px 3px 0 rgba(0,0,0,0.5), -2px -2px 0 rgba(255,255,255,0.7), 0 0 20px ${tier.color}, 0 0 40px ${tier.color}80`, // 增强阴影和发光
      pointerEvents: 'none',
      zIndex: '2147483647', // 最上层
      whiteSpace: 'nowrap',
      transform: 'translate(-50%, -50%)',
      animation: 'combo-text-rise 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
    });
    
    document.body.appendChild(text);
    setTimeout(() => text.remove(), COMBO_CONFIG.text.duration);
  }

  /**
   * 🎮 显示 Combo 计数
   */
  function showComboCounter(x, y, tier) {
    if (comboCount < 2) return;
    
    const counter = document.createElement('div');
    counter.className = 'combo-counter';
    counter.textContent = `${comboCount}`;
    
    Object.assign(counter.style, {
      position: 'fixed',
      left: `${x + 60}px`,
      top: `${y - 30}px`,
      color: tier.color,
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: '80px', // 增大字体
      fontWeight: '900',
      textShadow: `4px 4px 0 ${tier.color}80, 8px 8px 0 rgba(0,0,0,0.3), 0 0 25px ${tier.color}, 0 0 50px ${tier.color}80`, // 增强阴影和发光
      pointerEvents: 'none',
      zIndex: '2147483647', // 最上层
      animation: 'combo-counter-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
    });
    
    document.body.appendChild(counter);
    setTimeout(() => counter.remove(), 500);
  }

  /**
   * 🎮 显示冲击波
   */
  function showComboShockwave(x, y, tier) {
    if (comboCount < 3) return;
    
    const wave = document.createElement('div');
    wave.className = 'combo-shockwave';
    
    Object.assign(wave.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      border: `3px solid ${tier.color}`,
      pointerEvents: 'none',
      zIndex: '2147483647', // 最上层
      animation: 'shockwave-expand 0.5s ease-out forwards',
    });
    
    document.body.appendChild(wave);
    setTimeout(() => wave.remove(), 500);
  }

  /**
   * 🎮 显示发光效果
   */
  function showComboGlow(x, y, tier) {
    if (comboCount < 5) return;
    
    const glow = document.createElement('div');
    glow.className = 'combo-glow';
    
    const size = 150 + comboCount * 15;
    
    Object.assign(glow.style, {
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: `radial-gradient(circle, ${tier.color} 0%, transparent 70%)`,
      pointerEvents: 'none',
      zIndex: '2147483647', // 最上层
      animation: 'combo-glow-pulse 0.6s ease-out forwards',
    });
    
    document.body.appendChild(glow);
    setTimeout(() => glow.remove(), 600);
  }

  /**
   * 🎮 注入 Combo 系统 CSS 动画
   */
  function injectComboStyles() {
    if (document.getElementById('combo-system-styles')) return;
    
    const styleSheet = document.createElement('style');
    styleSheet.id = 'combo-system-styles';
    styleSheet.textContent = `
      /* 🎮 Combo 系统动画（蓝白水色系） */
      @keyframes combo-hit {
        0% { transform: scale(1); }
        10% { transform: scale(var(--combo-scale, 1.1)); }
        20% { transform: scale(0.9); }
        30% { transform: scale(1.05); }
        40% { transform: scale(0.95); }
        50% { transform: scale(1.02); }
        100% { transform: scale(1); }
      }
      @keyframes combo-shake {
        0%, 100% { transform: translate(0, 0); }
        5% { transform: translate(calc(var(--shake-x, 3px) * -1), var(--shake-y, 2px)); }
        10% { transform: translate(var(--shake-x, 3px), calc(var(--shake-y, 2px) * -1)); }
        15% { transform: translate(calc(var(--shake-x, 3px) * -0.8), var(--shake-y, 2px)); }
        20% { transform: translate(var(--shake-x, 3px), calc(var(--shake-y, 2px) * -0.8)); }
        25% { transform: translate(calc(var(--shake-x, 3px) * -0.5), var(--shake-y, 2px)); }
        30% { transform: translate(var(--shake-x, 3px), calc(var(--shake-y, 2px) * -0.5)); }
        35% { transform: translate(calc(var(--shake-x, 3px) * -0.3), calc(var(--shake-y, 2px) * 0.3)); }
        40% { transform: translate(var(--shake-x, 3px), calc(var(--shake-y, 2px) * 0.3)); }
        45% { transform: translate(calc(var(--shake-x, 3px) * -0.2), calc(var(--shake-y, 2px) * -0.2)); }
        50% { transform: translate(var(--shake-x, 3px), calc(var(--shake-y, 2px) * -0.2)); }
        55% { transform: translate(calc(var(--shake-x, 3px) * -0.1), calc(var(--shake-y, 2px) * 0.1)); }
        60% { transform: translate(var(--shake-x, 3px), calc(var(--shake-y, 2px) * 0.1)); }
        100% { transform: translate(0, 0); }
      }
      @keyframes combo-text-rise {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) translateY(20px) scale(0.5) rotate(-10deg);
        }
        20% {
          opacity: 1;
          transform: translate(-50%, -50%) translateY(-30px) scale(1.2) rotate(5deg);
        }
        40% {
          transform: translate(-50%, -50%) translateY(-50px) scale(1) rotate(-3deg);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) translateY(-80px) scale(0.8) rotate(0deg);
        }
      }
      @keyframes combo-counter-pop {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0) rotate(-20deg);
        }
        50% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.3) rotate(10deg);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1) rotate(0deg) translateY(-20px);
        }
      }
      @keyframes shockwave-expand {
        0% {
          width: 20px;
          height: 20px;
          opacity: 0.8;
          transform: translate(-50%, -50%);
        }
        100% {
          width: 200px;
          height: 200px;
          opacity: 0;
          transform: translate(-50%, -50%);
        }
      }
      @keyframes combo-glow-pulse {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.5);
        }
        30% {
          opacity: 0.6;
          transform: translate(-50%, -50%) scale(1.2);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(1.5);
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }

  /**
   * 🎮 触发 Combo 系统
   * @param {number} x - 触发位置的 X 坐标
   * @param {number} y - 触发位置的 Y 坐标
   * @param {Function} findPetElement - 查找桌宠元素的函数
   */
  function triggerCombo(x, y, findPetElement) {
    const now = performance.now();
    
    // 检查是否在 combo 窗口内
    if (now - lastFeedTime > COMBO_CONFIG.comboWindow) {
      comboCount = 0;
    }
    
    comboCount++;
    lastFeedTime = now;
    
    // 重置计时器
    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
      comboCount = 0;
    }, COMBO_CONFIG.comboWindow);
    
    // 获取等级
    const tier = getCurrentTier();
    
    // 获取桌宠位置（用于显示特效）- 使用实时 DOM 位置
    const pet = findPetElement ? findPetElement() : null;
    if (!pet) {
      console.warn('[Combo System] ⚠️ Pet element not found, cannot trigger combo');
      return;
    }
    const petRect = pet.getBoundingClientRect();
    const centerX = petRect.left + petRect.width / 2;
    const centerY = petRect.top + petRect.height / 2;
    
    console.log('[Combo System] 🎮 Triggering combo at pet position:', { centerX, centerY, comboCount, tier: tier.name });
    
    // 确保 CSS 已注入
    injectComboStyles();
    
    // 执行特效
    applyComboHitAnimation(pet, tier);
    spawnComboParticles(centerX, centerY, tier);
    showComboText(centerX, centerY, tier);
    showComboCounter(centerX, centerY, tier);
    if (comboCount >= 3) showComboShockwave(centerX, centerY, tier);
    if (comboCount >= 5) showComboGlow(centerX, centerY, tier);
  }

  /**
   * 🎮 重置 Combo 计数
   */
  function resetCombo() {
    comboCount = 0;
    lastFeedTime = 0;
    if (comboTimer) {
      clearTimeout(comboTimer);
      comboTimer = null;
    }
  }

  /**
   * 🎮 获取当前 Combo 数
   */
  function getComboCount() {
    return comboCount;
  }

  // 导出 API
  window.TabCleanerComboSystem = {
    trigger: triggerCombo,
    reset: resetCombo,
    getCount: getComboCount,
    getConfig: () => COMBO_CONFIG,
  };
})();

