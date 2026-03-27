const logger = require('../../utils/logger');

function install(app) {
  setupOrientationListener(app);
  setupThemeChangeListener(app);
  setupFontSizeChangeListener(app);
  setTheme(app);
}

function setupOrientationListener(app) {
  if (typeof wx.onDeviceOrientationChange !== 'function') {
    return;
  }

  wx.onDeviceOrientationChange((res) => {
    const isLandscape = res.value === 'landscape';
    app.globalData.isLandscape = isLandscape;
    app.globalData.deviceInfo.isLandscape = isLandscape;

    updateHeightParams(app, isLandscape);

    if (app.orientationChangeCallback) {
      app.orientationChangeCallback(res);
    }

    globalEvent(app, 'orientationChange', res);
  });
}

function setupThemeChangeListener(app) {
  logger.info('App', '使用统一亮色主题，不支持暗黑模式');
  app.globalData.systemTheme = 'light';
}

function setupFontSizeChangeListener(app) {
  if (typeof wx.onWindowResize !== 'function') {
    return;
  }

  wx.onWindowResize((res) => {
    updateHeightParams(app, app.globalData.isLandscape);
    globalEvent(app, 'windowResize', res);
  });
}

function globalEvent(app, eventName, eventData) {
  if (!app.globalData.eventCallbacks[eventName]) {
    return;
  }

  const callbacks = app.globalData.eventCallbacks[eventName];
  callbacks.forEach((callback) => {
    try {
      callback(eventData);
    } catch (error) {
      logger.error('App', `执行全局事件回调出错: ${eventName}`, error);
    }
  });
}

function updateHeightParams(app, isLandscape) {
  try {
    const {
      windowHeight,
      windowWidth,
      statusBarHeight,
      screenHeight,
      safeArea
    } = app.globalData.deviceInfo;

    if (safeArea) {
      const { top, bottom, left, right } = safeArea;
      app.globalData.safeArea = {
        top,
        bottom: screenHeight - bottom,
        left,
        right: windowWidth - right
      };
    }

    let contentHeight = windowHeight;
    if (isLandscape) {
      contentHeight = windowHeight * 0.9;
    } else {
      contentHeight -= 50;
    }

    app.globalData.contentHeight = contentHeight;
    app.globalData.statusBarHeight = statusBarHeight;

    logger.info('App', `更新高度参数: 内容区=${contentHeight}, 状态栏=${statusBarHeight}`);
  } catch (error) {
    logger.error('App', '更新高度参数失败', error);
  }
}

function setTheme(app) {
  app.globalData.theme = 'light';
  app.globalData.themeColors = {
    primary: '#4285F4',
    secondary: '#4CAF50',
    accent: '#FF9800',
    background: '#FFFFFF',
    surface: '#F5F5F5',
    text: '#333333',
    lightText: '#757575'
  };
}

module.exports = {
  install,
  setupOrientationListener,
  setupThemeChangeListener,
  setupFontSizeChangeListener,
  globalEvent,
  updateHeightParams,
  setTheme
};
