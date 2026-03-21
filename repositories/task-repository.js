/**
 * task-repository.js - 任务仓储
 * 
 * 提供任务实体的存储和检索，继承自基础仓储类
 */

const BaseRepository = require('./base-repository');
const { Task } = require('../models/task');
const logger = require('../utils/logger');

class TaskRepository extends BaseRepository {
  /**
   * 构造函数
   * @param {StorageAdapter} storageAdapter 可选的存储适配器
   * @param {Object} options 选项
   */
  constructor(storageAdapter, options = {}) {
    const storageKey = options.storageKey || 'taskData';
    super(storageKey, Task, {
      namespace: options.namespace || '',
      useCache: options.useCache !== false,
      cacheExpiry: options.cacheExpiry || 60000,
      cacheTTL: options.cacheTTL || 10000
    });
    
    // 如果提供了存储适配器，则使用它替换默认的
    if (storageAdapter) {
      this.storageAdapter = storageAdapter;
    }
    
    logger.info('TaskRepository', '初始化任务仓储');
  }
  
  /**
   * 获取今天的任务
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 今天的任务列表
   */
  async getTodayTasks(userId = null) {
    const today = this._formatDate(new Date());
    
    try {
      const tasks = await this.query(task => {
        // 用户过滤
        if (userId && task.userId !== userId) {
          return false;
        }
        
        // 对于重复任务，检查是否匹配今天的日期
        if (task.repeat && task.repeat.type !== 'none') {
          // 检查今天是否在重复任务的有效期内
          const taskDate = new Date(task.date);
          const taskDateStr = this._formatDate(taskDate);
          return taskDateStr === today;
        }
        
        // 对于普通任务，直接比较日期
        return task.date === today;
      });
      
      logger.info('TaskRepository', `获取今天任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
      
      // 使用习惯优先+开始时间顺序排序
      return this._sortTasksByHabitAndTime(tasks);
    } catch (error) {
      logger.error('TaskRepository', '获取今天任务失败', error);
      return [];
    }
  }
  
  /**
   * 获取指定日期的任务
   * @param {String} date 日期字符串(YYYY-MM-DD)
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 指定日期的任务列表
   */
  async getTasksByDate(date, userId = null) {
    if (!date) {
      logger.warn('TaskRepository', '尝试获取无效日期的任务');
      return [];
    }
    
    try {
      const tasks = await this.query(task => {
        // 用户过滤
        if (userId && task.userId !== userId) {
          return false;
        }
        
        // 对于重复任务，检查是否匹配指定日期
        if (task.repeat && task.repeat.type !== 'none') {
          // 检查指定日期是否在重复任务的有效期内
          const taskDate = new Date(task.date);
          const taskDateStr = this._formatDate(taskDate);
          return taskDateStr === date;
        }
        
        // 对于普通任务，直接比较日期
        return task.date === date;
      });
      
      logger.info('TaskRepository', `获取${date}任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
      
      // 使用习惯优先+开始时间顺序排序
      return this._sortTasksByHabitAndTime(tasks);
    } catch (error) {
      logger.error('TaskRepository', `获取${date}任务失败`, error);
      return [];
    }
  }
  
  /**
   * 获取指定日期范围的任务
   * @param {String} startDate 开始日期字符串(YYYY-MM-DD)
   * @param {String} endDate 结束日期字符串(YYYY-MM-DD)
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 指定日期范围的任务列表
   */
  async getTasksByDateRange(startDate, endDate, userId = null) {
    if (!startDate || !endDate) {
      logger.warn('TaskRepository', '尝试使用无效日期范围获取任务');
      return [];
    }
    
    try {
      const tasks = await this.query(task => {
        // 用户过滤
        if (userId && task.userId !== userId) {
          return false;
        }
        
        // 对于重复任务，检查是否有实例在指定日期范围内
        if (task.repeat && task.repeat.type !== 'none') {
          // 简单实现：只检查任务日期是否在范围内
          return task.date >= startDate && task.date <= endDate;
        }
        
        // 对于普通任务，直接比较日期
        return task.date >= startDate && task.date <= endDate;
      });
      
      logger.info('TaskRepository', `获取${startDate}至${endDate}任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
      
      return tasks;
    } catch (error) {
      logger.error('TaskRepository', `获取${startDate}至${endDate}任务失败`, error);
      return [];
    }
  }
  
  /**
   * 获取父任务的所有子任务
   * @param {String} parentTaskId 父任务ID
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 子任务列表
   */
  async getChildTasks(parentTaskId, userId = null) {
    if (!parentTaskId) {
      logger.warn('TaskRepository', '尝试使用无效的父任务ID获取子任务');
      return [];
    }
    
    try {
      const tasks = await this.query(task => {
        // 用户过滤
        if (userId && task.userId !== userId) {
          return false;
        }
        
        return task.parentTaskId === parentTaskId;
      });
      
      logger.info('TaskRepository', `获取父任务${parentTaskId}的子任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskRepository', `获取父任务${parentTaskId}的子任务失败`, error);
      return [];
    }
  }
  
  /**
   * 获取过期未完成的任务
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 过期未完成的任务列表
   */
  async getExpiredIncompleteTask(userId = null) {
    const today = this._formatDate(new Date());
    
    try {
      const tasks = await this.query(task => {
        // 用户过滤
        if (userId && task.userId !== userId) {
          return false;
        }
        
        return task.isExpired();
      });
      
      logger.info('TaskRepository', `获取过期未完成任务成功${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskRepository', '获取过期未完成任务失败', error);
      return [];
    }
  }
  
  /**
   * 获取必做任务
   * @param {String} date 可选的日期筛选(YYYY-MM-DD)
   * @param {String} userId 可选的用户ID，不传则获取所有用户的任务
   * @returns {Promise<Array>} 必做任务列表
   */
  async getRequiredTasks(date = null, userId = null) {
    try {
      const tasks = await this.query(task => {
        // 用户过滤
        if (userId && task.userId !== userId) {
          return false;
        }
        
        const isRequired = task.isRequired === true;
        
        if (date) {
          // 如果指定了日期，同时筛选日期
          return isRequired && task.date === date;
        }
        
        return isRequired;
      });
      
      logger.info('TaskRepository', `获取必做任务成功${date ? `, 日期=${date}` : ''}${userId ? `, 用户=${userId}` : ''}, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskRepository', `获取必做任务失败${date ? `, 日期=${date}` : ''}`, error);
      return [];
    }
  }
  
  /**
   * 创建重复任务实例
   * @param {Task} task 需要生成重复实例的任务
   * @param {String} date 实例日期
   * @returns {Promise<Task>} 创建的任务实例
   */
  async createTaskInstance(task, date) {
    if (!task || !date) {
      logger.warn('TaskRepository', '尝试使用无效参数创建任务实例');
      return null;
    }
    
    try {
      // 创建子任务实例
      const childTask = task.createChildTask(date);
      
      if (!childTask) {
        logger.warn('TaskRepository', `创建任务实例失败, 父任务ID=${task.id}`);
        return null;
      }
      
      // 保存到存储
      const savedTask = await this.save(childTask);
      
      logger.info('TaskRepository', `创建任务实例成功, 父任务ID=${task.id}, 子任务ID=${savedTask.id}`);
      return savedTask;
    } catch (error) {
      logger.error('TaskRepository', `创建任务实例失败, 父任务ID=${task.id}`, error);
      return null;
    }
  }
  
  /**
   * 批量创建重复任务实例
   * @param {Task} task 需要生成重复实例的任务
   * @param {Array<String>} dates 实例日期数组
   * @returns {Promise<Array<Task>>} 创建的任务实例数组
   */
  async createTaskInstances(task, dates) {
    if (!task || !Array.isArray(dates) || dates.length === 0) {
      logger.warn('TaskRepository', '尝试使用无效参数批量创建任务实例');
      return [];
    }
    
    try {
      // 创建子任务实例
      const childTasks = dates.map(date => task.createChildTask(date))
        .filter(childTask => childTask !== null);
      
      if (childTasks.length === 0) {
        logger.warn('TaskRepository', `批量创建任务实例失败, 父任务ID=${task.id}`);
        return [];
      }
      
      // 保存到存储
      const savedTasks = await this.saveAll(childTasks);
      
      logger.info('TaskRepository', `批量创建任务实例成功, 父任务ID=${task.id}, 数量=${savedTasks.length}`);
      return savedTasks;
    } catch (error) {
      logger.error('TaskRepository', `批量创建任务实例失败, 父任务ID=${task.id}`, error);
      return [];
    }
  }
  
  /**
   * 获取指定用户的所有任务
   * @param {String} userId 用户ID
   * @returns {Promise<Array>} 该用户的任务列表
   */
  async getByUserId(userId) {
    if (!userId) {
      logger.warn('TaskRepository', 'getByUserId: userId 为空');
      return [];
    }
    try {
      const tasks = await this.query(task => task.userId === userId);
      logger.debug('TaskRepository', `按用户ID查询任务, userId=${userId}, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskRepository', `按用户ID查询任务失败, userId=${userId}`, error);
      return [];
    }
  }

  /**
   * 格式化日期为YYYY-MM-DD格式
   * @private
   * @param {Date} date 日期对象
   * @returns {String} 格式化后的日期字符串
   */
  _formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  /**
   * 使用必做优先+时间顺序对任务排序
   * @private
   * @param {Array} tasks 任务数组
   * @returns {Array} 排序后的任务数组
   */
  _sortTasksByHabitAndTime(tasks) {
    if (!Array.isArray(tasks)) return [];
    
    const logger = require('../utils/logger');
    logger.debug('TaskRepository', '任务排序：必做任务优先，各组内部按时间排序');
    
    // 按以下规则排序:
    // 1. 必做任务组优先
    //    - 必做任务中无时间的排在最前面
    //    - 必做任务中有时间的按从早到晚排序
    // 2. 非必做任务组
    //    - 非必做任务中无时间的排在前面
    //    - 非必做任务中有时间的按从早到晚排序
    return [...tasks].sort((a, b) => {
      const aRequired = a.isRequired || false;
      const bRequired = b.isRequired || false;
      
      // 首先按必做任务分组（必做任务优先）
      if (aRequired !== bRequired) {
        return aRequired ? -1 : 1;
      }
      
      // 在同一组内（都是必做或都不是必做），按时间排序
      const aHasTime = !!(a.startTime);
      const bHasTime = !!(b.startTime);
      
      // 无时间的排在有时间的前面
      if (aHasTime !== bHasTime) {
        return aHasTime ? 1 : -1;
      }
      
      // 如果都有时间，按开始时间从早到晚排序
      if (aHasTime && bHasTime) {
        return a.startTime.localeCompare(b.startTime);
      }
      
      // 如果都没有时间，按创建时间排序保持稳定
      return (a.createTime || 0) - (b.createTime || 0);
    });
  }
}

module.exports = TaskRepository; 