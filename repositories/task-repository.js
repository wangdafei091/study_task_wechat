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
   * @returns {Promise<Array>} 今天的任务列表
   */
  async getTodayTasks() {
    const today = this._formatDate(new Date());
    
    try {
      const tasks = await this.query(task => {
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
      
      logger.info('TaskRepository', `获取今天任务成功, 数量=${tasks.length}`);
      
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
   * @returns {Promise<Array>} 指定日期的任务列表
   */
  async getTasksByDate(date) {
    if (!date) {
      logger.warn('TaskRepository', '尝试获取无效日期的任务');
      return [];
    }
    
    try {
      const tasks = await this.query(task => {
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
      
      logger.info('TaskRepository', `获取${date}任务成功, 数量=${tasks.length}`);
      
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
   * @returns {Promise<Array>} 指定日期范围的任务列表
   */
  async getTasksByDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
      logger.warn('TaskRepository', '尝试使用无效日期范围获取任务');
      return [];
    }
    
    try {
      const tasks = await this.query(task => {
        // 对于重复任务，检查是否有实例在指定日期范围内
        if (task.repeat && task.repeat.type !== 'none') {
          // TODO: 实现重复任务日期范围检查
          // 简单实现：只检查任务日期是否在范围内
          return task.date >= startDate && task.date <= endDate;
        }
        
        // 对于普通任务，直接比较日期
        return task.date >= startDate && task.date <= endDate;
      });
      
      logger.info('TaskRepository', `获取${startDate}至${endDate}任务成功, 数量=${tasks.length}`);
      
      return tasks;
    } catch (error) {
      logger.error('TaskRepository', `获取${startDate}至${endDate}任务失败`, error);
      return [];
    }
  }
  
  /**
   * 获取父任务的所有子任务
   * @param {String} parentTaskId 父任务ID
   * @returns {Promise<Array>} 子任务列表
   */
  async getChildTasks(parentTaskId) {
    if (!parentTaskId) {
      logger.warn('TaskRepository', '尝试使用无效的父任务ID获取子任务');
      return [];
    }
    
    try {
      const tasks = await this.query(task => task.parentTaskId === parentTaskId);
      logger.info('TaskRepository', `获取父任务${parentTaskId}的子任务成功, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskRepository', `获取父任务${parentTaskId}的子任务失败`, error);
      return [];
    }
  }
  
  /**
   * 获取过期未完成的任务
   * @returns {Promise<Array>} 过期未完成的任务列表
   */
  async getExpiredIncompleteTask() {
    const today = this._formatDate(new Date());
    
    try {
      const tasks = await this.query(task => 
        task.date < today && task.status !== 1
      );
      
      logger.info('TaskRepository', `获取过期未完成任务成功, 数量=${tasks.length}`);
      return tasks;
    } catch (error) {
      logger.error('TaskRepository', '获取过期未完成任务失败', error);
      return [];
    }
  }
  
  /**
   * 获取必做任务
   * @param {String} date 可选的日期筛选(YYYY-MM-DD)
   * @returns {Promise<Array>} 必做任务列表
   */
  async getRequiredTasks(date) {
    try {
      const tasks = await this.query(task => {
        const isRequired = task.isRequired === true;
        
        if (date) {
          // 如果指定了日期，同时筛选日期
          return isRequired && task.date === date;
        }
        
        return isRequired;
      });
      
      logger.info('TaskRepository', `获取必做任务成功${date ? `, 日期=${date}` : ''}, 数量=${tasks.length}`);
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
   * 使用习惯优先+开始时间顺序对任务排序
   * @private
   * @param {Array} tasks 任务数组
   * @returns {Array} 排序后的任务数组
   */
  _sortTasksByHabitAndTime(tasks) {
    if (!Array.isArray(tasks)) return [];
    
    // 按以下规则排序:
    // 1. 习惯任务优先
    // 2. 开始时间早的优先
    // 3. 未完成优先于已完成
    return [...tasks].sort((a, b) => {
      // 首先按任务类型排序（习惯优先）
      if (a.type === 'habit' && b.type !== 'habit') {
        return -1;
      }
      if (a.type !== 'habit' && b.type === 'habit') {
        return 1;
      }
      
      // 其次按完成状态排序（未完成优先）
      if (a.status !== b.status) {
        return a.status - b.status;
      }
      
      // 最后按开始时间排序（早的优先）
      if (a.startTime && b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }
      
      // 没有开始时间的排在后面
      if (a.startTime && !b.startTime) {
        return -1;
      }
      if (!a.startTime && b.startTime) {
        return 1;
      }
      
      return 0;
    });
  }
}

module.exports = TaskRepository; 