const {
  deepClone,
  normalizeDateStrategy,
  normalizeTaskPayload
} = require('../utils/task-template-utils');

function normalizeTimestamp(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const parsedValue = Date.parse(value);
  if (Number.isFinite(parsedValue)) {
    return parsedValue;
  }

  return fallback;
}

class TaskTemplate {
  constructor(data = {}) {
    const now = Date.now();
    this.id = data.id || `task_tpl_${now}_${Math.floor(Math.random() * 1000)}`;
    this.familyId = data.familyId || null;
    this.name = String(data.name || '').trim();
    this.description = String(data.description || '').trim();
    this.taskPayload = normalizeTaskPayload(data.taskPayload || {}, {
      defaultDate: data.taskPayload?.startDate || data.taskPayload?.endDate
    });
    this.dateStrategy = normalizeDateStrategy(data.dateStrategy || {}, this.taskPayload);
    this.enabled = data.enabled !== false;
    this.usageCount = Number.isFinite(Number(data.usageCount)) ? Number(data.usageCount) : 0;
    this.lastUsedAt = normalizeTimestamp(data.lastUsedAt, null);
    this.createdByUserId = data.createdByUserId || null;
    this.createdAt = normalizeTimestamp(data.createdAt, now);
    this.updatedAt = normalizeTimestamp(data.updatedAt, this.createdAt || now);
  }

  validate() {
    const errors = [];

    if (!this.name) {
      errors.push('模板名称不能为空');
    }

    if (this.name.length > 100) {
      errors.push('模板名称不能超过100个字符');
    }

    if (this.description.length > 255) {
      errors.push('模板说明不能超过255个字符');
    }

    if (!this.taskPayload.title) {
      errors.push('模板任务名称不能为空');
    }

    if (this.taskPayload.repeat.type === 'custom' && this.taskPayload.repeat.days.length === 0) {
      errors.push('自定义重复模板至少选择一个星期');
    }

    if (
      this.taskPayload.hasNoEndDate !== true &&
      this.taskPayload.startDate &&
      this.taskPayload.endDate &&
      this.taskPayload.endDate < this.taskPayload.startDate
    ) {
      errors.push('模板结束日期不能早于开始日期');
    }

    return errors;
  }

  toJSON() {
    return {
      id: this.id,
      familyId: this.familyId,
      name: this.name,
      description: this.description,
      taskPayload: deepClone(this.taskPayload),
      dateStrategy: { ...this.dateStrategy },
      enabled: this.enabled,
      usageCount: this.usageCount,
      lastUsedAt: this.lastUsedAt,
      createdByUserId: this.createdByUserId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  clone(overrides = {}, generateNewId = false) {
    const nextData = {
      ...this.toJSON(),
      ...deepClone(overrides)
    };

    if (generateNewId) {
      nextData.id = `task_tpl_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      nextData.createdAt = Date.now();
      nextData.updatedAt = nextData.createdAt;
      nextData.lastUsedAt = null;
      nextData.usageCount = 0;
    }

    return new TaskTemplate(nextData);
  }
}

module.exports = TaskTemplate;
