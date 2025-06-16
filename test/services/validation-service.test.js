/**
 * validation-service.test.js
 * ValidationService 单元测试
 */

const ValidationService = require('../../services/validation-service');

describe('ValidationService', () => {
  let validationService;

  beforeEach(() => {
    validationService = new ValidationService();
  });

  describe('validateTaskForm', () => {
    test('应该验证通过完整的任务数据', () => {
      const taskData = {
        title: '测试任务',
        startDate: '2024-01-01',
        isAllDay: true,
        type: 'study',
        description: '测试描述',
        points: 5,
        pointsExpiry: 'week',
        isRequired: false,
        hasNoEndDate: true,
        repeat: { type: 'none' },
        reminder: { enabled: false }
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.title).toBe('测试任务');
    });

    test('应该验证失败当任务标题为空时', () => {
      const taskData = {
        title: '',
        startDate: '2024-01-01',
        isAllDay: true
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入任务标题');
    });

    test('应该验证失败当开始日期为空时', () => {
      const taskData = {
        title: '测试任务',
        startDate: '',
        isAllDay: true
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请选择开始日期');
    });

    test('应该验证失败当非全天任务缺少时间时', () => {
      const taskData = {
        title: '测试任务',
        startDate: '2024-01-01',
        isAllDay: false,
        startTime: '',
        endTime: ''
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请设置开始和结束时间');
    });
  });

  describe('validateRewardForm', () => {
    test('应该验证通过完整的奖励数据', () => {
      const rewardData = {
        name: '测试奖励',
        requiredStars: 10,
        description: '测试描述',
        isActive: true
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.name).toBe('测试奖励');
      expect(result.data.requiredStars).toBe(10);
    });

    test('应该验证失败当奖励名称为空时', () => {
      const rewardData = {
        name: '',
        requiredStars: 10
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入奖励名称');
    });

    test('应该验证失败当所需星星数无效时', () => {
      const rewardData = {
        name: '测试奖励',
        requiredStars: 0
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请设置正确的所需星星数');
    });
  });

  describe('validateTextField', () => {
    test('应该验证通过有效的文本字段', () => {
      const result = validationService.validateTextField('测试文本', '测试字段');

      expect(result.valid).toBe(true);
      expect(result.value).toBe('测试文本');
    });

    test('应该验证失败当必填字段为空时', () => {
      const result = validationService.validateTextField('', '测试字段', { required: true });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入测试字段');
    });

    test('应该验证失败当文本超过最大长度时', () => {
      const longText = 'a'.repeat(201);
      const result = validationService.validateTextField(longText, '测试字段', { maxLength: 200 });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段不能超过200个字符');
    });
  });

  describe('validateNumberField', () => {
    test('应该验证通过有效的数字字段', () => {
      const result = validationService.validateNumberField(42, '测试数字');

      expect(result.valid).toBe(true);
      expect(result.value).toBe(42);
    });

    test('应该验证失败当数字小于最小值时', () => {
      const result = validationService.validateNumberField(-1, '测试数字', { min: 0 });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试数字不能小于0');
    });

    test('应该验证失败当数字格式无效时', () => {
      const result = validationService.validateNumberField('abc', '测试数字');

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试数字必须是有效的数字');
    });
  });

  describe('validateDateField', () => {
    test('应该验证通过有效的日期字段', () => {
      const result = validationService.validateDateField('2024-01-01', '测试日期');

      expect(result.valid).toBe(true);
      expect(result.value).toBe('2024-01-01');
    });

    test('应该验证失败当日期格式无效时', () => {
      const result = validationService.validateDateField('2024/01/01', '测试日期');

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试日期格式不正确');
    });

    test('应该验证失败当日期早于最小日期时', () => {
      const result = validationService.validateDateField('2024-01-01', '测试日期', { minDate: '2024-01-02' });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试日期不能早于2024-01-02');
    });
  });
}); 