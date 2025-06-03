/**
 * user.js - 用户领域模型
 * 
 * 定义用户实体的数据结构、验证规则和业务方法
 */

const logger = require('../utils/logger');

/**
 * 用户角色枚举
 */
const UserRole = {
  PARENT: 'parent',  // 家长
  CHILD: 'child'     // 孩子
};

/**
 * 用户状态枚举
 */
const UserStatus = {
  ACTIVE: 'active',    // 活跃
  INACTIVE: 'inactive' // 非活跃
};

class User {
  /**
   * 构造函数
   * @param {Object} data 用户数据
   */
  constructor(data = {}) {
    // 基础信息
    this.id = data.id || '';
    this.name = data.name || '';
    this.displayName = data.displayName || '';
    this.role = data.role || UserRole.PARENT;
    this.avatar = data.avatar || '';
    this.status = data.status || UserStatus.ACTIVE;
    
    // 时间戳
    this.createTime = data.createTime || Date.now();
    this.modifyTime = data.modifyTime || Date.now();
    
    logger.debug('User', '创建用户实例', { id: this.id, role: this.role });
  }
  
  /**
   * 验证用户数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (!this.id) {
      errors.push('用户ID不能为空');
    }
    
    if (!this.name) {
      errors.push('用户名不能为空');
    }
    
    if (!Object.values(UserRole).includes(this.role)) {
      errors.push('用户角色无效');
    }
    
    if (!Object.values(UserStatus).includes(this.status)) {
      errors.push('用户状态无效');
    }
    
    return errors;
  }
  
  /**
   * 检查是否为家长角色
   * @returns {Boolean} 是否为家长
   */
  isParent() {
    return this.role === UserRole.PARENT;
  }
  
  /**
   * 检查是否为孩子角色
   * @returns {Boolean} 是否为孩子
   */
  isChild() {
    return this.role === UserRole.CHILD;
  }
  
  /**
   * 检查是否为活跃状态
   * @returns {Boolean} 是否活跃
   */
  isActive() {
    return this.status === UserStatus.ACTIVE;
  }
  
  /**
   * 获取页面访问权限
   * @returns {Array} 可访问的页面列表
   */
  getAccessiblePages() {
    const commonPages = [
      'pages/index/index',           // 首页/任务日历
      'pages/rewards/rewards',       // 奖池页
      'pages/star-records/star-records',  // 星星记录
      'pages/my-exchanges/my-exchanges',   // 我的兑换
      'pages/message/message',       // 消息页
      'packageChart/pages/analysis/analysis'  // 分析页
    ];
    
    if (this.isParent()) {
      // 家长可以访问所有页面
      return [
        ...commonPages,
        'pages/task-edit/task-edit',         // 任务编辑
        'pages/reward-manage/reward-manage'  // 奖励管理
      ];
    }
    
    // 孩子只能访问基础页面
    return commonPages;
  }
  
  /**
   * 检查是否有页面访问权限
   * @param {String} pagePath 页面路径
   * @returns {Boolean} 是否有权限
   */
  hasPageAccess(pagePath) {
    const accessiblePages = this.getAccessiblePages();
    return accessiblePages.includes(pagePath);
  }
  
  /**
   * 更新用户信息
   * @param {Object} data 更新数据
   */
  update(data) {
    if (data.name !== undefined) this.name = data.name;
    if (data.displayName !== undefined) this.displayName = data.displayName;
    if (data.avatar !== undefined) this.avatar = data.avatar;
    if (data.status !== undefined) this.status = data.status;
    
    this.modifyTime = Date.now();
    
    logger.info('User', '更新用户信息', { id: this.id, changes: Object.keys(data) });
  }
  
  /**
   * 转换为简单对象
   * @returns {Object} 简单对象
   */
  toObject() {
    return {
      id: this.id,
      name: this.name,
      displayName: this.displayName,
      role: this.role,
      avatar: this.avatar,
      status: this.status,
      createTime: this.createTime,
      modifyTime: this.modifyTime
    };
  }
  
  /**
   * 克隆用户对象
   * @param {Object} overrides 覆盖属性
   * @returns {User} 新的用户对象
   */
  clone(overrides = {}) {
    const data = { ...this.toObject(), ...overrides };
    return new User(data);
  }
}

module.exports = {
  User,
  UserRole,
  UserStatus
}; 