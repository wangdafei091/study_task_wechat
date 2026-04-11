/**
 * validation-service.js - 表单验证服务
 * 
 * 提供统一的表单验证逻辑，避免页面层重复的验证代码
 */

const logger = require('../utils/logger');
const taskFormCore = require('../utils/task-form-core');

class ValidationService {
  /**
   * 构造函数
   */
  constructor() {
    logger.info('ValidationService', '初始化表单验证服务');
  }

  /**
   * 验证任务表单数据
   * @param {Object} taskData 任务数据
   * @returns {Object} 验证结果 {valid: boolean, errorMsg: string, data?: Object}
   */
  validateTaskForm(taskData) {
    logger.info('ValidationService', '开始验证任务表单');
    
    // 创建验证结果对象
    const result = {
      valid: true,
      errorMsg: '',
      data: null
    };

    try {
      const validation = taskFormCore.validateTaskFormDraft(taskData, {
        scene: 'task',
        today: taskData.startDate
      });

      if (!validation.valid) {
        result.valid = false;
        result.errorMsg = validation.errorMsg;
        logger.warn('ValidationService', '共享任务表单验证失败', {
          errorMsg: validation.errorMsg
        });
        return result;
      }

      // 验证通过，组装完整的任务数据
      const validatedTaskData = this._assembleTaskData(taskData);
      result.data = validatedTaskData;
      
      logger.info('ValidationService', '任务表单验证通过');
      return result;

    } catch (error) {
      logger.error('ValidationService', '任务表单验证过程中发生错误', error);
      result.valid = false;
      result.errorMsg = '表单验证过程中发生错误';
      return result;
    }
  }

  /**
   * 验证奖励表单数据
   * @param {Object} rewardData 奖励数据
   * @returns {Object} 验证结果
   */
  validateRewardForm(rewardData) {
    logger.info('ValidationService', '开始验证奖励表单');
    
    const result = {
      valid: true,
      errorMsg: '',
      data: null
    };

    try {
      // 验证奖励名称
      if (!rewardData.name || !rewardData.name.trim()) {
        result.valid = false;
        result.errorMsg = '请输入奖励名称';
        logger.warn('ValidationService', '奖励名称验证失败');
        return result;
      }

      // 验证所需星星数
      if (!rewardData.requiredStars || rewardData.requiredStars <= 0) {
        result.valid = false;
        result.errorMsg = '请设置正确的所需星星数';
        logger.warn('ValidationService', '所需星星数验证失败');
        return result;
      }

      // 组装验证通过的数据
      result.data = {
        name: rewardData.name.trim(),
        requiredStars: parseInt(rewardData.requiredStars),
        description: rewardData.description ? rewardData.description.trim() : '',
        isActive: rewardData.isActive !== false
      };

      logger.info('ValidationService', '奖励表单验证通过');
      return result;

    } catch (error) {
      logger.error('ValidationService', '奖励表单验证过程中发生错误', error);
      result.valid = false;
      result.errorMsg = '表单验证过程中发生错误';
      return result;
    }
  }

  /**
   * 验证基本文本字段
   * @param {String} value 字段值
   * @param {String} fieldName 字段名称
   * @param {Object} options 验证选项
   * @returns {Object} 验证结果
   */
  validateTextField(value, fieldName, options = {}) {
    const {
      required = true,
      minLength = 0,
      maxLength = 200,
      trim = true
    } = options;

    const result = {
      valid: true,
      errorMsg: '',
      value: trim ? (value || '').trim() : (value || '')
    };

    // 必填检查
    if (required && !result.value) {
      result.valid = false;
      result.errorMsg = `请输入${fieldName}`;
      return result;
    }

    // 长度检查
    if (result.value.length < minLength) {
      result.valid = false;
      result.errorMsg = `${fieldName}至少需要${minLength}个字符`;
      return result;
    }

    if (result.value.length > maxLength) {
      result.valid = false;
      result.errorMsg = `${fieldName}不能超过${maxLength}个字符`;
      return result;
    }

    return result;
  }

