const StorageAdapter = require('../../adapters/storage-adapter');
const serviceManager = require('../../services/service-manager.js');
const { UserService } = require('../../services/user-service.js');
const logger = require('../../utils/logger');
const API_CONFIG = require('../../utils/api-config');
const TokenManager = require('../../utils/token-manager');
const appAccessState = require('./app-access-state');

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
  serviceManager.setUserService(app.globalData.userService);
  return initialized;
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
        logger.info('App', '自动登录成功，初始化UserService');
        await initializeAndBindUserService(app, true);
        logger.info('App', 'UserService自动初始化完成（云端模式）');
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

function buildLoginPayload(code) {
  const payload = { code };
  const accessCode = appAccessState.loadPendingAppAccessCode();
  if (accessCode) {
    payload.accessCode = accessCode;
  }
  return payload;
}

async function loginWithCode(code) {
  const HttpClient = require('../../utils/http-client');
  return HttpClient.post(API_CONFIG.ENDPOINTS.AUTH_LOGIN, buildLoginPayload(code));
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
  if (!appAccessState.isAppAccessError(error)) {
    return false;
  }

  if (options.throwOnAdmissionError === true) {
    throw error;
  }

  redirectToAccessGate(error);
  return true;
}

function persistLoginSession(loginResult) {
  if (!loginResult || !loginResult.token) {
    return false;
  }

  TokenManager.setToken(loginResult.token);

  if (loginResult.user) {
    wx.setStorageSync('lastUserInfo', loginResult.user);
  }

  appAccessState.clearPendingAppAccessCode();

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

            persistLoginSession(loginResult);
            const initialized = await initializeAndBindUserService(app, true);

            if (initialized) {
              logger.info('App', 'UserService初始化完成（云端模式）');
            } else {
              logger.warn('App', 'UserService初始化降级（云端模式），继续使用默认用户态');
            }

            await app.postLoginInitialization();
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
          if (!handleAppAccessFailure(error)) {
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

    const loginResult = await loginWithCode(code);
    if (!loginResult) {
      return false;
    }

    logger.info('App', '云端登录成功', {
      token: loginResult.token,
      user: loginResult.user
    });

    persistLoginSession(loginResult);
    const initialized = await initializeAndBindUserService(app, true);
    if (!initialized) {
      logger.warn('App', '云端登录后UserService初始化降级，继续使用默认用户态');
    }

    return true;
  } catch (error) {
    logger.error('App', '云端登录失败:', error);
    if (handleAppAccessFailure(error, options)) {
      return false;
    }
    wx.showModal({
      title: '登录失败',
      content: error.message || '网络错误，请稍后重试',
      showCancel: false
    });
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

    if (persistLoginSession(loginResult)) {
      logger.info('App', 'Token已保存');
      logger.info('App', '用户信息已保存');
      logger.info('App', '自动登录成功');
      return true;
    }

    logger.error('App', '自动登录失败:', loginResult);
    return false;
  } catch (error) {
    logger.error('App', '自动登录异常:', error);
    handleAppAccessFailure(error);
    return false;
  }
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
  getWxLoginCode
};
