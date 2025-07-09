/**
 * API配置管理
 * 统一管理所有API接口地址和配置参数
 */

const API_CONFIG = {
  // 基础配置
  BASE_URL: 'http://todoceo.xyz',
  TIMEOUT: 10000, // 10秒超时
  RETRY_COUNT: 2, // 重试2次
  
  // API端点
  ENDPOINTS: {
    // 用户相关API
    USERS: '/api/users',
    USER_BY_ID: '/api/users/{userId}',
    USER_CURRENT: '/api/users/current',
    USER_BY_ROLE: '/api/users/role/{role}',
    USER_SWITCH: '/api/users/switch',
    USER_EXISTS: '/api/users/{userId}/exists',
    USER_ACTIVE: '/api/users/active',
    USER_SESSION_VALIDATE: '/api/users/session/validate',
    USER_PAGE_ACCESS: '/api/users/{userId}/pages/{pagePath}/access',
    USER_ACCESSIBLE_PAGES: '/api/users/{userId}/pages',
    
    // 健康检查
    HEALTH: '/health'
  },
  
  // 请求头配置
  HEADERS: {
    'Content-Type': 'application/json'
  },
  
  // 预定义用户ID
  PREDEFINED_USERS: {
    PARENT: 'parent',
    CHILD: 'child'
  }
};

module.exports = API_CONFIG; 