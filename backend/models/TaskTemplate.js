const taskRangeGuard = require('../utils/task-range-guard');

class TaskTemplate {
  constructor({
    templateId,
    familyId,
    name,
    description = '',
    taskPayload = {},
    dateStrategy = {},
    enabled = true,
    usageCount = 0,
    lastUsedAt = null,
    createdByUserId = null,
    createdAt = null,
    updatedAt = null
  } = {}) {
    this.templateId = templateId;
    this.familyId = familyId;
    this.name = name;
    this.description = description || '';
    this.taskPayload = taskPayload || {};
    this.dateStrategy = dateStrategy || {};
    this.enabled = Boolean(enabled);
    this.usageCount = Number(usageCount || 0);
    this.lastUsedAt = lastUsedAt ? Number(lastUsedAt) : null;
    this.createdByUserId = createdByUserId || null;
    this.createdAt = createdAt || null;
    this.updatedAt = updatedAt || null;
  }

  static fromDB(record) {
    let taskPayload = {};
    let dateStrategy = {};

    try {
      taskPayload = record.task_payload
        ? (typeof record.task_payload === 'string' ? JSON.parse(record.task_payload) : record.task_payload)
        : {};
    } catch (error) {
      taskPayload = {};
    }

    try {
      dateStrategy = record.date_strategy
        ? (typeof record.date_strategy === 'string' ? JSON.parse(record.date_strategy) : record.date_strategy)
        : {};
    } catch (error) {
      dateStrategy = {};
    }

    return new TaskTemplate({
      templateId: record.template_id,
      familyId: record.family_id,
      name: record.name,
      description: record.description || '',
      taskPayload,
      dateStrategy,
      enabled: Boolean(record.enabled),
      usageCount: Number(record.usage_count || 0),
      lastUsedAt: record.last_used_at || null,
      createdByUserId: record.created_by_user_id || null,
      createdAt: record.created_at || null,
      updatedAt: record.updated_at || null
    });
  }

  toJSON() {
    return {
      id: this.templateId,
      templateId: this.templateId,
      familyId: this.familyId,
      name: this.name,
      description: this.description,
      taskPayload: this.taskPayload,
      dateStrategy: this.dateStrategy,
      enabled: this.enabled,
      usageCount: this.usageCount,
      lastUsedAt: this.lastUsedAt,
      createdByUserId: this.createdByUserId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  validate(options = {}) {
    const errors = [];

    if (!this.name) {
      errors.push('模板名称不能为空');
    }
    if (this.name && this.name.length > 100) {
      errors.push('模板名称不能超过100个字符');
    }
    if ((this.description || '').length > 255) {
      errors.push('模板说明不能超过255个字符');
    }
    if (!this.taskPayload?.title) {
      errors.push('模板任务名称不能为空');
    }
    if (
      this.taskPayload?.repeat?.type === 'custom' &&
      (!Array.isArray(this.taskPayload.repeat.days) || this.taskPayload.repeat.days.length === 0)
    ) {
      errors.push('自定义重复模板至少选择一个星期');
    }
    if (
      this.taskPayload?.hasNoEndDate !== true &&
      this.taskPayload?.startDate &&
      this.taskPayload?.endDate &&
      this.taskPayload.endDate < this.taskPayload.startDate
    ) {
      errors.push('模板结束日期不能早于开始日期');
    }

    const rangeValidation = taskRangeGuard.validateTemplateRangeLimits(this.toJSON(), {
      previousTemplate: options.previousTemplate || null
    });
    if (!rangeValidation.valid) {
      errors.push(rangeValidation.message);
    }

    return errors;
  }

  static generateId() {
    return require('crypto').randomBytes(16).toString('hex');
  }
}

module.exports = TaskTemplate;
