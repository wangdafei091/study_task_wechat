jest.mock('../../config/database', () => ({
  query: jest.fn(),
  execute: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const Message = require('../../models/Message');

describe('backend MessageService archived query contract', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('getMessages 应默认排除 archived 消息', async () => {
    const { query } = require('../../config/database');
    query.mockResolvedValue([]);
    const service = require('../../services/messageService');

    await service.getMessages('family', {
      userId: 'parent_1',
      role: 'parent',
      familyId: 'family_1'
    });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain('deleted_at IS NULL AND is_archived = 0');
  });

  it('markAllAsRead 应默认跳过 archived 消息', async () => {
    const { execute } = require('../../config/database');
    execute.mockResolvedValue({ affectedRows: 0 });
    const service = require('../../services/messageService');

    await service.markAllAsRead('family', {
      userId: 'parent_1',
      role: 'parent',
      familyId: 'family_1'
    }, {
      readTime: 1234567890
    });

    const [sql] = execute.mock.calls[0];
    expect(sql).toContain('AND is_archived = 0');
  });
});

describe('backend MessageService task required copy', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('required/unrequired/penalty/upcoming/makeup_complete 应生成可辨识的任务文案', async () => {
    const service = require('../../services/messageService');

    const requiredContent = service._buildTaskContent({
      action: 'required',
      taskTitle: '背单词',
      actorRole: 'parent',
      actorUserId: 'parent_1',
      actorName: '妈妈',
      subjectName: '小明',
      subjectUserId: 'child_1'
    });
    const unrequiredContent = service._buildTaskContent({
      action: 'unrequired',
      taskTitle: '背单词',
      actorRole: 'parent',
      actorUserId: 'parent_1',
      actorName: '妈妈',
      subjectName: '小明',
      subjectUserId: 'child_1'
    });
    const penaltyContent = service._buildTaskContent({
      action: 'penalty',
      taskTitle: '背单词',
      actorRole: 'system',
      actorUserId: null,
      actorName: null,
      subjectName: '小明',
      subjectUserId: 'child_1',
      penaltyPoints: 3
    });
    const makeupContent = service._buildTaskContent({
      action: 'makeup_complete',
      taskTitle: '背单词',
      actorRole: 'child',
      actorUserId: 'child_1',
      actorName: '小明',
      subjectName: '小明',
      subjectUserId: 'child_1',
      refundPoints: 3
    });
    const upcomingContent = service._buildTaskContent({
      action: 'upcoming',
      taskTitle: '背单词',
      actorRole: 'system',
      actorUserId: null,
      actorName: null,
      subjectName: '小明',
      subjectUserId: 'child_1',
      upcomingMeta: {
        remainingText: '30分钟',
        isRequired: true
      }
    });

    expect(requiredContent.user.summary).toContain('设为必做');
    expect(requiredContent.family.summary).toContain('设为必做');
    expect(unrequiredContent.user.summary).toContain('取消');
    expect(unrequiredContent.family.summary).toContain('取消');
    expect(penaltyContent.user.summary).toContain('扣除3颗星星');
    expect(penaltyContent.family.summary).toContain('扣除3颗星星');
    expect(makeupContent.user.summary).toContain('逾期后补做');
    expect(makeupContent.user.summary).toContain('退回3颗星星');
    expect(makeupContent.family.summary).toContain('退回3颗星星');
    expect(upcomingContent.user.title).toContain('必做任务');
    expect(upcomingContent.user.summary).toContain('30分钟');
    expect(upcomingContent.family.summary).toContain('小明');
  });

  it('全天任务的 upcoming 文案应显示开始日期而不是错误倒计时', async () => {
    const service = require('../../services/messageService');
    const upcomingContent = service._buildTaskContent({
      action: 'upcoming',
      taskTitle: '整理书包',
      actorRole: 'system',
      actorUserId: null,
      actorName: null,
      subjectName: '小明',
      subjectUserId: 'child_1',
      upcomingMeta: {
        isAllDay: true,
        isRequired: false,
        dayLabel: '明天',
        remainingText: '4小时'
      }
    });

    expect(upcomingContent.user.summary).toContain('明天开始');
    expect(upcomingContent.user.summary).not.toContain('4小时');
    expect(upcomingContent.family.summary).toContain('明天开始');
  });

  it('重复任务父任务 create 应聚合为多天任务计划，重复实例不应单独产生日志消息', async () => {
    const { query } = require('../../config/database');
    query
      .mockResolvedValueOnce([{ nickname: '妈妈', role: 'parent' }])
      .mockResolvedValueOnce([{ nickname: '小明', role: 'child' }]);

    const service = require('../../services/messageService');
    const parentRecords = await service._buildTaskMessageRecords({
      task: {
        taskId: 'task_plan_1',
        userId: 'child_1',
        title: '背单词',
        date: '2026-03-29',
        repeat: {
          type: 'daily',
          startDate: '2026-03-29',
          endDate: '2026-04-02'
        },
        parentTaskId: null,
        modifyTime: 123
      },
      familyId: 'family_1',
      action: 'create',
      actorUserId: 'parent_1',
      actorRole: 'parent',
      operationKey: 'op_task_plan_1'
    });

    expect(parentRecords).toHaveLength(2);
    expect(parentRecords[0].title).toBe('多天任务计划：背单词');
    expect(parentRecords[0].summary).toContain('多天任务计划“背单词”');
    expect(parentRecords[0].summary).toContain('2026-03-29至2026-04-02');
    expect(parentRecords[1].title).toBe('多天任务计划：背单词');

    const childRecords = await service._buildTaskMessageRecords({
      task: {
        taskId: 'task_plan_1_child',
        userId: 'child_1',
        title: '背单词',
        date: '2026-03-30',
        repeat: {
          type: 'daily',
          startDate: '2026-03-29',
          endDate: '2026-04-02'
        },
        parentTaskId: 'task_plan_1',
        modifyTime: 124
      },
      familyId: 'family_1',
      action: 'create',
      actorUserId: 'parent_1',
      actorRole: 'parent',
      operationKey: 'op_task_plan_1_child'
    });

    expect(childRecords).toEqual([]);
  });

  it('task complete 标题应带任务名，便于列表识别', async () => {
    const service = require('../../services/messageService');
    const completeContent = service._buildTaskContent({
      action: 'complete',
      taskTitle: '数学作业',
      actorRole: 'child',
      actorUserId: 'child_1',
      actorName: '小明',
      subjectName: '小明',
      subjectUserId: 'child_1'
    });

    expect(completeContent.user.title).toBe('完成任务：数学作业');
    expect(completeContent.family.title).toBe('完成任务：数学作业');
    expect(completeContent.user.summary).toBe('你完成了任务“数学作业”');
  });

  it('task history_complete 应明确是历史补打卡并带任务日期', async () => {
    const service = require('../../services/messageService');
    const historyContent = service._buildTaskContent({
      action: 'history_complete',
      taskTitle: '数学作业',
      actorRole: 'child',
      actorUserId: 'child_1',
      actorName: '小明',
      subjectName: '小明',
      subjectUserId: 'child_1',
      task: {
        date: '2026-04-07'
      }
    });

    expect(historyContent.user.title).toBe('补打卡完成：数学作业');
    expect(historyContent.user.summary).toContain('2026-04-07');
    expect(historyContent.user.summary).toContain('补打卡完成');
    expect(historyContent.family.summary).toContain('2026-04-07');
  });

  it('task assign 应使用分配语义，避免与任务创建混淆', async () => {
    const service = require('../../services/messageService');
    const assignContent = service._buildTaskContent({
      action: 'assign',
      taskTitle: '数学作业',
      actorRole: 'parent',
      actorUserId: 'parent_1',
      actorName: '妈妈',
      subjectName: '小明',
      subjectUserId: 'child_1'
    });

    expect(assignContent.user.title).toBe('任务已分配：数学作业');
    expect(assignContent.user.summary).toBe('妈妈给你分配了任务“数学作业”');
    expect(assignContent.family.summary).toBe('妈妈给小明分配了任务“数学作业”');
  });

  it('重复任务子实例 assign 不应单独产生日志消息', async () => {
    const { query } = require('../../config/database');
    query
      .mockResolvedValueOnce([{ nickname: '妈妈', role: 'parent' }])
      .mockResolvedValueOnce([{ nickname: '小明', role: 'child' }]);

    const service = require('../../services/messageService');
    const childRecords = await service._buildTaskMessageRecords({
      task: {
        taskId: 'task_plan_1_child',
        userId: 'child_1',
        title: '背单词',
        date: '2026-03-30',
        repeat: {
          type: 'daily',
          startDate: '2026-03-29',
          endDate: '2026-04-02'
        },
        parentTaskId: 'task_plan_1',
        modifyTime: 124
      },
      familyId: 'family_1',
      action: 'assign',
      actorUserId: 'parent_1',
      actorRole: 'parent',
      operationKey: 'op_task_assign_1_child'
    });

    expect(childRecords).toEqual([]);
  });

  it('task create/update/required/unrequired 应归档同任务旧未读折叠消息', async () => {
    const { execute } = require('../../config/database');
    execute.mockResolvedValue({ affectedRows: 1 });
    const service = require('../../services/messageService');

    await service._archiveFoldableMessages([
      new Message({
        messageId: 'msg_new_task_update',
        messageEventKey: 'task:task_1:task_update:child_1:parent_1:op_2',
        visibilityScope: 'user',
        type: 'task',
        notificationType: 'task_update',
        relatedId: 'task_1',
        relatedType: 'task',
        userId: 'child_1',
        title: '任务已更新：数学',
        summary: '妈妈更新了你的任务“数学”'
      })
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params] = execute.mock.calls[0];
    expect(sql).toContain('SET is_archived = 1');
    expect(sql).toContain('AND is_read = 0');
    expect(sql).toContain('AND notification_type IN (?, ?, ?, ?)');
    expect(params).toEqual([
      'task_1',
      'task',
      'task_create',
      'task_update',
      'task_required',
      'task_unrequired',
      'user',
      'task:task_1:task_update:child_1:parent_1:op_2',
      'child_1'
    ]);
  });
});

describe('backend MessageService reward maintenance fan-out', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('create/update/delete 应生成家庭流 + 每个孩子个人流', async () => {
    const { query } = require('../../config/database');
    query
      .mockResolvedValueOnce([{ nickname: '妈妈', role: 'parent' }])
      .mockResolvedValueOnce([
        { user_id: 'child_1', nickname: '小明', role: 'child' },
        { user_id: 'child_2', nickname: '小红', role: 'child' }
      ]);

    const service = require('../../services/messageService');
    const records = await service._buildRewardMessageRecords({
      reward: {
        rewardId: 'reward_1',
        name: '冰淇淋',
        points: 20,
        modifyTime: 123
      },
      familyId: 'family_1',
      action: 'update',
      actorUserId: 'parent_1',
      actorRole: 'parent',
      operationKey: 'op_reward_1'
    });

    expect(records).toHaveLength(3);
    expect(records.filter((record) => record.visibilityScope === 'family')).toHaveLength(1);
    expect(records.filter((record) => record.visibilityScope === 'user')).toHaveLength(2);
    expect(records[0].summary).toContain('当前需要20颗星星兑换');
    expect(records[1].title).toBe('奖励池调整');
    expect(records[1].summary).toContain('更新了奖励“冰淇淋”');
  });

  it('孩子个人流的 messageEventKey 应包含各自 subjectUserId，避免唯一键冲突', async () => {
    const { query } = require('../../config/database');
    query
      .mockResolvedValueOnce([{ nickname: '妈妈', role: 'parent' }])
      .mockResolvedValueOnce([
        { user_id: 'child_1', nickname: '小明', role: 'child' },
        { user_id: 'child_2', nickname: '小红', role: 'child' }
      ]);

    const service = require('../../services/messageService');
    const records = await service._buildRewardMessageRecords({
      reward: {
        rewardId: 'reward_1',
        name: '冰淇淋',
        points: 20,
        modifyTime: 123
      },
      familyId: 'family_1',
      action: 'update',
      actorUserId: 'parent_1',
      actorRole: 'parent',
      operationKey: 'op_reward_1'
    });

    const userRecords = records.filter((record) => record.visibilityScope === 'user');
    expect(userRecords).toHaveLength(2);
    expect(new Set(userRecords.map((record) => record.messageEventKey)).size).toBe(2);
    expect(userRecords[0].messageEventKey).toContain('child_1');
    expect(userRecords[1].messageEventKey).toContain('child_2');
  });

  it('reward create/update 应按 scope 归档旧未读配置消息，不影响其他 scope', async () => {
    const { execute } = require('../../config/database');
    execute.mockResolvedValue({ affectedRows: 1 });
    const service = require('../../services/messageService');

    await service._archiveFoldableMessages([
      new Message({
        messageId: 'msg_reward_family_2',
        familyId: 'family_1',
        messageEventKey: 'reward:reward_1:reward_update:none:parent_1:op_2',
        visibilityScope: 'family',
        type: 'reward',
        notificationType: 'reward_update',
        relatedId: 'reward_1',
        relatedType: 'reward',
        title: '奖励已更新',
        summary: '家长更新了奖励“冰淇淋”'
      }),
      new Message({
        messageId: 'msg_reward_child_2',
        familyId: 'family_1',
        userId: 'child_1',
        messageEventKey: 'reward:reward_1:reward_update:child_1:parent_1:op_2',
        visibilityScope: 'user',
        type: 'reward',
        notificationType: 'reward_update',
        relatedId: 'reward_1',
        relatedType: 'reward',
        title: '奖励池调整',
        summary: '家长更新了奖励“冰淇淋”'
      })
    ]);

    expect(execute).toHaveBeenCalledTimes(2);
    const [familySql, familyParams] = execute.mock.calls[0];
    const [userSql, userParams] = execute.mock.calls[1];

    expect(familySql).toContain('AND family_id = ?');
    expect(familyParams).toEqual([
      'reward_1',
      'reward',
      'reward_create',
      'reward_update',
      'family',
      'reward:reward_1:reward_update:none:parent_1:op_2',
      'family_1'
    ]);

    expect(userSql).toContain('AND user_id = ?');
    expect(userParams).toEqual([
      'reward_1',
      'reward',
      'reward_create',
      'reward_update',
      'user',
      'reward:reward_1:reward_update:child_1:parent_1:op_2',
      'child_1'
    ]);
  });

  it('task update 到来时应允许归档旧的 task create 消息，保留最终配置态', async () => {
    const { execute } = require('../../config/database');
    execute.mockResolvedValue({ affectedRows: 1 });
    const service = require('../../services/messageService');

    await service._archiveFoldableMessages([
      new Message({
        messageId: 'msg_new_task_required',
        familyId: 'family_1',
        messageEventKey: 'task:task_2:task_required:child_1:parent_1:op_3',
        visibilityScope: 'family',
        type: 'task',
        notificationType: 'task_required',
        relatedId: 'task_2',
        relatedType: 'task',
        title: '任务已设为必做：英语',
        summary: '妈妈将小明的任务“英语”设为必做'
      })
    ]);

    const [, params] = execute.mock.calls[0];
    expect(params.slice(0, 6)).toEqual([
      'task_2',
      'task',
      'task_create',
      'task_update',
      'task_required',
      'task_unrequired'
    ]);
  });
});

describe('backend MessageService star expiring reminders', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('应生成孩子个人流和家庭流的 star_expiring 正式消息，且类型保持 system', async () => {
    const { query } = require('../../config/database');
    query.mockResolvedValueOnce([{ nickname: '小明', role: 'child' }]);

    const service = require('../../services/messageService');
    const records = await service._buildStarMessageRecords({
      familyId: 'family_1',
      action: 'expiring',
      subjectUserId: 'child_1',
      operationKey: '2026-04-02',
      points: 8,
      expiryDate: '2026-04-02',
      expiryDateText: '2026-04-02',
      daysUntilExpiry: 2,
      createTimeOverride: 12345
    });

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.visibilityScope).sort()).toEqual(['family', 'user']);
    expect(records.every((record) => record.type === 'system')).toBe(true);
    expect(records.every((record) => record.notificationType === 'star_expiring')).toBe(true);
    expect(records[0].messageEventKey).toBe('star:summary:star_expiring:child_1:none:2026-04-02');
    expect(records[0].content).toContain('"reminderCategory":"stars_expiring"');
  });

  it('应生成按到期日聚合的 star_expired 正式消息', async () => {
    const { query } = require('../../config/database');
    query.mockResolvedValueOnce([{ nickname: '小明', role: 'child' }]);

    const service = require('../../services/messageService');
    const records = await service._buildStarMessageRecords({
      familyId: 'family_1',
      action: 'expired',
      subjectUserId: 'child_1',
      operationKey: '2026-04-02',
      points: 8,
      expiryDate: '2026-04-02',
      expiryDateText: '2026-04-02',
      createTimeOverride: 12345
    });

    expect(records).toHaveLength(2);
    expect(records.every((record) => record.notificationType === 'star_expired')).toBe(true);
    expect(records[0].messageEventKey).toBe('star:summary:star_expired:child_1:none:2026-04-02');
    expect(records[0].summary).toContain('已于2026-04-02到期并扣除');
  });
});

