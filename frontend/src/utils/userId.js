/**
 * 用户ID管理工具
 * 使用Chrome Identity API获取Google账户信息，生成唯一用户ID
 */

/**
 * 获取或创建用户ID
 * 
 * 策略：
 * 1. 优先使用Chrome Identity API获取Google账户邮箱（如果用户已登录）
 * 2. 如果无法获取，使用Chrome Storage中的持久化ID
 * 3. 如果都没有，生成新的ID并保存
 * 
 * @returns {Promise<string>} 用户ID
 */
export async function getOrCreateUserId() {
  try {
    // 1. 尝试从Chrome Storage获取已保存的用户ID
    const stored = await chrome.storage.local.get(['user_id']);
    if (stored.user_id) {
      console.log('[UserId] Using stored user ID:', stored.user_id);
      return stored.user_id;
    }

    // 2. 尝试使用Chrome Identity API获取Google账户信息
    try {
      const profile = await chrome.identity.getProfileUserInfo();
      
      if (profile.email && profile.email.trim()) {
        // 使用邮箱作为用户ID（哈希处理，保护隐私）
        const userId = await hashEmail(profile.email);
        console.log('[UserId] Generated user ID from Google account:', userId);
        
        // 保存到Chrome Storage
        await chrome.storage.local.set({ user_id: userId });
        return userId;
      }
    } catch (identityError) {
      console.log('[UserId] Cannot get Google account info:', identityError);
      // Identity API可能不可用（需要权限或用户未登录），继续下一步
    }

    // 3. 生成新的唯一ID（基于设备特征）
    const userId = await generateDeviceBasedId();
    console.log('[UserId] Generated new device-based user ID:', userId);
    
    // 保存到Chrome Storage
    await chrome.storage.local.set({ user_id: userId });
    return userId;
    
  } catch (error) {
    console.error('[UserId] Error getting user ID:', error);
    // 降级到匿名ID
    return 'anonymous';
  }
}

/**
 * 哈希邮箱（保护隐私）
 * 使用简单的哈希算法，确保相同邮箱生成相同ID
 * 
 * @param {string} email - 邮箱地址
 * @returns {Promise<string>} 哈希后的用户ID
 */
async function hashEmail(email) {
  // 使用Web Crypto API进行SHA-256哈希
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // 取前32个字符作为用户ID
  return `user_${hashHex.substring(0, 32)}`;
}

/**
 * 基于设备特征生成唯一ID
 * 使用Chrome Storage的持久化特性，确保同一设备生成相同ID
 * 
 * @returns {Promise<string>} 设备ID
 */
async function generateDeviceBasedId() {
  try {
    // 尝试获取已保存的设备ID
    const stored = await chrome.storage.local.get(['device_id']);
    if (stored.device_id) {
      return `device_${stored.device_id}`;
    }

    // 生成新的设备ID（基于时间戳和随机数）
    const deviceId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await chrome.storage.local.set({ device_id: deviceId });
    return `device_${deviceId}`;
  } catch (error) {
    // 如果存储失败，使用时间戳作为降级方案
    return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 获取当前用户ID（同步版本，从缓存读取）
 * 
 * @returns {Promise<string>} 用户ID
 */
export async function getUserId() {
  try {
    const stored = await chrome.storage.local.get(['user_id']);
    return stored.user_id || 'anonymous';
  } catch (error) {
    return 'anonymous';
  }
}

