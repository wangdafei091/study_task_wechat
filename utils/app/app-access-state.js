const PENDING_INVITE_CODE_KEY = 'pending_invite_code';
const PENDING_APP_ACCESS_CODE_KEY = 'pending_app_access_code';

const APP_ACCESS_ERROR_CODE = {
  REQUIRED: 'AUTH_APP_ACCESS_CODE_REQUIRED',
  INVALID: 'AUTH_APP_ACCESS_CODE_INVALID',
  EXPIRED: 'AUTH_APP_ACCESS_CODE_EXPIRED'
};

const INVITE_ERROR_CODE = {
  REQUIRED: 'INVITE_CODE_REQUIRED',
  INVALID: 'INVITE_CODE_INVALID',
  EXPIRED: 'INVITE_CODE_EXPIRED',
  DISABLED: 'INVITE_CODE_DISABLED',
  QUOTA_EXCEEDED: 'INVITE_CODE_QUOTA_EXCEEDED',
  GLOBAL_QUOTA_EXCEEDED: 'INVITE_CODE_GLOBAL_QUOTA_EXCEEDED',
  ISSUER_FORBIDDEN: 'INVITE_CODE_ISSUER_FORBIDDEN',
  FAMILY_MANAGER_REQUIRED: 'INVITE_CODE_FAMILY_MANAGER_REQUIRED',
  PURPOSE_MISMATCH: 'INVITE_CODE_PURPOSE_MISMATCH',
  TARGET_ROLE_MISMATCH: 'INVITE_CODE_TARGET_ROLE_MISMATCH',
  ALREADY_IN_TARGET_FAMILY: 'INVITE_CODE_ALREADY_IN_TARGET_FAMILY',
  HAS_OTHER_FAMILY: 'INVITE_CODE_EXISTING_USER_HAS_FAMILY'
};

function normalizeInviteCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
}

function readStorage(key) {
  if (typeof wx === 'undefined' || typeof wx.getStorageSync !== 'function') {
    return '';
  }

  return wx.getStorageSync(key);
}

function writeStorage(key, value) {
  if (typeof wx === 'undefined' || typeof wx.setStorageSync !== 'function') {
    return '';
  }

  wx.setStorageSync(key, value);
  return value;
}

function removeStorage(key) {
  if (typeof wx === 'undefined') {
    return;
  }

  if (typeof wx.removeStorageSync === 'function') {
    wx.removeStorageSync(key);
    return;
  }

  if (typeof wx.setStorageSync === 'function') {
    wx.setStorageSync(key, '');
  }
}

function loadPendingInviteCode() {
  const primaryValue = normalizeInviteCode(readStorage(PENDING_INVITE_CODE_KEY));
  if (primaryValue) {
    return primaryValue;
  }

  return normalizeInviteCode(readStorage(PENDING_APP_ACCESS_CODE_KEY));
}

function savePendingInviteCode(value) {
  const normalizedCode = normalizeInviteCode(value);
  writeStorage(PENDING_INVITE_CODE_KEY, normalizedCode);

  if (normalizedCode) {
    removeStorage(PENDING_APP_ACCESS_CODE_KEY);
  }

  return normalizedCode;
}

function clearPendingInviteCode() {
  removeStorage(PENDING_INVITE_CODE_KEY);
  removeStorage(PENDING_APP_ACCESS_CODE_KEY);
}

function loadPendingAppAccessCode() {
  return loadPendingInviteCode();
}

function savePendingAppAccessCode(value) {
  return savePendingInviteCode(value);
}

function clearPendingAppAccessCode() {
  clearPendingInviteCode();
}

function getAppAccessErrorCode(error) {
  return error && error.code ? String(error.code) : '';
}

