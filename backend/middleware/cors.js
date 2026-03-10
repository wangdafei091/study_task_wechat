/**
 * CORS中间件配置
 */

/**
 * CORS配置
 */
function corsMiddleware(req, res, next) {
  // 允许所有来源（开发环境）
  res.header('Access-Control-Allow-Origin', '*');

  // 允许的HTTP方法
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  // 允许的请求头
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  // 允许携带凭证
  res.header('Access-Control-Allow-Credentials', 'true');

  // 预检请求缓存时间（秒）
  res.header('Access-Control-Max-Age', '86400');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

module.exports = corsMiddleware;
