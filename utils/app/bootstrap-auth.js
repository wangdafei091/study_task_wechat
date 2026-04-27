const StorageAdapter = require('../../adapters/storage-adapter');
const serviceManager = require('../../services/service-manager.js');
const { UserService } = require('../../services/user-service.js');
const logger = require('../../utils/logger');
const API_CONFIG = require('../../utils/api-config');
const TokenManager = require('../../utils/token-manager');
const appAccessState = require('./app-access-state');
const systemUserAccessState = require('./system-user-access-state');

function createUserService(useCloudStorage) {
  const userStorageAdapter = new StorageAdapter({ namespace: 'user_' });
  return new UserService({
    storageAdapter: userStorageAdapter,
    useCloudStorage
  });
}

async function initializeAndBindUserService(app, useCloudStorage) {
  app.globalData.userService = createUserService(useCloudStorage);
  const initialized = await app.globalData.userService.initialize();

  if (initialized !== true && app.globalData.userService?.initializationBlocked === true) {
    app.globalData.userService = null;
    serviceManager.setUserService(null);
    return false;
  }

  serviceManager.setUserService(app.globalData.userService);
  return initialized;
}

function hasUsableUserService(app) {
  return Boolean(app?.globalData?.userService);
}

async function recoverUserServiceFromToken(app, options = {}) {
  if (!API_CONFIG.ENABLE_API) {
    return false;
  }

  const token = TokenManager.getToken();
  if (!token || !TokenManager.isAuthenticated()) {
    return false;
  }

  const initialized = await initializeAndBindUserService(app, true);
  if (!initialized && !hasUsableUserService(app)) {
    logger.warn('App', '检测到 token 存在，但用户服务恢复失败');
    return false;
  }

  if (options.runPostLoginInitialization !== false && typeof app.postLoginInitialization === 'function') {
    await app.postLoginInitialization();
  }

  return true;
}

async function prepareUserService(app) {
  logger.info('App', 'API配置', {
    ENABLE_API: API_CONFIG.ENABLE_API,
    BASE_URL: API_CONFIG.BASE_URL
  });

  if (API_CONFIG.ENABLE_API) {
    logger.info('App', 'API已启用，使用云端登录模式');

    const token = TokenManager.getToken();
    if (token && TokenManager.isAuthenticated()) {
      logger.info('App', '发现已有token，初始化UserService');
      const initialized = await initializeAndBindUserService(app, true);
      if (initialized) {
        logger.info('App', 'UserService初始化完成（云端模式）');
      } else {
        logger.warn('App', 'UserService初始化降级（云端模式），继续使用默认用户态');
      }
      return;
    }

    logger.info('App', '没有token，尝试自动重新登录');
    const cachedUserInfo = wx.getStorageSync('lastUserInfo');
    if (!cachedUserInfo) {
      logger.info('App', '没有缓存用户信息，等待用户登录');
      app.globalData.userService = null;
      return;
    }

    logger.info('App', '发现缓存用户信息，尝试自动登录');
    try {
      const loginSuccess = await autoLogin(app);
      if (loginSuccess) {
        logger.info('App', '自动登录成功，用户服务已自动恢复（云端模式）');
      } else {
        logger.warn('App', '自动登录失败，等待用户手动登录');
        app.globalData.userService = null;
      }
    } catch (error) {
      logger.error('App', '自动登录异常', error);
      app.globalData.userService = null;
    }
    return;
  }

  logger.info('App', 'API已禁用，使用本地存储模式');
  logger.info('App', '初始化用户服务');
  const initialized = await initializeAndBindUserService(app, false);
  if (!initialized) {
    logger.warn('App', 'UserService初始化降级（本地模式），继续使用默认用户态');
  }
}

function buildLoginPayload(code, options = {}) {
  const payload = { code };
  const inviteCode = appAccessState.normalizeInviteCode(
    options.inviteCode || appAccessState.loadPendingInviteCode()
  );
  if (inviteCode) {
    payload.inviteCode = inviteCode;
  }

  if (options.profile && typeof options.profile === 'object') {
    payload.profile = options.profile;
  }
  return payload;
}

async function loginWithCode(code, options = {}) {
  const HttpClient = require('../../utils/http-client');
  return HttpClient.post(API_CONFIG.ENDPOINTS.AUTH_LOGIN, buildLoginPayload(code, options));
}

function isAlreadyOnAccessGate() {
  if (typeof getCurrentPages !== 'function') {
    return false;
  }

  const pages = getCurrentPages();
  if (!Array.isArray(pages) || pages.length === 0) {
    return false;
  }

  const currentPage = pages[pages.length - 1];
  return currentPage && currentPage.route === 'pages/access-gate/access-gate';
}

