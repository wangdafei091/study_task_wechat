jest.mock('../../services/service-manager.js', () => ({
  getService: jest.fn(),
  getTaskService: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const serviceManager = require('../../services/service-manager.js');
const taskActions = require('../../pages/index/modules/index-task-actions');

describe('pages/index/modules/index-task-actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    global.wx = {
      showModal: jest.fn(({ success }) => {
        if (typeof success === 'function') {
          success({ confirm: true, cancel: false });
        }
      }),
      showToast: jest.fn(),
      vibrateShort: jest.fn()
    };

    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getLoginUserId: jest.fn(() => 'parent-1')
        }
      }
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.wx;
    delete global.getApp;
  });

  function createPage(taskOverrides = {}) {
    const progressBar = { playAnimation: jest.fn() };
    return {
      data: {
        processingTaskId: null,
        currentUser: { id: 'child-1' },
        isViewingFuture: false,
        tasks: [{
          id: 'task-1',
          title: '任务1',
          status: 0,
          points: 5,
          starAwarded: false,
          isRequired: false,
          userId: 'child-1',
          completionTime: Date.now(),
          ...taskOverrides
        }]
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      refreshTaskDataForCurrentView: jest.fn().mockResolvedValue(),
      loadMessageData: jest.fn().mockResolvedValue(),
      loadStarsAndRewards: jest.fn().mockResolvedValue(),
      checkRewardUnlock: jest.fn().mockResolvedValue(),
      transitionToNewTarget: jest.fn(),
      selectComponent: jest.fn(() => progressBar),
      _progressBar: progressBar
    };
  }

  it('无真实奖励时仍应允许完成任务并继续刷新奖励反馈', async () => {
    const taskService = {
      completeTask: jest.fn().mockResolvedValue({ success: true }),
      resetTask: jest.fn()
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') return taskService;
      return null;
    });

    const page = createPage();
    await taskActions.completeTask(page, { detail: { taskId: 'task-1' } });

    expect(page.data.processingTaskId).toBe(null);
    expect(taskService.completeTask).toHaveBeenCalledWith('task-1', 'child-1');
    expect(page.refreshTaskDataForCurrentView).toHaveBeenCalled();
    expect(page.loadMessageData).not.toHaveBeenCalled();
    expect(page.checkRewardUnlock).toHaveBeenCalled();
    expect(global.wx.showModal).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '需要设置奖励'
    }));
  });

  it('奖励已兑换导致锁定时应阻止取消完成', async () => {
    const rewardService = {
      getLastExchangeTimeByUser: jest.fn().mockResolvedValue(200)
    };
    const taskService = {
      completeTask: jest.fn(),
      resetTask: jest.fn()
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      if (name === 'task') return taskService;
      return null;
    });

    const page = createPage({
      status: 1,
      starAwarded: true,
      completionTime: 100
    });
    await taskActions.completeTask(page, { detail: { taskId: 'task-1' } });

    expect(taskService.resetTask).not.toHaveBeenCalled();
    expect(global.wx.showModal).toHaveBeenCalledWith(expect.objectContaining({
      title: '无法取消完成'
    }));
  });

  it('完成任务成功后应刷新任务并检查奖励解锁', async () => {
    const taskService = {
      completeTask: jest.fn().mockResolvedValue({ success: true })
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') return taskService;
      return null;
    });

    const page = createPage();
    await taskActions.completeTask(page, { detail: { taskId: 'task-1' } });
    jest.runAllTimers();

    expect(taskService.completeTask).toHaveBeenCalledWith('task-1', 'child-1');
    expect(page.refreshTaskDataForCurrentView).toHaveBeenCalled();
    expect(page.loadMessageData).not.toHaveBeenCalled();
    expect(page.checkRewardUnlock).toHaveBeenCalled();
    expect(page._progressBar.playAnimation).toHaveBeenCalledWith('complete');
  });

  it('taskItemStatusToggle 应调用 taskService 并在失败时提示', async () => {
    const taskService = {
      updateTaskStatus: jest.fn().mockResolvedValue()
    };
    serviceManager.getTaskService.mockReturnValue(taskService);

    const page = createPage();
    await taskActions.taskItemStatusToggle(page, {
      detail: { id: 'task-1', newStatus: 1 }
    });

    expect(taskService.updateTaskStatus).toHaveBeenCalledWith('task-1', 1);
    expect(page.transitionToNewTarget).toHaveBeenCalled();
    expect(page.refreshTaskDataForCurrentView).toHaveBeenCalled();

    taskService.updateTaskStatus.mockRejectedValueOnce(new Error('fail'));
    await taskActions.taskItemStatusToggle(page, {
      detail: { id: 'task-1', newStatus: 0 }
    });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '操作失败'
    }));
  });

  it('未来日期下应阻止完成和切换任务状态', async () => {
    const taskService = {
      completeTask: jest.fn(),
      resetTask: jest.fn(),
      updateTaskStatus: jest.fn()
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') return taskService;
      return null;
    });
    serviceManager.getTaskService.mockReturnValue(taskService);

    const page = createPage();
    page.data.isViewingFuture = true;

    await taskActions.completeTask(page, { detail: { taskId: 'task-1' } });
    expect(taskService.completeTask).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '未来日期仅支持查看'
    }));

    global.wx.showToast.mockClear();
    await taskActions.taskItemStatusToggle(page, {
      detail: { id: 'task-1', newStatus: 1 }
    });
    expect(taskService.updateTaskStatus).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '未来日期仅支持查看'
    }));
  });

  it('孩子或家长切到孩子视角时，今日与历史任务仍允许打卡', async () => {
    const taskService = {
      completeTask: jest.fn().mockResolvedValue({ success: true }),
      resetTask: jest.fn()
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') return taskService;
      return null;
    });

    const page = createPage();
    page.data.isReadonlyView = true;

    await taskActions.completeTask(page, { detail: { taskId: 'task-1' } });

    expect(taskService.completeTask).toHaveBeenCalledWith('task-1', 'child-1');
    expect(global.wx.showToast).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '请在自己设备上操作'
    }));
  });

  it('completeTask 应覆盖空任务、重复点击、取消确认和失败结果分支', async () => {
    const rewardService = {
      getLastExchangeTimeByUser: jest.fn().mockResolvedValue(null)
    };
    const taskService = {
      completeTask: jest.fn().mockResolvedValue({ success: false, message: '失败了' }),
      resetTask: jest.fn()
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'rewardService') return rewardService;
      if (name === 'task') return taskService;
      return null;
    });

    const page = createPage();
    await taskActions.completeTask(page, { detail: { taskId: null } });

    page.data.processingTaskId = 'task-1';
    await taskActions.completeTask(page, { detail: { taskId: 'task-1' } });

    page.data.processingTaskId = null;
    page.data.tasks = [];
    await taskActions.completeTask(page, { detail: { taskId: 'task-1' } });
    expect(page.data.processingTaskId).toBe(null);

    page.data.tasks = [{
      id: 'task-1',
      title: '任务1',
      status: 1,
      points: 5,
      starAwarded: true,
      isRequired: false,
      userId: 'child-1',
      completionTime: Date.now()
    }];
    global.wx.showModal.mockImplementationOnce(({ success }) => success({ confirm: false, cancel: true }));
    await taskActions.completeTask(page, { detail: { taskId: 'task-1' } });
    expect(taskService.resetTask).not.toHaveBeenCalled();

    page.data.tasks[0].status = 0;
    await taskActions.completeTask(page, { detail: { taskId: 'task-1' } });
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '失败了'
    }));
  });

  it('必做任务和已获星任务完成后应分别走不同反馈分支', async () => {
    const taskService = {
      completeTask: jest.fn().mockResolvedValue({ success: true })
    };
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') return taskService;
      return null;
    });

    const requiredPage = createPage({ isRequired: true });
    await taskActions.completeTask(requiredPage, { detail: { taskId: 'task-1' } });
    expect(requiredPage.loadMessageData).not.toHaveBeenCalled();
    expect(requiredPage.loadStarsAndRewards).toHaveBeenCalled();

    const awardedPage = createPage({ starAwarded: true });
    await taskActions.completeTask(awardedPage, { detail: { taskId: 'task-1' } });
    expect(awardedPage.loadMessageData).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '已获得过星星'
    }));
  });
});
