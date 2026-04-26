jest.mock('../../services/userService', () => ({
  findById: jest.fn()
}));

const userService = require('../../services/userService');
const { systemUserAccessMiddleware, isReadonlyMutationRequest } = require('../../middleware/systemUserAccess');

function createRes() {
  return {
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn()
  };
}

describe('systemUserAccessMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normal 用户应放行并注入 req.systemUser', async () => {
    const req = {
      user: { userId: 'user_1' },
      method: 'GET',
      originalUrl: '/api/tasks'
    };
    const res = createRes();
    const next = jest.fn();
    userService.findById.mockResolvedValue({
      userId: 'user_1',
      isSystemBlocked: () => false,
      isSystemReadonly: () => false
    });

    await systemUserAccessMiddleware(req, res, next);

    expect(req.systemUser).toEqual(expect.objectContaining({ userId: 'user_1' }));
    expect(next).toHaveBeenCalledWith();
  });

  it('blocked 用户应返回 403 SYSTEM_USER_BLOCKED', async () => {
    const req = {
      user: { userId: 'user_1' },
      method: 'GET',
      originalUrl: '/api/auth/current'
    };
    const res = createRes();
    const next = jest.fn();
    userService.findById.mockResolvedValue({
      userId: 'user_1',
      isSystemBlocked: () => true,
      isSystemReadonly: () => false
    });

    await systemUserAccessMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'SYSTEM_USER_BLOCKED'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('readonly 用户访问写接口应返回 403 SYSTEM_USER_READONLY', async () => {
    const req = {
      user: { userId: 'user_1' },
      method: 'PATCH',
      originalUrl: '/api/rewards/reward_1/exchange'
    };
    const res = createRes();
    const next = jest.fn();
    userService.findById.mockResolvedValue({
      userId: 'user_1',
      isSystemBlocked: () => false,
      isSystemReadonly: () => true
    });

    await systemUserAccessMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'SYSTEM_USER_READONLY'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('readonly 用户访问推荐查询型 POST 应放行', async () => {
    const req = {
      user: { userId: 'user_1' },
      method: 'POST',
      originalUrl: '/api/task-templates/recommendations/query'
    };
    const res = createRes();
    const next = jest.fn();
    userService.findById.mockResolvedValue({
      userId: 'user_1',
      isSystemBlocked: () => false,
      isSystemReadonly: () => true
    });

    await systemUserAccessMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe('isReadonlyMutationRequest', () => {
  it('GET 请求不应视为写接口', () => {
    expect(isReadonlyMutationRequest({
      method: 'GET',
      originalUrl: '/api/tasks'
    })).toBe(false);
  });

  it('查询型 POST 不应视为写接口', () => {
    expect(isReadonlyMutationRequest({
      method: 'POST',
      originalUrl: '/api/task-templates/recommendations/query'
    })).toBe(false);
  });

  it('模板使用次数记录应视为写接口', () => {
    expect(isReadonlyMutationRequest({
      method: 'POST',
      originalUrl: '/api/task-templates/tpl_1/usage'
    })).toBe(true);
  });
});
