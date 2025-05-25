/**
 * services/index.js - 服务层索引
 * 
 * 统一导出所有服务类，方便引用
 */

const RewardService = require('./reward-service');
const StarService = require('./star-service');
const TaskService = require('./task-service');
const MessageService = require('./message-service');
const AnalyticsService = require('./analytics-service');

module.exports = {
  // 奖励服务
  RewardService,
  
  // 星星服务
  StarService,
  
  // 任务服务
  TaskService,
  
  // 消息服务
  MessageService,
  
  // 分析服务
  AnalyticsService
}; 