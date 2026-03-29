const messageDisplay = require('../../utils/message-display');

describe('utils/message-display', () => {
  it('首页预览应按未读优先、时间倒序取前 3 条', () => {
    const result = messageDisplay.buildPreviewMessages([
      { id: 'm1', isRead: true, createTime: 5 },
      { id: 'm2', isRead: false, createTime: 2 },
      { id: 'm3', isRead: false, createTime: 8 },
      { id: 'm4', isRead: false, createTime: 3 },
      { id: 'm5', isRead: true, createTime: 10 }
    ], {
      limit: 3,
      formatMessageTime: (createTime) => `t:${createTime}`
    });

    expect(result.map((message) => message.id)).toEqual(['m3', 'm4', 'm2']);
    expect(result.map((message) => message.timeDisplay)).toEqual(['t:8', 't:3', 't:2']);
  });

  it('消息中心时间线应按时间倒序并重算日期分隔', () => {
    const timeline = messageDisplay.buildTimelineMessages([
      { id: 'm1', createTime: 100 },
      { id: 'm2', createTime: 300 },
      { id: 'm3', createTime: 200 }
    ], {
      formatMessageTime: (createTime) => `time:${createTime}`
    });

    const displayMessages = messageDisplay.recomputeDateDividers(timeline, (createTime) => {
      if (createTime >= 250) return '今天';
      if (createTime >= 150) return '昨天';
      return '更早';
    });

    expect(displayMessages.map((message) => message.id)).toEqual(['m2', 'm3', 'm1']);
    expect(displayMessages.map((message) => message.showDateDivider)).toEqual([true, true, true]);
    expect(displayMessages.map((message) => message.dateDivider)).toEqual(['今天', '昨天', '更早']);
  });
});
