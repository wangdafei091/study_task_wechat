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

  it('去重时应保留不同展示流中的同一 messageEventKey', () => {
    const result = messageDisplay.dedupeMessagesByEventKey([
      {
        id: 'm-user',
        visibilityScope: 'user',
        userId: 'child-1',
        familyId: 'family-1',
        messageEventKey: 'task:create:1',
        syncedToCloud: true,
        createTime: 100
      },
      {
        id: 'm-family',
        visibilityScope: 'family',
        familyId: 'family-1',
        messageEventKey: 'task:create:1',
        syncedToCloud: true,
        createTime: 90
      }
    ]);

    expect(result.map((message) => message.id)).toEqual(['m-user', 'm-family']);
  });

  it('同一日多条消息只有首条显示日期分隔', () => {
    const timeline = messageDisplay.buildTimelineMessages([
      { id: 'm1', createTime: 310 },
      { id: 'm2', createTime: 300 },
      { id: 'm3', createTime: 290 }
    ], {
      formatMessageTime: (createTime) => `time:${createTime}`
    });

    const displayMessages = messageDisplay.recomputeDateDividers(timeline, () => '今天');

    expect(displayMessages.map((message) => message.showDateDivider)).toEqual([true, false, false]);
  });

  it('应正确处理"前天"、"星期X"、"月日"、"跨年"等多种日期格式分隔', () => {
    const timeline = messageDisplay.buildTimelineMessages([
      { id: 'm1', createTime: 1000 },
      { id: 'm2', createTime: 900 },
      { id: 'm3', createTime: 800 },
      { id: 'm4', createTime: 700 },
      { id: 'm5', createTime: 600 }
    ], {
      formatMessageTime: () => ''
    });

    const displayMessages = messageDisplay.recomputeDateDividers(timeline, (createTime) => {
      if (createTime >= 950) return '今天';
      if (createTime >= 850) return '昨天';
      if (createTime >= 750) return '前天';
      if (createTime >= 650) return '星期三';
      return '2025年12月01日';
    });

    expect(displayMessages.map((message) => message.dateDivider)).toEqual([
      '今天', '昨天', '前天', '星期三', '2025年12月01日'
    ]);
    expect(displayMessages.map((message) => message.showDateDivider)).toEqual([
      true, true, true, true, true
    ]);
  });

  it('同一天内多条消息跨不同类型Tab过滤后分隔仍应连续', () => {
    const messages = [
      { id: 'm1', type: 'task', createTime: 500 },
      { id: 'm2', type: 'reward', createTime: 400 },
      { id: 'm3', type: 'task', createTime: 300 },
      { id: 'm4', type: 'task', createTime: 200 }
    ];

    // 模拟按 task 过滤后保留 m1, m3, m4
    const filtered = messages.filter((m) => m.type === 'task');
    const sorted = messageDisplay.sortMessagesByTimeDesc(filtered);

    const displayMessages = messageDisplay.recomputeDateDividers(sorted, (createTime) => {
      if (createTime >= 400) return '今天';
      return '昨天';
    });

    expect(displayMessages.map((message) => message.id)).toEqual(['m1', 'm3', 'm4']);
    // m1=今天, m3=昨天, m4=昨天
    expect(displayMessages.map((message) => message.showDateDivider)).toEqual([true, true, false]);
  });

  it('分页加载更多后应基于扩展序列重新计算日期分隔', () => {
    const allMessages = [
      { id: 'm1', createTime: 500 },
      { id: 'm2', createTime: 400 },
      { id: 'm3', createTime: 300 },
      { id: 'm4', createTime: 200 },
      { id: 'm5', createTime: 100 }
    ];

    // 第一页：只取前2条
    const page1 = allMessages.slice(0, 2);
    const display1 = messageDisplay.recomputeDateDividers(
      messageDisplay.sortMessagesByTimeDesc(page1),
      () => '今天'
    );
    expect(display1.map((message) => message.showDateDivider)).toEqual([true, false]);

    // 第二页：取前4条，其中 m4 和 m5 属于"昨天"
    const page2 = allMessages.slice(0, 4);
    const display2 = messageDisplay.recomputeDateDividers(
      messageDisplay.sortMessagesByTimeDesc(page2),
      (createTime) => (createTime >= 300 ? '今天' : '昨天')
    );
    expect(display2.map((message) => message.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(display2.map((message) => message.showDateDivider)).toEqual([true, false, false, true]);
  });
});
