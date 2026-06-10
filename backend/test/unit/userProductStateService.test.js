jest.mock('../../config/database', () => ({
  query: jest.fn(),
  execute: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const database = require('../../config/database');
const userProductStateService = require('../../services/userProductStateService');

describe('userProductStateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('compareVersion 应稳定处理空值和标准版本号', () => {
    expect(userProductStateService.compareVersion('', '')).toBe(0);
    expect(userProductStateService.compareVersion('', '3.9.0')).toBe(-1);
    expect(userProductStateService.compareVersion('3.10.0', '3.9.9')).toBe(1);
    expect(userProductStateService.compareVersion('3.9.0', '3.9')).toBe(0);
  });

  it('ensureState 在首次建档时应写入状态并记录首见事件', async () => {
    const queryMock = database.query;
    const executeMock = database.execute;

    queryMock
      .mockResolvedValueOnce([{
        user_id: 'user_1',
        first_seen_app_version: '3.9.0',
        first_seen_at: 1000,
        activated_at: null,
        activation_version: null,
        activation_source: null,
        last_seen_app_version: '3.9.0',
        last_seen_at: 1000,
        created_at: '2026-05-19 00:00:00',
        updated_at: '2026-05-19 00:00:00'
      }]);
    executeMock
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 });

    const state = await userProductStateService.ensureState('user_1', {
      runtimeVersion: '3.9.0',
      now: 1000,
      familyId: 'fam_1',
      sourcePage: 'auth_login',
      clientPlatform: 'wechat-miniprogram'
    });

    expect(executeMock).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO user_product_state'), [
      'user_1', '3.9.0', 1000, '3.9.0', 1000
    ]);
    expect(executeMock).toHaveBeenNthCalledWith(2, expect.stringContaining('INSERT INTO user_activity_events'), expect.arrayContaining([
      'user_1',
      'fam_1',
      'app_first_seen',
      1000,
      '3.9.0'
    ]));
    expect(state.userId).toBe('user_1');
    expect(state.firstSeenAppVersion).toBe('3.9.0');
  });

  it('ensureState 在记录已存在时应只更新 last seen，不重复写入首见事件', async () => {
    const queryMock = database.query;
    const executeMock = database.execute;

    queryMock.mockResolvedValueOnce([{
      user_id: 'user_1',
      first_seen_app_version: '3.8.0',
      first_seen_at: 900,
      activated_at: null,
      activation_version: null,
      activation_source: null,
      last_seen_app_version: '3.9.0',
      last_seen_at: 1000,
      created_at: '2026-05-19 00:00:00',
      updated_at: '2026-05-19 00:00:00'
    }]);
    executeMock.mockResolvedValueOnce({ affectedRows: 2 });

    const state = await userProductStateService.ensureState('user_1', {
      runtimeVersion: '3.9.0',
      now: 1000
    });

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(executeMock).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY UPDATE'), [
      'user_1', '3.9.0', 1000, '3.9.0', 1000
    ]);
    expect(state.firstSeenAppVersion).toBe('3.8.0');
  });

  it('recordEvent 应截断超长的 appVersion 和 sourcePage 后再入库', async () => {
    const executeMock = database.execute;
    executeMock.mockResolvedValueOnce({ affectedRows: 1 });

    const longVersion = 'v'.repeat(80);
    const longSourcePage = 'page/'.repeat(80);

    await userProductStateService.recordEvent({
      userId: 'user_1',
      familyId: 'fam_1',
      eventType: 'release_note_viewed',
      eventTime: 1000,
      appVersion: longVersion,
      sourcePage: longSourcePage,
      payloadJson: { version: '3.9.0' }
    });

    const [, params] = executeMock.mock.calls[0];
    expect(params[5]).toHaveLength(64);
    expect(params[8]).toHaveLength(255);
  });

  it('markActivated 在已存在未激活状态时应补激活信息', async () => {
    jest.spyOn(userProductStateService, 'ensureState').mockResolvedValue({
      userId: 'user_1',
      firstSeenAppVersion: '3.8.0',
      firstSeenAt: 900,
      activatedAt: null
    });
    jest.spyOn(userProductStateService, 'getByUserId').mockResolvedValue({
      userId: 'user_1',
      firstSeenAppVersion: '3.8.0',
      firstSeenAt: 900,
      activatedAt: 1200,
      activationVersion: '3.9.0',
      activationSource: 'task_created',
      lastSeenAppVersion: '3.9.0',
      lastSeenAt: 1200
    });

    database.execute.mockResolvedValue({ affectedRows: 1 });

    const state = await userProductStateService.markActivated('user_1', {
      runtimeVersion: '3.9.0',
      source: 'task_created',
      now: 1200
    });

    expect(database.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_product_state'), [
      1200,
      '3.9.0',
      'task_created',
      'user_1'
    ]);
    expect(state.activationVersion).toBe('3.9.0');

    userProductStateService.ensureState.mockRestore();
    userProductStateService.getByUserId.mockRestore();
  });

  it('getReleaseNoteAwarenessState 应按升级且已激活规则返回提醒资格', async () => {
    jest.spyOn(userProductStateService, 'ensureState').mockResolvedValue({
      userId: 'user_1',
      firstSeenAppVersion: '3.8.0',
      firstSeenAt: 800,
      activatedAt: 900,
      activationVersion: '3.8.0',
      activationSource: 'task_created',
      lastSeenAppVersion: '3.9.0',
      lastSeenAt: 1000
    });

    const result = await userProductStateService.getReleaseNoteAwarenessState('user_1', {
      runtimeVersion: '3.9.0',
      now: 1000
    });

    expect(result).toEqual(expect.objectContaining({
      isCurrentVersionBaseline: false,
      isUpgradeUser: true,
      isActivatedUser: true,
      canAutoPrompt: true,
      canShowHelpBadge: true,
      aboutEntryMode: 'current_update'
    }));

    userProductStateService.ensureState.mockRestore();
  });

  it('getProductState 应为无家庭基线用户返回普通 no-family onboarding 资格', async () => {
    jest.spyOn(userProductStateService, 'ensureState').mockResolvedValue({
      userId: 'user_1',
      firstSeenAppVersion: '3.9.0',
      firstSeenAt: 1000,
      activatedAt: null,
      activationVersion: null,
      activationSource: null,
      lastSeenAppVersion: '3.9.0',
      lastSeenAt: 1000
    });
    jest.spyOn(userProductStateService, 'hasCurrentVersionEvent').mockResolvedValue(false);

    const result = await userProductStateService.getProductState('user_1', {
      runtimeVersion: '3.9.0',
      userRole: 'parent',
      familyId: null,
      now: 1000
    });

    expect(result).toEqual(expect.objectContaining({
      isCurrentVersionBaseline: true,
      isActivatedUser: false,
      canShowNoFamilyHomeOnboarding: true,
      hasShownNoFamilyHomeOnboardingInCurrentVersion: false,
      noFamilyOnboardingMode: 'parent_create_or_join'
    }));

    userProductStateService.ensureState.mockRestore();
    userProductStateService.hasCurrentVersionEvent.mockRestore();
  });

  it('getProductState 在当前版本已展示过 no-family onboarding 时不应重复返回资格', async () => {
    jest.spyOn(userProductStateService, 'ensureState').mockResolvedValue({
      userId: 'user_1',
      firstSeenAppVersion: '3.9.0',
      firstSeenAt: 1000,
      activatedAt: null,
      activationVersion: null,
      activationSource: null,
      lastSeenAppVersion: '3.9.0',
      lastSeenAt: 1100
    });
    jest.spyOn(userProductStateService, 'hasCurrentVersionEvent').mockResolvedValue(true);

    const result = await userProductStateService.getProductState('user_1', {
      runtimeVersion: '3.9.0',
      userRole: 'child',
      familyId: null,
      now: 1100
    });

    expect(result).toEqual(expect.objectContaining({
      canShowNoFamilyHomeOnboarding: false,
      hasShownNoFamilyHomeOnboardingInCurrentVersion: true,
      noFamilyOnboardingMode: 'child_join_only'
    }));

    userProductStateService.ensureState.mockRestore();
    userProductStateService.hasCurrentVersionEvent.mockRestore();
  });
});
