jest.mock('../../utils/http-client', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

const HttpClient = require('../../utils/http-client');
const inviteService = require('../../services/invite-service');

describe('invite-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应请求邀请码预览接口', async () => {
    HttpClient.post.mockResolvedValue({ currentAction: 'enter_app' });

    const result = await inviteService.previewInviteCode('F123456789');

    expect(HttpClient.post).toHaveBeenCalledWith('/api/invites/preview', {
      inviteCode: 'F123456789'
    });
    expect(result).toEqual({ currentAction: 'enter_app' });
  });

  it('应请求邀请码 bootstrap 与 current 接口', async () => {
    HttpClient.get
      .mockResolvedValueOnce({ canIssueAdmissionCode: true })
      .mockResolvedValueOnce({ admissionCode: null, familyInviteCodes: [] });

    const bootstrap = await inviteService.getBootstrap();
    const current = await inviteService.getCurrentInviteSummary();

    expect(HttpClient.get).toHaveBeenNthCalledWith(1, '/api/invites/bootstrap');
    expect(HttpClient.get).toHaveBeenNthCalledWith(2, '/api/invites/current');
    expect(bootstrap).toEqual({ canIssueAdmissionCode: true });
    expect(current).toEqual({ admissionCode: null, familyInviteCodes: [] });
  });

  it('应请求生成邀请码接口', async () => {
    HttpClient.post
      .mockResolvedValueOnce({ code: 'U123456789' })
      .mockResolvedValueOnce({ code: 'F123456789' });

    const admissionCode = await inviteService.issueAdmissionCode();
    const familyCode = await inviteService.issueFamilyCode('child');

    expect(HttpClient.post).toHaveBeenNthCalledWith(1, '/api/invites/admission-code', {});
    expect(HttpClient.post).toHaveBeenNthCalledWith(2, '/api/invites/family-code', {
      targetRole: 'child'
    });
    expect(admissionCode).toEqual({ code: 'U123456789' });
    expect(familyCode).toEqual({ code: 'F123456789' });
  });
});
