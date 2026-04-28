const HttpClient = require('../utils/http-client');
const API_CONFIG = require('../utils/api-config');
const logger = require('../utils/logger');

class SystemService {
  async getBootstrap() {
    try {
      return await HttpClient.get(API_CONFIG.ENDPOINTS.SYSTEM_ADMIN_BOOTSTRAP);
    } catch (error) {
      logger.error('SystemService', '获取系统入口探测信息失败', error);
      throw error;
    }
  }

  async getOverview() {
    try {
      return await HttpClient.get(API_CONFIG.ENDPOINTS.SYSTEM_ADMIN_OVERVIEW);
    } catch (error) {
      logger.error('SystemService', '获取系统管理概览失败', error);
      throw error;
    }
  }

  async updateAppAccessMode(mode) {
    try {
      return await HttpClient.patch(API_CONFIG.ENDPOINTS.SYSTEM_ADMIN_APP_ACCESS_MODE, { mode });
    } catch (error) {
      logger.error('SystemService', '更新应用准入模式失败', error);
      throw error;
    }
  }

  async listUserGovernance(params = {}) {
    try {
      return await HttpClient.get(API_CONFIG.ENDPOINTS.SYSTEM_ADMIN_USERS_GOVERNANCE, params);
    } catch (error) {
      logger.error('SystemService', '获取系统用户治理列表失败', error);
      throw error;
    }
  }

  async updateUserAccessLevel(userId, accessLevel) {
    try {
      const url = API_CONFIG.ENDPOINTS.SYSTEM_ADMIN_USER_ACCESS_LEVEL.replace('{userId}', userId);
      return await HttpClient.patch(url, { accessLevel });
    } catch (error) {
      logger.error('SystemService', '更新系统用户访问级别失败', error);
      throw error;
    }
  }

  async getInviteGovernance() {
    try {
      return await HttpClient.get(API_CONFIG.ENDPOINTS.SYSTEM_ADMIN_INVITE_GOVERNANCE);
    } catch (error) {
      logger.error('SystemService', '获取邀请码治理概览失败', error);
      throw error;
    }
  }

  async updateInviteGovernance(quotaTotal) {
    try {
      return await HttpClient.patch(API_CONFIG.ENDPOINTS.SYSTEM_ADMIN_INVITE_GOVERNANCE, {
        quotaTotal
      });
    } catch (error) {
      logger.error('SystemService', '更新邀请码治理概览失败', error);
      throw error;
    }
  }

  async updateUserAdmissionIssuer(userId, payload = {}) {
    try {
      const url = API_CONFIG.ENDPOINTS.SYSTEM_ADMIN_USER_ADMISSION_ISSUER.replace('{userId}', userId);
      return await HttpClient.patch(url, payload);
    } catch (error) {
      logger.error('SystemService', '更新用户邀请码治理失败', error);
      throw error;
    }
  }
}

module.exports = new SystemService();
