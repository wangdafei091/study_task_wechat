/**
 * service-manager.test.js - ServiceManager 测试
 */

const loadServiceManager = (options = {}) => {
  const { throwTaskCtor = false, throwAnalyticsRequire = false } = options;

  jest.resetModules();

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  jest.doMock('../../utils/logger', () => logger);

  const eventBusInstance = {
    setDebugMode: jest.fn(),
    setOptimization: jest.fn()
  };
  const EventBus = jest.fn(() => eventBusInstance);
  jest.doMock('../../utils/core/event-bus', () => EventBus);

  const storageAdapterInstance = { name: 'storageAdapter' };
  const StorageAdapter = jest.fn(() => storageAdapterInstance);
  jest.doMock('../../adapters/storage-adapter', () => StorageAdapter);

  const starServiceInstance = { name: 'starService' };
  const messageServiceInstance = { name: 'messageService' };
  const rewardServiceInstance = { name: 'rewardService' };
  const taskServiceInstance = {
    name: 'taskService',
    buildLegacyQueueCandidates: jest.fn(async () => []),
    updateOfflineQueueService: jest.fn(),
    updateUserService: jest.fn()
  };
  rewardServiceInstance.buildLegacyQueueCandidates = jest.fn(async () => []);
  rewardServiceInstance.updateOfflineQueueService = jest.fn();
  rewardServiceInstance.updateUserService = jest.fn();
  rewardServiceInstance.updateStarService = jest.fn();
  const validationServiceInstance = { name: 'validationService' };
  const configServiceInstance = { name: 'configService' };
  const analyticsServiceInstance = { name: 'analyticsService' };
  const offlineQueueServiceInstance = { name: 'offlineQueueService' };
  const taskTemplateServiceInstance = {
    name: 'taskTemplateService',
    updateUserService: jest.fn()
  };

  const StarService = jest.fn(() => starServiceInstance);
  const MessageService = jest.fn(() => messageServiceInstance);
  const RewardService = jest.fn(() => rewardServiceInstance);
  const TaskTemplateService = jest.fn(() => taskTemplateServiceInstance);
  const TaskService = jest.fn(() => {
    if (throwTaskCtor) {
      throw new Error('task ctor failed');
    }
    return taskServiceInstance;
  });
  const ValidationService = jest.fn(() => validationServiceInstance);
  const ConfigService = jest.fn(() => configServiceInstance);
  const OfflineQueueService = jest.fn(() => offlineQueueServiceInstance);
  const AnalyticsService = jest.fn(() => analyticsServiceInstance);

  jest.doMock('../../services/index', () => ({
    TaskService,
    RewardService,
    StarService,
    MessageService,
    OfflineQueueService,
    TaskTemplateService
  }));
  jest.doMock('../../services/validation-service', () => ValidationService);
  jest.doMock('../../services/config-service', () => ConfigService);

  if (throwAnalyticsRequire) {
    jest.doMock('../../services/analytics-service', () => {
      throw new Error('analytics require failed');
    });
  } else {
    jest.doMock('../../services/analytics-service', () => AnalyticsService);
  }

  const serviceManager = require('../../services/service-manager');

  return {
    serviceManager,
    mocks: {
      logger,
      eventBusInstance,
      StorageAdapter,
      StarService,
      MessageService,
      RewardService,
      TaskService,
      ValidationService,
      ConfigService,
      OfflineQueueService,
      TaskTemplateService,
      AnalyticsService,
      instances: {
        starServiceInstance,
        messageServiceInstance,
        rewardServiceInstance,
        taskServiceInstance,
        taskTemplateServiceInstance,
        validationServiceInstance,
        configServiceInstance,
        analyticsServiceInstance,
        offlineQueueServiceInstance
      }
    }
  };
};

