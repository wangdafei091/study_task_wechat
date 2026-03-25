describe('API_CONFIG 环境切换', () => {
  const originalWx = global.wx;
  const originalEnv = process.env;

  const loadApiConfig = ({ enableApi, baseUrl }) => {
    jest.resetModules();
    process.env = {};
    global.wx = {
      getStorageSync: jest.fn((key) => {
        if (key === 'ENABLE_API') return enableApi;
        if (key === 'API_BASE_URL') return baseUrl;
        return undefined;
      })
    };
    return require('../../utils/api-config');
  };

  afterEach(() => {
    jest.resetModules();
    process.env = originalEnv;
    global.wx = originalWx;
  });

  it('未显式配置时应默认关闭 API 并保持空 BASE_URL', () => {
    const config = loadApiConfig({ enableApi: '', baseUrl: '' });

    expect(config.ENABLE_API).toBe(false);
    expect(config.useCloudStorage).toBe(false);
    expect(config.BASE_URL).toBe('');
  });

  it('显式配置测试环境时应启用 API 并保留测试地址', () => {
    const config = loadApiConfig({
      enableApi: 'true',
      baseUrl: 'https://api.todoceo.xyz/test/'
    });

    expect(config.ENABLE_API).toBe(true);
    expect(config.useCloudStorage).toBe(true);
    expect(config.BASE_URL).toBe('https://api.todoceo.xyz/test/');
  });

  it('显式配置正式环境时应启用 API 并保留正式地址', () => {
    const config = loadApiConfig({
      enableApi: 'true',
      baseUrl: 'https://api.study-task.com'
    });

    expect(config.ENABLE_API).toBe(true);
    expect(config.useCloudStorage).toBe(true);
    expect(config.BASE_URL).toBe('https://api.study-task.com');
  });

  it('仅开启 ENABLE_API 但未配置 BASE_URL 时应保持本地模式', () => {
    const config = loadApiConfig({ enableApi: 'true', baseUrl: '' });

    expect(config.ENABLE_API).toBe(false);
    expect(config.useCloudStorage).toBe(false);
    expect(config.BASE_URL).toBe('');
  });
});
