const { query, execute } = require('../config/database');
const Message = require('../models/Message');
const { createLogger } = require('../utils/logger');

const logger = createLogger('MessageService');

class MessageService {
  _isRepeatPlanTask(task) {
    if (!task || !task.repeat || task.parentTaskId) {
      return false;
    }

    if (task.hasNoEndDate === true) {
      return true;
    }

    const startDate = task.repeat.startDate || task.date || null;
    const endDate = task.repeat.endDate || null;
    if (!startDate || !endDate) {
      return false;
    }

    return startDate !== endDate;
  }

  _formatTaskPlanRange(task) {
    if (!task || !task.repeat) {
      return '';
    }

    const startDate = task.repeat.startDate || task.date || null;
    if (!startDate) {
      return '';
    }

    if (task.hasNoEndDate === true) {
      return `${startDate}起`;
    }

    const endDate = task.repeat.endDate || null;
    if (!endDate || endDate === startDate) {
      return startDate;
    }

    return `${startDate}至${endDate}`;
  }

  _buildUserScopeClause(viewer, targetUserId, params) {
    const resolvedTargetUserId = targetUserId || viewer.userId;

    params.push('user', resolvedTargetUserId);
    let clause = 'AND visibility_scope = ? AND user_id = ?';

    if (!viewer.familyId) {
      return clause;
    }

    // 家长代理查看孩子个人流时，只允许看到入家后的家庭内消息，避免暴露孩子入家前个人历史。
    if (viewer.role === 'parent' && resolvedTargetUserId !== viewer.userId) {
      clause += ' AND family_id = ?';
      params.push(viewer.familyId);
      return clause;
    }

    clause += ' AND (family_id = ? OR family_id IS NULL)';
    params.push(viewer.familyId);
    return clause;
  }

  async getMessages(scope, viewer, options = {}) {
    const resolvedScope = scope || (viewer.role === 'parent' ? 'family' : 'user');
    const sql = [];
    const params = [];

    sql.push('SELECT * FROM messages WHERE deleted_at IS NULL AND is_archived = 0');

    if (resolvedScope === 'family') {
      if (viewer.role !== 'parent' || !viewer.familyId) {
        const error = new Error('仅家长可访问家庭消息流');
        error.code = 'PERMISSION_DENIED';
        throw error;
      }
      sql.push('AND visibility_scope = ? AND family_id = ?');
      params.push('family', viewer.familyId);
    } else {
      const targetUserId = options.userId || viewer.userId;
      sql.push(this._buildUserScopeClause(viewer, targetUserId, params));
    }

    sql.push('ORDER BY create_time DESC, created_at DESC');

    const rows = await query(sql.join(' '), params);
    return rows.map(row => Message.fromDB(row));
  }

  async getMessageById(messageId) {
    const rows = await query(
      'SELECT * FROM messages WHERE message_id = ? AND deleted_at IS NULL LIMIT 1',
      [messageId]
    );
    return rows.length > 0 ? Message.fromDB(rows[0]) : null;
  }

  async markAsRead(messageId, viewer, readTime = Date.now()) {
    const message = await this._getAuthorizedMessage(messageId, viewer);
    if (!message) {
      return null;
    }

    await execute(
      'UPDATE messages SET is_read = 1, read_time = ? WHERE message_id = ? AND deleted_at IS NULL',
      [Number(readTime || Date.now()), messageId]
    );

    return this.getMessageById(messageId);
  }

