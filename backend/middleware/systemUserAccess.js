const userService = require('../services/userService');
const User = require('../models/User');

const READONLY_PASSTHROUGH_RULES = [
  { method: 'POST', pattern: /^\/api\/task-templates\/recommendations\/query$/ },
  { method: 'POST', pattern: /^\/api\/users\/switch$/ }
];

function buildErrorResponse(res, statusCode, message, errorCode) {
  return res.status(statusCode).json({
    success: false,
    data: null,
    message,
    error_code: errorCode
  });
}

function isReadonlyMutationRequest(req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return false;
  }

  const requestPath = String(req.originalUrl || req.url || '').split('?')[0];
  const passthrough = READONLY_PASSTHROUGH_RULES.some((rule) => (
    rule.method === method && rule.pattern.test(requestPath)
  ));

  return !passthrough;
}

async function systemUserAccessMiddleware(req, res, next) {
  try {
    if (!req.user || !req.user.userId) {
      return buildErrorResponse(res, 401, '未提供认证token', 'AUTH_INVALID_TOKEN');
    }

    const currentUser = await userService.findById(req.user.userId);
    if (!currentUser) {
      return buildErrorResponse(res, 401, '用户不存在或已失效', 'AUTH_INVALID_TOKEN');
    }

    req.systemUser = currentUser;

    if (currentUser.isSystemBlocked()) {
      return buildErrorResponse(res, 403, '当前账号已被管理员暂停使用', 'SYSTEM_USER_BLOCKED');
    }

    if (currentUser.isSystemReadonly() && isReadonlyMutationRequest(req)) {
      return buildErrorResponse(res, 403, '当前账号为只读，仅可查看', 'SYSTEM_USER_READONLY');
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  systemUserAccessMiddleware,
  isReadonlyMutationRequest
};
