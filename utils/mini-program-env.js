function getAppBaseInfoSafe() {
  if (typeof wx === 'undefined' || !wx || typeof wx.getAppBaseInfo !== 'function') {
    return {};
  }

  try {
    return wx.getAppBaseInfo() || {};
  } catch (error) {
    return {};
  }
}

function getEnvVersion() {
  const appBaseInfo = getAppBaseInfoSafe();
  return appBaseInfo.envVersion || 'develop';
}

function isReleaseEnv() {
  return getEnvVersion() === 'release';
}

module.exports = {
  getEnvVersion,
  isReleaseEnv
};
