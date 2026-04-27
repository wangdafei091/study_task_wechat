const systemUserAccessState = require('../../utils/app/system-user-access-state');

Page({
  data: {
    checking: false
  },

  onLoad() {
    systemUserAccessState.resetBlockedRedirectState();
  },

  async onRetryTap() {
    if (this.data.checking) {
      return;
    }

    this.setData({ checking: true });

    try {
      const app = getApp();
      const loginSuccess = await app.doCloudLogin();
      if (loginSuccess) {
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
    } finally {
      this.setData({ checking: false });
    }
  }
});
