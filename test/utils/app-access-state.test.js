describe('utils/app/app-access-state', () => {
  let appAccessState;

  function loadModule() {
    jest.resetModules();
    appAccessState = require('../../utils/app/app-access-state');
  }

  afterEach(() => {
    delete global.wx;
  });

  it('应规范化邀请码，并兼容无 wx 环境的读写清理', () => {
    delete global.wx;
    loadModule();

    expect(appAccessState.normalizeAppAccessCode(' invite 88 ')).toBe('INVITE88');
    expect(appAccessState.loadPendingAppAccessCode()).toBe('');
    expect(appAccessState.savePendingAppAccessCode(' invite 88 ')).toBe('');
    expect(() => appAccessState.clearPendingAppAccessCode()).not.toThrow();
  });

  it('应通过 wx storage 读写并优先使用 removeStorageSync 清理', () => {
    const getStorageSync = jest.fn(() => ' invite 88 ');
    const setStorageSync = jest.fn();
    const removeStorageSync = jest.fn();
    global.wx = {
      getStorageSync,
      setStorageSync,
      removeStorageSync
    };

    loadModule();

    expect(appAccessState.loadPendingAppAccessCode()).toBe('INVITE88');
    expect(getStorageSync).toHaveBeenCalledWith(appAccessState.PENDING_APP_ACCESS_CODE_KEY);

    expect(appAccessState.savePendingAppAccessCode(' invite 99 ')).toBe('INVITE99');
    expect(setStorageSync).toHaveBeenCalledWith(
      appAccessState.PENDING_APP_ACCESS_CODE_KEY,
      'INVITE99'
    );

    appAccessState.clearPendingAppAccessCode();
    expect(removeStorageSync).toHaveBeenCalledWith(appAccessState.PENDING_APP_ACCESS_CODE_KEY);
  });

  it('clearPendingAppAccessCode 在缺少 removeStorageSync 时应回退到 setStorageSync', () => {
    const setStorageSync = jest.fn();
    global.wx = {
      setStorageSync
    };

    loadModule();
    appAccessState.clearPendingAppAccessCode();

    expect(setStorageSync).toHaveBeenCalledWith(
      appAccessState.PENDING_APP_ACCESS_CODE_KEY,
      ''
    );
  });

  it('应识别邀请码错误码并返回对应文案', () => {
    loadModule();

    expect(appAccessState.getAppAccessErrorCode({
      code: appAccessState.APP_ACCESS_ERROR_CODE.INVALID
    })).toBe(appAccessState.APP_ACCESS_ERROR_CODE.INVALID);
    expect(appAccessState.getAppAccessErrorCode(null)).toBe('');

    expect(appAccessState.isAppAccessError({
      code: appAccessState.APP_ACCESS_ERROR_CODE.REQUIRED
    })).toBe(true);
    expect(appAccessState.isAppAccessError({
      code: appAccessState.APP_ACCESS_ERROR_CODE.INVALID
    })).toBe(true);
    expect(appAccessState.isAppAccessError({
      code: appAccessState.APP_ACCESS_ERROR_CODE.EXPIRED
    })).toBe(true);
    expect(appAccessState.isAppAccessError({
      code: 'OTHER_ERROR'
    })).toBe(false);

    expect(appAccessState.getAppAccessErrorMessage(appAccessState.APP_ACCESS_ERROR_CODE.INVALID))
      .toBe('邀请码无效，请检查后重试');
    expect(appAccessState.getAppAccessErrorMessage({
      code: appAccessState.APP_ACCESS_ERROR_CODE.EXPIRED
    })).toBe('邀请码已过期，请联系维护者重新获取');
    expect(appAccessState.getAppAccessErrorMessage({
      code: appAccessState.APP_ACCESS_ERROR_CODE.REQUIRED
    })).toBe('当前为邀请制体验，请先输入邀请码');
    expect(appAccessState.getAppAccessErrorMessage({
      code: 'OTHER_ERROR'
    })).toBe('网络异常，请稍后再试');
  });
});
