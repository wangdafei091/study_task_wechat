jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const logger = require('../../utils/logger');
const EventBus = require('../../utils/core/event-bus');

describe('utils/core/event-bus no-listener logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('应将可选事件的无监听器日志降级为 info', () => {
    const eventBus = new EventBus();

    const count = eventBus.emit('user:switched', { currentUserId: 'parent-1' });

    expect(count).toBe(0);
    expect(logger.info).toHaveBeenCalledWith('EventBus', '事件没有监听器: user:switched');
    expect(logger.warn).not.toHaveBeenCalledWith('EventBus', '事件没有监听器: user:switched');
  });

  it('应继续对普通事件的无监听器场景记录 warn', () => {
    const eventBus = new EventBus();

    const count = eventBus.emit('task:changed', { taskId: 'task-1' });

    expect(count).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith('EventBus', '事件没有监听器: task:changed');
  });
});