  async markAllAsRead(scope, viewer, options = {}) {
    const resolvedScope = scope || (viewer.role === 'parent' ? 'family' : 'user');
    const readTime = Number(options.readTime || Date.now());
    let result;

    if (resolvedScope === 'family') {
      if (viewer.role !== 'parent' || !viewer.familyId) {
        const error = new Error('仅家长可访问家庭消息流');
        error.code = 'PERMISSION_DENIED';
        throw error;
      }
      result = await execute(
        `UPDATE messages
         SET is_read = 1, read_time = ?
         WHERE visibility_scope = 'family'
           AND family_id = ?
           AND deleted_at IS NULL
           AND is_archived = 0
           AND is_read = 0`,
        [readTime, viewer.familyId]
      );
    } else {
      const targetUserId = options.userId || viewer.userId;
      const sql = [
        'UPDATE messages',
        'SET is_read = 1, read_time = ?',
        'WHERE deleted_at IS NULL',
        'AND is_archived = 0',
        'AND is_read = 0'
      ];
      const params = [readTime];

      sql.push(this._buildUserScopeClause(viewer, targetUserId, params));
      result = await execute(
        sql.join(' '),
        params
      );
    }

    return result.affectedRows || 0;
  }

  async deleteMessage(messageId, viewer) {
    const message = await this._getAuthorizedMessage(messageId, viewer);
    if (!message) {
      return false;
    }

    const result = await execute(
      'UPDATE messages SET deleted_at = NOW() WHERE message_id = ? AND deleted_at IS NULL',
      [messageId]
    );
    return result.affectedRows > 0;
  }

  async createTaskMessages(input, connection) {
    const records = await this._buildTaskMessageRecords(input);
    await this._archiveFoldableMessages(records, connection);
    return this._upsertMessages(records, connection);
  }

  async createRewardMessages(input, connection) {
    const records = await this._buildRewardMessageRecords(input);
    await this._archiveFoldableMessages(records, connection);
    return this._upsertMessages(records, connection);
  }

  async _buildTaskMessageRecords({
    task,
    familyId = null,
    action,
    actorUserId,
    actorRole = 'system',
    operationKey,
    penaltyPoints = null,
    upcomingMeta = null,
    createTimeOverride = null,
  }) {
    if (!task || !action) {
      return [];
    }

    if (['create', 'assign'].includes(action) && task.parentTaskId) {
      return [];
    }

    const subjectUserId = task.userId;
    const actorName = await this._getUserDisplayName(actorUserId);
    const subjectName = await this._getUserDisplayName(subjectUserId);
    const eventKey = this._buildMessageEventKey({
      sourceType: 'task',
      relatedId: task.taskId,
      notificationType: `task_${action}`,
      subjectUserId,
      actorUserId,
      operationKey,
    });

    const content = this._buildTaskContent({
      action,
      taskTitle: task.title,
      actorRole,
      actorUserId,
      actorName,
      subjectName,
      subjectUserId,
      penaltyPoints,
      upcomingMeta,
      task,
    });

    const records = [];
    if (content.user) {
      records.push(new Message({
        familyId,
        userId: subjectUserId,
        actorUserId,
        subjectUserId,
        operationKey,
        messageEventKey: eventKey,
        visibilityScope: 'user',
        type: 'task',
        notificationType: `task_${action}`,
        relatedId: task.taskId,
        relatedType: 'task',
        title: content.user.title,
        summary: content.user.summary,
        icon: content.icon,
        priority: content.priority,
        createTime: Number(createTimeOverride || task.modifyTime || Date.now()),
      }));
    }

    if (content.family && familyId) {
      records.push(new Message({
        familyId,
        actorUserId,
        subjectUserId,
        operationKey,
        messageEventKey: eventKey,
        visibilityScope: 'family',
        type: 'task',
        notificationType: `task_${action}`,
        relatedId: task.taskId,
        relatedType: 'task',
        title: content.family.title,
        summary: content.family.summary,
        icon: content.icon,
        priority: content.priority,
        createTime: Number(createTimeOverride || task.modifyTime || Date.now()),
      }));
    }

    return records;
  }

