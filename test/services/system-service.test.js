jest.mock('../../utils/http-client', () => ({
  get: jest.fn(),
  patch: jest.fn()
}));

const HttpClient = require('../../utils/http-client');
const systemService = require('../../services/system-service');

describe('system-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应请求系统入口探测接口', async () => {
    HttpClient.get.mockResolvedValue({ canEnterSystemAdmin: true });

    const result = await systemService.getBootstrap();

    expect(HttpClient.get).toHaveBeenCalledWith('/api/system/admin/bootstrap');
    expect(result).toEqual({ canEnterSystemAdmin: true });
  });

  it('应请求系统概览接口', async () => {
    HttpClient.get.mockResolvedValue({ appAccessMode: 'open' });

    const result = await systemService.getOverview();

    expect(HttpClient.get).toHaveBeenCalledWith('/api/system/admin/overview');
    expect(result).toEqual({ appAccessMode: 'open' });
  });

  it('应请求更新准入模式接口', async () => {
    HttpClient.patch.mockResolvedValue({ appAccessMode: 'invite_only' });

    const result = await systemService.updateAppAccessMode('invite_only');

    expect(HttpClient.patch).toHaveBeenCalledWith('/api/system/admin/app-access-mode', {
      mode: 'invite_only'
    });
    expect(result).toEqual({ appAccessMode: 'invite_only' });
  });
});
