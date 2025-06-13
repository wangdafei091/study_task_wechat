/**
 * star-group.js - 星星分组领域模型
 * 
 * 定义星星分组实体的数据结构、验证规则和业务方法
 */

class StarGroup {
  /**
   * 构造函数
   * @param {Object} data 分组数据
   */
  constructor(data = {}) {
    // 基础信息
    this.id = data.id || `group_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.userId = data.userId || null; // 用户ID，用于多用户支持
    this.type = data.type || 'permanent'; // 分组类型，默认为永久
    this.expiryType = data.expiryType || data.type || 'permanent'; // 过期类型，与type保持一致
    this.name = data.name || this._getDefaultName(data.type);
    
    // 星星相关 - 修复数据类型问题，确保为数字类型
    this.stars = this._ensureNumber(data.stars, 0); // 当前星星数，确保为数字类型
    this.maxStars = this._ensureNumber(data.maxStars, 0); // 最大星星数，0表示无限制
    
    // 时间相关
    this.createTime = data.createTime || Date.now();
    this.lastUpdated = data.lastUpdated || Date.now();
    this.expiryDate = data.expiryDate || ''; // 过期日期，空字符串表示永不过期
    this.expiryDateStr = data.expiryDateStr || ''; // 格式化的过期日期字符串
    
    // 其他属性
    this.source = data.source || '';
    this.description = data.description || '';
  }
  
  /**
   * 根据类型获取默认名称
   * @private
   * @param {String} type 分组类型
   * @returns {String} 默认名称
   */
  _getDefaultName(type) {
    switch (type) {
      case 'permanent':
        return '永久有效';
      case 'week':
        return '本周有效';
      case 'month':
        return '本月有效';
      case 'quarter':
        return '本季度有效';
      default:
        return '星星分组';
    }
  }
  
  /**
   * 确保值为数字类型
   * @private
   * @param {*} value 输入值
   * @param {Number} defaultValue 默认值
   * @returns {Number} 数字值
   */
  _ensureNumber(value, defaultValue = 0) {
    // 如果值为null、undefined或空字符串，返回默认值
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    
    // 尝试转换为数字
    const num = Number(value);
    
    // 如果转换结果为NaN，返回默认值
    if (isNaN(num)) {
      return defaultValue;
    }
    
    // 返回转换后的数字（确保为整数）
    return Math.floor(num);
  }
  
  /**
   * 验证分组数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (!this.type) {
      errors.push('分组类型不能为空');
    }
    
    // 验证星星数量
    if (this.stars < 0) {
      errors.push('星星数量不能为负数');
    }
    
    if (this.maxStars < 0) {
      errors.push('最大星星数不能为负数');
    }
    
    if (this.maxStars > 0 && this.stars > this.maxStars) {
      errors.push('星星数量不能超过最大星星数');
    }
    
    // 验证过期日期
    if (this.expiryDate) {
      const expiryDate = new Date(this.expiryDate);
      if (isNaN(expiryDate.getTime())) {
        errors.push('过期日期格式无效');
      }
    }
    
    return errors;
  }
  
  /**
   * 添加星星
   * @param {Number} amount 添加的星星数量
   * @returns {Number} 添加后的星星数量
   */
  addStars(amount) {
    // 确保参数为数字类型
    const numAmount = this._ensureNumber(amount, 0);
    
    if (numAmount <= 0) {
      return this.stars;
    }
    
    // 确保当前星星数为数字类型
    const currentStars = this._ensureNumber(this.stars, 0);
    const oldStars = currentStars;
    
    // 执行数学运算（确保是数字相加，不是字符串拼接）
    this.stars = currentStars + numAmount;
    
    // 如果有最大值限制，确保不超过最大值
    const maxStars = this._ensureNumber(this.maxStars, 0);
    if (maxStars > 0 && this.stars > maxStars) {
      this.stars = maxStars;
    }
    
    // 更新最后修改时间
    this.lastUpdated = Date.now();
    
    return this.stars;
  }
  
  /**
   * 减少星星
   * @param {Number} amount 减少的星星数量
   * @returns {Number} 减少后的星星数量
   */
  removeStars(amount) {
    // 确保参数为数字类型
    const numAmount = this._ensureNumber(amount, 0);
    
    if (numAmount <= 0) {
      return this.stars;
    }
    
    // 确保当前星星数为数字类型
    const currentStars = this._ensureNumber(this.stars, 0);
    const oldStars = currentStars;
    
    // 执行数学运算（确保是数字相减）
    this.stars = currentStars - numAmount;
    
    // 确保星星数不为负数
    if (this.stars < 0) {
      this.stars = 0;
    }
    
    // 更新最后修改时间
    this.lastUpdated = Date.now();
    
    return this.stars;
  }
  
  /**
   * 检查分组是否已过期
   * @returns {Boolean} 是否已过期
   */
  isExpired() {
    const logger = require('../utils/logger');
    
    // 永久分组永不过期
    if (this.type === 'permanent' || !this.expiryDate) {
      logger.debug('StarGroup', `分组${this.id}过期检查: 永久有效或无过期日期，未过期`);
      return false;
    }
    
    const now = new Date();
    const expiryDate = new Date(this.expiryDate);
    
    // 如果过期日期无效，视为未过期
    if (isNaN(expiryDate.getTime())) {
      logger.warn('StarGroup', `分组${this.id}过期检查: 过期日期无效(${this.expiryDate})，视为未过期`);
      return false;
    }
    
    const isExpired = now > expiryDate;
    logger.info('StarGroup', `分组${this.id}过期检查: 当前时间=${now.toISOString()}, 过期时间=${expiryDate.toISOString()}, 是否过期=${isExpired}`);
    
    return isExpired;
  }
  
  /**
   * 获取剩余有效天数
   * @returns {Number} 剩余有效天数，如果永不过期则返回-1
   */
  getRemainingDays() {
    // 永久分组永不过期
    if (this.type === 'permanent' || !this.expiryDate) {
      return -1;
    }
    
    const now = new Date();
    const expiryDate = new Date(this.expiryDate);
    
    // 如果过期日期无效，视为永不过期
    if (isNaN(expiryDate.getTime())) {
      return -1;
    }
    
    // 如果已过期，返回0
    if (now > expiryDate) {
      return 0;
    }
    
    // 计算剩余天数
    const timeDiff = expiryDate.getTime() - now.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
  }
  
  /**
   * 重置星星数量
   * @param {Number} newAmount 新的星星数量
   * @returns {Number} 新的星星数量
   */
  resetStars(newAmount) {
    // 确保新数量为数字类型
    let numAmount = this._ensureNumber(newAmount, 0);
    
    if (numAmount < 0) {
      numAmount = 0;
    }
    
    // 如果有最大值限制，确保不超过最大值
    const maxStars = this._ensureNumber(this.maxStars, 0);
    if (maxStars > 0 && numAmount > maxStars) {
      numAmount = maxStars;
    }
    
    this.stars = numAmount;
    this.lastUpdated = Date.now();
    
    return this.stars;
  }
  
  /**
   * 设置过期日期
   * @param {String} dateString 过期日期字符串（YYYY-MM-DD格式）
   * @returns {Boolean} 是否设置成功
   */
  setExpiryDate(dateString) {
    if (!dateString) {
      this.expiryDate = '';
      this.lastUpdated = Date.now();
      return true;
    }
    
    const expiryDate = new Date(dateString);
    if (isNaN(expiryDate.getTime())) {
      return false;
    }
    
    this.expiryDate = dateString;
    this.lastUpdated = Date.now();
    return true;
  }
  
  /**
   * 检查分组是否为空（没有星星）
   * @returns {Boolean} 是否为空
   */
  isEmpty() {
    return this.stars <= 0;
  }
  
  /**
   * 克隆分组
   * @param {Object} overrides 要覆盖的属性
   * @param {Boolean} generateNewId 是否生成新ID
   * @returns {StarGroup} 新的分组实例
   */
  clone(overrides = {}, generateNewId = true) {
    // 准备基础数据
    const baseData = { ...this };
    
    // 如果需要生成新ID
    if (generateNewId) {
      baseData.id = `group_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      baseData.createTime = Date.now();
      baseData.lastUpdated = Date.now();
    }
    
    // 应用覆盖属性
    const clonedData = {
      ...baseData,
      ...overrides
    };
    
    return new StarGroup(clonedData);
  }

  /**
   * 按过期日期对分组排序
   * @static
   * @param {Array} groups 星星分组数组
   * @returns {Array} 按过期日期排序的分组数组（先过期的在前）
   */
  static sortByExpiryDate(groups) {
    if (!Array.isArray(groups)) {
      return [];
    }
    
    return [...groups].sort((a, b) => {
      // 永久有效类型排在最后
      if (a.expiryType === 'permanent') return 1;
      if (b.expiryType === 'permanent') return -1;
      
      // 没有过期日期的排在有过期日期的后面
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      
      // 按过期日期升序排序（先过期的在前）
      return a.expiryDate - b.expiryDate;
    });
  }
}

module.exports = {
  StarGroup
}; 