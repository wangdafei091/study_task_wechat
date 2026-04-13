function getNodeEnv(name) {
  if (typeof process === 'undefined' || !process || !process.env) {
    return undefined;
  }
  return process.env[name];
}

function getWechatStorage(key) {
  if (typeof wx === 'undefined' || !wx || typeof wx.getStorageSync !== 'function') {
    return undefined;
  }
  try {
    return wx.getStorageSync(key);
  } catch (error) {
    return undefined;
  }
}

function setWechatStorage(key, value) {
  if (typeof wx === 'undefined' || !wx || typeof wx.setStorageSync !== 'function') {
    return false;
  }
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function normalizeString(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function hasPersistedValue(value) {
  return normalizeString(value) !== '';
}

function resolveConfigSource(enableApiFromEnv, baseUrlFromEnv, enableApiFromStorage, baseUrlFromStorage) {
  if (
    enableApiFromEnv !== undefined ||
    baseUrlFromEnv !== undefined
  ) {
    return 'env';
  }

  if (
    enableApiFromStorage !== undefined ||
    baseUrlFromStorage !== undefined
  ) {
    return 'wechat_storage';
  }

  return 'default_local';
}

function readPersistedRuntimeApiConfig() {
  const enableApiFromEnv = getNodeEnv('ENABLE_API');
  const baseUrlFromEnv = getNodeEnv('API_BASE_URL');
  const enableApiFromStorage = getWechatStorage('ENABLE_API');
  const baseUrlFromStorage = getWechatStorage('API_BASE_URL');

  const enableApiRaw = enableApiFromEnv !== undefined
    ? enableApiFromEnv
    : enableApiFromStorage;
  const baseUrlRaw = baseUrlFromEnv !== undefined
    ? baseUrlFromEnv
    : baseUrlFromStorage;

  return {
    enableApiRaw,
    baseUrlRaw,
    source: resolveConfigSource(
      enableApiFromEnv,
      baseUrlFromEnv,
      enableApiFromStorage,
      baseUrlFromStorage
    )
  };
}

function isValidHttpUrl(value) {
  const normalized = normalizeString(value);
  return /^https?:\/\//.test(normalized);
}

function resolveRuntimeApiConfig() {
  const persisted = readPersistedRuntimeApiConfig();
  const enableApiRaw = persisted.enableApiRaw;
  const baseUrlRaw = persisted.baseUrlRaw;
  const normalizedBaseUrl = normalizeString(baseUrlRaw);
  const explicitlyEnabled = enableApiRaw === true || enableApiRaw === 'true';
  const hasBaseUrl = normalizedBaseUrl !== '';
  const validBaseUrl = hasBaseUrl && isValidHttpUrl(normalizedBaseUrl)
    ? normalizedBaseUrl
    : '';
  const enabled = explicitlyEnabled && validBaseUrl !== '';

  return {
    enableApiRaw: enableApiRaw === undefined ? null : enableApiRaw,
    baseUrlRaw: hasBaseUrl ? normalizedBaseUrl : '',
    explicitlyEnabled,
    hasBaseUrl,
    enabled,
    baseUrl: validBaseUrl,
    source: persisted.source
  };
}

function persistRuntimeApiConfig({ enableApi, baseUrl } = {}) {
  const normalizedEnableApi = enableApi === true || enableApi === 'true'
    ? 'true'
    : 'false';
  const normalizedBaseUrl = normalizeString(baseUrl);
  const enableSuccess = setWechatStorage('ENABLE_API', normalizedEnableApi);
  const baseUrlSuccess = setWechatStorage('API_BASE_URL', normalizedBaseUrl);

  return {
    success: enableSuccess && baseUrlSuccess,
    requiresRestart: true
  };
}

function ensureDefaultRuntimeApiConfig({ enableApi, baseUrl } = {}) {
  const persisted = readPersistedRuntimeApiConfig();
  const normalizedEnableApi = enableApi === true || enableApi === 'true'
    ? 'true'
    : 'false';
  const normalizedBaseUrl = normalizeString(baseUrl);
  let wrote = false;

  if (!hasPersistedValue(persisted.enableApiRaw)) {
    wrote = setWechatStorage('ENABLE_API', normalizedEnableApi) || wrote;
  }

  if (!hasPersistedValue(persisted.baseUrlRaw) && normalizedBaseUrl !== '') {
    wrote = setWechatStorage('API_BASE_URL', normalizedBaseUrl) || wrote;
  }

  return {
    success: wrote,
    wroteEnableApi: !hasPersistedValue(persisted.enableApiRaw),
    wroteBaseUrl: !hasPersistedValue(persisted.baseUrlRaw) && normalizedBaseUrl !== ''
  };
}

module.exports = {
  readPersistedRuntimeApiConfig,
  resolveRuntimeApiConfig,
  persistRuntimeApiConfig,
  ensureDefaultRuntimeApiConfig,
  isValidHttpUrl
};
