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

function shouldLogConfig() {
  return !(
    getNodeEnv('NODE_ENV') === 'test' &&
    getNodeEnv('ENABLE_TEST_LOGS') !== 'true'
  );
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

// 微信小程序环境：显式配置优先，未配置时回落本地模式
let finalEnableApi = enableApiEnv;
let finalBaseUrl = apiBaseUrlEnv;

if (typeof wx !== 'undefined') {
  // 未显式配置时保持本地模式，不再自动启用测试后端
  if (enableApiEnv === undefined || enableApiEnv === null || enableApiEnv === '') {
    finalEnableApi = 'false';
    if (shouldLogConfig()) {
      console.log('ℹ️ 微信小程序环境：未配置 ENABLE_API，默认使用本地模式');
    }
  } else {
    if (shouldLogConfig()) {
      console.log('✅ 保留用户配置的API模式:', enableApiEnv);
    }
  }

  // 未显式配置地址时，不再自动落到测试环境地址
  if (!apiBaseUrlEnv || apiBaseUrlEnv === '') {
    finalBaseUrl = '';
    if (shouldLogConfig()) {
      console.log('ℹ️ 微信小程序环境：未配置 API_BASE_URL');
    }
  } else {
    if (shouldLogConfig()) {
      console.log('✅ 保留用户配置的API地址:', apiBaseUrlEnv);
    }
  }
}

const apiExplicitlyEnabled = finalEnableApi === 'true' || finalEnableApi === true;
const hasExplicitBaseUrl = typeof finalBaseUrl === 'string' && finalBaseUrl.trim() !== '';
const finalApiEnabled = apiExplicitlyEnabled && hasExplicitBaseUrl;

const API_CONFIG = {
  // 基础配置
  ENABLE_API: finalApiEnabled,
  BASE_URL: hasExplicitBaseUrl ? finalBaseUrl : '',
  TIMEOUT: 10000, // 10秒超时
  RETRY_COUNT: 2, // 重试2次

  // 🆕 云端存储模式标识 - 添加缺失的属性
  useCloudStorage: finalApiEnabled,
  enableCloudStorage: finalApiEnabled, // 添加useCloudStorage和enableCloudStorage属性

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
    TASK_UPCOMING_SYNC: '/api/tasks/upcoming/sync',
    TASK_REQUIRED: '/api/tasks/{taskId}/required',
    TASK_UNREQUIRED: '/api/tasks/{taskId}/unrequired',
    TASK_PENALTIES_SYNC: '/api/tasks/penalties/sync',
    TASKS_TRANSFER: '/api/tasks/transfer',
    STARS: '/api/stars',
    STAR_RECORDS: '/api/stars/records',
    STAR_GROUPS: '/api/stars/groups',
    STAR_FAMILY_SUMMARY: '/api/stars/family-summary',
    STAR_CONSUME: '/api/stars/consume',
    STAR_EXPIRY_AUTHORITY_SYNC: '/api/stars/expiry-authority/sync',
    STAR_EXPIRING_REMINDERS_SYNC: '/api/stars/expiring-reminders/sync',
    REWARDS: '/api/rewards',
    REWARD_BY_ID: '/api/rewards/{rewardId}',
    REWARD_EXCHANGE: '/api/rewards/{rewardId}/exchange',
    REWARD_CANCEL_EXCHANGE: '/api/rewards/{rewardId}/cancel-exchange',
    MESSAGES: '/api/messages',
    MESSAGE_BY_ID: '/api/messages/{messageId}',
    MESSAGE_READ: '/api/messages/{messageId}/read',
    MESSAGE_READ_ALL: '/api/messages/read-all',

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
