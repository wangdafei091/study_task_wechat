const BaseRepository = require('./base-repository');
const TaskTemplate = require('../models/task-template');
const logger = require('../utils/logger');
const { buildTemplateSearchText } = require('../utils/task-template-utils');

class TaskTemplateRepository extends BaseRepository {
  constructor(storageAdapter, options = {}) {
    const storageKey = options.storageKey || 'taskTemplates';
    super(storageKey, TaskTemplate, {
      storageAdapter,
      namespace: options.namespace || '',
      useCache: options.useCache !== false,
      cacheExpiry: options.cacheExpiry || 60000,
      cacheTTL: options.cacheTTL || 10000
    });

    logger.info('TaskTemplateRepository', '初始化任务模板仓储');
  }

  async replaceAll(templates = []) {
    const models = Array.isArray(templates)
      ? templates.map((template) => new TaskTemplate(template))
      : [];

    await this._saveData(models);
    return this.getAll(false);
  }

  async getTemplates(options = {}) {
    const {
      keyword = '',
      type = 'all',
      status = 'all',
      enabledOnly = false,
      sortBy = 'recent'
    } = options;

    const templates = await this.getAll();
    const normalizedKeyword = String(keyword || '').trim().toLowerCase();

    const filtered = templates.filter((template) => {
      if (enabledOnly && template.enabled !== true) {
        return false;
      }

      if (status === 'enabled' && template.enabled !== true) {
        return false;
      }

      if (status === 'disabled' && template.enabled !== false) {
        return false;
      }

      if (type && type !== 'all' && template.taskPayload?.type !== type) {
        return false;
      }

      if (normalizedKeyword && !buildTemplateSearchText(template).includes(normalizedKeyword)) {
        return false;
      }

      return true;
    });

    return filtered.sort((left, right) => this._compareTemplates(left, right, sortBy));
  }

  async getRecentTemplates(limit = 5) {
    const templates = await this.getTemplates({
      enabledOnly: true,
      sortBy: 'recent'
    });

    return templates.slice(0, limit);
  }

  _compareTemplates(left, right, sortBy) {
    const leftLastUsed = Number(left.lastUsedAt || 0);
    const rightLastUsed = Number(right.lastUsedAt || 0);
    const leftUsageCount = Number(left.usageCount || 0);
    const rightUsageCount = Number(right.usageCount || 0);
    const leftUpdatedAt = Number(left.updatedAt || 0);
    const rightUpdatedAt = Number(right.updatedAt || 0);

    if (sortBy === 'usage') {
      if (rightUsageCount !== leftUsageCount) {
        return rightUsageCount - leftUsageCount;
      }
      if (rightLastUsed !== leftLastUsed) {
        return rightLastUsed - leftLastUsed;
      }
      return rightUpdatedAt - leftUpdatedAt;
    }

    if (rightLastUsed !== leftLastUsed) {
      return rightLastUsed - leftLastUsed;
    }

    if (rightUpdatedAt !== leftUpdatedAt) {
      return rightUpdatedAt - leftUpdatedAt;
    }

    return rightUsageCount - leftUsageCount;
  }
}

module.exports = TaskTemplateRepository;