function isOnBlockedPage() {
  if (typeof getCurrentPages !== 'function') {
    return false;
  }

  const pages = getCurrentPages();
  if (!Array.isArray(pages) || pages.length === 0) {
    return false;
  }

  const currentPage = pages[pages.length - 1];
  return currentPage?.route === 'pages/system-blocked/system-blocked';
}

function redirectToAccessGate(error) {
  if (isAlreadyOnAccessGate() || typeof wx === 'undefined' || typeof wx.reLaunch !== 'function') {
    return;
  }

  const code = appAccessState.getAppAccessErrorCode(error);
  const url = code
    ? `/pages/access-gate/access-gate?reason=${encodeURIComponent(code)}`
    : '/pages/access-gate/access-gate';

  wx.reLaunch({ url });
}

function handleAppAccessFailure(error, options = {}) {
  if (!appAccessState.isInviteError(error)) {
    return false;
  }

  if (options.throwOnAdmissionError === true) {
    throw error;
  }

  redirectToAccessGate(error);
  return true;
}

function handleSystemUserBlockedFailure(error) {
  return systemUserAccessState.handleBlockedError(error);
}

function persistLoginSession(loginResult) {
  if (!loginResult || !loginResult.token) {
    return false;
  }

  TokenManager.setToken(loginResult.token);

  if (loginResult.user) {
    wx.setStorageSync('lastUserInfo', loginResult.user);
  }

  appAccessState.clearPendingInviteCode();
  systemUserAccessState.clearBlockedSessionFlag();

  return true;
}

async function completeAuthenticatedSession(app, loginResult, options = {}) {
  if (!persistLoginSession(loginResult)) {
    return false;
  }

  const initialized = await initializeAndBindUserService(app, true);
  if (!initialized && !hasUsableUserService(app)) {
    logger.warn('App', '认证成功，但用户服务未就绪');
    return false;
  }

  if (options.runPostLoginInitialization !== false && typeof app.postLoginInitialization === 'function') {
    await app.postLoginInitialization();
  }

  return true;
}

async function runWxLogin(app) {
  wx.login({
    success: async (res) => {
      logger.info('App', 'wx.login成功', { code: res.code });

      try {
        if (API_CONFIG.ENABLE_API) {
          logger.info('App', '使用云端登录模式');
          const loginResult = await loginWithCode(res.code);

          if (loginResult) {
            logger.info('App', '云端登录成功', {
              token: loginResult.token,
              user: loginResult.user
            });

            const completed = await completeAuthenticatedSession(app, loginResult);
            if (completed) {
              logger.info('App', 'UserService初始化完成（云端模式）');
            } else {
              logger.warn('App', 'UserService初始化降级（云端模式），继续使用默认用户态');
            }
          }
          return;
        }

        logger.info('App', '使用本地存储模式');
        app.globalData.canIUseGetUserProfile = false;
        app.globalData.canIUseOpenData = wx.canIUse('open-data.type.userAvatarUrl') &&
          wx.canIUse('open-data.type.userNickName');

        logger.info('App', '用户登录处理完成，已添加防御性检查');
        await app.postLoginInitialization();
      } catch (error) {
        logger.error('App', '登录处理失败:', error);

        if (API_CONFIG.ENABLE_API) {
          if (!handleSystemUserBlockedFailure(error) && !handleAppAccessFailure(error)) {
            wx.showModal({
              title: '登录失败',
              content: '网络错误，请检查连接',
              showCancel: false
            });
          }
        }
      }
    },
    fail: (error) => {
      logger.error('App', 'wx.login失败:', error);
    }
  });
}

async function doCloudLogin(app, options = {}) {
  if (!API_CONFIG.ENABLE_API) {
    logger.warn('App', 'API未启用，无法进行云端登录');
    return false;
  }

  try {
    logger.info('App', '开始云端登录');
    const code = await getWxLoginCode();
    if (!code) {
      throw new Error('获取微信登录code失败');
    }

    const loginResult = await loginWithCode(code, options);
    if (!loginResult) {
      return false;
    }

    logger.info('App', '云端登录成功', {
      token: loginResult.token,
      user: loginResult.user
    });

    const completed = await completeAuthenticatedSession(app, loginResult, {
      runPostLoginInitialization: options.runPostLoginInitialization !== false
    });
    if (!completed) {
      logger.warn('App', '云端登录后UserService初始化降级，继续使用默认用户态');
    }

    return completed;
  } catch (error) {
    logger.error('App', '云端登录失败:', error);
    if (handleSystemUserBlockedFailure(error) || handleAppAccessFailure(error, options)) {
      return false;
    }
    if (options.suppressFailureModal !== true) {
      wx.showModal({
        title: '登录失败',
        content: error.message || '网络错误，请稍后重试',
        showCancel: false
      });
    }
    return false;
  }
}

