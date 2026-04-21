const logger = require('../../utils/logger');
const appAccessState = require('../../utils/app/app-access-state');

function buildInitialState(reason) {
  return {
    accessCode: appAccessState.loadPendingAppAccessCode(),
    errorMessage: appAccessState.isAppAccessError({ code: reason })
      ? appAccessState.getAppAccessErrorMessage(reason)
      : '',
    submitting: false
  };
}

Page({
  data: buildInitialState(''),

  onLoad(options = {}) {
    this.setData(buildInitialState(options.reason || ''));
  },

  onInput(e) {
    this.setData({
      accessCode: appAccessState.normalizeAppAccessCode(e.detail.value),
      errorMessage: ''
    });
  },

  async onSubmit() {
    const accessCode = appAccessState.normalizeAppAccessCode(this.data.accessCode);
    if (!accessCode) {
      this.setData({
        errorMessage: appAccessState.getAppAccessErrorMessage(appAccessState.APP_ACCESS_ERROR_CODE.REQUIRED)
      });
      return;
    }

    this.setData({
      submitting: true,
      errorMessage: ''
    });

    appAccessState.savePendingAppAccessCode(accessCode);

    try {
      const app = getApp();
      const loginSuccess = await app.doCloudLogin({
        throwOnAdmissionError: true
      });

      if (loginSuccess) {
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
    } catch (error) {
      logger.error('AccessGate', '邀请码登录失败', error);
      this.setData({
        errorMessage: appAccessState.getAppAccessErrorMessage(error)
      });
    } finally {
      this.setData({
        submitting: false
      });
    }
  }
});
