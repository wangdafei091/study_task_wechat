/**
 * 任务数据模型
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('Task');

class Task {
  constructor({
    taskId,
    userId,
    title,
    description = '',
    type,
    date,
    startTime = '',
    endTime = '',
    points = 0,
    pointsExpiry = 'permanent',
    isRequired = false,
    status = 0,
    repeat = null,
    isAllDay = false,
    penaltyApplied = false,
    createdAt = null,
    updatedAt = null,
    deletedAt = null,
    completionTime = null,
    starAwarded = false,
    modifyTime = null,
    duration = 0,
    hasNoEndDate = false,
    tags = null,
  } = {}) {
    this.taskId = taskId;
    this.userId = userId;
    this.title = title;
    this.description = description;
    this.type = type;
    this.date = date;
    this.startTime = startTime;
    this.endTime = endTime;
    this.points = points;
    this.pointsExpiry = pointsExpiry;
    this.isRequired = isRequired;
    this.status = status;
    this.repeat = repeat;
    this.isAllDay = isAllDay;
    this.penaltyApplied = penaltyApplied;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.completionTime = completionTime;
    this.starAwarded = Boolean(starAwarded);
    this.modifyTime = modifyTime;
    this.duration = duration || 0;
    this.hasNoEndDate = Boolean(hasNoEndDate);
    this.tags = tags;
  }

  /**
   * 从数据库记录转换为Task模型
   * @param {Object} dbRecord - 数据库记录
   * @returns {Task} Task实例
   */
  static fromDB(dbRecord) {
    // 安全解析repeat字段
    let repeat = null;
    if (dbRecord.repeat && dbRecord.repeat !== 'null' && typeof dbRecord.repeat === 'string') {
      try {
        repeat = JSON.parse(dbRecord.repeat);
      } catch (e) {
        // JSON解析失败，设置为null
        logger?.warn('Task.fromDB', 'repeat字段解析失败', {
          repeatValue: dbRecord.repeat,
          error: e.message
        });
        repeat = null;
      }
    }

    let tags = null;
    if (dbRecord.tags) {
      try {
        tags = typeof dbRecord.tags === 'string' ? JSON.parse(dbRecord.tags) : dbRecord.tags;
      } catch (e) {
        tags = null;
      }
    }

    return new Task({
      taskId: dbRecord.task_id,
      userId: dbRecord.user_id,
      title: dbRecord.title,
      description: dbRecord.description || '',
      type: dbRecord.type,
      date: dbRecord.date,
      startTime: dbRecord.startTime || '',
      endTime: dbRecord.endTime || '',
      points: dbRecord.points,
      pointsExpiry: dbRecord.pointsExpiry,
      isRequired: dbRecord.isRequired,
      status: dbRecord.status,
      repeat: repeat,
      isAllDay: dbRecord.isAllDay,
      penaltyApplied: dbRecord.penaltyApplied,
      createdAt: dbRecord.created_at,
      updatedAt: dbRecord.updated_at,
      deletedAt: dbRecord.deleted_at || null,
      completionTime: dbRecord.completion_time || null,
      starAwarded: Boolean(dbRecord.star_awarded),
      modifyTime: dbRecord.modify_time || null,
      duration: dbRecord.duration || 0,
      hasNoEndDate: Boolean(dbRecord.has_no_end_date),
      tags,
    });
  }

  /**
   * 转换为数据库格式
   * @returns {Object} 数据库记录
   */
  toDB() {
    return {
      task_id: this.taskId,
      user_id: this.userId,
      title: this.title,
      description: this.description,
      type: this.type,
      date: this.date,
      startTime: this.startTime,
      endTime: this.endTime,
      points: this.points,
      pointsExpiry: this.pointsExpiry,
      isRequired: this.isRequired,
      status: this.status,
      repeat: this.repeat ? JSON.stringify(this.repeat) : null,
      isAllDay: this.isAllDay,
      penaltyApplied: this.penaltyApplied,
      completion_time: this.completionTime || null,
      star_awarded: this.starAwarded ? 1 : 0,
      modify_time: this.modifyTime || null,
      duration: this.duration || 0,
      has_no_end_date: this.hasNoEndDate ? 1 : 0,
      tags: this.tags ? JSON.stringify(this.tags) : null,
    };
  }

  /**
   * 转换为API响应格式
   * @returns {Object} API响应对象
   */
  toJSON() {
    return {
      taskId: this.taskId,
      userId: this.userId,
      title: this.title,
      description: this.description,
      type: this.type,
      date: this.date,
      startTime: this.startTime,
      endTime: this.endTime,
      points: this.points,
      pointsExpiry: this.pointsExpiry,
      isRequired: this.isRequired,
      status: this.status,
      repeat: this.repeat,
      isAllDay: this.isAllDay,
      penaltyApplied: this.penaltyApplied,
      createdAt: this.createdAt,
      completionTime: this.completionTime,
      starAwarded: this.starAwarded,
      modifyTime: this.modifyTime,
      duration: this.duration,
      hasNoEndDate: this.hasNoEndDate,
      tags: this.tags,
      // deletedAt 不对外暴露
    };
  }

  /**
   * 生成任务ID（UUID）
   * @returns {string} UUID
   */
  static generateId() {
    return require('crypto').randomBytes(16).toString('hex');
  }

  /**
   * 参数验证
   * @param {Object} taskData - 任务数据
   * @param {Boolean} isUpdate - 是否为更新操作
   * @returns {Object} 验证结果 { valid: boolean, errors: string[] }
   */
  static validate(taskData, isUpdate = false) {
    const errors = [];

    // 如果是更新操作，允许部分字段为空
    const isPartialUpdate = isUpdate && Object.keys(taskData).length > 0;

    if (taskData.title !== undefined) {
      if (!taskData.title || taskData.title.trim() === '') {
        errors.push('任务标题不能为空');
      }
    } else if (!isUpdate) {
      errors.push('任务标题不能为空');
    }

    if (taskData.type !== undefined) {
      if (!taskData.type || !['study', 'habit', 'interest'].includes(taskData.type)) {
        errors.push('任务类型必须为 study/habit/interest 之一');
      }
    } else if (!isUpdate) {
      errors.push('任务类型不能为空');
    }

    if (taskData.date !== undefined) {
      if (!taskData.date) {
        errors.push('任务日期不能为空');
      }
    } else if (!isUpdate) {
      errors.push('任务日期不能为空');
    }

    if (taskData.points !== undefined) {
      if (taskData.points < 0 || taskData.points > 100) {
        errors.push('星星数必须在0-100之间');
      }
    }

    if (taskData.pointsExpiry !== undefined) {
      if (!['permanent', 'week', 'month', 'quarter'].includes(taskData.pointsExpiry)) {
        errors.push('星星有效期必须为 permanent/week/month/quarter 之一');
      }
    }

    // 其他业务规则验证
    if (taskData.status !== undefined && ![0, 1].includes(taskData.status)) {
      errors.push('任务状态必须为 0（未完成）或 1（已完成）');
    }

    if (taskData.isRequired !== undefined && typeof taskData.isRequired !== 'boolean') {
      errors.push('isRequired必须为布尔值');
    }

    if (taskData.isAllDay !== undefined && typeof taskData.isAllDay !== 'boolean') {
      errors.push('isAllDay必须为布尔值');
    }

    if (taskData.penaltyApplied !== undefined && typeof taskData.penaltyApplied !== 'boolean') {
      errors.push('penaltyApplied必须为布尔值');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

module.exports = Task;