  async _buildRewardMessageRecords({
    reward,
    familyId = null,
    action,
    actorUserId,
    actorRole = 'system',
    exchangeUserId = null,
    operationKey,
    pointsOverride = null,
  }) {
    if (!reward || !action) {
      return [];
    }

    const actorName = await this._getUserDisplayName(actorUserId);
    const subjectUserId = ['exchange', 'unclaim'].includes(action)
      ? (exchangeUserId || reward.exchangeUserId)
      : null;
    const subjectName = await this._getUserDisplayName(subjectUserId);

    const content = this._buildRewardContent({
      action,
      rewardName: reward.name,
      actorRole,
      actorUserId,
      actorName,
      subjectName,
      points: pointsOverride === null || pointsOverride === undefined ? reward.points : pointsOverride,
    });

    const records = [];
    if (content.user && subjectUserId) {
      const userEventKey = this._buildMessageEventKey({
        sourceType: 'reward',
        relatedId: reward.rewardId,
        notificationType: `reward_${action}`,
        subjectUserId,
        actorUserId,
        operationKey,
      });
      records.push(new Message({
        familyId,
        userId: subjectUserId,
        actorUserId,
        subjectUserId,
        operationKey,
        messageEventKey: userEventKey,
        visibilityScope: 'user',
        type: 'reward',
        notificationType: `reward_${action}`,
        relatedId: reward.rewardId,
        relatedType: 'reward',
        title: content.user.title,
        summary: content.user.summary,
        icon: content.icon,
        priority: content.priority,
        createTime: Number(operationKey || reward.modifyTime || Date.now()),
      }));
    }

    if (content.family && familyId) {
      const familyEventKey = this._buildMessageEventKey({
        sourceType: 'reward',
        relatedId: reward.rewardId,
        notificationType: `reward_${action}`,
        subjectUserId: null,
        actorUserId,
        operationKey,
      });
      records.push(new Message({
        familyId,
        actorUserId,
        subjectUserId,
        operationKey,
        messageEventKey: familyEventKey,
        visibilityScope: 'family',
        type: 'reward',
        notificationType: `reward_${action}`,
        relatedId: reward.rewardId,
        relatedType: 'reward',
        title: content.family.title,
        summary: content.family.summary,
        icon: content.icon,
        priority: content.priority,
        createTime: Number(operationKey || reward.modifyTime || Date.now()),
      }));
    }

    if (content.user && familyId && ['create', 'update', 'delete'].includes(action)) {
      const activeChildren = await this._getActiveChildMembers(familyId);
      activeChildren.forEach((child) => {
        const childEventKey = this._buildMessageEventKey({
          sourceType: 'reward',
          relatedId: reward.rewardId,
          notificationType: `reward_${action}`,
          subjectUserId: child.userId,
          actorUserId,
          operationKey,
        });
        records.push(new Message({
          familyId,
          userId: child.userId,
          actorUserId,
          subjectUserId: child.userId,
          operationKey,
          messageEventKey: childEventKey,
          visibilityScope: 'user',
          type: 'reward',
          notificationType: `reward_${action}`,
          relatedId: reward.rewardId,
          relatedType: 'reward',
          title: content.user.title,
          summary: content.user.summary,
          icon: content.icon,
          priority: content.priority,
          createTime: Number(operationKey || reward.modifyTime || Date.now()),
        }));
      });
    }

    return records;
  }

  _getRoleDisplayName(role) {
    if (role === 'parent') {
      return '家长';
    }
    if (role === 'child') {
      return '孩子';
    }
    return '系统';
  }

  _normalizeDisplayName(name, role) {
    if (name && name !== '用户') {
      return name;
    }
    return this._getRoleDisplayName(role);
  }

