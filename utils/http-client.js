/**
 * HTTP客户端工具
 * 封装微信小程序的网络请求，提供统一的API调用接口
 */

const API_CONFIG = require('./api-config');
const logger = require('./logger');
const TokenManager = require('./token-manager');

function buildHttpError(message, options = {}) {
  const error = new Error(message || '请求失败');
  if (options.code) {
    error.code = options.code;
  }
  if (options.statusCode) {
    error.statusCode = options.statusCode;
  }
  if (options.responseData) {
    error.responseData = options.responseData;
  }
  return error;
}

function rejectWithResponseError(reject, res, fallbackMessage) {
  const responseData = res?.data || {};
  const message = responseData.message || fallbackMessage || '请求失败';
  const code = responseData.error_code || responseData.errorCode || null;
  reject(buildHttpError(message, {
    code,
    statusCode: res?.statusCode || null,
    responseData
  }));
}

class HttpClient {
  
  /**
   * 执行HTTP请求
   * @param {Object} options 请求选项
   * @param {string} options.url 请求地址
   * @param {string} options.method 请求方法
   * @param {Object} options.data 请求数据
   * @param {Object} options.params 查询参数
   * @returns {Promise} 请求结果
   */
  static async request(options) {
    const { url, method = 'GET', data, params } = options;

    // 检查 API 是否启用
    if (!API_CONFIG.ENABLE_API) {
      const errorMsg = 'API已禁用，使用本地存储模式';
      logger.warn('HttpClient', errorMsg);
      return Promise.reject(new Error(errorMsg));
    }

    // 自动添加JWT token到Authorization头
    const headers = { ...API_CONFIG.HEADERS };
    const token = TokenManager.getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 构建完整URL，避免 base/path 拼接产生双斜杠
    const isAbsoluteUrl = /^https?:\/\//.test(url);
    const normalizedBaseUrl = (API_CONFIG.BASE_URL || '').replace(/\/+$/, '');
    const normalizedPath = `/${String(url || '').replace(/^\/+/, '')}`;
    let fullUrl = isAbsoluteUrl
      ? url
      : `${normalizedBaseUrl}${normalizedPath}`;
    
    // 添加查询参数
    if (params && Object.keys(params).length > 0) {
      const queryString = Object.keys(params)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join('&');
      fullUrl += `?${queryString}`;
    }
    
    logger.info('HttpClient', `发起请求: ${method} ${fullUrl}`, { data, params });
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: fullUrl,
        method: method,
        data: data,
        header: headers,
        timeout: API_CONFIG.TIMEOUT,
        success: async (res) => {
          logger.info('HttpClient', `请求成功: ${res.statusCode}`, res.data);

          // 处理401错误（认证失败）
          if (res.statusCode === 401) {
            logger.warn('HttpClient', '认证失败，尝试自动重新登录');

            try {
              // 获取小程序实例
              const app = getApp();
              // 尝试自动重新登录
              const loginSuccess = await app.autoLogin();

              if (loginSuccess) {
                // 重新发起请求
                logger.info('HttpClient', '重新登录成功，重新发起请求');
                const newHeaders = { ...API_CONFIG.HEADERS };
                const newToken = TokenManager.getToken();
                if (newToken) {
                  newHeaders['Authorization'] = `Bearer ${newToken}`;
                }

                // 重新发起请求
                wx.request({
                  url: fullUrl,
                  method: method,
                  data: data,
                  header: newHeaders,
                  timeout: API_CONFIG.TIMEOUT,
                  success: (res) => {
                    if (res.statusCode === 200 && res.data && res.data.success) {
                      resolve(res.data.data);
                    } else {
                      logger.error('HttpClient', '重新请求失败', res.data?.message || '重新请求失败');
                      rejectWithResponseError(reject, res, '重新请求失败');
                    }
                  },
                  fail: (err) => {
                    logger.error('HttpClient', '重新请求失败', err);
                    reject(buildHttpError(`网络请求失败: ${err.errMsg || '未知错误'}`));
                  }
                });
              } else {
                logger.error('HttpClient', '自动重新登录失败');
                reject(buildHttpError('认证失败，请重新登录', { statusCode: 401 }));
              }
            } catch (error) {
              logger.error('HttpClient', '自动重新登录异常', error);
              reject(buildHttpError('认证异常，请重新登录', { statusCode: 401 }));
            }
            return;
          }

          if (res.statusCode === 200) {
            // 后端统一返回格式 Result<T>
            if (res.data && res.data.success) {
              resolve(res.data.data);
            } else {
              logger.error('HttpClient', '业务错误', res.data?.message || '请求失败');
              rejectWithResponseError(reject, res, '请求失败');
            }
          } else {
            const errorMsg = `HTTP错误: ${res.statusCode}`;
            logger.error('HttpClient', errorMsg, res);
            rejectWithResponseError(reject, res, errorMsg);
          }
        },
        fail: (err) => {
          logger.error('HttpClient', '网络请求失败', err);
          reject(buildHttpError(`网络请求失败: ${err.errMsg || '未知错误'}`));
        }
      });
    });
  }
  
  /**
   * GET请求
   */
  static get(url, params) {
    return this.request({ url, method: 'GET', params });
  }
  
  /**
   * POST请求
   */
  static post(url, data, params) {
    return this.request({ url, method: 'POST', data, params });
  }
  
  /**
   * PUT请求
   */
  static put(url, data, params) {
    return this.request({ url, method: 'PUT', data, params });
  }
  
  /**
   * PATCH请求
   */
  static patch(url, data, params) {
    return this.request({ url, method: 'PATCH', data, params });
  }

  /**
   * DELETE请求
   */
  static delete(url, params) {
    return this.request({ url, method: 'DELETE', params });
  }
  
  // ========== 用户相关API封装 ==========
  
  /**
   * 获取用户信息
   * @param {string} userId 用户ID
   * @returns {Promise<Object>} 用户信息
   */
  static async getUser(userId) {
    const url = API_CONFIG.ENDPOINTS.USER_BY_ID.replace('{userId}', userId);
    return this.get(url);
  }
  
  /**
   * 获取当前用户信息
   * @param {string} sessionUserId 会话用户ID
   * @returns {Promise<Object>} 用户信息
   */
  static async getCurrentUser(sessionUserId) {
    return this.get(API_CONFIG.ENDPOINTS.USER_CURRENT, { sessionUserId });
  }
  
  /**
   * 获取所有用户列表
   * @returns {Promise<Array>} 用户列表
   */
  static async getAllUsers() {
    return this.get(API_CONFIG.ENDPOINTS.USERS);
  }
  
  /**
   * 根据角色获取用户列表
   * @param {string} role 用户角色 (PARENT/CHILD)
   * @returns {Promise<Array>} 用户列表
   */
  static async getUsersByRole(role) {
    const url = API_CONFIG.ENDPOINTS.USER_BY_ROLE.replace('{role}', role);
    return this.get(url);
  }
  
  /**
   * 用户切换
   * @param {string} targetUserId 目标用户ID
   * @returns {Promise<Object>} 切换后的用户信息
   */
  static async switchToUser(targetUserId) {
    return this.post(API_CONFIG.ENDPOINTS.USER_SWITCH, null, { targetUserId });
  }
  
  /**
   * 检查用户是否存在
   * @param {string} userId 用户ID
   * @returns {Promise<boolean>} 是否存在
   */
  static async userExists(userId) {
    const url = API_CONFIG.ENDPOINTS.USER_EXISTS.replace('{userId}', userId);
    return this.get(url);
  }
  
  /**
   * 获取活跃用户列表
   * @returns {Promise<Array>} 活跃用户列表
   */
  static async getActiveUsers() {
    return this.get(API_CONFIG.ENDPOINTS.USER_ACTIVE);
  }
  
  /**
   * 验证用户会话
   * @param {string} sessionUserId 会话用户ID
   * @returns {Promise<boolean>} 会话是否有效
   */
  static async validateSession(sessionUserId) {
    return this.get(API_CONFIG.ENDPOINTS.USER_SESSION_VALIDATE, { sessionUserId });
  }
  
  /**
   * 健康检查
   * @returns {Promise<Object>} 健康状态
   */
  static async healthCheck() {
    return this.get(API_CONFIG.ENDPOINTS.HEALTH);
  }
}

module.exports = HttpClient; 
