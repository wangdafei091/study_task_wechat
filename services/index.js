/**
 * services/index.js - 服务层索引
 * 
 * 统一导出所有服务类，方便引用
 */

const RewardService = require('./reward-service');
const StarService = require('./star-service');
const TaskService = require('./task-service');
const MessageService = require('./message-service');
const OfflineQueueService = require('./offline-queue-service');
const TaskTemplateService = require('./task-template-service');
const { UserService } = require('./user-service');
const ValidationService = require('./validation-service');
const ConfigService = require('./config-service');

module.exports = {
  // 奖励服务
  RewardService,
  
  // 星星服务
  StarService,
  
  // 任务服务
  TaskService,
  
  // 消息服务
  MessageService,

  // 离线队列服务
  OfflineQueueService,

  // 任务模板服务
  TaskTemplateService,
  
  // 用户服务
  UserService,
  
  // 表单验证服务
  ValidationService,
  
  // 配置服务
  ConfigService
}; 