  _buildTaskContent({ action, taskTitle, actorRole, actorUserId, actorName, subjectName, subjectUserId, penaltyPoints = null, upcomingMeta = null, task = null }) {
    const safeSubjectName = this._normalizeDisplayName(subjectName, 'child');
    const safeActorName = this._normalizeDisplayName(actorName, actorRole);
    const isSelfAction = Boolean(actorUserId && subjectUserId && actorUserId === subjectUserId);
    const resolvedPenaltyPoints = Number(penaltyPoints || 0);
    const remainingText = upcomingMeta?.remainingText || '稍后';
    const taskLabel = upcomingMeta?.isRequired ? `必做任务“${taskTitle}”` : `任务“${taskTitle}”`;
    const upcomingStartText = upcomingMeta?.dayLabel
      ? `${taskLabel}将于${upcomingMeta.dayLabel}开始`
      : `${taskLabel}将在${remainingText}后开始`;
    const isRepeatPlanTask = this._isRepeatPlanTask(task);
    const planRangeText = this._formatTaskPlanRange(task);

    switch (action) {
      case 'create':
        return {
          icon: '📝',
          priority: 1,
          user: {
            title: isRepeatPlanTask ? `多天任务计划：${taskTitle}` : `新任务：${taskTitle}`,
            summary: isRepeatPlanTask
              ? (isSelfAction
                ? `你给自己创建了多天任务计划“${taskTitle}”${planRangeText ? `（${planRangeText}）` : ''}`
                : `${safeActorName}给你创建了多天任务计划“${taskTitle}”${planRangeText ? `（${planRangeText}）` : ''}`)
              : (isSelfAction
                ? `你给自己安排了任务“${taskTitle}”`
                : `${safeActorName}给你安排了任务“${taskTitle}”`),
          },
          family: {
            title: isRepeatPlanTask ? `多天任务计划：${taskTitle}` : `任务已创建：${taskTitle}`,
            summary: isRepeatPlanTask
              ? (isSelfAction
                ? `${safeSubjectName}创建了多天任务计划“${taskTitle}”${planRangeText ? `（${planRangeText}）` : ''}`
                : `${safeActorName}给${safeSubjectName}创建了多天任务计划“${taskTitle}”${planRangeText ? `（${planRangeText}）` : ''}`)
              : (isSelfAction
                ? `${safeSubjectName}创建了任务“${taskTitle}”`
                : `${safeActorName}给${safeSubjectName}创建了任务“${taskTitle}”`),
          },
        };
      case 'assign':
        return {
          icon: '📬',
          priority: 1,
          user: {
            title: isRepeatPlanTask ? `多天任务计划已分配：${taskTitle}` : `任务已分配：${taskTitle}`,
            summary: isRepeatPlanTask
              ? `${safeActorName}给你分配了多天任务计划“${taskTitle}”${planRangeText ? `（${planRangeText}）` : ''}`
              : `${safeActorName}给你分配了任务“${taskTitle}”`,
          },
          family: {
            title: isRepeatPlanTask ? `多天任务计划已分配：${taskTitle}` : `任务已分配：${taskTitle}`,
            summary: isRepeatPlanTask
              ? `${safeActorName}给${safeSubjectName}分配了多天任务计划“${taskTitle}”${planRangeText ? `（${planRangeText}）` : ''}`
              : `${safeActorName}给${safeSubjectName}分配了任务“${taskTitle}”`,
          },
        };
      case 'update':
        return {
          icon: '✏️',
          priority: 1,
          user: {
            title: `任务已更新：${taskTitle}`,
            summary: isSelfAction
              ? `你的任务“${taskTitle}”已更新`
              : `${safeActorName}更新了你的任务“${taskTitle}”`,
          },
          family: {
            title: `任务已更新：${taskTitle}`,
            summary: isSelfAction
              ? `${safeSubjectName}更新了任务“${taskTitle}”`
              : `${safeActorName}更新了${safeSubjectName}的任务“${taskTitle}”`,
          },
        };
      case 'delete':
        return {
          icon: '🗑️',
          priority: 1,
          user: {
            title: `任务已删除：${taskTitle}`,
            summary: isSelfAction
              ? `你的任务“${taskTitle}”已删除`
              : `${safeActorName}删除了你的任务“${taskTitle}”`,
          },
          family: {
            title: `任务已删除：${taskTitle}`,
            summary: isSelfAction
              ? `${safeSubjectName}删除了任务“${taskTitle}”`
              : `${safeActorName}删除了${safeSubjectName}的任务“${taskTitle}”`,
          },
        };
      case 'complete':
        return {
          icon: '✅',
          priority: 2,
          user: {
            title: `完成任务：${taskTitle}`,
            summary: isSelfAction
              ? `你完成了任务“${taskTitle}”`
              : `${safeActorName}代你完成了任务“${taskTitle}”`,
          },
          family: {
            title: `完成任务：${taskTitle}`,
            summary: isSelfAction
              ? `${safeSubjectName}完成了任务“${taskTitle}”`
              : `${safeActorName}代${safeSubjectName}完成了任务“${taskTitle}”`,
          },
        };
      case 'reset':
        return {
          icon: '↩️',
          priority: 1,
          user: {
            title: `任务已重置：${taskTitle}`,
            summary: isSelfAction
              ? `你的任务“${taskTitle}”已重置为未完成`
              : `${safeActorName}将你的任务“${taskTitle}”重置为未完成`,
          },
          family: {
            title: `任务已重置：${taskTitle}`,
            summary: isSelfAction
              ? `${safeSubjectName}将任务“${taskTitle}”重置为未完成`
              : `${safeActorName}将${safeSubjectName}的任务“${taskTitle}”重置为未完成`,
          },
        };
      case 'required':
        return {
          icon: '📌',
          priority: 2,
          user: {
            title: `任务已设为必做：${taskTitle}`,
            summary: isSelfAction
              ? `任务“${taskTitle}”已设为必做`
              : `${safeActorName}将你的任务“${taskTitle}”设为必做`,
          },
          family: {
            title: `任务已设为必做：${taskTitle}`,
            summary: isSelfAction
              ? `${safeSubjectName}将任务“${taskTitle}”设为必做`
              : `${safeActorName}将${safeSubjectName}的任务“${taskTitle}”设为必做`,
          },
        };
      case 'unrequired':
        return {
          icon: '📍',
          priority: 1,
          user: {
            title: `任务已取消必做：${taskTitle}`,
            summary: isSelfAction
              ? `任务“${taskTitle}”已取消必做`
              : `${safeActorName}取消了你的任务“${taskTitle}”的必做标记`,
          },
          family: {
            title: `任务已取消必做：${taskTitle}`,
            summary: isSelfAction
              ? `${safeSubjectName}取消了任务“${taskTitle}”的必做标记`
              : `${safeActorName}取消了${safeSubjectName}的任务“${taskTitle}”的必做标记`,
          },
        };
      case 'penalty':
        return {
          icon: '⚠️',
          priority: 2,
          user: {
            title: `必做任务已扣星：${taskTitle}`,
            summary: `必做任务“${taskTitle}”未完成，已扣除${resolvedPenaltyPoints}颗星星`,
          },
          family: {
            title: `必做任务已扣星：${taskTitle}`,
            summary: `${safeSubjectName}未完成必做任务“${taskTitle}”，已扣除${resolvedPenaltyPoints}颗星星`,
          },
        };
      case 'upcoming':
        return {
          icon: '⏰',
          priority: upcomingMeta?.isRequired ? 2 : 1,
          user: {
            title: upcomingMeta?.isRequired ? `必做任务即将开始：${taskTitle}` : `任务即将开始：${taskTitle}`,
            summary: upcomingMeta?.isAllDay ? upcomingStartText : `${taskLabel}将在${remainingText}后开始`,
          },
          family: {
            title: upcomingMeta?.isRequired ? `必做任务即将开始：${taskTitle}` : `任务即将开始：${taskTitle}`,
            summary: upcomingMeta?.isAllDay
              ? `${safeSubjectName}的${upcomingStartText}`
              : `${safeSubjectName}的${taskLabel}将在${remainingText}后开始`,
          },
        };
      default:
        return null;
    }
  }

