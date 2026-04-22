jest.mock('../../config/database', () => ({
  query: jest.fn(),
  execute: jest.fn()
}));

const db = require('../../config/database');
const appAccessService = require('../../services/appAccessService');
const { AppAccessCode, APP_ACCESS_STATUS } = require('../../models/AppAccessCode');

describe('appAccessService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('插入发生唯一键冲突时应自动重试新邀请码', async () => {
    jest.spyOn(AppAccessCode, 'generateCode')
      .mockReturnValueOnce('AAAA1111')
      .mockReturnValueOnce('BBBB2222');
    jest.spyOn(AppAccessCode, 'generateId')
      .mockReturnValueOnce('id_1')
      .mockReturnValueOnce('id_2');

    db.execute
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }))
      .mockResolvedValueOnce({ affectedRows: 1 });

    const result = await appAccessService.createCodes({ count: 1, days: 7, maxUses: 1 });

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      accessCodeId: 'id_2',
      code: 'BBBB2222'
    }));
  });

  it('validateAccessCodeForNewUser 在缺少邀请码时应返回 required', async () => {
    await expect(appAccessService.validateAccessCodeForNewUser('')).rejects.toMatchObject({
      code: 'AUTH_APP_ACCESS_CODE_REQUIRED'
    });
  });

  it('validateAccessCodeForNewUser 在邀请码不存在时应返回 invalid', async () => {
    jest.spyOn(appAccessService, 'getByCode').mockResolvedValue(null);

    await expect(appAccessService.validateAccessCodeForNewUser('missing')).rejects.toMatchObject({
      code: 'AUTH_APP_ACCESS_CODE_INVALID'
    });
  });

  it('validateAccessCodeForNewUser 在邀请码过期时应标记 expired', async () => {
    jest.spyOn(appAccessService, 'getByCode').mockResolvedValue(new AppAccessCode({
      accessCodeId: 'acc_expired',
      code: 'EXPIRED1',
      status: APP_ACCESS_STATUS.ACTIVE,
      expiresAt: '2020-01-01 00:00:00'
    }));
    const markExpiredSpy = jest.spyOn(appAccessService, 'markExpired').mockResolvedValue();

    await expect(appAccessService.validateAccessCodeForNewUser('expired1')).rejects.toMatchObject({
      code: 'AUTH_APP_ACCESS_CODE_EXPIRED'
    });
    expect(markExpiredSpy).toHaveBeenCalledWith('acc_expired', {});
  });

  it('consumeAccessCode 成功消费时应返回 true', async () => {
    db.execute.mockResolvedValue({ affectedRows: 1 });

    const result = await appAccessService.consumeAccessCode('acc_1', 'user_1');

    expect(result).toBe(true);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE app_access_codes'),
      expect.arrayContaining([
        APP_ACCESS_STATUS.CONSUMED,
        APP_ACCESS_STATUS.ACTIVE,
        'user_1',
        'acc_1',
        APP_ACCESS_STATUS.ACTIVE
      ])
    );
  });

  it('disableCodes 应批量禁用邀请码', async () => {
    db.execute.mockResolvedValue({ affectedRows: 2 });

    const result = await appAccessService.disableCodes(['codea', 'codeb']);

    expect(result).toBe(2);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('WHERE code IN (?, ?)'),
      [APP_ACCESS_STATUS.DISABLED, 'CODEA', 'CODEB']
    );
  });

  it('listCodes 应返回模型序列化结果', async () => {
    db.query.mockResolvedValue([{
      access_code_id: 'acc_1',
      code: 'CODE0001',
      status: APP_ACCESS_STATUS.ACTIVE,
      max_uses: 2,
      used_count: 1,
      expires_at: '2099-01-01 00:00:00',
      bound_user_id: 'user_1',
      note: 'test',
      consumed_at: null,
      created_at: '2026-04-21 10:00:00',
      updated_at: '2026-04-21 10:00:00'
    }]);

    const result = await appAccessService.listCodes({ status: APP_ACCESS_STATUS.ACTIVE });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE status = ?'),
      [APP_ACCESS_STATUS.ACTIVE]
    );
    expect(result).toEqual([expect.objectContaining({
      accessCodeId: 'acc_1',
      code: 'CODE0001',
      usedCount: 1
    })]);
  });

  it('markExpired 应更新邀请码状态', async () => {
    db.execute.mockResolvedValue({ affectedRows: 1 });

    await appAccessService.markExpired('acc_marked');

    expect(db.execute).toHaveBeenCalledWith(
      'UPDATE app_access_codes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE access_code_id = ?',
      [APP_ACCESS_STATUS.EXPIRED, 'acc_marked']
    );
  });
});
