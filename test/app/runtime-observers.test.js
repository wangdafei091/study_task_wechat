jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const logger = require('../../utils/logger');
const observers = require('../../utils/app/runtime-observers');

describe('utils/app/runtime-observers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.wx = {
      onDeviceOrientationChange: jest.fn(),
      onWindowResize: jest.fn()
    };
  });

  afterEach(() => {
    delete global.wx;
  });

  function createApp() {
    return {
      orientationChangeCallback: jest.fn(),
      globalData: {
        isLandscape: false,
        deviceInfo: {
          windowHeight: 667,
          windowWidth: 375,
          statusBarHeight: 20,
          screenHeight: 667,
          safeArea: {
            top: 20,
            bottom: 647,
            left: 0,
            right: 375
          }
        },
        eventCallbacks: {
          orientationChange: [jest.fn()],
          windowResize: [jest.fn()]
        }
      }
    };
  }

  it('方向监听应更新全局状态并触发回调', () => {
    const app = createApp();
    observers.setupOrientationListener(app);

    const callback = global.wx.onDeviceOrientationChange.mock.calls[0][0];
    callback({ value: 'landscape' });

    expect(app.globalData.isLandscape).toBe(true);
    expect(app.globalData.deviceInfo.isLandscape).toBe(true);
    expect(app.globalData.contentHeight).toBeCloseTo(600.3);
    expect(app.orientationChangeCallback).toHaveBeenCalledWith({ value: 'landscape' });
    expect(app.globalData.eventCallbacks.orientationChange[0]).toHaveBeenCalledWith({ value: 'landscape' });
  });

  it('窗口变化监听和主题设置应正常工作', () => {
    const app = createApp();

    observers.setupThemeChangeListener(app);
    observers.setupFontSizeChangeListener(app);
    observers.setTheme(app);

    const callback = global.wx.onWindowResize.mock.calls[0][0];
    callback({ size: 'changed' });

    expect(app.globalData.systemTheme).toBe('light');
    expect(app.globalData.theme).toBe('light');
    expect(app.globalData.themeColors.primary).toBe('#4285F4');
    expect(app.globalData.eventCallbacks.windowResize[0]).toHaveBeenCalledWith({ size: 'changed' });
  });

  it('globalEvent 和 updateHeightParams 应处理异常分支', () => {
    const app = createApp();
    app.globalData.eventCallbacks.broken = [
      () => {
        throw new Error('broken');
      }
    ];

    observers.globalEvent(app, 'broken', { a: 1 });
    expect(logger.error).toHaveBeenCalled();

    const badApp = {
      globalData: {
        deviceInfo: null
      }
    };
    observers.updateHeightParams(badApp, false);
    expect(logger.error).toHaveBeenCalled();
  });

  it('install、缺失监听器和无回调事件应安全处理', () => {
    const app = createApp();

    observers.install(app);
    expect(global.wx.onDeviceOrientationChange).toHaveBeenCalledTimes(1);
    expect(global.wx.onWindowResize).toHaveBeenCalledTimes(1);

    delete global.wx.onDeviceOrientationChange;
    delete global.wx.onWindowResize;
    expect(() => observers.setupOrientationListener(app)).not.toThrow();
    expect(() => observers.setupFontSizeChangeListener(app)).not.toThrow();

    observers.globalEvent(app, 'missing', { ok: true });
    observers.updateHeightParams({
      globalData: {
        deviceInfo: {
          windowHeight: 600,
          windowWidth: 300,
          statusBarHeight: 10,
          screenHeight: 600
        }
      }
    }, false);
  });
});
