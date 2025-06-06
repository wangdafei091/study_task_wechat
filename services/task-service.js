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
const { EVENTS, ERROR_MESSAGES } = require('../utils/constants');

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
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 任务列表
   */
  async getAllTasks(userId = null) {
    try {
      let tasks;
      
      if (userId) {
        // 获取指定用户的所有任务
        const allTasks = await this.taskRepository.getAll();
        tasks = allTasks.filter(task => task.userId === userId);
      } else {
        // 获取所有用户的任务
        tasks = await this.taskRepository.getAll();
      }
      
      logger.info('TaskService', `获取所有任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskService', '获取所有任务失败', error);
      return [];
    }
  }
  
  /**
   * 获取任务详情
   * @param {String} taskId 任务ID 
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @returns {Promise<Task|null>} 任务对象或null
   */
  async getTaskById(taskId, userId = null) {
    try {
      const task = await this.taskRepository.getById(taskId);
      
      // 如果指定了用户ID，验证访问权限
      if (task && userId && task.userId !== userId) {
        logger.warn('TaskService', `用户${userId}尝试访问不属于自己的任务${taskId}`);
        return null;
      }
      
      return task;
    } catch (error) {
      logger.error('TaskService', `获取任务详情失败, ID=${taskId}`, error);
      return null;
    }
  }
  
  /**
   * 获取今日任务
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 今日任务列表
   */
  async getTodayTasks(userId = null) {
    // 如果不传userId，则获取所有任务（共享模式）
    const tasks = await this.taskRepository.getTodayTasks(userId);
    return tasks;
  }
  
  /**
   * 按日期获取任务
   * @param {String} date 日期字符串，格式为YYYY-MM-DD
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 指定日期的任务列表
   */
  async getTasksByDate(date, userId = null) {
    try {
      const tasks = await this.taskRepository.getTasksByDate(date, userId);
      logger.info('TaskService', `获取${date}任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
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
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 日期范围内的任务列表
   */
  async getTasksByDateRange(startDate, endDate, userId = null) {
    try {
      const tasks = await this.taskRepository.getTasksByDateRange(startDate, endDate, userId);
      logger.info('TaskService', `获取${startDate}至${endDate}的任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskService', `获取${startDate}至${endDate}的任务失败`, error);
      return [];
    }
  }
  
  /**
   * 获取必做任务
   * @param {String} date 可选的日期筛选，格式为YYYY-MM-DD
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 必做任务列表
   */
  async getRequiredTasks(date, userId = null) {
    try {
      const tasks = await this.taskRepository.getRequiredTasks(date, userId);
      logger.info('TaskService', `获取必做任务成功${date ? `, 日期=${date}` : ''}${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskService', `获取必做任务失败${date ? `, 日期=${date}` : ''}`, error);
      return [];
    }
  }
  
  /**
   * 获取过期未完成的任务
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 过期未完成的任务列表
   */
  async getExpiredIncompleteTasks(userId = null) {
    try {
      const tasks = await this.taskRepository.getExpiredIncompleteTask(userId);
      logger.info('TaskService', `获取过期未完成任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
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
      // 确保任务有userId - 如果没有提供，使用当前用户ID
      if (!taskData.userId) {
        // 通过注入的用户服务获取当前用户ID
        if (this.userService) {
          taskData.userId = this.userService.getCurrentUserId();
          logger.info('TaskService', `为任务设置用户ID: ${taskData.userId}`);
        } else {
          // 如果用户服务不可用，默认设为parent
          taskData.userId = 'parent';
          logger.warn('TaskService', '用户服务不可用，任务用户ID设为默认值: parent');
        }
      }

      // 创建任务领域模型实例
      const task = new Task(taskData);
      
      // 验证任务
      const errors = task.validate();
      if (errors.length > 0) {
        logger.warn('TaskService', '创建任务失败: 数据验证不通过', { errors });
        return { success: false, message: errors.join(', ') };
      }
      
      // 修复自定义重复任务的日期不匹配问题
      if (task.repeat && task.repeat.type === 'custom' && task.repeat.days && task.repeat.days.length > 0) {
        const startDate = new Date(task.date);
        const startDayOfWeek = startDate.getDay();
        
        // 统一数据类型：确保task.repeat.days中的元素都是数字类型
        const selectedDays = task.repeat.days.map(day => typeof day === 'string' ? parseInt(day) : day);
        
        logger.info('TaskService', `检查自定义重复任务日期匹配: 开始日期=${task.date}, 星期=${startDayOfWeek}, 选择的星期=${selectedDays}`);
        logger.info('TaskService', `数据类型修复: 原始days=${JSON.stringify(task.repeat.days)}, 转换后=${JSON.stringify(selectedDays)}`);
        
        // 检查开始日期的星期是否在选择的重复星期中
        if (!selectedDays.includes(startDayOfWeek)) {
          logger.warn('TaskService', `开始日期的星期(${startDayOfWeek})不在选择的重复星期中(${selectedDays})，需要调整日期`);
          
          // 找到第一个符合条件的日期
          const endDate = new Date(task.repeat.endDate);
          // 标准化结束日期，重置时间为午夜，确保日期比较准确
          endDate.setHours(0, 0, 0, 0);
          
          let adjustedDate = new Date(startDate);
          // 标准化调整日期，重置时间为午夜，确保日期比较准确
          adjustedDate.setHours(0, 0, 0, 0);
          
          let foundValidDate = false;
          
          logger.info('TaskService', `开始搜索符合条件的日期: 开始=${adjustedDate.toISOString()}, 结束=${endDate.toISOString()}, 选择星期=${selectedDays}`);
          
          // 最多检查21天，确保能找到符合条件的日期（扩大搜索范围）
          for (let i = 0; i <= 20; i++) {
            const currentDay = adjustedDate.getDay();
            const dateStr = require('../utils/dateUtils').formatDate(adjustedDate);
            const dayMatches = selectedDays.includes(currentDay);
            const dateInRange = adjustedDate <= endDate;
            
            logger.debug('TaskService', `检查日期: ${dateStr} (星期${currentDay}), 星期匹配=${dayMatches}, 日期范围内=${dateInRange}`);
            
            if (dayMatches && dateInRange) {
              // 找到符合条件的日期，更新任务日期
              logger.info('TaskService', `找到符合条件的日期: ${dateStr} (星期${currentDay})`);
              
              task.date = dateStr;
              task.repeat.startDate = dateStr;
              foundValidDate = true;
              break;
            }
            
            // 移动到下一天
            adjustedDate.setDate(adjustedDate.getDate() + 1);
          }
          
          if (!foundValidDate) {
            const dateUtils = require('../utils/dateUtils');
            const startDateStr = dateUtils.formatDate(startDate);
            const endDateStr = dateUtils.formatDate(endDate);
            const selectedDayNames = selectedDays.map(day => {
              const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
              return dayNames[day];
            }).join('、');
            
            logger.error('TaskService', `无法在指定日期范围内找到符合重复条件的日期`, {
              startDate: startDateStr,
              endDate: endDateStr,
              selectedDays: selectedDayNames,
              searchRange: '21天'
            });
            
            return { 
              success: false, 
              message: `无法在日期范围(${startDateStr}到${endDateStr})内找到符合重复星期(${selectedDayNames})的日期，请检查日期设置` 
            };
          }
        } else {
          logger.info('TaskService', '开始日期的星期匹配选择的重复星期，无需调整');
        }
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
            // 统一数据类型：确保task.repeat.days中的元素都是数字类型
            const selectedDays = task.repeat.days.map(day => typeof day === 'string' ? parseInt(day) : day);
            
            logger.info('TaskService', `自定义重复任务生成: 选择的星期=${selectedDays}, 日期范围=${task.repeat.startDate}到${task.repeat.endDate}`);
            
            for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
              const day = date.getDay();
              const dateStr = require('../utils/dateUtils').formatDate(date);
              
              if (selectedDays.includes(day)) {
                repeatDates.push(new Date(date));
                logger.info('TaskService', `添加重复任务日期: ${dateStr} (星期${day})`);
              } else {
                logger.debug('TaskService', `跳过日期: ${dateStr} (星期${day}), 不在选择的星期中`);
              }
            }
            
            logger.info('TaskService', `自定义重复任务生成完成: 共生成${repeatDates.length}个日期`);
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
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @returns {Promise<Object>} 更新结果
   */
  async updateTask(taskId, changes, userId = null) {
    try {
      // 获取原任务
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        logger.warn('TaskService', `更新任务失败: 未找到ID为${taskId}的任务`);
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 验证用户权限
      if (userId && task.userId !== userId) {
        logger.warn('TaskService', `用户${userId}尝试更新不属于自己的任务${taskId}`);
        return { success: false, message: '无权限操作此任务' };
      }
      
      // 保存原始状态
      const originalStatus = task.status;
      
      // 更新任务
      task.update(changes);
      
      // 保存更新后的任务
      const updatedTask = await this.taskRepository.save(task);
      
      logger.info('TaskService', `更新任务成功: "${updatedTask.title}", ID=${updatedTask.id}${userId ? `, 用户=${userId}` : ''}`);
      
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
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @param {Boolean} suppressMessage 是否抑制消息创建，用于批量操作
   * @returns {Promise<Object>} 删除结果
   */
  async deleteTask(taskId, userId = null, suppressMessage = false) {
    try {
      // 获取任务信息，用于事件传递
      const taskInfo = await this.taskRepository.getById(taskId);
      
      if (!taskInfo) {
        logger.warn('TaskService', `删除任务失败: 未找到ID为${taskId}的任务`);
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 验证用户权限
      if (userId && taskInfo.userId !== userId) {
        logger.warn('TaskService', `用户${userId}尝试删除不属于自己的任务${taskId}`);
        return { success: false, message: '无权限操作此任务' };
      }
      
      // 删除任务
      await this.taskRepository.delete(taskId);
      
      logger.info('TaskService', `删除任务成功: ${taskId}${userId ? `, 用户=${userId}` : ''}${suppressMessage ? ', 抑制消息' : ''}`);
      
      // 只有在不抑制消息时才触发任务删除事件
      if (!suppressMessage) {
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
      }
      
      return { success: true };
    } catch (error) {
      logger.error('TaskService', `删除任务失败: ${error.message}`, error);
      return { success: false, message: '删除任务失败: ' + error.message };
    }
  }
  
  /**
   * 更新任务状态
   * @param {String} taskId 任务ID
   * @param {Number} status 任务状态 (0:未完成, 1:已完成)
   * @param {String} userId 可选的用户ID，用于积分分配（共享执行模式）
   * @returns {Promise<Object>} 操作结果
   */
  async updateTaskStatus(taskId, status, userId = null) {
    try {
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        logger.warn('TaskService', `更新任务状态失败: 未找到ID为${taskId}的任务`);
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 共享执行模式：移除权限检查，允许任何用户完成任务
      logger.info('TaskService', `共享执行模式: 用户${userId || '未指定'}正在更新任务状态${taskId}`);
      
      // 记录原始状态
      const previousStatus = task.status;
      
      // 状态没有变化，直接返回
      if (previousStatus === status) {
        logger.info('TaskService', `任务状态未发生变化: ${taskId}, 状态=${status}${userId ? `, 用户=${userId}` : ''}`);
        return { success: true, task, unchanged: true };
      }
      
      // 设置新状态
      logger.info('TaskService', `准备设置任务状态: ${task.title}, 当前状态=${task.status}, 新状态=${status}${userId ? `, 用户=${userId}` : ''}`);
      
      // 如果状态变为完成，使用Task模型的complete方法来正确设置completionTime
      if (status === 1 && previousStatus !== 1) {
        logger.info('TaskService', `任务状态变为完成，调用complete方法设置completionTime: ${task.title}`);
        task.complete();
        logger.info('TaskService', `任务complete方法调用完成: ${task.title}, completionTime=${task.completionTime}`);
      } else {
        task.status = status;
        logger.info('TaskService', `任务状态已设置: ${task.title}, 状态=${task.status}, 类型=${typeof task.status}`);
      }

      // 如果任务以前未获得过星星，且不是必做任务，则分配积分
      if (!task.starAwarded && !task.isRequired && this.starService) {
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
            {
              sourceType: 'task_complete',
              sourceId: task.id,
              userId: userId || task.userId // 优先分配给当前执行用户，如果没有则分配给任务创建者
            }
          );
          
          logger.info('TaskService', `积分添加结果:`, addResult);
          logger.info('TaskService', `积分分配给用户: ${userId || task.userId} (当前执行用户=${userId}, 任务创建者=${task.userId})`);
          
          if (addResult.success) {
            logger.info('TaskService', `任务 "${task.title}" 获得 ${task.points} 颗星星`);
          } else {
            logger.warn('TaskService', `任务 "${task.title}" 积分添加失败: ${addResult.message}`);
          }
        }
      } else if (task.starAwarded) {
        logger.info('TaskService', `任务 "${task.title}" 已经获得过星星，跳过积分分配`);
      } else if (task.isRequired) {
        logger.info('TaskService', `任务 "${task.title}" 是必做任务，完成后不获得星星奖励`);
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
      
      // 触发状态更新事件，传递操作者信息
      this.eventBus.emit(EVENTS.TASK_STATUS_UPDATED, {
        task: savedTask,
        previousStatus,
        operationType,
        operatorUserId: userId // 传递操作者信息
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
        
        // 触发完成事件，传递操作者信息
        this.eventBus.emit(EVENTS.TASK_COMPLETED, { 
          task: savedTask,
          operatorUserId: userId // 传递操作者信息
        });
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
    try {
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        logger.warn('TaskService', `重置任务失败: 未找到ID为${taskId}的任务`);
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 共享执行模式：移除权限检查，允许任何用户重置任务
      logger.info('TaskService', `共享执行模式: 用户${userId || '未指定'}正在重置任务${taskId}`);
      
      // 如果任务未完成，无需重置
      if (!task.isCompleted()) {
        logger.info('TaskService', `任务未完成，无需重置: ${task.title}${userId ? `, 用户=${userId}` : ''}`);
        return { success: true, task, unchanged: true };
      }
      
      // 检查任务是否可以取消打勾（锁定状态检查）
      let lastExchangeTime = null;
      if (this.rewardService) {
        lastExchangeTime = await this.rewardService.getLastExchangeTime();
      }
      
      if (!task.canBeUnchecked(lastExchangeTime)) {
        logger.warn('TaskService', `${ERROR_MESSAGES.TASK_LOCKED}: ${task.title}, 完成时间=${task.completionTime}, 最后兑换时间=${lastExchangeTime}`);
        return { 
          success: false, 
          message: ERROR_MESSAGES.TASK_LOCKED,
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
            sourceId: task.id,
            userId: userId || task.userId // 优先从当前执行用户扣减，如果没有则从任务创建者扣减
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
        logger.info('TaskService', `星星扣减自用户: ${userId || task.userId} (当前执行用户=${userId}, 任务创建者=${task.userId})`);
      }
      
      // 重置任务状态和星星获得标记
      task.reset();
      task.starAwarded = false;
      task.modifyTime = Date.now();
      
      // 保存任务
      const savedTask = await this.taskRepository.save(task);
      
      logger.info('TaskService', `任务重置成功: ${savedTask.title}, ID=${savedTask.id}${userId ? `, 用户=${userId}` : ''}`);
      
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
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @returns {Promise<Object>} 操作结果
   */
  async markTaskAsRequired(taskId, userId = null) {
    try {
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 验证用户权限
      if (userId && task.userId !== userId) {
        logger.warn('TaskService', `用户${userId}尝试标记不属于自己的任务为必做${taskId}`);
        return { success: false, message: '无权限操作此任务' };
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
      
      logger.info('TaskService', `将任务标记为必做: "${updatedTask.title}", ID=${updatedTask.id}${userId ? `, 用户=${userId}` : ''}`);
      
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
   * @param {String} userId 可选的用户ID，用于验证访问权限
   * @returns {Promise<Object>} 操作结果
   */
  async unmarkTaskAsRequired(taskId, userId = null) {
    try {
      const task = await this.taskRepository.getById(taskId);
      
      if (!task) {
        return { success: false, message: '未找到指定的任务' };
      }
      
      // 验证用户权限
      if (userId && task.userId !== userId) {
        logger.warn('TaskService', `用户${userId}尝试取消不属于自己的任务必做标记${taskId}`);
        return { success: false, message: '无权限操作此任务' };
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
      
      logger.info('TaskService', `取消任务的必做标记: "${updatedTask.title}", ID=${updatedTask.id}${userId ? `, 用户=${userId}` : ''}`);
      
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
      
      logger.info('TaskService', `开始处理必做任务惩罚: "${task.title}", 惩罚积分=${penaltyPoints}颗星`);
      
      // 获取小朋友用户ID（必做任务惩罚固定从小朋友扣除）
      let childUserId = null;
      if (this.serviceManager && this.serviceManager.getUserService) {
        const userService = this.serviceManager.getUserService();
        if (userService) {
          const childUser = userService.getUserByRole('child');
          if (childUser) {
            childUserId = childUser.id;
            logger.info('TaskService', `获取小朋友用户ID成功: ${childUserId}`);
          } else {
            logger.warn('TaskService', '未找到小朋友用户，使用默认child用户ID');
            childUserId = 'child'; // 使用默认ID
          }
        }
      }
      
      if (!childUserId) {
        logger.warn('TaskService', '无法获取小朋友用户ID，使用默认child用户ID');
        childUserId = 'child'; // 兜底方案
      }
      
      // 标记已经应用惩罚
      task.penaltyApplied = true;
      task.modifyTime = Date.now();
      
      // 保存更新后的任务
      const updatedTask = await this.taskRepository.save(task);
      
      // 扣除积分 - 固定从小朋友账户扣除
      if (this.starService && penaltyPoints > 0) {
        logger.info('TaskService', `执行必做任务惩罚扣除: 从用户${childUserId}扣除${penaltyPoints}颗星星`);
        
        const consumeResult = await this.starService.consumeStars(
          penaltyPoints,
          `必做任务惩罚: ${task.title}`,
          {
            sourceType: 'task_penalty',
            sourceId: task.id,
            userId: childUserId,     // 固定从小朋友扣除
            operator: 'system'       // 标记为系统操作
          }
        );
        
        if (!consumeResult.success) {
          logger.error('TaskService', `惩罚扣除积分失败: ${consumeResult.message}, 用户=${childUserId}`);
        } else {
          logger.info('TaskService', `惩罚扣除积分成功: 从用户${childUserId}扣除${penaltyPoints}颗星星`);
        }
      }
      
      logger.info('TaskService', `已对必做任务应用惩罚: "${task.title}", 扣除${penaltyPoints}颗星, 目标用户=${childUserId}`);
      
      // 触发惩罚事件
      this.eventBus.emit(EVENTS.TASK_PENALTY_APPLIED, {
        task: updatedTask,
        penaltyPoints,
        targetUserId: childUserId,  // 添加目标用户ID
        operator: 'system',         // 标记为系统操作
        reason: '必做任务未完成'
      });
      
      return { 
        success: true, 
        task: updatedTask, 
        penaltyPoints,
        targetUserId: childUserId
      };
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
      logger.info('TaskService', '开始检查即将到期任务');
      
      // 获取今天的任务
      const tasks = await this.taskRepository.getTodayTasks();
      
      if (!tasks || tasks.length === 0) {
        logger.info('TaskService', '今天没有任务');
        return { success: true, count: 0, tasks: [] };
      }

      const current = new Date();
      const upcomingTasks = [];
      
      logger.info('TaskService', `检查${tasks.length}个今日任务的提醒状态`);

      // 筛选所有未完成的任务（支持所有任务类型）
      tasks.forEach(task => {
        // 处理所有类型的未完成任务
        if (task.status === TaskStatus.PENDING) {
          logger.debug('TaskService', `检查任务: ${task.title} (${task.type})`, {
            hasReminder: !!(task.reminder && task.reminder.enabled),
            reminderTime: task.reminder?.time,
            startTime: task.startTime
          });
          
          // 检查是否设置了提醒
          if (!task.reminder || !task.reminder.enabled) {
            logger.debug('TaskService', `任务${task.title}未设置提醒，跳过`);
            return;
          }
          
          // 构建任务开始时间
          let taskStartTime;
          if (task.startTime) {
            // 有具体开始时间的任务
            taskStartTime = new Date(`${task.date}T${task.startTime}`);
          } else {
            // 全天任务，只支持提前1天晚上8点提醒
            if (task.reminder.time !== -1) {
              logger.debug('TaskService', `全天任务${task.title}只支持提前1天提醒，跳过`);
              return;
            }
            // 为全天任务设置虚拟开始时间（第二天0点）
            taskStartTime = new Date(`${task.date}T00:00`);
          }
          
          // 计算提醒时间
          let reminderTime;
          if (task.reminder.time === -1) {
            // 特殊处理：提前一天晚上8点
            reminderTime = new Date(taskStartTime.getTime() - 24 * 60 * 60 * 1000);
            reminderTime.setHours(20, 0, 0, 0);
            logger.debug('TaskService', `任务${task.title}设置为提前1天晚上8点提醒`, {
              taskStartTime: taskStartTime.toISOString(),
              reminderTime: reminderTime.toISOString()
            });
          } else {
            // 标准处理：提前X分钟提醒
            reminderTime = new Date(taskStartTime.getTime() - task.reminder.time * 60 * 1000);
            logger.debug('TaskService', `任务${task.title}设置为提前${task.reminder.time}分钟提醒`, {
              taskStartTime: taskStartTime.toISOString(),
              reminderTime: reminderTime.toISOString()
            });
          }
          
          // 计算当前时间到任务开始时间的差异（分钟）
          const diffMinutes = Math.floor((taskStartTime - current) / (1000 * 60));
          
          // 计算当前时间到提醒时间的差异（分钟）
          const reminderDiffMinutes = Math.floor((reminderTime - current) / (1000 * 60));
          
          logger.debug('TaskService', `任务${task.title}时间计算`, {
            currentTime: current.toISOString(),
            taskStartTime: taskStartTime.toISOString(),
            reminderTime: reminderTime.toISOString(),
            diffMinutes,
            reminderDiffMinutes,
            shouldRemind: reminderDiffMinutes <= 0 && diffMinutes > 0
          });
          
          // 如果已经到了提醒时间且任务还未开始，则添加到提醒列表
          if (reminderDiffMinutes <= 0 && diffMinutes > 0) {
            logger.info('TaskService', `发现需要提醒的任务: ${task.title} (${task.type})`, {
              timeRemaining: diffMinutes,
              reminderType: task.reminder.time === -1 ? '提前1天晚上8点' : `提前${task.reminder.time}分钟`
            });
            
            upcomingTasks.push({
              task,
              timeRemaining: diffMinutes,
              reminderType: task.reminder.time === -1 ? '提前1天晚上8点' : `提前${task.reminder.time}分钟`
            });
          }
        }
      });

      // 处理提醒事件
      for (const item of upcomingTasks) {
        // 触发即将到期事件
        this.eventBus.emit(EVENTS.TASK_UPCOMING, {
          task: item.task,
          timeRemaining: item.timeRemaining
        });
        
        logger.info('TaskService', `触发任务提醒事件: ${item.task.title}`, {
          timeRemaining: item.timeRemaining,
          reminderType: item.reminderType
        });
      }

      logger.info('TaskService', `检查完成，发现${upcomingTasks.length}个需要提醒的任务`);
      
      return { success: true, count: upcomingTasks.length, tasks: upcomingTasks };
    } catch (error) {
      logger.error('TaskService', `检查即将到期任务失败: ${error.message}`, error);
      return { success: false, message: '检查即将到期任务失败' };
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