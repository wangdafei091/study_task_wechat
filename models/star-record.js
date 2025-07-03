/**
 * star-record.js - 星星记录领域模型
 * 
 * 定义星星记录实体的数据结构、验证规则和业务方法
 */

/**
 * 记录类型枚举
 */
const RecordType = {
  INCOME: 'income',  // 收入
  EXPENSE: 'expense' // 支出
};

/**
 * 记录来源枚举
 */
const RecordSource = {
  TASK: 'task',           // 任务
  REWARD: 'reward',       // 奖励
  ADJUSTMENT: 'adjustment', // 手动调整
  SYSTEM: 'system'        // 系统操作
};

class StarRecord {
  /**
   * 构造函数
   * @param {Object} data 记录数据
   */
  constructor(data = {}) {
    // 基础信息
    this.id = data.id || `record_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.userId = data.userId || ''; // 用户ID，标识记录归属
    this.type = data.type || RecordType.INCOME;
    this.source = data.source || RecordSource.SYSTEM;
    this.sourceId = data.sourceId || '';
    this.points = data.points || 0;
    this.timestamp = data.timestamp || Date.now();
    
    // 描述与元数据
    this.description = data.description || '';
    this.data = data.data || {};
    
    // 账户余额相关
    this.balance = data.balance || 0; // 操作后余额
    this.previousBalance = data.previousBalance || 0; // 操作前余额
    
    // 任务原始日期（用于惩罚记录）
    this.originalTaskDate = data.originalTaskDate || null;
    
    // 应扣数量（用于惩罚记录显示对比）
    this.requestedPoints = data.requestedPoints || null;
  }
  
  /**
   * 验证记录数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (!this.type) {
      errors.push('记录类型不能为空');
    } else if (!Object.values(RecordType).includes(this.type)) {
      errors.push(`无效的记录类型: ${this.type}`);
    }
    
    if (!this.source) {
      errors.push('记录来源不能为空');
    }
    
    // 检查是否为完全保护兑换（特殊情况：消耗0颗星星）
    const isFullProtectionExchange = this.points === 0 && 
      this.type === RecordType.EXPENSE && 
      (this.description?.includes('完全保护兑换') || 
       this.description?.includes('消耗0颗星星'));
    
    // 验证星星数量（允许完全保护兑换的0值）
    if (this.points === 0 && !isFullProtectionExchange) {
      errors.push('星星数量不能为0（完全保护兑换除外）');
    }
    
    // 收入记录点数必须为正数
    if (this.type === RecordType.INCOME && this.points <= 0) {
      errors.push('收入记录的星星数量必须为正数');
    }
    
    // 支出记录点数必须为负数（允许完全保护兑换的0值）
    if (this.type === RecordType.EXPENSE && this.points > 0) {
      errors.push('支出记录的星星数量必须为负数或0（完全保护兑换）');
    }
    
    return errors;
  }
  
  /**
   * 获取格式化的时间
   * @returns {String} 格式化的时间字符串
   */
  getFormattedTime() {
    const date = new Date(this.timestamp);
    return date.toLocaleString();
  }
  
  /**
   * 获取记录的日期字符串（YYYY-MM-DD格式）
   * @returns {String} 日期字符串
   */
  getDate() {
    const date = new Date(this.timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  /**
   * 获取记录的月份字符串（YYYY-MM格式）
   * @returns {String} 月份字符串
   */
  getMonth() {
    const date = new Date(this.timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
  
  /**
   * 获取主要显示日期（优先使用原始任务日期）
   * @returns {String} 主要显示日期
   */
  getDisplayDate() {
    if (this.originalTaskDate) {
      return this.originalTaskDate;
    }
    return this.getDate();
  }
  
  /**
   * 获取惩罚记录的双时间显示信息
   * @returns {Object|null} 包含主要时间和次要时间的对象，如果不是惩罚记录则返回null
   */
  getPenaltyDisplayInfo() {
    if (this.source !== RecordSource.TASK || this.type !== RecordType.EXPENSE || !this.originalTaskDate) {
      return null;
    }
    
    const executionDate = new Date(this.timestamp);
    const executionTimeStr = `${executionDate.getFullYear()}-${String(executionDate.getMonth() + 1).padStart(2, '0')}-${String(executionDate.getDate()).padStart(2, '0')} ${String(executionDate.getHours()).padStart(2, '0')}:${String(executionDate.getMinutes()).padStart(2, '0')}`;
    
    return {
      mainTime: `应该完成：${this.originalTaskDate}`,
      subTime: `实际扣星：${executionTimeStr}`
    };
  }
  
  /**
   * 获取绝对点数值
   * @returns {Number} 绝对点数值
   */
  getAbsolutePoints() {
    return Math.abs(this.points);
  }
  
  /**
   * 是否为收入记录
   * @returns {Boolean} 是否为收入记录
   */
  isIncome() {
    return this.type === RecordType.INCOME;
  }
  
  /**
   * 是否为支出记录
   * @returns {Boolean} 是否为支出记录
   */
  isExpense() {
    return this.type === RecordType.EXPENSE;
  }
  
  /**
   * 克隆记录
   * @param {Object} overrides 要覆盖的属性
   * @param {Boolean} generateNewId 是否生成新ID
   * @returns {StarRecord} 新的记录实例
   */
  clone(overrides = {}, generateNewId = true) {
    // 准备基础数据
    const baseData = { ...this };
    
    // 如果需要生成新ID
    if (generateNewId) {
      baseData.id = `record_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      baseData.timestamp = Date.now();
    }
    
