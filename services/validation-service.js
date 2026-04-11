/**
 * validation-service.js - 表单验证服务
 * 
 * 提供统一的表单验证逻辑，避免页面层重复的验证代码
 */

const logger = require('../utils/logger');

function parseTimeToSeconds(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    Number.isNaN(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

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
      // 验证标题
      if (!taskData.title || !taskData.title.trim()) {
        result.valid = false;
        result.errorMsg = '请输入任务标题';
        logger.warn('ValidationService', '任务标题验证失败');
        return result;
      }

      // 验证日期
      if (!taskData.startDate) {
        result.valid = false;
        result.errorMsg = '请选择开始日期';
        logger.warn('ValidationService', '开始日期验证失败');
        return result;
      }

      // 验证重复任务的结束日期
      if (taskData.repeat && taskData.repeat.type !== 'none') {
        // 如果是重复任务，且没有勾选"无结束日期"，必须设置结束日期
        if (!taskData.hasNoEndDate && !taskData.endDate) {
          result.valid = false;
          result.errorMsg = '请设置重复任务的结束日期';
          logger.warn('ValidationService', '重复任务结束日期验证失败');
          return result;
        }
        
        // 如果设置了结束日期，确保结束日期不早于开始日期
        if (taskData.endDate && taskData.endDate < taskData.startDate) {
          result.valid = false;
          result.errorMsg = '结束日期不能早于开始日期';
          logger.warn('ValidationService', '结束日期早于开始日期');
          return result;
        }
      }

      // 验证时间
      if (!taskData.isAllDay && (!taskData.startTime || !taskData.endTime)) {
        result.valid = false;
        result.errorMsg = '请设置开始和结束时间';
        logger.warn('ValidationService', '任务时间验证失败');
        return result;
      }

      if (this._hasInvalidTimeRange(taskData.startTime, taskData.endTime, taskData.isAllDay)) {
        result.valid = false;
        result.errorMsg = '结束时间不能早于开始时间';
        logger.warn('ValidationService', '任务时间范围验证失败', {
          startTime: taskData.startTime,
          endTime: taskData.endTime
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
    
    const assembledData = {
      title: taskData.title.trim(),
      type: taskData.type,
      date: taskData.startDate,
      description: taskData.description || '',
      points: taskData.points || 0,
      pointsExpiry: taskData.pointsExpiry,
      pointsExpiryDate: taskData.pointsExpiryText || '',
      isRequired: taskData.isRequired || false,
      isAllDay: taskData.isAllDay || false,
      startTime: taskData.isAllDay ? '' : (taskData.startTime || ''),
      endTime: taskData.isAllDay ? '' : (taskData.endTime || ''),
      hasNoEndDate: taskData.hasNoEndDate || false,
      repeat: taskData.repeat || { type: 'none' },
      reminder: taskData.reminder || { enabled: false }
    };

    // 确保重复任务的开始和结束日期与主任务一致
    if (assembledData.repeat.startDate !== assembledData.date) {
      logger.info('ValidationService', '修正重复任务开始日期与主任务保持一致');
      assembledData.repeat.startDate = assembledData.date;
    }

    // 确保endDate字段和repeat.endDate字段一致
    if (!assembledData.hasNoEndDate && taskData.endDate) {
      if (assembledData.repeat.endDate !== taskData.endDate) {
        logger.info('ValidationService', '修正重复任务结束日期与主任务保持一致');
        assembledData.repeat.endDate = taskData.endDate;
      }
    }

    logger.info('ValidationService', '任务数据组装完成');
    return assembledData;
  }

  _hasInvalidTimeRange(startTime, endTime, isAllDay) {
    if (isAllDay || !startTime || !endTime) {
      return false;
    }

    const startSeconds = parseTimeToSeconds(startTime);
    const endSeconds = parseTimeToSeconds(endTime);

    if (startSeconds === null || endSeconds === null) {
      return false;
    }

    return endSeconds <= startSeconds;
  }
}

module.exports = ValidationService; 
