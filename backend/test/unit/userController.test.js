jest.mock('../../services/userService', () => ({
  findActiveById: jest.fn()
}));
jest.mock('../../services/familyService', () => ({
  updateChildAvatarPreset: jest.fn(),
  updateNickname: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const userController = require('../../controllers/userController');
const userService = require('../../services/userService');
const familyService = require('../../services/familyService');

function createRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res)
  };
  return res;
}

describe('userController identity endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updateAvatarPreset 应返回成功结果', async () => {
    userService.findActiveById.mockResolvedValue({
      userId: 'parent_1'
    });
    familyService.updateChildAvatarPreset.mockResolvedValue({
      userId: 'child_1',
      avatar: 'preset:fox'
    });

    const req = {
      params: { userId: 'child_1' },
      body: { presetId: 'fox' },
      req: null,
      user: { userId: 'parent_1' }
    };
    const res = createRes();

    await userController.updateAvatarPreset(req, res);

    expect(familyService.updateChildAvatarPreset).toHaveBeenCalledWith(
      { userId: 'parent_1' },
      'child_1',
      'fox'
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: {
        userId: 'child_1',
        avatar: 'preset:fox'
      }
    }));
  });

  it('updateAvatarPreset 应将权限错误映射为 403', async () => {
    userService.findActiveById.mockResolvedValue({
      userId: 'viewer_1'
    });
    familyService.updateChildAvatarPreset.mockRejectedValue(Object.assign(
      new Error('无权修改'),
      { code: 'FAMILY_MEMBER_ACCESS_DENIED' }
    ));

    const req = {
      params: { userId: 'child_1' },
      body: { presetId: 'fox' },
      user: { userId: 'viewer_1' }
    };
    const res = createRes();

    await userController.updateAvatarPreset(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'FAMILY_MEMBER_ACCESS_DENIED'
    }));
  });

  it('updateNickname 应优先使用 req.systemUser 作为最新操作者', async () => {
    familyService.updateNickname.mockResolvedValue(undefined);

    const req = {
      params: { userId: 'child_1' },
      body: { nickname: '新称呼' },
      user: { userId: 'stale-parent' },
      systemUser: { userId: 'fresh-parent' }
    };
    const res = createRes();

    await userController.updateNickname(req, res);

    expect(userService.findActiveById).not.toHaveBeenCalled();
    expect(familyService.updateNickname).toHaveBeenCalledWith(
      { userId: 'fresh-parent' },
      'child_1',
      '新称呼'
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: {
        userId: 'child_1',
        nickname: '新称呼'
      }
    }));
  });
});
