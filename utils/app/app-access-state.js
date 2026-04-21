const PENDING_APP_ACCESS_CODE_KEY = 'pending_app_access_code';

const APP_ACCESS_ERROR_CODE = {
  REQUIRED: 'AUTH_APP_ACCESS_CODE_REQUIRED',
  INVALID: 'AUTH_APP_ACCESS_CODE_INVALID',
  EXPIRED: 'AUTH_APP_ACCESS_CODE_EXPIRED'
};

function normalizeAppAccessCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function loadPendingAppAccessCode() {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
    return '';
  }

  return normalizeAppAccessCode(wx.getStorageSync(PENDING_APP_ACCESS_CODE_KEY));
}

function savePendingAppAccessCode(value) {
  if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
    return '';
  }

  const normalizedCode = normalizeAppAccessCode(value);
  wx.setStorageSync(PENDING_APP_ACCESS_CODE_KEY, normalizedCode);
  return normalizedCode;
}

function clearPendingAppAccessCode() {
  if (typeof wx === 'undefined') {
    return;
  }

  if (typeof wx.removeStorageSync === 'function') {
    wx.removeStorageSync(PENDING_APP_ACCESS_CODE_KEY);
    return;
  }

  if (typeof wx.setStorageSync === 'function') {
    wx.setStorageSync(PENDING_APP_ACCESS_CODE_KEY, '');
  }
}

function getAppAccessErrorCode(error) {
  return error && error.code ? String(error.code) : '';
}

function isAppAccessError(error) {
  const code = getAppAccessErrorCode(error);
  return code === APP_ACCESS_ERROR_CODE.REQUIRED ||
    code === APP_ACCESS_ERROR_CODE.INVALID ||
    code === APP_ACCESS_ERROR_CODE.EXPIRED;
}

function getAppAccessErrorMessage(errorOrCode) {
  const code = typeof errorOrCode === 'string'
    ? errorOrCode
    : getAppAccessErrorCode(errorOrCode);

  if (code === APP_ACCESS_ERROR_CODE.INVALID) {
    return '邀请码无效，请检查后重试';
  }
  if (code === APP_ACCESS_ERROR_CODE.EXPIRED) {
    return '邀请码已过期，请联系维护者重新获取';
  }
  if (code === APP_ACCESS_ERROR_CODE.REQUIRED) {
    return '当前为邀请制体验，请先输入邀请码';
  }
  return '网络异常，请稍后再试';
}

module.exports = {
  APP_ACCESS_ERROR_CODE,
  PENDING_APP_ACCESS_CODE_KEY,
  normalizeAppAccessCode,
  loadPendingAppAccessCode,
  savePendingAppAccessCode,
  clearPendingAppAccessCode,
  isAppAccessError,
  getAppAccessErrorCode,
  getAppAccessErrorMessage
};
