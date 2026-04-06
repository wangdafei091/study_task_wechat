const {
  NotificationType,
  MessageVisibilityScope
} = require('../../models/message');
const { EVENTS } = require('../../utils/constants');
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
    listenerMap.taskCreated({ id: 'task-1' });
    listenerMap.rewardClaimed({ id: 'reward-1' });

    expect(service._handleTaskCreated).toHaveBeenCalledWith({ id: 'task-1' });
    expect(service._handleRewardClaimed).toHaveBeenCalledWith({ id: 'reward-1' });
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
});
