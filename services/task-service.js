/**
 * task-service.js - 任务服务
 * 
 * 提供任务相关的业务逻辑，包括任务的创建、编辑、状态管理等
 */

const logger = require('../utils/logger');
const { TaskRepository } = require('../repositories/index');
const { StarService } = require('./index');
const EventBus = require('../utils/core/event-bus');
const { Task, TaskStatus, TaskType, RepeatType, StarExpiryType } = require('../models/task');
const dateUtils = require('../utils/dateUtils');
const { EVENTS } = require('../utils/constants');

class TaskService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {TaskRepository} options.taskRepository 任务仓储
   * @param {StarService} options.starService 星星服务
   * @param {RewardService} options.rewardService 奖励服务
   * @param {EventBus} options.eventBus 事件总线
   */
  constructor(options = {}) {
    // 初始化仓储
    this.taskRepository = options.taskRepository || new TaskRepository();
    
    // 关联服务
    this.starService = options.starService;
    this.rewardService = options.rewardService;
    
    // 事件总线
    this.eventBus = options.eventBus || new EventBus();
    
    logger.info('TaskService', '初始化任务服务');
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
   * 获取所有任务
   * @returns {Promise<Array>} 任务列表
   */
  async getAllTasks() {
    try {
      const tasks = await this.taskRepository.getAll();
      logger.info('TaskService', `获取所有任务成功, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskService', '获取所有任务失败', error);
      return [];
    }
  }
  
  /**
   * 获取任务详情
   * @param {String} taskId 任务ID 
   * @returns {Promise<Task|null>} 任务对象或null
   */
  async getTaskById(taskId) {
    try {
      const task = await this.taskRepository.getById(taskId);
      return task;
    } catch (error) {
      logger.error('TaskService', `获取任务详情失败, ID=${taskId}`, error);
      return null;
    }
  }
  
  /**
   * 获取今日任务
   * @returns {Promise<Array>} 今日任务列表
   */
  async getTodayTasks() {
    try {
      const tasks = await this.taskRepository.getTodayTasks();
      logger.info('TaskService', `获取今日任务成功, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskService', '获取今日任务失败', error);
      return [];
    }
  }
  
  /**
   * 按日期获取任务
   * @param {String} date 日期字符串，格式为YYYY-MM-DD
   * @returns {Promise<Array>} 指定日期的任务列表
   */
  async getTasksByDate(date) {
    try {
      const tasks = await this.taskRepository.getTasksByDate(date);
      logger.info('TaskService', `获取${date}任务成功, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskService', `获取${date}任务失败`, error);
      return [];
    }
  }
  
  /**
   * 获取日期范围内的任务
   * @param {String} startDate 开始日期，格式为YYYY-MM-DD
   * @param {String} endDate 结束日期，格式为YYYY-MM-DD
   * @returns {Promise<Array>} 日期范围内的任务列表
   */
  async getTasksByDateRange(startDate, endDate) {
    try {
      const tasks = await this.taskRepository.getTasksByDateRange(startDate, endDate);
      logger.info('TaskService', `获取${startDate}至${endDate}的任务成功, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskService', `获取${startDate}至${endDate}的任务失败`, error);
      return [];
    }
  }
  
  /**
   * 获取必做任务
   * @param {String} date 可选的日期筛选，格式为YYYY-MM-DD
   * @returns {Promise<Array>} 必做任务列表
   */
  async getRequiredTasks(date) {
    try {
      const tasks = await this.taskRepository.getRequiredTasks(date);
      logger.info('TaskService', `获取必做任务成功${date ? `, 日期=${date}` : ''}, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskService', `获取必做任务失败${date ? `, 日期=${date}` : ''}`, error);
      return [];
    }
  }
  
  /**
   * 获取过期未完成的任务
   * @returns {Promise<Array>} 过期未完成的任务列表
   */
  async getExpiredIncompleteTasks() {
    try {
      const tasks = await this.taskRepository.getExpiredIncompleteTask();
      logger.info('TaskService', `获取过期未完成任务成功, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskService', '获取过期未完成任务失败', error);
      return [];
    }
  }
  
  /**
   * 创建任务
   * @param {Object} taskData 任务数据
   * @returns {Promise<Object>} 创建结果
   */
  async createTask(taskData) {
    try {
      // 创建任务领域模型实例
      const task = new Task(taskData);
      
      // 验证任务
      const errors = task.validate();
      if (errors.length > 0) {
        logger.warn('TaskService', '创建任务失败: 数据验证不通过', { errors });
        return { success: false, message: errors.join(', ') };
      }
      
      // 保存任务
      const savedTask = await this.taskRepository.save(task);
      logger.info('TaskService', `创建任务成功: "${savedTask.title}", ID=${savedTask.id}`);
      
      // 检查是否需要生成重复任务
      let createdTasks = [savedTask];
      if (task.isRepeating()) {
        const repeatTasks = await this._generateRepeatTasks(savedTask);
        if (repeatTasks.length > 0) {
          createdTasks = createdTasks.concat(repeatTasks);
          logger.info('TaskService', `生成了${repeatTasks.length}个重复任务实例`);
        }
      }
      
      // 触发任务创建事件
      logger.info('TaskService', '触发任务创建事件，包含完整任务对象', {
        taskId: savedTask.id,
        title: savedTask.title,
        tasksCount: createdTasks.length
      });
      
      // 记录事件日志
      logger.logEvent(EVENTS.TASK_CREATED, { 
        taskId: savedTask.id,
        title: savedTask.title,
        tasksCount: createdTasks.length
      }, {
        module: 'TaskService',
        direction: 'emit'
      });
      
      // 使用常量替代硬编码字符串
      this.eventBus.emit(EVENTS.TASK_CREATED, { 
        task: savedTask,  // 确保包含单个完整任务对象
        tasks: createdTasks,
        originalTask: savedTask 
      });
      
      return { 
        success: true, 
        task: savedTask,
        createdTasks: createdTasks
      };
    } catch (error) {
      logger.error('TaskService', '创建任务失败', error);
      return { success: false, message: '创建任务失败: ' + error.message };
    }
  }
  
  /**
   * 生成重复任务
   * @private
   * @param {Task} task 原始任务
   * @returns {Promise<Array>} 生成的重复任务列表
   */
  async _generateRepeatTasks(task) {
    if (!task.isRepeating()) {
      return [];
    }
    
    try {
      logger.info('TaskService', `开始生成重复任务: "${task.title}"`);
      logger.info('TaskService', `重复配置: ${JSON.stringify(task.repeat)}`);
      
      // 确保日期格式有效
      if (!task.repeat || !task.repeat.startDate) {
        logger.error('TaskService', '错误: 重复任务缺少开始日期');
        return [];
      }
      
      // 解析开始日期和结束日期
      const startDate = new Date(task.repeat.startDate);
      let endDate = null;
      
      // 处理结束日期
      if (task.repeat.endDate) {
        endDate = new Date(task.repeat.endDate);
        
        // 新增: 如果开始日期和结束日期是同一天，则不需要生成重复任务
        if (startDate.getFullYear() === endDate.getFullYear() && 
            startDate.getMonth() === endDate.getMonth() && 
            startDate.getDate() === endDate.getDate()) {
          logger.info('TaskService', `开始日期和结束日期相同(${task.repeat.startDate})，不生成重复任务`);
          return [];
        }
      } else if (task.hasNoEndDate === true) {
        // 处理无结束日期情况
        endDate = new Date(startDate);
        if (task.repeat.type === RepeatType.DAILY) {
          endDate.setDate(endDate.getDate() + 90); // 每日任务默认90天
        } else {
          endDate.setDate(endDate.getDate() + 30); // 其他类型默认30天
        }
      } else {
        logger.error('TaskService', '错误: 重复任务缺少结束日期且未设置无结束日期标志');
        return [];
      }
      
      // 确保开始日期不早于今天
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (startDate < today) {
        startDate.setTime(today.getTime());
      }
      
      // 确保结束日期不早于开始日期
      if (endDate < startDate) {
        logger.error('TaskService', '错误: 结束日期早于开始日期，无法生成任务');
        return [];
      }
      
      // 计算日期范围
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1包含开始日期
      logger.info('TaskService', `任务将生成: ${diffDays}天的内容`);
      
      // 生成重复日期列表
      const repeatDates = [];
      
      switch (task.repeat.type) {
        case RepeatType.DAILY:
          // 每天重复
          for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            repeatDates.push(new Date(date));
          }
          break;
          
        case RepeatType.WEEKLY:
          // 每周重复
          for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 7)) {
            repeatDates.push(new Date(date));
          }
          break;
          
        case 'workdays':
          // 工作日重复
          for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const day = date.getDay();
            if (day >= 1 && day <= 5) { // 周一到周五
              repeatDates.push(new Date(date));
            }
          }
          break;
          
        case 'weekends':
          // 周末重复
          for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
            const day = date.getDay();
            if (day === 0 || day === 6) { // 周六和周日
              repeatDates.push(new Date(date));
            }
          }
          break;
          
        case 'custom':
          // 自定义重复
          if (task.repeat.days && task.repeat.days.length > 0) {
            for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
              const day = date.getDay().toString();
              if (task.repeat.days.includes(day)) {
                repeatDates.push(new Date(date));
              }
            }
          }
          break;
      }
      
      // 转换为任务实例并保存
      const repeatTasks = [];
      for (const date of repeatDates) {
        // 跳过第一个日期（因为原始任务已经创建）
        if (date.getTime() === startDate.getTime()) {
          continue;
        }
        
        const repeatTask = this._createRepeatTaskInstance(task, date);
        const savedTask = await this.taskRepository.save(repeatTask);
        repeatTasks.push(savedTask);
      }
      
      return repeatTasks;
    } catch (error) {
      logger.error('TaskService', `生成重复任务失败: ${error.message}`, error);
      return [];
    }
  }
  
  /**
   * 创建重复任务实例
   * @private
   * @param {Task} originalTask 原始任务
   * @param {Date} date 新任务的日期
   * @returns {Task} 新创建的任务实例
   */
  _createRepeatTaskInstance(originalTask, date) {
    // 格式化日期
    const dateStr = dateUtils.formatDate(date);
    
    // 创建任务副本
    const taskData = {
      ...originalTask,
      id: `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      date: dateStr,
      createTime: Date.now(),
      modifyTime: Date.now(),
      parentTaskId: originalTask.id,
      status: TaskStatus.PENDING,
      starAwarded: false
    };
    
    // 创建新任务实例
    const taskInstance = new Task(taskData);
    
    logger.info('TaskService', `创建重复任务实例: ${dateStr}, 父任务ID: ${taskInstance.parentTaskId}`);
    
    return taskInstance;
  }
  
  /**
   * 更新任务
   * @param {String} taskId 任务ID
   * @param {Object} changes 要更新的字段
   * @returns {Promise<Object>} 更新结果
   */
  async updateTask(taskId, changes) {
    try {
      // 获取原任务
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        logger.warn('TaskService', `更新任务失败: 未找到ID为${taskId}的任务`);
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 保存原始状态
      const originalStatus = task.status;
      
      // 更新任务
      task.update(changes);
      
      // 保存更新后的任务
      const updatedTask = await this.taskRepository.save(task);
      
      logger.info('TaskService', `更新任务成功: "${updatedTask.title}", ID=${updatedTask.id}`);
      
      // 触发事件
      this.eventBus.emit(EVENTS.TASK_UPDATED, {
        task: updatedTask,
        changes,
        previousStatus: originalStatus,
        operationType: 'update'
      });
      
      return { success: true, task: updatedTask };
    } catch (error) {
      logger.error('TaskService', `更新任务失败: ${error.message}`, error);
      return { success: false, message: '更新任务失败: ' + error.message };
    }
  }
  
  /**
   * 删除任务
   * @param {String} taskId 任务ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteTask(taskId) {
    try {
      // 获取任务信息，用于事件传递
      const taskInfo = await this.taskRepository.getById(taskId);
      
      if (!taskInfo) {
        logger.warn('TaskService', `删除任务失败: 未找到ID为${taskId}的任务`);
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 删除任务
      await this.taskRepository.delete(taskId);
      
      logger.info('TaskService', `删除任务成功: ${taskId}`);
      
      // 触发任务删除事件
      this.eventBus.emit(EVENTS.TASK_DELETED, {
        taskId,
        taskInfo: {
          id: taskInfo.id,
          title: taskInfo.title,
          type: taskInfo.type,
          date: taskInfo.date,
          status: taskInfo.status
        }
      });
      
      return { success: true };
    } catch (error) {
      logger.error('TaskService', `删除任务失败: ${error.message}`, error);
      return { success: false, message: '删除任务失败: ' + error.message };
    }
  }
  
  /**
   * 更新任务状态
   * @param {String} taskId 任务ID
   * @param {Number} status 新状态
   * @returns {Promise<Object>} 更新结果
   */
  async updateTaskStatus(taskId, status) {
    try {
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        logger.warn('TaskService', `更新任务状态失败: 未找到ID为${taskId}的任务`);
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 记录原始状态
      const previousStatus = task.status;
      
      // 状态没有变化，直接返回
      if (previousStatus === status) {
        logger.info('TaskService', `任务状态未发生变化: ${taskId}, 状态=${status}`);
        return { success: true, task, unchanged: true };
      }
      
      // 设置新状态
      logger.info('TaskService', `准备设置任务状态: ${task.title}, 当前状态=${task.status}, 新状态=${status}`);
      task.status = status;
      logger.info('TaskService', `任务状态已设置: ${task.title}, 状态=${task.status}, 类型=${typeof task.status}`);

      // 如果任务以前未获得过星星，则分配积分
      if (!task.starAwarded && this.starService) {
        logger.info('TaskService', `开始为任务分配积分: ${task.title}, 积分=${task.points}, 有效期=${task.pointsExpiry}`);
        logger.info('TaskService', `任务当前starAwarded状态: ${task.starAwarded}, 类型: ${typeof task.starAwarded}`);
        
        // 计算积分有效期
        const expiryInfo = this.starService.calculateExpiryDate(task.pointsExpiry);
        task.pointsExpiryDate = expiryInfo.expiryDateStr;
        
        logger.info('TaskService', `积分有效期计算完成: ${expiryInfo.expiryDateStr}`);
        
        // 标记已经获得积分
        task.starAwarded = true;
        logger.info('TaskService', `设置starAwarded为true: ${task.starAwarded}`);
        
        // 添加积分
        if (task.points > 0) {
          const addResult = await this.starService.addStars(
            task.points,
            task.pointsExpiry,
            `完成任务: ${task.title}`,
            task.id
          );
          
          logger.info('TaskService', `积分添加结果:`, addResult);
          
          if (addResult.success) {
            logger.info('TaskService', `任务 "${task.title}" 获得 ${task.points} 颗星星`);
          } else {
            logger.warn('TaskService', `任务 "${task.title}" 积分添加失败: ${addResult.message}`);
          }
        }
      } else if (task.starAwarded) {
        logger.info('TaskService', `任务 "${task.title}" 已经获得过星星，跳过积分分配`);
      }

      // 更新修改时间
      task.modifyTime = Date.now();
      
      // 添加保存前的详细日志
      logger.info('TaskService', `准备保存任务: ${task.title}`, {
        id: task.id,
        status: task.status,
        starAwarded: task.starAwarded,
        points: task.points,
        modifyTime: task.modifyTime
      });

      // 保存任务
      const savedTask = await this.taskRepository.save(task);
      
      // 添加保存后的详细日志
      logger.info('TaskService', `任务保存完成: ${task.title}`, {
        id: savedTask.id,
        status: savedTask.status,
        starAwarded: savedTask.starAwarded,
        points: savedTask.points,
        saveSuccess: !!savedTask
      });
      
      // 确定操作类型
      let operationType = 'update';
      if (status === TaskStatus.COMPLETED) {
        operationType = 'complete';
      } else if (previousStatus === TaskStatus.COMPLETED) {
        operationType = 'uncomplete';
      }
      
      // 记录事件日志 - 状态更新事件
      logger.logEvent(EVENTS.TASK_STATUS_UPDATED, {
        taskId: savedTask.id,
        title: savedTask.title,
        status,
        previousStatus,
        operationType
      }, {
        module: 'TaskService',
        direction: 'emit'
      });
      
      // 触发状态更新事件
      this.eventBus.emit(EVENTS.TASK_STATUS_UPDATED, {
        task: savedTask,
        previousStatus,
        operationType
      });
      
      // 如果是完成任务，还需记录和触发专门的完成事件
      if (status === TaskStatus.COMPLETED) {
        // 记录完成事件日志
        logger.logEvent(EVENTS.TASK_COMPLETED, {
          taskId: savedTask.id,
          title: savedTask.title
        }, {
          module: 'TaskService',
          direction: 'emit'
        });
        
        // 触发完成事件
        this.eventBus.emit(EVENTS.TASK_COMPLETED, { task: savedTask });
      }
      
      return { success: true, task: savedTask };
    } catch (error) {
      logger.error('TaskService', `更新任务状态失败: ${error.message}`, error);
      return { success: false, message: '更新任务状态失败: ' + error.message };
    }
  }
  
  /**
   * 完成任务
   * @param {String} taskId 任务ID
   * @returns {Promise<Object>} 操作结果
   */
  async completeTask(taskId) {
    return this.updateTaskStatus(taskId, TaskStatus.COMPLETED);
  }
  
  /**
   * 重置任务状态为未完成
   * @param {String} taskId 任务ID
   * @returns {Promise<Object>} 操作结果
   */
  async resetTask(taskId) {
    try {
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        logger.warn('TaskService', `重置任务失败: 未找到ID为${taskId}的任务`);
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 如果任务未完成，无需重置
      if (!task.isCompleted()) {
        logger.info('TaskService', `任务未完成，无需重置: ${task.title}`);
        return { success: true, task, unchanged: true };
      }
      
      // 检查任务是否可以取消打勾（锁定状态检查）
      let lastExchangeTime = null;
      if (this.rewardService) {
        lastExchangeTime = await this.rewardService.getLastExchangeTime();
      }
      
      if (!task.canBeUnchecked(lastExchangeTime)) {
        logger.warn('TaskService', `任务被锁定，不能取消完成: ${task.title}, 完成时间=${task.completionTime}, 最后兑换时间=${lastExchangeTime}`);
        return { 
          success: false, 
          message: '该任务已被锁定，不能取消完成。兑换奖励后完成的任务才能取消。',
          locked: true
        };
      }
      
      // 如果任务已获得星星，需要从对应分组扣减星星
      if (task.starAwarded && task.points > 0 && this.starService) {
        logger.info('TaskService', `准备从特定分组扣减星星: ${task.title}, 星星数=${task.points}, 有效期类型=${task.pointsExpiry}`);
        
        const consumeResult = await this.starService.consumeStarsFromSpecificType(
          task.points,
          task.pointsExpiry,
          `取消完成任务: ${task.title}`,
          {
            sourceType: 'task_reset',
            sourceId: task.id
          }
        );
        
        if (!consumeResult.success) {
          logger.error('TaskService', `从特定分组扣减星星失败: ${consumeResult.message}`);
          return { 
            success: false, 
            message: '扣减星星失败，无法取消任务完成状态' 
          };
        }
        
        logger.info('TaskService', `从特定分组扣减星星成功: ${task.title}, 扣减${task.points}颗星星`);
      }
      
      // 重置任务状态和星星获得标记
      task.reset();
      task.starAwarded = false;
      task.modifyTime = Date.now();
      
      // 保存任务
      const savedTask = await this.taskRepository.save(task);
      
      logger.info('TaskService', `任务重置成功: ${savedTask.title}, ID=${savedTask.id}`);
      
      // 触发任务重置事件
      this.eventBus.emit(EVENTS.TASK_RESET, { 
        task: savedTask,
        starsDeducted: task.points || 0
      });
      
      return { success: true, task: savedTask };
    } catch (error) {
      logger.error('TaskService', `重置任务失败: ${error.message}`, error);
      return { success: false, message: '重置任务失败: ' + error.message };
    }
  }
  
  /**
   * 将任务标记为必做
   * @param {String} taskId 任务ID
   * @returns {Promise<Object>} 操作结果
   */
  async markTaskAsRequired(taskId) {
    try {
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 已经是必做任务，无需更改
      if (task.isRequired) {
        return { success: true, task, unchanged: true };
      }
      
      // 标记为必做
      task.isRequired = true;
      task.modifyTime = Date.now();
      
      // 保存更新后的任务
      const updatedTask = await this.taskRepository.save(task);
      
      logger.info('TaskService', `将任务标记为必做: "${updatedTask.title}", ID=${updatedTask.id}`);
      
      // 触发事件
      this.eventBus.emit(EVENTS.TASK_MARKED_REQUIRED, { task: updatedTask });
      
      return { success: true, task: updatedTask };
    } catch (error) {
      logger.error('TaskService', `标记必做任务失败: ${error.message}`, error);
      return { success: false, message: '标记必做任务失败: ' + error.message };
    }
  }
  
  /**
   * 取消任务的必做标记
   * @param {String} taskId 任务ID
   * @returns {Promise<Object>} 操作结果
   */
  async unmarkTaskAsRequired(taskId) {
    try {
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 本来就不是必做任务，无需更改
      if (!task.isRequired) {
        return { success: true, task, unchanged: true };
      }
      
      // 取消必做标记
      task.isRequired = false;
      task.modifyTime = Date.now();
      
      // 保存更新后的任务
      const updatedTask = await this.taskRepository.save(task);
      
      logger.info('TaskService', `取消任务的必做标记: "${updatedTask.title}", ID=${updatedTask.id}`);
      
      // 触发事件
      this.eventBus.emit(EVENTS.TASK_UNMARKED_REQUIRED, { task: updatedTask });
      
      return { success: true, task: updatedTask };
    } catch (error) {
      logger.error('TaskService', `取消必做任务标记失败: ${error.message}`, error);
      return { success: false, message: '取消必做任务标记失败: ' + error.message };
    }
  }
  
  /**
   * 检查任务状态
   * 检查过期任务和必做任务
   * @returns {Promise<Object>} 检查结果
   */
  async checkTasksStatus() {
    try {
      // 检查过期未完成任务
      const expiredTasks = await this.getExpiredIncompleteTasks();
      
      // 检查必做任务
      const requiredTasks = await this.getRequiredTasks();
      
      // 筛选出已过期但未执行惩罚的必做任务
      const expiredRequiredTasks = expiredTasks.filter(task => 
        task.isRequired && !task.penaltyApplied && task.status !== TaskStatus.COMPLETED
      );
      
      // 处理必做任务惩罚
      const penaltyResults = [];
      for (const task of expiredRequiredTasks) {
        const result = await this.handleRequiredTaskPenalty(task);
        penaltyResults.push(result);
      }
      
      logger.info('TaskService', `任务状态检查完成, 过期任务: ${expiredTasks.length}, 必做任务: ${requiredTasks.length}, 执行惩罚: ${penaltyResults.length}`);
      
      return {
        success: true,
        expiredTasks,
        requiredTasks,
        penaltyResults
      };
    } catch (error) {
      logger.error('TaskService', '检查任务状态失败', error);
      return { success: false, message: '检查任务状态失败: ' + error.message };
    }
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
   * @param {Task} task 任务对象
   * @returns {Promise<Object>} 处理结果
   */
  async handleRequiredTaskPenalty(task) {
    try {
      if (!task || !task.isRequired || task.penaltyApplied) {
        return { success: false, message: '不满足惩罚条件' };
      }
      
      // 计算惩罚积分
      let penaltyPoints = task.points || 0;
      
      // 如果没有设置积分，使用默认惩罚
      if (penaltyPoints <= 0) {
        penaltyPoints = 5; // 默认惩罚5颗星
      }
      
      // 标记已经应用惩罚
      task.penaltyApplied = true;
      task.modifyTime = Date.now();
      
      // 保存更新后的任务
      const updatedTask = await this.taskRepository.save(task);
      
      // 扣除积分
      if (this.starService && penaltyPoints > 0) {
        const consumeResult = await this.starService.consumeStars(
          penaltyPoints,
          `必做任务惩罚: ${task.title}`,
          {
            sourceType: 'task_penalty',
            sourceId: task.id
          }
        );
        
        if (!consumeResult.success) {
          logger.error('TaskService', `惩罚扣除积分失败: ${consumeResult.message}`);
        }
      }
      
      logger.info('TaskService', `已对必做任务应用惩罚: "${task.title}", 扣除${penaltyPoints}颗星`);
      
      // 触发惩罚事件
      this.eventBus.emit(EVENTS.TASK_PENALTY_APPLIED, {
        task: updatedTask,
        penaltyPoints,
        reason: '必做任务未完成'
      });
      
      return { success: true, task: updatedTask, penaltyPoints };
    } catch (error) {
      logger.error('TaskService', `应用必做任务惩罚失败: ${error.message}`, error);
      return { success: false, message: '应用惩罚失败: ' + error.message };
    }
  }
  
  /**
   * 计算任务进度
   * @returns {Promise<Object>} 任务进度统计
   */
  async calculateTaskProgress() {
    try {
      // 获取今日任务
      const todayTasks = await this.getTodayTasks();
      
      // 按类型统计任务
      const typeCounts = {
        total: { habit: 0, study: 0, interest: 0 },
        completed: { habit: 0, study: 0, interest: 0 }
      };
      
      todayTasks.forEach(task => {
        if (typeCounts.total.hasOwnProperty(task.type)) {
          typeCounts.total[task.type]++;
          
          if (task.status === TaskStatus.COMPLETED) {
            typeCounts.completed[task.type]++;
          }
        }
      });
      
      // 计算各类型完成率
      const progress = {
        habit: typeCounts.total.habit > 0 
          ? Math.round(typeCounts.completed.habit / typeCounts.total.habit * 100) 
          : 0,
        study: typeCounts.total.study > 0 
          ? Math.round(typeCounts.completed.study / typeCounts.total.study * 100) 
          : 0,
        interest: typeCounts.total.interest > 0 
          ? Math.round(typeCounts.completed.interest / typeCounts.total.interest * 100) 
          : 0
      };
      
      // 计算总体进度
      const totalTasks = todayTasks.length;
      const completedTasks = todayTasks.filter(task => task.status === TaskStatus.COMPLETED).length;
      const completionRate = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0;
      
      // 构建统计结果
      const result = {
        taskProgress: progress,
        stats: {
          totalTasks,
          completedTasks,
          completionRate,
          typeCounts: {
            habit: typeCounts.total.habit,
            study: typeCounts.total.study,
            interest: typeCounts.total.interest
          }
        }
      };
      
      logger.info('TaskService', `计算任务进度成功: 总任务数=${totalTasks}, 完成率=${completionRate}%`);
      
      return result;
    } catch (error) {
      logger.error('TaskService', '计算任务进度失败', error);
      return {
        taskProgress: { habit: 0, study: 0, interest: 0 },
        stats: {
          totalTasks: 0,
          completedTasks: 0,
          completionRate: 0,
          typeCounts: { habit: 0, study: 0, interest: 0 }
        }
      };
    }
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
  async checkUpcomingTasks() {
    try {
      // 获取今天的任务
      const tasks = await this.taskRepository.getTodayTasks();
      
      if (!tasks || tasks.length === 0) {
        return { success: true, count: 0 };
      }
      
      const current = new Date();
      const upcomingTasks = [];
      
      // 筛选所有学习类型的未完成任务
      tasks.forEach(task => {
        // 只处理学习类型且未完成的任务
        if (task.type === TaskType.STUDY && task.status === TaskStatus.PENDING) {
          // 计算提醒时间
          const reminderTime = this._calculateReminderTime(task);
          if (reminderTime) {
            // 检查是否在提醒时间范围内
            const startTime = new Date();
            startTime.setHours(reminderTime.hours, reminderTime.minutes, 0, 0);
            
            // 计算当前时间和提醒时间的差异（分钟）
            const diffMinutes = Math.floor((startTime - current) / (1000 * 60));
            
            // 如果在30分钟内即将开始，添加到提醒列表
            if (diffMinutes > 0 && diffMinutes <= 30) {
              upcomingTasks.push({
                task,
                timeRemaining: diffMinutes
              });
            }
          }
        }
      });
      
      // 处理提醒
      for (const item of upcomingTasks) {
        // 触发即将到期事件
        this.eventBus.emit(EVENTS.TASK_UPCOMING, {
          task: item.task,
          timeRemaining: item.timeRemaining
        });
      }
      
      logger.info('TaskService', `检查到${upcomingTasks.length}个即将开始的任务`);
      
      return { success: true, count: upcomingTasks.length, tasks: upcomingTasks };
    } catch (error) {
      logger.error('TaskService', `检查即将到期任务失败: ${error.message}`, error);
      return { success: false, message: '检查即将到期任务失败' };
    }
  }
  
  /**
   * 计算任务提醒时间
   * @param {Task} task 任务对象
   * @returns {Date|null} 提醒时间
   * @private
   */
  _calculateReminderTime(task) {
    try {
      if (!task.reminder || !task.reminder.enabled) {
        return null;
      }
      
      // 构建任务时间
      const taskDate = new Date(`${task.date}T${task.startTime || '08:00'}`);
      
      // 特殊处理提前一天晚上8点的情况
      if (task.reminder.time === -1) {
        logger.info('TaskService', `处理特殊提醒类型: 提前1天(晚上8点), 任务:`, task.title);
        // 提前一天
        const reminderDate = new Date(taskDate.getTime() - 24 * 60 * 60 * 1000);
        // 设置为晚上8点
        reminderDate.setHours(20, 0, 0, 0);
        return reminderDate;
      } else {
        // 标准处理：提前X分钟提醒
        return new Date(taskDate.getTime() - task.reminder.time * 60 * 1000);
      }
    } catch (error) {
      logger.error('TaskService', '计算提醒时间出错:', error, task);
      return null;
    }
  }
  
  /**
   * 获取任务统计数据
   * 统计任务完成情况，按类型、状态等维度
   * @param {Object} dateRange 日期范围对象 {startDate, endDate}
   * @returns {Promise<Object>} 统计数据
   */
  async getTaskStatistics(dateRange = {}) {
    try {
      logger.info('TaskService', '获取任务统计数据', dateRange);
      
      // 使用日期范围获取任务，如果没有指定范围则获取所有任务
      let tasks;
      if (dateRange.startDate && dateRange.endDate) {
        tasks = await this.getTasksByDateRange(dateRange.startDate, dateRange.endDate);
      } else {
        tasks = await this.getAllTasks();
      }
      
      // 基本统计
      const stats = {
        totalTasks: tasks.length,
        completedTasks: tasks.filter(task => task.status === TaskStatus.COMPLETED).length,
        completionRate: 0,
        typeCounts: {
          habit: tasks.filter(task => task.type === TaskType.HABIT).length,
          study: tasks.filter(task => task.type === TaskType.STUDY).length,
          interest: tasks.filter(task => task.type === TaskType.INTEREST).length
        },
        typeCompletion: {
          habit: tasks.filter(task => task.type === TaskType.HABIT && task.status === TaskStatus.COMPLETED).length,
          study: tasks.filter(task => task.type === TaskType.STUDY && task.status === TaskStatus.COMPLETED).length,
          interest: tasks.filter(task => task.type === TaskType.INTEREST && task.status === TaskStatus.COMPLETED).length
        },
        overdueCount: tasks.filter(task => task.status === TaskStatus.OVERDUE).length,
        streak: await this._calculateStreak(tasks) // 计算连续完成天数
      };
      
      // 计算完成率
      if (stats.totalTasks > 0) {
        stats.completionRate = Math.round((stats.completedTasks / stats.totalTasks) * 100);
      }
      
      // 计算各类型完成率
      stats.typeCompletionRate = {
        habit: stats.typeCounts.habit > 0 
          ? Math.round((stats.typeCompletion.habit / stats.typeCounts.habit) * 100)
          : 0,
        study: stats.typeCounts.study > 0 
          ? Math.round((stats.typeCompletion.study / stats.typeCounts.study) * 100)
          : 0,
        interest: stats.typeCounts.interest > 0 
          ? Math.round((stats.typeCompletion.interest / stats.typeCounts.interest) * 100)
          : 0
      };
      
      // 按日期分组统计
      const dailyStats = this._calculateDailyStats(tasks);
      
      logger.info('TaskService', `统计完成: 总任务=${stats.totalTasks}, 完成率=${stats.completionRate}%`);
      
      // 直接返回统计数据而不是包装在summary中
      return {
        ...stats, // 扁平化返回所有统计数据
        dailyStats // 保留日常统计数据
      };
    } catch (error) {
      logger.error('TaskService', '获取任务统计数据失败', error);
      // 直接返回扁平化的数据结构
      return {
        totalTasks: 0,
        completedTasks: 0,
        completionRate: 0,
        typeCounts: { habit: 0, study: 0, interest: 0 },
        typeCompletion: { habit: 0, study: 0, interest: 0 },
        typeCompletionRate: { habit: 0, study: 0, interest: 0 },
        overdueCount: 0,
        streak: 0,
        dailyStats: []
      };
    }
  }
  
  /**
   * 计算按日期分组的统计数据
   * @param {Array} tasks 任务数组
   * @returns {Array} 按日期分组的统计数据
   * @private
   */
  _calculateDailyStats(tasks) {
    // 按日期分组
    const tasksByDate = {};
    
    tasks.forEach(task => {
      if (!task.date) return;
      
      if (!tasksByDate[task.date]) {
        tasksByDate[task.date] = [];
      }
      
      tasksByDate[task.date].push(task);
    });
    
    // 计算每日统计
    const dailyStats = [];
    
    for (const date in tasksByDate) {
      const dayTasks = tasksByDate[date];
      const completed = dayTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
      
      dailyStats.push({
        date,
        totalTasks: dayTasks.length,
        completedTasks: completed,
        completionRate: dayTasks.length > 0 ? Math.round((completed / dayTasks.length) * 100) : 0,
        typeCounts: {
          habit: dayTasks.filter(t => t.type === TaskType.HABIT).length,
          study: dayTasks.filter(t => t.type === TaskType.STUDY).length,
          interest: dayTasks.filter(t => t.type === TaskType.INTEREST).length
        }
      });
    }
    
    // 按日期排序
    dailyStats.sort((a, b) => a.date.localeCompare(b.date));
    
    return dailyStats;
  }
  
  /**
   * 计算连续完成天数
   * @param {Array} tasks 任务数组
   * @returns {Promise<Number>} 连续天数
   * @private
   */
  async _calculateStreak(tasks) {
    try {
      // 按日期分组
      const tasksByDate = {};
      
      // 提取所有日期并记录每日完成状态
      tasks.forEach(task => {
        if (!task.date) return;
        
        if (!tasksByDate[task.date]) {
          tasksByDate[task.date] = {
            hasTasks: true,
            hasCompleted: false
          };
        }
        
        // 如果当天有任何一个任务完成，则标记为已完成
        if (task.status === TaskStatus.COMPLETED) {
          tasksByDate[task.date].hasCompleted = true;
        }
      });
      
      // 获取所有日期并排序
      const dates = Object.keys(tasksByDate).sort();
      if (dates.length === 0) return 0;
      
      // 从最近的日期开始，计算连续完成天数
      const today = dateUtils.getTodayString();
      let currentDate = today;
      let streak = 0;
      
      // 从当前日期往前推，计算连续天数
      while (tasksByDate[currentDate] && tasksByDate[currentDate].hasCompleted) {
        streak++;
        
        // 获取前一天的日期
        const prevDate = new Date(currentDate);
        prevDate.setDate(prevDate.getDate() - 1);
        currentDate = dateUtils.formatDate(prevDate);
      }
      
      logger.info('TaskService', `计算连续完成天数: ${streak}天`);
      return streak;
    } catch (error) {
      logger.error('TaskService', '计算连续完成天数失败', error);
      return 0;
    }
  }
}

module.exports = TaskService; 