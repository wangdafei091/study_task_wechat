/**
 * task-service.js - 任务服务
 * 
 * 提供任务相关的业务逻辑，包括任务的创建、编辑、状态管理等
 */

const logger = require('../utils/logger');
const { TaskRepository } = require('../repositories/index');
const { StarService } = require('./index');
const EventBus = require('../utils/core/event-bus');
const { Task, TaskStatus, TaskType } = require('../models/task');

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
}

module.exports = TaskService; 