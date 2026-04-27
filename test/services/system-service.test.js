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

  it('应携带查询参数请求系统用户治理列表接口', async () => {
    HttpClient.get.mockResolvedValue({
      users: [],
      summary: { normal: 0, readonly: 0, blocked: 0 },
      nextCursor: '',
      hasMore: false
    });

    const result = await systemService.listUserGovernance({
      keyword: '家长',
      accessLevel: 'normal'
    });

    expect(HttpClient.get).toHaveBeenCalledWith('/api/system/admin/users/governance', {
      keyword: '家长',
      accessLevel: 'normal'
    });
    expect(result).toEqual({
      users: [],
      summary: { normal: 0, readonly: 0, blocked: 0 },
      nextCursor: '',
      hasMore: false
    });
  });

  it('应请求更新系统用户访问级别接口', async () => {
    HttpClient.patch.mockResolvedValue({ userId: 'user_1', systemAccessLevel: 'readonly' });

    const result = await systemService.updateUserAccessLevel('user_1', 'readonly');

    expect(HttpClient.patch).toHaveBeenCalledWith('/api/system/admin/users/user_1/access-level', {
      accessLevel: 'readonly'
    });
    expect(result).toEqual({ userId: 'user_1', systemAccessLevel: 'readonly' });
  });

  it('应请求邀请码治理概览接口', async () => {
    HttpClient.get.mockResolvedValue({ quotaTotal: 10, quotaUsed: 2, quotaRemaining: 8 });

    const result = await systemService.getInviteGovernance();

    expect(HttpClient.get).toHaveBeenCalledWith('/api/system/admin/invite-governance');
    expect(result).toEqual({ quotaTotal: 10, quotaUsed: 2, quotaRemaining: 8 });
  });

  it('应请求更新邀请码治理概览接口', async () => {
    HttpClient.patch.mockResolvedValue({ quotaTotal: 20, quotaUsed: 5, quotaRemaining: 15 });

    const result = await systemService.updateInviteGovernance(20);

    expect(HttpClient.patch).toHaveBeenCalledWith('/api/system/admin/invite-governance', {
      quotaTotal: 20
    });
    expect(result).toEqual({ quotaTotal: 20, quotaUsed: 5, quotaRemaining: 15 });
  });

  it('应请求更新用户邀请码治理接口', async () => {
    HttpClient.patch.mockResolvedValue({ userId: 'user_1', canIssueAdmissionCode: true, admissionCodeQuotaTotal: 3 });

    const result = await systemService.updateUserAdmissionIssuer('user_1', {
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 3
    });

    expect(HttpClient.patch).toHaveBeenCalledWith('/api/system/admin/users/user_1/admission-issuer', {
      canIssueAdmissionCode: true,
      admissionCodeQuotaTotal: 3
    });
    expect(result).toEqual({ userId: 'user_1', canIssueAdmissionCode: true, admissionCodeQuotaTotal: 3 });
  });
});
