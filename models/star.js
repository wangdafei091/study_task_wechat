/**
 * star.js - 星星领域模型
 * 
 * 定义星星实体的数据结构、验证规则和业务方法
 */

/**
 * 星星来源类型枚举
 */
const StarSourceType = {
  TASK: 'task',           // 任务奖励
  SYSTEM: 'system',       // 系统奖励
  ADJUSTMENT: 'adjustment' // 手动调整
};

/**
 * 星星状态枚举
 */
const StarStatus = {
  ACTIVE: 'active',     // 活跃状态
  USED: 'used',         // 已使用
  EXPIRED: 'expired',   // 已过期
  RESERVED: 'reserved'  // 已预留
};

/**
 * 星星有效期类型枚举
 */
const StarExpiryType = {
  PERMANENT: 'permanent', // 永久有效
  WEEK: 'week',           // 本周有效（周日24点过期）
  MONTH: 'month',         // 本月有效（月末24点过期）
  QUARTER: 'quarter',     // 本季度有效（季度末24点过期）
  DAYS: 'days'            // 指定天数后过期
};

class Star {
  /**
   * 构造函数
   * @param {Object} data 星星数据
   */
  constructor(data = {}) {
    // 基础信息
    this.id = data.id || `star_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.value = data.value || 1;
    
    // 来源相关
    this.sourceType = data.sourceType || StarSourceType.SYSTEM;
    this.sourceId = data.sourceId || '';
    this.description = data.description || '';
    
    // 状态相关
    this.status = data.status || StarStatus.ACTIVE;
    this.groupId = data.groupId || '';
    
    // 时间相关
    this.createTime = data.createTime || Date.now();
    this.usedTime = data.usedTime || 0;
    this.expiryDate = data.expiryDate || '';
    this.expiryType = data.expiryType || StarExpiryType.PERMANENT;
    this.expiryDays = data.expiryDays || 0;
    
    // 其他属性
    this.tags = data.tags || [];
  }
  
  /**
   * 验证星星数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (this.value <= 0) {
      errors.push('星星值必须大于0');
    }
    
    // 验证来源类型
    if (!this.sourceType) {
      errors.push('星星来源类型不能为空');
    } else if (!Object.values(StarSourceType).includes(this.sourceType)) {
      errors.push('无效的星星来源类型');
    }
    
    // 验证状态
    if (!this.status) {
      errors.push('星星状态不能为空');
    } else if (!Object.values(StarStatus).includes(this.status)) {
      errors.push('无效的星星状态');
    }
    
    // 验证时间相关字段
    if (this.status === StarStatus.USED && !this.usedTime) {
      errors.push('已使用的星星必须有使用时间');
    }
    
    // 验证有效期类型
    if (!this.expiryType) {
      errors.push('星星有效期类型不能为空');
    } else if (!Object.values(StarExpiryType).includes(this.expiryType)) {
      errors.push('无效的星星有效期类型');
    }
    
    // 验证有效期天数
    if (this.expiryType === StarExpiryType.DAYS && this.expiryDays <= 0) {
      errors.push('按天数过期的星星必须设置有效期天数');
    }
    
    return errors;
  }
  
  /**
   * 标记星星为已使用
   * @param {String} usageId 使用ID
   * @returns {Star} 当前星星实例
   */
  markAsUsed(usageId = '') {
    // 如果已经是非活跃状态，不做改变
    if (this.status !== StarStatus.ACTIVE) {
      return this;
    }
    
    this.status = StarStatus.USED;
    this.usedTime = Date.now();
    this.usageId = usageId || '';
    
    return this;
  }
  
  /**
   * 标记星星为已过期
   * @returns {Star} 当前星星实例
   */
  markAsExpired() {
    // 如果已经是非活跃状态，不做改变
    if (this.status !== StarStatus.ACTIVE) {
      return this;
    }
    
    this.status = StarStatus.EXPIRED;
    this.expiryTime = Date.now();
    
    return this;
  }
  
  /**
   * 标记星星为已预留
   * @param {String} reservationId 预留ID
   * @returns {Star} 当前星星实例
   */
  markAsReserved(reservationId = '') {
    // 如果已经是非活跃状态，不做改变
    if (this.status !== StarStatus.ACTIVE) {
      return this;
    }
    
    this.status = StarStatus.RESERVED;
    this.reservationId = reservationId || '';
    this.reservationTime = Date.now();
    
    return this;
  }
  
  /**
   * 取消预留状态
   * @returns {Star} 当前星星实例
   */
  cancelReservation() {
    // 只有预留状态的星星可以取消预留
    if (this.status !== StarStatus.RESERVED) {
      return this;
    }
    
    this.status = StarStatus.ACTIVE;
    this.reservationId = '';
    this.reservationTime = 0;
    
    return this;
  }
  
  /**
   * 检查星星是否已过期
   * @returns {Boolean} 是否已过期
   */
  isExpired() {
    // 已经是过期状态
    if (this.status === StarStatus.EXPIRED) {
      return true;
    }
    
    // 非活跃状态且不是过期状态的星星视为未过期
    if (this.status !== StarStatus.ACTIVE) {
      return false;
    }
    
    // 永久有效的星星不会过期
    if (this.expiryType === StarExpiryType.PERMANENT) {
      return false;
    }
    
    // 如果有明确的过期日期，检查是否过期
    if (this.expiryDate) {
      const expiryDate = new Date(this.expiryDate);
      return Date.now() > expiryDate.getTime();
    }
    
    // 如果是按天数计算过期时间，检查是否过期
    if (this.expiryType === StarExpiryType.DAYS && this.expiryDays > 0) {
      const expiryTime = this.createTime + (this.expiryDays * 24 * 60 * 60 * 1000);
      return Date.now() > expiryTime;
    }
    
    // 如果是按周期计算过期时间，检查是否过期
    if (this.expiryType === StarExpiryType.WEEK ||
        this.expiryType === StarExpiryType.MONTH ||
        this.expiryType === StarExpiryType.QUARTER) {
      const expiryTime = this._calculateExpiryTime();
      return Date.now() > expiryTime;
    }
    
    // 默认不过期
    return false;
  }
  
  /**
   * 计算过期时间
   * @private
   * @returns {Number} 过期时间（毫秒时间戳）
   */
  _calculateExpiryTime() {
    const now = new Date();
    
    switch (this.expiryType) {
      case StarExpiryType.WEEK: {
        // 计算本周日的时间
        const dayOfWeek = now.getDay(); // 0表示周日，1表示周一，以此类推
        const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
        const sunday = new Date(now);
        sunday.setDate(now.getDate() + daysUntilSunday);
        sunday.setHours(23, 59, 59, 999);
        return sunday.getTime();
      }
      
      case StarExpiryType.MONTH: {
        // 计算本月最后一天的时间
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        lastDayOfMonth.setHours(23, 59, 59, 999);
        return lastDayOfMonth.getTime();
      }
      
      case StarExpiryType.QUARTER: {
        // 计算本季度最后一天的时间
        const currentMonth = now.getMonth();
        const quarterEndMonth = Math.floor(currentMonth / 3) * 3 + 2; // 0,1,2->2; 3,4,5->5; 6,7,8->8; 9,10,11->11
        const lastDayOfQuarter = new Date(now.getFullYear(), quarterEndMonth + 1, 0);
        lastDayOfQuarter.setHours(23, 59, 59, 999);
        return lastDayOfQuarter.getTime();
      }
      
      case StarExpiryType.DAYS: {
        // 计算指定天数后的时间
        if (this.expiryDays <= 0) return Number.MAX_SAFE_INTEGER; // 永不过期
        return this.createTime + (this.expiryDays * 24 * 60 * 60 * 1000);
      }
      
      case StarExpiryType.PERMANENT:
      default:
        return Number.MAX_SAFE_INTEGER; // 永不过期
    }
  }
  
  /**
   * 获取过期日期
   * @returns {Date|null} 过期日期或null（永不过期）
   */
  getExpiryDate() {
    if (this.expiryType === StarExpiryType.PERMANENT) {
      return null;
    }
    
    if (this.expiryDate) {
      return new Date(this.expiryDate);
    }
    
    const expiryTime = this._calculateExpiryTime();
    return new Date(expiryTime);
  }
  
  /**
   * 获取剩余有效天数
   * @returns {Number} 剩余有效天数，-1表示永不过期，0表示已过期
   */
  getRemainingDays() {
    // 已经是过期状态
    if (this.status === StarStatus.EXPIRED) {
      return 0;
    }
    
    // 非活跃状态且不是过期状态的星星不考虑过期问题
    if (this.status !== StarStatus.ACTIVE) {
      return -1;
    }
    
    // 永久有效的星星不会过期
    if (this.expiryType === StarExpiryType.PERMANENT) {
      return -1;
    }
    
    // 获取过期时间
    const expiryTime = this.expiryDate ? new Date(this.expiryDate).getTime() : this._calculateExpiryTime();
    const now = Date.now();
    
    // 已过期
    if (now > expiryTime) {
      return 0;
    }
    
    // 计算剩余天数
    const remainingMs = expiryTime - now;
    return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  }
  
  /**
   * 获取星星状态描述
   * @returns {String} 状态描述
   */
  getStatusDescription() {
    switch (this.status) {
      case StarStatus.ACTIVE: return '有效';
      case StarStatus.USED: return '已使用';
      case StarStatus.EXPIRED: return '已过期';
      case StarStatus.RESERVED: return '已预留';
      default: return '未知状态';
    }
  }
  
  /**
   * 获取星星有效期描述
   * @returns {String} 有效期描述
   */
  getExpiryDescription() {
    if (this.expiryType === StarExpiryType.PERMANENT) {
      return '永久有效';
    }
    
    const remainingDays = this.getRemainingDays();
    
    if (remainingDays === 0) {
      return '已过期';
    }
    
    if (remainingDays === 1) {
      return '今天到期';
    }
    
    if (remainingDays > 0 && remainingDays <= 7) {
      return `${remainingDays}天后到期`;
    }
    
    // 显示具体日期
    const expiryDate = this.getExpiryDate();
    if (expiryDate) {
      return `${expiryDate.getFullYear()}-${expiryDate.getMonth() + 1}-${expiryDate.getDate()}到期`;
    }
    
    return '未知有效期';
  }
  
  /**
   * 克隆星星
   * @param {Object} overrides 要覆盖的属性
   * @param {Boolean} generateNewId 是否生成新ID
   * @returns {Star} 新的星星实例
   */
  clone(overrides = {}, generateNewId = true) {
    // 准备基础数据
    const baseData = { ...this };
    
    // 如果需要生成新ID
    if (generateNewId) {
      baseData.id = `star_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      baseData.createTime = Date.now();
      baseData.status = StarStatus.ACTIVE;
      baseData.usedTime = 0;
    }
    
    // 应用覆盖属性
    const clonedData = {
      ...baseData,
      ...overrides
    };
    
    return new Star(clonedData);
  }
}

module.exports = {
  Star,
  StarSourceType,
  StarStatus,
  StarExpiryType
}; 