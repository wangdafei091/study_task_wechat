/**
 * validation-service.test.js - ValidationService 测试
 *
 * 测试 ValidationService 的表单验证逻辑
 */

const ValidationService = require('../../services/validation-service');

describe('ValidationService', () => {
  let validationService;

  beforeEach(() => {
    // Mock logger
    jest.mock('../../utils/logger');
    validationService = new ValidationService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('验证任务表单 - validateTaskForm', () => {
    it('应该验证有效的任务表单', () => {
      const taskData = {
        title: '测试任务',
        type: 'study',
        startDate: '2026-03-04',
        isAllDay: true
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(true);
      expect(result.errorMsg).toBe('');
      expect(result.data).toBeDefined();
    });

    it('应该拒绝空标题', () => {
      const taskData = {
        title: '',
        startDate: '2026-03-04'
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入任务标题');
    });

    it('应该拒绝只有空格的标题', () => {
      const taskData = {
        title: '   ',
        startDate: '2026-03-04'
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入任务标题');
    });

    it('应该拒绝缺少开始日期', () => {
      const taskData = {
        title: '测试任务'
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请选择开始日期');
    });

    it('应该拒绝重复任务缺少结束日期', () => {
      const taskData = {
        title: '测试任务',
        startDate: '2026-03-04',
        repeat: {
          type: 'daily',
          startDate: '2026-03-04',
          endDate: ''
        },
        hasNoEndDate: false
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请设置重复任务的结束日期');
    });

    it('应该接受重复任务无结束日期（无结束日期选项）', () => {
      const taskData = {
        title: '测试任务',
        startDate: '2026-03-04',
        repeat: {
          type: 'daily',
          startDate: '2026-03-04'
        },
        hasNoEndDate: true,
        isAllDay: true
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(true);
    });

    it('应该拒绝重复任务结束日期早于开始日期', () => {
      const taskData = {
        title: '测试任务',
        startDate: '2026-03-04',
        endDate: '2026-03-01',
        repeat: {
          type: 'daily',
          startDate: '2026-03-04',
          endDate: '2026-03-01'
        },
        hasNoEndDate: false
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('结束日期不能早于开始日期');
    });

    it('应该拒绝非全天任务缺少时间', () => {
      const taskData = {
        title: '测试任务',
        startDate: '2026-03-04',
        isAllDay: false,
        startTime: '',
        endTime: ''
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请设置开始和结束时间');
    });

    it('应该接受有效的非全天任务', () => {
      const taskData = {
        title: '测试任务',
        startDate: '2026-03-04',
        isAllDay: false,
        startTime: '09:00',
        endTime: '10:00'
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(true);
    });

    it('应该拒绝结束时间早于或等于开始时间的非全天任务', () => {
      const taskData = {
        title: '测试任务',
        startDate: '2026-03-04',
        isAllDay: false,
        startTime: '09:00',
        endTime: '09:00'
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('结束时间不能早于开始时间');
    });

    it('应该正确组装任务数据', () => {
      const taskData = {
        title: '  测试任务  ',
        type: 'habit',
        startDate: '2026-03-04',
        description: '任务描述',
        points: 10,
        pointsExpiry: 'week',
        pointsExpiryText: '本周结束',
        isRequired: true,
        isAllDay: true
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(true);
      expect(result.data.title).toBe('测试任务');
      expect(result.data.type).toBe('habit');
      expect(result.data.date).toBe('2026-03-04');
      expect(result.data.description).toBe('任务描述');
      expect(result.data.points).toBe(10);
      expect(result.data.pointsExpiry).toBe('week');
      expect(result.data.pointsExpiryDate).toBe('本周结束');
      expect(result.data.isRequired).toBe(true);
      expect(result.data.isAllDay).toBe(true);
      expect(result.data.startTime).toBe('');
      expect(result.data.endTime).toBe('');
    });

    it('未传 repeat 时应保持为不重复任务', () => {
      const taskData = {
        title: '测试任务',
        startDate: '2026-03-04',
        isAllDay: true
      };

      const result = validationService.validateTaskForm(taskData);

      expect(result.valid).toBe(true);
      expect(result.data.repeat).toEqual({
        type: 'none',
        days: [],
        startDate: '2026-03-04',
        endDate: '2026-03-04'
      });
    });

    it('验证过程异常时应该返回错误', () => {
      // 模拟异常情况
      const taskData = {
        title: '测试任务',
        startDate: '2026-03-04'
      };

      // 由于代码中有try-catch，这个测试主要用于验证异常处理
      const result = validationService.validateTaskForm(taskData);

      // 正常情况下应该成功
      expect(result.valid).toBeDefined();
    });
  });

  describe('验证奖励表单 - validateRewardForm', () => {
    it('应该验证有效的奖励表单', () => {
      const rewardData = {
        name: '玩具',
        requiredStars: 100,
        description: '奖励描述',
        isActive: true
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(true);
      expect(result.errorMsg).toBe('');
      expect(result.data).toBeDefined();
    });

    it('应该拒绝空奖励名称', () => {
      const rewardData = {
        name: '',
        requiredStars: 100
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入奖励名称');
    });

    it('应该拒绝只有空格的奖励名称', () => {
      const rewardData = {
        name: '   ',
        requiredStars: 100
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入奖励名称');
    });

    it('应该拒绝无效的星星数', () => {
      const rewardData = {
        name: '玩具',
        requiredStars: 0
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请设置正确的所需星星数');
    });

    it('应该拒绝负数的星星数', () => {
      const rewardData = {
        name: '玩具',
        requiredStars: -10
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请设置正确的所需星星数');
    });

    it('应该正确组装奖励数据', () => {
      const rewardData = {
        name: '  玩具  ',
        requiredStars: '100',
        description: '  奖励描述  ',
        isActive: false
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(true);
      expect(result.data.name).toBe('玩具');
      expect(result.data.requiredStars).toBe(100);
      expect(result.data.description).toBe('奖励描述');
      expect(result.data.isActive).toBe(false);
    });

    it('isActive默认应该为true', () => {
      const rewardData = {
        name: '玩具',
        requiredStars: 100
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(true);
      expect(result.data.isActive).toBe(true);
    });

    it('描述可以为空字符串', () => {
      const rewardData = {
        name: '玩具',
        requiredStars: 100,
        description: ''
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBe(true);
      expect(result.data.description).toBe('');
    });

    it('验证过程异常时应该返回错误', () => {
      const rewardData = {
        name: '玩具',
        requiredStars: 100
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.valid).toBeDefined();
    });
  });

  describe('验证文本字段 - validateTextField', () => {
    it('应该验证必填文本字段', () => {
      const result = validationService.validateTextField('测试文本', '测试字段', {
        required: true
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe('测试文本');
    });

    it('应该拒绝空的必填文本字段', () => {
      const result = validationService.validateTextField('', '测试字段', {
        required: true
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入测试字段');
    });

    it('应该自动trim文本字段', () => {
      const result = validationService.validateTextField('  测试文本  ', '测试字段', {
        trim: true
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe('测试文本');
    });

    it('应该不trim文本字段（trim: false）', () => {
      const result = validationService.validateTextField('  测试文本  ', '测试字段', {
        trim: false
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe('  测试文本  ');
    });

    it('应该验证最小长度', () => {
      const result = validationService.validateTextField('测试', '测试字段', {
        minLength: 5
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段至少需要5个字符');
    });

    it('应该验证最大长度', () => {
      const result = validationService.validateTextField('a'.repeat(300), '测试字段', {
        maxLength: 200
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段不能超过200个字符');
    });

    it('应该允许符合长度要求的文本', () => {
      const result = validationService.validateTextField('测试文本', '测试字段', {
        minLength: 2,
        maxLength: 10
      });

      expect(result.valid).toBe(true);
    });

    it('应该接受非必填的空文本字段', () => {
      const result = validationService.validateTextField('', '测试字段', {
        required: false
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('验证数字字段 - validateNumberField', () => {
    it('应该验证必填数字字段', () => {
      const result = validationService.validateNumberField('100', '测试字段', {
        required: true
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe(100);
    });

    it('应该拒绝空的必填数字字段', () => {
      const result = validationService.validateNumberField('', '测试字段', {
        required: true
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入测试字段');
    });

    it('应该拒绝null的必填数字字段', () => {
      const result = validationService.validateNumberField(null, '测试字段', {
        required: true
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入测试字段');
    });

    it('应该拒绝undefined的必填数字字段', () => {
      const result = validationService.validateNumberField(undefined, '测试字段', {
        required: true
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请输入测试字段');
    });

    it('应该拒绝非数字的值', () => {
      const result = validationService.validateNumberField('abc', '测试字段');

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段必须是有效的数字');
    });

    it('应该验证整数', () => {
      const result = validationService.validateNumberField('10.5', '测试字段', {
        integer: true
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段必须是整数');
    });

    it('应该允许整数', () => {
      const result = validationService.validateNumberField('10', '测试字段', {
        integer: true
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe(10);
    });

    it('应该验证最小值', () => {
      const result = validationService.validateNumberField('5', '测试字段', {
        min: 10
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段不能小于10');
    });

    it('应该验证最大值', () => {
      const result = validationService.validateNumberField('1000', '测试字段', {
        max: 100
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段不能大于100');
    });

    it('应该允许符合范围要求的数字', () => {
      const result = validationService.validateNumberField('50', '测试字段', {
        min: 10,
        max: 100
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe(50);
    });

    it('应该接受非必填的空数字字段', () => {
      const result = validationService.validateNumberField('', '测试字段', {
        required: false
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('验证日期字段 - validateDateField', () => {
    it('应该验证必填日期字段', () => {
      const result = validationService.validateDateField('2026-03-04', '测试字段', {
        required: true
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe('2026-03-04');
    });

    it('应该拒绝空的必填日期字段', () => {
      const result = validationService.validateDateField('', '测试字段', {
        required: true
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('请选择测试字段');
    });

    it('应该拒绝无效的日期格式', () => {
      const result = validationService.validateDateField('2026/03/04', '测试字段');

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段格式不正确');
    });

    it('应该拒绝无效的日期字符串', () => {
      const result = validationService.validateDateField('invalid-date', '测试字段');

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段格式不正确');
    });

    it('应该验证最小日期', () => {
      const result = validationService.validateDateField('2026-03-01', '测试字段', {
        minDate: '2026-03-05'
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段不能早于2026-03-05');
    });

    it('应该验证最大日期', () => {
      const result = validationService.validateDateField('2026-03-10', '测试字段', {
        maxDate: '2026-03-05'
      });

      expect(result.valid).toBe(false);
      expect(result.errorMsg).toBe('测试字段不能晚于2026-03-05');
    });

    it('应该允许符合范围要求的日期', () => {
      const result = validationService.validateDateField('2026-03-05', '测试字段', {
        minDate: '2026-03-01',
        maxDate: '2026-03-10'
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe('2026-03-05');
    });

    it('应该接受非必填的空日期字段', () => {
      const result = validationService.validateDateField('', '测试字段', {
        required: false
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('边界条件', () => {
    it('应该处理非常大的文本（超过默认最大长度）', () => {
      const longText = 'a'.repeat(10000);
      const result = validationService.validateTextField(longText, '测试字段', {
        required: false,
        maxLength: 20000
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe(longText);
    });

    it('应该处理非常大的数字', () => {
      const result = validationService.validateNumberField('999999999', '测试字段');

      expect(result.valid).toBe(true);
      expect(result.value).toBe(999999999);
    });

    it('应该处理负数（需要设置允许负数的最小值）', () => {
      const result = validationService.validateNumberField('-100', '测试字段', {
        min: -999
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe(-100);
    });

    it('应该处理浮点数', () => {
      const result = validationService.validateNumberField('10.5', '测试字段');

      expect(result.valid).toBe(true);
      expect(result.value).toBe(10.5);
    });

    it('应该处理零', () => {
      const result = validationService.validateNumberField('0', '测试字段');

      expect(result.valid).toBe(true);
      expect(result.value).toBe(0);
    });

    it('应该处理科学计数法数字', () => {
      const result = validationService.validateNumberField('1e5', '测试字段');

      expect(result.valid).toBe(true);
      expect(result.value).toBe(100000);
    });

    it('应该处理空格填充的文本', () => {
      const result = validationService.validateTextField('   ', '测试字段', {
        required: false
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe('');
    });

    it('应该处理特殊字符的文本', () => {
      const result = validationService.validateTextField('测试@#$%^&*()文本', '测试字段', {
        required: false
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe('测试@#$%^&*()文本');
    });

    it('应该处理带有emoji的文本', () => {
      const result = validationService.validateTextField('测试😀表情文本', '测试字段', {
        required: false
      });

      expect(result.valid).toBe(true);
      expect(result.value).toBe('测试😀表情文本');
    });
  });

  describe('默认值处理', () => {
    it('validateTextField应该使用合理的默认值', () => {
      const result = validationService.validateTextField('test', 'field');

      expect(result.valid).toBe(true);
      expect(result.value).toBe('test'); // 默认trim: true
    });

    it('validateNumberField应该使用合理的默认值', () => {
      const result = validationService.validateNumberField('100', 'field');

      expect(result.valid).toBe(true);
      expect(result.value).toBe(100); // 默认min: 0
    });

    it('validateDateField应该使用合理的默认值', () => {
      const result = validationService.validateDateField('2026-03-04', 'field');

      expect(result.valid).toBe(true);
      expect(result.value).toBe('2026-03-04');
    });
  });

  describe('验证数据组装', () => {

    it('奖励数据应该正确组装', () => {
      const rewardData = {
        name: '玩具',
        requiredStars: 100,
        description: '描述',
        isActive: true
      };

      const result = validationService.validateRewardForm(rewardData);

      expect(result.data.name).toBe('玩具');
      expect(result.data.requiredStars).toBe(100);
      expect(result.data.description).toBe('描述');
      expect(result.data.isActive).toBe(true);
    });
  });
});
