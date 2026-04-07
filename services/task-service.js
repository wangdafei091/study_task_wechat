/**
 * task-service.js - 任务服务
 *
 * 提供任务相关的业务逻辑，包括任务的创建、编辑、状态管理等
 */

const logger = require('../utils/logger');
const { TaskRepository } = require('../repositories/index');
const { StarService } = require('./index');
const EventBus = require('../utils/core/event-bus');
const { Task, TaskStatus } = require('../models/task');
const { EVENTS } = require('../utils/constants');
const API_CONFIG = require('../utils/api-config'); // 新增：API配置
const userContextUtils = require('../utils/user-context');
const taskQuery = require('./task-service/task-query');
const taskRepeat = require('./task-service/task-repeat');
const taskSync = require('./task-service/task-sync');
const taskWrite = require('./task-service/task-write');
const taskPenalty = require('./task-service/task-penalty');

class TaskService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {TaskRepository} options.taskRepository 任务仓储
   * @param {StarService} options.starService 星星服务
   * @param {RewardService} options.rewardService 奖励服务
   * @param {UserService} options.userService 用户服务
   * @param {EventBus} options.eventBus 事件总线
   */
  constructor(options = {}) {
    // 初始化仓储
    this.taskRepository = options.taskRepository || new TaskRepository();

    // 关联服务
    this.starService = options.starService;
    this.rewardService = options.rewardService;
    this.userService = options.userService; // 新增：注入用户服务
    this.offlineQueueService = options.offlineQueueService || null;

    // 事件总线
    this.eventBus = options.eventBus || new EventBus();

    // 检查是否启用云端API
    this.enableCloudStorage = API_CONFIG.ENABLE_API;

    logger.info('TaskService', '初始化任务服务', {
      enableCloudStorage: this.enableCloudStorage
    });
  }
  
  /**
   * 初始化服务
   * @returns {Promise<boolean>} 初始化结果
   */
  async initialize() {
    try {
      // 确保仓储已初始化
      await this.taskRepository.loadFromStorage();
      logger.info('TaskService', '任务服务初始化完成');
      return true;
    } catch (error) {
      logger.error('TaskService', '初始化任务服务失败', error);
      return false;
    }
  }

  /**
   * 更新用户服务实例
   * @param {UserService} userService 新的用户服务实例
   */
  updateUserService(userService) {
    if (this.userService !== userService) {
      this.userService = userService;
      logger.info('TaskService', 'UserService已更新');
    }
  }

  updateOfflineQueueService(offlineQueueService) {
    this.offlineQueueService = offlineQueueService || null;
    if (this.offlineQueueService) {
      this.offlineQueueService.registerAdapter('task', this._executeTaskQueueItem.bind(this));
    }
  }

  _createOperationKey(seed = null) {
    return String(seed || Date.now());
  }

  _getUserContextInput() {
    const loginUser = this.userService?.getLoginUser?.() || null;
    const currentUser = this.userService?.getCurrentUser?.() || null;
    const currentUserId = this.userService?.getCurrentUserId?.() || null;
    const availableUsers = this.userService?.getAllUsers?.() || [];

    return {
      loginUser,
      currentUser,
      currentUserId,
      availableUsers
    };
  }

  _getOperatorContext(targetUserId = null, mode = 'execute') {
    const mutationContext = userContextUtils.resolveMutationContext(
      this._getUserContextInput(),
      {
        targetUserId,
        operationMode: mode
      }
    );
    const isManageMode = mutationContext.operationMode === 'manage';

    return {
      actorUserId: isManageMode
        ? mutationContext.managementActorUserId
        : mutationContext.executionActorUserId,
      actorRole: isManageMode
        ? mutationContext.managementActorRole
        : mutationContext.executionActorRole,
      familyId: mutationContext.familyId || null,
      loginUserId: mutationContext.loginUserId || null,
      targetUserId: mutationContext.targetUserId || null
    };
  }

  _buildTaskPendingSyncMeta(task, action, overrides = {}) {
    const operatorMode = ['complete', 'reset'].includes(action) ? 'execute' : 'manage';
    const operatorContext = overrides.operatorContext || this._getOperatorContext(task?.userId || null, operatorMode);
    const operationKey = this._createOperationKey(
      overrides.operationKey ||
      overrides.modifyTime ||
      task?.modifyTime
    );

    return {
      operationKey,
      action,
      operatorUserId: overrides.operatorUserId || operatorContext.actorUserId || null,
      operatorRole: overrides.operatorRole || operatorContext.actorRole || 'system',
      familyId: overrides.familyId || operatorContext.familyId || null,
      loginUserId: overrides.loginUserId || operatorContext.loginUserId || null,
      targetUserId: overrides.targetUserId || operatorContext.targetUserId || task?.userId || null,
      notificationType: overrides.notificationType || `task_${action}`,
      modifyTime: Number(overrides.modifyTime || task?.modifyTime || Date.now())
    };
  }

  _buildOfflineQueueContextFromPendingSyncMeta(pendingSyncMeta = {}) {
    return {
      familyId: pendingSyncMeta.familyId || null,
      loginUserId: pendingSyncMeta.loginUserId || this.userService?.getLoginUserId?.() || null,
      actorUserId: pendingSyncMeta.operatorUserId || null,
      actorRole: pendingSyncMeta.operatorRole || 'system',
      targetUserId: pendingSyncMeta.targetUserId || null
    };
  }

  async _enqueueTaskMutation(action, task, extra = {}) {
    if (!this.offlineQueueService) {
      return null;
    }

    const pendingSyncMeta = extra.pendingSyncMeta || task?.pendingSyncMeta || this._buildTaskPendingSyncMeta(task, action, extra);
    const snapshot = extra.taskSnapshot || (task ? { ...task } : null);

    return this.offlineQueueService.enqueueMutation({
      domain: 'task',
      entityId: task?.id || extra.taskId || null,
      operation: action,
      operationKey: pendingSyncMeta.operationKey,
      payload: {
        pendingSyncMeta,
        taskId: task?.id || extra.taskId || null,
        deleteMeta: extra.deleteMeta || null
      },
      snapshot,
      context: this._buildOfflineQueueContextFromPendingSyncMeta(pendingSyncMeta)
    });
  }

  async _executeTaskQueueItem(item) {
    const snapshot = item.snapshot ? new Task(item.snapshot) : null;
    const storedTask = item.entityId ? await this.taskRepository.getById(item.entityId) : null;
    const task = storedTask || snapshot;

    if (task && item.payload?.pendingSyncMeta) {
      task.pendingSyncMeta = { ...item.payload.pendingSyncMeta };
    }

    switch (item.operation) {
      case 'create':
        return this._syncTaskToCloud(task);
      case 'update':
        return this._syncUpdateToCloud(task);
      case 'delete':
        return this._syncDeleteToCloud(
          item.entityId,
          item.payload?.deleteMeta || item.payload?.pendingSyncMeta || item.snapshot?.pendingSyncMeta || null
        );
      case 'complete':
      case 'reset':
        return this._syncStatusToCloud(task);
      case 'required':
      case 'unrequired':
        return this._syncRequiredStateToCloud(task);
      default:
        return this._syncUpdateToCloud(task);
    }
  }

  async buildLegacyQueueCandidates() {
    const [tasks, tombstones] = await Promise.all([
      this.taskRepository.getAll(),
      this._getDeleteTombstones()
    ]);

    const taskItems = (tasks || [])
      .filter((task) => task?.pendingSyncMeta)
      .map((task) => {
        const pendingSyncMeta = task.pendingSyncMeta || {};
        const operation = pendingSyncMeta.action || (task.syncedToCloud ? 'update' : 'create');
        return {
          domain: 'task',
          entityId: task.id,
          operation,
          operationKey: pendingSyncMeta.operationKey || `${task.id}:${operation}`,
          payload: { pendingSyncMeta },
          snapshot: { ...task },
          context: this._buildOfflineQueueContextFromPendingSyncMeta(pendingSyncMeta),
          legacyMigrationKey: `task:pending:${task.id}:${operation}`
        };
      });

    const tombstoneItems = (tombstones || []).map((tombstone) => ({
      domain: 'task',
      entityId: tombstone.entityId,
      operation: 'delete',
      operationKey: tombstone.operationKey || `${tombstone.entityId}:delete`,
      payload: {
        deleteMeta: tombstone,
        pendingSyncMeta: tombstone
      },
      snapshot: null,
      context: this._buildOfflineQueueContextFromPendingSyncMeta(tombstone),
      legacyMigrationKey: `task:tombstone:${tombstone.entityId}:delete`
    }));

    return [...taskItems, ...tombstoneItems];
  }

  async _markTaskSynced(task, overrides = {}) {
    if (!task) {
      return null;
    }

    task.syncedToCloud = true;
    task.pendingSyncMeta = null;
    if (overrides.modifyTime) {
      task.modifyTime = overrides.modifyTime;
    }
    return this.taskRepository.save(task);
  }

  _normalizeTaskMutationResponse(rawMutation, fallbackOperation = 'update') {
    if (!rawMutation || typeof rawMutation !== 'object') {
      return null;
    }

    const looksLikeMutation =
      rawMutation.primaryTask !== undefined ||
      rawMutation.affectedTasks !== undefined ||
      rawMutation.operation !== undefined;

    const looksLikeCompatEnvelope =
      rawMutation.task !== undefined ||
      rawMutation.tasks !== undefined ||
      rawMutation.taskId !== undefined;

    const looksLikeTask =
      rawMutation.id !== undefined ||
      rawMutation.taskId !== undefined ||
      (rawMutation.title !== undefined && rawMutation.date !== undefined && rawMutation.type !== undefined);

    if (!looksLikeMutation && !looksLikeCompatEnvelope && !looksLikeTask) {
      return null;
    }

    const primaryTask = looksLikeMutation
      ? (rawMutation.primaryTask ?? rawMutation.task ?? null)
      : (looksLikeCompatEnvelope ? (rawMutation.task ?? null) : rawMutation);

    const affectedTasks = Array.isArray(rawMutation.affectedTasks)
      ? rawMutation.affectedTasks
      : Array.isArray(rawMutation.tasks)
        ? rawMutation.tasks
        : (primaryTask ? [primaryTask] : []);

    return {
      primaryTask,
      affectedTasks,
      operation: rawMutation.operation || fallbackOperation,
      idempotent: rawMutation.idempotent === true,
      task: rawMutation.task !== undefined ? rawMutation.task : primaryTask,
      tasks: Array.isArray(rawMutation.tasks) ? rawMutation.tasks : affectedTasks,
      taskId: rawMutation.taskId || primaryTask?.taskId || primaryTask?.id || null
    };
  }

  _toAuthoritativeTask(rawTask, overrides = {}) {
    if (!rawTask) {
      return null;
    }

    const taskData = rawTask instanceof Task
      ? { ...rawTask, ...overrides }
      : {
          ...rawTask,
          id: rawTask.id || rawTask.taskId,
          ...overrides
        };

    return new Task(taskData);
  }

  async _applyAuthoritativeTaskMutation(rawMutation, options = {}) {
    const mutation = this._normalizeTaskMutationResponse(rawMutation, options.fallbackOperation);
    if (!mutation) {
      return {
        mutation: null,
        task: null,
        tasks: [],
        taskId: null
      };
    }

    const uniqueTasks = [];
    const seenTaskIds = new Set();

    (mutation.tasks || mutation.affectedTasks || []).forEach((rawTask) => {
      const task = this._toAuthoritativeTask(rawTask, {
        syncedToCloud: true,
        pendingSyncMeta: null
      });

      if (!task || !task.id || seenTaskIds.has(task.id)) {
        return;
      }

      seenTaskIds.add(task.id);
      uniqueTasks.push(task);
    });

    const savedTasks = uniqueTasks.length > 0
      ? await this.taskRepository.saveAll(uniqueTasks)
      : [];

    const primaryTaskId = mutation.primaryTask?.taskId || mutation.primaryTask?.id || mutation.taskId || null;
    const primaryTask = primaryTaskId
      ? (savedTasks.find(task => task.id === primaryTaskId) || this._toAuthoritativeTask(mutation.primaryTask, {
          syncedToCloud: true,
          pendingSyncMeta: null
        }))
      : null;

    return {
      mutation,
      task: primaryTask,
      tasks: savedTasks,
      taskId: mutation.taskId || primaryTask?.id || null
    };
  }

  _buildTaskServiceMutationResult(rawMutation, options = {}) {
    const mutation = rawMutation
      ? this._normalizeTaskMutationResponse(rawMutation, options.fallbackOperation)
      : null;

    const result = {
      success: options.success !== false
    };

    const task = options.task !== undefined
      ? options.task
      : (options.primaryTask !== undefined
        ? options.primaryTask
        : null);
    const tasks = options.tasks !== undefined ? options.tasks : undefined;
    const taskId = options.taskId !== undefined
      ? options.taskId
      : (mutation?.taskId || task?.id || null);

    if (task !== undefined) {
      result.task = task;
    }
    if (tasks !== undefined) {
      result.tasks = tasks;
    }
    if (options.createdTasks !== undefined) {
      result.createdTasks = options.createdTasks;
    }
    if (taskId) {
      result.taskId = taskId;
    }
    if (options.message) {
      result.message = options.message;
    }
    if (options.fallback) {
      result.fallback = true;
    }
    if (mutation) {
      result.mutation = mutation;
    }

    return result;
  }

  async _emitTaskCloudSyncFailure(action, task, error, extra = {}) {
    const pendingSyncMeta = extra.pendingSyncMeta || task?.pendingSyncMeta || this._buildTaskPendingSyncMeta(task, action, extra);
    if (task) {
      task.pendingSyncMeta = pendingSyncMeta;
      task.syncedToCloud = false;
      await this.taskRepository.save(task).catch(() => null);
    }

    await this._enqueueTaskMutation(action, task, {
      ...extra,
      pendingSyncMeta,
      taskSnapshot: extra.taskSnapshot || (task ? { ...task } : null)
    }).catch(() => null);

    this.eventBus.emit(EVENTS.TASK_CLOUD_SYNC_FAILED, {
      action,
      task,
      taskId: task?.id || extra.taskId || null,
      error,
      pendingSyncMeta,
      taskSnapshot: extra.taskSnapshot || (task ? { ...task } : null)
    });
  }

  async _getDeleteTombstones() {
    if (typeof this.taskRepository.getDeleteTombstones !== 'function') {
      return [];
    }
    return this.taskRepository.getDeleteTombstones().catch(() => []);
  }

  async _saveDeleteTombstone(tombstone) {
    if (typeof this.taskRepository.saveDeleteTombstone !== 'function') {
      return null;
    }
    return this.taskRepository.saveDeleteTombstone(tombstone).catch(() => null);
  }

  async _removeDeleteTombstone(entityId) {
    if (typeof this.taskRepository.removeDeleteTombstone !== 'function') {
      return null;
    }
    return this.taskRepository.removeDeleteTombstone(entityId).catch(() => null);
  }

  async _flushPendingTaskSyncs() {
    if (this.offlineQueueService) {
      if (typeof this.offlineQueueService.initialize === 'function') {
        await this.offlineQueueService.initialize();
      }
      await this.offlineQueueService.drain({
        domains: ['task'],
        reason: 'before_task_read'
      });
      return;
    }

    if (!this.enableCloudStorage) {
      return;
    }

    const tasks = await this.taskRepository.getAll();
    for (const task of tasks) {
      if (!task?.pendingSyncMeta) {
        continue;
      }

      try {
        let mutation = null;
        switch (task.pendingSyncMeta.action) {
          case 'create':
            mutation = await this._syncTaskToCloud(task);
            break;
          case 'update':
            mutation = await this._syncUpdateToCloud(task);
            break;
          case 'complete':
          case 'reset':
            mutation = await this._syncStatusToCloud(task);
            break;
          case 'required':
          case 'unrequired':
            mutation = await this._syncRequiredStateToCloud(task);
            break;
          default:
            if (!task.syncedToCloud) {
              mutation = await this._syncTaskToCloud(task);
            } else {
              mutation = await this._syncUpdateToCloud(task);
            }
            break;
        }

        if (mutation) {
          await this._applyAuthoritativeTaskMutation(mutation, {
            fallbackOperation: task.pendingSyncMeta.action || (task.syncedToCloud ? 'update' : 'create')
          });
        }
      } catch (error) {
        logger.warn('TaskService', '补云任务同步失败，保留待同步状态', {
          taskId: task.id,
          action: task.pendingSyncMeta.action,
          error: error.message
        });
      }
    }

    const tombstones = await this._getDeleteTombstones();
    for (const tombstone of tombstones) {
      try {
        await this._syncDeleteToCloud(tombstone.entityId, tombstone);
      } catch (error) {
        logger.warn('TaskService', '任务删除 tombstone 补云失败，保留待同步状态', {
          taskId: tombstone.entityId,
          error: error.message
        });
      }
    }
  }
  
  /**
   * 获取所有任务（支持双写策略）
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 任务列表
   */
  async getAllTasks(userId = null, options = {}) {
    return taskQuery.getAllTasks(this, userId, options);
  }
  
  /**
   * 获取任务详情
   * @param {String} taskId 任务ID 
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @returns {Promise<Task|null>} 任务对象或null
   */
  async getTaskById(taskId, userId = null) {
    return taskQuery.getTaskById(this, taskId, userId);
  }
  
  /**
   * 获取今日任务
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 今日任务列表
   */
  async getTodayTasks(userId = null, options = {}) {
    return taskQuery.getTodayTasks(this, userId, options);
  }
  
  /**
   * 按日期获取任务（支持云端模式）
   * @param {String} date 日期字符串，格式为YYYY-MM-DD
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 指定日期的任务列表
   */
  async getTasksByDate(date, userId = null, options = {}) {
    return taskQuery.getTasksByDate(this, date, userId, options);
  }
  
  /**
   * 获取日期范围内的任务
   * @param {String} startDate 开始日期，格式为YYYY-MM-DD
   * @param {String} endDate 结束日期，格式为YYYY-MM-DD
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 日期范围内的任务列表
   */
  async getTasksByDateRange(startDate, endDate, userId = null, options = {}) {
    return taskQuery.getTasksByDateRange(this, startDate, endDate, userId, options);
  }
  
  /**
   * 获取必做任务
   * @param {String} date 可选的日期筛选，格式为YYYY-MM-DD
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 必做任务列表
   */
  async getRequiredTasks(date, userId = null) {
    return taskQuery.getRequiredTasks(this, date, userId);
  }
  
  /**
   * 获取过期未完成的任务
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 过期未完成的任务列表
   */
  async getExpiredIncompleteTasks(userId = null) {
    return taskQuery.getExpiredIncompleteTasks(this, userId);
  }
  
  /**
   * 创建任务
   * @param {Object} taskData 任务数据
   * @returns {Promise<Object>} 创建结果
   */
  async createTask(taskData) {
    return taskWrite.createTask(this, taskData);
  }
  
  /**
   * 生成重复任务
   * @private
   * @param {Task} task 原始任务
   * @returns {Promise<Array>} 生成的重复任务列表
   */
  async _generateRepeatTasks(task) {
    return taskRepeat.generateRepeatTasks(this, task);
  }
  
  /**
   * 创建重复任务实例
   * @private
   * @param {Task} originalTask 原始任务
   * @param {Date} date 新任务的日期
   * @returns {Task} 新创建的任务实例
   */
  _createRepeatTaskInstance(originalTask, date) {
    return taskRepeat.createRepeatTaskInstance(this, originalTask, date);
  }
  
  /**
   * 更新任务
   * @param {String} taskId 任务ID
   * @param {Object} changes 要更新的字段
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @returns {Promise<Object>} 更新结果
   */
  async updateTask(taskId, changes, userId = null) {
    return taskWrite.updateTask(this, taskId, changes, userId);
  }
  
  /**
   * 删除任务
   * @param {String} taskId 任务ID
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @param {Boolean} suppressMessage 是否抑制消息创建，用于批量操作
   * @returns {Promise<Object>} 删除结果
   */
  async deleteTask(taskId, userId = null, suppressMessage = false) {
    return taskWrite.deleteTask(this, taskId, userId, suppressMessage);
  }
  
  /**
   * 更新任务状态
   * @param {String} taskId 任务ID
   * @param {Number} status 任务状态 (0:未完成, 1:已完成)
   * @param {String} userId 可选的用户ID，用于积分分配（共享执行模式）
   * @returns {Promise<Object>} 操作结果
   */
  async updateTaskStatus(taskId, status, userId = null) {
    return taskWrite.updateTaskStatus(this, taskId, status, userId);
  }
  
  /**
   * 完成任务
   * @param {String} taskId 任务ID
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @returns {Promise<Object>} 操作结果
   */
  async completeTask(taskId, userId = null) {
    return this.updateTaskStatus(taskId, TaskStatus.COMPLETED, userId);
  }
  
  /**
   * 重置任务状态为未完成
   * @param {String} taskId 任务ID
   * @param {String} userId 可选的用户ID，用于星星扣减（共享执行模式）
   * @returns {Promise<Object>} 操作结果
   */
  async resetTask(taskId, userId = null) {
    return taskWrite.resetTask(this, taskId, userId);
  }
  
  /**
   * 将任务标记为必做
   * @param {String} taskId 任务ID
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @returns {Promise<Object>} 操作结果
   */
  async markTaskAsRequired(taskId, userId = null) {
    return taskWrite.markTaskAsRequired(this, taskId, userId);
  }
  
  /**
   * 取消任务的必做标记
   * @param {String} taskId 任务ID
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @returns {Promise<Object>} 操作结果
   */
  async unmarkTaskAsRequired(taskId, userId = null) {
    return taskWrite.unmarkTaskAsRequired(this, taskId, userId);
  }
  
  /**
   * 检查任务状态
   * 检查过期任务和必做任务
   * @returns {Promise<Object>} 检查结果
   */
  async checkTasksStatus() {
    return taskPenalty.checkTasksStatus(this);
  }
  
  /**
   * 检查必做任务状态（兼容方法）
   * @returns {Promise<Object>} 检查结果
   */
  async checkRequiredTasks() {
    logger.info('TaskService', '检查必做任务状态（兼容方法，调用checkTasksStatus）');
    return await this.checkTasksStatus();
  }
  
  /**
   * 处理必做任务惩罚
   * @param {Object} task 任务对象
   * @returns {Promise<Object>} 处理结果
   */
  async handleRequiredTaskPenalty(task) {
    return taskPenalty.handleRequiredTaskPenalty(this, task);
  }
  
  /**
   * 计算任务进度
   * @param {Array} tasks 可选的任务列表，不传则自动获取今日任务
   * @returns {Promise<Object>} 任务进度统计
   */
  async calculateTaskProgress(tasks = null) {
    return taskQuery.calculateTaskProgress(this, tasks);
  }
  
  /**
   * 批量处理任务
   * @param {Array} items 任务数组
   * @param {Function} processFn 处理函数
   * @param {Object} options 选项
   * @param {Number} options.batchSize 批处理大小
   * @param {Number} options.delay 批次间延迟毫秒数
   * @returns {Promise<Object>} 处理结果
   */
  async batchProcessTasks(items, processFn, options = {}) {
    const { batchSize = 50, delay = 0 } = options;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { success: true, processed: 0, message: '没有需要处理的任务' };
    }
    
    if (typeof processFn !== 'function') {
      return { success: false, message: '处理函数无效' };
    }
    
    try {
      logger.info('TaskService', `开始批量处理: ${items.length}项, 批次大小=${batchSize}, 延迟=${delay}ms`);
      
      let processedCount = 0;
      const results = [];
      
      // 处理一批数据
      const processBatch = async (batch) => {
        for (const item of batch) {
          try {
            const result = await processFn(item);
            results.push({ item, result, success: true });
            processedCount++;
          } catch (error) {
            results.push({ item, error, success: false });
            logger.error('TaskService', `批量处理项目失败: ${error.message}`, error);
          }
        }
      };
      
      // 分批处理
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await processBatch(batch);
        
        // 添加延迟
        if (delay > 0 && i + batchSize < items.length) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      logger.info('TaskService', `批量处理完成: 成功处理${processedCount}/${items.length}项`);
      
      return {
        success: true,
        total: items.length,
        processed: processedCount,
        results
      };
    } catch (error) {
      logger.error('TaskService', '批量处理失败', error);
      return { success: false, message: '批量处理失败: ' + error.message };
    }
  }

  /**
   * 检查即将到期的任务
   * @returns {Promise<Object>} 检查结果
   */
  async checkUpcomingTasks(userId = null) {
    return taskQuery.checkUpcomingTasks(this, userId);
  }
  
  /**
   * 获取任务统计数据
   * 统计任务完成情况，按类型、状态等维度
   * @param {Object} dateRange 日期范围对象 {startDate, endDate}
   * @returns {Promise<Object>} 统计数据
   */
  async getTaskStatistics(dateRange = {}, scopeOptions = {}) {
    return taskQuery.getTaskStatistics(this, dateRange, scopeOptions);
  }
  
  /**
   * 计算按日期分组的统计数据
   * @param {Array} tasks 任务数组
   * @returns {Array} 按日期分组的统计数据
   * @private
   */
  _calculateDailyStats(tasks) {
    return taskQuery.calculateDailyStats(tasks);
  }
  
  /**
   * 计算连续完成天数
   * @param {Array} tasks 任务数组
   * @returns {Promise<Number>} 连续天数
   * @private
   */
  async _calculateStreak(tasks) {
    return taskQuery.calculateStreak(tasks);
  }

  /**
   * 将家长名下的任务迁移到指定孩子（M08b：前置任务归属迁移）
   * 顺序：云端先行，云端成功后再更新本地；syncedToCloud 保持不变
   * @param {string} fromUserId 家长 userId
   * @param {string} toUserId   目标孩子 userId
   * @returns {{ success: boolean, count: number }}
   */
  async _migrateTasksToChild(fromUserId, toUserId) {
    return taskSync.migrateTasksToChild(this, fromUserId, toUserId);
  }

  /**
   * 清理陈旧任务：删除本地有但云端无、且曾成功同步过的任务。
   * syncedToCloud=false 的任务（从未上云）一律跳过，避免误删未同步数据。
   * @param {Set<string>} cloudTaskIds 云端任务ID集合
   * @param {string} loginUserId 当前登录用户ID
   * @returns {Promise<void>}
   */
  async _cleanupStaleTasks(cloudTaskIds, loginUserId) {
    return taskSync.cleanupStaleTasks(this, cloudTaskIds, loginUserId);
  }

  /**
   * 按 taskId 从云端补拉单条任务（内存使用）。
   * 只有任务归属于当前登录用户时才持久化到本地仓储，
   * 防止家长操作孩子任务时把孩子数据写入共享 taskData（M06 隔离）。
   * @param {String} taskId
   * @returns {Promise<Task|null>}
   */
  async _fetchSingleTaskFromCloud(taskId) {
    return taskSync.fetchSingleTaskFromCloud(this, taskId);
  }

  async _createTaskViaCloud(task) {
    return taskSync.createTaskViaCloud(this, task);
  }

  async _syncTaskToCloud(task) {
    return taskSync.syncTaskToCloud(this, task);
  }

  /**
   * 从云端获取任务（双写策略的读取部分）
   * @param {string} userId 用户ID
   * @param {Object} params 可选查询参数，如 { date: 'YYYY-MM-DD' }
   * @returns {Promise<Array>} 任务列表
   */
  async _fetchTasksFromCloud(userId, params = {}) {
    return taskSync.fetchTasksFromCloud(this, userId, params);
  }

  async _mergeLocalTasksIntoCloudResult(tasks, userId, loadLocalTasks, sceneLabel = '任务') {
    return taskSync.mergeLocalTasksIntoCloudResult(this, tasks, userId, loadLocalTasks, sceneLabel);
  }

  /**
   * 同步任务更新到云端
   */
  async _syncUpdateToCloud(task) {
    return taskSync.syncUpdateToCloud(this, task);
  }

  /**
   * 同步任务删除到云端
   */
  async _syncDeleteToCloud(taskId, deleteMeta = null) {
    return taskSync.syncDeleteToCloud(this, taskId, deleteMeta);
  }

  /**
   * 同步任务状态到云端（同步 status + starAwarded）
   */
  async _syncStatusToCloud(task) {
    return taskSync.syncStatusToCloud(this, task);
  }

  /**
   * 同步任务必做状态到云端
   */
  async _syncRequiredStateToCloud(task) {
    return taskSync.syncRequiredStateToCloud(this, task);
  }

  /**
   * 分析页专用：按 scope 或 userId 获取任务
   * 不改变 getAllTasks 原有语义
   * @param {Object} options - { userId } 或 { scope: 'family' }
   */
  async getTasksByScope(options = {}) {
    return taskQuery.getTasksByScope(this, options);
  }
}

module.exports = TaskService; 
