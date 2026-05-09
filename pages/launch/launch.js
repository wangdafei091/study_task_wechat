const logger = require('../../utils/logger');

Page({
  data: {
    loadingText: '正在准备...'
  },

  onLoad(options = {}) {
    this._startupOptions = options;
    this._redirecting = false;
    this.routeByStartupDecision();
  },

  onShow() {
    this.routeByStartupDecision();
  },

  async routeByStartupDecision() {
    if (this._redirecting) {
      return;
    }

    this._redirecting = true;

    try {
      const app = typeof getApp === 'function' ? getApp() : null;
      const url = typeof app?.waitForStartupDecision === 'function'
        ? await app.waitForStartupDecision({
          ...this._startupOptions,
          source: 'launch'
        })
        : '/pages/index/index';

      wx.reLaunch({
        url: url || '/pages/index/index'
      });
    } catch (error) {
      logger.error('Launch', '启动路由失败，回退到首页', error);
      wx.reLaunch({
        url: '/pages/index/index'
      });
    }
  }
});
