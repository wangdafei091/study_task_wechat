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
    
    if (this.points === 0) {
      errors.push('星星数量不能为0');
    }
    
    // 收入记录点数必须为正数
    if (this.type === RecordType.INCOME && this.points <= 0) {
      errors.push('收入记录的星星数量必须为正数');
    }
    
    // 支出记录点数必须为负数
    if (this.type === RecordType.EXPENSE && this.points >= 0) {
      errors.push('支出记录的星星数量必须为负数');
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
}

module.exports = {
  StarRecord,
  RecordType,
  RecordSource
}; 