jest.mock('../../backend/config/database', () => ({
  query: jest.fn(),
  execute: jest.fn()
}));

jest.mock('../../backend/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })
}));

const messageService = require('../../backend/services/messageService');

describe('backend MessageService 任务消息文案', () => {
  it('家长给孩子创建任务时，孩子个人流应显示家长给你安排了任务', () => {
    const content = messageService._buildTaskContent({
      action: 'create',
      taskTitle: '数学',
      actorRole: 'parent',
      actorUserId: 'parent_1',
      actorName: '妈妈',
      subjectName: '爱上',
      subjectUserId: 'child_1'
    });

    expect(content.user.summary).toBe('妈妈给你安排了任务“数学”');
    expect(content.family.summary).toBe('妈妈给爱上创建了任务“数学”');
  });

  it('共享设备孩子视角完成任务时，家庭流应显示孩子完成了任务', () => {
    const content = messageService._buildTaskContent({
      action: 'complete',
      taskTitle: '数学',
      actorRole: 'child',
      actorUserId: 'child_1',
      actorName: '爱上',
      subjectName: '爱上',
      subjectUserId: 'child_1'
    });

    expect(content.user.summary).toBe('你完成了任务“数学”');
    expect(content.family.summary).toBe('爱上完成了任务“数学”');
  });

  it('家长自己视角代孩子完成任务时，家庭流应显示代操作文案', () => {
    const content = messageService._buildTaskContent({
      action: 'complete',
      taskTitle: '数学',
      actorRole: 'parent',
      actorUserId: 'parent_1',
      actorName: '家长',
      subjectName: '爱上',
      subjectUserId: 'child_1'
    });

    expect(content.user.summary).toBe('家长代你完成了任务“数学”');
    expect(content.family.summary).toBe('家长代爱上完成了任务“数学”');
  });
});
