/**
 * 认证控制器
 */

const { getPool } = require('../config/database');
const { generateToken } = require('../config/jwt');
const appAccessService = require('../services/appAccessService');
const userService = require('../services/userService');
const { code2Session } = require('../utils/wechat');
const { createLogger } = require('../utils/logger');
const { success, error } = require('../utils/response');
const logger = createLogger('AuthController');

/**
 * 认证控制器类
 */
class AuthController {
  async _createInvitedUser(wechatData, accessCode) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const accessRecord = await appAccessService.validateAccessCodeForNewUser(accessCode, {
        connection,
        forUpdate: true
      });

      const user = await userService.createUser({
        openid: wechatData.openid,
        unionid: wechatData.unionid,
        name: '用户',
        avatar: '',
        role: 'parent',
      }, {
        connection
      });

      const consumed = await appAccessService.consumeAccessCode(accessRecord.accessCodeId, user.userId, {
        connection
      });
      if (!consumed) {
        throw Object.assign(new Error('邀请码无效，请检查后重试'), {
          code: 'AUTH_APP_ACCESS_CODE_INVALID'
        });
      }

      await connection.commit();
      return user;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 微信小程序登录
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async login(req, res) {
    try {
      const { code, accessCode } = req.body;

      // 参数验证
      if (!code) {
        return res.status(400).json(
          error('缺少必要参数: code', 'AUTH_INVALID_PARAMS')
        );
      }

      logger.info('用户登录请求', { code });

      // 1. 调用微信API获取openid
      const wechatData = await code2Session(code);

      logger.info('微信登录成功', { openid: wechatData.openid });

      // 2. 查询或创建用户
      let user = await userService.findByOpenid(wechatData.openid);
      if (!user) {
        if (await appAccessService.isInviteOnlyMode()) {
          user = await this._createInvitedUser(wechatData, accessCode);
        } else {
          user = await userService.createUser({
            openid: wechatData.openid,
            unionid: wechatData.unionid,
            name: '用户',
            avatar: '',
            role: 'parent',
          });
        }
      }

      // 3. 生成JWT token（包含 familyId，支持家庭数据隔离）
      const token = generateToken({
        userId: user.userId,
        openid: user.openid,
        role: user.role,
        familyId: user.familyId || null,
        familyPermissionRole: user.familyPermissionRole || null,
      });

      logger.info('登录成功，生成token', {
        userId: user.userId,
        role: user.role,
      });

      // 4. 返回token和用户信息
      res.json(
        success(
          {
            token,
            user: user.toJSON(),
          },
          '登录成功'
        )
      );
    } catch (err) {
      logger.error('登录失败', err);

      // 判断错误类型
      if (err.message.includes('微信API错误')) {
        return res.status(400).json(
          error('微信登录失败，请重试', 'AUTH_WECHAT_LOGIN_FAILED')
        );
      }

      if (
        err.code === 'AUTH_APP_ACCESS_CODE_REQUIRED' ||
        err.code === 'AUTH_APP_ACCESS_CODE_INVALID' ||
        err.code === 'AUTH_APP_ACCESS_CODE_EXPIRED'
      ) {
        return res.status(400).json(
          error(err.message, err.code)
        );
      }

      if (err.code === 'SYSTEM_SETTING_CORRUPTED') {
        return res.status(503).json(
          error('系统准入配置异常，请联系管理员处理', err.code)
        );
      }

      res.status(500).json(
        error('登录失败，请稍后重试', 'AUTH_LOGIN_FAILED')
      );
    }
  }

  /**
   * 验证token
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async validateToken(req, res) {
    try {
      // 用户信息已经由authMiddleware添加到req.user
      if (!req.user) {
        return res.status(401).json(
          error('Token验证失败', 'AUTH_INVALID_TOKEN')
        );
      }

      logger.info('Token验证成功', { userId: req.user.userId });

      res.json(
        success(
          {
            valid: true,
            userId: req.user.userId,
          },
          'Token有效'
        )
      );
    } catch (err) {
      logger.error('Token验证失败', err);
      res.status(500).json(
        error('Token验证失败', 'AUTH_VALIDATE_FAILED')
      );
    }
  }

  /**
   * 获取当前用户信息
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async getCurrentUser(req, res) {
    try {
      const userId = req.user.userId;

      logger.info('获取当前用户信息', { userId });

      // 从数据库获取用户信息
      const user = await userService.findById(userId);

      if (!user) {
        return res.status(404).json(
          error('用户不存在', 'USER_NOT_FOUND')
        );
      }

      res.json(success(user.toJSON(), '获取成功'));
    } catch (err) {
      logger.error('获取当前用户信息失败', err);
      res.status(500).json(
        error('获取用户信息失败', 'USER_GET_FAILED')
      );
    }
  }
}

// 创建单例实例
const authController = new AuthController();

module.exports = authController;
