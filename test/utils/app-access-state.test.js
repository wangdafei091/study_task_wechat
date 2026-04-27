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

    expect(appAccessState.normalizeInviteCode(' invite 88 ')).toBe('INVITE88');
    expect(appAccessState.loadPendingInviteCode()).toBe('');
    expect(appAccessState.savePendingInviteCode(' invite 88 ')).toBe('INVITE88');
    expect(() => appAccessState.clearPendingInviteCode()).not.toThrow();
  });

  it('应通过 wx storage 读写并优先使用 removeStorageSync 清理', () => {
    const pendingInviteKey = 'pending_invite_code';
    const getStorageSync = jest.fn((key) => {
      if (key === pendingInviteKey) {
        return ' invite 88 ';
      }
      return '';
    });
    const setStorageSync = jest.fn();
    const removeStorageSync = jest.fn();
    global.wx = {
      getStorageSync,
      setStorageSync,
      removeStorageSync
    };

    loadModule();

    expect(appAccessState.loadPendingInviteCode()).toBe('INVITE88');
    expect(getStorageSync).toHaveBeenCalledWith(appAccessState.PENDING_INVITE_CODE_KEY);

    expect(appAccessState.savePendingInviteCode(' invite 99 ')).toBe('INVITE99');
    expect(setStorageSync).toHaveBeenCalledWith(
      appAccessState.PENDING_INVITE_CODE_KEY,
      'INVITE99'
    );

    appAccessState.clearPendingInviteCode();
    expect(removeStorageSync).toHaveBeenCalledWith(appAccessState.PENDING_INVITE_CODE_KEY);
    expect(removeStorageSync).toHaveBeenCalledWith(appAccessState.PENDING_APP_ACCESS_CODE_KEY);
  });

  it('应兼容从旧 key 读取待消费邀请码', () => {
    const pendingInviteKey = 'pending_invite_code';
    const legacyInviteKey = 'pending_app_access_code';
    global.wx = {
      getStorageSync: jest.fn((key) => {
        if (key === pendingInviteKey) {
          return '';
        }
        if (key === legacyInviteKey) {
          return ' invite 66 ';
        }
        return '';
      }),
      setStorageSync: jest.fn()
    };

    loadModule();

    expect(appAccessState.loadPendingInviteCode()).toBe('INVITE66');
  });

  it('clearPendingInviteCode 在缺少 removeStorageSync 时应回退到 setStorageSync', () => {
    const setStorageSync = jest.fn();
    global.wx = {
      setStorageSync
    };

    loadModule();
    appAccessState.clearPendingInviteCode();

    expect(setStorageSync).toHaveBeenCalledWith(
      appAccessState.PENDING_INVITE_CODE_KEY,
      ''
    );
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

    expect(appAccessState.isInviteError({
      code: appAccessState.APP_ACCESS_ERROR_CODE.REQUIRED
    })).toBe(true);
    expect(appAccessState.isInviteError({
      code: appAccessState.APP_ACCESS_ERROR_CODE.INVALID
    })).toBe(true);
    expect(appAccessState.isInviteError({
      code: appAccessState.APP_ACCESS_ERROR_CODE.EXPIRED
    })).toBe(true);
    expect(appAccessState.isInviteError({
      code: appAccessState.INVITE_ERROR_CODE.TARGET_ROLE_MISMATCH
    })).toBe(true);
    expect(appAccessState.isInviteError({
      code: appAccessState.INVITE_ERROR_CODE.QUOTA_EXCEEDED
    })).toBe(true);
    expect(appAccessState.isInviteError({
      code: appAccessState.INVITE_ERROR_CODE.GLOBAL_QUOTA_EXCEEDED
    })).toBe(true);
    expect(appAccessState.isInviteError({
      code: appAccessState.INVITE_ERROR_CODE.ISSUER_FORBIDDEN
    })).toBe(true);
    expect(appAccessState.isInviteError({
      code: appAccessState.INVITE_ERROR_CODE.FAMILY_MANAGER_REQUIRED
    })).toBe(true);
    expect(appAccessState.isInviteError({
      code: 'OTHER_ERROR'
    })).toBe(false);

    expect(appAccessState.getInviteErrorMessage(appAccessState.APP_ACCESS_ERROR_CODE.INVALID))
      .toBe('邀请码无效，请检查后重试');
    expect(appAccessState.getInviteErrorMessage({
      code: appAccessState.APP_ACCESS_ERROR_CODE.EXPIRED
    })).toBe('邀请码已过期，请联系维护者重新获取');
    expect(appAccessState.getInviteErrorMessage({
      code: appAccessState.APP_ACCESS_ERROR_CODE.REQUIRED
    })).toBe('当前为邀请制体验，请先输入邀请码');
    expect(appAccessState.getInviteErrorMessage({
      code: appAccessState.INVITE_ERROR_CODE.TARGET_ROLE_MISMATCH
    })).toBe('当前账号身份与该邀请码不匹配');
    expect(appAccessState.getInviteErrorMessage({
      code: appAccessState.INVITE_ERROR_CODE.QUOTA_EXCEEDED
    })).toBe('当前账号的新用户邀请码额度已用尽');
    expect(appAccessState.getInviteErrorMessage({
      code: appAccessState.INVITE_ERROR_CODE.GLOBAL_QUOTA_EXCEEDED
    })).toBe('新用户邀请码全局额度已用尽');
    expect(appAccessState.getInviteErrorMessage({
      code: appAccessState.INVITE_ERROR_CODE.ISSUER_FORBIDDEN
    })).toBe('当前账号无权生成邀请码');
    expect(appAccessState.getInviteErrorMessage({
      code: appAccessState.INVITE_ERROR_CODE.FAMILY_MANAGER_REQUIRED
    })).toBe('只有家庭管理员可以生成家庭邀请码');
    expect(appAccessState.getInviteErrorMessage({
      code: 'OTHER_ERROR'
    })).toBe('网络异常，请稍后再试');
  });
});
