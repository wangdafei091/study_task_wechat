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
}

module.exports = new SystemService();
