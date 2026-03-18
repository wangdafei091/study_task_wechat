/**
 * 统一响应格式工具
 */

/**
 * 成功响应
 * @param {*} data - 响应数据
 * @param {string} message - 提示信息
 * @returns {Object} 统一格式的成功响应
 */
function success(data = null, message = '操作成功') {
  return {
    success: true,
    data,
    message,
  };
}

/**
 * 失败响应
 * @param {string} message - 错误信息
 * @param {string} errorCode - 错误码
 * @returns {Object} 统一格式的失败响应
 */
function error(message = '操作失败', errorCode = 'INTERNAL_ERROR') {
  return {
    success: false,
    data: null,
    message,
    error_code: errorCode,
  };
}

module.exports = {
  success,
  error,
};
