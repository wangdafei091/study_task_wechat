jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../services/service-manager', () => ({
  getService: jest.fn(),
  getUserService: jest.fn()
}));

jest.mock('../../utils/dateUtils', () => ({
  getTodayString: jest.fn(() => '2026-04-17')
}));

describe('pages/task-record/task-record', () => {
  let pageConfig;
  let serviceManager;
  let taskService;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/task-record/task-record.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    serviceManager = require('../../services/service-manager');
    taskService = {
      getOccurrenceTasks: jest.fn().mockResolvedValue([
        { id: 'occ_cfg_1', title: '听写全对', type: 'study', points: 2 }
      ]),
      getOccurrenceRecordsByDateRange: jest.fn().mockResolvedValue([
        {
          id: 'occ_record_1',
          parentTaskId: 'occ_cfg_1',
          occurrenceOutcome: 'success',
          pendingSyncMeta: {
            action: 'occurrence_record'
          },
          syncedToCloud: false
        }
      ]),
      recordOccurrenceResult: jest.fn().mockResolvedValue({ success: true })
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') {
        return taskService;
      }
      return null;
    });

    global.getApp = jest.fn(() => ({
      globalData: {
        lastActiveChildId: 'child_1',
        userService: {
          getLoginUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent' })),
          getCurrentUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent' })),
          getAllUsers: jest.fn(() => [
            { userId: 'parent_1', role: 'parent', name: '家长' },
            { userId: 'child_1', role: 'child', name: '小明' }
          ])
        }
      }
    }));
    global.wx = {
      showToast: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('onLoad 应加载指定日期的表现项和记录结果', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, { date: '2026-04-16' });

    expect(taskService.getOccurrenceTasks).toHaveBeenCalledWith({
      date: '2026-04-16',
      userId: 'child_1'
    });
    expect(taskService.getOccurrenceRecordsByDateRange).toHaveBeenCalledWith({
      startDate: '2026-04-16',
      endDate: '2026-04-16',
      userId: 'child_1'
    });
    expect(page.data.items[0]).toEqual(expect.objectContaining({
      id: 'occ_cfg_1',
      outcome: 'success',
      isPendingSync: true,
      resultText: '待同步：达成',
      resultTone: 'pending'
    }));
  });

  it('onLoad 遇到未来日期时应回退到今天', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, { date: '2026-04-20' });

    expect(page.data.date).toBe('2026-04-17');
    expect(taskService.getOccurrenceTasks).toHaveBeenCalledWith({
      date: '2026-04-17',
      userId: 'child_1'
    });
  });

  it('onRecordTap 应区分 fallback 与正式成功提示，并刷新列表', async () => {
    const page = createPageInstance();
    page.loadItems = jest.fn().mockResolvedValue();
    page.data.targetUserId = 'child_1';
    page.data.date = '2026-04-17';
    taskService.recordOccurrenceResult
      .mockResolvedValueOnce({ success: true, fallback: true })
      .mockResolvedValueOnce({ success: true });

    await page.onRecordTap.call(page, {
      currentTarget: {
        dataset: {
          taskId: 'occ_cfg_1',
          outcome: 'success'
        }
      }
    });

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '已暂存，等待同步',
      icon: 'none'
    }));

    await page.onRecordTap.call(page, {
      currentTarget: {
        dataset: {
          taskId: 'occ_cfg_1',
          outcome: 'failure'
        }
      }
    });

    expect(taskService.recordOccurrenceResult).toHaveBeenCalledWith('occ_cfg_1', {
      userId: 'child_1',
      date: '2026-04-17',
      outcome: 'failure'
    });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '已记为未达成',
      icon: 'success'
    }));
    expect(page.loadItems).toHaveBeenCalled();
  });
});
