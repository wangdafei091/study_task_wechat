/**
 * JWT认证中间件
 */

const { verifyToken, extractToken } = require('../config/jwt');
const { createLogger } = require('../utils/logger');
const logger = createLogger('Auth');

/**
 * JWT认证中间件
 * 验证请求中的JWT token，并解析用户信息
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件
 */
function authMiddleware(req, res, next) {
  try {
    // 从请求中提取token
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        data: null,
        message: '未提供认证token',
        error_code: 'AUTH_INVALID_TOKEN',
      });
    }

    // 验证token
    const payload = verifyToken(token);

    if (!payload) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Token无效或已过期',
        error_code: 'AUTH_TOKEN_EXPIRED',
      });
    }

    // 将用户信息添加到请求对象中
    req.user = {
      userId: payload.userId,
      openid: payload.openid,
      role: payload.role,
    };

    logger.info('用户认证成功', { userId: req.user.userId });

    next();
  } catch (error) {
    logger.error('认证失败', error);
    res.status(401).json({
      success: false,
      data: null,
      message: '认证失败',
      error_code: 'AUTH_INVALID_TOKEN',
    });
  }
}

/**
 * 可选认证中间件
 * 如果提供了token则验证，否则继续执行
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件
 */
function optionalAuthMiddleware(req, res, next) {
  try {
    const token = extractToken(req);

    if (!token) {
      // 没有token，继续执行（不设置req.user）
      return next();
    }

    const payload = verifyToken(token);

    if (payload) {
      req.user = {
        userId: payload.userId,
        openid: payload.openid,
        role: payload.role,
      };
    }

    next();
  } catch (error) {
    logger.error('可选认证失败', error);
    // 认证失败，但继续执行（不设置req.user）
    next();
  }
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
};
