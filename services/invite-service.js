const HttpClient = require('../utils/http-client');
const API_CONFIG = require('../utils/api-config');
const logger = require('../utils/logger');

class InviteService {
  async previewInviteCode(inviteCode) {
    try {
      return await HttpClient.post(API_CONFIG.ENDPOINTS.INVITES_PREVIEW, { inviteCode });
    } catch (error) {
      logger.error('InviteService', '预览邀请码失败', error);
      throw error;
    }
  }

  async getBootstrap() {
    try {
      return await HttpClient.get(API_CONFIG.ENDPOINTS.INVITES_BOOTSTRAP);
    } catch (error) {
      logger.error('InviteService', '获取邀请码能力摘要失败', error);
      throw error;
    }
  }

  async getCurrentInviteSummary() {
    try {
      return await HttpClient.get(API_CONFIG.ENDPOINTS.INVITES_CURRENT);
    } catch (error) {
      logger.error('InviteService', '获取当前邀请码摘要失败', error);
      throw error;
    }
  }

  async issueAdmissionCode() {
    try {
      return await HttpClient.post(API_CONFIG.ENDPOINTS.INVITES_ADMISSION_CODE, {});
    } catch (error) {
      logger.error('InviteService', '生成新用户邀请码失败', error);
      throw error;
    }
  }

  async issueFamilyCode(targetRole) {
    try {
      return await HttpClient.post(API_CONFIG.ENDPOINTS.INVITES_FAMILY_CODE, { targetRole });
    } catch (error) {
      logger.error('InviteService', '生成家庭邀请码失败', error);
      throw error;
    }
  }
}

module.exports = new InviteService();
