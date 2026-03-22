const messageService = require('../services/messageService');
const { success, error } = require('../utils/response');
const { createLogger } = require('../utils/logger');
const { resolveTargetUserId } = require('../utils/resolveTargetUserId');

const logger = createLogger('MessageController');

class MessageController {
  async getMessages(req, res) {
    try {
      const scope = req.query.scope || (req.user.role === 'parent' ? 'family' : 'user');
      const targetUserId = scope === 'user'
        ? await resolveTargetUserId(req, req.query.userId)
        : null;

      if (scope === 'user' && !targetUserId) {
        return res.status(403).json(error('无权访问该成员消息', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const messages = await messageService.getMessages(scope, req.user, {
        userId: targetUserId || req.user.userId,
      });

      return res.json(success(
        { messages: messages.map(message => message.toJSON()) },
        '获取成功'
      ));
    } catch (err) {
      logger.error('获取消息失败', err);
      return res.status(this._statusForError(err.code)).json(
        error(err.message || '获取消息失败', err.code || 'MESSAGE_GET_FAILED')
      );
    }
  }

  async markAsRead(req, res) {
    try {
      const message = await messageService.markAsRead(
        req.params.messageId,
        req.user,
        req.body.readTime
      );

      if (!message) {
        return res.status(404).json(error('消息不存在', 'MESSAGE_NOT_FOUND'));
      }

      return res.json(success(message.toJSON(), '标记已读成功'));
    } catch (err) {
      logger.error('标记消息已读失败', err);
      return res.status(this._statusForError(err.code)).json(
        error(err.message || '标记消息已读失败', err.code || 'MESSAGE_READ_FAILED')
      );
    }
  }

  async markAllAsRead(req, res) {
    try {
      const scope = req.body.scope || (req.user.role === 'parent' ? 'family' : 'user');
      const targetUserId = scope === 'user'
        ? await resolveTargetUserId(req, req.body.userId)
        : null;

      if (scope === 'user' && !targetUserId) {
        return res.status(403).json(error('无权访问该成员消息', 'FAMILY_MEMBER_ACCESS_DENIED'));
      }

      const count = await messageService.markAllAsRead(scope, req.user, {
        userId: targetUserId || req.user.userId,
        readTime: req.body.readTime,
      });

      return res.json(success({ count }, '全部标记已读成功'));
    } catch (err) {
      logger.error('全部标记已读失败', err);
      return res.status(this._statusForError(err.code)).json(
        error(err.message || '全部标记已读失败', err.code || 'MESSAGE_ALL_READ_FAILED')
      );
    }
  }

  async deleteMessage(req, res) {
    try {
      const deleted = await messageService.deleteMessage(req.params.messageId, req.user);
      if (!deleted) {
        return res.status(404).json(error('消息不存在', 'MESSAGE_NOT_FOUND'));
      }

      return res.json(success({ messageId: req.params.messageId }, '删除成功'));
    } catch (err) {
      logger.error('删除消息失败', err);
      return res.status(this._statusForError(err.code)).json(
        error(err.message || '删除消息失败', err.code || 'MESSAGE_DELETE_FAILED')
      );
    }
  }

  _statusForError(errorCode) {
    switch (errorCode) {
      case 'PERMISSION_DENIED':
      case 'FAMILY_MEMBER_ACCESS_DENIED':
        return 403;
      case 'MESSAGE_NOT_FOUND':
        return 404;
      case 'MESSAGE_INVALID':
        return 400;
      default:
        return 500;
    }
  }
}

module.exports = new MessageController();
