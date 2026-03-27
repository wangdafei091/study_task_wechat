describe('utils/logger', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEnableTestLogs = process.env.ENABLE_TEST_LOGS;

  function loadLogger() {
    jest.resetModules();

    jest.doMock('../../utils/deviceInfo', () => ({
      isDevelopmentEnv: jest.fn(() => true),
      getSystemInfo: jest.fn(() => ({
        platform: 'devtools'
      }))
    }));

    return require('../../utils/logger');
  }

  beforeEach(() => {
    delete process.env.ENABLE_TEST_LOGS;
    process.env.NODE_ENV = 'test';
    jest.restoreAllMocks();
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalEnableTestLogs === undefined) {
      delete process.env.ENABLE_TEST_LOGS;
    } else {
      process.env.ENABLE_TEST_LOGS = originalEnableTestLogs;
    }

    jest.restoreAllMocks();
    jest.resetModules();
  });

  it('在测试环境下默认静默真实日志输出', () => {
    const logger = loadLogger();
    const infoSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

    logger.info('Test', 'info');
    logger.warn('Test', 'warn');
    logger.error('Test', 'error', new Error('boom'));
    logger.debug('Test', 'debug');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('显式开启 ENABLE_TEST_LOGS 后应恢复日志输出', () => {
    process.env.ENABLE_TEST_LOGS = 'true';
    const logger = loadLogger();
    const infoSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    logger.setLevel('debug');
    logger.info('Test', 'info');

    expect(infoSpy).toHaveBeenCalled();
  });
});
