jest.mock('../../config/database', () => ({
  query: jest.fn(),
  execute: jest.fn()
}));

const db = require('../../config/database');
const systemSettingService = require('../../services/systemSettingService');

describe('systemSettingService', () => {
  const previousAccessMode = process.env.APP_ACCESS_MODE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ACCESS_MODE = 'invite_only';
  });

  afterAll(() => {
    process.env.APP_ACCESS_MODE = previousAccessMode;
  });

  it('数据库存在配置时应优先返回数据库值', async () => {
    db.query.mockResolvedValue([{
      setting_key: 'app_access_mode',
      setting_value: 'open',
      updated_by_user_id: 'admin_1',
      created_at: '2026-04-25 10:00:00',
      updated_at: '2026-04-25 10:00:00'
    }]);

    const result = await systemSettingService.getAppAccessMode();

    expect(result).toEqual({
      mode: 'open',
      source: 'db',
      updatedAt: '2026-04-25 10:00:00',
      updatedByUserId: 'admin_1'
    });
  });

  it('数据库不存在配置时应回退环境变量', async () => {
    db.query.mockResolvedValue([]);

    const result = await systemSettingService.getAppAccessMode();

    expect(result).toEqual({
      mode: 'invite_only',
      source: 'env',
      updatedAt: null,
      updatedByUserId: null
    });
  });

  it('环境变量缺失时应回退默认开放模式', async () => {
    db.query.mockResolvedValue([]);
    delete process.env.APP_ACCESS_MODE;

    const result = await systemSettingService.getAppAccessMode();

    expect(result).toEqual({
      mode: 'open',
      source: 'default',
      updatedAt: null,
      updatedByUserId: null
    });
  });

  it('数据库存在非法配置时不应静默回退到环境变量', async () => {
    db.query.mockResolvedValue([{
      setting_key: 'app_access_mode',
      setting_value: 'closed',
      updated_by_user_id: 'admin_3',
      created_at: '2026-04-25 10:00:00',
      updated_at: '2026-04-25 10:00:00'
    }]);

    await expect(systemSettingService.getAppAccessMode()).rejects.toMatchObject({
      code: 'SYSTEM_SETTING_CORRUPTED',
      settingKey: 'app_access_mode',
      settingValue: 'closed'
    });
  });

  it('更新准入模式时应执行 upsert 并返回最新摘要', async () => {
    db.execute.mockResolvedValue({ affectedRows: 1 });
    db.query.mockResolvedValue([{
      setting_key: 'app_access_mode',
      setting_value: 'invite_only',
      updated_by_user_id: 'admin_2',
      created_at: '2026-04-25 10:00:00',
      updated_at: '2026-04-25 11:00:00'
    }]);

    const result = await systemSettingService.updateAppAccessMode('invite_only', 'admin_2');

    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO system_settings'),
      ['app_access_mode', 'invite_only', 'admin_2']
    );
    expect(result).toEqual({
      mode: 'invite_only',
      source: 'db',
      updatedAt: '2026-04-25 11:00:00',
      updatedByUserId: 'admin_2'
    });
  });

  it('非法模式应返回 SYSTEM_SETTING_INVALID', async () => {
    await expect(systemSettingService.updateAppAccessMode('closed', 'admin_2')).rejects.toMatchObject({
      code: 'SYSTEM_SETTING_INVALID'
    });
  });
});
