/**
 * 错误处理中间件
 */

const { createLogger } = require('../utils/logger');
const logger = createLogger('ErrorHandler');

/**
 * 全局错误处理中间件
 * @param {Error} err - 错误对象
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件
 */
function errorHandler(err, req, res, next) {
  logger.error('未处理的错误', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // 默认错误信息
  const message = err.message || '服务器内部错误';
  const statusCode = err.statusCode || 500;
  const errorCode = err.errorCode || 'INTERNAL_ERROR';

  res.status(statusCode).json({
    success: false,
    data: null,
    message,
    error_code: errorCode,
  });
}

/**
 * 404错误处理
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    data: null,
    message: '请求的资源不存在',
    error_code: 'NOT_FOUND',
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
};