    // 应用覆盖属性
    const clonedData = {
      ...baseData,
      ...overrides
    };
    
    return new StarRecord(clonedData);
  }
  
  /**
   * 创建任务完成记录
   * @param {Number} points 获得的星星数
   * @param {String} taskId 任务ID
   * @param {String} description 描述
   * @param {Number} balance 操作后余额
   * @param {Number} previousBalance 操作前余额
   * @param {String} userId 可选的用户ID
   * @returns {StarRecord} 新的记录实例
   */
  static createTaskCompleteRecord(points, taskId, description, balance, previousBalance, userId = null) {
    return new StarRecord({
      userId,
      type: RecordType.INCOME,
      source: RecordSource.TASK,
      sourceId: taskId,
      points: Math.abs(points), // 确保是正数
      description: description || `完成任务获得${points}颗星星`,
      balance,
      previousBalance,
      timestamp: Date.now()
    });
  }
  
  /**
   * 创建奖励兑换记录
   * @param {Number} points 消费的星星数（正数，会自动转为负数）
   * @param {String} rewardId 奖励ID
   * @param {String} description 描述
   * @param {Number} balance 操作后余额
   * @param {Number} previousBalance 操作前余额
   * @param {String} userId 可选的用户ID
   * @returns {StarRecord} 新的记录实例
   */
  static createRewardExchangeRecord(points, rewardId, description, balance, previousBalance, userId = null) {
    return new StarRecord({
      userId,
      type: RecordType.EXPENSE,
      source: RecordSource.REWARD,
      sourceId: rewardId,
      points: -Math.abs(points), // 确保是负数
      description: description || `兑换奖励消费${points}颗星星`,
      balance,
      previousBalance,
      timestamp: Date.now()
    });
  }
  
  /**
   * 创建星星过期记录
   * @param {Number} points 过期的星星数（正数，会自动转为负数）
   * @param {String} expiryType 过期类型
   * @param {String} description 描述
   * @param {Number} balance 操作后余额
   * @param {Number} previousBalance 操作前余额
   * @param {String} userId 可选的用户ID
   * @returns {StarRecord} 新的记录实例
   */
  static createExpiredRecord(points, expiryType, description, balance, previousBalance, userId = null) {
    return new StarRecord({
      userId,
      type: RecordType.EXPENSE,
      source: RecordSource.SYSTEM,
      sourceId: `expired_${expiryType}`,
      points: -Math.abs(points), // 确保是负数
      description: description || `星星过期失效${points}颗`,
      balance,
      previousBalance,
      timestamp: Date.now()
    });
  }
  
  /**
   * 创建必做任务惩罚记录
   * @param {Number} points 实际扣除的星星数（正数，会自动转为负数）
   * @param {String} taskId 任务ID
   * @param {String} description 描述或reason
   * @param {Number} balance 操作后余额
   * @param {Number} previousBalance 操作前余额
   * @param {String} userId 可选的用户ID
   * @param {String} originalTaskDate 任务原始截止日期（YYYY-MM-DD格式）
   * @param {Number} requestedPoints 应该扣除的星星数（可选，用于生成详细描述）
   * @returns {StarRecord} 新的记录实例
   */
  static createPenaltyRecord(points, taskId, description, balance, previousBalance, userId = null, originalTaskDate = null, requestedPoints = null) {
    // 生成智能描述
    let smartDescription = description;
    let taskName = '任务';
    
    // 尝试从description/reason中提取任务名称
    if (description && description.includes('必做任务惩罚: ')) {
      taskName = description.replace('必做任务惩罚: ', '').trim();
    }
    
    // 生成用户友好的描述
    if (requestedPoints && requestedPoints !== points) {
      // 余额不足的情况
      smartDescription = `必做任务【${taskName}】未完成，应扣${requestedPoints}颗星星（余额不足，实扣${points}颗）`;
    } else {
      // 余额充足的情况
      smartDescription = `必做任务【${taskName}】未完成，扣除${points}颗星星`;
    }
    
    return new StarRecord({
      userId,
      type: RecordType.EXPENSE,
      source: RecordSource.TASK,
      sourceId: taskId,
      points: -Math.abs(points), // 确保是负数，使用实际扣除数量
      description: smartDescription,
      balance,
      previousBalance,
      timestamp: Date.now(),
      originalTaskDate,
      requestedPoints: requestedPoints || points // 保存应扣数量
    });
  }
}

module.exports = {
  StarRecord,
  RecordType,
  RecordSource
}; 