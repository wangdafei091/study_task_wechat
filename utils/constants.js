/**
 * 全局常量定义
 */
module.exports = {
  // 任务描述相关
  DESCRIPTION: {
    MAX_LENGTH: 20,
    PLACEHOLDER: "添加任务描述(选填)"
  },
  
  // 积分有效期常量
  POINTS_EXPIRY: {
    PERMANENT: 'permanent',
    WEEK: 'week',
    MONTH: 'month',
    THREE_MONTHS: '3months',
    SIX_MONTHS: '6months',
    TWELVE_MONTHS: '12months',
    
    // 文本映射
    TEXT: {
      'permanent': '永久',
      'week': '一周',
      'month': '一个月',
      '3months': '三个月',
      '6months': '六个月',
      '12months': '十二个月'
    }
  },
  
  // 事件名称常量
  EVENTS: {
    // 任务相关事件
    TASK_CREATED: 'task:created',
    TASK_UPDATED: 'task:updated',
    TASK_COMPLETED: 'task:completed',
    TASK_DELETED: 'task:deleted',
    TASK_STATUS_CHANGED: 'task:status_changed',
    TASK_STATUS_UPDATED: 'task:status_updated',
    TASK_UPCOMING: 'task:upcoming',
    TASK_PENALTY_APPLIED: 'task:penalty_applied',
    TASK_MARKED_REQUIRED: 'task:marked_required',
    TASK_UNMARKED_REQUIRED: 'task:unmarked_required',
    TASK_COMPLETED_WITH_REWARD: 'task:completed_with_reward',
    
    // 星星相关事件
    STAR_EARNED: 'star:earned',
    STAR_USED: 'star:used',
    STAR_EXPIRED: 'star:expired',
    STAR_ADDED: 'star:added',
    STAR_CONSUMED: 'star:consumed',
    STARS_ADDED: 'stars:added',
    STARS_CONSUMED: 'stars:consumed',
    STARS_EXPIRED: 'stars:expired',
    
    // 消息相关事件
    MESSAGE_CREATED: 'message:created',
    MESSAGE_READ: 'message:read',
    MESSAGE_DELETED: 'message:deleted',
    MESSAGE_CHANGED: 'message:changed',
    
    // 领域模型消息事件
    DOMAIN_MESSAGE_CREATED: 'domain:message:created',
    DOMAIN_MESSAGE_UPDATED: 'domain:message:updated',
    DOMAIN_MESSAGE_DELETED: 'domain:message:deleted',
    DOMAIN_MESSAGE_READ: 'domain:message:read',
    DOMAIN_MESSAGE_ALL_READ: 'domain:message:allRead',
    DOMAIN_MESSAGE_RELATED_DELETED: 'domain:message:relatedDeleted',
    DOMAIN_MESSAGE_TASK_UPDATED: 'domain:message:taskUpdated',
    DOMAIN_MESSAGE_CLEANED: 'domain:message:cleaned',
    
    // 奖励相关事件
    REWARD_CREATED: 'reward:created',
    REWARD_UPDATED: 'reward:updated',
    REWARD_DELETED: 'reward:deleted',
    REWARD_STATUS_CHANGED: 'reward:status_changed',
    REWARD_DELIVERED: 'reward:delivered',
    REWARD_CLAIMED: 'reward:claimed',
    REWARD_UNCLAIMED: 'reward:unclaimed',
    REWARD_EXCHANGED: 'reward:exchanged',
    REWARD_EXCHANGE_CANCELLED: 'reward:exchange_cancelled',
    REWARD_DUPLICATED: 'reward:duplicated',
    REWARD_DELETED_BATCH: 'reward:deleted_batch',
    REWARD_EXAMPLES_CLEARED: 'reward:examples_cleared',
    
    // UI事件
    PROGRESS_BAR_COMPLETE: 'progress:complete',
    TASK_DATA_CHANGED: 'task:changed',
    
    // 系统事件
    SYSTEM_READY: 'system:ready',
    USER_LOGIN: 'user:login',
    USER_LOGOUT: 'user:logout'
  },
  
  // 其他全局常量可在此添加...
}; 