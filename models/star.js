/**
 * star.js - 星星领域模型
 * 
 * 定义星星实体的数据结构、有效期规则和业务方法
 */

const logger = require('../utils/logger');

/**
 * 星星来源类型枚举
 */
const StarSourceType = {
  TASK: 'task',         // 任务完成
  SYSTEM: 'system',     // 系统奖励
  MANUAL: 'manual',     // 手动调整
  REQUIRED_PENALTY: 'required_penalty' // 必做任务惩罚
};

/**
 * 星星有效期类型枚举
 */
const StarExpiryType = {
  PERMANENT: 'permanent', // 永久有效
  WEEK: 'week',         // 本周有效（周日24点过期）
  MONTH: 'month',       // 本月有效（月末24点过期）
  QUARTER: 'quarter'    // 本季度有效（季度末24点过期）
};

/**
 * 星星状态枚举
 */
const StarStatus = {
  ACTIVE: 'active',     // 有效
  USED: 'used',         // 已使用
  EXPIRED: 'expired'    // 已过期
};

class Star {
  /**
   * 构造函数
   * @param {Object} data 星星数据
   */
  constructor(data = {}) {
    // 基础信息
    this.id = data.id || `star_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.amount = data.amount || 0;
    
    // 来源信息
    this.sourceType = data.sourceType || StarSourceType.TASK;
    this.sourceId = data.sourceId || '';
    this.sourceDescription = data.sourceDescription || '';
    
    // 有效期信息
    this.expiryType = data.expiryType || StarExpiryType.PERMANENT;
    this.expiryDate = data.expiryDate || null;
    this.expiryDescription = data.expiryDescription || '';
    
    // 使用状态
    this.status = data.status || StarStatus.ACTIVE;
    this.isUsed = data.isUsed || false;
    this.usedTime = data.usedTime || 0;
    this.usedFor = data.usedFor || '';
    
    // 其他属性
    this.createTime = data.createTime || Date.now();
    this.notes = data.notes || '';
    
    // 计算过期日期（如果未提供）
    if (!this.expiryDate && this.expiryType !== StarExpiryType.PERMANENT) {
      this.expiryDate = this._calculateExpiryDate(this.expiryType);
      this.expiryDescription = this._getExpiryDescription(this.expiryType, this.expiryDate);
    }
    
    logger.info('Star', `星星已创建/加载: ${this.amount}颗 [${this.id}]`, {
      sourceType: this.sourceType,
      expiryType: this.expiryType,
      status: this.status
    });
  }
  
  /**
   * 计算过期日期
   * @private
   * @param {String} expiryType 有效期类型
   * @returns {Number} 过期时间戳
   */
  _calculateExpiryDate(expiryType) {
    if (expiryType === StarExpiryType.PERMANENT) {
      return null;
    }
    
    const now = new Date();
    
    switch (expiryType) {
      case StarExpiryType.WEEK:
        // 当前周的周日24点
        return this._getEndOfWeek(now);
      case StarExpiryType.MONTH:
        // 当前月的最后一天24点
        return this._getEndOfMonth(now);
      case StarExpiryType.QUARTER:
        // 三个月后的月末24点
        return this._getEndOfQuarter(now);
      default:
        return null;
    }
  }
  
  /**
   * 获取可读的有效期描述
   * @private
   * @param {String} expiryType 有效期类型
   * @param {Number} expiryDate 过期时间戳
   * @returns {String} 有效期描述
   */
  _getExpiryDescription(expiryType, expiryDate) {
    if (expiryType === StarExpiryType.PERMANENT) {
      return '永久有效';
    }
    
    if (!expiryDate) {
      return '未知有效期';
    }
    
    const date = new Date(expiryDate);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    switch (expiryType) {
      case StarExpiryType.WEEK:
        return `本周有效（${year}-${month}-${day}到期）`;
      case StarExpiryType.MONTH:
        return `本月有效（${year}-${month}-${day}到期）`;
      case StarExpiryType.QUARTER:
        return `三个月内有效（${year}-${month}-${day}到期）`;
      default:
        return `${year}-${month}-${day}到期`;
    }
  }
  
  /**
   * 获取当前周的周日24点时间戳
   * @private
   * @param {Date} date 当前日期
   * @returns {Number} 时间戳
   */
  _getEndOfWeek(date) {
    const day = date.getDay();
    const daysToSunday = day === 0 ? 0 : 7 - day;
    const endOfWeek = new Date(date);
    endOfWeek.setDate(date.getDate() + daysToSunday);
    endOfWeek.setHours(23, 59, 59, 999);
    return endOfWeek.getTime();
  }
  
  /**
   * 获取当前月的月末24点时间戳
   * @private
   * @param {Date} date 当前日期
   * @returns {Number} 时间戳
   */
  _getEndOfMonth(date) {
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    return endOfMonth.getTime();
  }
  
  /**
   * 获取三个月后的月末24点时间戳
   * @private
   * @param {Date} date 当前日期
   * @returns {Number} 时间戳
   */
  _getEndOfQuarter(date) {
    const endOfQuarter = new Date(date.getFullYear(), date.getMonth() + 3, 0);
    endOfQuarter.setHours(23, 59, 59, 999);
    return endOfQuarter.getTime();
  }
  
  /**
   * 验证星星数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (this.amount <= 0) {
      errors.push('星星数量必须大于0');
    }
    
    // 验证来源
    if (!this.sourceType) {
      errors.push('星星来源类型不能为空');
    }
    
    // 验证有效期
    if (this.expiryType !== StarExpiryType.PERMANENT && !this.expiryDate) {
      errors.push('非永久有效的星星必须有过期日期');
    }
    
    return errors;
  }
  
  /**
   * 标记为已使用
   * @param {String} usedFor 使用目的
   * @returns {Star} 当前星星实例
   */
  markAsUsed(usedFor = '') {
    this.status = StarStatus.USED;
    this.isUsed = true;
    this.usedTime = Date.now();
    this.usedFor = usedFor;
    
    logger.info('Star', `星星已标记为已使用: ${this.amount}颗 [${this.id}]`, {
      usedFor: this.usedFor,
      usedTime: this.usedTime
    });
    
    return this;
  }
  
  /**
   * 标记为已过期
   * @returns {Star} 当前星星实例
   */
  markAsExpired() {
    this.status = StarStatus.EXPIRED;
    
    logger.info('Star', `星星已标记为已过期: ${this.amount}颗 [${this.id}]`, {
      expiryDate: this.expiryDate,
      expiryType: this.expiryType
    });
    
    return this;
  }
  
  /**
   * 检查星星是否已过期
   * @returns {Boolean} 是否已过期
   */
  isExpired() {
    if (this.status === StarStatus.EXPIRED) {
      return true;
    }
    
    if (this.expiryType === StarExpiryType.PERMANENT) {
      return false;
    }
    
    const now = Date.now();
    return this.expiryDate && now > this.expiryDate;
  }
  
  /**
   * 检查星星是否可用（未使用且未过期）
   * @returns {Boolean} 是否可用
   */
  isAvailable() {
    return !this.isUsed && !this.isExpired() && this.status === StarStatus.ACTIVE;
  }
  
  /**
   * 获取星星剩余有效期（毫秒）
   * @returns {Number} 剩余有效期，永久有效返回-1
   */
  getRemainingValidity() {
    if (this.expiryType === StarExpiryType.PERMANENT) {
      return -1; // 表示永久有效
    }
    
    if (!this.expiryDate || this.isExpired() || this.isUsed) {
      return 0;
    }
    
    const now = Date.now();
    return Math.max(0, this.expiryDate - now);
  }
  
  /**
   * 获取星星剩余有效期的描述
   * @returns {String} 剩余有效期描述
   */
  getRemainingValidityDescription() {
    if (this.isUsed) {
      return '已使用';
    }
    
    if (this.isExpired()) {
      return '已过期';
    }
    
    if (this.expiryType === StarExpiryType.PERMANENT) {
      return '永久有效';
    }
    
    const remainingMs = this.getRemainingValidity();
    const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    
    if (remainingDays > 30) {
      const months = Math.floor(remainingDays / 30);
      return `剩余约${months}个月`;
    } else if (remainingDays > 1) {
      return `剩余${remainingDays}天`;
    } else if (remainingDays === 1) {
      return '今天到期';
    } else {
      return '即将到期';
    }
  }
  
  /**
   * 克隆星星创建一个新实例
   * @param {Object} overrides 要覆盖的属性
   * @returns {Star} 新的星星实例
   */
  clone(overrides = {}) {
    const clonedData = {
      ...this,
      id: `star_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      createTime: Date.now(),
      ...overrides
    };
    
    return new Star(clonedData);
  }
}

// 导出类和枚举
module.exports = {
  Star,
  StarSourceType,
  StarExpiryType,
  StarStatus
}; 