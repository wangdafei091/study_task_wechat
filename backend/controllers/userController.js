/**
 * 用户控制器
 * 提供用户相关的基本接口
 */

const userService = require('../services/userService');
const familyService = require('../services/familyService');
const userProductStateService = require('../services/userProductStateService');
const UserActivityEvent = require('../models/UserActivityEvent');
const { success, error } = require('../utils/response');
const { createLogger } = require('../utils/logger');
const { resolveTargetUserId } = require('../utils/resolveTargetUserId');

const logger = createLogger('UserController');

/**
 * 用户控制器类
 */
class UserController {
  _resolveRuntimeVersion(source = {}) {
    const candidates = [
      source.runtimeVersion,
      source.appVersion,
      source.version
    ];

    for (let index = 0; index < candidates.length; index += 1) {
      const trimmed = String(candidates[index] || '').trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return null;
  }

  /**
   * 获取所有用户列表
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async getUsers(req, res) {
    try {
      logger.info('获取用户列表');

      // 当前阶段，获取当前用户即可，暂不支持获取所有用户
      // TODO: 后续支持家庭账户时，需要实现获取所有家庭成员
      const currentUserId = req.user?.userId;

      if (!currentUserId) {
        return res.status(401).json(
          error('用户未认证', 'AUTH_INVALID_TOKEN')
        );
      }

      // 暂时只返回当前用户
      const user = await userService.findById(currentUserId);

      if (!user) {
        return res.status(404).json(
          error('用户不存在', 'USER_NOT_FOUND')
        );
      }

      res.json(
        success({
          users: [user.toJSON()],
          total: 1
        }, '获取成功')
      );
    } catch (err) {
      logger.error('获取用户列表失败', err);
      res.status(500).json(
        error('获取用户列表失败', 'USER_GET_FAILED')
      );
    }
  }

  /**
   * 根据用户ID获取用户信息
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async getUserById(req, res) {
    try {
      const { userId } = req.params;
      const { userId: currentUserId, familyId: operatorFamilyId } = req.user;

      logger.info('获取用户详情', { userId, currentUserId });

      const user = await userService.findById(userId);
      if (!user) {
        return res.status(404).json(error('用户不存在', 'USER_NOT_FOUND'));
      }

      // 自己直接放行；同家庭成员互查放行
      const isSelf = userId === currentUserId;
      const isSameFamily = operatorFamilyId && user.familyId === operatorFamilyId;
      if (!isSelf && !isSameFamily) {
        return res.status(403).json(error('无权访问该用户信息', 'USER_ACCESS_DENIED'));
      }

      res.json(success(user.toJSON(), '获取成功'));
    } catch (err) {
      logger.error('获取用户详情失败', err);
      res.status(500).json(error('获取用户详情失败', 'USER_GET_FAILED'));
    }
  }

  /**
   * 修改用户昵称
   * PATCH /api/users/:userId/nickname
   */
  async updateNickname(req, res) {
    try {
      const { userId: targetUserId } = req.params;
      const operator = req.systemUser || await userService.findActiveById(req.user.userId);
      const { nickname } = req.body;

      if (!nickname || !nickname.trim()) {
        return res.status(400).json(error('昵称不能为空', 'INVALID_PARAMS'));
      }

      logger.info('修改昵称', { operatorId: operator?.userId, targetUserId, nickname });
      await familyService.updateNickname(operator, targetUserId, nickname.trim());

      res.json(success({ userId: targetUserId, nickname: nickname.trim() }, '昵称修改成功'));
    } catch (err) {
      if (err.code === 'SYSTEM_USER_BLOCKED') {
        return res.status(403).json(error('当前账号已被管理员暂停使用', err.code));
      }
      if (err.code === 'SYSTEM_USER_READONLY') {
        return res.status(403).json(error('当前账号为只读，仅可查看', err.code));
      }
      if (err.code === 'FAMILY_MANAGER_REQUIRED') {
        return res.status(403).json(error('当前为查看者，不能修改成员信息', err.code));
      }
      if (err.code === 'FAMILY_MEMBER_ACCESS_DENIED') {
        return res.status(403).json(error('无权修改该成员昵称', err.code));
      }
      if (err.code === 'USER_NOT_FOUND') {
        return res.status(404).json(error('用户不存在', err.code));
      }
      logger.error('修改昵称失败', err);
      res.status(500).json(error('修改昵称失败', 'USER_UPDATE_FAILED'));
    }
  }

  async updateAvatarPreset(req, res) {
    try {
      const { userId: targetUserId } = req.params;
      const operator = req.systemUser || await userService.findActiveById(req.user.userId);
      const { presetId } = req.body || {};

      if (!presetId || !String(presetId).trim()) {
        return res.status(400).json(error('头像选项不能为空', 'INVALID_PARAMS'));
      }

      logger.info('修改孩子头像 preset', {
        operatorId: operator?.userId,
        targetUserId,
        presetId
      });

      const result = await familyService.updateChildAvatarPreset(operator, targetUserId, String(presetId).trim());
      return res.json(success(result, '头像更新成功'));
    } catch (err) {
      if (err.code === 'SYSTEM_USER_BLOCKED') {
        return res.status(403).json(error('当前账号已被管理员暂停使用', err.code));
      }
      if (err.code === 'SYSTEM_USER_READONLY') {
        return res.status(403).json(error('当前账号为只读，仅可查看', err.code));
      }
      if (err.code === 'FAMILY_MANAGER_REQUIRED') {
        return res.status(403).json(error('当前为查看者，不能修改成员信息', err.code));
      }
      if (err.code === 'FAMILY_MEMBER_ACCESS_DENIED') {
        return res.status(403).json(error('无权修改该成员头像', err.code));
      }
      if (err.code === 'FAMILY_CHILD_ONLY') {
        return res.status(400).json(error('只有孩子可以修改动物头像', err.code));
      }
      if (err.code === 'USER_NOT_FOUND') {
        return res.status(404).json(error('用户不存在', err.code));
      }
      if (err.code === 'INVALID_PARAMS') {
        return res.status(400).json(error('头像选项无效', err.code));
      }
      logger.error('修改孩子头像失败', err);
      return res.status(500).json(error('修改孩子头像失败', 'USER_UPDATE_FAILED'));
    }
  }

  async updateCurrentProfile(req, res) {
    try {
      const userId = req.user.userId;
      const updatedUser = await userService.updateCurrentProfile(userId, req.body || {});
      res.json(success(updatedUser ? updatedUser.toJSON() : null, '资料更新成功'));
    } catch (err) {
      logger.error('更新当前用户资料失败', err);
      res.status(500).json(error('更新当前用户资料失败', 'USER_PROFILE_UPDATE_FAILED'));
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

      const user = await userService.findById(userId);

      if (!user) {
        return res.status(404).json(
          error('用户不存在', 'USER_NOT_FOUND')
        );
      }

      res.json(
        success(user.toJSON(), '获取成功')
      );
    } catch (err) {
      logger.error('获取当前用户信息失败', err);
      res.status(500).json(
        error('获取当前用户信息失败', 'USER_GET_FAILED')
      );
    }
  }

  async getProductState(req, res) {
    try {
      const targetUserId = req.query?.targetUserId || null;
      const effectiveUserId = await resolveTargetUserId(req, targetUserId);
      if (!effectiveUserId) {
        return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const awarenessState = await userProductStateService.getReleaseNoteAwarenessState(effectiveUserId, {
        runtimeVersion: this._resolveRuntimeVersion(req.query || {}),
        familyId: req.user.familyId || null,
        sourcePage: String(req.query?.sourcePage || 'user_product_state').trim(),
        clientPlatform: 'wechat-miniprogram',
        clientEnv: String(req.query?.clientEnv || '').trim() || null
      });

      return res.json(success(awarenessState, '获取成功'));
    } catch (err) {
      logger.error('获取用户产品状态失败', err);
      return res.status(500).json(error('获取用户产品状态失败', 'USER_PRODUCT_STATE_GET_FAILED'));
    }
  }

  async createActivityEvent(req, res) {
    try {
      const subjectUserId = req.body?.subjectUserId || null;
      const effectiveUserId = await resolveTargetUserId(req, subjectUserId);
      if (!effectiveUserId) {
        return res.status(403).json(error('无权访问该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const eventType = String(req.body?.eventType || '').trim();
      if (!eventType) {
        return res.status(400).json(error('事件类型不能为空', 'INVALID_PARAMS'));
      }

      if (!UserActivityEvent.CLIENT_EVENT_TYPES.has(eventType)) {
        return res.status(400).json(error('事件类型不受支持', 'INVALID_PARAMS'));
      }

      const auxiliaryTargetUserId = req.body?.targetUserId || null;
      if (auxiliaryTargetUserId) {
        const resolvedAuxiliaryTargetUserId = await resolveTargetUserId(req, auxiliaryTargetUserId);
        if (!resolvedAuxiliaryTargetUserId) {
          return res.status(403).json(error('无权引用该成员数据', 'FAMILY_MEMBER_ACCESS_DENIED'));
        }
      }

      const event = await userProductStateService.recordEvent({
        userId: effectiveUserId,
        familyId: req.user.familyId || null,
        eventType,
        eventTime: Number(req.body?.eventTime || Date.now()),
        appVersion: this._resolveRuntimeVersion(req.body || {}),
        clientPlatform: 'wechat-miniprogram',
        clientEnv: String(req.body?.clientEnv || '').trim() || null,
        sourcePage: String(req.body?.sourcePage || '').trim() || null,
        targetUserId: auxiliaryTargetUserId,
        payloadJson: req.body?.payload || null
      });

      return res.json(success({
        eventId: event.eventId
      }, '记录成功'));
    } catch (err) {
      if (err.code === 'INVALID_PARAMS') {
        return res.status(400).json(error(err.message, err.code));
      }
      logger.error('记录用户行为事件失败', err);
      return res.status(500).json(error('记录用户行为事件失败', 'USER_ACTIVITY_EVENT_CREATE_FAILED'));
    }
  }

  /**
   * 创建新用户
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async createUser(req, res) {
    try {
      const { name, role } = req.body;
      const currentUserId = req.user?.userId;

      logger.info('创建用户', { name, role, currentUserId });

      // 参数验证
      if (!name || !role) {
        return res.status(400).json(
          error('参数不完整', 'USER_INVALID_PARAMS')
        );
      }

      // 角色验证
      if (!['parent', 'child'].includes(role)) {
        return res.status(400).json(
          error('无效的用户角色', 'USER_INVALID_ROLE')
        );
      }

      // 创建用户（使用openid作为临时标识，实际应该通过微信登录创建）
      const userData = {
        openid: `temp_${Date.now()}`, // 临时openid
        name: name,
        nickname: name,
        role: role,
        avatar: '',
        status: 'active'
      };

      const user = await userService.createUser(userData);

      res.json(
        success(user.toJSON(), '创建成功')
      );
    } catch (err) {
      logger.error('创建用户失败', err);
      res.status(500).json(
        error('创建用户失败', 'USER_CREATE_FAILED')
      );
    }
  }

  /**
   * 切换到指定用户
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async switchUser(req, res) {
    try {
      const { targetUserId } = req.query; // 从query参数读取，与前端一致
      const currentUserId = req.user?.userId;

      logger.info('切换用户', { targetUserId, currentUserId });

      // 参数验证
      if (!targetUserId) {
        return res.status(400).json(
          error('目标用户ID不能为空', 'USER_INVALID_PARAMS')
        );
      }

      // 检查是否已是当前用户
      if (targetUserId === currentUserId) {
        return res.json(
          success({ userId: targetUserId, message: '已经是当前用户' }, '无需切换')
        );
      }

      // 所有权校验：当前阶段，只能切换到已知的家庭成员
      // 注：后续支持家庭账户时，需要实现家庭关系检查
      const currentUser = await userService.findById(currentUserId);
      if (!currentUser) {
        return res.status(404).json(
          error('当前用户不存在', 'USER_NOT_FOUND')
        );
      }

      // 当前阶段：仅允许切换到自己（通过角色区分家庭成员）
      // 这与getUserById的安全边界保持一致
      // 实际家庭账户功能需要在后续里程碑中实现
      logger.warn('用户切换功能暂仅支持基础验证', { targetUserId, currentUserId });
      return res.status(403).json(
        error('用户切换功能暂未开放', 'USER_SWITCH_FORBIDDEN')
      );
    } catch (err) {
      logger.error('切换用户失败', err);
      res.status(500).json(
        error('切换用户失败', 'USER_SWITCH_FAILED')
      );
    }
  }

  /**
   * 验证用户会话
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async validateSession(req, res) {
    try {
      const { sessionUserId } = req.query; // 从query参数读取
      const currentUserId = req.user?.userId;

      logger.info('验证用户会话', { sessionUserId, currentUserId });

      // 参数验证
      if (!sessionUserId) {
        return res.status(400).json(
          error('会话用户ID不能为空', 'USER_INVALID_PARAMS')
        );
      }

      // 验证会话用户ID是否与当前用户一致
      const isValid = (sessionUserId === currentUserId);

      res.json(
        success({ valid: isValid, sessionUserId }, '验证完成')
      );
    } catch (err) {
      logger.error('验证用户会话失败', err);
      res.status(500).json(
        error('验证用户会话失败', 'USER_SESSION_VALIDATE_FAILED')
      );
    }
  }

  /**
   * 删除用户
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async deleteUser(req, res) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.userId;

      logger.info('删除用户', { userId, currentUserId });

      // 参数验证
      if (!userId) {
        return res.status(400).json(
          error('用户ID不能为空', 'USER_INVALID_PARAMS')
        );
      }

      // 所有权校验：不能删除自己
      if (userId === currentUserId) {
        return res.status(400).json(
          error('不能删除当前用户', 'USER_DELETE_SELF')
        );
      }

      // 验证用户存在
      const user = await userService.findById(userId);
      if (!user) {
        return res.status(404).json(
          error('用户不存在', 'USER_NOT_FOUND')
        );
      }

      // 所有权校验：用户不能删除不属于自己的资源
      // 注：当前阶段每个用户只能删除自己创建的用户
      // 后续支持家庭账户时，需要修改为家庭成员权限检查
      // 暂时禁用删除其他用户的功能
      logger.warn('删除用户功能暂未开放所有权校验', { userId, currentUserId });
      return res.status(403).json(
        error('删除其他用户功能暂未开放', 'USER_DELETE_FORBIDDEN')
      );
    } catch (err) {
      logger.error('删除用户失败', err);
      res.status(500).json(
        error('删除用户失败', 'USER_DELETE_FAILED')
      );
    }
  }
}

// 创建单例实例
const userController = new UserController();

module.exports = userController;
