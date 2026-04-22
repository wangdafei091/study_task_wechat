/**
 * 用户服务
 */

const { query, execute } = require('../config/database');
const User = require('../models/User');
const { createLogger } = require('../utils/logger');
const logger = createLogger('UserService');

function getExecuteRunner(connection = null) {
  if (connection && typeof connection.execute === 'function') {
    return async (sql, params = []) => {
      const [result] = await connection.execute(sql, params);
      return result;
    };
  }

  return execute;
}

/**
 * 用户服务类
 */
class UserService {
  /**
   * 根据openid查找用户
   * @param {string} openid - 微信openid
   * @returns {Promise<User|null>} 用户实例，如果不存在返回null
   */
  async findByOpenid(openid) {
    try {
      const results = await query(
        'SELECT * FROM users WHERE openid = ? AND status = ? LIMIT 1',
        [openid, 'active']
      );

      if (results.length === 0) {
        return null;
      }

      return User.fromDB(results[0]);
    } catch (error) {
      logger.error('根据openid查找用户失败', error);
      throw error;
    }
  }

  /**
   * 根据userId查找用户
   * @param {string} userId - 用户ID
   * @returns {Promise<User|null>} 用户实例，如果不存在返回null
   */
  async findById(userId) {
    try {
      const results = await query(
        'SELECT * FROM users WHERE user_id = ? AND status = ? LIMIT 1',
        [userId, 'active']
      );

      if (results.length === 0) {
        return null;
      }

      return User.fromDB(results[0]);
    } catch (error) {
      logger.error('根据userId查找用户失败', error);
      throw error;
    }
  }

  /**
   * 创建新用户
   * @param {Object} userData - 用户数据
   * @param {string} userData.openid - 微信openid
   * @param {string} userData.unionid - 微信unionid（可选）
   * @param {string} userData.name - 用户昵称
   * @param {string} userData.avatar - 头像URL
   * @param {string} userData.role - 用户角色（parent/child）
   * @returns {Promise<User>} 创建的用户实例
   */
  async createUser(userData, options = {}) {
    try {
      const userId = User.generateId();
      const user = new User({
        userId,
        ...userData,
        status: 'active',
      });

      const dbData = user.toDB();
      const executeRunner = getExecuteRunner(options.connection);
      await executeRunner(
        `INSERT INTO users (user_id, openid, unionid, nickname, avatar, role, status, family_permission_role)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dbData.user_id,
          dbData.openid,
          dbData.unionid,
          dbData.nickname,
          dbData.avatar,
          dbData.role,
          dbData.status,
          dbData.family_permission_role,
        ]
      );

      logger.info('创建用户成功', { userId });
      return user;
    } catch (error) {
      logger.error('创建用户失败', error);
      throw error;
    }
  }

  /**
   * 更新用户信息
   * @param {string} userId - 用户ID
   * @param {Object} updateData - 更新的数据
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateUser(userId, updateData) {
    try {
      const updates = [];
      const values = [];

      if (updateData.name !== undefined) {
        updates.push('nickname = ?');
        values.push(updateData.name);
      }
      if (updateData.avatar !== undefined) {
        updates.push('avatar = ?');
        values.push(updateData.avatar);
      }
      if (updateData.role !== undefined) {
        updates.push('role = ?');
        values.push(updateData.role);
      }
      if (updateData.status !== undefined) {
        updates.push('status = ?');
        values.push(updateData.status);
      }
      if (updateData.familyPermissionRole !== undefined) {
        updates.push('family_permission_role = ?');
        values.push(updateData.familyPermissionRole);
      }

      if (updates.length === 0) {
        return false;
      }

      values.push(userId);
      updates.push('updated_at = CURRENT_TIMESTAMP');

      const sql = `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`;
      await execute(sql, values);

      logger.info('更新用户成功', { userId, updateData });
      return true;
    } catch (error) {
      logger.error('更新用户失败', error);
      throw error;
    }
  }

  /**
   * 获取或创建用户（用于登录）
   * @param {Object} wechatData - 微信用户数据
   * @returns {Promise<User>} 用户实例
   */
  async getOrCreateUser(wechatData) {
    try {
      // 先尝试查找用户
      let user = await this.findByOpenid(wechatData.openid);

      if (user) {
        // 用户存在，更新信息
        logger.info('用户已存在，更新信息', { userId: user.userId });
        await this.updateUser(user.userId, {
          name: wechatData.nickName || wechatData.nickname,
          avatar: wechatData.avatarUrl || wechatData.avatar,
        });
        user = await this.findByOpenid(wechatData.openid);
      } else {
        // 用户不存在，创建新用户
        logger.info('创建新用户', { openid: wechatData.openid });
        user = await this.createUser({
          openid: wechatData.openid,
          unionid: wechatData.unionid,
          name: wechatData.nickName || wechatData.nickname || '用户',
          avatar: wechatData.avatarUrl || wechatData.avatar || '',
          role: 'parent', // 默认角色
        });
      }

      return user;
    } catch (error) {
      logger.error('获取或创建用户失败', error);
      throw error;
    }
  }

  /**
   * 删除用户
   * @param {string} userId - 用户ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async delete(userId) {
    try {
      const result = await execute(
        'DELETE FROM users WHERE user_id = ?',
        [userId]
      );

      const deleted = result.affectedRows > 0;
      if (deleted) {
        logger.info('删除用户成功', { userId });
      }

      return deleted;
    } catch (error) {
      logger.error('删除用户失败', error);
      throw error;
    }
  }
}

// 创建单例实例
const userService = new UserService();

module.exports = userService;