describe('backend MessageService reward copy', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('unclaim 应生成孩子个人流 + 家庭流，避免真实接口只留下家庭消息', async () => {
    const { query } = require('../../config/database');
    query
      .mockResolvedValueOnce([{ nickname: '小明', role: 'child' }])
      .mockResolvedValueOnce([{ nickname: '小明', role: 'child' }]);

    const service = require('../../services/messageService');
    const records = await service._buildRewardMessageRecords({
      reward: {
        rewardId: 'reward_1',
        name: '冰淇淋',
        points: 20,
        exchangeUserId: 'child_1',
        modifyTime: 123
      },
      familyId: 'family_1',
      action: 'unclaim',
      actorUserId: 'child_1',
      actorRole: 'child',
      exchangeUserId: 'child_1',
      operationKey: 'op_reward_unclaim_1',
      pointsOverride: 20
    });

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.visibilityScope).sort()).toEqual(['family', 'user']);
    expect(records.find((record) => record.visibilityScope === 'user').userId).toBe('child_1');
    expect(records.find((record) => record.visibilityScope === 'family').subjectUserId).toBe('child_1');
  });

  it('孩子自己取消兑换时，家庭流和个人流文案应保持阅读者视角正确', async () => {
    const service = require('../../services/messageService');
    const content = service._buildRewardContent({
      action: 'unclaim',
      rewardName: '冰淇淋',
      actorRole: 'child',
      actorUserId: 'child_1',
      actorName: '小明',
      subjectName: '小明',
      subjectUserId: 'child_1',
      points: 20
    });

    expect(content.user.title).toBe('奖励兑换已取消');
    expect(content.user.summary).toBe('你已取消兑换奖励“冰淇淋”，已退回20颗星星');
    expect(content.family.summary).toBe('小明取消了奖励“冰淇淋”的兑换，已退回20颗星星');
  });

  it('家长代孩子兑换时，孩子个人流文案应明确是家长代兑', async () => {
    const service = require('../../services/messageService');
    const content = service._buildRewardContent({
      action: 'exchange',
      rewardName: '冰淇淋',
      actorRole: 'parent',
      actorUserId: 'parent_1',
      actorName: '妈妈',
      subjectName: '小明',
      subjectUserId: 'child_1',
      points: 20
    });

    expect(content.user.summary).toBe('妈妈为你兑换了奖励“冰淇淋”');
    expect(content.family.summary).toBe('妈妈为小明兑换了奖励“冰淇淋”');
  });

  it('家长代孩子取消兑换时，孩子个人流文案应明确是家长代取消', async () => {
    const service = require('../../services/messageService');
    const content = service._buildRewardContent({
      action: 'unclaim',
      rewardName: '冰淇淋',
      actorRole: 'parent',
      actorUserId: 'parent_1',
      actorName: '妈妈',
      subjectName: '小明',
      subjectUserId: 'child_1',
      points: 20
    });

    expect(content.user.summary).toBe('妈妈取消了你兑换的奖励“冰淇淋”，已退回20颗星星');
    expect(content.family.summary).toBe('妈妈取消了小明兑换的奖励“冰淇淋”，已退回20颗星星');
  });
});
