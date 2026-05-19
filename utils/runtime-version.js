const appMeta = require('./app-meta');

function resolveRuntimeVersion(miniProgramInfo = {}) {
  const runtimeVersion = String(miniProgramInfo.version || '').trim();
  if (runtimeVersion && runtimeVersion !== '0.0.0') {
    return runtimeVersion;
  }

  const fallbackVersion = String(appMeta.version || '').trim();
  return fallbackVersion || '未标记版本';
}

function getMiniProgramInfo() {
  if (typeof wx === 'undefined' || !wx || typeof wx.getAccountInfoSync !== 'function') {
    return {};
  }

  const accountInfo = wx.getAccountInfoSync() || {};
  return accountInfo.miniProgram || {};
}

function getRuntimeVersion() {
  return resolveRuntimeVersion(getMiniProgramInfo());
}

module.exports = {
  resolveRuntimeVersion,
  getMiniProgramInfo,
  getRuntimeVersion
};
