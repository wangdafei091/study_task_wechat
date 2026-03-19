/**
 * 微信小程序API调用工具
 */

const axios = require('axios');
const { createLogger } = require('./logger');
const logger = createLogger('WeChatAPI');

// 微信小程序配置
const WECHAT_CONFIG = {
  appId: process.env.WECHAT_APPID,
  appSecret: process.env.WECHAT_APPSECRET,
};

/**
 * 微信API基础URL
 */
const WECHAT_API_BASE = 'https://api.weixin.qq.com';

/**
 * 调用微信code2session接口
 * @param {string} code - wx.login()返回的code
 * @returns {Promise<Object>} 微信返回的用户信息
 */
async function code2Session(code) {
  try {
    const url = `${WECHAT_API_BASE}/sns/jscode2session`;
    const params = {
      appid: WECHAT_CONFIG.appId,
      secret: WECHAT_CONFIG.appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    };

    logger.info('调用微信code2session接口', { code });

    const response = await axios.get(url, { params });
    const data = response.data;

    logger.info('微信code2session接口响应', data);

    // 检查错误码
    if (data.errcode) {
      throw new Error(`微信API错误: ${data.errcode} - ${data.errmsg}`);
    }

    return {
      openid: data.openid,
      unionid: data.unionid || null,
      sessionKey: data.session_key,
    };
  } catch (error) {
    logger.error('调用微信code2session接口失败', error);
    throw error;
  }
}

/**
 * 获取微信access_token（用于调用其他微信API）
 * @returns {Promise<string>} access_token
 */
async function getAccessToken() {
  try {
    const url = `${WECHAT_API_BASE}/cgi-bin/token`;
    const params = {
      grant_type: 'client_credential',
      appid: WECHAT_CONFIG.appId,
      secret: WECHAT_CONFIG.appSecret,
    };

    const response = await axios.get(url, { params });
    const data = response.data;

    if (data.errcode) {
      throw new Error(`获取access_token失败: ${data.errcode} - ${data.errmsg}`);
    }

    return data.access_token;
  } catch (error) {
    logger.error('获取access_token失败', error);
    throw error;
  }
}

module.exports = {
  code2Session,
  getAccessToken,
  WECHAT_CONFIG,
};
