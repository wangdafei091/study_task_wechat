jest.mock('../../services/familyService');

const familyService = require('../../services/familyService');
const {
  ensureManagerBusinessAccess,
  ensureParentManagerBusinessAccess,
  isViewerChildExecutionRequest
} = require('../../utils/family-permission');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
}

describe('backend/utils/family-permission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ensureManagerBusinessAccess 应允许 manager 家长通过', async () => {
    familyService.getUserFamilyRoleProfile.mockResolvedValue({
      userId: 'parent_manager',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'manager'
    });
    const req = {
      user: { userId: 'parent_manager', role: 'parent', familyId: 'fam_1' }
    };
    const res = createRes();

    const allowed = await ensureManagerBusinessAccess(req, res);

    expect(allowed).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('ensureManagerBusinessAccess 应拒绝 viewer 家长', async () => {
    familyService.getUserFamilyRoleProfile.mockResolvedValue({
      userId: 'parent_viewer',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'viewer'
    });
    const req = {
      user: { userId: 'parent_viewer', role: 'parent', familyId: 'fam_1' }
    };
    const res = createRes();

    const allowed = await ensureManagerBusinessAccess(req, res, {
      deniedMessage: '当前为查看者，不能修改内容'
    });

    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'FAMILY_MANAGER_REQUIRED'
    }));
  });

  it('ensureParentManagerBusinessAccess 应拒绝孩子用户', async () => {
    const req = {
      user: { userId: 'child_1', role: 'child', familyId: 'fam_1' }
    };
    const res = createRes();

    const allowed = await ensureParentManagerBusinessAccess(req, res, {
      parentRequiredMessage: '仅家长可操作'
    });

    expect(allowed).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'PERMISSION_DENIED'
    }));
  });

  it('isViewerChildExecutionRequest 应识别 viewer 家长以孩子身份执行', async () => {
    familyService.getUserFamilyRoleProfile.mockResolvedValue({
      userId: 'parent_viewer',
      role: 'parent',
      familyId: 'fam_1',
      familyPermissionRole: 'viewer'
    });
    familyService.getUserFamilyAndRole.mockResolvedValue({
      familyId: 'fam_1',
      role: 'child'
    });
    const req = {
      user: { userId: 'parent_viewer', role: 'parent', familyId: 'fam_1' },
      body: {
        operatorContext: {
          actorUserId: 'child_1'
        }
      }
    };

    const result = await isViewerChildExecutionRequest(req, 'child_1');

    expect(result).toBe(true);
  });

  it('isViewerChildExecutionRequest 在 actor 不匹配时应返回 false', async () => {
    const req = {
      user: { userId: 'parent_viewer', role: 'parent', familyId: 'fam_1' },
      body: {
        operatorContext: {
          actorUserId: 'child_2'
        }
      }
    };

    const result = await isViewerChildExecutionRequest(req, 'child_1');

    expect(result).toBe(false);
    expect(familyService.getUserFamilyRoleProfile).not.toHaveBeenCalled();
  });
});
