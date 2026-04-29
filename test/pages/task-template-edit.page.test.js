const fs = require('fs');
const path = require('path');

jest.mock('../../services/service-manager', () => ({
  getService: jest.fn(),
  getUserService: jest.fn()
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/view-scope', () => ({
  isChildView: jest.fn(() => false)
}));

describe('packageManage/pages/task-template-edit/task-template-edit', () => {
  let pageConfig;
  let serviceManager;
  let viewScope;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageManage/pages/task-template-edit/task-template-edit.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.keys(update).forEach((key) => {
          if (!key.includes('.')) {
            this.data[key] = update[key];
            return;
          }

          const segments = key.split('.');
          let target = this.data;
          while (segments.length > 1) {
            const segment = segments.shift();
            target[segment] = target[segment] || {};
            target = target[segment];
          }
          target[segments[0]] = update[key];
        });
      }),
      refreshPreview: jest.fn(pageConfig.refreshPreview),
      togglePanel: pageConfig.togglePanel,
      selectPointsExpiry: pageConfig.selectPointsExpiry,
      selectEndMode: pageConfig.selectEndMode,
      selectReminderType: pageConfig.selectReminderType,
      switchToWeekdaySelection: pageConfig.switchToWeekdaySelection,
      onDurationDaysInput: pageConfig.onDurationDaysInput,
      closeAllPanels: pageConfig.closeAllPanels,
      getOpenerEventChannel: jest.fn(() => ({
        on: jest.fn()
      }))
    };
  }

  beforeEach(() => {
    jest.resetModules();
    serviceManager = require('../../services/service-manager');
    viewScope = require('../../utils/view-scope');
    serviceManager.getUserService.mockReturnValue({
      getLoginUser: jest.fn(() => ({ role: 'parent' })),
      getCurrentUser: jest.fn(() => ({ role: 'parent' }))
    });
    viewScope.isChildView.mockReturnValue(false);

    global.wx = {
      showToast: jest.fn(),
      navigateBack: jest.fn(),
      setNavigationBarTitle: jest.fn()
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.wx;
  });

  it('onSave(create) 应调用 createTemplate', async () => {
    const createTemplate = jest.fn().mockResolvedValue({ success: true });
    serviceManager.getService.mockReturnValue({
      createTemplate,
      updateTemplate: jest.fn()
    });

    const page = createPageInstance();
    page.data.form.name = '';
    page.data.form.taskTitle = '任务A';
    page.data.form.taskDescription = '任务说明A';
    page.data.form.description = '模板说明A';

    await page.onSave();

    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({
      name: '任务A',
      description: '模板说明A',
      taskPayload: expect.objectContaining({
        title: '任务A',
        description: '任务说明A'
      }),
      dateStrategy: expect.objectContaining({
        mode: 'today',
        autoShiftExpiredEndDate: true,
        endMode: 'same-day',
        durationDays: 1
      })
    }));
  });

  it('推荐草稿保存成功后应通过 eventChannel 回传已处理候选', async () => {
    const emit = jest.fn();
    const createTemplate = jest.fn().mockResolvedValue({
      success: true,
      template: {
        id: 'tpl_created'
      }
    });
    serviceManager.getService.mockReturnValue({
      createTemplate,
      updateTemplate: jest.fn()
    });

    const page = createPageInstance();
    page.getOpenerEventChannel.mockReturnValue({
      on: jest.fn(),
      emit
    });

    page.applyTemplateDraft({
      draftInput: {
        name: '晚间阅读模板',
        description: '',
        enabled: true,
        taskPayload: {
          title: '晚间阅读',
          type: 'study',
          points: 2,
          pointsExpiry: 'week',
          description: '',
          isRequired: false,
          isAllDay: false,
          startDate: '2026-04-09',
          startTime: '19:00',
          endDate: '2026-04-15',
          endTime: '19:30',
          hasNoEndDate: false,
          repeat: {
            type: 'custom',
            days: [1, 3, 5],
            startDate: '2026-04-09',
            endDate: '2026-04-15'
          },
          reminder: {
            enabled: true,
            time: 15
          }
        },
        dateStrategy: {
          mode: 'inherit-repeat-rule',
          autoShiftExpiredEndDate: true,
          endMode: 'duration',
          durationDays: 7
        }
      },
      sourceMeta: {
        sourceType: 'template-manage-candidate',
        candidateKey: 'candidate_1'
      }
    });

    await page.onSave();

    expect(emit).toHaveBeenCalledWith('templateSaved', {
      templateId: 'tpl_created',
      sourceMeta: {
        sourceType: 'template-manage-candidate',
        candidateKey: 'candidate_1'
      }
    });
  });

  it('onLoad(create) 应设置新建页标题', () => {
    const page = createPageInstance();

    page.onLoad({});

    expect(global.wx.setNavigationBarTitle).toHaveBeenCalledWith({
      title: '新建任务模板'
    });
  });

  it('onLoad(create) 接收到推荐草稿后应回填表单并显示来源提示', () => {
    let draftHandler = null;
    const page = createPageInstance();
    page.getOpenerEventChannel.mockReturnValue({
      on: jest.fn((eventName, handler) => {
        if (eventName === 'templateDraftReady') {
          draftHandler = handler;
        }
      })
    });

    page.onLoad({});
    draftHandler({
      draft: {
        draftInput: {
          name: '晚间阅读模板',
          description: '',
          enabled: true,
          taskPayload: {
            title: '晚间阅读',
            type: 'study',
            points: 2,
            pointsExpiry: 'week',
            description: '阅读20分钟',
            isRequired: false,
            isAllDay: false,
            startDate: '2026-04-09',
            startTime: '19:00',
            endDate: '2026-04-09',
            endTime: '19:30',
            hasNoEndDate: false,
            repeat: {
              type: 'daily',
              days: [],
              startDate: '2026-04-09',
              endDate: '2026-04-09'
            },
            reminder: {
              enabled: true,
              time: 15
            }
          },
          dateStrategy: {
            mode: 'inherit-repeat-rule',
            autoShiftExpiredEndDate: true,
            endMode: 'week-end',
            durationDays: null
          }
        },
        sourceMeta: {
          sourceType: 'task-edit-recommendation',
          sourceTitle: '晚间阅读'
        }
      }
    });

    expect(page.data.form).toEqual(expect.objectContaining({
      name: '晚间阅读模板',
      taskTitle: '晚间阅读',
      type: 'study',
      endMode: 'week-end'
    }));
    expect(page.data.draftSourceHint).toContain('系统推荐');
    expect(page.data.draftSourceHint).toContain('晚间阅读');
  });

  it('onLoad(edit) 应设置编辑页标题', () => {
    const page = createPageInstance();
    page.loadTemplate = jest.fn();

    page.onLoad({
      mode: 'edit',
      templateId: 'tpl_1'
    });

    expect(global.wx.setNavigationBarTitle).toHaveBeenCalledWith({
      title: '编辑任务模板'
    });
    expect(page.loadTemplate).toHaveBeenCalledWith('tpl_1');
  });

  it('saving=true 时 onSave 应阻止重复提交', async () => {
    const createTemplate = jest.fn().mockResolvedValue({ success: true });
    serviceManager.getService.mockReturnValue({
      createTemplate,
      updateTemplate: jest.fn()
    });

    const page = createPageInstance();
    page.data.saving = true;
    page.data.form.taskTitle = '任务A';

    await page.onSave();

    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('loadTemplate 应回填编辑表单', async () => {
    serviceManager.getService.mockReturnValue({
      getTemplateById: jest.fn().mockResolvedValue({
        id: 'tpl_1',
        name: '模板A',
        description: '说明',
        enabled: false,
        taskPayload: {
          title: '任务A',
          description: '任务说明',
          type: 'study',
          points: 3,
          pointsExpiry: 'quarter',
          isRequired: true,
          isAllDay: false,
          startDate: '2026-04-08',
          endDate: '2026-04-10',
          startTime: '18:00',
          endTime: '18:30',
          hasNoEndDate: false,
          repeat: { type: 'daily', days: [] },
          reminder: { enabled: true, time: 15 }
        },
        dateStrategy: {
          mode: 'inherit-repeat-rule',
          autoShiftExpiredEndDate: true,
          endMode: 'duration',
          durationDays: 3
        }
      })
    });

    const page = createPageInstance();
    await page.loadTemplate('tpl_1');

    expect(page.data.form).toEqual(expect.objectContaining({
      name: '模板A',
      description: '说明',
      taskTitle: '任务A',
      taskDescription: '任务说明',
      type: 'study',
      points: 3,
      endMode: 'duration',
      durationDays: 3,
      reminderEnabled: true
    }));
    expect(page.data.pointsExpiryIndex).toBeGreaterThanOrEqual(0);
    expect(page.data.reminderIndex).toBeGreaterThanOrEqual(0);
  });

  it('onSave 在重复任务下应自动推导 inherit-repeat-rule 并固定自动顺延为 true', async () => {
    const createTemplate = jest.fn().mockResolvedValue({ success: true });
    serviceManager.getService.mockReturnValue({
      createTemplate,
      updateTemplate: jest.fn()
    });

    const page = createPageInstance();
    page.data.form.taskTitle = '晨跑';
    page.data.form.repeatType = 'daily';
    page.data.form.endMode = 'week-end';

    await page.onSave();

    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'week-end',
        durationDays: null
      }
    }));
  });

  it('onSave 在重复长期模板下应写入 endMode=no-end', async () => {
    const createTemplate = jest.fn().mockResolvedValue({ success: true });
    serviceManager.getService.mockReturnValue({
      createTemplate,
      updateTemplate: jest.fn()
    });

    const page = createPageInstance();
    page.data.form.taskTitle = '晨跑';
    page.data.form.repeatType = 'daily';
    page.data.form.endMode = 'no-end';

    await page.onSave();

    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'no-end',
        durationDays: null
      }
    }));
  });

  it('onSave 在重复模板选择持续天数时应写入 endMode=duration', async () => {
    const createTemplate = jest.fn().mockResolvedValue({ success: true });
    serviceManager.getService.mockReturnValue({
      createTemplate,
      updateTemplate: jest.fn()
    });

    const page = createPageInstance();
    page.data.form.taskTitle = '晨跑';
    page.data.form.repeatType = 'daily';
    page.data.form.endMode = 'duration';
    page.data.form.durationDays = 7;

    await page.onSave();

    expect(createTemplate).toHaveBeenCalledWith(expect.objectContaining({
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'duration',
        durationDays: 7
      }
    }));
  });

  it('refreshPreview 应同步 pointsExpiry 与 reminder 的 picker 当前索引', () => {
    const page = createPageInstance();
    page.data.form.pointsExpiry = 'quarter';
    page.data.form.reminderEnabled = true;
    page.data.form.reminderTime = 15;

    page.refreshPreview();

    expect(page.data.pointsExpiryIndex).toBe(
      page.data.pointsExpiryOptions.findIndex((item) => item.value === 'quarter')
    );
    expect(page.data.reminderIndex).toBe(
      page.data.reminderOptions.findIndex((item) => item.enabled === true && item.time === 15)
    );
  });

  it('切换全天后应收敛提醒选项并回退非法提醒值', () => {
    const page = createPageInstance();
    page.data.form.isAllDay = false;
    page.data.form.startTime = '09:00';
    page.data.form.reminderEnabled = true;
    page.data.form.reminderTime = 15;

    page.onSwitchChange({
      currentTarget: {
        dataset: {
          field: 'isAllDay'
        }
      },
      detail: {
        value: true
      }
    });

    expect(page.data.reminderOptions).toEqual([
      { label: '无', enabled: false, time: 0 },
      { label: '提前1天(晚上8点)', enabled: true, time: -1 }
    ]);
    expect(page.data.form.reminderEnabled).toBe(false);
    expect(page.data.form.reminderTime).toBe(0);
    expect(page.data.reminderIndex).toBe(0);
  });

  it('同一天结束时间早于开始时间时应阻止保存', async () => {
    const createTemplate = jest.fn().mockResolvedValue({ success: true });
    serviceManager.getService.mockReturnValue({
      createTemplate,
      updateTemplate: jest.fn()
    });

    const page = createPageInstance();
    page.data.form.taskTitle = '任务A';
    page.data.form.isAllDay = false;
    page.data.form.startTime = '19:00';
    page.data.form.endTime = '18:00';

    await page.onSave();

    expect(createTemplate).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '结束时间不能早于开始时间',
      icon: 'none'
    });
  });

  it('持续天数为 0 时应阻止保存', async () => {
    const createTemplate = jest.fn().mockResolvedValue({ success: true });
    serviceManager.getService.mockReturnValue({
      createTemplate,
      updateTemplate: jest.fn()
    });

    const page = createPageInstance();
    page.data.form.taskTitle = '任务A';
    page.data.form.repeatType = 'daily';
    page.data.form.endMode = 'duration';
    page.data.form.durationDays = '0';

    await page.onSave();

    expect(createTemplate).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '请输入有效的持续天数',
      icon: 'none'
    });
  });

  it('持续天数为空时应阻止保存', async () => {
    const createTemplate = jest.fn().mockResolvedValue({ success: true });
    serviceManager.getService.mockReturnValue({
      createTemplate,
      updateTemplate: jest.fn()
    });

    const page = createPageInstance();
    page.data.form.taskTitle = '任务A';
    page.data.form.repeatType = 'daily';
    page.data.form.endMode = 'duration';
    page.data.form.durationDays = '';

    await page.onSave();

    expect(createTemplate).not.toHaveBeenCalled();
    expect(global.wx.showToast).toHaveBeenCalledWith({
      title: '请输入有效的持续天数',
      icon: 'none'
    });
  });

  it('togglePanel 应打开目标摘要面板并关闭其他面板', () => {
    const page = createPageInstance();
    page.data.reminderPanel = true;

    page.togglePanel({
      currentTarget: {
        dataset: {
          panel: 'pointsExpiryPanel'
        }
      }
    });

    expect(page.data.pointsExpiryPanel).toBe(true);
    expect(page.data.reminderPanel).toBe(false);
    expect(page.data.repeatPanel).toBe(false);
  });

  it('selectPointsExpiry 应更新值并关闭面板', () => {
    const page = createPageInstance();
    page.data.pointsExpiryPanel = true;

    page.selectPointsExpiry({
      currentTarget: {
        dataset: {
          expiry: 'quarter'
        }
      }
    });

    expect(page.data.form.pointsExpiry).toBe('quarter');
    expect(page.data.pointsExpiryPanel).toBe(false);
  });

  it('selectReminderType 应更新提醒值并关闭面板', () => {
    const page = createPageInstance();
    page.data.reminderPanel = true;

    page.selectReminderType({
      currentTarget: {
        dataset: {
          enabled: 'true',
          time: '15'
        }
      }
    });

    expect(page.data.form.reminderEnabled).toBe(true);
    expect(page.data.form.reminderTime).toBe(15);
    expect(page.data.reminderPanel).toBe(false);
  });

  it('switchToWeekdaySelection 应切到自定义星期模式并预选开始日', () => {
    const page = createPageInstance();

    page.switchToWeekdaySelection();

    expect(page.data.form.repeatType).toBe('custom');
    expect(page.data.repeatPanelMode).toBe('weekday');
    expect(page.data.form.repeatDays.length).toBeGreaterThan(0);
  });

  it('onDurationDaysInput 应更新持续天数', () => {
    const page = createPageInstance();

    page.onDurationDaysInput({
      detail: {
        value: '7'
      }
    });

    expect(page.data.form.durationDays).toBe('7');
  });

  it('selectEndMode 应更新结束方式并在非持续天数时重置持续天数', () => {
    const page = createPageInstance();
    page.data.form.durationDays = 9;
    page.data.endModePanel = true;

    page.selectEndMode({
      currentTarget: {
        dataset: {
          endMode: 'week-end'
        }
      }
    });

    expect(page.data.form.endMode).toBe('week-end');
    expect(page.data.form.durationDays).toBe(1);
    expect(page.data.endModePanel).toBe(false);
  });

  it('refreshPreview 应生成带字段名的预览胶囊', () => {
    const page = createPageInstance();
    page.data.form.repeatType = 'daily';
    page.data.form.pointsExpiry = 'quarter';
    page.data.form.reminderEnabled = false;

    page.refreshPreview();

    expect(page.data.preview.previewChips).toEqual([
      { key: 'repeat', label: '重复', value: '每天' },
      { key: 'reminder', label: '提醒', value: '无' },
      { key: 'pointsExpiry', label: '星星有效期', value: '本季度结束' }
    ]);
  });

  it('refreshPreview 在重复模板下应拆分主结果和补充说明', () => {
    const page = createPageInstance();
    page.data.form.repeatType = 'daily';
    page.data.form.endMode = 'duration';
    page.data.form.durationDays = 7;

    page.refreshPreview();

    expect(page.data.preview.resultPrimaryText).toBe('创建任务时，将从今天开始每天执行');
    expect(page.data.preview.resultSecondaryText).toBe('从实际开始日算，共持续 7 天');
  });

  it('refreshPreview 在重复模板选择本周结束时应展示自然周提示', () => {
    const page = createPageInstance();
    page.data.form.repeatType = 'custom';
    page.data.form.repeatDays = [1, 3, 5];
    page.data.form.endMode = 'week-end';

    page.refreshPreview();

    expect(page.data.preview.resultPrimaryText).toContain('创建任务时，将从');
    expect(page.data.preview.resultPrimaryText).toContain('执行');
    expect(page.data.preview.resultSecondaryText).toBe('结束日期为该周周日');
  });

  it('wxml 应将结束方式与持续天数渲染为单行设置项', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../packageManage/pages/task-template-edit/task-template-edit.wxml'),
      'utf8'
    );

    expect(wxml).toContain('class="input-item duration-setting-item"');
    expect(wxml).toContain('结束方式');
    expect(wxml).toContain('data-panel="endModePanel"');
    expect(wxml).toContain('class="duration-setting-row time-item"');
    expect(wxml).toContain('class="duration-input-inline"');
    expect(wxml).not.toContain('class="duration-input-row"');
  });
});
