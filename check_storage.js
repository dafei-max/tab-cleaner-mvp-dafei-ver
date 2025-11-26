// 在 Chrome Extension Service Worker 控制台运行此代码查看存储的数据

// 查看所有存储的数据
chrome.storage.local.get(null, (items) => {
  console.log('=== 所有存储的数据 ===');
  console.log('总键数:', Object.keys(items).length);
  
  // 查看 recent_opengraph
  if (items.recent_opengraph) {
    console.log('\n=== recent_opengraph 列表 ===');
    console.log('数量:', items.recent_opengraph.length);
    console.log('前5条:', items.recent_opengraph.slice(0, 5));
    console.log('成功的数据:', items.recent_opengraph.filter(item => item.success).length);
    console.log('失败的数据:', items.recent_opengraph.filter(item => !item.success).length);
  }
  
  // 查看所有 opengraph_cache_* 键
  const cacheKeys = Object.keys(items).filter(key => key.startsWith('opengraph_cache_'));
  console.log('\n=== opengraph_cache_* 键 ===');
  console.log('数量:', cacheKeys.length);
  if (cacheKeys.length > 0) {
    console.log('前5个键:', cacheKeys.slice(0, 5));
    // 查看第一个缓存的数据
    const firstKey = cacheKeys[0];
    console.log(`\n第一个缓存 (${firstKey}):`, items[firstKey]);
  }
  
  // 查看 sessions
  if (items.sessions) {
    console.log('\n=== sessions ===');
    console.log('数量:', items.sessions.length);
    if (items.sessions.length > 0) {
      console.log('第一个 session:', items.sessions[0]);
      console.log('第一个 session 的 opengraphData 数量:', items.sessions[0].opengraphData?.length || 0);
    }
  }
});



