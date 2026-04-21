/**
 * JWT Token管理工具类
 * 负责token的存储、获取、清除和验证
 */

class TokenManager {
  /**
   * 获取存储的token
   * @returns {string|null} token，如果不存在返回null
   */
  static getToken() {
    try {
      return wx.getStorageSync('jwt_token') || null;
    } catch (error) {
      console.error('获取token失败:', error);
      return null;
    }
  }

  /**
   * 保存token到本地存储
   * @param {string} token - JWT token
   */
  static setToken(token) {
    try {
      wx.setStorageSync('jwt_token', token);
      console.log('Token已保存');
    } catch (error) {
      console.error('保存token失败:', error);
    }
  }

  /**
   * 清除存储的token
   */
  static clearToken() {
    try {
      wx.removeStorageSync('jwt_token');
      console.log('Token已清除');
    } catch (error) {
      console.error('清除token失败:', error);
    }
  }

  /**
   * 检查是否已认证（有有效token）
   * @returns {boolean} 是否已认证
   */
  static isAuthenticated() {
    const token = this.getToken();
    return token && token.length > 0;
  }

  /**
   * Base64解码（微信小程序兼容版本）
   * @param {string} str - base64编码的字符串
   * @returns {string} 解码后的字符串
   */
  static base64Decode(str) {
    // 处理URL安全的base64格式
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');

    // 使用微信小程序API解码
    const arrayBuffer = wx.base64ToArrayBuffer(base64);

    // 转换ArrayBuffer为字符串
    const uint8Array = new Uint8Array(arrayBuffer);
    let decoded = '';
    for (let i = 0; i < uint8Array.length; i++) {
      decoded += String.fromCharCode(uint8Array[i]);
    }
    return decoded;
  }

  /**
   * 解析token获取用户信息
   * @returns {Object|null} 用户信息，如果token无效返回null
   */
  static getUserInfo() {
    try {
      const token = this.getToken();
      if (!token) {
        return null;
      }

      // 解析JWT token（不验证签名，仅获取payload）
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // 使用微信小程序兼容的 base64 解码
      const decoded = this.base64Decode(parts[1]);
      const payload = JSON.parse(decoded);
      return {
        userId: payload.userId,
        openid: payload.openid,
        role: payload.role,
        familyId: payload.familyId || null,
        familyPermissionRole: payload.familyPermissionRole || null,
      };
    } catch (error) {
      console.error('解析token失败:', error);
      return null;
    }
  }

  /**
   * 从 token 中获取 familyId
   * @returns {string|null} familyId
   */
  static getFamilyId() {
    const info = this.getUserInfo();
    return info ? info.familyId : null;
  }

  /**
   * 检查token是否即将过期（剩余时间小于1天）
   * @returns {boolean} 是否即将过期
   */
  static isExpiringSoon() {
    try {
      const token = this.getToken();
      if (!token) {
        return false;
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return true;
      }

      // 使用微信小程序兼容的 base64 解码
      const decoded = this.base64Decode(parts[1]);
      const payload = JSON.parse(decoded);
      const exp = payload.exp * 1000; // 转换为毫秒
      const now = Date.now();
      const remaining = exp - now;

      // 剩余时间小于1天视为即将过期
      return remaining < 24 * 60 * 60 * 1000;
    } catch (error) {
      console.error('检查token过期时间失败:', error);
      return true;
    }
  }
}

module.exports = TokenManager;
