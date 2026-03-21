/**
 * task.js - 任务领域模型
 * 
 * 定义任务实体的数据结构、验证规则和业务方法
 */

/**
 * 任务类型枚举
 */
const TaskType = {
  STUDY: 'study',   // 学习任务
  HABIT: 'habit',   // 习惯任务
  INTEREST: 'interest', // 兴趣任务
};

/**
 * 任务状态枚举
 */
const TaskStatus = {
  PENDING: 0,  // 待完成
  COMPLETED: 1 // 已完成
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
 * 重复类型枚举
 */
const RepeatType = {
  NONE: 'none',     // 不重复
  DAILY: 'daily',   // 每日重复
  WEEKLY: 'weekly', // 每周重复
  MONTHLY: 'monthly' // 每月重复
};

class Task {
  /**
   * 构造函数
   * @param {Object} data 任务数据
   */
  constructor(data = {}) {
    // 基础信息
    this.id = data.id || `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.userId = data.userId || ''; // 用户ID，标识任务归属
    this.title = data.title || '';
    this.description = data.description || '';
    this.type = data.type || TaskType.STUDY;
    
    // 时间相关
    this.date = data.date || this._formatDate(new Date());
    this.startTime = data.startTime || '';
    this.endTime = data.endTime || '';
    this.duration = data.duration || 0;
    this.isAllDay = data.isAllDay || false;  // 添加全天任务标志
    
    // 状态相关
    this.status = data.status ?? TaskStatus.PENDING;
    this.isRequired = data.isRequired || false;
    this.penaltyApplied = data.penaltyApplied || false;
    this.completionTime = data.completionTime || 0;
    
    // 星星奖励
    this.points = data.points || 0;
    this.pointsExpiry = data.pointsExpiry || StarExpiryType.PERMANENT;
    this.pointsExpiryDate = data.pointsExpiryDate || '';
    this.starAwarded = data.starAwarded || false;
    
    // 重复设置
    this.repeat = data.repeat || { type: RepeatType.NONE };
    this.parentTaskId = data.parentTaskId || '';
    this.hasNoEndDate = data.hasNoEndDate || false;
    
    // 其他属性
    this.createTime = data.createTime || Date.now();
    this.modifyTime = data.modifyTime || Date.now();
    this.tags = data.tags || [];
    // 云端同步状态：true 表示曾经成功同步到云端，用于安全清理陈旧任务
    this.syncedToCloud = data.syncedToCloud || false;
    
    // 初始化默认值
    this._initDefaults();
  }
  
  /**
   * 初始化默认值
   * @private
   */
  _initDefaults() {
    // 为学习类任务设置必要的时间字段（仅对非全天任务）
    if (this.type === TaskType.STUDY && !this.isAllDay) {
      // 如果没有开始时间，设置默认值
      if (!this.startTime) {
        this.startTime = '08:00';
      }
      
      // 如果有开始时间和持续时间，但没有结束时间，计算结束时间
      if (this.startTime && this.duration && !this.endTime) {
        this.endTime = this._calculateEndTime(this.startTime, this.duration);
      }
      // 如果有开始时间和结束时间，但没有持续时间，计算持续时间
      else if (this.startTime && this.endTime && !this.duration) {
        this.duration = this._calculateDuration(this.startTime, this.endTime);
      }
    }
    
    // 确保有积分有效期字段
    if (!this.pointsExpiry) {
      this.pointsExpiry = StarExpiryType.PERMANENT;
    }
    
    // 兼容旧数据，将pointsValidPeriod转换为pointsExpiry
    if (!this.pointsExpiry && data && data.pointsValidPeriod) {
      this.pointsExpiry = data.pointsValidPeriod;
    }
  }
  
  /**
   * 格式化日期为YYYY-MM-DD格式
   * @private
   * @param {Date} date 日期对象
   * @returns {String} 格式化后的日期字符串
   */
  _formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  /**
   * 根据开始时间和持续时间计算结束时间
   * @private
   * @param {String} startTime 开始时间（格式：HH:MM）
   * @param {Number} durationMinutes 持续时间（分钟）
   * @returns {String} 结束时间（格式：HH:MM）
   */
  _calculateEndTime(startTime, durationMinutes) {
    const [hours, minutes] = startTime.split(':').map(Number);
    let endMinutes = minutes + durationMinutes;
    let endHours = hours + Math.floor(endMinutes / 60);
    endMinutes = endMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  }
  
  /**
   * 计算开始时间和结束时间之间的持续时间（分钟）
   * @private
   * @param {String} startTime 开始时间（格式：HH:MM）
   * @param {String} endTime 结束时间（格式：HH:MM）
   * @returns {Number} 持续时间（分钟）
   */
  _calculateDuration(startTime, endTime) {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    
    return endTotalMinutes - startTotalMinutes;
  }
  
  /**
   * 验证任务数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (!this.title) {
      errors.push('任务标题不能为空');
    }
    
    if (!this.date) {
      errors.push('任务日期不能为空');
    }
    
    // 验证类型特定字段
    if (this.type === TaskType.STUDY) {
      // 对于全天任务，跳过时间验证
      if (this.isAllDay) {
        // 全天任务不需要验证时间字段
      } else {
        // 非全天学习任务需要验证时间
        if (!this.startTime) {
          errors.push('学习任务必须设置开始时间');
        }
        
        if (!this.duration && !this.endTime) {
          errors.push('学习任务必须设置结束时间或持续时间');
        }
      }
    }
    
    // 验证重复设置
    if (this.repeat && this.repeat.type !== RepeatType.NONE) {
      if (!this.repeat.startDate) {
        errors.push('重复任务必须设置开始日期');
      }
      
      // 如果不是无结束日期且有结束日期，验证结束日期必须大于等于开始日期
      if (!this.hasNoEndDate && this.repeat.endDate) {
        const startDate = new Date(this.repeat.startDate);
        const endDate = new Date(this.repeat.endDate);
        
        if (endDate < startDate) {
          errors.push('重复任务的结束日期必须大于等于开始日期');
        }
      }
    }
    
    return errors;
  }
  
  /**
   * 完成任务
   * @returns {Task} 当前任务实例
   */
  complete() {
    this.status = TaskStatus.COMPLETED;
    this.completionTime = Date.now();
    this.modifyTime = Date.now();
    
    return this;
  }
  
  /**
   * 重置任务状态为未完成
   * @returns {Task} 当前任务实例
   */
  reset() {
    this.status = TaskStatus.PENDING;
    this.completionTime = 0;
    this.modifyTime = Date.now();
    
    return this;
  }
  
  /**
   * 更新任务信息
   * @param {Object} data 要更新的数据
   * @returns {Task} 当前任务实例
   */
  update(data) {
    if (!data) return this;
    
    // 更新基本字段
    if (data.title !== undefined) this.title = data.title;
    if (data.description !== undefined) this.description = data.description;
    if (data.date !== undefined) this.date = data.date;
    if (data.type !== undefined) this.type = data.type;
    if (data.startTime !== undefined) this.startTime = data.startTime;
    if (data.endTime !== undefined) this.endTime = data.endTime;
    if (data.duration !== undefined) this.duration = data.duration;
    if (data.isAllDay !== undefined) this.isAllDay = data.isAllDay;  // 添加isAllDay字段更新支持
    if (data.isRequired !== undefined) this.isRequired = data.isRequired;
    if (data.penaltyApplied !== undefined) this.penaltyApplied = data.penaltyApplied;
    if (data.points !== undefined) this.points = data.points;
    if (data.pointsExpiry !== undefined) this.pointsExpiry = data.pointsExpiry;
    if (data.starAwarded !== undefined) this.starAwarded = data.starAwarded;
    if (data.tags !== undefined) this.tags = [...data.tags];
    
    // 更新重复设置
    if (data.repeat) {
      this.repeat = { ...this.repeat, ...data.repeat };
    }
    
    if (data.hasNoEndDate !== undefined) {
      this.hasNoEndDate = data.hasNoEndDate;
    }
    
    // 更新修改时间
    this.modifyTime = Date.now();
    
    // 重新初始化默认值
    this._initDefaults();
    
    return this;
  }
  
  /**
   * 是否为重复任务
   * @returns {Boolean} 是否为重复任务
   */
  isRepeating() {
    return this.repeat && this.repeat.type !== RepeatType.NONE;
  }
  
  /**
   * 是否为重复任务的子任务
   * @returns {Boolean} 是否为子任务
   */
  isChildTask() {
    return !!this.parentTaskId;
  }
  
  /**
   * 是否已完成
   * @returns {Boolean} 是否已完成
   */
  isCompleted() {
    return this.status === TaskStatus.COMPLETED;
  }
  
  /**
   * 是否已过期（任务日期早于当前日期且未完成）
   * @returns {Boolean} 是否已过期
   */
  isExpired() {
    const today = this._formatDate(new Date());
    return this.date < today && !this.isCompleted();
  }
  
  /**
   * 是否为今日任务
   * @returns {Boolean} 是否为今日任务
   */
  isToday() {
    const today = this._formatDate(new Date());
    return this.date === today;
  }
  
  /**
   * 获取重复任务的下一个日期
   * @returns {String|null} 下一个日期，如果不是重复任务则返回null
   */
  getNextDate() {
    if (!this.isRepeating()) return null;
    
    const currentDate = new Date(this.date);
    let nextDate;
    
    switch (this.repeat.type) {
      case RepeatType.DAILY:
        nextDate = new Date(currentDate);
        nextDate.setDate(currentDate.getDate() + 1);
        break;
      case RepeatType.WEEKLY:
        nextDate = new Date(currentDate);
        nextDate.setDate(currentDate.getDate() + 7);
        break;
      case RepeatType.MONTHLY:
        nextDate = new Date(currentDate);
        nextDate.setMonth(currentDate.getMonth() + 1);
        break;
      default:
        return null;
    }
    
    return this._formatDate(nextDate);
  }
  
  /**
   * 克隆任务创建一个新实例
   * @param {Object} overrides 要覆盖的属性
   * @param {Boolean} generateNewId 是否生成新ID（默认为true）
   * @returns {Task} 新的任务实例
   */
  clone(overrides = {}, generateNewId = true) {
    // 显式复制所有属性，确保不丢失任何数据
    const baseData = {
      id: this.id,
      userId: this.userId,
      title: this.title,
      description: this.description,
      type: this.type,
      date: this.date,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      isAllDay: this.isAllDay,  // 添加isAllDay字段到克隆数据
      status: this.status,
      isRequired: this.isRequired,
      penaltyApplied: this.penaltyApplied,
      completionTime: this.completionTime,
      points: this.points,
      pointsExpiry: this.pointsExpiry,
      pointsExpiryDate: this.pointsExpiryDate,
      starAwarded: this.starAwarded,
      repeat: this.repeat ? { ...this.repeat } : { type: RepeatType.NONE },
      parentTaskId: this.parentTaskId,
      hasNoEndDate: this.hasNoEndDate,
      createTime: this.createTime,
      modifyTime: this.modifyTime,
      tags: this.tags ? [...this.tags] : []
    };
    
    if (generateNewId) {
      // 创建新任务时，重置状态和时间戳
      baseData.createTime = Date.now();
      baseData.modifyTime = Date.now();
      baseData.status = TaskStatus.PENDING;
      baseData.completionTime = 0;
      
      // 生成新ID
      if (!overrides.id) {
        baseData.id = `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      }
    }
    // 如果不生成新ID（用于保存现有任务），则保留原始状态和时间戳
    
    // 应用覆盖属性
    const clonedData = {
      ...baseData,
      ...overrides
    };
    
    return new Task(clonedData);
  }
  
  /**
   * 创建重复任务的子任务
   * @param {String} date 子任务日期
   * @returns {Task} 子任务实例
   */
  createChildTask(date) {
    if (!date) return null;
    
    const childTask = this.clone({
      date: date,
      parentTaskId: this.id,
      status: TaskStatus.PENDING,
      completionTime: 0
    });
    
    return childTask;
  }

  /**
   * 判断任务是否可以取消打勾
   * @param {Number} lastExchangeTime 最后一次兑换时间戳，如果没有兑换过则为null
   * @returns {Boolean} 是否可以取消打勾
   */
  canBeUnchecked(lastExchangeTime = null) {
    // 如果任务未完成，无需判断
    if (!this.isCompleted()) {
      return false;
    }
    
    // 如果从未兑换过奖励，任务可以取消打勾
    if (!lastExchangeTime) {
      return true;
    }
    
    // 如果任务完成时间早于最后一次兑换时间，则任务被锁定，不能取消打勾
    if (this.completionTime < lastExchangeTime) {
      return false;
    }
    
    // 如果任务完成时间晚于最后一次兑换时间，任务可以取消打勾
    return true;
  }

  /**
   * 判断任务是否被锁定（不能取消打勾）
   * @param {Number} lastExchangeTime 最后一次兑换时间戳，如果没有兑换过则为null
   * @returns {Boolean} 是否被锁定
   */
  isLocked(lastExchangeTime = null) {
    return !this.canBeUnchecked(lastExchangeTime);
  }
}

// 导出类和枚举
module.exports = {
  Task,
  TaskType,
  TaskStatus,
  StarExpiryType,
  RepeatType
}; 