function doCloudLogout(app) {
  if (!API_CONFIG.ENABLE_API) {
    logger.warn('App', 'API未启用，无法进行云端登出');
    return;
  }

  logger.info('App', '开始云端登出');
  try {
    TokenManager.clearToken();
    if (typeof wx !== 'undefined' && wx && typeof wx.removeStorageSync === 'function') {
      wx.removeStorageSync('lastUserInfo');
    }
    app.globalData.userService = null;
    serviceManager.setUserService(null);

    logger.info('App', '云端登出成功');
    wx.reLaunch({
      url: '/pages/index/index'
    });
  } catch (error) {
    logger.error('App', '云端登出失败:', error);
  }
}

async function autoLogin(app) {
  try {
    logger.info('App', '开始自动登录流程');
    const loginCode = await getWxLoginCode();
    if (!loginCode) {
      logger.error('App', '获取微信登录code失败');
      return false;
    }

    logger.info('App', '获取到微信登录code:', loginCode);
    const loginResult = await loginWithCode(loginCode);
    logger.info('App', '后端登录响应:', loginResult);

    if (await completeAuthenticatedSession(app, loginResult, {
      runPostLoginInitialization: true
    })) {
      logger.info('App', '自动登录成功');
      return true;
    }

    logger.error('App', '自动登录失败:', loginResult);
    return false;
  } catch (error) {
    logger.error('App', '自动登录异常:', error);
    handleSystemUserBlockedFailure(error);
    handleAppAccessFailure(error);
    return false;
  }
}

async function refreshForegroundSystemAccess(app, activeUserService) {
  if (!activeUserService || typeof activeUserService.getLoginUserId !== 'function') {
    return false;
  }

  const loginUserId = activeUserService.getLoginUserId();
  if (!loginUserId) {
    return false;
  }

  try {
    const HttpClient = require('../../utils/http-client');
    const latestUser = await HttpClient.get(API_CONFIG.ENDPOINTS.AUTH_CURRENT);

    if (!latestUser || !latestUser.userId) {
      return false;
    }

    if (typeof activeUserService.applySystemAccessLevelSnapshot === 'function') {
      activeUserService.applySystemAccessLevelSnapshot(latestUser.userId, {
        systemAccessLevel: latestUser.systemAccessLevel,
        systemAccessUpdatedAt: latestUser.systemAccessUpdatedAt,
        systemAccessUpdatedByUserId: latestUser.systemAccessUpdatedByUserId
      });
    }

    return true;
  } catch (error) {
    if (handleSystemUserBlockedFailure(error)) {
      return false;
    }

    logger.warn('App', '前台系统访问态刷新失败，继续沿用本地快照', error);
    return false;
  }
}

async function handleAppShow(app) {
  if (!API_CONFIG.ENABLE_API) {
    return false;
  }

  const blockedSession = systemUserAccessState.hasBlockedSessionFlag();
  const token = TokenManager.getToken();
  const hasAuthenticatedToken = Boolean(token && TokenManager.isAuthenticated());
  const serviceFromManager = typeof serviceManager.getUserService === 'function'
    ? serviceManager.getUserService()
    : null;
  const activeUserService = app?.globalData?.userService || serviceFromManager || null;
  const hasReadyUserService = Boolean(activeUserService && activeUserService.initialized);

  if (blockedSession) {
    logger.info('App', '检测到禁入恢复态，开始校正前台页面');

    if (!isOnBlockedPage()) {
      systemUserAccessState.resetBlockedRedirectState();
    }

    if (hasAuthenticatedToken && hasReadyUserService) {
      systemUserAccessState.clearBlockedSessionFlag();
      if (isOnBlockedPage()) {
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
      return true;
    }

    const loginSuccess = await doCloudLogin(app, {
      suppressFailureModal: true
    });
    if (loginSuccess) {
      if (isOnBlockedPage()) {
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
      return true;
    }

    if (systemUserAccessState.hasBlockedSessionFlag()) {
      systemUserAccessState.resetBlockedRedirectState();
      systemUserAccessState.redirectToBlockedPage();
    }
    return false;
  }

  if (hasAuthenticatedToken && hasReadyUserService) {
    await refreshForegroundSystemAccess(app, activeUserService);
    return true;
  }

  if (hasAuthenticatedToken && !hasReadyUserService) {
    logger.info('App', '检测到 token 存在但用户服务缺失，尝试恢复会话');
    return recoverUserServiceFromToken(app, {
      runPostLoginInitialization: true
    });
  }

  return false;
}

function getWxLoginCode() {
  return new Promise((resolve) => {
    wx.login({
      success: (res) => {
        logger.info('App', 'wx.login成功，code:', res.code);
        resolve(res.code);
      },
      fail: (error) => {
        logger.error('App', 'wx.login失败:', error);
        resolve(null);
      }
    });
  });
}

module.exports = {
  prepareUserService,
  runWxLogin,
  doCloudLogin,
  doCloudLogout,
  autoLogin,
  getWxLoginCode,
  handleAppShow
};
