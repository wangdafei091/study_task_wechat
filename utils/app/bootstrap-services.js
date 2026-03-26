const serviceManager = require('../../services/service-manager.js');
const logger = require('../../utils/logger');

async function initialize(app, options = {}) {
  logger.info('App', '初始化服务管理器');

  if (app.globalData.userService) {
    serviceManager.setUserService(app.globalData.userService);
  } else {
    logger.info('App', 'UserService未初始化，延迟到登录后注入');
  }

  try {
    const serviceOptions = {
      enableEventOptimization: true,
      enableEventDebug: !!options.isDevEnv
    };

    logger.info('App', '初始化服务管理器，配置选项:', serviceOptions);
    const initialized = await serviceManager.initialize(serviceOptions);

    if (initialized) {
      logger.info('App', '服务管理器初始化成功（基础服务）');
      app.globalData.servicesInitialized = true;
    } else {
      logger.error('App', '服务管理器初始化失败');
    }

    return initialized;
  } catch (error) {
    logger.error('App', '服务管理器初始化失败:', error);
    return false;
  }
}

module.exports = {
  initialize
};
