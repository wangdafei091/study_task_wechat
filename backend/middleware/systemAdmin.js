const userService = require('../services/userService');

async function systemAdminMiddleware(req, res, next) {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        data: null,
        message: '未提供认证token',
        error_code: 'AUTH_INVALID_TOKEN'
      });
    }

    const user = await userService.findById(req.user.userId);
    if (!user || user.role !== 'parent' || user.isSystemAdmin !== true) {
      return res.status(403).json({
        success: false,
        data: null,
        message: '当前用户不是系统管理员',
        error_code: 'SYSTEM_ADMIN_REQUIRED'
      });
    }

    req.systemAdmin = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = systemAdminMiddleware;
