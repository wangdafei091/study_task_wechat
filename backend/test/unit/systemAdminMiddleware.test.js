jest.mock('../../services/userService', () => ({
  findById: jest.fn()
}));

const systemAdminMiddleware = require('../../middleware/systemAdmin');
const userService = require('../../services/userService');

function createRes() {
  return {
    status: jest.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn()
  };
}

describe('systemAdminMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('系统管理员应放行并注入 req.systemAdmin', async () => {
    const req = { user: { userId: 'admin_1' } };
    const res = createRes();
    const next = jest.fn();
    userService.findById.mockResolvedValue({
      userId: 'admin_1',
      role: 'parent',
      isSystemAdmin: true
    });

    await systemAdminMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.systemAdmin).toEqual(expect.objectContaining({
      userId: 'admin_1'
    }));
  });

  it('非系统管理员应返回 403', async () => {
    const req = { user: { userId: 'parent_1' } };
    const res = createRes();
    const next = jest.fn();
    userService.findById.mockResolvedValue({
      userId: 'parent_1',
      role: 'parent',
      isSystemAdmin: false
    });

    await systemAdminMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error_code: 'SYSTEM_ADMIN_REQUIRED'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
