/**
 * star-record.js - 星星记录领域模型
 * 
 * 用于记录星星的获得、消费和过期，追踪星星流动
 */

const logger = require('../utils/logger');

/**
 * 星星记录类型枚举
 */
const RecordType = {
  INCOME: 'income',       // 收入
  EXPENSE: 'expense',     // 支出
  EXPIRED: 'expired',     // 过期
  SYSTEM: 'system'        // 系统调整
};

/**
 * 星星记录来源枚举
 */
const RecordSource = {
  TASK_COMPLETE: 'task_complete',       // 完成任务
  REWARD_EXCHANGE: 'reward_exchange',   // 奖励兑换
  STAR_EXPIRED: 'star_expired',         // 星星过期
  REQUIRED_PENALTY: 'required_penalty', // 必做任务惩罚
  SYSTEM_ADJUST: 'system_adjust'        // 系统调整
};

class StarRecord {
  /**
   * 构造函数
   * @param {Object} data 星星记录数据
   */
  constructor(data = {}) {
    // 基础信息
    this.id = data.id || `record_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.points = data.points || 0; // 正数表示收入，负数表示支出
    
    // 类型与来源
    this.type = data.type || (this.points >= 0 ? RecordType.INCOME : RecordType.EXPENSE);
    this.source = data.source || RecordSource.SYSTEM_ADJUST;
    this.sourceId = data.sourceId || '';
    this.description = data.description || '';
    
    // 时间相关
    this.timestamp = data.timestamp || Date.now();
    this.expiryDate = data.expiryDate || null; // 适用于收入记录
    this.expiryType = data.expiryType || null; // 适用于收入记录
    
    // 余额相关
    this.balance = data.balance || 0; // 操作后的余额
    this.previousBalance = data.previousBalance || 0; // 操作前的余额
    
    // 视图相关（用于UI展示）
    this.recordClass = data.recordClass || '';
    
    logger.info('StarRecord', `星星记录已创建: ${this.points}颗 [${this.id}]`, {
      type: this.type,
      source: this.source
    });
  }
  
  /**
   * 验证星星记录数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (!this.type) {
      errors.push('记录类型不能为空');
    }
    
    if (!this.source) {
      errors.push('记录来源不能为空');
    }
    
    // 验证类型与数量的一致性
    if (this.type === RecordType.INCOME && this.points <= 0) {
      errors.push('收入记录的星星数量必须为正数');
    }
    
    if (this.type === RecordType.EXPENSE && this.points >= 0) {
      errors.push('支出记录的星星数量必须为负数');
    }
    
    // 验证余额
    if ((this.previousBalance + this.points) !== this.balance) {
      errors.push('记录余额计算错误');
    }
    
    return errors;
  }
  
  /**
   * 获取记录时间（格式化）
   * @param {String} format 日期格式，默认为 YYYY-MM-DD HH:MM
   * @returns {String} 格式化的日期时间
   */
  getFormattedTime(format = 'YYYY-MM-DD HH:MM') {
    const date = new Date(this.timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('MM', minutes);
  }
  
  /**
   * 获取记录的日期部分
   * @returns {String} 日期部分（YYYY-MM-DD）
   */
  getDate() {
    const date = new Date(this.timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }
  
  /**
   * 获取记录的月份
   * @returns {String} 月份（YYYY-MM）
   */
  getMonth() {
    const date = new Date(this.timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    return `${year}-${month}`;
  }
  
  /**
   * 获取记录类型的描述
   * @returns {String} 类型描述
   */
  getTypeDescription() {
    switch (this.type) {
      case RecordType.INCOME:
        return '收入';
      case RecordType.EXPENSE:
        return '支出';
      case RecordType.EXPIRED:
        return '过期';
      case RecordType.SYSTEM:
        return '系统';
      default:
        return '未知';
    }
  }
  
  /**
   * 获取记录来源的描述
   * @returns {String} 来源描述
   */
  getSourceDescription() {
    if (this.description) {
      return this.description;
    }
    
    switch (this.source) {
      case RecordSource.TASK_COMPLETE:
        return '完成任务';
      case RecordSource.REWARD_EXCHANGE:
        return '兑换奖励';
      case RecordSource.STAR_EXPIRED:
        return '星星过期';
      case RecordSource.REQUIRED_PENALTY:
        return '必做任务惩罚';
      case RecordSource.SYSTEM_ADJUST:
        return '系统调整';
      default:
        return '未知来源';
    }
  }
  
  /**
   * 判断记录是否为收入
   * @returns {Boolean} 是否为收入
   */
  isIncome() {
    return this.type === RecordType.INCOME || (this.type !== RecordType.EXPENSE && this.points > 0);
  }
  
  /**
   * 判断记录是否为支出
   * @returns {Boolean} 是否为支出
   */
  isExpense() {
    return this.type === RecordType.EXPENSE || (this.type !== RecordType.INCOME && this.points < 0);
  }
  
  /**
   * 判断记录是否为过期
   * @returns {Boolean} 是否为过期
   */
  isExpired() {
    return this.type === RecordType.EXPIRED || this.source === RecordSource.STAR_EXPIRED;
  }
  
  /**
   * 获取记录的CSS类名
   * @returns {String} CSS类名
   */
  getRecordClass() {
    if (this.recordClass) {
      return this.recordClass;
    }
    
    if (this.isExpense()) {
      return 'expense-record';
    } else if (this.isExpired()) {
      return 'expired-record';
    } else {
      return 'income-record';
    }
  }
  
  /**
   * 获取记录的绝对值数量
   * @returns {Number} 绝对值数量
   */
  getAbsolutePoints() {
    return Math.abs(this.points);
  }
  
  /**
   * 克隆记录创建一个新实例
   * @param {Object} overrides 要覆盖的属性
   * @returns {StarRecord} 新的记录实例
   */
  clone(overrides = {}) {
    const clonedData = {
      ...this,
      id: `record_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      ...overrides
    };
    
