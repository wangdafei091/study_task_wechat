describe('utils/http-client', () => {
  let HttpClient;

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

    jest.isolateModules(() => {
      HttpClient = require('../../utils/http-client');
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
});
