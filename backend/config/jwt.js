/**
 * JWT配置和工具函数
 */

const jwt = require('jsonwebtoken');

/**
 * JWT配置
 */
const JWT_CONFIG = {
  secret: (() => {
    // 生产环境强制配置JWT_SECRET
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.JWT_SECRET) {
        throw new Error('❌ 生产环境必须配置JWT_SECRET环境变量');
      }
      return process.env.JWT_SECRET;
    }

    // 开发/测试环境使用默认密钥
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      return 'test-secret-key-for-dev-testing-only';
    }

    // 其他环境（未明确）也使用默认密钥
    return process.env.JWT_SECRET || 'test-secret-key-for-dev-testing-only';
  })(),
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

/**
 * 生成JWT token
 * @param {Object} payload - token负载
 * @param {string} payload.userId - 用户ID
 * @param {string} payload.openid - 微信openid
 * @param {string} payload.role - 用户角色
 * @returns {string} JWT token
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_CONFIG.secret, {
    expiresIn: JWT_CONFIG.expiresIn,
  });
}

/**
 * 验证JWT token
 * @param {string} token - JWT token
 * @returns {Object|null} 解析后的payload，如果token无效返回null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_CONFIG.secret);
  } catch (error) {
    console.error('JWT验证失败:', error.message);
    return null;
  }
}

/**
 * 从请求中提取token
 * @param {Object} req - Express请求对象
 * @returns {string|null} token，如果不存在返回null
 */
function extractToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // 格式：Bearer <token>
  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

module.exports = {
  JWT_CONFIG,
  generateToken,
  verifyToken,
  extractToken,
};
