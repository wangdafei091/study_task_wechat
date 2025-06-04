// packageComponents分包入口文件
module.exports = {
  init: function(env) {
    console.log('[packageComponents] 组件分包加载开始，时间戳：' + Date.now());
    
    // 记录加载时间，用于性能分析
    const startTime = Date.now();
    
    // 监听分包第一次渲染完成
    setTimeout(() => {
      const loadTime = Date.now() - startTime;
      console.log(`[packageComponents] 组件分包加载完成，耗时: ${loadTime}ms`);
    }, 100);
  }
}; 