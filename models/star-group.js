/**
 * star-group.js - 星星分组领域模型
 * 
 * 用于按照有效期管理和分组星星，实现"先过期先使用"策略
 */

const logger = require('../utils/logger');
const { StarExpiryType } = require('./star');

class StarGroup {
  /**
   * 构造函数
   * @param {Object} data 星星分组数据
   */
  constructor(data = {}) {
    // 基础信息
    this.id = data.id || `group_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.expiryType = data.expiryType || StarExpiryType.PERMANENT;
    this.expiryDate = data.expiryDate || null;
    this.expiryDateStr = data.expiryDateStr || '';
    
    // 星星数量和来源
    this.points = data.points || 0;
    this.sources = data.sources || [];
    
    // 其他属性
    this.createTime = data.createTime || Date.now();
    this.updateTime = data.updateTime || Date.now();
    
    logger.info('StarGroup', `星星分组已创建/加载: ${this.points}颗 [${this.id}]`, {
      expiryType: this.expiryType,
      expiryDateStr: this.expiryDateStr
    });
  }
  
  /**
   * 验证星星分组数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (!this.expiryType) {
      errors.push('星星分组有效期类型不能为空');
    }
    
    // 验证有效期日期
    if (this.expiryType !== StarExpiryType.PERMANENT && !this.expiryDate) {
      errors.push('非永久有效的星星分组必须有过期日期');
    }
    
    // 验证数量
    if (this.points < 0) {
      errors.push('星星分组数量不能为负数');
    }
    
    return errors;
  }
  
  /**
   * 添加星星到分组
   * @param {Number} amount 星星数量
   * @param {String} source 来源标识
   * @returns {StarGroup} 当前分组实例
   */
  addStars(amount, source = '') {
    if (amount <= 0) {
      logger.warn('StarGroup', `尝试添加无效的星星数量: ${amount}`);
      return this;
    }
    
    // 增加星星数量
    this.points += amount;
    
    // 记录来源
    if (source && !this.sources.includes(source)) {
      this.sources.push(source);
    }
    
    // 更新时间
    this.updateTime = Date.now();
    
    logger.info('StarGroup', `添加星星到分组: 数量=${amount}, 来源=${source || '未知'}, 当前总数=${this.points}`);
    
    return this;
  }
  
  /**
   * 从分组中移除星星
   * @param {Number} amount 要移除的星星数量
   * @returns {Number} 实际移除的星星数量
   */
  removeStars(amount) {
    if (amount <= 0) {
      logger.warn('StarGroup', `尝试移除无效的星星数量: ${amount}`);
      return 0;
    }
    
    // 计算实际可以移除的数量（不能超过当前数量）
    const actualAmount = Math.min(this.points, amount);
    
    // 减少星星数量
    this.points -= actualAmount;
    
    // 更新时间
    this.updateTime = Date.now();
    
    logger.info('StarGroup', `从分组移除星星: 请求移除=${amount}, 实际移除=${actualAmount}, 当前剩余=${this.points}`);
    
    return actualAmount;
  }
  
  /**
   * 检查分组是否已过期
   * @returns {Boolean} 是否已过期
   */
  isExpired() {
    if (this.expiryType === StarExpiryType.PERMANENT) {
      return false;
    }
    
    if (!this.expiryDate) {
      return false;
    }
    
    const now = Date.now();
    return now > this.expiryDate;
  }
  
  /**
   * 获取分组剩余有效期（毫秒）
   * @returns {Number} 剩余有效期，永久有效返回-1
   */
  getRemainingValidity() {
    if (this.expiryType === StarExpiryType.PERMANENT) {
      return -1; // 表示永久有效
    }
    
    if (!this.expiryDate || this.isExpired()) {
      return 0;
    }
    
    const now = Date.now();
    return Math.max(0, this.expiryDate - now);
  }
  
  /**
   * 获取可读的有效期描述
   * @returns {String} 有效期描述
   */
  getExpiryDescription() {
    if (!this.expiryDateStr) {
      // 如果没有预先生成的描述，生成一个基本描述
      if (this.expiryType === StarExpiryType.PERMANENT) {
        return '永久有效';
      }
      
      if (this.expiryDate) {
        const date = new Date(this.expiryDate);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}到期`;
      }
      
      return '未知有效期';
    }
    
    return this.expiryDateStr;
  }
  
  /**
   * 获取分组中的星星数量
   * @returns {Number} 星星数量
   */
  getPointsAmount() {
    return this.points;
  }
  
  /**
   * 检查分组是否为空（没有星星）
   * @returns {Boolean} 是否为空
   */
  isEmpty() {
    return this.points <= 0;
  }
  
  /**
   * 获取分组过期时间
   * @returns {Number|null} 过期时间戳，永久有效返回null
   */
  getExpiryDate() {
    return this.expiryType === StarExpiryType.PERMANENT ? null : this.expiryDate;
  }
  
  /**
   * 克隆分组创建一个新实例
   * @param {Object} overrides 要覆盖的属性
   * @returns {StarGroup} 新的分组实例
   */
  clone(overrides = {}) {
    const clonedData = {
      ...this,
      id: `group_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      createTime: Date.now(),
      updateTime: Date.now(),
      ...overrides
    };
    
    return new StarGroup(clonedData);
  }
}

/**
 * 静态方法：按过期日期对星星分组进行排序
 * @param {StarGroup[]} groups 星星分组数组
 * @returns {StarGroup[]} 排序后的分组数组
 */
StarGroup.sortByExpiryDate = function(groups) {
  return [...groups].sort((a, b) => {
    // 永久有效的放在最后
    if (a.expiryType === StarExpiryType.PERMANENT) return 1;
    if (b.expiryType === StarExpiryType.PERMANENT) return -1;
    
    // 按过期日期升序（先过期的在前）
    return a.expiryDate - b.expiryDate;
  });
};

module.exports = {
  StarGroup
}; 