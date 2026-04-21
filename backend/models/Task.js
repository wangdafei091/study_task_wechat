/**
 * 任务数据模型
 */

const { createLogger } = require('../utils/logger');
const taskRangeGuard = require('../utils/task-range-guard');
const logger = createLogger('Task');

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

function normalizeReminder(reminder) {
  const safeReminder = reminder && typeof reminder === 'object' ? reminder : {};
  return {
    enabled: safeReminder.enabled === true,
    time: Number.isFinite(Number(safeReminder.time)) ? Number(safeReminder.time) : 0
  };
}

const TASK_TYPES = ['study', 'habit', 'interest'];
const TASK_STATUSES = [0, 1];
const STAR_EXPIRY_TYPES = ['permanent', 'week', 'month', 'quarter'];
const TASK_EXECUTION_MODES = ['planned', 'occurrence'];
const TASK_RECORD_OUTCOMES = ['none', 'success', 'failure'];

function normalizeActiveRange(activeRange, fallbackDate = '') {
  if (!activeRange || typeof activeRange !== 'object') {
    return null;
  }

  const startDate = String(activeRange.startDate || fallbackDate || '').trim();
  const hasNoEndDate = activeRange.hasNoEndDate === true;
  const endDate = hasNoEndDate ? '' : String(activeRange.endDate || '').trim();

  if (!startDate) {
    return null;
  }

  return {
    startDate,
    endDate,
    hasNoEndDate,
  };
}

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
    reminder = null,
    points = 0,
    pointsExpiry = 'permanent',
    isRequired = false,
    status = 0,
    repeat = null,
    isAllDay = false,
    penaltyApplied = false,
    penaltyDeductedPoints = 0,
    penaltyRefunded = false,
    penaltyRefundTime = null,
    createdAt = null,
    updatedAt = null,
    deletedAt = null,
    completionTime = null,
    starAwarded = false,
    modifyTime = null,
    duration = 0,
    hasNoEndDate = false,
    tags = null,
    parentTaskId = null,
    executionMode = 'planned',
    activeRange = null,
    isOccurrenceRecord = false,
    occurrenceOutcome = 'none',
    recordedAt = null,
  } = {}) {
    this.taskId = taskId;
    this.userId = userId;
    this.title = title;
    this.description = description;
    this.type = type;
    this.date = date;
    this.startTime = startTime;
    this.endTime = endTime;
    this.reminder = normalizeReminder(reminder);
    this.points = points;
    this.pointsExpiry = pointsExpiry;
    this.isRequired = isRequired;
    this.status = status;
    this.repeat = repeat;
    this.isAllDay = isAllDay;
    this.penaltyApplied = penaltyApplied;
    this.penaltyDeductedPoints = Number(penaltyDeductedPoints || 0);
    this.penaltyRefunded = Boolean(penaltyRefunded);
    this.penaltyRefundTime = penaltyRefundTime || null;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.deletedAt = deletedAt;
    this.completionTime = completionTime;
    this.starAwarded = Boolean(starAwarded);
    this.modifyTime = modifyTime;
    this.duration = duration || 0;
    this.hasNoEndDate = Boolean(hasNoEndDate);
    this.tags = tags;
    this.parentTaskId = parentTaskId || null;
    this.executionMode = TASK_EXECUTION_MODES.includes(executionMode) ? executionMode : 'planned';
    this.activeRange = normalizeActiveRange(activeRange, date);
    this.isOccurrenceRecord = Boolean(isOccurrenceRecord);
    this.occurrenceOutcome = TASK_RECORD_OUTCOMES.includes(occurrenceOutcome)
      ? occurrenceOutcome
      : 'none';
    this.recordedAt = Number(recordedAt || 0) || null;
  }

  /**
   * 从数据库记录转换为Task模型
   * @param {Object} dbRecord - 数据库记录
   * @returns {Task} Task实例
   */
  static fromDB(dbRecord) {
    const readField = (...keys) => {
      for (const key of keys) {
        if (dbRecord[key] !== undefined) {
          return dbRecord[key];
        }
      }
      return undefined;
    };

    // 安全解析repeat字段
    let repeat = null;
    const rawRepeat = readField('repeat');
    if (rawRepeat && rawRepeat !== 'null' && typeof rawRepeat === 'string') {
      try {
        repeat = JSON.parse(rawRepeat);
      } catch (e) {
        // JSON解析失败，设置为null
        logger?.warn('Task.fromDB', 'repeat字段解析失败', {
          repeatValue: rawRepeat,
          error: e.message
        });
        repeat = null;
      }
    } else if (rawRepeat && typeof rawRepeat === 'object') {
      repeat = rawRepeat;
    }

    let tags = null;
    const rawTags = readField('tags');
    if (rawTags) {
      try {
        tags = typeof rawTags === 'string' ? JSON.parse(rawTags) : rawTags;
      } catch (e) {
        tags = null;
      }
    }

    let reminder = null;
    const rawReminder = readField('reminder');
    if (rawReminder) {
      try {
        reminder = typeof rawReminder === 'string' ? JSON.parse(rawReminder) : rawReminder;
      } catch (e) {
        reminder = null;
      }
    }

    const activeRange = normalizeActiveRange({
      startDate: readField('active_start_date', 'activeStartDate'),
      endDate: readField('active_end_date', 'activeEndDate'),
      hasNoEndDate: Boolean(readField('active_has_no_end_date', 'activeHasNoEndDate'))
    }, readField('date'));

    return new Task({
      taskId: readField('task_id', 'taskId'),
      userId: readField('user_id', 'userId'),
      title: readField('title'),
      description: readField('description') || '',
      type: readField('type'),
      date: readField('date'),
      startTime: readField('start_time', 'startTime') || '',
      endTime: readField('end_time', 'endTime') || '',
      reminder,
      points: readField('points'),
      pointsExpiry: readField('points_expiry', 'pointsExpiry'),
      isRequired: Boolean(readField('is_required', 'isRequired')),
      status: readField('status'),
      repeat: repeat,
      isAllDay: Boolean(readField('is_all_day', 'isAllDay')),
      penaltyApplied: Boolean(readField('penalty_applied', 'penaltyApplied')),
      penaltyDeductedPoints: Number(readField('penalty_deducted_points', 'penaltyDeductedPoints') || 0),
      penaltyRefunded: Boolean(readField('penalty_refunded', 'penaltyRefunded')),
      penaltyRefundTime: readField('penalty_refund_time', 'penaltyRefundTime') || null,
      createdAt: readField('created_at', 'createdAt'),
      updatedAt: readField('updated_at', 'updatedAt'),
      deletedAt: readField('deleted_at', 'deletedAt') || null,
      completionTime: readField('completion_time', 'completionTime') || null,
      starAwarded: Boolean(readField('star_awarded', 'starAwarded')),
      modifyTime: readField('modify_time', 'modifyTime') || null,
      duration: readField('duration') || 0,
      hasNoEndDate: Boolean(readField('has_no_end_date', 'hasNoEndDate')),
      tags,
      parentTaskId: readField('parent_task_id', 'parentTaskId') || null,
      executionMode: readField('execution_mode', 'executionMode') || 'planned',
      activeRange,
      isOccurrenceRecord: Boolean(readField('is_occurrence_record', 'isOccurrenceRecord')),
      occurrenceOutcome: readField('occurrence_outcome', 'occurrenceOutcome') || 'none',
      recordedAt: readField('recorded_at', 'recordedAt') || null,
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
      reminder: JSON.stringify(normalizeReminder(this.reminder)),
      points: this.points,
      pointsExpiry: this.pointsExpiry,
      isRequired: this.isRequired,
      status: this.status,
      repeat: this.repeat ? JSON.stringify(this.repeat) : null,
      isAllDay: this.isAllDay,
      penaltyApplied: this.penaltyApplied,
      penalty_deducted_points: this.penaltyDeductedPoints,
      penalty_refunded: this.penaltyRefunded ? 1 : 0,
      penalty_refund_time: this.penaltyRefundTime || null,
      completion_time: this.completionTime || null,
      star_awarded: this.starAwarded ? 1 : 0,
      modify_time: this.modifyTime || null,
      duration: this.duration || 0,
      has_no_end_date: this.hasNoEndDate ? 1 : 0,
      tags: this.tags ? JSON.stringify(this.tags) : null,
      parent_task_id: this.parentTaskId || null,
      execution_mode: this.executionMode,
      active_start_date: this.activeRange?.startDate || null,
      active_end_date: this.activeRange?.hasNoEndDate ? null : (this.activeRange?.endDate || null),
      active_has_no_end_date: this.activeRange?.hasNoEndDate ? 1 : 0,
      is_occurrence_record: this.isOccurrenceRecord ? 1 : 0,
      occurrence_outcome: this.occurrenceOutcome || 'none',
      recorded_at: this.recordedAt || null,
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
      reminder: this.reminder,
      points: this.points,
      pointsExpiry: this.pointsExpiry,
      isRequired: this.isRequired,
      status: this.status,
      repeat: this.repeat,
      isAllDay: this.isAllDay,
      penaltyApplied: this.penaltyApplied,
      penaltyDeductedPoints: this.penaltyDeductedPoints,
      penaltyRefunded: this.penaltyRefunded,
      penaltyRefundTime: this.penaltyRefundTime,
      createdAt: this.createdAt,
      completionTime: this.completionTime,
      starAwarded: this.starAwarded,
      modifyTime: this.modifyTime,
      duration: this.duration,
      hasNoEndDate: this.hasNoEndDate,
      tags: this.tags,
      parentTaskId: this.parentTaskId,
      executionMode: this.executionMode,
      activeRange: this.activeRange,
      isOccurrenceRecord: this.isOccurrenceRecord,
      occurrenceOutcome: this.occurrenceOutcome,
      recordedAt: this.recordedAt,
      // deletedAt 不对外暴露
    };
  }

  isOccurrenceMode() {
    return this.executionMode === 'occurrence';
  }

  isOccurrenceConfigTask() {
    return this.isOccurrenceMode() && this.isOccurrenceRecord !== true;
  }

  isOccurrenceRecordTask() {
    return this.isOccurrenceMode() && this.isOccurrenceRecord === true;
  }

  canRecordOccurrenceOn(date) {
    if (!this.isOccurrenceConfigTask() || !date) {
      return false;
    }

    const startDate = this.activeRange?.startDate || this.date;
    const endDate = this.activeRange?.hasNoEndDate ? null : (this.activeRange?.endDate || null);

    if (startDate && date < startDate) {
      return false;
    }

    if (endDate && date > endDate) {
      return false;
    }

    return true;
  }

  applyOccurrenceOutcome(outcome, options = {}) {
    if (!this.isOccurrenceMode()) {
      return this;
    }

    const normalizedOutcome = TASK_RECORD_OUTCOMES.includes(outcome) ? outcome : 'none';
    const recordedAt = Number(options.recordedAt || Date.now());

    this.isOccurrenceRecord = true;
    this.occurrenceOutcome = normalizedOutcome;
    this.recordedAt = normalizedOutcome === 'none' ? null : recordedAt;
    this.modifyTime = recordedAt;

    if (options.date) {
      this.date = options.date;
    }

    if (normalizedOutcome === 'success') {
      this.status = 1;
      this.completionTime = recordedAt;
    } else {
      this.status = 0;
      this.completionTime = null;
    }

    return this;
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
  static validate(taskData, isUpdate = false, options = {}) {
    const errors = [];
    const errorCodes = [];

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
      if (!taskData.type || !TASK_TYPES.includes(taskData.type)) {
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
      if (!STAR_EXPIRY_TYPES.includes(taskData.pointsExpiry)) {
        errors.push('星星有效期必须为 permanent/week/month/quarter 之一');
      }
    }

    // 其他业务规则验证
    if (taskData.status !== undefined && !TASK_STATUSES.includes(taskData.status)) {
      errors.push('任务状态必须为 0（未完成）或 1（已完成）');
    }

    if (taskData.executionMode !== undefined && !TASK_EXECUTION_MODES.includes(taskData.executionMode)) {
      errors.push('executionMode 必须为 planned/occurrence 之一');
    }

    if (taskData.isRequired !== undefined && typeof taskData.isRequired !== 'boolean') {
      errors.push('isRequired必须为布尔值');
    }

    if (taskData.isAllDay !== undefined && typeof taskData.isAllDay !== 'boolean') {
      errors.push('isAllDay必须为布尔值');
    }

    const shouldValidateTimeRange = taskData.isAllDay !== true && taskData.startTime && taskData.endTime;
    if (shouldValidateTimeRange) {
      const startSeconds = parseTimeToSeconds(taskData.startTime);
      const endSeconds = parseTimeToSeconds(taskData.endTime);

      if (startSeconds !== null && endSeconds !== null && endSeconds <= startSeconds) {
        errors.push('结束时间不能早于开始时间');
      }
    }

    if (taskData.reminder !== undefined && taskData.reminder !== null) {
      if (typeof taskData.reminder !== 'object') {
        errors.push('reminder必须为对象');
      } else {
        if (taskData.reminder.enabled !== undefined && typeof taskData.reminder.enabled !== 'boolean') {
          errors.push('reminder.enabled必须为布尔值');
        }
        if (taskData.reminder.time !== undefined && Number.isNaN(Number(taskData.reminder.time))) {
          errors.push('reminder.time必须为数字');
        }
      }
    }

    if (taskData.penaltyApplied !== undefined && typeof taskData.penaltyApplied !== 'boolean') {
      errors.push('penaltyApplied必须为布尔值');
    }

    if (taskData.penaltyDeductedPoints !== undefined) {
      const penaltyDeductedPoints = Number(taskData.penaltyDeductedPoints);
      if (!Number.isInteger(penaltyDeductedPoints) || penaltyDeductedPoints < 0) {
        errors.push('penaltyDeductedPoints必须为大于等于0的整数');
      }
    }

    if (taskData.penaltyRefunded !== undefined && typeof taskData.penaltyRefunded !== 'boolean') {
      errors.push('penaltyRefunded必须为布尔值');
    }

    if (taskData.isOccurrenceRecord !== undefined && typeof taskData.isOccurrenceRecord !== 'boolean') {
      errors.push('isOccurrenceRecord必须为布尔值');
    }

    if (taskData.occurrenceOutcome !== undefined && !TASK_RECORD_OUTCOMES.includes(taskData.occurrenceOutcome)) {
      errors.push('occurrenceOutcome 必须为 none/success/failure 之一');
    }

    if (taskData.recordedAt !== undefined && Number.isNaN(Number(taskData.recordedAt))) {
      errors.push('recordedAt必须为数字');
    }

    const activeRange = normalizeActiveRange(taskData.activeRange, taskData.date);
    if (taskData.activeRange !== undefined && !activeRange) {
      errors.push('activeRange.startDate不能为空');
    }

    const resolvedExecutionMode = taskData.executionMode || 'planned';
    if (resolvedExecutionMode === 'occurrence' && taskData.isOccurrenceRecord !== true) {
      if (!isUpdate || taskData.activeRange !== undefined) {
        if (!activeRange) {
          errors.push('occurrence 配置任务必须提供有效的 activeRange');
        } else if (!activeRange.hasNoEndDate && activeRange.endDate && activeRange.endDate < activeRange.startDate) {
          errors.push('activeRange 结束日期不能早于开始日期');
        }
      }
    }

    const rangeValidation = taskRangeGuard.validateTaskRangeLimits(taskData, {
      previousTask: options.previousTask || null
    });
    if (!rangeValidation.valid) {
      errors.push(rangeValidation.message);
      errorCodes.push(rangeValidation.code);
    }

    return {
      valid: errors.length === 0,
      errors,
      errorCodes,
    };
  }
}

Task.normalizeReminder = normalizeReminder;
Task.normalizeActiveRange = normalizeActiveRange;
Task.TASK_EXECUTION_MODES = TASK_EXECUTION_MODES;
Task.TASK_RECORD_OUTCOMES = TASK_RECORD_OUTCOMES;

module.exports = Task;
