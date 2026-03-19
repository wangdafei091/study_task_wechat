/**
 * API配置管理
 * 统一管理所有API接口地址和配置参数
 */

function getNodeEnv(name) {
  if (typeof process === 'undefined' || !process || !process.env) {
    return undefined;
  }
  return process.env[name];
}

// 支持微信小程序环境配置
function getWechatStorage(key) {
  if (typeof wx === 'undefined' || !wx) {
    return undefined;
  }
  try {
    return wx.getStorageSync(key);
  } catch (error) {
    return undefined;
  }
}

// ✅ 微信小程序环境：始终使用 wx.getStorageSync 的配置
// 优先从环境变量读取，支持微信小程序存储
const enableApiEnv = getNodeEnv('ENABLE_API') || getWechatStorage('ENABLE_API');
const apiBaseUrlEnv = getNodeEnv('API_BASE_URL') || getWechatStorage('API_BASE_URL');

// 🆕 微信小程序环境：如果没有配置，默认使用HTTPS地址
let finalEnableApi = enableApiEnv;
let finalBaseUrl = apiBaseUrlEnv;

if (typeof wx !== 'undefined') {
  // 只有在未明确设置时才启用API，保留用户的明确配置（包括'false'）
  if (enableApiEnv === undefined || enableApiEnv === null || enableApiEnv === '') {
    finalEnableApi = 'true';
    console.log('✅ 微信小程序环境：默认启用API模式');
  } else {
    console.log('✅ 保留用户配置的API模式:', enableApiEnv);
  }

  // 🔧 配置：默认使用 HTTPS 地址，可通过环境变量或小程序存储覆盖
  if (!apiBaseUrlEnv || apiBaseUrlEnv === '') {
    finalBaseUrl = 'https://api.todoceo.xyz';
    console.log('✅ 微信小程序环境：使用默认HTTPS地址');
  } else {
    console.log('✅ 保留用户配置的API地址:', apiBaseUrlEnv);
  }
}

const API_CONFIG = {
  // 基础配置
  ENABLE_API: finalEnableApi === 'true' || finalEnableApi === true,  // 支持字符串和布尔值，默认关闭
  BASE_URL: finalBaseUrl || 'https://api.todoceo.xyz',  // 运行时安全读取环境变量
  TIMEOUT: 10000, // 10秒超时
  RETRY_COUNT: 2, // 重试2次

  // 🆕 云端存储模式标识 - 添加缺失的属性
  useCloudStorage: finalEnableApi === 'true' || finalEnableApi === true,
  enableCloudStorage: finalEnableApi === 'true' || finalEnableApi === true, // 添加useCloudStorage和enableCloudStorage属性

  // API端点
  ENDPOINTS: {
    // 认证相关API
    AUTH_LOGIN: '/api/auth/login',
    AUTH_VALIDATE: '/api/auth/validate',
    AUTH_CURRENT: '/api/auth/current',

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

    // 任务相关API
    TASKS: '/api/tasks',
    TASK_BY_ID: '/api/tasks/{taskId}',
    TASK_STATUS: '/api/tasks/{taskId}/status',

    // 用户昵称修改
    USER_NICKNAME: '/api/users/{userId}/nickname',

    // 家庭相关API
    FAMILIES: '/api/families',
    FAMILIES_JOIN: '/api/families/join',
    FAMILIES_CURRENT: '/api/families/current',
    FAMILIES_MEMBERS: '/api/families/current/members',
    FAMILIES_INVITE_CODE: '/api/families/current/invite-code',
    FAMILIES_ADD_MEMBER: '/api/families/members',
    FAMILIES_DELETE_MEMBER: '/api/families/members/{userId}',

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