  _buildRewardContent({ action, rewardName, actorRole, actorName, subjectName, points }) {
    const safeActorName = actorName || (actorRole === 'parent' ? '家长' : '孩子');
    const safeSubjectName = subjectName || '孩子';

    switch (action) {
      case 'create':
        return {
          icon: '🎁',
          priority: 1,
          user: {
            title: '奖励池新增奖励',
            summary: `${safeActorName}新增了奖励“${rewardName}”，需要${points}颗星星兑换`,
          },
          family: {
            title: '新奖励已创建',
            summary: `${safeActorName}创建了奖励“${rewardName}”，需要${points}颗星星兑换`,
          },
        };
      case 'update':
        return {
          icon: '🎁',
          priority: 1,
          user: {
            title: '奖励池调整',
            summary: `${safeActorName}更新了奖励“${rewardName}”，当前需要${points}颗星星兑换`,
          },
          family: {
            title: '奖励已更新',
            summary: `${safeActorName}更新了奖励“${rewardName}”，当前需要${points}颗星星兑换`,
          },
        };
      case 'delete':
        return {
          icon: '🗑️',
          priority: 1,
          user: {
            title: '奖励池移除奖励',
            summary: `${safeActorName}移除了奖励“${rewardName}”`,
          },
          family: {
            title: '奖励已删除',
            summary: `${safeActorName}删除了奖励“${rewardName}”`,
          },
        };
      case 'exchange':
        return {
          icon: '⭐',
          priority: 2,
          user: {
            title: '奖励已兑换',
            summary: `你已兑换奖励“${rewardName}”`,
          },
          family: {
            title: '奖励已兑换',
            summary: actorRole === 'parent'
              ? `${safeActorName}为${safeSubjectName}兑换了奖励“${rewardName}”`
              : `${safeSubjectName}兑换了奖励“${rewardName}”`,
          },
        };
      case 'unclaim':
        return {
          icon: '↩️',
          priority: 1,
          user: {
            title: '奖励兑换已取消',
            summary: `奖励“${rewardName}”的兑换已取消，已退回${points}颗星星`,
          },
          family: {
            title: '奖励兑换已取消',
            summary: actorRole === 'parent'
              ? `${safeActorName}取消了${safeSubjectName}兑换的奖励“${rewardName}”，已退回${points}颗星星`
              : `${safeSubjectName}取消了奖励“${rewardName}”的兑换，已退回${points}颗星星`,
          },
        };
      default:
        return null;
    }
  }