function isInviteError(error) {
  const code = getAppAccessErrorCode(error);
  return code === APP_ACCESS_ERROR_CODE.REQUIRED ||
    code === APP_ACCESS_ERROR_CODE.INVALID ||
    code === APP_ACCESS_ERROR_CODE.EXPIRED ||
    code === INVITE_ERROR_CODE.REQUIRED ||
    code === INVITE_ERROR_CODE.INVALID ||
    code === INVITE_ERROR_CODE.EXPIRED ||
    code === INVITE_ERROR_CODE.DISABLED ||
    code === INVITE_ERROR_CODE.QUOTA_EXCEEDED ||
    code === INVITE_ERROR_CODE.GLOBAL_QUOTA_EXCEEDED ||
    code === INVITE_ERROR_CODE.ISSUER_FORBIDDEN ||
    code === INVITE_ERROR_CODE.FAMILY_MANAGER_REQUIRED ||
    code === INVITE_ERROR_CODE.PURPOSE_MISMATCH ||
    code === INVITE_ERROR_CODE.TARGET_ROLE_MISMATCH ||
    code === INVITE_ERROR_CODE.ALREADY_IN_TARGET_FAMILY ||
    code === INVITE_ERROR_CODE.HAS_OTHER_FAMILY;
}

function isAppAccessError(error) {
  return isInviteError(error);
}

function getInviteErrorMessage(errorOrCode) {
  const code = typeof errorOrCode === 'string'
    ? errorOrCode
    : getAppAccessErrorCode(errorOrCode);

  if (code === APP_ACCESS_ERROR_CODE.INVALID) {
    return '邀请码无效，请检查后重试';
  }
  if (code === INVITE_ERROR_CODE.INVALID) {
    return '邀请码无效，请检查后重试';
  }
  if (code === APP_ACCESS_ERROR_CODE.EXPIRED) {
    return '邀请码已过期，请联系维护者重新获取';
  }
  if (code === INVITE_ERROR_CODE.EXPIRED) {
    return '邀请码已过期，请联系邀请人重新获取';
  }
  if (code === INVITE_ERROR_CODE.DISABLED) {
    return '邀请码已失效，请联系邀请人重新获取';
  }
  if (code === INVITE_ERROR_CODE.QUOTA_EXCEEDED) {
    return '当前账号的新用户邀请码额度已用尽';
  }
  if (code === INVITE_ERROR_CODE.GLOBAL_QUOTA_EXCEEDED) {
    return '新用户邀请码全局额度已用尽';
  }
  if (code === INVITE_ERROR_CODE.ISSUER_FORBIDDEN) {
    return '当前账号无权生成邀请码';
  }
  if (code === INVITE_ERROR_CODE.FAMILY_MANAGER_REQUIRED) {
    return '只有家庭管理员可以生成家庭邀请码';
  }
  if (code === APP_ACCESS_ERROR_CODE.REQUIRED) {
    return '当前为邀请制体验，请先输入邀请码';
  }
  if (code === INVITE_ERROR_CODE.REQUIRED) {
    return '请输入邀请码';
  }
  if (code === INVITE_ERROR_CODE.PURPOSE_MISMATCH) {
    return '当前邀请码不能用于这个操作';
  }
  if (code === INVITE_ERROR_CODE.TARGET_ROLE_MISMATCH) {
    return '当前账号身份与该邀请码不匹配';
  }
  if (code === INVITE_ERROR_CODE.ALREADY_IN_TARGET_FAMILY) {
    return '你已经在这个家庭里了，无需重复加入';
  }
  if (code === INVITE_ERROR_CODE.HAS_OTHER_FAMILY) {
    return '你已加入其他家庭，暂不支持直接切换';
  }
  return '网络异常，请稍后再试';
}

function getAppAccessErrorMessage(errorOrCode) {
  return getInviteErrorMessage(errorOrCode);
}

module.exports = {
  APP_ACCESS_ERROR_CODE,
  INVITE_ERROR_CODE,
  PENDING_INVITE_CODE_KEY,
  PENDING_APP_ACCESS_CODE_KEY,
  normalizeInviteCode,
  normalizeAppAccessCode: normalizeInviteCode,
  loadPendingInviteCode,
  loadPendingAppAccessCode,
  savePendingInviteCode,
  savePendingAppAccessCode,
  clearPendingInviteCode,
  clearPendingAppAccessCode,
  isInviteError,
  isAppAccessError,
  getAppAccessErrorCode,
  getInviteErrorMessage,
  getAppAccessErrorMessage
};
