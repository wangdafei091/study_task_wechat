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

class TaskService {
  /**
   * 构造函数
   * @param {Object} options 选项
   * @param {TaskRepository} options.taskRepository 任务仓储
   * @param {StarService} options.starService 星星服务
   * @param {EventBus} options.eventBus 事件总线
   */
  constructor(options = {}) {
    // 初始化仓储
    this.taskRepository = options.taskRepository || new TaskRepository();
    
    // 关联服务
    this.starService = options.starService;
    
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
      
      this.eventBus.emit('task:created', { 
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
      
      // 更新任务
      const updatedTask = await this.taskRepository.update(taskId, {
        ...changes,
        modifyTime: Date.now()
      });
      
      logger.info('TaskService', `更新任务成功: "${updatedTask.title}", ID=${updatedTask.id}`);
      
      // 触发任务更新事件
      this.eventBus.emit('task:updated', { 
        task: updatedTask, 
        previousTask: task,
        changes
      });
      
      return { success: true, task: updatedTask };
    } catch (error) {
      logger.error('TaskService', `更新任务失败, ID=${taskId}`, error);
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
      // 获取要删除的任务
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        logger.warn('TaskService', `删除任务失败: 未找到ID为${taskId}的任务`);
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 保存任务信息用于事件触发
      const taskInfo = {
        id: task.id,
        title: task.title,
        date: task.date
      };
      
      // 删除任务
      await this.taskRepository.delete(taskId);
      
      logger.info('TaskService', `删除任务成功: "${task.title}", ID=${taskId}`);
      
      // 触发任务删除事件
      this.eventBus.emit('task:deleted', { 
        taskId,
        taskInfo
      });
      
      return { success: true };
    } catch (error) {
      logger.error('TaskService', `删除任务失败, ID=${taskId}`, error);
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
      // 获取任务
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        logger.warn('TaskService', `更新任务状态失败: 未找到ID为${taskId}的任务`);
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 记录之前的状态
      const previousStatus = task.status;
      
      if (previousStatus === status) {
        logger.info('TaskService', `任务状态未变化: ${status}, ID=${taskId}`);
        return { success: true, task: task };
      }
      
      // 更新状态
      const updates = { 
        status,
        modifyTime: Date.now()
      };
      
      // 处理完成逻辑
      if (previousStatus !== TaskStatus.COMPLETED && status === TaskStatus.COMPLETED) {
        // 记录完成时间
        const completionTime = Date.now();
        
        // 添加完成记录
        const completionRecord = {
          date: dateUtils.formatDate(new Date(completionTime)),
          timestamp: completionTime,
          notes: ''
        };
        
        updates.completionTime = completionTime;
        
        if (!task.completionRecords) {
          updates.completionRecords = [completionRecord];
        } else {
          updates.completionRecords = [completionRecord, ...task.completionRecords];
        }
        
        // 处理星星奖励
        if (task.isRequired) {
          logger.info('TaskService', `必做任务"${task.title}"已完成，不扣除星星`);
          updates.penaltyApplied = false;
        }
        
        if (!task.starAwarded && task.points > 0) {
          // 如果有星星服务，处理任务完成奖励
          if (this.starService) {
            try {
              // 计算积分有效期
              const expiryType = task.pointsExpiry || StarExpiryType.PERMANENT;
              
              const addStarsResult = await this.starService.addStars(
                task.points,
                expiryType,
                `完成任务: ${task.title}`,
                { sourceType: 'task', sourceId: task.id }
              );
              
              if (addStarsResult.success) {
                logger.info('TaskService', `为任务"${task.title}"添加${task.points}颗星星成功`);
                updates.starAwarded = true;
                
                // 更新积分有效期显示
                if (addStarsResult.expiryDate) {
                  updates.pointsExpiryDate = addStarsResult.expiryDate;
                }
              } else {
                logger.error('TaskService', `为任务"${task.title}"添加星星失败: ${addStarsResult.message}`);
              }
            } catch (error) {
              logger.error('TaskService', `处理任务"${task.title}"完成奖励时出错`, error);
            }
          } else {
            logger.warn('TaskService', '星星服务未初始化，无法处理任务完成奖励');
          }
        } else {
          logger.info('TaskService', `任务"${task.title}"已获得过星星或无星星奖励`);
        }
      } 
      // 处理取消完成逻辑
      else if (previousStatus === TaskStatus.COMPLETED && status !== TaskStatus.COMPLETED) {
        // 如果已获得星星，尝试扣除
        if (task.starAwarded && task.points > 0 && this.starService) {
          try {
            const consumeResult = await this.starService.consumeStars(
              task.points,
              `取消完成任务: ${task.title}`,
              { sourceType: 'task', sourceId: task.id }
            );
            
            if (consumeResult.success) {
              logger.info('TaskService', `从任务"${task.title}"扣除${task.points}颗星星成功`);
              updates.starAwarded = false;
            } else {
              logger.error('TaskService', `从任务"${task.title}"扣除星星失败: ${consumeResult.message}`);
            }
          } catch (error) {
            logger.error('TaskService', `处理任务"${task.title}"取消完成时出错`, error);
          }
        }
      }
      
      // 更新任务
      const updatedTask = await this.taskRepository.update(taskId, updates);
      
      logger.info('TaskService', `更新任务"${updatedTask.title}"状态: ${previousStatus} -> ${status}`);
      
      // 触发任务状态变更事件
      this.eventBus.emit('task:statusUpdated', { 
        task: updatedTask, 
        previousStatus,
        operationType: status === TaskStatus.COMPLETED ? 'complete' : 'reset'
      });
      
      return { success: true, task: updatedTask };
    } catch (error) {
      logger.error('TaskService', `更新任务状态失败, ID=${taskId}, 状态=${status}`, error);
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
    return this.updateTaskStatus(taskId, TaskStatus.PENDING);
  }
  
  /**
   * 标记任务为必做任务
   * @param {String} taskId 任务ID
   * @returns {Promise<Object>} 操作结果
   */
  async markTaskAsRequired(taskId) {
    try {
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        return { success: false, message: '未找到指定的任务' };
      }
      
      if (task.isRequired) {
        return { success: true, task: task, message: '任务已经是必做任务' };
      }
      
      const updatedTask = await this.taskRepository.update(taskId, {
        isRequired: true,
        modifyTime: Date.now()
      });
      
      logger.info('TaskService', `标记任务"${updatedTask.title}"为必做任务`);
      
      // 触发事件
      this.eventBus.emit('task:markedRequired', { task: updatedTask });
      
      return { success: true, task: updatedTask };
    } catch (error) {
      logger.error('TaskService', `标记必做任务失败, ID=${taskId}`, error);
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
      
      if (!task.isRequired) {
        return { success: true, task: task, message: '任务不是必做任务' };
      }
      
      const updatedTask = await this.taskRepository.update(taskId, {
        isRequired: false,
        modifyTime: Date.now()
      });
      
      logger.info('TaskService', `取消任务"${updatedTask.title}"的必做标记`);
      
      // 触发事件
      this.eventBus.emit('task:unmarkedRequired', { task: updatedTask });
      
      return { success: true, task: updatedTask };
    } catch (error) {
      logger.error('TaskService', `取消必做任务标记失败, ID=${taskId}`, error);
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
   * 处理必做任务惩罚
   * @param {Task} task 必做任务
   * @returns {Promise<Object>} 处理结果
   */
  async handleRequiredTaskPenalty(task) {
    if (!task.isRequired || task.status === TaskStatus.COMPLETED || task.penaltyApplied) {
      return { success: false, message: '任务不符合惩罚条件' };
    }
    
    try {
      // 确定惩罚星星数量
      const penaltyPoints = task.points > 0 ? task.points : 5;
      
      // 扣除星星
      let consumeResult = { success: false, message: '星星服务未初始化' };
      
      if (this.starService) {
        consumeResult = await this.starService.consumeStars(
          penaltyPoints,
          `必做任务未完成: ${task.title}`,
          { sourceType: 'penalty', sourceId: task.id }
        );
      }
      
      // 更新任务状态
      await this.taskRepository.update(task.id, {
        penaltyApplied: true,
        modifyTime: Date.now()
      });
      
      logger.info('TaskService', `处理必做任务惩罚成功: "${task.title}", 扣除${penaltyPoints}颗星星, 结果=${consumeResult.success ? '成功' : '失败'}`);
      
      // 触发事件
      this.eventBus.emit('task:penaltyApplied', { 
        task, 
        penaltyPoints,
        consumeResult
      });
      
      return {
        success: true,
        task,
        penaltyPoints,
        consumeResult
      };
    } catch (error) {
      logger.error('TaskService', `处理必做任务惩罚失败: "${task.title}"`, error);
      return { success: false, message: '处理必做任务惩罚失败: ' + error.message };
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
   * @returns {Promise<Object>} 即将到期的任务信息
   */
  async checkUpcomingTasks() {
    try {
      logger.info('TaskService', '检查即将到期任务');
      
      // 获取今天的任务
      const todayTasks = await this.getTodayTasks();
      logger.info('TaskService', `检查即将到期任务, 当前任务数:`, todayTasks.length);
      
      if (todayTasks.length === 0) {
        return null;
      }
      
      // 当前时间
      const now = Date.now();
      let upcomingTask = null;
      let minTimeRemaining = Number.MAX_VALUE;
      
      // 检查每个任务
      for (const task of todayTasks) {
        // 跳过已完成的任务
        if (task.status === TaskStatus.COMPLETED) {
          continue;
        }
        
        // 获取任务开始时间
        const startTime = this._calculateReminderTime(task);
        const startTimestamp = startTime ? startTime.getTime() : null;
        
        if (startTimestamp) {
          // 计算剩余时间（小时）
          // 修复：确保剩余时间不为负值
          const timeRemaining = Math.max(0, (startTimestamp - now) / (60 * 60 * 1000));
          
          // 判断是否即将开始
          if (timeRemaining <= 1.0) { // 1小时内的任务
            logger.info('TaskService', `任务"${task.title}"将在 ${task.startTime || '未设置'} 开始, 剩余${timeRemaining.toFixed(1)}小时`);
            
            // 如果是最近的任务
            if (timeRemaining < minTimeRemaining) {
              minTimeRemaining = timeRemaining;
              upcomingTask = task;
            }
          }
        }
      }
      
      if (upcomingTask) {
        const timeRemaining = minTimeRemaining;
        
        // 返回任务和剩余时间信息
        return {
          task: upcomingTask,
          timeRemaining: timeRemaining
        };
      }
      
      return null;
    } catch (error) {
      logger.error('TaskService', '检查即将到期任务失败', error);
      return null;
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
      
      return {
        summary: stats,
        dailyStats
      };
    } catch (error) {
      logger.error('TaskService', '获取任务统计数据失败', error);
      return {
        summary: {
          totalTasks: 0,
          completedTasks: 0,
          completionRate: 0,
          typeCounts: { habit: 0, study: 0, interest: 0 },
          typeCompletion: { habit: 0, study: 0, interest: 0 },
          typeCompletionRate: { habit: 0, study: 0, interest: 0 },
          overdueCount: 0,
          streak: 0
        },
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

  /**
   * 检查必做任务
   * 查找已过期未完成的必做任务并应用惩罚
   * @returns {Promise<Object>} 包含处理结果的对象
   */
  async checkRequiredTasks() {
    logger.info('TaskService', '开始检查必做任务');
    
    try {
      // 获取所有任务
      const allTasks = await this.getAllTasks();
      const today = dateUtils.formatDate(new Date());
      const penaltyTasks = [];
      let updated = false;
      
      // 查找需要处理的任务
      for (const task of allTasks) {
        // 找出已过期、未完成、标记为必做且未应用惩罚的任务
        if (task.isRequired === true && 
            task.status === 0 && 
            task.date < today && 
            !task.penaltyApplied) {
          
          // 标记已应用惩罚
          task.penaltyApplied = true;
          task.status = TaskStatus.OVERDUE;
          updated = true;
          
          // 记录需要扣除积分的任务
          penaltyTasks.push({
            taskId: task.id,
            title: task.title,
            points: task.points || 5  // 使用任务积分或默认值5
          });
          
          logger.info('TaskService', `应用惩罚: ${task.id}, 任务: ${task.title}`);
        }
      }
      
      // 如果有任务更新，保存数据
      if (updated) {
        // 批量保存更新的任务
        await this.taskRepository.saveAll(allTasks);
        
        // 处理积分扣除
        if (penaltyTasks.length > 0) {
          await this._applyPenalties(penaltyTasks);
        }
        
        // 触发任务状态变更事件
        this.eventBus.emit('task:status:updated', { tasks: allTasks });
        
        return { 
          success: true, 
          penaltyApplied: true, 
          penaltyTasks: penaltyTasks,
          taskCount: penaltyTasks.length
        };
      }
      
      return { 
        success: true, 
        penaltyApplied: false,
        taskCount: 0
      };
    } catch (error) {
      logger.error('TaskService', '检查必做任务失败', error);
      return { 
        success: false, 
        error: error.message,
        taskCount: 0
      };
    }
  }
  
  /**
   * 应用惩罚，扣除积分
   * @param {Array} penaltyTasks 需要扣除积分的任务数组
   * @private
   */
  async _applyPenalties(penaltyTasks) {
    logger.info('TaskService', `开始应用惩罚，任务数量: ${penaltyTasks.length}`);
    
    try {
      // 计算总扣除积分
      const totalPenalty = penaltyTasks.reduce((sum, task) => sum + task.points, 0);
      
      // 获取星星服务实例
      const { getService } = require('../utils/serviceManager');
      const starService = getService('starService');
      
      if (!starService) {
        logger.error('TaskService', '无法获取星星服务实例');
        throw new Error('无法获取星星服务实例');
      }
      
      // 使用星星服务扣除星星
      const result = await starService.reduceStars(totalPenalty, 'penalty', {
        reason: '未完成必做任务',
        taskCount: penaltyTasks.length
      });
      
      logger.info('TaskService', `星星扣除结果: ${result.success ? '成功' : '失败'}, 扣除数量: ${totalPenalty}`);
      
      // 获取消息服务
      const messageService = getService('messageService');
      
      // 为每个任务创建惩罚消息
      for (const task of penaltyTasks) {
        if (messageService) {
          await messageService.createPenaltyMessage(task.taskId, task.title, task.points);
        } else {
          // 如果没有消息服务，则使用旧的消息管理器
          const messageManager = require('../utils/messageManager.js');
          const penaltyMessage = {
            id: 'msg_penalty_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            type: 'penalty',
            taskId: task.taskId,
            title: '任务未完成',
            summary: `必做任务"${task.title}"未完成，扣除${task.points}颗星星`,
            timestamp: Date.now(),
            isRead: false,
            icon: '⚠️'
          };
          messageManager.addMessage(penaltyMessage);
        }
      }
      
      return { success: true, penaltyTasks };
    } catch (error) {
      logger.error('TaskService', '应用惩罚失败', error);
      throw error;
    }
  }
}

module.exports = TaskService; 