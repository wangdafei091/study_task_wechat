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
    this.userId = data.userId || '';
    // 兼容前后端字段：优先使用nickname（后端API），降级到name（本地存储）
    this.name = data.nickname || data.name || '';
    this.displayName = data.displayName || '';
    this.role = data.role || UserRole.PARENT;
    this.avatar = data.avatar || '';
    this.status = data.status || UserStatus.ACTIVE;

    // 家庭相关字段（M6新增）
    this.familyId = data.familyId || null;
    this.isVirtual = Boolean(data.isVirtual);
    this.createdByUserId = data.createdByUserId || null;

    // 时间戳
    this.createTime = data.createTime || Date.now();
    this.modifyTime = data.modifyTime || Date.now();

    logger.debug('User', '创建用户实例', { userId: this.userId, role: this.role });
  }
  
  /**
   * 获取用户ID（兼容性getter）
   * @returns {String} 用户ID
   */
  get id() {
    return this.userId;
  }
  
  /**
   * 设置用户ID（兼容性setter）
   * @param {String} value 用户ID
   */
  set id(value) {
    this.userId = value;
  }
  
  /**
   * 验证用户数据有效性
   * @returns {Array} 错误信息数组，如果没有错误则为空数组
   */
  validate() {
    const errors = [];
    
    // 验证基本信息
    if (!this.userId) {
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
   * 权限由 loginUser（设备拥有者）决定，不随视角切换变化
   * @param {User} loginUser 登录用户（设备拥有者），不传则用自身
   * @returns {Array} 可访问的页面列表
   */
  getAccessiblePages(loginUser) {
    // 权限判断基于 loginUser（不随 currentUser 变化）
    const effectiveRole = loginUser ? loginUser.role : this.role;

    const commonPages = [
      'pages/index/index',
      'pages/rewards/rewards',
      'pages/star-records/star-records',
      'pages/my-exchanges/my-exchanges',
      'pages/message/message',
      'packageChart/pages/analysis/analysis'
    ];

    if (effectiveRole === UserRole.PARENT) {
      return [
        ...commonPages,
        'pages/task-edit/task-edit',
        'pages/reward-manage/reward-manage',
        'packageManage/pages/family-settings/family-settings'
      ];
    }

    return commonPages;
  }

  /**
   * 检查是否有页面访问权限
   * 权限由 loginUser 决定，不随视角切换变化
   * @param {String} pagePath 页面路径
   * @param {User} loginUser 登录用户（设备拥有者），不传则用自身
   * @returns {Boolean} 是否有权限
   */
  hasPageAccess(pagePath, loginUser) {
    const accessiblePages = this.getAccessiblePages(loginUser);
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
    
    logger.info('User', '更新用户信息', { userId: this.userId, changes: Object.keys(data) });
  }
  
  /**
   * 转换为简单对象
   * @returns {Object} 简单对象
   */
  toObject() {
    return {
      userId: this.userId,
      name: this.name,
      displayName: this.displayName,
      role: this.role,
      avatar: this.avatar,
      status: this.status,
      familyId: this.familyId,
      isVirtual: this.isVirtual,
      createdByUserId: this.createdByUserId,
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