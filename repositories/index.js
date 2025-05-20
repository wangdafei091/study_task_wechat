/**
 * repositories/index.js - 仓储索引
 * 
 * 统一导出所有仓储类，方便引用
 */

const BaseRepository = require('./base-repository');
const TaskRepository = require('./task-repository');
const StarRepository = require('./star-repository');
const StarGroupRepository = require('./star-group-repository');
const RewardRepository = require('./reward-repository');
const StarRecordRepository = require('./star-record-repository');

module.exports = {
  // 基础仓储
  BaseRepository,
  
  // 任务仓储
  TaskRepository,
  
  // 星星仓储
  StarRepository,
  StarGroupRepository,
  
  // 奖励仓储
  RewardRepository,
  
  // 记录仓储
  StarRecordRepository
}; 