describe('ServiceManager', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('未初始化时 getService 应返回 null', () => {
    const { serviceManager } = loadServiceManager();
    expect(serviceManager.getService('task')).toBeNull();
  });

  it('应该成功初始化并按依赖顺序创建服务', async () => {
    const { serviceManager, mocks } = loadServiceManager();
    const userService = { name: 'userService' };

    serviceManager.setUserService(userService);
    const result = await serviceManager.initialize({
      enableEventDebug: true,
      enableEventOptimization: false
    });

    expect(result).toBe(true);
    expect(serviceManager.isInitialized).toBe(true);
    expect(mocks.eventBusInstance.setDebugMode).toHaveBeenCalledWith(true);
    expect(mocks.eventBusInstance.setOptimization).toHaveBeenCalledWith(false);

    expect(mocks.StarService).toHaveBeenCalledWith({
      eventBus: mocks.eventBusInstance
    });
    expect(mocks.MessageService).toHaveBeenCalledWith({
      eventBus: mocks.eventBusInstance,
      userService
    });
    expect(mocks.RewardService).toHaveBeenCalledWith({
      eventBus: mocks.eventBusInstance,
      starService: mocks.instances.starServiceInstance,
      userService,
      storageAdapter: expect.any(Object)
    });
    expect(mocks.TaskService).toHaveBeenCalledWith({
      eventBus: mocks.eventBusInstance,
      starService: mocks.instances.starServiceInstance,
      rewardService: mocks.instances.rewardServiceInstance,
      userService
    });
    expect(mocks.ValidationService).toHaveBeenCalledTimes(1);
    expect(mocks.ConfigService).toHaveBeenCalledWith({
      eventBus: mocks.eventBusInstance
    });
    expect(mocks.TaskTemplateService).toHaveBeenCalledWith({
      eventBus: mocks.eventBusInstance,
      userService,
      storageAdapter: expect.any(Object)
    });
    expect(mocks.OfflineQueueService).toHaveBeenCalledWith(expect.objectContaining({
      eventBus: mocks.eventBusInstance,
      storageAdapter: expect.any(Object),
      contextResolver: expect.any(Function),
      migrators: expect.any(Array)
    }));
    expect(mocks.instances.taskServiceInstance.updateOfflineQueueService).toHaveBeenCalledWith(
      mocks.instances.offlineQueueServiceInstance
    );
    expect(mocks.instances.rewardServiceInstance.updateOfflineQueueService).toHaveBeenCalledWith(
      mocks.instances.offlineQueueServiceInstance
    );
  });

  it('离线队列默认上下文应复用统一执行态语义', async () => {
    const { serviceManager, mocks } = loadServiceManager();
    const userService = {
      getLoginUser: jest.fn(() => ({
        userId: 'parent-1',
        role: 'parent',
        familyId: 'family-1'
      })),
      getCurrentUser: jest.fn(() => ({
        userId: 'child-1',
        role: 'child',
        familyId: 'family-1'
      })),
      getCurrentUserId: jest.fn(() => 'child-1'),
      getAllUsers: jest.fn(() => [
        { userId: 'parent-1', role: 'parent', familyId: 'family-1' },
        { userId: 'child-1', role: 'child', familyId: 'family-1' }
      ])
    };

    serviceManager.setUserService(userService);
    await serviceManager.initialize();

    const contextResolver = mocks.OfflineQueueService.mock.calls[0][0].contextResolver;
    expect(contextResolver()).toEqual({
      familyId: 'family-1',
      loginUserId: 'parent-1',
      actorUserId: 'child-1',
      actorRole: 'child',
      targetUserId: 'child-1'
    });
  });

  it('重复初始化应直接返回 true 且不重复构建', async () => {
    const { serviceManager, mocks } = loadServiceManager();
    const first = await serviceManager.initialize();
    const second = await serviceManager.initialize();

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(mocks.TaskService).toHaveBeenCalledTimes(1);
  });

  it('初始化失败时应返回 false', async () => {
    const { serviceManager } = loadServiceManager({ throwTaskCtor: true });
    await expect(serviceManager.initialize()).resolves.toBe(false);
    expect(serviceManager.isInitialized).toBe(false);
  });

  it('初始化后别名查询应返回正确服务', async () => {
    const { serviceManager, mocks } = loadServiceManager();
    await serviceManager.initialize();

    expect(serviceManager.getService('task')).toBe(mocks.instances.taskServiceInstance);
    expect(serviceManager.getService('TaskService')).toBe(mocks.instances.taskServiceInstance);
    expect(serviceManager.getService('message')).toBe(mocks.instances.messageServiceInstance);
    expect(serviceManager.getService('config')).toBe(mocks.instances.configServiceInstance);
    expect(serviceManager.getService('offlineQueue')).toBe(mocks.instances.offlineQueueServiceInstance);
    expect(serviceManager.getService('taskTemplate')).toBe(mocks.instances.taskTemplateServiceInstance);
    expect(serviceManager.getService('eventBus')).toBe(mocks.eventBusInstance);
    expect(serviceManager.getService('not-exist')).toBeNull();
  });

  it('waitForInitialization 在已初始化时应立即返回 true', async () => {
    const { serviceManager } = loadServiceManager();
    await serviceManager.initialize();
    await expect(serviceManager.waitForInitialization(10)).resolves.toBe(true);
  });

  it('waitForInitialization 超时应返回 false', async () => {
    const { serviceManager } = loadServiceManager();
    await expect(serviceManager.waitForInitialization(20)).resolves.toBe(false);
  });

  it('getAnalyticsService 应支持延迟加载和缓存复用', async () => {
    const { serviceManager, mocks } = loadServiceManager();
    await serviceManager.initialize();

    const first = serviceManager.getAnalyticsService();
    const second = serviceManager.getAnalyticsService();

    expect(first).toBe(mocks.instances.analyticsServiceInstance);
    expect(second).toBe(first);
    expect(mocks.AnalyticsService).toHaveBeenCalledTimes(1);
    expect(mocks.AnalyticsService).toHaveBeenCalledWith({
      eventBus: mocks.eventBusInstance,
      starService: mocks.instances.starServiceInstance,
      taskService: mocks.instances.taskServiceInstance
    });
  });

  it('getAnalyticsService 加载失败时应返回 null', async () => {
    const { serviceManager } = loadServiceManager({ throwAnalyticsRequire: true });
    await serviceManager.initialize();
    expect(serviceManager.getAnalyticsService()).toBeNull();
  });
});
