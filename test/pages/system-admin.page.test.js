jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../services/system-service', () => ({
  getOverview: jest.fn(),
  updateAppAccessMode: jest.fn()
}));

describe('packageManage/pages/system-admin/system-admin', () => {
  let pageConfig;
  let systemService;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageManage/pages/system-admin/system-admin.js');
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
      showToast: jest.fn(),
      navigateBack: jest.fn()
    };
    loadPageModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Page;
    delete global.wx;
  });

  it('加载成功后应展示系统概览', async () => {
    const page = createPage();
    systemService.getOverview.mockResolvedValue({
      appAccessMode: 'invite_only',
      modeSource: 'db',
      updatedAt: '2026-04-25 12:00:00',
      updatedByUserId: 'admin_1'
    });

    await page.loadOverview.call(page);

    expect(page.data.loading).toBe(false);
    expect(page.data.appAccessMode).toBe('invite_only');
    expect(page.data.modeSource).toBe('数据库配置');
    expect(page.data.loadErrorCode).toBe('');
  });

  it('系统管理员缺失时应提示并返回上一页', async () => {
    const page = createPage();
    systemService.getOverview.mockRejectedValue({
      code: 'SYSTEM_ADMIN_REQUIRED'
    });

    await page.loadOverview.call(page);

    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '仅系统管理员可访问',
      icon: 'none'
    });
    jest.runAllTimers();
    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
  });

  it('切换准入模式成功后应刷新页面状态', async () => {
    const page = createPage();
    page.data.appAccessMode = 'open';
    systemService.updateAppAccessMode.mockResolvedValue({
      appAccessMode: 'invite_only',
      modeSource: 'db',
      updatedAt: '2026-04-25 13:00:00',
      updatedByUserId: 'admin_1'
    });

    await page.onModeChange.call(page, {
      currentTarget: {
        dataset: {
          mode: 'invite_only'
        }
      }
    });

    expect(page.data.appAccessMode).toBe('invite_only');
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '已更新',
      icon: 'success'
    });
  });

  it('概览加载失败时应进入错误态而不是展示默认开放制', async () => {
    const page = createPage();
    systemService.getOverview.mockRejectedValue({
      message: '网络异常'
    });

    await page.loadOverview.call(page);

    expect(page.data.loading).toBe(false);
    expect(page.data.appAccessMode).toBe('');
    expect(page.data.loadErrorCode).toBe('SYSTEM_OVERVIEW_FAILED');
    expect(page.data.loadErrorMessage).toBe('网络异常');
  });

  it('配置损坏时应进入修复态并允许通过保存恢复', async () => {
    const page = createPage();
    systemService.getOverview.mockRejectedValue({
      code: 'SYSTEM_SETTING_CORRUPTED',
      message: '系统准入配置异常，请重新设置'
    });
    systemService.updateAppAccessMode.mockResolvedValue({
      appAccessMode: 'invite_only',
      modeSource: 'db',
      updatedAt: '2026-04-25 13:00:00',
      updatedByUserId: 'admin_1'
    });

    await page.loadOverview.call(page);
    expect(page.data.appAccessMode).toBe('');
    expect(page.data.loadErrorCode).toBe('SYSTEM_SETTING_CORRUPTED');

    await page.onModeChange.call(page, {
      currentTarget: {
        dataset: {
          mode: 'invite_only'
        }
      }
    });

    expect(page.data.appAccessMode).toBe('invite_only');
    expect(page.data.loadErrorCode).toBe('');
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '已更新',
      icon: 'success'
    });
  });

  it('保存时若管理员资格被撤销应提示并返回上一页', async () => {
    const page = createPage();
    page.data.appAccessMode = 'open';
    systemService.updateAppAccessMode.mockRejectedValue({
      code: 'SYSTEM_ADMIN_REQUIRED'
    });

    await page.onModeChange.call(page, {
      currentTarget: {
        dataset: {
          mode: 'invite_only'
        }
      }
    });

    expect(page.data.saving).toBe(false);
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '仅系统管理员可访问',
      icon: 'none'
    });
    jest.runAllTimers();
    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
  });
});
