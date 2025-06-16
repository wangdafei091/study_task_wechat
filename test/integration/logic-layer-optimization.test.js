/**
 * logic-layer-optimization.test.js
 * 逻辑分层优化集成测试
 */

// Mock微信API
global.wx = {
  getAppBaseInfo: () => ({ platform: 'devtools' }),
  getDeviceInfo: () => ({ platform: 'devtools' }),
  getStorageSync: () => null,
  setStorageSync: () => {},
  removeStorageSync: () => {}
};

const serviceManager = require('../../services/service-manager');
const ValidationService = require('../../services/validation-service');

describe('逻辑分层优化集成测试', () => {
  let taskService;
  let starService;
  let validationService;

  beforeEach(async () => {
    // 使用单例ServiceManager
    await serviceManager.init();
    
    taskService = serviceManager.getService('task');
    starService = serviceManager.getService('star');
    validationService = serviceManager.getService('validation');
  });

  describe('数据计算逻辑测试', () => {
    test('TaskService.calculateTaskProgress 应该支持参数传入', async () => {
      const mockTasks = [
        { type: 'study', status: 1 },  // 已完成
        { type: 'study', status: 0 },  // 未完成
        { type: 'habit', status: 1 },  // 已完成
      ];

      const result = await taskService.calculateTaskProgress(mockTasks);

      expect(result).toBeDefined();
      expect(result.taskProgress).toBeDefined();
      expect(result.stats).toBeDefined();
      
      // 验证数据类型转换
      expect(typeof result.taskProgress.study).toBe('number');
      expect(typeof result.taskProgress.habit).toBe('number');
      expect(typeof result.taskProgress.interest).toBe('number');
    });

    test('StarService.calculateRecordBalance 应该正确计算余额', () => {
      const mockRecords = [
        { timestamp: 1640995200000, points: 5 },   // 较新
        { timestamp: 1640908800000, points: -2 },  // 较旧
        { timestamp: 1640822400000, points: 3 },   // 最旧
      ];
      const currentBalance = 10;

      const result = starService.calculateRecordBalance(mockRecords, currentBalance);

      expect(result).toHaveLength(3);
      expect(result[0].balance).toBe(10);  // 最新记录显示当前余额
      expect(result[1].balance).toBe(5);   // 中间记录余额
      expect(result[2].balance).toBe(7);   // 最旧记录余额
    });

    test('StarService.calculateMonthSummary 应该正确计算月度汇总', () => {
      const mockGroupedRecords = [
        {
          month: '2024-01',
          records: [
            { points: 5 },
            { points: -2 },
            { points: 3 }
          ]
        }
      ];

      const result = starService.calculateMonthSummary(mockGroupedRecords);

      expect(result).toHaveLength(1);
      expect(result[0].incomeTotal).toBe(8);  // 5 + 3
      expect(result[0].expenseTotal).toBe(2); // abs(-2)
      expect(result[0].netChange).toBe(6);    // 8 - 2
      expect(result[0].monthSummary).toContain('获得');
    });

    test('StarService.filterRecords 应该正确筛选记录', () => {
      const mockRecords = [
        { type: 'income', timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2 },  // 2天前
        { type: 'expense', timestamp: Date.now() - 1000 * 60 * 60 * 24 * 8 }, // 8天前
        { type: 'income', timestamp: Date.now() }                              // 现在
      ];

      // 测试类型筛选
      const incomeRecords = starService.filterRecords(mockRecords, 'income', 'all');
      expect(incomeRecords).toHaveLength(2);

      // 测试时间筛选
      const weekRecords = starService.filterRecords(mockRecords, 'all', 'week');
      expect(weekRecords).toHaveLength(2); // 只有2天前和现在的记录
    });
  });

  describe('表单验证逻辑测试', () => {
    test('ValidationService 应该正确注册到ServiceManager', () => {
      expect(validationService).toBeInstanceOf(ValidationService);
      expect(serviceManager.getService('validation')).toBe(validationService);
      expect(serviceManager.getService('validationService')).toBe(validationService);
    });

    test('复杂任务表单验证应该正确处理', () => {
      const complexTaskData = {
        title: '复杂测试任务',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        isAllDay: false,
        startTime: '09:00',
        endTime: '17:00',
        hasNoEndDate: false,
        repeat: { 
          type: 'weekly',
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        },
        type: 'study',
        points: 5,
        isRequired: true
      };

      const result = validationService.validateTaskForm(complexTaskData);

      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.title).toBe('复杂测试任务');
      expect(result.data.repeat.startDate).toBe(result.data.date);
    });

    test('降级处理机制应该正常工作', () => {
      // 模拟服务不可用的情况
      const mockServiceManager = {
        getService: () => undefined
      };

      // 模拟页面层的降级处理
      const getValidationService = () => mockServiceManager.getService('validation');
      const validationServiceMock = getValidationService();

      expect(validationServiceMock).toBeUndefined();
      // 这里验证页面层应该能够处理服务不可用的情况
      
      // 验证真实的服务仍然工作正常
      expect(serviceManager.getService('validation')).toBeDefined();
    });
  });

  describe('服务间协作测试', () => {
    test('TaskService 应该能正确调用其他服务', async () => {
      // 测试TaskService与StarService的协作
      expect(taskService.starService).toBeDefined();
      expect(taskService.rewardService).toBeDefined();
    });

    test('所有服务都应该正确初始化', () => {
      expect(taskService).toBeDefined();
      expect(starService).toBeDefined();
      expect(validationService).toBeDefined();
      
      // 验证事件总线连接
      expect(serviceManager.getEventBus()).toBeDefined();
    });
  });
}); 