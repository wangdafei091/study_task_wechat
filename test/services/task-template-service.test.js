describe('TaskTemplateService', () => {
  let TaskTemplateService;
  let repository;
  let HttpClient;
  let taskService;
  let eventHandlers;
  let eventBus;

  function setupModules(enableApi = false) {
    jest.doMock('../../repositories/task-template-repository', () => (
      jest.fn(() => repository)
    ));

    HttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn()
    };
    jest.doMock('../../utils/http-client', () => HttpClient);
    jest.doMock('../../utils/api-config', () => ({
      ENABLE_API: enableApi,
      ENDPOINTS: {
        TASK_TEMPLATES: '/api/task-templates',
        TASK_TEMPLATE_RECOMMENDATIONS_QUERY: '/api/task-templates/recommendations/query',
        TASK_TEMPLATE_BY_ID: '/api/task-templates/{templateId}',
        TASK_TEMPLATE_ENABLED: '/api/task-templates/{templateId}/enabled',
        TASK_TEMPLATE_USAGE: '/api/task-templates/{templateId}/usage'
      }
    }));
    jest.doMock('../../utils/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }));

    TaskTemplateService = require('../../services/task-template-service');
  }

  beforeEach(() => {
    jest.resetModules();

    repository = {
      getById: jest.fn(),
      getAll: jest.fn().mockResolvedValue([]),
      getRecentTemplates: jest.fn().mockResolvedValue([]),
      getTemplates: jest.fn().mockResolvedValue([]),
      save: jest.fn(async (value) => value),
      replaceAll: jest.fn(async (value) => value),
      delete: jest.fn().mockResolvedValue(true)
    };
    taskService = {
      getTasksByScope: jest.fn().mockResolvedValue([]),
      getChildTasksByScope: jest.fn().mockResolvedValue([]),
      getPendingLocalTasksByScope: jest.fn().mockResolvedValue([]),
      getPendingLocalChildTasksByScope: jest.fn().mockResolvedValue([])
    };
    eventHandlers = {};
    eventBus = {
      on: jest.fn((eventName, handler) => {
        eventHandlers[eventName] = handler;
        return jest.fn();
      })
    };

    setupModules(false);
  });

  it('applyTemplateToTaskForm 应正确映射表单与展示态字段', () => {
    const service = new TaskTemplateService({
      userService: {
        getLoginUser: jest.fn(() => ({ familyId: 'family-1' }))
      }
    });

    const result = service.applyTemplateToTaskForm({
      id: 'tpl_1',
      name: '晚间阅读模板',
      taskPayload: {
        title: '晚间阅读',
        type: 'study',
        points: 3,
        pointsExpiry: 'quarter',
        description: '阅读20分钟',
        isRequired: true,
        isAllDay: false,
        startDate: '2026-04-01',
        startTime: '19:00',
        endDate: '2026-04-07',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-01',
          endDate: '2026-04-07'
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
    }, {
      today: '2026-04-08'
    });

    expect(result.formPatch.newTask.title).toBe('晚间阅读');
    expect(result.formPatch.newTask.description).toBe('阅读20分钟');
    expect(result.formPatch.newTask.startDate).toBe('2026-04-08');
    expect(result.formPatch.newTask.endDate).toBe('2026-04-14');
    expect(result.formPatch.repeatText).toBe('每周一、周三、周五');
    expect(result.formPatch.reminderText).toBe('提前15分钟');
    expect(result.formPatch.pointsExpiryText).toBe('本季度结束');
    expect(result.formPatch.selectedTemplateId).toBe('tpl_1');
  });

  it('非重复模板应用后应固定为今天到今天', () => {
    const service = new TaskTemplateService();

    const result = service.applyTemplateToTaskForm({
      id: 'tpl_today',
      name: '模板Today',
      taskPayload: {
        title: '游泳',
        startDate: '2026-04-20',
        endDate: '2026-04-26',
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-20',
          endDate: '2026-04-26'
        }
      },
      dateStrategy: {
        mode: 'today',
        autoShiftExpiredEndDate: true,
        endMode: 'same-day',
        durationDays: 1
      }
    }, {
      today: '2026-04-08'
    });

    expect(result.formPatch.newTask.startDate).toBe('2026-04-08');
    expect(result.formPatch.newTask.endDate).toBe('2026-04-08');
    expect(result.formPatch.newTask.hasNoEndDate).toBe(false);
  });

  it('重复模板应用后应按首个匹配生效日起算结束日期', () => {
    const service = new TaskTemplateService();

    const result = service.applyTemplateToTaskForm({
      id: 'tpl_inherit',
      name: '模板Inherit',
      taskPayload: {
        title: '游泳',
        startDate: '2026-04-20',
        endDate: '2026-04-26',
        hasNoEndDate: false,
        repeat: {
          type: 'weekly',
          days: [],
          startDate: '2026-04-20',
          endDate: '2026-04-26'
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'duration',
        durationDays: 7
      }
    }, {
      today: '2026-04-08'
    });

    expect(result.formPatch.newTask.startDate).toBe('2026-04-08');
    expect(result.formPatch.newTask.endDate).toBe('2026-04-14');
    expect(result.formPatch.newTask.hasNoEndDate).toBe(false);
  });

  it('自定义重复模板应用后应从首个匹配星期开始计算结束日期', () => {
    const service = new TaskTemplateService();

    const result = service.applyTemplateToTaskForm({
      id: 'tpl_custom_shift',
      name: '模板Custom',
      taskPayload: {
        title: '游泳',
        startDate: '2026-04-01',
        endDate: '2026-04-07',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-01',
          endDate: '2026-04-07'
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'duration',
        durationDays: 7
      }
    }, {
      today: '2026-04-09'
    });

    expect(result.formPatch.newTask.startDate).toBe('2026-04-10');
    expect(result.formPatch.newTask.endDate).toBe('2026-04-16');
    expect(result.formPatch.repeatPreviewText).toContain('从下一个周五开始执行');
  });

  it('重复长期模板应用后应从今天开始且无结束日期', () => {
    const service = new TaskTemplateService();

    const result = service.applyTemplateToTaskForm({
      id: 'tpl_long_term',
      name: '长期模板',
      taskPayload: {
        title: '晨读',
        hasNoEndDate: true,
        repeat: {
          type: 'daily',
          days: [],
          startDate: '2026-04-01',
          endDate: ''
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'no-end',
        durationDays: null
      }
    }, {
      today: '2026-04-08'
    });

    expect(result.formPatch.newTask.startDate).toBe('2026-04-08');
    expect(result.formPatch.newTask.endDate).toBe('');
    expect(result.formPatch.newTask.hasNoEndDate).toBe(true);
    expect(result.formPatch.newTask.repeat.endDate).toBe('');
  });

  it('重复模板选择本周结束时应用后应落到首个匹配日所在周周日', () => {
    const service = new TaskTemplateService();

    const result = service.applyTemplateToTaskForm({
      id: 'tpl_week_end',
      name: '模板WeekEnd',
      taskPayload: {
        title: '游泳',
        startDate: '2026-04-01',
        endDate: '2026-04-05',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-01',
          endDate: '2026-04-05'
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'week-end',
        durationDays: null
      }
    }, {
      today: '2026-04-09'
    });

    expect(result.formPatch.newTask.startDate).toBe('2026-04-10');
    expect(result.formPatch.newTask.endDate).toBe('2026-04-12');
    expect(result.formPatch.repeatPreviewText).toContain('结束日期为该周周日');
  });

  it('重复模板选择本月结束时应用后应落到首个匹配日所在月月末', () => {
    const service = new TaskTemplateService();

    const result = service.applyTemplateToTaskForm({
      id: 'tpl_month_end',
      name: '模板MonthEnd',
      taskPayload: {
        title: '月末复盘',
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        hasNoEndDate: false,
        repeat: {
          type: 'daily',
          days: [],
          startDate: '2026-04-01',
          endDate: '2026-04-30'
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'month-end',
        durationDays: null
      }
    }, {
      today: '2026-04-28'
    });

    expect(result.formPatch.newTask.startDate).toBe('2026-04-28');
    expect(result.formPatch.newTask.endDate).toBe('2026-04-30');
    expect(result.formPatch.repeatPreviewText).toContain('结束日期为该月最后一天');
  });

  it('recordTemplateUsage 在本地模式下应更新使用统计', async () => {
    const service = new TaskTemplateService();
    repository.getById.mockResolvedValue({
      id: 'tpl_1',
      usageCount: 1,
      clone: jest.fn((overrides) => ({
        id: 'tpl_1',
        usageCount: overrides.usageCount,
        lastUsedAt: overrides.lastUsedAt,
        updatedAt: overrides.updatedAt
      }))
    });

    const result = await service.recordTemplateUsage('tpl_1');

    expect(result.success).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tpl_1',
      usageCount: 2
    }));
  });

  it('createTemplate 在本地模式下应保存模板并补齐 familyId', async () => {
    const service = new TaskTemplateService({
      userService: {
        getLoginUser: jest.fn(() => ({ familyId: 'family_1' })),
        getLoginUserId: jest.fn(() => 'parent_1')
      }
    });

    const result = await service.createTemplate({
      name: '模板A',
      taskPayload: {
        title: '任务A'
      }
    });

    expect(result.success).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      familyId: 'family_1',
      name: '模板A',
      createdByUserId: 'parent_1'
    }));
  });

  it('createTemplate 在本地模式下也应拒绝超长模板名称', async () => {
    const service = new TaskTemplateService({
      userService: {
        getLoginUser: jest.fn(() => ({ familyId: 'family_1' })),
        getLoginUserId: jest.fn(() => 'parent_1')
      }
    });

    await expect(service.createTemplate({
      name: '长'.repeat(101),
      taskPayload: {
        title: '任务A'
      }
    })).rejects.toThrow('模板名称不能超过100个字符');

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('createTemplate 应拒绝超过 93 天的重复模板跨度', async () => {
    const service = new TaskTemplateService({
      userService: {
        getLoginUser: jest.fn(() => ({ familyId: 'family_1' })),
        getLoginUserId: jest.fn(() => 'parent_1')
      }
    });

    await expect(service.createTemplate({
      name: '长期模板',
      taskPayload: {
        title: '任务A',
        repeat: {
          type: 'daily'
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        endMode: 'duration',
        durationDays: 96
      }
    })).rejects.toThrow('时间范围过长，请缩短后再保存');
  });

  it('updateTemplate 在本地模式下应保存更新后的模板', async () => {
    const service = new TaskTemplateService({
      userService: {
        getLoginUser: jest.fn(() => ({ familyId: 'family_1' }))
      }
    });
    repository.getById.mockResolvedValue({
      toJSON: () => ({
        id: 'tpl_1',
        familyId: 'family_1',
        name: '旧模板',
        description: '',
        taskPayload: {
          title: '旧任务',
          type: 'habit',
          points: 1,
          pointsExpiry: 'permanent',
          description: '',
          isRequired: false,
          isAllDay: false,
          startDate: '2026-04-08',
          startTime: '09:00',
          endDate: '2026-04-08',
          endTime: '10:00',
          hasNoEndDate: false,
          repeat: { type: 'none', days: [], startDate: '2026-04-08', endDate: '2026-04-08' },
          reminder: { enabled: false, time: 0 }
        },
        dateStrategy: {
          mode: 'today',
          autoShiftExpiredEndDate: true
        },
        enabled: true,
        usageCount: 0,
        lastUsedAt: null,
        createdByUserId: 'parent_1',
        createdAt: 1,
        updatedAt: 1
      })
    });

    const result = await service.updateTemplate('tpl_1', {
      name: '新模板',
      taskPayload: {
        title: '新任务'
      }
    });

    expect(result.success).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tpl_1',
      name: '新模板'
    }));
  });

  it('updateTemplate 仅更新部分 taskPayload 时不应重置未修改字段', async () => {
    const service = new TaskTemplateService({
      userService: {
        getLoginUser: jest.fn(() => ({ familyId: 'family_1' }))
      }
    });
    repository.getById.mockResolvedValue({
      toJSON: () => ({
        id: 'tpl_1',
        familyId: 'family_1',
        name: '旧模板',
        description: '',
        taskPayload: {
          title: '旧任务',
          type: 'study',
          points: 8,
          pointsExpiry: 'quarter',
          description: '旧描述',
          isRequired: true,
          isAllDay: false,
          startDate: '2026-04-08',
          startTime: '18:00',
          endDate: '2026-04-10',
          endTime: '18:30',
          hasNoEndDate: false,
          repeat: { type: 'weekly', days: [], startDate: '2026-04-08', endDate: '2026-04-10' },
          reminder: { enabled: true, time: 15 }
        },
        dateStrategy: {
          mode: 'inherit-repeat-rule',
          autoShiftExpiredEndDate: true
        },
        enabled: true,
        usageCount: 0,
        lastUsedAt: null,
        createdByUserId: 'parent_1',
        createdAt: 1,
        updatedAt: 1
      })
    });

    await service.updateTemplate('tpl_1', {
      taskPayload: {
        title: '新任务'
      }
    });

    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tpl_1',
      taskPayload: expect.objectContaining({
        title: '新任务',
        type: 'study',
        points: 8,
        startTime: '18:00',
        reminder: expect.objectContaining({
          enabled: true,
          time: 15
        })
      }),
      dateStrategy: expect.objectContaining({
        mode: 'inherit-repeat-rule',
        autoShiftExpiredEndDate: true,
        endMode: 'duration',
        durationDays: 3
      })
    }));
  });

  it('updateTemplate 应允许历史超长模板只改名称，不允许继续扩张', async () => {
    const service = new TaskTemplateService({
      userService: {
        getLoginUser: jest.fn(() => ({ familyId: 'family_1' }))
      }
    });
    repository.getById.mockResolvedValue({
      toJSON: () => ({
        id: 'tpl_legacy',
        familyId: 'family_1',
        name: '旧模板',
        description: '',
        taskPayload: {
          title: '旧任务',
          type: 'habit',
          points: 1,
          pointsExpiry: 'permanent',
          description: '',
          isRequired: false,
          isAllDay: false,
          startDate: '2026-04-01',
          startTime: '09:00',
          endDate: '2026-07-05',
          endTime: '10:00',
          hasNoEndDate: false,
          repeat: { type: 'daily', days: [], startDate: '2026-04-01', endDate: '2026-07-05' },
          reminder: { enabled: false, time: 0 }
        },
        dateStrategy: {
          mode: 'inherit-repeat-rule',
          endMode: 'duration',
          durationDays: 96
        },
        enabled: true,
        usageCount: 0,
        lastUsedAt: null,
        createdByUserId: 'parent_1',
        createdAt: 1,
        updatedAt: 1
      })
    });

    await expect(service.updateTemplate('tpl_legacy', {
      name: '只改名称'
    })).resolves.toEqual(expect.objectContaining({
      success: true
    }));

    await expect(service.updateTemplate('tpl_legacy', {
      dateStrategy: {
        endMode: 'duration',
        durationDays: 120
      }
    })).rejects.toThrow('时间范围过长，请缩短后再保存');
  });

  it('setTemplateEnabled 在本地模式下应保存启停状态', async () => {
    const service = new TaskTemplateService();
    repository.getById.mockResolvedValue({
      clone: jest.fn((overrides) => ({
        id: 'tpl_1',
        enabled: overrides.enabled,
        updatedAt: overrides.updatedAt
      }))
    });

    const result = await service.setTemplateEnabled('tpl_1', false);

    expect(result.success).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tpl_1',
      enabled: false
    }));
  });

  it('deleteTemplate 在本地模式下应删除模板', async () => {
    const service = new TaskTemplateService();

    const result = await service.deleteTemplate('tpl_1');

    expect(result.success).toBe(true);
    expect(repository.delete).toHaveBeenCalledWith('tpl_1');
  });

  it('getTemplates 在本地模式下应直接返回仓储结果', async () => {
    const service = new TaskTemplateService();
    repository.getTemplates.mockResolvedValue([{ id: 'tpl_1' }]);

    const result = await service.getTemplates({
      type: 'study'
    });

    expect(result.templates).toEqual([{ id: 'tpl_1' }]);
    expect(repository.getTemplates).toHaveBeenCalledWith({
      type: 'study'
    });
  });

  it('云端模式下 refreshTemplatesFromCloud 应过滤 undefined 查询参数', async () => {
    jest.resetModules();
    repository.replaceAll.mockResolvedValue([]);
    setupModules(true);
    const service = new TaskTemplateService();

    HttpClient.get.mockResolvedValue({ templates: [] });

    await service.refreshTemplatesFromCloud({
      sortBy: 'recent'
    });

    expect(HttpClient.get).toHaveBeenCalledWith('/api/task-templates', {
      sortBy: 'recent'
    });
  });

  it('云端模式下 getRecentTemplates 在刷新失败时应回退本地镜像', async () => {
    jest.resetModules();
    repository.getRecentTemplates.mockResolvedValue([{ id: 'tpl_local' }]);
    repository.getAll.mockResolvedValue([{ id: 'tpl_local' }]);
    setupModules(true);
    const service = new TaskTemplateService();

    HttpClient.get.mockRejectedValue(new Error('network down'));

    const result = await service.getRecentTemplates(5);

    expect(result.templates).toEqual([{ id: 'tpl_local' }]);
    expect(repository.getRecentTemplates).toHaveBeenCalledWith(5);
  });

  it('云端模式下 getTemplateById(force) 在刷新失败时应回退本地镜像', async () => {
    jest.resetModules();
    repository.getById.mockResolvedValue({ id: 'tpl_local' });
    repository.getAll.mockResolvedValue([{ id: 'tpl_local' }]);
    setupModules(true);
    const service = new TaskTemplateService();

    HttpClient.get.mockRejectedValue(new Error('network down'));

    const result = await service.getTemplateById('tpl_local', { force: true });

    expect(result).toEqual({ id: 'tpl_local' });
    expect(repository.getById).toHaveBeenCalledWith('tpl_local');
  });

  it('getRecommendedTemplateCandidates 应按家庭任务生成候选并命中缓存', async () => {
    const service = new TaskTemplateService({
      taskService,
      eventBus
    });
    repository.getAll.mockResolvedValue([]);
    taskService.getChildTasksByScope.mockResolvedValue([
      {
        id: 'task_1',
        title: '晚间阅读',
        type: 'study',
        points: 2,
        pointsExpiry: 'week',
        description: '',
        isRequired: false,
        isAllDay: false,
        date: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '2026-04-01',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-01',
          endDate: '2026-04-01'
        },
        reminder: {
          enabled: false,
          time: 0
        },
        createdAt: 1
      },
      {
        id: 'task_2',
        title: '晚间阅读',
        type: 'study',
        points: 2,
        pointsExpiry: 'week',
        description: '',
        isRequired: false,
        isAllDay: false,
        date: '2026-04-05',
        startDate: '2026-04-05',
        endDate: '2026-04-05',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-05',
          endDate: '2026-04-05'
        },
        reminder: {
          enabled: false,
          time: 0
        },
        createdAt: 2
      }
    ]);

    const first = await service.getRecommendedTemplateCandidates({
      today: '2026-04-09'
    });
    const second = await service.getRecommendedTemplateCandidates({
      today: '2026-04-09'
    });

    expect(first.candidates).toHaveLength(1);
    expect(first.candidates[0]).toEqual(expect.objectContaining({
      displayName: '晚间阅读',
      reasonCode: 'high-frequency'
    }));
    expect(second.cached).toBe(true);
    expect(taskService.getChildTasksByScope).toHaveBeenCalledTimes(1);
  });

  it('任务事件触发后应失效推荐缓存并重新计算', async () => {
    const service = new TaskTemplateService({
      taskService,
      eventBus
    });
    repository.getAll.mockResolvedValue([]);
    taskService.getChildTasksByScope.mockResolvedValue([
      {
        id: 'task_1',
        title: '晚间阅读',
        type: 'study',
        points: 2,
        pointsExpiry: 'week',
        isRequired: false,
        isAllDay: false,
        date: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '2026-04-01',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-01',
          endDate: '2026-04-01'
        },
        reminder: {
          enabled: false,
          time: 0
        }
      },
      {
        id: 'task_2',
        title: '晚间阅读',
        type: 'study',
        points: 2,
        pointsExpiry: 'week',
        isRequired: false,
        isAllDay: false,
        date: '2026-04-05',
        startDate: '2026-04-05',
        endDate: '2026-04-05',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-05',
          endDate: '2026-04-05'
        },
        reminder: {
          enabled: false,
          time: 0
        }
      }
    ]);

    await service.getRecommendedTemplateCandidates({
      today: '2026-04-09'
    });
    eventHandlers['task:created']({});
    await service.getRecommendedTemplateCandidates({
      today: '2026-04-09'
    });

    expect(eventBus.on).toHaveBeenCalled();
    expect(taskService.getChildTasksByScope).toHaveBeenCalledTimes(2);
  });

  it('已有同任务节奏模板时应抑制仅次要字段不同的推荐候选', async () => {
    const service = new TaskTemplateService({
      taskService,
      eventBus
    });
    repository.getAll.mockResolvedValue([
      {
        id: 'tpl_1',
        name: '晚间阅读模板',
        taskPayload: {
          title: '晚间阅读',
          type: 'study',
          points: 5,
          pointsExpiry: 'quarter',
          description: '',
          isRequired: true,
          isAllDay: false,
          startDate: '2026-04-07',
          endDate: '2026-04-13',
          startTime: '19:00',
          endTime: '19:30',
          hasNoEndDate: false,
          repeat: {
            type: 'custom',
            days: [1, 3, 5],
            startDate: '2026-04-07',
            endDate: '2026-04-13'
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
      }
    ]);
    taskService.getChildTasksByScope.mockResolvedValue([
      {
        id: 'task_1',
        title: '晚间阅读',
        type: 'study',
        points: 2,
        pointsExpiry: 'week',
        description: '',
        isRequired: false,
        isAllDay: false,
        date: '2026-04-07',
        startDate: '2026-04-07',
        endDate: '2026-04-13',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-07',
          endDate: '2026-04-13'
        },
        reminder: {
          enabled: false,
          time: 0
        }
      },
      {
        id: 'task_2',
        title: '晚间阅读',
        type: 'study',
        points: 2,
        pointsExpiry: 'week',
        description: '',
        isRequired: false,
        isAllDay: false,
        date: '2026-04-14',
        startDate: '2026-04-14',
        endDate: '2026-04-20',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-14',
          endDate: '2026-04-20'
        },
        reminder: {
          enabled: false,
          time: 0
        }
      }
    ]);

    const result = await service.getRecommendedTemplateCandidates({
      today: '2026-04-20'
    });

    expect(result.candidates).toEqual([]);
  });

  it('云端模式下应优先调用推荐查询接口，并发送本地待同步任务补丁', async () => {
    jest.resetModules();
    setupModules(true);
    const service = new TaskTemplateService({
      taskService,
      eventBus
    });

    HttpClient.get.mockResolvedValue({ templates: [] });
    HttpClient.post.mockResolvedValue({
      candidates: [{
        candidateKey: 'sig_1',
        displayName: '晚间阅读',
        sourceTaskId: 'task_local_1',
        taskPayload: {
          title: '晚间阅读',
          type: 'study',
          points: 2,
          pointsExpiry: 'week',
          description: '',
          isRequired: false,
          isAllDay: false,
          startDate: '2026-04-05',
          startTime: '19:00',
          endDate: '2026-04-05',
          endTime: '19:30',
          hasNoEndDate: false,
          repeat: {
            type: 'none',
            days: [],
            startDate: '2026-04-05',
            endDate: '2026-04-05'
          },
          reminder: {
            enabled: false,
            time: 0
          }
        },
        dateStrategy: {
          mode: 'today',
          autoShiftExpiredEndDate: true,
          endMode: 'same-day',
          durationDays: 1
        },
        occurrences: 2,
        stableWeeks: 0,
        reasonCode: 'high-frequency',
        reasonText: '近60天出现了 2 次',
        signature: 'sig_1',
        coverageSignature: 'cov_1',
        repeatSpanKey: null,
        lastSeenAt: 2
      }],
      total: 1
    });
    taskService.getPendingLocalChildTasksByScope.mockResolvedValue([
      {
        id: 'task_local_1',
        title: '晚间阅读',
        description: '',
        type: 'study',
        date: '2026-04-05',
        startDate: '2026-04-05',
        endDate: '2026-04-05',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        isAllDay: false,
        isRequired: false,
        points: 2,
        pointsExpiry: 'week',
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-05',
          endDate: '2026-04-05'
        },
        reminder: {
          enabled: false,
          time: 0
        },
        syncedToCloud: false,
        pendingSyncMeta: {
          action: 'create'
        },
        modifyTime: 2
      }
    ]);

    const result = await service.getRecommendedTemplateCandidates({
      today: '2026-04-09',
      limit: 1
    });

    expect(result.source).toBe('cloud');
    expect(result.candidates).toHaveLength(1);
    expect(taskService.getPendingLocalChildTasksByScope).toHaveBeenCalledWith({
      scope: 'family'
    });
    expect(HttpClient.post).toHaveBeenCalledWith(
      '/api/task-templates/recommendations/query',
      expect.objectContaining({
        today: '2026-04-09',
        lookbackDays: 60,
        limit: 1,
        localPendingTasks: [
          expect.objectContaining({
            id: 'task_local_1',
            title: '晚间阅读'
          })
        ]
      })
    );
    const requestBody = HttpClient.post.mock.calls[0][1];
    expect(requestBody.localPendingTasks[0]).not.toHaveProperty('pendingSyncMeta');
    expect(requestBody.localPendingTasks[0]).not.toHaveProperty('syncedToCloud');
  });

  it('不同 limit 的云端推荐查询不应复用同一份缓存结果', async () => {
    jest.resetModules();
    setupModules(true);
    const service = new TaskTemplateService({
      taskService,
      eventBus
    });

    HttpClient.get.mockResolvedValue({ templates: [] });
    HttpClient.post
      .mockResolvedValueOnce({
        candidates: [{ candidateKey: 'sig_1', displayName: '模板1', taskPayload: { title: '任务1' }, dateStrategy: { mode: 'today' } }],
        total: 3
      })
      .mockResolvedValueOnce({
        candidates: [
          { candidateKey: 'sig_1', displayName: '模板1', taskPayload: { title: '任务1' }, dateStrategy: { mode: 'today' } },
          { candidateKey: 'sig_2', displayName: '模板2', taskPayload: { title: '任务2' }, dateStrategy: { mode: 'today' } }
        ],
        total: 3
      });

    await service.getRecommendedTemplateCandidates({
      today: '2026-04-09',
      limit: 1
    });
    const second = await service.getRecommendedTemplateCandidates({
      today: '2026-04-09',
      limit: 2
    });

    expect(HttpClient.post).toHaveBeenCalledTimes(2);
    expect(second.candidates).toHaveLength(2);
    expect(second.total).toBe(3);
  });

  it('云端推荐接口失败时应回退本地算法', async () => {
    jest.resetModules();
    setupModules(true);
    const service = new TaskTemplateService({
      taskService,
      eventBus
    });

    HttpClient.get.mockResolvedValue({ templates: [] });
    HttpClient.post.mockRejectedValue(new Error('network down'));
    repository.getAll.mockResolvedValue([]);
    taskService.getChildTasksByScope.mockResolvedValue([
      {
        id: 'task_1',
        title: '晚间阅读',
        type: 'study',
        points: 2,
        pointsExpiry: 'week',
        description: '',
        isRequired: false,
        isAllDay: false,
        date: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '2026-04-01',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-01',
          endDate: '2026-04-01'
        },
        reminder: {
          enabled: false,
          time: 0
        }
      },
      {
        id: 'task_2',
        title: '晚间阅读',
        type: 'study',
        points: 2,
        pointsExpiry: 'week',
        description: '',
        isRequired: false,
        isAllDay: false,
        date: '2026-04-05',
        startDate: '2026-04-05',
        endDate: '2026-04-05',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-05',
          endDate: '2026-04-05'
        },
        reminder: {
          enabled: false,
          time: 0
        }
      }
    ]);

    const result = await service.getRecommendedTemplateCandidates({
      today: '2026-04-09'
    });

    expect(result.source).toBe('local_fallback');
    expect(result.candidates).toHaveLength(1);
    expect(taskService.getChildTasksByScope).toHaveBeenCalledWith({
      scope: 'family'
    });
  });

  it('updateUserService 后应使推荐缓存失效并切换上下文缓存键', async () => {
    const firstUserService = {
      getLoginUser: jest.fn(() => ({ familyId: 'family_1' })),
      getLoginUserId: jest.fn(() => 'login_1'),
      getCurrentUserId: jest.fn(() => 'current_1')
    };
    const secondUserService = {
      getLoginUser: jest.fn(() => ({ familyId: 'family_2' })),
      getLoginUserId: jest.fn(() => 'login_2'),
      getCurrentUserId: jest.fn(() => 'current_2')
    };
    const service = new TaskTemplateService({
      taskService,
      eventBus,
      userService: firstUserService
    });
    repository.getAll.mockResolvedValue([]);
    taskService.getChildTasksByScope.mockResolvedValue([
      {
        id: 'task_1',
        title: '晚间阅读',
        type: 'study',
        date: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '2026-04-01',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-01',
          endDate: '2026-04-01'
        },
        reminder: {
          enabled: false,
          time: 0
        }
      },
      {
        id: 'task_2',
        title: '晚间阅读',
        type: 'study',
        date: '2026-04-05',
        startDate: '2026-04-05',
        endDate: '2026-04-05',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-05',
          endDate: '2026-04-05'
        },
        reminder: {
          enabled: false,
          time: 0
        }
      }
    ]);

    const first = await service.getRecommendedTemplateCandidates({
      today: '2026-04-09'
    });
    const cached = await service.getRecommendedTemplateCandidates({
      today: '2026-04-09'
    });

    service.updateUserService(secondUserService);

    const afterSwitch = await service.getRecommendedTemplateCandidates({
      today: '2026-04-09'
    });

    expect(first.cached).toBe(false);
    expect(cached.cached).toBe(true);
    expect(afterSwitch.cached).toBe(false);
    expect(taskService.getChildTasksByScope).toHaveBeenCalledTimes(2);
  });
});
