/**
 * models/index.js - 领域模型索引
 * 
 * 统一导出所有领域模型，方便引用
 */

const { Task, TaskType, TaskStatus, StarExpiryType, RepeatType } = require('./task');
const { Star, StarSourceType, StarStatus } = require('./star');
const { StarGroup } = require('./star-group');
const { Reward, RewardStatus, RewardType } = require('./reward');
const { StarRecord, RecordType, RecordSource } = require('./star-record');
const { Message, MessageType, NotificationType } = require('./message');
const { User, UserRole, UserStatus } = require('./user');

module.exports = {
  // 任务模型
  Task,
  TaskType,
  TaskStatus,
  RepeatType,
  
  // 星星模型
  Star,
  StarSourceType,
  StarStatus,
  StarExpiryType,
  StarGroup,
  
  // 奖励模型
  Reward,
  RewardStatus,
  RewardType,
  
  // 记录模型
  StarRecord,
  RecordType,
  RecordSource,
  
  // 消息模型
  Message,
  MessageType,
  NotificationType,
  
  // 用户模型
  User,
  UserRole,
  UserStatus
}; 