  _buildMessageEventKey({
    sourceType,
    relatedId,
    notificationType,
    subjectUserId = null,
    actorUserId = null,
    operationKey = null,
  }) {
    return [
      sourceType || 'unknown',
      relatedId || 'none',
      notificationType || 'notify',
      subjectUserId || 'none',
      actorUserId || 'none',
      operationKey || 'none',
    ].join(':');
  }

  _getFoldGroup(notificationType) {
    const foldGroups = [
      ['task_create', 'task_update', 'task_required', 'task_unrequired'],
      ['reward_create', 'reward_update']
    ];

    return foldGroups.find((group) => group.includes(notificationType)) || null;
  }

  async _archiveFoldableMessages(messages, connection = null) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    const conn = connection || { execute };
    const archivedTargets = new Set();

    for (const message of messages) {
      const foldGroup = this._getFoldGroup(message.notificationType);
      if (!foldGroup || !message.relatedId || !message.relatedType) {
        continue;
      }

      const targetKey = [
        message.visibilityScope,
        message.userId || '',
        message.familyId || '',
        message.relatedType,
        message.relatedId,
        foldGroup.join(',')
      ].join('|');

      if (archivedTargets.has(targetKey)) {
        continue;
      }
      archivedTargets.add(targetKey);

      const sql = [
        'UPDATE messages',
        'SET is_archived = 1',
        'WHERE deleted_at IS NULL',
        'AND is_archived = 0',
        'AND is_read = 0',
        'AND related_id = ?',
        'AND related_type = ?',
        `AND notification_type IN (${foldGroup.map(() => '?').join(', ')})`,
        'AND visibility_scope = ?',
        'AND message_event_key <> ?'
      ];
      const params = [
        message.relatedId,
        message.relatedType,
        ...foldGroup,
        message.visibilityScope,
        message.messageEventKey
      ];

      if (message.visibilityScope === 'user') {
        sql.push('AND user_id = ?');
        params.push(message.userId);
      } else if (message.visibilityScope === 'family') {
        sql.push('AND family_id = ?');
        params.push(message.familyId);
      }

      await conn.execute(sql.join(' '), params);
    }
  }

  async _upsertMessages(messages, connection = null) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return [];
    }

    const conn = connection || { execute };
    const savedMessages = [];

    for (const message of messages) {
      const errors = message.validate();
      if (errors.length > 0) {
        const error = new Error(`消息校验失败: ${errors.join(', ')}`);
        error.code = 'MESSAGE_INVALID';
        throw error;
      }

      const payload = message.toDB();
      await conn.execute(
        `INSERT INTO messages (
          message_id, family_id, user_id, actor_user_id, subject_user_id,
          operation_key, message_event_key, visibility_scope, type, notification_type,
          related_id, related_type, title, summary, content, icon, priority,
          is_read, read_time, is_archived, create_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          family_id = VALUES(family_id),
          user_id = VALUES(user_id),
          actor_user_id = VALUES(actor_user_id),
          subject_user_id = VALUES(subject_user_id),
          operation_key = VALUES(operation_key),
          type = VALUES(type),
          notification_type = VALUES(notification_type),
          related_id = VALUES(related_id),
          related_type = VALUES(related_type),
          title = VALUES(title),
          summary = VALUES(summary),
          content = VALUES(content),
          icon = VALUES(icon),
          priority = VALUES(priority),
          is_archived = VALUES(is_archived),
          create_time = VALUES(create_time),
          deleted_at = NULL`,
        [
          payload.message_id,
          payload.family_id,
          payload.user_id,
          payload.actor_user_id,
          payload.subject_user_id,
          payload.operation_key,
          payload.message_event_key,
          payload.visibility_scope,
          payload.type,
          payload.notification_type,
          payload.related_id,
          payload.related_type,
          payload.title,
          payload.summary,
          payload.content,
          payload.icon,
          payload.priority,
          payload.is_read,
          payload.read_time,
          payload.is_archived,
          payload.create_time,
        ]
      );
      savedMessages.push(message);
    }

    return savedMessages;
  }

  async _getAuthorizedMessage(messageId, viewer) {
    const message = await this.getMessageById(messageId);
    if (!message) {
      return null;
    }

    if (message.visibilityScope === 'family') {
      if (viewer.role !== 'parent' || !viewer.familyId || viewer.familyId !== message.familyId) {
        const error = new Error('无权访问该家庭消息');
        error.code = 'PERMISSION_DENIED';
        throw error;
      }
      return message;
    }

    if (message.userId === viewer.userId) {
      return message;
    }

    if (viewer.role === 'parent' && viewer.familyId && viewer.familyId === message.familyId) {
      return message;
    }

    const error = new Error('无权访问该消息');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }

  async _getUserDisplayName(userId) {
    if (!userId) {
      return null;
    }

    try {
      const rows = await query(
        `SELECT nickname, role
         FROM users
         WHERE user_id = ?
         LIMIT 1`,
        [userId]
      );
      if (rows.length === 0) {
        return null;
      }
      return this._normalizeDisplayName(rows[0].nickname, rows[0].role);
    } catch (error) {
      logger.warn('获取用户昵称失败，回退默认名称', { userId, error: error.message });
      return null;
    }
  }

  async _getActiveChildMembers(familyId) {
    if (!familyId) {
      return [];
    }

    const rows = await query(
      `SELECT user_id, nickname, role
       FROM users
       WHERE family_id = ?
         AND role = 'child'
         AND status = 'active'
       ORDER BY created_at ASC`,
      [familyId]
    );

    return rows.map((row) => ({
      userId: row.user_id,
      nickname: row.nickname,
      role: row.role,
    }));
  }
}

module.exports = new MessageService();
