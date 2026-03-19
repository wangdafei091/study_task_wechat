/**
 * permission-utils.js - 权限控制工具
 * 
 * 提供多用户系统的权限管理功能
 */

const logger = require('./logger');
const { UserRole } = require('../models/user');

/**
 * 页面权限配置
 * 定义每种角色可以访问的页面
 */
const PAGE_PERMISSIONS = {
  // 家长权限页面（完整权限）
  [UserRole.PARENT]: [
    '/pages/index/index',           // 首页
    '/pages/task-edit/task-edit',   // 任务编辑
    '/pages/rewards/rewards',       // 奖池页面
    '/packageManage/pages/reward-manage/reward-manage', // 奖励管理
    '/packageManage/pages/my-exchanges/my-exchanges',   // 我的兑换
    '/packageMessage/pages/star-records/star-records',   // 星星记录
    '/packageMessage/pages/message/message',             // 消息中心
    '/packageManage/pages/family-settings/family-settings' // 家庭设置（家长专属）
  ],
  
  // 孩子权限页面（受限权限）
  [UserRole.CHILD]: [
    '/pages/index/index',           // 首页
    '/pages/rewards/rewards',       // 奖池页面
    '/packageManage/pages/my-exchanges/my-exchanges',   // 我的兑换
    '/packageMessage/pages/star-records/star-records',   // 星星记录
    '/packageMessage/pages/message/message',             // 消息中心
    '/packageManage/pages/family-settings/family-settings' // 未加入家庭时可访问（输入邀请码加入）
  ]
};

/**
 * 功能权限配置
 * 定义每种角色可以使用的功能
 */
const FEATURE_PERMISSIONS = {
  [UserRole.PARENT]: {
    // 任务管理权限
    task: {
      create: true,       // 创建任务
      edit: true,         // 编辑任务
      delete: true,       // 删除任务
      complete: true,     // 完成任务
      reset: true,        // 重置任务
      markRequired: true  // 标记必做任务
    },
    
    // 奖励管理权限
    reward: {
      create: true,       // 创建奖励
      edit: true,         // 编辑奖励
      delete: true,       // 删除奖励
      exchange: true,     // 兑换奖励
      manage: true        // 管理奖励状态
    },
    
    // 星星管理权限
    star: {
      view: true,         // 查看星星
      records: true,      // 查看记录
      manual: true        // 手动调整
    },
    
    // 统计和分析权限
    analytics: {
      view: true,         // 查看统计
      export: true        // 导出数据
    },
    
    // 用户管理权限
    user: {
      switch: true,       // 切换用户
      create: true,       // 创建用户
      delete: true        // 删除用户
    }
  },
  
  [UserRole.CHILD]: {
    // 任务管理权限（受限）
    task: {
      create: false,      // 不能创建任务
      edit: false,        // 不能编辑任务
      delete: false,      // 不能删除任务
      complete: true,     // 可以完成任务
      reset: true,        // 可以重置任务（打卡）
      markRequired: false // 不能标记必做任务
    },
    
    // 奖励管理权限（受限）
    reward: {
      create: false,      // 不能创建奖励
      edit: false,        // 不能编辑奖励
      delete: false,      // 不能删除奖励
      exchange: true,     // 可以兑换奖励
      manage: false       // 不能管理奖励状态
    },
    
    // 星星管理权限（受限）
    star: {
      view: true,         // 可以查看星星
      records: true,      // 可以查看记录
      manual: false       // 不能手动调整
    },
    
    // 统计和分析权限（受限）
    analytics: {
      view: true,         // 可以查看基础统计
      export: false       // 不能导出数据
    },
    
    // 用户管理权限（受限）
    user: {
      switch: true,       // 可以切换用户
      create: false,      // 不能创建用户
      delete: false       // 不能删除用户
    }
  }
};

/**
 * 检查用户是否有权限访问指定页面
 * @param {String} userRole 用户角色
 * @param {String} pagePath 页面路径
 * @returns {Boolean} 是否有权限
 */
function hasPagePermission(userRole, pagePath) {
  if (!userRole || !pagePath) {
    logger.warn('PermissionUtils', '检查页面权限失败: 参数不完整', { userRole, pagePath });
    return false;
  }
  
  const allowedPages = PAGE_PERMISSIONS[userRole];
  if (!allowedPages) {
    logger.warn('PermissionUtils', `未知的用户角色: ${userRole}`);
    return false;
  }
  
  const hasPermission = allowedPages.includes(pagePath);
  logger.debug('PermissionUtils', `页面权限检查: ${userRole} -> ${pagePath} = ${hasPermission}`);
  
  return hasPermission;
}

/**
 * 检查用户是否有权限使用指定功能
 * @param {String} userRole 用户角色
 * @param {String} category 功能分类（task/reward/star/analytics/user）
 * @param {String} action 具体操作（create/edit/delete等）
 * @returns {Boolean} 是否有权限
 */