  /**
   * 验证数字字段
   * @param {Number|String} value 字段值
   * @param {String} fieldName 字段名称
   * @param {Object} options 验证选项
   * @returns {Object} 验证结果
   */
  validateNumberField(value, fieldName, options = {}) {
    const {
      required = true,
      min = 0,
      max = Number.MAX_SAFE_INTEGER,
      integer = false
    } = options;

    const result = {
      valid: true,
      errorMsg: '',
      value: null
    };

    // 转换为数字
    const numValue = Number(value);

    // 必填检查
    if (required && (value === null || value === undefined || value === '')) {
      result.valid = false;
      result.errorMsg = `请输入${fieldName}`;
      return result;
    }

    // 数字格式检查
    if (isNaN(numValue)) {
      result.valid = false;
      result.errorMsg = `${fieldName}必须是有效的数字`;
      return result;
    }

    // 整数检查
    if (integer && !Number.isInteger(numValue)) {
      result.valid = false;
      result.errorMsg = `${fieldName}必须是整数`;
      return result;
    }

    // 范围检查
    if (numValue < min) {
      result.valid = false;
      result.errorMsg = `${fieldName}不能小于${min}`;
      return result;
    }

    if (numValue > max) {
      result.valid = false;
      result.errorMsg = `${fieldName}不能大于${max}`;
      return result;
    }

    result.value = numValue;
    return result;
  }

  /**
   * 验证日期字段
   * @param {String} dateValue 日期值
   * @param {String} fieldName 字段名称
   * @param {Object} options 验证选项
   * @returns {Object} 验证结果
   */
  validateDateField(dateValue, fieldName, options = {}) {
    const {
      required = true,
      minDate = null,
      maxDate = null
    } = options;

    const result = {
      valid: true,
      errorMsg: '',
      value: dateValue
    };

    // 必填检查
    if (required && !dateValue) {
      result.valid = false;
      result.errorMsg = `请选择${fieldName}`;
      return result;
    }

    if (dateValue) {
      // 日期格式检查
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateValue)) {
        result.valid = false;
        result.errorMsg = `${fieldName}格式不正确`;
        return result;
      }

      // 日期范围检查
      if (minDate && dateValue < minDate) {
        result.valid = false;
        result.errorMsg = `${fieldName}不能早于${minDate}`;
        return result;
      }

      if (maxDate && dateValue > maxDate) {
        result.valid = false;
        result.errorMsg = `${fieldName}不能晚于${maxDate}`;
        return result;
      }
    }

    return result;
  }

  /**
   * 组装完整的任务数据
   * @param {Object} taskData 原始任务数据
   * @returns {Object} 组装后的任务数据
   * @private
   */
  _assembleTaskData(taskData) {
    logger.info('ValidationService', '组装完整任务数据');
    const normalizedPayload = taskFormCore.buildTaskPayloadFromDraft({
      ...taskData,
      repeatType: taskData.repeat?.type || 'none',
      repeatDays: taskData.repeat?.days || [],
      reminderEnabled: taskData.reminder?.enabled,
      reminderTime: taskData.reminder?.time,
      scene: 'task'
    });
    const assembledData = {
      title: normalizedPayload.title,
      type: normalizedPayload.type,
      date: normalizedPayload.startDate,
      description: normalizedPayload.description || '',
      points: taskData.points || 0,
      pointsExpiry: normalizedPayload.pointsExpiry,
      pointsExpiryDate: taskData.pointsExpiryText || '',
      isRequired: normalizedPayload.isRequired || false,
      isAllDay: normalizedPayload.isAllDay || false,
      startTime: normalizedPayload.startTime || '',
      endTime: normalizedPayload.endTime || '',
      hasNoEndDate: normalizedPayload.hasNoEndDate || false,
      repeat: normalizedPayload.repeat || { type: 'none' },
      reminder: normalizedPayload.reminder || { enabled: false }
    };

    logger.info('ValidationService', '任务数据组装完成');
    return assembledData;
  }
}

module.exports = ValidationService; 
