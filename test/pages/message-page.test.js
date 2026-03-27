jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logEvent: jest.fn()
}));

jest.mock('../../services/service-manager.js', () => ({
  getMessageService: jest.fn()
}));

jest.mock('../../utils/view-scope', () => ({
  resolveMessageScopeOptions: jest.fn(() => ({ scope: 'user', userId: 'child-1' }))
}));

describe('packageMessage/pages/message/message', () => {
  let pageConfig;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageMessage/pages/message/message.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-24T06:49:04+08:00'));
    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
  });

  it('跨自然日但未满24小时的消息应显示为昨天', () => {
    const page = createPageInstance();

    expect(page.formatDate(new Date('2026-03-23T21:59:08+08:00').getTime())).toBe('昨天');
  });

  it('同一自然日内的消息应显示为今天', () => {
    const page = createPageInstance();

    expect(page.formatDate(new Date('2026-03-24T00:10:00+08:00').getTime())).toBe('今天');
  });
});
