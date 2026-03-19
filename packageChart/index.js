// packageChart分包入口文件
module.exports = {
  init: function(env) {
    // 记录加载时间，用于性能分析
    const startTime = Date.now();

    // 监听分包第一次渲染完成
    setTimeout(() => {
      const loadTime = Date.now() - startTime;
      // 性能日志记录，生产环境可注释
      if (wx.getSystemInfoSync().envVersion === 'develop') {
        console.log(`[packageChart] 图表分包加载完成，耗时: ${loadTime}ms`);
      }
    }, 100);
  }
}; 