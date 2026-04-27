const request = require('supertest');
const express = require('express');
const User = require('../../models/User');

jest.mock('../../config/database', () => ({
  getPool: jest.fn()
}));
jest.mock('../../services/appAccessService');
jest.mock('../../services/inviteCodeService');
jest.mock('../../services/userService');
jest.mock('../../utils/wechat');
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const appAccessService = require('../../services/appAccessService');
const inviteCodeService = require('../../services/inviteCodeService');
const { getPool } = require('../../config/database');
const userService = require('../../services/userService');
const { code2Session } = require('../../utils/wechat');

function buildApp() {
  const app = express();
  app.use(express.json());
  const router = require('../../routes/auth');
  app.use('/api/auth', router);
  return app;
}

function makeUser(overrides = {}) {
  return new User({
    userId: 'user_1',
    openid: 'openid_1',
    unionid: 'union_1',
    name: '测试家长',
    avatar: '',
    role: 'parent',
    familyId: null,
    familyPermissionRole: null,
    ...overrides
  });
}

describe('POST /api/auth/login', () => {
  let app;
  const previousAccessMode = process.env.APP_ACCESS_MODE;
  let mockConnection;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ACCESS_MODE = 'invite_only';
    mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn()
    };
    getPool.mockReturnValue({
      getConnection: jest.fn().mockResolvedValue(mockConnection)
    });
    code2Session.mockResolvedValue({
      openid: 'openid_1',
      unionid: 'union_1'
    });
  });

  afterAll(() => {
    process.env.APP_ACCESS_MODE = previousAccessMode;
  });

  it('已有用户在 invite_only 模式下应直接放行，不校验邀请码', async () => {
    const existingUser = makeUser({
      userId: 'user_existing',
      familyId: 'family_1',
      familyPermissionRole: 'manager'
    });
    userService.findByOpenid.mockResolvedValue(existingUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-code' });

    expect(res.status).toBe(200);
    expect(appAccessService.validateAccessCodeForNewUser).not.toHaveBeenCalled();
    expect(userService.createUser).not.toHaveBeenCalled();
    expect(res.body.data.user).toEqual(expect.objectContaining({
      userId: 'user_existing',
      familyPermissionRole: 'manager'
    }));
  });

  it('已有用户若被系统管理员禁入应返回 SYSTEM_USER_BLOCKED', async () => {
    const blockedUser = makeUser({
      userId: 'user_blocked',
      systemAccessLevel: 'blocked'
    });
    userService.findByOpenid.mockResolvedValue(blockedUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-code' });

    expect(res.status).toBe(403);
    expect(res.body.error_code).toBe('SYSTEM_USER_BLOCKED');
  });

  it('新用户在 invite_only 模式下未提供邀请码时应返回 required', async () => {
    userService.findByOpenid.mockResolvedValue(null);
    appAccessService.isInviteOnlyMode.mockReturnValue(true);
    appAccessService.validateAccessCodeForNewUser.mockRejectedValue(
      Object.assign(new Error('当前为邀请制体验，请先输入邀请码'), {
        code: 'AUTH_APP_ACCESS_CODE_REQUIRED'
      })
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-code' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('AUTH_APP_ACCESS_CODE_REQUIRED');
  });

  it('新用户在 invite_only 模式下邀请码无效时应返回 invalid', async () => {
    userService.findByOpenid.mockResolvedValue(null);
    appAccessService.isInviteOnlyMode.mockReturnValue(true);
    appAccessService.validateAccessCodeForNewUser.mockRejectedValue(
      Object.assign(new Error('邀请码无效，请检查后重试'), {
        code: 'AUTH_APP_ACCESS_CODE_INVALID'
      })
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-code', accessCode: 'BADCODE' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('AUTH_APP_ACCESS_CODE_INVALID');
  });

  it('新用户在 invite_only 模式下邀请码过期时应返回 expired', async () => {
    userService.findByOpenid.mockResolvedValue(null);
    appAccessService.isInviteOnlyMode.mockReturnValue(true);
    appAccessService.validateAccessCodeForNewUser.mockRejectedValue(
      Object.assign(new Error('邀请码已过期，请联系维护者重新获取'), {
        code: 'AUTH_APP_ACCESS_CODE_EXPIRED'
      })
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-code', accessCode: 'EXPIRED1' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('AUTH_APP_ACCESS_CODE_EXPIRED');
  });

  it('新用户使用有效邀请码登录成功后应消费邀请码', async () => {
    const createdUser = makeUser({
      userId: 'user_new'
    });
    userService.findByOpenid.mockResolvedValue(null);
    appAccessService.isInviteOnlyMode.mockReturnValue(true);
    appAccessService.validateAccessCodeForNewUser.mockResolvedValue({
      accessCodeId: 'acc_1'
    });
    userService.createUser.mockResolvedValue(createdUser);
    appAccessService.consumeAccessCode.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-code', accessCode: 'INVITE88' });

    expect(res.status).toBe(200);
    expect(userService.createUser).toHaveBeenCalledWith(expect.objectContaining({
      openid: 'openid_1',
      unionid: 'union_1',
      role: 'parent'
    }), {
      connection: mockConnection
    });
    expect(appAccessService.validateAccessCodeForNewUser).toHaveBeenCalledWith('INVITE88', {
      connection: mockConnection,
      forUpdate: true
    });
    expect(appAccessService.consumeAccessCode).toHaveBeenCalledWith('acc_1', 'user_new', {
      connection: mockConnection
    });
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(mockConnection.rollback).not.toHaveBeenCalled();
    expect(res.body.data.user).toEqual(expect.objectContaining({
      userId: 'user_new'
    }));
  });

  it('邀请码消费失败时应回滚并返回 invalid，避免放行半成功用户', async () => {
    const createdUser = makeUser({
      userId: 'user_new'
    });
    userService.findByOpenid.mockResolvedValue(null);
    appAccessService.isInviteOnlyMode.mockReturnValue(true);
    appAccessService.validateAccessCodeForNewUser.mockResolvedValue({
      accessCodeId: 'acc_1'
    });
    userService.createUser.mockResolvedValue(createdUser);
    appAccessService.consumeAccessCode.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-code', accessCode: 'INVITE88' });

    expect(res.status).toBe(400);
    expect(res.body.error_code).toBe('AUTH_APP_ACCESS_CODE_INVALID');
    expect(mockConnection.rollback).toHaveBeenCalled();
    expect(mockConnection.commit).not.toHaveBeenCalled();
  });

  it('open 模式下新用户应直接创建成功，不校验邀请码', async () => {
    const createdUser = makeUser({
      userId: 'user_open'
    });
    process.env.APP_ACCESS_MODE = 'open';
    userService.findByOpenid.mockResolvedValue(null);
    appAccessService.isInviteOnlyMode.mockReturnValue(false);
    userService.createUser.mockResolvedValue(createdUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-code' });

    expect(res.status).toBe(200);
    expect(userService.createUser).toHaveBeenCalledWith(expect.objectContaining({
      openid: 'openid_1',
      unionid: 'union_1',
      role: 'parent'
    }));
    expect(appAccessService.validateAccessCodeForNewUser).not.toHaveBeenCalled();
    expect(appAccessService.consumeAccessCode).not.toHaveBeenCalled();
    expect(res.body.data.user).toEqual(expect.objectContaining({
      userId: 'user_open'
    }));
  });

  it('新用户使用统一 family_invite 登录成功后应走事务化消费链路，并透传资料快照', async () => {
    const createdUser = makeUser({
      userId: 'user_joined',
      role: 'child',
      familyId: 'family_1'
    });
    userService.findByOpenid.mockResolvedValue(null);
    appAccessService.isInviteOnlyMode.mockReturnValue(true);
    inviteCodeService.consumeForNewUser.mockResolvedValue(createdUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        code: 'wx-code',
        inviteCode: 'F123456789',
        profile: {
          nickname: '新孩子',
          avatarUrl: 'https://example.com/avatar.png'
        }
      });

    expect(res.status).toBe(200);
    expect(inviteCodeService.consumeForNewUser).toHaveBeenCalledWith({
      code: 'F123456789',
      wechatData: {
        openid: 'openid_1',
        unionid: 'union_1'
      },
      profileSnapshot: {
        nickname: '新孩子',
        avatarUrl: 'https://example.com/avatar.png'
      },
      connection: mockConnection
    });
    expect(mockConnection.commit).toHaveBeenCalled();
    expect(mockConnection.rollback).not.toHaveBeenCalled();
    expect(res.body.data.user).toEqual(expect.objectContaining({
      userId: 'user_joined',
      familyId: 'family_1',
      role: 'child'
    }));
  });

  it('系统准入配置损坏时应返回明确错误码，而不是泛化登录失败', async () => {
    userService.findByOpenid.mockResolvedValue(null);
    appAccessService.isInviteOnlyMode.mockRejectedValue(
      Object.assign(new Error('系统准入配置无效'), {
        code: 'SYSTEM_SETTING_CORRUPTED'
      })
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ code: 'wx-code' });

    expect(res.status).toBe(503);
    expect(res.body.error_code).toBe('SYSTEM_SETTING_CORRUPTED');
    expect(res.body.message).toBe('系统准入配置异常，请联系管理员处理');
  });
});
