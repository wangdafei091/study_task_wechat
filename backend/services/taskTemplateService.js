const { query, getPool } = require('../config/database');
const { createLogger } = require('../utils/logger');
const TaskTemplate = require('../models/TaskTemplate');
const {
  buildTemplateSearchText,
  normalizeDateStrategy,
  normalizeTaskPayload
} = require('../utils/task-template-utils');

const logger = createLogger('TaskTemplateService');

class TaskTemplateService {
  async listTemplates(familyId, options = {}) {
    if (!familyId) {
      return [];
    }

    const rows = await query(
      `SELECT *
       FROM task_templates
       WHERE family_id = ?
         AND deleted_at IS NULL`,
      [familyId]
    );

    const templates = rows
      .map((row) => this._safeTemplateFromDB(row, 'listTemplates'))
      .filter(Boolean);
    const keyword = String(options.keyword || '').trim().toLowerCase();
    const type = options.type || 'all';
    const status = options.status || 'all';
    const enabledOnly = options.enabledOnly === true;
    const sortBy = options.sortBy || 'recent';

    return templates
      .filter((template) => {
        if (enabledOnly && template.enabled !== true) {
          return false;
        }
        if (status === 'enabled' && template.enabled !== true) {
          return false;
        }
        if (status === 'disabled' && template.enabled !== false) {
          return false;
        }
        if (type !== 'all' && template.taskPayload?.type !== type) {
          return false;
        }
        if (keyword && !buildTemplateSearchText(template.toJSON()).includes(keyword)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => this._compareTemplates(left, right, sortBy));
  }

  async getTemplateById(templateId, familyId) {
    const rows = await query(
      `SELECT *
       FROM task_templates
       WHERE template_id = ?
         AND family_id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
      [templateId, familyId]
    );

    if (rows.length === 0) {
      return null;
    }

    return this._safeTemplateFromDB(rows[0], 'getTemplateById');
  }

  async createTemplate(familyId, operatorUserId, input = {}) {
    const payload = normalizeTaskPayload(input.taskPayload || {});
    const dateStrategy = normalizeDateStrategy(input.dateStrategy || {}, payload);
    const template = new TaskTemplate({
      templateId: TaskTemplate.generateId(),
      familyId,
      name: String(input.name || '').trim(),
      description: String(input.description || '').trim(),
      taskPayload: payload,
      dateStrategy,
      enabled: input.enabled !== false,
      usageCount: 0,
      lastUsedAt: null,
      createdByUserId: operatorUserId
    });

    this._assertTemplateValid(template);

    const createdTemplate = await this._withTransaction(async (connection) => {
      await this._executeWithConnection(
        connection,
        `INSERT INTO task_templates (
          template_id,
          family_id,
          name,
          description,
          task_payload,
          date_strategy,
          enabled,
          usage_count,
          last_used_at,
          created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          template.templateId,
          template.familyId,
          template.name,
          template.description,
          JSON.stringify(template.taskPayload),
          JSON.stringify(template.dateStrategy),
          template.enabled ? 1 : 0,
          0,
          null,
          template.createdByUserId
        ]
      );

      return this._getTemplateByIdWithConnection(connection, template.templateId, familyId);
    });

    logger.info('创建任务模板成功', {
      templateId: template.templateId,
      familyId,
      operatorUserId
    });

    return createdTemplate;
  }

  async updateTemplate(templateId, familyId, input = {}) {
    return this._withTransaction(async (connection) => {
      const lockedTemplate = await this._getTemplateByIdWithConnection(connection, templateId, familyId, {
        forUpdate: true
      });

      if (!lockedTemplate) {
        throw this._createError('TASK_TEMPLATE_NOT_FOUND', '模板不存在');
      }

      const lockedData = lockedTemplate.toJSON();
      const mergedTaskPayload = input.taskPayload === undefined
        ? (lockedData.taskPayload || {})
        : {
            ...(lockedData.taskPayload || {}),
            ...input.taskPayload
          };
      const payload = normalizeTaskPayload(mergedTaskPayload);
      const mergedDateStrategy = input.dateStrategy === undefined
        ? (lockedData.dateStrategy || {})
        : {
            ...(lockedData.dateStrategy || {}),
            ...input.dateStrategy
          };
      const dateStrategy = normalizeDateStrategy(mergedDateStrategy, payload);
      const nextTemplate = new TaskTemplate({
        ...lockedData,
        templateId,
        familyId,
        name: input.name !== undefined ? String(input.name || '').trim() : lockedTemplate.name,
        description: input.description !== undefined ? String(input.description || '').trim() : lockedTemplate.description,
        taskPayload: payload,
        dateStrategy,
        enabled: input.enabled !== undefined ? input.enabled === true : lockedTemplate.enabled
      });

      this._assertTemplateValid(nextTemplate, lockedData);

      await this._executeWithConnection(
        connection,
        `UPDATE task_templates
         SET name = ?,
             description = ?,
             task_payload = ?,
             date_strategy = ?,
             enabled = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE template_id = ?
           AND family_id = ?
           AND deleted_at IS NULL`,
        [
          nextTemplate.name,
          nextTemplate.description,
          JSON.stringify(nextTemplate.taskPayload),
          JSON.stringify(nextTemplate.dateStrategy),
          nextTemplate.enabled ? 1 : 0,
          templateId,
          familyId
        ]
      );

      return this._getTemplateByIdWithConnection(connection, templateId, familyId);
    });
  }

