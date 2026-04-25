jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../services/system-service', () => ({
  getBootstrap: jest.fn()
}));

describe('packageManage/pages/about/about', () => {
  let pageConfig;
  let systemService;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageManage/pages/about/about.js');
    });
  }

  function createPage() {
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

    systemService = require('../../services/system-service');
    global.wx = {
      getAccountInfoSync: jest.fn(() => ({
        miniProgram: {
          version: '1.2.3'
        }
      })),
      getAppBaseInfo: jest.fn(() => ({
        envVersion: 'release'
      })),
      navigateTo: jest.fn(),
      previewImage: jest.fn(),
      showToast: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.wx;
  });

  it('正式环境应显示二维码', () => {
    const page = createPage();

    page.onLoad.call(page);

    expect(page.data.showQrCode).toBe(true);
    expect(page.data.version).toBe('1.2.3');
  });

  it('非正式环境应隐藏二维码实图', () => {
    global.wx.getAppBaseInfo.mockReturnValue({
      envVersion: 'develop'
    });
    const page = createPage();

    page.onLoad.call(page);

    expect(page.data.showQrCode).toBe(false);
    expect(page.data.qrCodeHint).toBe('二维码仅在正式环境提供');
  });

  it('二维码点击应触发预览', () => {
    const page = createPage();
    page.onLoad.call(page);

    page.onQrcodeTap.call(page);

    expect(global.wx.previewImage).toHaveBeenCalledWith({
      current: '/packageManage/assets/about/mini-program-qrcode.png',
      urls: ['/packageManage/assets/about/mini-program-qrcode.png']
    });
  });

  it('连续点击版本达到阈值且有权限时应进入系统页', async () => {
    const page = createPage();
    systemService.getBootstrap.mockResolvedValue({
      canEnterSystemAdmin: true
    });

    for (let index = 0; index < 7; index += 1) {
      page.onVersionTap.call(page);
    }
    await Promise.resolve();

    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/packageManage/pages/system-admin/system-admin'
    });
  });
});