    return new StarRecord(clonedData);
  }
}

/**
 * 创建任务完成的收入记录
 * @param {Number} points 获得的星星数
 * @param {String} taskId 任务ID
 * @param {String} description 描述
 * @param {Number} balance 操作后的余额
 * @param {Number} previousBalance 操作前的余额
 * @returns {StarRecord} 星星记录实例
 */
StarRecord.createTaskCompleteRecord = function(points, taskId, description, balance, previousBalance) {
  return new StarRecord({
    points: Math.abs(points),
    type: RecordType.INCOME,
    source: RecordSource.TASK_COMPLETE,
    sourceId: taskId,
    description: description,
    balance: balance,
    previousBalance: previousBalance
  });
};

/**
 * 创建奖励兑换的支出记录
 * @param {Number} points 消费的星星数（正数，会自动转为负数）
 * @param {String} rewardId 奖励ID
 * @param {String} description 描述
 * @param {Number} balance 操作后的余额
 * @param {Number} previousBalance 操作前的余额
 * @returns {StarRecord} 星星记录实例
 */
StarRecord.createRewardExchangeRecord = function(points, rewardId, description, balance, previousBalance) {
  return new StarRecord({
    points: -Math.abs(points),
    type: RecordType.EXPENSE,
    source: RecordSource.REWARD_EXCHANGE,
    sourceId: rewardId,
    description: description,
    balance: balance,
    previousBalance: previousBalance
  });
};

/**
 * 创建星星过期的记录
 * @param {Number} points 过期的星星数（正数，会自动转为负数）
 * @param {String} expiryType 过期类型
 * @param {String} description 描述
 * @param {Number} balance 操作后的余额
 * @param {Number} previousBalance 操作前的余额
 * @returns {StarRecord} 星星记录实例
 */
StarRecord.createExpiredRecord = function(points, expiryType, description, balance, previousBalance) {
  return new StarRecord({
    points: -Math.abs(points),
    type: RecordType.EXPIRED,
    source: RecordSource.STAR_EXPIRED,
    description: description || `${expiryType}有效期星星已过期`,
    expiryType: expiryType,
    balance: balance,
    previousBalance: previousBalance
  });
};

/**
 * 创建必做任务惩罚记录
 * @param {Number} points 扣除的星星数（正数，会自动转为负数）
 * @param {String} taskId 任务ID
 * @param {String} description 描述
 * @param {Number} balance 操作后的余额
 * @param {Number} previousBalance 操作前的余额
 * @returns {StarRecord} 星星记录实例
 */
StarRecord.createPenaltyRecord = function(points, taskId, description, balance, previousBalance) {
  return new StarRecord({
    points: -Math.abs(points),
    type: RecordType.EXPENSE,
    source: RecordSource.REQUIRED_PENALTY,
    sourceId: taskId,
    description: description,
    balance: balance,
    previousBalance: previousBalance
  });
};

// 导出类和枚举
module.exports = {
  StarRecord,
  RecordType,
  RecordSource
}; 