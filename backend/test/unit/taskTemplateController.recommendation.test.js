jest.mock('../../services/taskTemplateService');
jest.mock('../../services/taskTemplateRecommendationService');
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const taskTemplateRecommendationService = require('../../services/taskTemplateRecommendationService');
const controller = require('../../controllers/taskTemplateController');

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('taskTemplateController.queryRecommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('家长调用推荐查询接口应返回 200', async () => {
    const req = {
      user: {
        userId: 'parent_1',
        role: 'parent',
        familyId: 'fam_1'
      },
      body: {
        today: '2026-04-12',
        lookbackDays: 60,
        localPendingTasks: []
      }
    };
    const res = createRes();
    taskTemplateRecommendationService.queryRecommendations = jest.fn().mockResolvedValue({
      candidates: [{ candidateKey: 'sig_1' }],
      total: 1
    });

    await controller.queryRecommendations(req, res);

    expect(taskTemplateRecommendationService.queryRecommendations).toHaveBeenCalledWith(expect.objectContaining({
      familyId: 'fam_1',
      userId: 'parent_1',
      today: '2026-04-12'
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        total: 1
      })
    }));
  });

  it('孩子调用推荐查询接口应返回 403', async () => {
    const req = {
      user: {
        userId: 'child_1',
        role: 'child',
        familyId: 'fam_1'
      },
      body: {}
    };
    const res = createRes();

    await controller.queryRecommendations(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error_code: 'PERMISSION_DENIED'
    }));
  });

  it('参数非法时应返回 400', async () => {
    const req = {
      user: {
        userId: 'parent_1',
        role: 'parent',
        familyId: 'fam_1'
      },
      body: {
        localPendingTasks: 'bad'
      }
    };
    const res = createRes();
    const error = new Error('localPendingTasks 必须为数组');
    error.code = 'INVALID_PARAMS';
    taskTemplateRecommendationService.queryRecommendations = jest.fn().mockRejectedValue(error);

    await controller.queryRecommendations(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error_code: 'INVALID_PARAMS'
    }));
  });
});
