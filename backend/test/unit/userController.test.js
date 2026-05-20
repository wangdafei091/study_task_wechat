jest.mock('../../services/userService', () => ({
  findActiveById: jest.fn()
}));
jest.mock('../../services/familyService', () => ({
  updateChildAvatarPreset: jest.fn(),
  updateNickname: jest.fn(),
  getUserFamilyAndRole: jest.fn()
}));
jest.mock('../../services/userProductStateService', () => ({
  getReleaseNoteAwarenessState: jest.fn(),
  recordEvent: jest.fn()
}));
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const userController = require('../../controllers/userController');
const userService = require('../../services/userService');
const familyService = require('../../services/familyService');
const userProductStateService = require('../../services/userProductStateService');

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
    familyService.getUserFamilyAndRole.mockResolvedValue({
      familyId: 'fam_1',
      role: 'child'
    });
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

  it('getProductState 应返回当前业务视角用户的产品状态', async () => {
    userProductStateService.getReleaseNoteAwarenessState.mockResolvedValue({
      userId: 'child_1',
      canAutoPrompt: true,
      canShowHelpBadge: true,
      aboutEntryMode: 'current_update'
    });

    const req = {
      query: {
        targetUserId: 'child_1',
        runtimeVersion: '3.9.0',
        sourcePage: 'about_page'
      },
      user: {
        userId: 'parent_1',
        role: 'parent',
        familyId: 'fam_1'
      }
    };
    const res = createRes();

    await userController.getProductState(req, res);

    expect(userProductStateService.getReleaseNoteAwarenessState).toHaveBeenCalledWith('child_1', expect.objectContaining({
      runtimeVersion: '3.9.0',
      familyId: 'fam_1',
      sourcePage: 'about_page'
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        userId: 'child_1',
        canAutoPrompt: true
      })
    }));
  });

  it('createActivityEvent 应校验白名单事件并记录成功', async () => {
    userProductStateService.recordEvent.mockResolvedValue({
      eventId: 'evt_1'
    });

    const req = {
      body: {
        subjectUserId: 'child_1',
        eventType: 'release_note_viewed',
        runtimeVersion: '3.9.0',
        sourcePage: 'whats_new',
        payload: {
          version: '3.9.0'
        }
      },
      user: {
        userId: 'parent_1',
        role: 'parent',
        familyId: 'fam_1'
      }
    };
    const res = createRes();

    await userController.createActivityEvent(req, res);

    expect(userProductStateService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'child_1',
      familyId: 'fam_1',
      eventType: 'release_note_viewed',
      appVersion: '3.9.0',
      sourcePage: 'whats_new',
      payloadJson: {
        version: '3.9.0'
      }
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: {
        eventId: 'evt_1'
      }
    }));
  });

  it('createActivityEvent 对非白名单事件应返回 400', async () => {
    const req = {
      body: {
        eventType: 'task_created'
      },
      user: {
        userId: 'parent_1',
        role: 'parent',
        familyId: 'fam_1'
      }
    };
    const res = createRes();

    await userController.createActivityEvent(req, res);

    expect(userProductStateService.recordEvent).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'INVALID_PARAMS'
    }));
  });

  it('createActivityEvent 对无权限的 targetUserId 应返回 403', async () => {
    familyService.getUserFamilyAndRole.mockResolvedValueOnce({
      familyId: 'fam_2',
      role: 'child'
    });

    const req = {
      body: {
        eventType: 'release_note_viewed',
        targetUserId: 'child_2'
      },
      user: {
        userId: 'parent_1',
        role: 'parent',
        familyId: 'fam_1'
      }
    };
    const res = createRes();

    await userController.createActivityEvent(req, res);

    expect(userProductStateService.recordEvent).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'FAMILY_MEMBER_ACCESS_DENIED'
    }));
  });
});
