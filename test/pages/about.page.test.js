jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../services/system-service', () => ({
  getBootstrap: jest.fn()
}));

jest.mock('../../services/service-manager', () => ({
  getService: jest.fn(),
  getUserService: jest.fn()
}));

describe('packageManage/pages/about/about', () => {
  let pageConfig;
  let systemService;
  let serviceManager;
  let supportContact;

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
    jest.unmock('../../utils/support-contact');

    systemService = require('../../services/system-service');
    serviceManager = require('../../services/service-manager');
    supportContact = require('../../utils/support-contact');
    serviceManager.getService.mockReturnValue(null);
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent', familyPermissionRole: 'manager' })),
      getCurrentUser: jest.fn(() => ({ userId: 'child-1', role: 'child' }))
    });
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
      showToast: jest.fn(),
      setClipboardData: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.wx;
  });

  it('关于页内置应用版本应与 package.json 保持一致', () => {
    const appMeta = require('../../utils/app-meta');
    const pkg = require('../../package.json');

    expect(appMeta.version).toBe(pkg.version);
  });

  it('应加载维护者联系方式并展示二维码', () => {
    const page = createPage();

    page.onLoad.call(page);

    expect(page.data.showSupportWechatQr).toBe(true);
    expect(page.data.supportWechatId).toBe(supportContact.wechatId);
    expect(page.data.supportEmail).toBe(supportContact.email);
    expect(page.data.version).toBe('1.2.3');
  });

  it('运行时版本为空时应回退到内置应用版本', () => {
    global.wx.getAccountInfoSync.mockReturnValue({
      miniProgram: {
        version: ''
      }
    });
    const page = createPage();

    page.onLoad.call(page);

    expect(page.data.version).toBe('3.9.0');
  });

  it('运行时版本为 0.0.0 时应回退到内置应用版本', () => {
    global.wx.getAccountInfoSync.mockReturnValue({
      miniProgram: {
        version: '0.0.0'
      }
    });
    const page = createPage();

    page.onLoad.call(page);

    expect(page.data.version).toBe('3.9.0');
  });

  it('非正式环境也应展示维护者二维码', () => {
    global.wx.getAppBaseInfo.mockReturnValue({
      envVersion: 'develop'
    });
    const page = createPage();

    page.onLoad.call(page);

    expect(page.data.envVersionLabel).toBe('开发版');
    expect(page.data.showSupportWechatQr).toBe(true);
  });

  it('联系方式缺失时应按降级规则隐藏对应项', () => {
    jest.resetModules();
    jest.doMock('../../utils/support-contact', () => ({
      supportTitle: '联系维护者',
      supportHint: '',
      supportResponseHint: '',
      wechatId: '',
      email: '',
      wechatQrImage: '',
      defaultSupportHint: '默认提示',
      defaultSupportResponseHint: '默认说明'
    }));
    loadPageModule();
    const page = createPage();

    page.onLoad.call(page);

    expect(page.data.showSupportWechatQr).toBe(false);
    expect(page.data.showSupportWechatId).toBe(false);
    expect(page.data.showSupportEmail).toBe(false);
    expect(page.data.supportHint).toBe('默认提示');
    expect(page.data.supportResponseHint).toBe('默认说明');
  });

  it('二维码点击应触发预览', () => {
    const page = createPage();
    page.onLoad.call(page);

    page.onSupportQrcodeTap.call(page);

    expect(global.wx.previewImage).toHaveBeenCalledWith({
      current: supportContact.wechatQrImage,
      urls: [supportContact.wechatQrImage]
    });
  });

  it('点击微信号和邮箱应触发复制', () => {
    const page = createPage();
    page.onLoad.call(page);

    page.onSupportWechatIdTap.call(page);
    page.onSupportEmailTap.call(page);

    expect(global.wx.setClipboardData).toHaveBeenNthCalledWith(1, {
      data: supportContact.wechatId
    });
    expect(global.wx.setClipboardData).toHaveBeenNthCalledWith(2, {
      data: supportContact.email
    });
  });

  it('存在未读版本说明时应展示入口并跳转到详情页', async () => {
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'releaseNote') {
        return {
          getCurrentReleaseNote: jest.fn().mockResolvedValue({
            success: true,
            note: {
              version: '3.9.0',
              summary: '现在可以知道有哪些新变化'
            },
            unread: true
          }),
          listVisibleReleaseNotes: jest.fn().mockResolvedValue({
            success: true,
            notes: [
              {
                version: '3.9.0',
                summary: '现在可以知道有哪些新变化'
              }
            ]
          })
        };
      }
      return null;
    });
    const page = createPage();

    page.onLoad.call(page);
    await Promise.resolve();
    await Promise.resolve();

    expect(page.data.showReleaseNotesEntry).toBe(true);
    expect(page.data.releaseNoteEntryTitle).toBe('本次更新');
    expect(page.data.releaseNoteEntryBadgeText).toBe('新变化');

    page.onReleaseNotesTap.call(page);
    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/packageManage/pages/whats-new/whats-new'
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
