describe('utils/http-client', () => {
  let HttpClient;
  let systemUserAccessState;
  let logger;

  beforeEach(() => {
    jest.resetModules();

    global.wx = {
      request: jest.fn(({ success }) => {
        success({
          statusCode: 200,
          data: {
            success: true,
            data: { ok: true }
          }
        });
      })
    };

    jest.doMock('../../utils/api-config', () => ({
      ENABLE_API: true,
      BASE_URL: 'https://api.todoceo.xyz/test/',
      TIMEOUT: 10000,
      HEADERS: {
        'Content-Type': 'application/json'
      },
      ENDPOINTS: {
        HEALTH: '/health'
      }
    }));
    jest.doMock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }));
    jest.doMock('../../utils/token-manager', () => ({
      getToken: jest.fn(() => null)
    }));
    jest.doMock('../../utils/app/system-user-access-state', () => ({
      handleBlockedError: jest.fn()
    }));

    jest.isolateModules(() => {
      HttpClient = require('../../utils/http-client');
      systemUserAccessState = require('../../utils/app/system-user-access-state');
      logger = require('../../utils/logger');
    });
  });

  afterEach(() => {
    delete global.wx;
  });

  it('应规范化 BASE_URL 与 path 拼接，避免双斜杠', async () => {
    await HttpClient.get('/api/messages', { scope: 'family' });

    expect(global.wx.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.todoceo.xyz/test/api/messages?scope=family'
    }));
  });

  it('healthCheck 应兼容未包装的健康检查响应', async () => {
    global.wx.request.mockImplementationOnce(({ success }) => {
      success({
        statusCode: 200,
        data: {
          status: 'ok',
          taskOccurrenceEnabled: true
        }
      });
    });

    await expect(HttpClient.healthCheck()).resolves.toEqual({
      status: 'ok',
      taskOccurrenceEnabled: true
    });

    expect(global.wx.request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.todoceo.xyz/test/health'
    }));
  });

  it('命中 SYSTEM_USER_BLOCKED 时应交给统一禁入处理', async () => {
    global.wx.request.mockImplementationOnce(({ success }) => {
      success({
        statusCode: 403,
        data: {
          success: false,
          error_code: 'SYSTEM_USER_BLOCKED',
          message: '当前账号已被管理员暂停使用'
        }
      });
    });

    await expect(HttpClient.get('/api/tasks')).rejects.toMatchObject({
      code: 'SYSTEM_USER_BLOCKED'
    });

    expect(systemUserAccessState.handleBlockedError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SYSTEM_USER_BLOCKED'
    }));
  });

  it('邀请制准入 400 应记录 warn 而不是 error', async () => {
    global.wx.request.mockImplementationOnce(({ success }) => {
      success({
        statusCode: 400,
        data: {
          success: false,
          error_code: 'AUTH_APP_ACCESS_CODE_REQUIRED',
          message: '当前为邀请制体验，请先输入邀请码'
        }
      });
    });

    await expect(HttpClient.post('/api/auth/login', { code: 'wx-code' })).rejects.toMatchObject({
      code: 'AUTH_APP_ACCESS_CODE_REQUIRED'
    });

    expect(logger.warn).toHaveBeenCalledWith('HttpClient', '当前为邀请制体验，请先输入邀请码', {
      statusCode: 400,
      code: 'AUTH_APP_ACCESS_CODE_REQUIRED'
    });
    expect(logger.error).not.toHaveBeenCalledWith(
      'HttpClient',
      'HTTP错误: 400',
      expect.anything()
    );
  });
});
