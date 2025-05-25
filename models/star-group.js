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
    this.type = data.type || 'permanent'; // 分组类型，默认为永久
    this.name = data.name || this._getDefaultName(data.type);
    
    // 星星相关
    this.stars = data.stars || 0; // 当前星星数
    this.maxStars = data.maxStars || 0; // 最大星星数，0表示无限制
    
    // 时间相关
    this.createTime = data.createTime || Date.now();
    this.lastUpdated = data.lastUpdated || Date.now();
    this.expiryDate = data.expiryDate || ''; // 过期日期，空字符串表示永不过期
    
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
    if (amount <= 0) {
      return this.stars;
    }
    
    const oldStars = this.stars;
    this.stars += amount;
    
    // 如果有最大值限制，确保不超过最大值
    if (this.maxStars > 0 && this.stars > this.maxStars) {
      this.stars = this.maxStars;
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
    if (amount <= 0) {
      return this.stars;
    }
    
    const oldStars = this.stars;
    this.stars -= amount;
    
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
    // 永久分组永不过期
    if (this.type === 'permanent' || !this.expiryDate) {
      return false;
    }
    
    const now = new Date();
    const expiryDate = new Date(this.expiryDate);
    
    // 如果过期日期无效，视为未过期
    if (isNaN(expiryDate.getTime())) {
      return false;
    }
    
    return now > expiryDate;
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
    if (newAmount < 0) {
      newAmount = 0;
    }
    
    // 如果有最大值限制，确保不超过最大值
    if (this.maxStars > 0 && newAmount > this.maxStars) {
      newAmount = this.maxStars;
    }
    
    this.stars = newAmount;
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
}

module.exports = {
  StarGroup
}; 