function hasFeaturePermission(userRole, category, action) {
  if (!userRole || !category || !action) {
    logger.warn('PermissionUtils', '检查功能权限失败: 参数不完整', { userRole, category, action });
    return false;
  }
  
  const rolePermissions = FEATURE_PERMISSIONS[userRole];
  if (!rolePermissions) {
    logger.warn('PermissionUtils', `未知的用户角色: ${userRole}`);
    return false;
  }
  
  const categoryPermissions = rolePermissions[category];
  if (!categoryPermissions) {
    logger.warn('PermissionUtils', `未知的功能分类: ${category}`);
    return false;
  }
  
  const hasPermission = categoryPermissions[action] === true;
  logger.debug('PermissionUtils', `功能权限检查: ${userRole} -> ${category}.${action} = ${hasPermission}`);
  
  return hasPermission;
}

/**
 * 获取用户可访问的页面列表
 * @param {String} userRole 用户角色
 * @returns {Array} 可访问的页面路径列表
 */
function getAllowedPages(userRole) {
  if (!userRole) {
    logger.warn('PermissionUtils', '获取允许页面失败: 用户角色为空');
    return [];
  }
  
  const allowedPages = PAGE_PERMISSIONS[userRole] || [];
  logger.info('PermissionUtils', `获取${userRole}角色的允许页面, 数量=${allowedPages.length}`);
  
  return [...allowedPages]; // 返回副本避免修改原数组
}

/**
 * 获取用户的功能权限
 * @param {String} userRole 用户角色
 * @returns {Object} 功能权限对象
 */
function getUserPermissions(userRole) {
  if (!userRole) {
    logger.warn('PermissionUtils', '获取用户权限失败: 用户角色为空');
    return {};
  }
  
  const permissions = FEATURE_PERMISSIONS[userRole] || {};
  logger.info('PermissionUtils', `获取${userRole}角色的功能权限`);
  
  return JSON.parse(JSON.stringify(permissions)); // 深拷贝避免修改原对象
}

/**
 * 重定向到允许的页面
 * @param {String} userRole 用户角色
 * @param {String} targetPath 目标页面路径
 * @param {String} fallbackPath 备用页面路径，默认为首页
 * @returns {String} 最终跳转的页面路径
 */
function redirectToAllowedPage(userRole, targetPath, fallbackPath = '/pages/index/index') {
  if (hasPagePermission(userRole, targetPath)) {
    logger.info('PermissionUtils', `用户${userRole}有权限访问${targetPath}`);
    return targetPath;
  }
  
  // 检查备用页面权限
  if (hasPagePermission(userRole, fallbackPath)) {
    logger.warn('PermissionUtils', `用户${userRole}无权限访问${targetPath}, 重定向到${fallbackPath}`);
    return fallbackPath;
  }
  
  // 如果连备用页面都没权限，返回用户可访问的第一个页面
  const allowedPages = getAllowedPages(userRole);
  const finalPath = allowedPages.length > 0 ? allowedPages[0] : '/pages/index/index';
  
  logger.error('PermissionUtils', `用户${userRole}无权限访问${targetPath}和${fallbackPath}, 重定向到${finalPath}`);
  return finalPath;
}

/**
 * 验证并过滤菜单项
 * @param {Array} menuItems 原始菜单项
 * @param {String} userRole 用户角色
 * @returns {Array} 过滤后的菜单项
 */
function filterMenuItems(menuItems, userRole) {
  if (!Array.isArray(menuItems) || !userRole) {
    logger.warn('PermissionUtils', '过滤菜单项失败: 参数无效');
    return [];
  }
  
  const filteredItems = menuItems.filter(item => {
    if (item.path && !hasPagePermission(userRole, item.path)) {
      return false;
    }
    
    if (item.feature && item.action) {
      return hasFeaturePermission(userRole, item.feature, item.action);
    }
    
    return true;
  });
  
  logger.info('PermissionUtils', `为${userRole}角色过滤菜单项: ${menuItems.length} -> ${filteredItems.length}`);
  return filteredItems;
}

/**
 * 生成权限错误提示
 * @param {String} userRole 用户角色
 * @param {String} operation 操作描述
 * @returns {String} 错误提示文本
 */
function getPermissionErrorMessage(userRole, operation) {
  const roleText = userRole === UserRole.PARENT ? '家长' : '孩子';
  return `${roleText}角色无权限执行"${operation}"操作，请切换到有权限的用户。`;
}

/**
 * 检查是否为管理员权限（家长）
 * @param {String} userRole 用户角色
 * @returns {Boolean} 是否为管理员
 */
function isAdmin(userRole) {
  return userRole === UserRole.PARENT;
}

/**
 * 检查是否为普通用户权限（孩子）
 * @param {String} userRole 用户角色
 * @returns {Boolean} 是否为普通用户
 */
function isRegularUser(userRole) {
  return userRole === UserRole.CHILD;
}

module.exports = {
  // 权限检查
  hasPagePermission,
  hasFeaturePermission,
  
  // 权限获取
  getAllowedPages,
  getUserPermissions,
  
  // 权限处理
  redirectToAllowedPage,
  filterMenuItems,
  getPermissionErrorMessage,
  
  // 角色判断
  isAdmin,
  isRegularUser,
  
  // 常量导出
  PAGE_PERMISSIONS,
  FEATURE_PERMISSIONS
}; 