describe('runtime-config', () => {
  const originalWx = global.wx;
  const originalEnv = process.env;

  function loadModule({ enableApi, baseUrl, env = {} } = {}) {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      ...env
    };
    global.wx = {
      getStorageSync: jest.fn((key) => {
        if (key === 'ENABLE_API') return enableApi;
        if (key === 'API_BASE_URL') return baseUrl;
        return undefined;
      }),
      setStorageSync: jest.fn()
    };
    return require('../../utils/runtime-config');
  }

  afterEach(() => {
    jest.resetModules();
    process.env = originalEnv;
    global.wx = originalWx;
  });

  it('应按 env > wx storage > default_local 的顺序解析来源', () => {
    const runtimeConfig = loadModule({
      enableApi: 'false',
      baseUrl: 'https://wx.example.com',
      env: {
        ENABLE_API: 'true',
        API_BASE_URL: 'https://env.example.com'
      }
    });

    expect(runtimeConfig.readPersistedRuntimeApiConfig()).toEqual(expect.objectContaining({
      enableApiRaw: 'true',
      baseUrlRaw: 'https://env.example.com',
      source: 'env'
    }));
  });

  it('应在显式启用且 URL 合法时进入云端模式', () => {
    const runtimeConfig = loadModule({
      enableApi: 'true',
      baseUrl: 'https://api.study-task.com'
    });

    expect(runtimeConfig.resolveRuntimeApiConfig()).toEqual(expect.objectContaining({
      explicitlyEnabled: true,
      hasBaseUrl: true,
      enabled: true,
      baseUrl: 'https://api.study-task.com',
      source: 'wechat_storage'
    }));
  });

  it('URL 非法时应回退本地模式', () => {
    const runtimeConfig = loadModule({
      enableApi: 'true',
      baseUrl: 'ftp://invalid.example.com'
    });

    expect(runtimeConfig.resolveRuntimeApiConfig()).toEqual(expect.objectContaining({
      explicitlyEnabled: true,
      hasBaseUrl: true,
      enabled: false,
      baseUrl: ''
    }));
  });

  it('persistRuntimeApiConfig 应写入 wx storage 并返回 requiresRestart', () => {
    const runtimeConfig = loadModule();

    const result = runtimeConfig.persistRuntimeApiConfig({
      enableApi: true,
      baseUrl: ' https://api.todoceo.xyz/test/ '
    });

    expect(result).toEqual({
      success: true,
      requiresRestart: true
    });
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('ENABLE_API', 'true');
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('API_BASE_URL', 'https://api.todoceo.xyz/test/');
  });

  it('ensureDefaultRuntimeApiConfig 应在 storage 缺失时补齐默认值', () => {
    const runtimeConfig = loadModule();

    const result = runtimeConfig.ensureDefaultRuntimeApiConfig({
      enableApi: true,
      baseUrl: 'https://api.todoceo.xyz'
    });

    expect(result).toEqual({
      success: true,
      wroteEnableApi: true,
      wroteBaseUrl: true
    });
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('ENABLE_API', 'true');
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('API_BASE_URL', 'https://api.todoceo.xyz');
  });

  it('ensureDefaultRuntimeApiConfig 不应覆盖已有用户配置', () => {
    const runtimeConfig = loadModule({
      enableApi: 'false',
      baseUrl: 'https://custom.example.com'
    });

    const result = runtimeConfig.ensureDefaultRuntimeApiConfig({
      enableApi: true,
      baseUrl: 'https://api.todoceo.xyz'
    });

    expect(result).toEqual({
      success: false,
      wroteEnableApi: false,
      wroteBaseUrl: false
    });
    expect(global.wx.setStorageSync).not.toHaveBeenCalled();
  });
});