  async setTemplateEnabled(templateId, familyId, enabled) {
    return this._withTransaction(async (connection) => {
      const existingTemplate = await this._getTemplateByIdWithConnection(connection, templateId, familyId, {
        forUpdate: true
      });
      if (!existingTemplate) {
        throw this._createError('TASK_TEMPLATE_NOT_FOUND', '模板不存在');
      }

      await this._executeWithConnection(
        connection,
        `UPDATE task_templates
         SET enabled = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE template_id = ?
           AND family_id = ?
           AND deleted_at IS NULL`,
        [enabled === true ? 1 : 0, templateId, familyId]
      );

      return this._getTemplateByIdWithConnection(connection, templateId, familyId);
    });
  }

  async deleteTemplate(templateId, familyId) {
    await this._withTransaction(async (connection) => {
      const existingTemplate = await this._getTemplateByIdWithConnection(connection, templateId, familyId, {
        forUpdate: true
      });
      if (!existingTemplate) {
        throw this._createError('TASK_TEMPLATE_NOT_FOUND', '模板不存在');
      }

      await this._executeWithConnection(
        connection,
        `UPDATE task_templates
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE template_id = ?
           AND family_id = ?
           AND deleted_at IS NULL`,
        [templateId, familyId]
      );
    });
  }

  async recordUsage(templateId, familyId) {
    return this._withTransaction(async (connection) => {
      const existingTemplate = await this._getTemplateByIdWithConnection(connection, templateId, familyId, {
        forUpdate: true
      });
      if (!existingTemplate) {
        throw this._createError('TASK_TEMPLATE_NOT_FOUND', '模板不存在');
      }

      await this._executeWithConnection(
        connection,
        `UPDATE task_templates
         SET usage_count = usage_count + 1,
             last_used_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE template_id = ?
           AND family_id = ?
           AND deleted_at IS NULL`,
        [Date.now(), templateId, familyId]
      );

      return this._getTemplateByIdWithConnection(connection, templateId, familyId);
    });
  }

  async _withTransaction(work) {
    const connection = await getPool().getConnection();

    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async _getTemplateByIdWithConnection(connection, templateId, familyId, options = {}) {
    const forUpdateClause = options.forUpdate === true ? '\n       FOR UPDATE' : '';
    const [rows] = await connection.execute(
      `SELECT *
       FROM task_templates
       WHERE template_id = ?
         AND family_id = ?
         AND deleted_at IS NULL
       LIMIT 1${forUpdateClause}`,
      [templateId, familyId]
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    return this._safeTemplateFromDB(rows[0], '_getTemplateByIdWithConnection');
  }

  _safeTemplateFromDB(row, scene = 'unknown') {
    try {
      if (!row || typeof row !== 'object') {
        logger.warn('跳过无效模板记录', {
          scene,
          reason: 'record-is-empty'
        });
        return null;
      }

      const template = TaskTemplate.fromDB(row);
      if (!template) {
        logger.warn('跳过无效模板记录', {
          scene,
          reason: 'from-db-returned-empty',
          templateId: row.template_id || null
        });
        return null;
      }

      return template;
    } catch (error) {
      logger.warn('跳过损坏模板记录', {
        scene,
        templateId: row?.template_id || null,
        error: error.message
      });
      return null;
    }
  }

  async _executeWithConnection(connection, sql, params = []) {
    const [result] = await connection.execute(sql, params);
    return result;
  }

  _assertTemplateValid(template, previousTemplate = null) {
    const validationErrors = typeof template.validate === 'function'
      ? template.validate({ previousTemplate })
      : [];

    if (validationErrors.length > 0) {
      const errorCode = validationErrors.includes('时间范围过长，请缩短后再保存')
        ? 'TASK_TEMPLATE_RANGE_TOO_LARGE'
        : 'INVALID_PARAMS';
      throw this._createError(errorCode, validationErrors.join('；'));
    }
  }

  _compareTemplates(left, right, sortBy) {
    if (sortBy === 'usage') {
      if (right.usageCount !== left.usageCount) {
        return right.usageCount - left.usageCount;
      }
      if ((right.lastUsedAt || 0) !== (left.lastUsedAt || 0)) {
        return (right.lastUsedAt || 0) - (left.lastUsedAt || 0);
      }
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
    }

    if ((right.lastUsedAt || 0) !== (left.lastUsedAt || 0)) {
      return (right.lastUsedAt || 0) - (left.lastUsedAt || 0);
    }
    return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
  }

  _createError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
}

module.exports = new TaskTemplateService();
