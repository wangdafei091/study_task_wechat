const {
  MessagePriority,
  NotificationType,
  MessageVisibilityScope
} = require('../../models/message');
const { EVENTS } = require('../../utils/constants');
const logger = require('../../utils/logger');
const messageHandlers = require('../../services/message-service/message-handlers');
const messageProvisional = require('../../services/message-service/message-provisional');
const messageDomain = require('../../services/message-service/message-domain');

describe('message-service helper modules', () => {
  it('message-handlers createListenerMap 应把事件委托到 service 实例方法', () => {
    const service = {
      _handleTaskCreated: jest.fn(),
      _handleTaskCompleted: jest.fn(),
      _handleTaskUpdated: jest.fn(),
      _handleTaskDeleted: jest.fn(),
      _handleTaskStatusUpdated: jest.fn(),
      _handleUpcomingTask: jest.fn(),
      _handleTaskPenalty: jest.fn(),
      _handleTaskMarkedRequired: jest.fn(),
      _handleTaskUnmarkedRequired: jest.fn(),
      _handleRewardCreated: jest.fn(),
      _handleRewardClaimed: jest.fn(),
      _handleRewardDelivered: jest.fn(),
      _handleRewardUnclaimed: jest.fn(),
      _handleRewardDeletedBatch: jest.fn(),
      _handleRewardExamplesCleared: jest.fn(),
      _handleTaskCloudSyncFailed: jest.fn(),
      _handleRewardCloudSyncFailed: jest.fn(),
      _handleDomainMessageCreated: jest.fn(),
      _handleDomainMessageUpdated: jest.fn(),
      _handleDomainMessageDeleted: jest.fn(),
      _handleDomainMessageRead: jest.fn(),
      _handleDomainMessageAllRead: jest.fn()
    };

    const listenerMap = messageHandlers.createListenerMap(service);
    const payload = { id: 'payload-1' };

    Object.values(listenerMap).forEach((listener) => listener(payload));

    expect(service._handleTaskCreated).toHaveBeenCalledWith(payload);
    expect(service._handleTaskCompleted).toHaveBeenCalledWith(payload);
    expect(service._handleTaskUpdated).toHaveBeenCalledWith(payload);
    expect(service._handleTaskDeleted).toHaveBeenCalledWith(payload);
    expect(service._handleTaskStatusUpdated).toHaveBeenCalledWith(payload);
    expect(service._handleUpcomingTask).toHaveBeenCalledWith(payload);
    expect(service._handleTaskPenalty).toHaveBeenCalledWith(payload);
    expect(service._handleTaskMarkedRequired).toHaveBeenCalledWith(payload);
    expect(service._handleTaskUnmarkedRequired).toHaveBeenCalledWith(payload);
    expect(service._handleRewardCreated).toHaveBeenCalledWith(payload);
    expect(service._handleRewardClaimed).toHaveBeenCalledWith(payload);
    expect(service._handleRewardDelivered).toHaveBeenCalledWith(payload);
    expect(service._handleRewardUnclaimed).toHaveBeenCalledWith(payload);
    expect(service._handleRewardDeletedBatch).toHaveBeenCalledWith(payload);
    expect(service._handleRewardExamplesCleared).toHaveBeenCalledWith(payload);
    expect(service._handleTaskCloudSyncFailed).toHaveBeenCalledWith(payload);
    expect(service._handleRewardCloudSyncFailed).toHaveBeenCalledWith(payload);
    expect(service._handleDomainMessageCreated).toHaveBeenCalledWith(payload);
    expect(service._handleDomainMessageUpdated).toHaveBeenCalledWith(payload);
    expect(service._handleDomainMessageDeleted).toHaveBeenCalledWith(payload);
    expect(service._handleDomainMessageRead).toHaveBeenCalledWith(payload);
    expect(service._handleDomainMessageAllRead).toHaveBeenCalledWith(payload);
  });

  it('message-domain buildTaskLocalMessageMeta 应在孩子操作时把消息发给家长', () => {
    const service = {
      _resolveOperatorIdentity: jest.fn(() => ({ userId: 'child-1', role: 'child' })),
      _getUserIdByRole: jest.fn(() => 'parent-1'),
      userService: {
        getCurrentUserId: jest.fn(() => 'child-1')
      }
    };

    const result = messageDomain.buildTaskLocalMessageMeta(service, {
      id: 'task-1',
      title: '刷牙',
      userId: 'child-1'
    }, NotificationType.COMPLETED);

    expect(result).toEqual(expect.objectContaining({
      userId: 'parent-1',
      title: '任务已完成'
    }));
  });

  it('message-domain buildTaskLocalMessageMeta 应在家长完成/更新类动作时跳过消息创建', () => {
    const service = {
      _resolveOperatorIdentity: jest.fn(() => ({ userId: 'parent-1', role: 'parent' })),
      _getUserIdByRole: jest.fn()
    };

    expect(messageDomain.buildTaskLocalMessageMeta(service, {
      id: 'task-1',
      title: '刷牙'
    }, NotificationType.COMPLETED)).toBeNull();
  });

  it('message-domain buildTaskLocalMessageMeta 应生成历史补打卡文案', () => {
    const service = {
      _resolveOperatorIdentity: jest.fn(() => ({ userId: 'child-1', role: 'child' })),
      _getUserIdByRole: jest.fn(() => 'parent-1'),
      userService: {
        getCurrentUserId: jest.fn(() => 'child-1')
      }
    };

    const result = messageDomain.buildTaskLocalMessageMeta(service, {
      id: 'task-1',
      title: '刷牙',
      date: '2026-04-07',
      userId: 'child-1'
    }, NotificationType.HISTORY_COMPLETED);

    expect(result).toEqual(expect.objectContaining({
      userId: 'parent-1',
      title: '历史任务已补打卡'
    }));
    expect(result.summary).toContain('2026-04-07');
  });

  it('message-provisional createTaskProvisionalMessages 应创建 user 和 family 两条待同步消息', async () => {
    const service = {
      messageRepository: {
        batchAddMessages: jest.fn().mockResolvedValue()
      },
      _emitMessageChangedEvent: jest.fn().mockResolvedValue(),
      _getLocalUserDisplayName: jest.fn((userId) => (userId === 'parent-1' ? '家长' : '孩子'))
    };

    const messages = await messageProvisional.createTaskProvisionalMessages(service, {
      id: 'task-1',
      title: '刷牙',
      userId: 'child-1'
    }, {
      familyId: 'family-1',
      targetUserId: 'child-1',
      operatorUserId: 'parent-1',
      operatorRole: 'parent',
      action: 'create',
      operationKey: 'op-1'
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual(expect.objectContaining({
      userId: 'child-1',
      visibilityScope: MessageVisibilityScope.USER
    }));
    expect(messages[1]).toEqual(expect.objectContaining({
      familyId: 'family-1',
      visibilityScope: MessageVisibilityScope.FAMILY
    }));
    expect(service.messageRepository.batchAddMessages).toHaveBeenCalled();
    expect(service._emitMessageChangedEvent).toHaveBeenCalled();
  });

  it('message-provisional 历史任务 reset 应带日期并使用历史重置标题', async () => {
    const service = {
      messageRepository: {
        batchAddMessages: jest.fn().mockResolvedValue()
      },
      _emitMessageChangedEvent: jest.fn().mockResolvedValue(),
      _getLocalUserDisplayName: jest.fn((userId) => (userId === 'parent-1' ? '家长' : '孩子'))
    };

    const messages = await messageProvisional.createTaskProvisionalMessages(service, {
      id: 'task-1',
      title: '刷牙',
      date: '2026-04-07',
      userId: 'child-1'
    }, {
      familyId: 'family-1',
      targetUserId: 'child-1',
      operatorUserId: 'parent-1',
      operatorRole: 'parent',
      action: 'reset',
      operationKey: 'op-reset-1',
      modifyTime: new Date('2026-04-15T10:00:00+08:00').getTime()
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].title).toBe('历史任务重置待同步');
    expect(messages[0].summary).toContain('2026-04-07');
    expect(messages[1].title).toBe('历史任务重置待同步');
    expect(messages[1].summary).toContain('2026-04-07');
  });

  it('message-provisional buildTaskMessageCopy 应覆盖主要动作分支和默认分支', () => {
    const service = {
      _normalizeDisplayName: jest.fn((_, role) => (role === 'parent' ? '家长' : '孩子'))
    };

    const createCopy = messageProvisional.buildTaskMessageCopy(service, {
      action: 'create',
      taskTitle: '刷牙',
      actorUserId: 'parent-1',
      actorRole: 'parent',
      subjectUserId: 'child-1',
      pending: true
    });
    expect(createCopy.userTitle).toBe('新任务待同步');
    expect(createCopy.userSummary).toContain('家长给你安排了任务');

    const selfUpdate = messageProvisional.buildTaskMessageCopy(service, {
      action: 'update',
      taskTitle: '刷牙',
      actorUserId: 'child-1',
      subjectUserId: 'child-1'
    });
    expect(selfUpdate.userSummary).toContain('你的任务“刷牙”已更新');

    const deleteCopy = messageProvisional.buildTaskMessageCopy(service, {
      action: 'delete',
      taskTitle: '刷牙',
      actorUserId: 'parent-1',
      subjectUserId: 'child-1'
    });
    expect(deleteCopy.familySummary).toContain('删除了孩子的任务');

    const completeCopy = messageProvisional.buildTaskMessageCopy(service, {
      action: 'complete',
      taskTitle: '刷牙',
      actorUserId: 'child-1',
      subjectUserId: 'child-1'
    });
    expect(completeCopy.icon).toBe('✅');

    const historyCopy = messageProvisional.buildTaskMessageCopy(service, {
      action: 'history_complete',
      taskTitle: '刷牙',
      taskDate: '2026-04-07',
      actorUserId: 'parent-1',
      subjectUserId: 'child-1'
    });
    expect(historyCopy.userSummary).toContain('2026-04-07');

    const makeupCopy = messageProvisional.buildTaskMessageCopy(service, {
      action: 'makeup_complete',
      taskTitle: '刷牙',
      actorUserId: 'parent-1',
      subjectUserId: 'child-1'
    });
    expect(makeupCopy.userTitle).toBe('任务已逾期补做');

    const resetCopy = messageProvisional.buildTaskMessageCopy(service, {
      action: 'reset',
      taskTitle: '刷牙',
      taskDate: '2026-04-15',
      operationTime: new Date('2026-04-15T08:00:00+08:00').getTime(),
      actorUserId: 'child-1',
      subjectUserId: 'child-1'
    });
    expect(resetCopy.userTitle).toBe('任务已重置');

    const resetCopyWithoutDate = messageProvisional.buildTaskMessageCopy(service, {
      action: 'reset',
      taskTitle: '刷牙',
      taskDate: '',
      operationTime: new Date('2026-04-15T08:00:00+08:00').getTime(),
      actorUserId: 'child-1',
      subjectUserId: 'child-1'
    });
    expect(resetCopyWithoutDate.userTitle).toBe('任务已重置');

    const resetCopyWithoutFiniteOperationTime = messageProvisional.buildTaskMessageCopy(service, {
      action: 'reset',
      taskTitle: '刷牙',
      taskDate: '2026-04-15',
      operationTime: Number.NaN,
      actorUserId: 'child-1',
      subjectUserId: 'child-1'
    });
    expect(resetCopyWithoutFiniteOperationTime.userTitle).toBe('任务已重置');

    const defaultCopy = messageProvisional.buildTaskMessageCopy(service, {
      action: 'unknown',
      taskTitle: '刷牙'
    });
    expect(defaultCopy.userTitle).toBe('任务通知');
  });

  it('message-provisional createTaskProvisionalMessages 在参数无效时应返回空数组', async () => {
    await expect(messageProvisional.createTaskProvisionalMessages({}, null, null)).resolves.toEqual([]);
  });

  it('message-provisional createTaskProvisionalMessages 在缺少 familyId 时只创建用户消息', async () => {
    const service = {
      messageRepository: {
        batchAddMessages: jest.fn().mockResolvedValue()
      },
      _emitMessageChangedEvent: jest.fn().mockResolvedValue(),
      _getLocalUserDisplayName: jest.fn(() => '孩子')
    };

    const messages = await messageProvisional.createTaskProvisionalMessages(service, {
      id: 'task-1',
      title: '刷牙',
      userId: 'child-1'
    }, {
      targetUserId: 'child-1',
      operatorUserId: 'child-1',
      operatorRole: 'child',
      action: 'update',
      operationKey: 'task-op-2'
    });

    expect(messages).toHaveLength(1);
    expect(messages[0].visibilityScope).toBe(MessageVisibilityScope.USER);
  });

  it('message-provisional createRewardProvisionalMessages 应覆盖 exchange、delete 和默认动作', async () => {
    const service = {
      messageRepository: {
        batchAddMessages: jest.fn().mockResolvedValue()
      },
      _emitMessageChangedEvent: jest.fn().mockResolvedValue()
    };

    const exchangeMessages = await messageProvisional.createRewardProvisionalMessages(service, {
      id: 'reward-1',
      name: '看动画',
      familyId: 'family-1',
      exchangeUserId: 'child-1'
    }, {
      familyId: 'family-1',
      exchangeUserId: 'child-1',
      operatorUserId: 'parent-1',
      action: 'exchange',
      operationKey: 'reward-op-1'
    });
    expect(exchangeMessages).toHaveLength(2);

    const deleteMessages = await messageProvisional.createRewardProvisionalMessages(service, {
      id: 'reward-2',
      name: '看动画',
      familyId: 'family-1'
    }, {
      familyId: 'family-1',
      action: 'delete',
      operationKey: 'reward-op-2'
    });
    expect(deleteMessages).toHaveLength(1);
    expect(deleteMessages[0].title).toBe('奖励删除待同步');

    const defaultMessages = await messageProvisional.createRewardProvisionalMessages(service, {
      id: 'reward-3',
      name: '看动画',
      familyId: 'family-1'
    }, {
      familyId: 'family-1',
      action: 'unknown',
      operationKey: 'reward-op-3'
    });
    expect(defaultMessages).toHaveLength(1);
    expect(defaultMessages[0].title).toBe('奖励待同步');

    await expect(messageProvisional.createRewardProvisionalMessages(service, null, null)).resolves.toEqual([]);
  });

  it('message-provisional createProvisionalMessages 应处理 task、reward、未知类型和无效 payload', async () => {
    const service = {
      messageRepository: {
        batchAddMessages: jest.fn().mockResolvedValue()
      },
      _emitMessageChangedEvent: jest.fn().mockResolvedValue(),
      _getLocalUserDisplayName: jest.fn(() => '孩子')
    };

    await expect(messageProvisional.createProvisionalMessages(service, 'task', {})).resolves.toEqual([]);
    await expect(messageProvisional.createProvisionalMessages(service, 'unknown', {
      pendingSyncMeta: { operationKey: 'noop' }
    })).resolves.toEqual([]);

    await expect(messageProvisional.createProvisionalMessages(service, 'task', {
      task: { id: 'task-1', title: '刷牙', userId: 'child-1' },
      pendingSyncMeta: {
        targetUserId: 'child-1',
        action: 'create',
        operationKey: 'task-provisional'
      }
    })).resolves.toHaveLength(1);

    await expect(messageProvisional.createProvisionalMessages(service, 'reward', {
      reward: { id: 'reward-1', name: '动画', familyId: 'family-1' },
      pendingSyncMeta: {
        familyId: 'family-1',
        action: 'create',
        operationKey: 'reward-provisional'
      }
    })).resolves.toHaveLength(1);
  });

  it('message-provisional handleTaskCloudSyncFailed / handleRewardCloudSyncFailed 应尊重云开关并吞掉异常', async () => {
    const disabledService = {
      enableCloudStorage: false
    };
    expect(messageProvisional.handleTaskCloudSyncFailed(disabledService, {})).toBeUndefined();
    expect(messageProvisional.handleRewardCloudSyncFailed(disabledService, {})).toBeUndefined();

    const enabledService = {
      enableCloudStorage: true,
      messageRepository: {
        batchAddMessages: jest.fn().mockRejectedValue(new Error('write fail'))
      },
      _emitMessageChangedEvent: jest.fn().mockResolvedValue(),
      _getLocalUserDisplayName: jest.fn(() => '孩子')
    };
    const warnSpy = jest.spyOn(logger, 'warn');

    messageProvisional.handleTaskCloudSyncFailed(enabledService, {
      task: { id: 'task-1', title: '刷牙', userId: 'child-1' },
      pendingSyncMeta: { targetUserId: 'child-1', action: 'create', operationKey: 'task-fail' }
    });
    messageProvisional.handleRewardCloudSyncFailed(enabledService, {
      reward: { id: 'reward-1', name: '动画', familyId: 'family-1' },
      pendingSyncMeta: { familyId: 'family-1', action: 'create', operationKey: 'reward-fail' }
    });

    await new Promise(setImmediate);
    await new Promise(setImmediate);

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('message-domain createTaskMessageWithDomainModel 应落仓并发送领域事件', async () => {
    const savedMessage = { id: 'msg-1' };
    const service = {
      _resolveOperatorIdentity: jest.fn(() => ({ userId: 'child-1', role: 'child' })),
      _getUserIdByRole: jest.fn(() => 'parent-1'),
      userService: {
        getCurrentUserId: jest.fn(() => 'child-1')
      },
      messageRepository: {
        addMessage: jest.fn().mockResolvedValue(savedMessage)
      },
      eventBus: {
        emit: jest.fn()
      }
    };

    const result = await messageDomain.createTaskMessageWithDomainModel(service, {
      id: 'task-1',
      title: '刷牙',
      userId: 'child-1'
    }, NotificationType.NEW);

    expect(result).toBe(savedMessage);
    expect(service.messageRepository.addMessage).toHaveBeenCalled();
    expect(service.eventBus.emit).toHaveBeenCalledWith(EVENTS.DOMAIN_MESSAGE_CREATED, {
      message: savedMessage
    });
  });

  it('message-domain prepare/createMessage 流程应覆盖 validation fail 与 exception', async () => {
    const service = {
      _resolveOperatorIdentity: jest.fn(() => ({ userId: 'child-1', role: 'child' })),
      _getUserIdByRole: jest.fn(() => 'parent-1'),
      userService: { getCurrentUserId: jest.fn(() => 'child-1') },
      messageRepository: {
        addMessage: jest.fn().mockRejectedValue(new Error('save fail'))
      },
      eventBus: { emit: jest.fn() }
    };

    await expect(messageDomain.createTaskMessageWithDomainModel(service, {
      id: 'task-1',
      title: '刷牙',
      userId: 'child-1'
    }, NotificationType.NEW)).rejects.toThrow('save fail');

    const invalidService = {
      messageRepository: { addMessage: jest.fn() },
      eventBus: { emit: jest.fn() }
    };
    await expect(messageDomain.createMessageWithDomainModel(invalidService, {})).resolves.toBeNull();
  });

  it('message-domain createSystemMessageWithDomainModel 应覆盖不同系统消息类型和自定义标题', async () => {
    const savedMessage = { id: 'msg-system-1' };
    const service = {
      messageRepository: { addMessage: jest.fn().mockResolvedValue(savedMessage) },
      eventBus: { emit: jest.fn() }
    };

    await expect(messageDomain.createSystemMessageWithDomainModel(service, 'reward-content', 'reward'))
      .resolves.toBe(savedMessage);
    await expect(messageDomain.createSystemMessageWithDomainModel(service, 'penalty-content', 'penalty'))
      .resolves.toBe(savedMessage);
    await expect(messageDomain.createSystemMessageWithDomainModel(service, 'achievement-content', 'achievement'))
      .resolves.toBe(savedMessage);
    await expect(messageDomain.createSystemMessageWithDomainModel(service, 'welcome-content', 'welcome'))
      .resolves.toBe(savedMessage);
    await expect(messageDomain.createSystemMessageWithDomainModel(service, 'custom-content', 'other', {
      title: '自定义标题',
      priority: MessagePriority.HIGH
    })).resolves.toBe(savedMessage);

    expect(service.messageRepository.addMessage).toHaveBeenCalledTimes(5);
  });

  it('message-domain 查询与批量操作 helper 应覆盖成功和失败分支', async () => {
    const visibleMessages = [
      { id: 'msg-1', isRead: false, markAsRead: jest.fn(() => ({ id: 'msg-1', isRead: true })) },
      { id: 'msg-2', isRead: false, markAsRead: jest.fn(() => ({ id: 'msg-2', isRead: true })) },
      { id: 'msg-3', isRead: true, markAsRead: jest.fn(() => ({ id: 'msg-3', isRead: true })) }
    ];
    const service = {
      _resolveScopeOptions: jest.fn((options) => options),
      _getScopedMessagesForDisplay: jest.fn().mockResolvedValue(visibleMessages),
      _compactMessagesForDisplay: jest.fn((messages) => messages),
      eventBus: { emit: jest.fn() },
      messageRepository: {
        markAsRead: jest.fn().mockResolvedValue(true),
        batchMarkAsRead: jest.fn().mockResolvedValue(2),
        delete: jest.fn().mockResolvedValue(true),
        deleteRelatedMessages: jest.fn().mockResolvedValue(4),
        updateTaskMessages: jest.fn().mockResolvedValue(1)
      }
    };

    await expect(messageDomain.getAllMessagesWithDomainModel(service, { scope: 'family' }))
      .resolves.toEqual(visibleMessages);
    await expect(messageDomain.getUnreadCountWithDomainModel(service, { scope: 'family' }))
      .resolves.toBe(2);
    await expect(messageDomain.markMessageAsReadWithDomainModel(service, 'msg-1')).resolves.toBe(true);
    await expect(messageDomain.markAllMessagesAsReadWithDomainModel(service, { scope: 'family' })).resolves.toBe(2);
    await expect(messageDomain.markAllMessagesAsReadWithDomainModel(service, { scope: 'family' }, [])).resolves.toBe(0);
    await expect(messageDomain.deleteMessageWithDomainModel(service, 'msg-1')).resolves.toBe(true);
    await expect(messageDomain.deleteRelatedMessagesWithDomainModel(service, 'task-1')).resolves.toBe(4);
    await expect(messageDomain.updateTaskMessagesWithDomainModel(service, { id: 'task-1' })).resolves.toBe(1);

    service._getScopedMessagesForDisplay.mockRejectedValueOnce(new Error('query fail'));
    await expect(messageDomain.getAllMessagesWithDomainModel(service, {})).resolves.toEqual([]);
    service._getScopedMessagesForDisplay.mockRejectedValueOnce(new Error('count fail'));
    await expect(messageDomain.getUnreadCountWithDomainModel(service, {})).resolves.toBe(0);
    service.messageRepository.markAsRead.mockResolvedValueOnce(false);
    await expect(messageDomain.markMessageAsReadWithDomainModel(service, 'msg-1')).resolves.toBe(false);
    service.messageRepository.markAsRead.mockRejectedValueOnce(new Error('mark fail'));
    await expect(messageDomain.markMessageAsReadWithDomainModel(service, 'msg-1')).resolves.toBe(false);
    service.messageRepository.batchMarkAsRead.mockRejectedValueOnce(new Error('mark all fail'));
    await expect(messageDomain.markAllMessagesAsReadWithDomainModel(service, {}, visibleMessages)).resolves.toBe(0);
    service.messageRepository.delete.mockResolvedValueOnce(false);
    await expect(messageDomain.deleteMessageWithDomainModel(service, 'msg-2')).resolves.toBe(false);
    service.messageRepository.delete.mockRejectedValueOnce(new Error('delete fail'));
    await expect(messageDomain.deleteMessageWithDomainModel(service, 'msg-3')).resolves.toBe(false);
    service.messageRepository.deleteRelatedMessages.mockRejectedValueOnce(new Error('delete related fail'));
    await expect(messageDomain.deleteRelatedMessagesWithDomainModel(service, 'task-1')).resolves.toBe(0);
    service.messageRepository.updateTaskMessages.mockRejectedValueOnce(new Error('update task fail'));
    await expect(messageDomain.updateTaskMessagesWithDomainModel(service, { id: 'task-1' })).resolves.toBe(0);
  });

  it('message-domain 奖励消息应覆盖 created/claimed/delivered/unclaimed/default 分支', async () => {
    const savedMessage = { id: 'reward-msg-1' };
    const service = {
      _resolveOperatorIdentity: jest.fn((userId) => ({
        userId,
        role: userId === 'child-1' ? 'child' : 'parent'
      })),
      _getUserIdByRole: jest.fn((role) => (role === 'parent' ? 'parent-1' : 'child-1')),
      userService: {
        getCurrentUserId: jest.fn(() => 'parent-1')
      },
      messageRepository: { addMessage: jest.fn().mockResolvedValue(savedMessage) },
      eventBus: { emit: jest.fn() }
    };

    const reward = { id: 'reward-1', name: '动画', points: 10 };
    await expect(messageDomain.createRewardMessageWithDomainModel(service, reward, 'created')).resolves.toBe(savedMessage);
    await expect(messageDomain.createRewardMessageWithDomainModel(service, reward, 'claimed', {
      operatorUserId: 'parent-1',
      exchangeUserId: 'child-1',
      pointsUsed: 5
    })).resolves.toBe(savedMessage);
    await expect(messageDomain.createRewardMessageWithDomainModel(service, reward, 'delivered')).resolves.toBe(savedMessage);
    await expect(messageDomain.createRewardMessageWithDomainModel(service, reward, 'unclaimed', {
      operatorUserId: 'child-1',
      refundedPoints: 6
    })).resolves.toBe(savedMessage);
    await expect(messageDomain.createRewardMessageWithDomainModel(service, reward, 'other')).resolves.toBe(savedMessage);

    expect(service.messageRepository.addMessage).toHaveBeenCalledTimes(5);
  });

  it('message-domain buildTaskLocalMessageMeta 应覆盖 remaining 通知分支和默认分支', () => {
    const service = {
      _resolveOperatorIdentity: jest.fn(() => ({ userId: 'parent-1', role: 'parent' })),
      _getUserIdByRole: jest.fn(() => 'child-1'),
      userService: { getCurrentUserId: jest.fn(() => 'parent-1') }
    };

    expect(messageDomain.buildTaskLocalMessageMeta(service, {
      id: 'task-1',
      title: '刷牙',
      userId: 'child-1'
    }, NotificationType.UPCOMING)).toEqual(expect.objectContaining({ title: '任务即将到期' }));

    expect(messageDomain.buildTaskLocalMessageMeta(service, {
      id: 'task-1',
      title: '刷牙',
      userId: 'child-1'
    }, NotificationType.REQUIRED)).toEqual(expect.objectContaining({ title: '必做任务提醒' }));

    expect(messageDomain.buildTaskLocalMessageMeta(service, {
      id: 'task-1',
      title: '刷牙',
      userId: 'child-1'
    }, NotificationType.DELETED, {
      isBatchOperation: true,
      batchCount: 3
    })).toEqual(expect.objectContaining({ title: '任务已删除' }));

    expect(messageDomain.buildTaskLocalMessageMeta(service, {
      id: 'task-1',
      title: '刷牙',
      userId: 'child-1'
    }, 'unknown')).toEqual(expect.objectContaining({ title: '任务通知' }));
  });
});
