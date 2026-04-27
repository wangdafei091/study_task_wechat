jest.mock('../../services/service-manager.js', () => ({
  setUserService: jest.fn(),
  initialize: jest.fn(),
  getOfflineQueueService: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const serviceManager = require('../../services/service-manager.js');
const bootstrapServices = require('../../utils/app/bootstrap-services');

describe('utils/app/bootstrap-services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serviceManager.getOfflineQueueService.mockReturnValue(null);
  });

  it('有 userService 时应注入并在初始化成功后设置 servicesInitialized', async () => {
    serviceManager.initialize.mockResolvedValue(true);
    const offlineQueueService = {
      initialize: jest.fn().mockResolvedValue(true)
    };
    serviceManager.getOfflineQueueService.mockReturnValue(offlineQueueService);
    const app = {
      globalData: {
        userService: { id: 'user-service' },
        servicesInitialized: false
      }
    };

    const result = await bootstrapServices.initialize(app, { isDevEnv: true });

    expect(result).toBe(true);
    expect(serviceManager.setUserService).toHaveBeenCalledWith(app.globalData.userService);
    expect(serviceManager.initialize).toHaveBeenCalledWith({
      enableEventOptimization: true,
      enableEventDebug: true
    });
    expect(offlineQueueService.initialize).toHaveBeenCalledTimes(1);
    expect(app.globalData.servicesInitialized).toBe(true);
  });

  it('无 userService 或初始化异常时应安全降级', async () => {
    serviceManager.initialize.mockRejectedValue(new Error('fail'));
    serviceManager.getOfflineQueueService.mockReturnValue(null);
    const app = {
      globalData: {
        userService: null,
        servicesInitialized: false
      }
    };

    const result = await bootstrapServices.initialize(app, { isDevEnv: false });

    expect(result).toBe(false);
    expect(serviceManager.setUserService).not.toHaveBeenCalled();
    expect(app.globalData.servicesInitialized).toBe(false);
  });

  it('初始化返回 false 时应保持未就绪状态', async () => {
    serviceManager.initialize.mockResolvedValue(false);
    serviceManager.getOfflineQueueService.mockReturnValue(null);
    const app = {
      globalData: {
        userService: null,
        servicesInitialized: false
      }
    };

    const result = await bootstrapServices.initialize(app, { isDevEnv: false });

    expect(result).toBe(false);
    expect(serviceManager.setUserService).not.toHaveBeenCalled();
    expect(app.globalData.servicesInitialized).toBe(false);
  });
});
