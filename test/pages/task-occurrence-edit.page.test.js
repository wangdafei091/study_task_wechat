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

describe('pages/task-occurrence-edit/task-occurrence-edit', () => {
  let pageConfig;
  let serviceManager;
  let taskService;

  function loadPageModule() {
    pageConfig = null;
    global.Page = jest.fn((config) => {
      pageConfig = config;
    });

    jest.isolateModules(() => {
      require('../../pages/task-occurrence-edit/task-occurrence-edit.js');
    });
  }

  function createPageInstance() {
    return {
      ...pageConfig,
      data: JSON.parse(JSON.stringify(pageConfig.data)),
      setData: jest.fn(function setData(update) {
        Object.entries(update).forEach(([key, value]) => {
          if (key.includes('.')) {
            const [root, leaf] = key.split('.');
            this.data[root][leaf] = value;
          } else {
            this.data[key] = value;
          }
        });
      })
    };
  }

  function buildActiveItem(index) {
    return {
      id: `active_${index}`,
      title: `生效项${index}`,
      type: index % 2 === 0 ? 'study' : 'habit',
      points: index,
      pointsExpiry: index % 2 === 0 ? 'week' : 'permanent',
      date: '2026-04-17',
      modifyTime: 200 - index,
      activeRange: {
        startDate: '2026-04-17',
        endDate: '',
        hasNoEndDate: true
      }
    };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    serviceManager = require('../../services/service-manager');
    taskService = {
      isOccurrenceEnabled: jest.fn().mockResolvedValue(true),
      getOccurrenceTasks: jest.fn().mockResolvedValue([
        buildActiveItem(1),
        buildActiveItem(2),
        buildActiveItem(3),
        buildActiveItem(4),
        buildActiveItem(5),
        buildActiveItem(6),
        buildActiveItem(7),
        {
          id: 'upcoming_1',
          title: '暑假晨读',
          type: 'study',
          points: 2,
          date: '2026-04-20',
          modifyTime: 90,
          activeRange: {
            startDate: '2026-04-20',
            endDate: '',
            hasNoEndDate: true
          }
        },
        {
          id: 'history_1',
          title: '旧表现项',
          type: 'interest',
          points: 1,
          date: '2026-04-01',
          modifyTime: 80,
          activeRange: {
            startDate: '2026-04-01',
            endDate: '2026-04-10',
            hasNoEndDate: false
          }
        }
      ]),
      createTask: jest.fn().mockResolvedValue({
        success: true,
        task: {
          id: 'occ_new',
          title: '新表现项',
          type: 'study',
          points: 2,
          pointsExpiry: 'week',
          activeRange: {
            startDate: '2026-04-20',
            endDate: '',
            hasNoEndDate: true
          }
        }
      }),
      updateTask: jest.fn().mockResolvedValue({
        success: true,
        task: {
          id: 'active_1',
          title: '已更新',
          type: 'study',
          points: 3,
          pointsExpiry: 'quarter',
          activeRange: {
            startDate: '2026-04-17',
            endDate: '',
            hasNoEndDate: true
          }
        }
      }),
      disableOccurrenceTask: jest.fn().mockResolvedValue({ success: true }),
      deleteTask: jest.fn().mockResolvedValue({ success: true })
    };

    serviceManager.getService.mockImplementation((name) => {
      if (name === 'task') {
        return taskService;
      }
      return null;
    });

    global.getApp = jest.fn(() => ({
      globalData: {
        statusBarHeight: 24,
        safeArea: {
          bottom: 16
        },
        lastActiveChildId: 'child_1',
        userService: {
          getLoginUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent' })),
          getCurrentUser: jest.fn(() => ({ userId: 'parent_1', role: 'parent' })),
          getAllUsers: jest.fn(() => [
            { userId: 'parent_1', role: 'parent', name: '家长' },
            { userId: 'child_1', role: 'child', name: '小明' },
            { userId: 'child_2', role: 'child', name: '小红' }
          ])
        }
      }
    }));

    global.wx = {
      showToast: jest.fn(),
      showModal: jest.fn(({ success }) => success({ confirm: true, cancel: false })),
      showActionSheet: jest.fn(({ success }) => success({ tapIndex: 0 })),
      navigateBack: jest.fn(),
      nextTick: jest.fn((callback) => {
        if (typeof callback === 'function') {
          callback();
        }
      })
    };

    loadPageModule();
  });

  afterEach(() => {
    delete global.Page;
    delete global.getApp;
    delete global.wx;
  });

  it('onLoad 应构建主区和次级容器数据，并启用自定义导航尺寸', async () => {
    const page = createPageInstance();

    await page.onLoad.call(page, {});

    expect(page.data.targetUserId).toBe('child_1');
    expect(page.data.statusBarHeight).toBe(24);
    expect(page.data.navContentHeight).toBe(44);
    expect(page.data.navBarHeight).toBe(68);
    expect(taskService.getOccurrenceTasks).toHaveBeenCalledWith({
      date: '2026-04-17',
      userId: 'child_1',
      includeInactive: true
    });
    expect(page.data.activeSection.key).toBe('active');
    expect(page.data.secondaryPanel).toEqual(expect.objectContaining({
      title: '其他表现项',
      visible: true
    }));
    expect(page.data.statsBar).toEqual({
      visible: true,
      items: [
        { key: 'active', label: '生效中', count: 7 },
        { key: 'upcoming', label: '待生效', count: 1 },
        { key: 'history', label: '历史项', count: 1 }
      ]
    });
    expect(page.data.summary).toEqual({
      activeCount: 7,
      upcomingCount: 1,
      historyCount: 1,
      totalCount: 9
    });
    expect(page.data.activeSection.visibleItems[0]).toEqual(expect.objectContaining({
      rewardAccentText: expect.any(String),
      rewardExpiryMetaText: expect.any(String),
      rewardSummaryText: expect.stringContaining('奖励')
    }));
    expect(page.data.activeSection.visibleItems).toHaveLength(6);
    expect(page.data.secondaryPanel.upcomingSection.expanded).toBe(false);
    expect(page.data.secondaryPanel.historySection.expanded).toBe(false);
  });

  it('有胶囊按钮信息时应按 px 计算导航高度，避免 rpx 混用', async () => {
    global.wx.getMenuButtonBoundingClientRect = jest.fn(() => ({
      top: 30,
      height: 32
    }));

    const page = createPageInstance();
    await page.onLoad.call(page, {});

    expect(page.data.navContentHeight).toBe(44);
    expect(page.data.navBarHeight).toBe(68);
  });

  it('onCreateTap 和 onEditTap 应拉起覆盖式编辑层并正确回填草稿', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.onCreateTap.call(page);
    expect(page.data.editorState.visible).toBe(true);
    expect(page.data.editorState.mode).toBe('create');
    expect(page.data.draft.title).toBe('');
    expect(page.data.draft.pointsExpiry).toBe('permanent');
    expect(page.data.pointsExpiryText).toBe('永久');

    page.onEditTap.call(page, {
      currentTarget: {
        dataset: {
          id: 'active_1'
        }
      }
    });

    expect(page.data.editorState.visible).toBe(true);
    expect(page.data.editorState.mode).toBe('edit');
    expect(page.data.editingId).toBe('active_1');
    expect(page.data.draft).toEqual(expect.objectContaining({
      id: 'active_1',
      title: '生效项1',
      startDate: '2026-04-17',
      hasNoEndDate: true,
      pointsExpiry: 'permanent'
    }));
    expect(page.data.pointsExpiryText).toBe('永久');
  });

  it('未选中孩子时点击新建应提示而不是直接进入编辑层', () => {
    const page = createPageInstance();
    page.data.targetUserId = '';

    page.onCreateTap.call(page);

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '请先选择孩子'
    }));
    expect(page.data.editorState.visible).toBe(false);
  });

  it('各分组展开收起应按设计更新', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.onToggleSection.call(page, {
      currentTarget: {
        dataset: {
          key: 'active'
        }
      }
    });
    expect(page.data.activeSection.visibleItems).toHaveLength(7);
    expect(page.data.activeSection.expanded).toBe(true);

    page.onToggleSection.call(page, {
      currentTarget: {
        dataset: {
          key: 'upcoming'
        }
      }
    });
    expect(page.data.secondaryPanel.upcomingSection.expanded).toBe(true);
    expect(page.data.secondaryPanel.upcomingSection.visibleItems).toHaveLength(1);

    page.onToggleSection.call(page, {
      currentTarget: {
        dataset: {
          key: 'history'
        }
      }
    });
    expect(page.data.secondaryPanel.historySection.expanded).toBe(true);
    expect(page.data.secondaryPanel.historySection.visibleItems).toHaveLength(1);
  });

  it('脏草稿时返回和切孩子都应先确认，取消后保持编辑态', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.onEditTap.call(page, {
      currentTarget: {
        dataset: {
          id: 'active_1'
        }
      }
    });
    page.onTitleInput.call(page, {
      detail: {
        value: '已修改'
      }
    });
    expect(page.data.editorState.dirty).toBe(true);

    global.wx.showModal = jest.fn(({ success }) => success({ confirm: false, cancel: true }));
    await page.onNavBack.call(page);
    expect(page.data.editorState.visible).toBe(true);
    expect(global.wx.navigateBack).not.toHaveBeenCalled();

    await page.onChildTap.call(page, {
      currentTarget: {
        dataset: {
          userId: 'child_2'
        }
      }
    });
    expect(page.data.targetUserId).toBe('child_1');
  });

  it('保存新建结果后应关闭编辑层、调用 createTask 并展开对应分组', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.onCreateTap.call(page);
    page.onTitleInput.call(page, {
      detail: {
        value: '新表现项'
      }
    });
    page.onToggleNoEndDate.call(page, {
      detail: {
        value: true
      }
    });
    page.onStartDateChange.call(page, {
      detail: {
        value: '2026-04-20'
      }
    });

    page.loadItems = jest.fn().mockResolvedValue();
    await page.onSaveTap.call(page);

    expect(taskService.createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: '新表现项',
      executionMode: 'occurrence',
      userId: 'child_1'
    }));
    expect(page.data.editorState.visible).toBe(false);
    expect(page.data.sectionUiStateByUser.child_1).toEqual(expect.objectContaining({
      anchorTaskId: 'occ_new',
      upcomingExpanded: true
    }));
    expect(page.loadItems).toHaveBeenCalled();
  });

  it('编辑生效中项目后不应无条件把生效中区块永久展开', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.onEditTap.call(page, {
      currentTarget: {
        dataset: {
          id: 'active_1'
        }
      }
    });
    page.onTitleInput.call(page, {
      detail: {
        value: '已更新'
      }
    });
    page.loadItems = jest.fn().mockResolvedValue();

    await page.onSaveTap.call(page);

    expect(page.data.sectionUiStateByUser.child_1).toEqual(expect.objectContaining({
      anchorTaskId: 'active_1'
    }));
    expect(page.data.sectionUiStateByUser.child_1.activeExpanded).toBe(false);
  });

  it('锚点回位只应消费一次，刷新后不应继续保留旧锚点', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.setCurrentSectionUiState({
      anchorTaskId: 'history_1',
      historyExpanded: true
    });
    page.applyDisplayModel([
      {
        id: 'history_1',
        title: '旧表现项',
        type: 'study',
        points: 1,
        date: '2026-04-01',
        modifyTime: 1,
        activeRange: {
          startDate: '2026-04-01',
          endDate: '2026-04-10',
          hasNoEndDate: false
        }
      }
    ], page.getCurrentSectionUiState());

    expect(page.data.scrollAnchorId).toBe('');
    expect(page.data.sectionUiStateByUser.child_1.anchorTaskId).toBe('');
  });

  it('编辑保存应调用 updateTask，停用和删除应刷新列表并关闭编辑层', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.onEditTap.call(page, {
      currentTarget: {
        dataset: {
          id: 'active_1'
        }
      }
    });
    page.onTitleInput.call(page, {
      detail: {
        value: '已更新'
      }
    });
    page.loadItems = jest.fn().mockResolvedValue();

    await page.onSaveTap.call(page);
    expect(taskService.updateTask).toHaveBeenCalledWith('active_1', expect.objectContaining({
      executionMode: 'occurrence',
      pointsExpiry: 'permanent'
    }), 'child_1');

    page.data.editingId = 'active_1';
    page.data.editorState.visible = true;
    await page.onDisableTap.call(page, {
      currentTarget: {
        dataset: {
          id: 'active_1'
        }
      }
    });
    expect(taskService.disableOccurrenceTask).toHaveBeenCalledWith('active_1', {
      disableFromDate: '2026-04-17'
    }, 'child_1');
    expect(page.data.editorState.visible).toBe(false);

    page.data.editingId = 'active_1';
    page.data.editorState.visible = true;
    await page.onDeleteTap.call(page, {
      currentTarget: {
        dataset: {
          id: 'active_1'
        }
      }
    });
    expect(taskService.deleteTask).toHaveBeenCalledWith('active_1', 'child_1');
    expect(page.data.editorState.visible).toBe(false);
  });

  it('应支持选择星星有效期，并在新建保存时透传 pointsExpiry', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.onCreateTap.call(page);
    page.togglePanel.call(page, {
      currentTarget: {
        dataset: {
          panel: 'pointsExpiryPanel'
        }
      }
    });
    expect(page.data.pointsExpiryPanel).toBe(true);

    page.selectPointsExpiry.call(page, {
      currentTarget: {
        dataset: {
          expiry: 'week'
        }
      }
    });
    expect(page.data.draft.pointsExpiry).toBe('week');
    expect(page.data.pointsExpiryText).toBe('本周结束');
    expect(page.data.pointsExpiryPanel).toBe(false);

    page.onTitleInput.call(page, {
      detail: {
        value: '新表现项'
      }
    });
    await page.onSaveTap.call(page);

    expect(taskService.createTask).toHaveBeenCalledWith(expect.objectContaining({
      executionMode: 'occurrence',
      pointsExpiry: 'week'
    }));
  });

  it('历史项不应再响应编辑和更多动作', async () => {
    const page = createPageInstance();
    await page.onLoad.call(page, {});

    page.onEditTap.call(page, {
      currentTarget: {
        dataset: {
          id: 'history_1'
        }
      }
    });
    expect(page.data.editorState.visible).toBe(false);

    page.onMoreTap.call(page, {
      currentTarget: {
        dataset: {
          id: 'history_1'
        }
      }
    });
    expect(global.wx.showActionSheet).not.toHaveBeenCalled();
  });

  it('viewer 家长进入时应直接拦截并返回上一页', async () => {
    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getLoginUser: jest.fn(() => ({
            userId: 'parent_viewer',
            role: 'parent',
            familyId: 'family_1',
            familyPermissionRole: 'viewer'
          })),
          getCurrentUser: jest.fn(() => ({
            userId: 'parent_viewer',
            role: 'parent',
            familyId: 'family_1',
            familyPermissionRole: 'viewer'
          })),
          getAllUsers: jest.fn(() => [
            { userId: 'parent_viewer', role: 'parent', familyId: 'family_1', familyPermissionRole: 'viewer', name: '查看者家长' },
            { userId: 'child_1', role: 'child', familyId: 'family_1', name: '小明' }
          ])
        }
      }
    }));
    loadPageModule();

    const page = createPageInstance();
    await page.onLoad.call(page, {});

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '当前为查看者，不能管理表现项'
    }));
    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
    expect(taskService.getOccurrenceTasks).not.toHaveBeenCalled();
  });

  it('child 进入时也应直接拦截并返回上一页', async () => {
    global.getApp = jest.fn(() => ({
      globalData: {
        userService: {
          getLoginUser: jest.fn(() => ({
            userId: 'child_1',
            role: 'child'
          })),
          getCurrentUser: jest.fn(() => ({
            userId: 'child_1',
            role: 'child'
          })),
          getAllUsers: jest.fn(() => [
            { userId: 'child_1', role: 'child', name: '小明' }
          ])
        }
      }
    }));
    loadPageModule();

    const page = createPageInstance();
    await page.onLoad.call(page, {});

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '当前身份不能管理表现项'
    }));
    expect(global.wx.navigateBack).toHaveBeenCalledWith({ delta: 1 });
    expect(taskService.getOccurrenceTasks).not.toHaveBeenCalled();
  });

  it('相关页面文件不应再引入 optional chaining，并应切为 custom navigation', () => {
    const fs = require('fs');
    const path = require('path');
    const pageJs = fs.readFileSync(path.join(process.cwd(), 'pages/task-occurrence-edit/task-occurrence-edit.js'), 'utf8');
    const pageJson = fs.readFileSync(path.join(process.cwd(), 'pages/task-occurrence-edit/task-occurrence-edit.json'), 'utf8');
    const pageWxml = fs.readFileSync(path.join(process.cwd(), 'pages/task-occurrence-edit/task-occurrence-edit.wxml'), 'utf8');
    const pageWxss = fs.readFileSync(path.join(process.cwd(), 'pages/task-occurrence-edit/task-occurrence-edit.wxss'), 'utf8');

    expect(pageJs).not.toContain('?.');
    expect(pageJs).not.toContain('??');
    expect(pageJson).toContain('"navigationStyle": "custom"');
    expect(pageWxml).toContain('新建表现项');
    expect(pageWxml).toContain('secondaryPanel.title');
    expect(pageWxml).toContain('occurrence-card__more-icon');
    expect(pageWxml).toContain('occurrence-card__reward-row');
    expect(pageWxml).toContain('occurrence-card__reward-accent');
    expect(pageWxml).toContain('occurrence-card__reward-meta');
    expect(pageWxml).toContain('manage-header__actions');
    expect(pageWxml).toContain('summary-strip--embedded');
    expect(pageWxml).toContain('switch-row__control');
    expect(pageWxml).not.toContain('打开后只需要设置开始日期');
    expect(pageWxml).toContain('class="input-label">名称<');
    expect(pageWxml).not.toContain('class="form-label">名称<');
    expect(pageWxml).not.toContain('<button class="manage-header__cta');
    expect(pageWxml).not.toContain('custom-nav__subtitle');
    expect(pageWxml).not.toContain('当前生效的放上面');
    expect(pageWxml).not.toContain('先看当前生效中的项目');
    expect(pageWxml).not.toContain('优先维护现在真正会出现的表现项');
    expect(pageWxml).not.toContain('hero-card');
    expect(pageWxml).not.toContain('section-block--{{item.key}}');
    expect(pageWxml).not.toContain('section-summary-row__action');
    expect(pageWxml).not.toContain('secondary-entry__note');
    expect(pageWxml).not.toContain('editor-banner');
    expect(pageWxml).not.toContain('新增一条可记录的表现项');
    expect(pageWxml).not.toContain('创建后会自动回到新建项的位置');
    expect(pageWxml).not.toContain('<block wx:if="{{draft.hasNoEndDate}}">');
    expect(pageWxml).toContain('date-field__label');
    expect(pageWxml).toContain('date-field__picker');
    expect(pageWxml).toContain('date-field--disabled');
    expect(pageWxml).toContain('date-field__picker--disabled');
    expect(pageWxml).toContain('disabled="{{draft.hasNoEndDate}}"');
    expect(pageWxml).toContain("draft.hasNoEndDate ? '未设置'");
    expect(pageWxml).toContain('开始日期');
    expect(pageWxml).toContain('结束日期');
    expect(pageWxml).not.toContain('date-row__connector');
    expect(pageWxml).not.toContain('date-row__end-picker');
    expect(pageWxml).toContain('class="editor-action editor-action--secondary"');
    expect(pageWxml).toContain("class=\"editor-action editor-action--primary {{saving ? 'editor-action--disabled' : ''}}\"");
    expect(pageWxml).not.toContain('<button class="secondary-btn"');
    expect(pageWxml).not.toContain('<button class="primary-btn"');
    expect(pageWxss).not.toContain('min-height: 92rpx');
    expect(pageWxss).not.toContain('height: 88rpx');
    expect(pageWxss).not.toContain('height: 82rpx');
    expect(pageWxss).not.toContain('min-height: 76rpx');
    expect(pageWxss).toContain('height: 64rpx');
    expect(pageWxss).toContain('min-height: 70rpx');
    expect(pageWxss).toContain('background: linear-gradient(180deg, #4a86f4 0%, #3f7df0 100%);');
    expect(pageWxss).not.toContain('backdrop-filter: blur(18rpx);');
    expect(pageWxss).toContain('.summary-strip--embedded');
    expect(pageWxss).toContain('.secondary-panel--single');
    expect(pageWxss).toContain('.switch-row__control');
    expect(pageWxss).toContain('.input-label');
    expect(pageWxss).not.toContain('.form-label');
    expect(pageWxss).toContain('.date-field-group');
    expect(pageWxss).toContain('.date-field--disabled');
    expect(pageWxss).toContain('.date-field__label');
    expect(pageWxss).toContain('.date-field__picker');
    expect(pageWxss).toContain('.date-field__picker--disabled');
    expect(pageWxss).not.toContain('.date-row__connector');
    expect(pageWxss).not.toContain('.date-row__end-picker');
    expect(pageWxss).toContain('font-size: 28rpx;');
    expect(pageWxss).toContain('font-weight: 500;');
    expect(pageWxss).toContain('.editor-action');
    expect(pageWxss).toContain('.editor-action--primary');
    expect(pageWxss).toContain('.editor-action--secondary');
    expect(pageWxss).not.toContain('.primary-btn');
    expect(pageWxss).not.toContain('.secondary-btn');
    expect(pageWxss).not.toContain('.date-panel--single');
    expect(pageWxss).not.toContain('.switch-row--single');
    expect(pageWxss).not.toContain('.date-row__end-picker--hidden');
    expect(pageWxss).not.toContain('.date-row__connector--hidden');
    expect(pageWxss).toContain('display: flex;');
    expect(pageWxss).toContain('align-items: center;');
    expect(pageWxss).toContain('justify-content: center;');
    expect(pageWxss).toContain('line-height: 1.2;');
  });
});
