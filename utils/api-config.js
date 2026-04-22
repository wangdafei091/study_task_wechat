/**
 * API配置管理
 * 统一管理所有API接口地址和配置参数
 */

const { resolveRuntimeApiConfig } = require('./runtime-config');

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

const runtimeApiConfig = resolveRuntimeApiConfig();

if (typeof wx !== 'undefined' && shouldLogConfig()) {
  if (!runtimeApiConfig.explicitlyEnabled) {
    console.log('ℹ️ 微信小程序环境：未配置 ENABLE_API，默认使用本地模式');
  } else {
    console.log('✅ 保留用户配置的API模式:', runtimeApiConfig.enableApiRaw);
  }

  if (!runtimeApiConfig.hasBaseUrl) {
    console.log('ℹ️ 微信小程序环境：未配置 API_BASE_URL');
  } else if (!runtimeApiConfig.baseUrl) {
    console.log('⚠️ 微信小程序环境：API_BASE_URL 非法，回退本地模式');
  } else {
    console.log('✅ 保留用户配置的API地址:', runtimeApiConfig.baseUrl);
  }
}

const API_CONFIG = {
  // 基础配置
  ENABLE_API: runtimeApiConfig.enabled,
  BASE_URL: runtimeApiConfig.baseUrl,
  TIMEOUT: 10000, // 10秒超时
  RETRY_COUNT: 2, // 重试2次

  // 🆕 云端存储模式标识 - 添加缺失的属性
  useCloudStorage: runtimeApiConfig.enabled,
  enableCloudStorage: runtimeApiConfig.enabled, // 添加useCloudStorage和enableCloudStorage属性
  RUNTIME: runtimeApiConfig,

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
    TASK_OCCURRENCE_RECORD: '/api/tasks/{taskId}/occurrence-record',
    TASK_OCCURRENCE_DISABLE: '/api/tasks/{taskId}/disable-occurrence',
    TASK_OCCURRENCE_CONVERT: '/api/tasks/{taskId}/convert-occurrence',
    TASK_UPCOMING_SYNC: '/api/tasks/upcoming/sync',
    TASK_REQUIRED: '/api/tasks/{taskId}/required',
    TASK_UNREQUIRED: '/api/tasks/{taskId}/unrequired',
    TASK_PENALTIES_SYNC: '/api/tasks/penalties/sync',
    TASKS_TRANSFER: '/api/tasks/transfer',
    TASK_TEMPLATES: '/api/task-templates',
    TASK_TEMPLATE_RECOMMENDATIONS_QUERY: '/api/task-templates/recommendations/query',
    TASK_TEMPLATE_BY_ID: '/api/task-templates/{templateId}',
    TASK_TEMPLATE_ENABLED: '/api/task-templates/{templateId}/enabled',
    TASK_TEMPLATE_USAGE: '/api/task-templates/{templateId}/usage',
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
    FAMILIES_MEMBER_PERMISSION_ROLE: '/api/families/members/{userId}/permission-role',

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
