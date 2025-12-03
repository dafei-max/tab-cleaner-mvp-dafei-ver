/**
 * 用户ID检查脚本
 * 在浏览器控制台运行，检查当前用户ID和数据添加情况
 */

(async function checkUserId() {
  console.log('🔍 开始检查用户ID...\n');
  
  try {
    // 1. 检查存储的用户ID
    console.log('=== 1. 检查存储的用户ID ===');
    const stored = await chrome.storage.local.get(['user_id', 'device_id']);
    console.log('✅ 存储的用户ID:', stored.user_id || '❌ 未设置');
    console.log('✅ 存储的设备ID:', stored.device_id || '❌ 未设置');
    
    if (!stored.user_id) {
      console.log('\n⚠️  警告：用户ID未设置！');
      console.log('   这可能导致数据被存储到 anonymous 用户ID下');
    } else {
      console.log('\n✅ 用户ID已设置，刷新扩展不会改变');
    }
    
    // 2. 尝试获取用户ID（模拟前端逻辑）
    console.log('\n=== 2. 获取用户ID（模拟前端逻辑） ===');
    try {
      // 检查是否有 user_id
      if (stored.user_id) {
        console.log('✅ 从存储读取用户ID:', stored.user_id);
      } else {
        console.log('⚠️  存储中没有用户ID，将生成新的');
        
        // 尝试获取 Google 账户
        try {
          const profile = await chrome.identity.getProfileUserInfo();
          if (profile.email) {
            console.log('✅ 检测到 Google 账户:', profile.email);
            console.log('   将生成基于邮箱的用户ID (user_xxx)');
          } else {
            console.log('⚠️  未检测到 Google 账户邮箱');
            console.log('   将生成设备ID (device_xxx)');
          }
        } catch (e) {
          console.log('⚠️  无法获取 Google 账户信息:', e.message);
          console.log('   将生成设备ID (device_xxx)');
        }
      }
    } catch (error) {
      console.error('❌ 获取用户ID失败:', error);
    }
    
    // 3. 检查数据添加情况
    console.log('\n=== 3. 数据添加检查 ===');
    console.log('📋 检查步骤：');
    console.log('   1. 打开开发者工具 → Network 标签');
    console.log('   2. 执行一个操作（如清理tab）');
    console.log('   3. 查找 /api/v1/search/embedding 请求');
    console.log('   4. 检查 Request Headers 中是否有 X-User-ID');
    console.log('   5. 应该看到: X-User-ID: ' + (stored.user_id || '未设置'));
    
    // 4. 检查后端数据
    console.log('\n=== 4. 后端数据检查 ===');
    console.log('📋 运行诊断脚本：');
    console.log('   cd backend/app');
    console.log('   python diagnose_search_issue.py --user-id ' + (stored.user_id || 'anonymous'));
    
    // 5. 提供快速操作
    console.log('\n=== 5. 快速操作 ===');
    console.log('📋 复制以下代码到控制台：');
    console.log('');
    console.log('// 检查所有存储数据');
    console.log('chrome.storage.local.get(null, console.log);');
    console.log('');
    console.log('// 手动设置用户ID（如果需要）');
    console.log('chrome.storage.local.set({ user_id: "device_1764658383255_28u4om0xg" });');
    console.log('');
    console.log('// 清除用户ID（会重新生成）');
    console.log('chrome.storage.local.remove(["user_id", "device_id"]);');
    
    console.log('\n✅ 检查完成！');
    
  } catch (error) {
    console.error('❌ 检查失败:', error);
  }
})();

