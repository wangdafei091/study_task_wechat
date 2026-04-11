jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/uiUtils', () => ({
  logUIOptimization: jest.fn(),
  logButtonLayoutOptimization: jest.fn(),
  logStyleConsistency: jest.fn()
}));

jest.mock('../../services/service-manager.js', () => ({
  getUserService: jest.fn(),
  getService: jest.fn()
}));

jest.mock('../../utils/page-storage-helper', () => ({}));
jest.mock('../../utils/permission-utils', () => ({}));

describe('pages/task-edit/task-edit', () => {
  let pageConfig;
  let serviceManager;
  let taskTemplateEntry;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/task-edit/task-edit.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      initHeatmapMonth: jest.fn(),
      initDateTimeData: jest.fn(),
      loadAllTasks: jest.fn(),
      loadRecentTaskTemplates: jest.fn(),
      generateRepeatPreviewText: jest.fn(() => '每天')
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    serviceManager = require('../../services/service-manager.js');
    taskTemplateEntry = require('../../pages/task-edit/modules/task-template-entry');

    global.getApp = jest.fn(() => ({
      globalData: {}
    }));
    global.wx = {
      hideLoading: jest.fn(),
      showLoading: jest.fn(),
      showToast: jest.fn(),
      navigateBack: jest.fn(),
      navigateTo: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('家长切到孩子视角时应拦截进入任务编辑页', () => {
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent' })),
      getCurrentUser: jest.fn(() => ({ userId: 'child-1', role: 'child' }))
    });

    const page = createPageInstance();
    page.onLoad.call(page, { mode: 'create', targetUserId: 'child-1' });

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '暂无操作权限',
      icon: 'none'
    }));
    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
    expect(page.setData).not.toHaveBeenCalledWith(expect.objectContaining({
      targetUserId: 'child-1'
    }));
    expect(page.loadAllTasks).not.toHaveBeenCalled();
  });

  it('onLoad 不应重复触发任务加载，交由 onShow 统一刷新', () => {
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent' })),
      getCurrentUser: jest.fn(() => ({ userId: 'parent-1', role: 'parent' }))
    });

    const page = createPageInstance();
    page.onLoad.call(page, {});

    expect(page.loadAllTasks).not.toHaveBeenCalled();
    expect(page.data.targetUserId).toBe('');
  });

  it('applyTemplateSelection 应把模板映射到 task-edit 表单状态', () => {
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'taskTemplate') {
        return {
          applyTemplateToTaskForm: jest.fn(() => ({
            formPatch: {
              newTask: {
                title: '晚间阅读',
                repeat: {
                  type: 'daily'
                }
              },
              repeatText: '每天',
              reminderText: '提前15分钟',
              selectedTemplateId: 'tpl_1',
            }
          }))
        };
      }
      return null;
    });

    const page = createPageInstance();
    page.applyTemplateSelection({
      id: 'tpl_1',
      name: '模板A'
    });

    expect(page.setData).toHaveBeenCalledWith(expect.objectContaining({
      newTask: expect.objectContaining({
        title: '晚间阅读'
      }),
      selectedTemplateId: 'tpl_1',
      'errors.title': ''
    }));
    expect(page.data.templateFillUndoVisible).toBe(true);
    expect(page.data.templateFillUndoText).toBe('已填充 模板A，可恢复原内容');
  });

  it('_handleTaskCreationSuccess 应在使用模板时回写使用统计', () => {
    const page = createPageInstance();
    page.data.selectedTemplateId = 'tpl_1';
    page.recordSelectedTemplateUsage = jest.fn();
    page.closeAllPanels = jest.fn();
    page.getHeatmapComponent = jest.fn(() => null);

    page._handleTaskCreationSuccess({ task: { id: 'task_1' } }, { title: '任务A' });

    expect(page.recordSelectedTemplateUsage).toHaveBeenCalledWith('tpl_1');
    expect(page.setData).toHaveBeenCalledWith(expect.objectContaining({
      selectedTemplateId: null
    }));
  });

  it('openTemplateSelectPage 应进入模板选择页', () => {
    const page = createPageInstance();

    page.openTemplateSelectPage();

    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageManage/pages/task-template-manage/task-template-manage?mode=select',
      success: expect.any(Function)
    }));
  });

  it('openTemplateCreatePage 应直接进入模板新建页', () => {
    const page = createPageInstance();

    page.openTemplateCreatePage();

    expect(global.wx.navigateTo).toHaveBeenCalledWith({
      url: '/packageManage/pages/task-template-edit/task-template-edit?mode=create'
    });
  });

  it('loadRecentTaskTemplates 在已选模板被删除后应只清空选中态', async () => {
    const page = createPageInstance();
    page.data.selectedTemplateId = 'tpl_deleted';
    page.data.newTask.title = '已回填任务';

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'taskTemplate') {
        return {
          getRecentTemplates: jest.fn().mockResolvedValue({
            templates: [
              {
                id: 'tpl_2',
                name: '模板B',
                taskPayload: {
                  title: '任务B'
                }
              }
            ]
          })
        };
      }
      return null;
    });

    await pageConfig.loadRecentTaskTemplates.call(page);

    expect(page.setData).toHaveBeenCalledWith(expect.objectContaining({
      recentTemplates: expect.any(Array),
      selectedTemplateId: null
    }));
    expect(page.data.newTask.title).toBe('已回填任务');
  });

  it('loadRecentTaskTemplates 在无模板但有推荐时应回填推荐入口状态', async () => {
    const page = createPageInstance();

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'taskTemplate') {
        return {
          getRecentTemplates: jest.fn().mockResolvedValue({
            templates: []
          }),
          getRecommendedTemplateCandidates: jest.fn().mockResolvedValue({
            candidates: [
              {
                candidateKey: 'c1',
                displayName: '晚间阅读',
                reasonText: '近60天出现 4 次',
                taskPayload: {
                  title: '晚间阅读',
                  type: 'study',
                  isAllDay: false,
                  startTime: '19:00',
                  endTime: '19:30',
                  repeat: { type: 'daily', days: [] },
                  reminder: { enabled: false, time: 0 }
                }
              }
            ],
            total: 1
          })
        };
      }
      return null;
    });

    await pageConfig.loadRecentTaskTemplates.call(page);

    expect(page.data.hasTemplates).toBe(false);
    expect(page.data.templateRecommendationCount).toBe(1);
    expect(page.data.recommendedTemplates).toHaveLength(1);
    expect(page.data.recommendedTemplates[0]).toEqual(expect.objectContaining({
      displayName: '晚间阅读',
      repeatLabel: '每天'
    }));
  });

  it('validateTaskFormLocal 应拒绝结束时间早于或等于开始时间', () => {
    const page = createPageInstance();
    page.data.newTask.title = '任务A';
    page.data.newTask.startDate = '2026-04-11';
    page.data.newTask.endDate = '2026-04-11';
    page.data.newTask.isAllDay = false;
    page.data.newTask.startTime = '19:00';
    page.data.newTask.endTime = '19:00';
    page.data.newTask.repeat = { type: 'none' };

    const result = page.validateTaskFormLocal();

    expect(result).toEqual({
      valid: false,
      errorMsg: '结束时间不能早于开始时间'
    });
  });

  it('validateTaskFormLocal 应拒绝重复任务缺少结束日期', () => {
    const page = createPageInstance();
    page.data.newTask.title = '任务A';
    page.data.newTask.startDate = '2026-04-11';
    page.data.newTask.endDate = '';
    page.data.newTask.isAllDay = true;
    page.data.newTask.hasNoEndDate = false;
    page.data.newTask.repeat = {
      type: 'daily',
      days: [],
      startDate: '2026-04-11',
      endDate: ''
    };

    const result = page.validateTaskFormLocal();

    expect(result).toEqual({
      valid: false,
      errorMsg: '请设置重复任务的结束日期'
    });
  });

  it('validateTaskFormLocal 应拒绝非全天任务缺少时间', () => {
    const page = createPageInstance();
    page.data.newTask.title = '任务A';
    page.data.newTask.startDate = '2026-04-11';
    page.data.newTask.endDate = '2026-04-11';
    page.data.newTask.isAllDay = false;
    page.data.newTask.startTime = '';
    page.data.newTask.endTime = '';
    page.data.newTask.repeat = { type: 'none' };

    const result = page.validateTaskFormLocal();

    expect(result).toEqual({
      valid: false,
      errorMsg: '请设置开始和结束时间'
    });
  });

  it('重复任务结束日期晚于开始日期时仍应允许设置有效结束时间', () => {
    const page = createPageInstance();
    page.data.newTask.startDate = '2026-04-11';
    page.data.newTask.endDate = '2026-04-18';
    page.data.newTask.startTime = '19:00';
    page.data.newTask.endTime = '20:00';
    page.data.newTask.repeat = { type: 'daily' };

    page.onEndTimeChange({
      detail: {
        value: '21:00'
      }
    });

    expect(global.wx.showToast).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '结束时间不能早于开始时间'
    }));
    expect(page.setData).toHaveBeenCalledWith({
      'newTask.endTime': '21:00'
    });
  });

  it('onUseRecommendedTemplate 应把候选草稿传给模板编辑页', () => {
    const emit = jest.fn();
    global.wx.navigateTo.mockImplementation(({ success }) => {
      success({
        eventChannel: {
          emit
        }
      });
    });
    serviceManager.getService.mockImplementation((name) => {
      if (name === 'taskTemplate') {
        return {
          buildTemplateDraftFromCandidate: jest.fn(() => ({
            draftInput: {
              name: '晚间阅读',
              taskPayload: {
                title: '晚间阅读'
              },
              dateStrategy: {
                mode: 'today',
                endMode: 'same-day',
                durationDays: 1
              },
              enabled: true
            },
            sourceMeta: {
              sourceType: 'task-edit-recommendation'
            }
          }))
        };
      }
      return null;
    });

    const page = createPageInstance();
    page.data.recommendedTemplates = [
      {
        candidateKey: 'c1',
        displayName: '晚间阅读',
        taskPayload: {
          title: '晚间阅读'
        }
      }
    ];

    page.onUseRecommendedTemplate({
      currentTarget: {
        dataset: {
          key: 'c1'
        }
      }
    });

    expect(global.wx.navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/packageManage/pages/task-template-edit/task-template-edit?mode=create',
      success: expect.any(Function)
    }));
    expect(emit).toHaveBeenCalledWith('templateDraftReady', expect.objectContaining({
      draft: expect.objectContaining({
        draftInput: expect.objectContaining({
          name: '晚间阅读'
        })
      })
    }));
  });

  it('undoTemplateFill 应恢复到模板填充前的表单状态', () => {
    const page = createPageInstance();
    page.data.newTask = {
      title: '原任务',
      repeat: {
        type: 'none'
      }
    };
    page.data.repeatText = '当天';
    page.data.selectedTemplateId = 'tpl_1';
    page.data.templateFillUndoVisible = true;
    page.data.templateFillUndoText = '已填充 模板A，可恢复原内容';
    page._templateFillUndoSnapshot = {
      newTask: {
        title: '回退前任务',
        repeat: {
          type: 'daily'
        }
      },
      errors: {
        title: ''
      },
      repeatText: '每天',
      reminderText: '无',
      pointsExpiryText: '永久',
      repeatPreviewText: '',
      repeatTypeWarning: false,
      weekdaySelection: [false, false, false, false, false, false, false],
      repeatPanelMode: 'type',
      isRepeatOptionDisabled: false,
      selectedTemplateId: null,
      reminderOptions: []
    };

    page.undoTemplateFill();

    expect(page.data.newTask.title).toBe('回退前任务');
    expect(page.data.repeatText).toBe('每天');
    expect(page.data.templateFillUndoVisible).toBe(false);
    expect(page.data.templateFillUndoText).toBe('');
  });

  it('连续切换多个模板后恢复原内容应回到第一次模板填充前的状态', () => {
    const appliedTitles = ['模板A任务', '模板B任务'];
    const applyTemplateToTaskForm = jest.fn(() => ({
      formPatch: {
        newTask: {
          title: appliedTitles.shift(),
          repeat: {
            type: 'daily'
          }
        },
        repeatText: '每天',
        reminderText: '无',
        selectedTemplateId: 'tpl_any'
      }
    }));

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'taskTemplate') {
        return {
          applyTemplateToTaskForm
        };
      }
      return null;
    });

    const page = createPageInstance();
    page.data.newTask = {
      title: '手工输入',
      repeat: {
        type: 'none'
      }
    };
    page.data.repeatText = '不重复';

    page.applyTemplateSelection({
      id: 'tpl_1',
      name: '模板A'
    });
    page.applyTemplateSelection({
      id: 'tpl_2',
      name: '模板B'
    });

    page.undoTemplateFill();

    expect(page.data.newTask.title).toBe('手工输入');
    expect(page.data.repeatText).toBe('不重复');
    expect(page.data.templateFillUndoVisible).toBe(false);
    expect(page.data.templateFillUndoText).toBe('');
  });

  it('markTemplateFillUndoDirty 应在用户继续编辑后清空撤销状态', () => {
    const page = createPageInstance();
    page.data.templateFillUndoVisible = true;
    page.data.templateFillUndoText = '已填充 模板A，可恢复原内容';
    page._templateFillUndoSnapshot = {
      newTask: {
        title: '原任务'
      }
    };

    page.markTemplateFillUndoDirty();

    expect(page._templateFillUndoSnapshot).toBeNull();
    expect(page.data.templateFillUndoVisible).toBe(false);
    expect(page.data.templateFillUndoText).toBe('');
  });

  it('从选择模板页返回后继续切换模板，恢复原内容仍应回到首次模板填充前的状态', () => {
    const appliedTitles = ['模板A任务', '模板B任务'];
    const applyTemplateToTaskForm = jest.fn(() => ({
      formPatch: {
        newTask: {
          title: appliedTitles.shift(),
          repeat: {
            type: 'daily'
          }
        },
        repeatText: '每天',
        reminderText: '无',
        selectedTemplateId: 'tpl_any'
      }
    }));

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'taskTemplate') {
        return {
          applyTemplateToTaskForm
        };
      }
      return null;
    });

    const page = createPageInstance();
    page.data.newTask = {
      title: '手工输入',
      repeat: {
        type: 'none'
      }
    };
    page.data.repeatText = '不重复';

    page.applyTemplateSelection({
      id: 'tpl_1',
      name: '模板A'
    });
    page.onHide.call(page);
    page.applyTemplateSelection({
      id: 'tpl_2',
      name: '模板B'
    });

    page.undoTemplateFill();

    expect(page.data.newTask.title).toBe('手工输入');
    expect(page.data.repeatText).toBe('不重复');
    expect(page.data.templateFillUndoVisible).toBe(false);
    expect(page.data.templateFillUndoText).toBe('');
  });

  it('wxml 中模板区应保证正式模板、推荐候选和空态去创建三者互斥', () => {
    const fs = require('fs');
    const path = require('path');
    const wxml = fs.readFileSync(
      path.join(process.cwd(), 'pages/task-edit/task-edit.wxml'),
      'utf8'
    );

    expect(wxml).toContain('<block wx:if="{{hasTemplates}}">');
    expect(wxml).toContain('<block wx:elif="{{templateRecommendationCount > 0}}">');
    expect(wxml).toContain('<block wx:else>');
    expect(wxml).toContain('>更多模板<');
  });

  it('重复 showLoading 后单次 hideLoading 应只关闭一次全局 loading', () => {
    const page = createPageInstance();

    page._showLoading({ title: '添加中...' });
    page._showLoading({ title: '创建任务中...' });
    page._hideLoading();
    page._hideLoading();

    expect(global.wx.showLoading).toHaveBeenCalledTimes(2);
    expect(global.wx.hideLoading).toHaveBeenCalledTimes(1);
  });

  it('onUnload 在 loading 已关闭时不应再次调用 wx.hideLoading', () => {
    const page = createPageInstance();

    page._showLoading({ title: '添加中...' });
    page._hideLoading();
    page.onUnload.call(page);

    expect(global.wx.hideLoading).toHaveBeenCalledTimes(1);
  });

  it('onUnload 应清理模板恢复快照', () => {
    const page = createPageInstance();
    page._templateFillUndoSnapshot = {
      newTask: {
        title: '原任务'
      }
    };

    page.onUnload.call(page);

    expect(page._templateFillUndoSnapshot).toBeNull();
  });
});
