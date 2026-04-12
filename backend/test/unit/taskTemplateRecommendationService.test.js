jest.mock('../../services/taskService');
jest.mock('../../services/taskTemplateService');
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })
}));

const taskService = require('../../services/taskService');
const taskTemplateService = require('../../services/taskTemplateService');

describe('backend TaskTemplateRecommendationService', () => {
  function expectCandidateParity(tasks, templates = [], options = {}) {
    const { groupTasksToRecommendationCandidates } = require('../../services/task-template-recommendation/rules');
    const { groupTasksToTemplateCandidates } = require('../../../utils/task-template-source');

    const backendCandidates = groupTasksToRecommendationCandidates(tasks, templates, options);
    const frontendCandidates = groupTasksToTemplateCandidates(tasks, templates, options);

    expect(backendCandidates).toHaveLength(frontendCandidates.length);
    expect(backendCandidates).toEqual(
      frontendCandidates.map((candidate) => expect.objectContaining({
        candidateKey: candidate.candidateKey,
        displayName: candidate.displayName,
        sourceTaskId: candidate.sourceTaskId,
        taskPayload: candidate.taskPayload,
        dateStrategy: candidate.dateStrategy,
        reasonCode: candidate.reasonCode,
        reasonText: candidate.reasonText,
        occurrences: candidate.occurrences,
        stableWeeks: candidate.stableWeeks,
        signature: candidate.signature,
        coverageSignature: candidate.coverageSignature,
        repeatSpanKey: candidate.repeatSpanKey,
        lastSeenAt: candidate.lastSeenAt
      }))
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queryRecommendations 应查询家庭任务并合并本地补丁任务', async () => {
    taskService.getTasksByFamily = jest.fn().mockResolvedValue([
      {
        taskId: 'task_cloud_1',
        title: '晚间阅读',
        description: '',
        type: 'study',
        date: '2026-04-01',
        startTime: '19:00',
        endTime: '19:30',
        points: 2,
        pointsExpiry: 'week',
        isRequired: false,
        isAllDay: false,
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
        modifyTime: 1
      }
    ]);
    taskTemplateService.listTemplates = jest.fn().mockResolvedValue([]);

    const service = require('../../services/taskTemplateRecommendationService');
    const result = await service.queryRecommendations({
      familyId: 'family_1',
      today: '2026-04-09',
      lookbackDays: 60,
      localPendingTasks: [
        {
          id: 'task_local_2',
          title: '晚间阅读',
          description: '',
          type: 'study',
          date: '2026-04-05',
          startDate: '2026-04-05',
          endDate: '2026-04-05',
          startTime: '19:00',
          endTime: '19:30',
          points: 2,
          pointsExpiry: 'week',
          isRequired: false,
          isAllDay: false,
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
          pendingSyncMeta: { action: 'create' },
          syncedToCloud: false,
          modifyTime: 2
        }
      ]
    });

    expect(taskService.getTasksByFamily).toHaveBeenCalledWith('family_1', {
      startDate: '2026-02-09',
      endDate: '2026-04-09'
    });
    expect(taskTemplateService.listTemplates).toHaveBeenCalledWith('family_1');
    expect(result.total).toBe(1);
    expect(result.candidates[0]).toEqual(expect.objectContaining({
      displayName: '晚间阅读',
      reasonCode: 'high-frequency',
      occurrences: 2
    }));
  });

  it('mergePendingTasks 应使用本地补丁覆盖同 id 的云端任务', () => {
    const service = require('../../services/taskTemplateRecommendationService');
    const result = service.mergePendingTasks(
      [{ taskId: 'task_1', title: '云端标题', type: 'study' }],
      [{ id: 'task_1', title: '本地标题', type: 'study' }]
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      title: '本地标题'
    }));
  });

  it('候选规则输出应与现有前端算法关键字段保持一致', () => {
    const tasks = [
      {
        id: 'task_1',
        title: '晚间阅读',
        description: '',
        type: 'study',
        date: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '2026-04-07',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        isAllDay: false,
        isRequired: false,
        points: 2,
        pointsExpiry: 'week',
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-01',
          endDate: '2026-04-07'
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
        description: '',
        type: 'study',
        date: '2026-04-08',
        startDate: '2026-04-08',
        endDate: '2026-04-14',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        isAllDay: false,
        isRequired: false,
        points: 2,
        pointsExpiry: 'week',
        repeat: {
          type: 'custom',
          days: [1, 3, 5],
          startDate: '2026-04-08',
          endDate: '2026-04-14'
        },
        reminder: {
          enabled: false,
          time: 0
        },
        createdAt: 2
      }
    ];

    expectCandidateParity(tasks, [], {
      today: '2026-04-14',
      lookbackDays: 60
    });
  });

  it('候选规则在长期 daily 任务场景下应与前端保持一致', () => {
    const tasks = [
      {
        id: 'task_daily_1',
        title: '晨读',
        type: 'study',
        date: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '',
        startTime: '07:00',
        endTime: '07:30',
        hasNoEndDate: true,
        isAllDay: false,
        isRequired: true,
        points: 2,
        pointsExpiry: 'week',
        repeat: { type: 'daily', days: [], startDate: '2026-04-01', endDate: '' },
        reminder: { enabled: true, time: 10 },
        createdAt: 1
      }
    ];

    expectCandidateParity(tasks, [], {
      today: '2026-04-14',
      lookbackDays: 60
    });
  });

  it('候选规则在 workdays/weekends 场景下应与前端保持一致', () => {
    const tasks = [
      {
        id: 'task_workdays',
        title: '放学整理书包',
        type: 'habit',
        date: '2026-04-06',
        startDate: '2026-04-06',
        endDate: '2026-04-10',
        startTime: '17:30',
        endTime: '17:45',
        hasNoEndDate: false,
        isAllDay: false,
        isRequired: false,
        points: 1,
        pointsExpiry: 'week',
        repeat: { type: 'workdays', days: [], startDate: '2026-04-06', endDate: '2026-04-10' },
        reminder: { enabled: false, time: 0 },
        createdAt: 1
      },
      {
        id: 'task_weekends',
        title: '周末打扫',
        type: 'habit',
        date: '2026-04-11',
        startDate: '2026-04-11',
        endDate: '2026-04-12',
        startTime: '10:00',
        endTime: '10:30',
        hasNoEndDate: false,
        isAllDay: false,
        isRequired: false,
        points: 2,
        pointsExpiry: 'week',
        repeat: { type: 'weekends', days: [], startDate: '2026-04-11', endDate: '2026-04-12' },
        reminder: { enabled: false, time: 0 },
        createdAt: 2
      }
    ];

    expectCandidateParity(tasks, [], {
      today: '2026-04-14',
      lookbackDays: 60
    });
  });

  it('候选规则在单次高频任务场景下应与前端保持一致', () => {
    const tasks = [
      {
        id: 'task_once_1',
        title: '周测复盘',
        type: 'study',
        date: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '2026-04-01',
        startTime: '20:00',
        endTime: '20:30',
        hasNoEndDate: false,
        isAllDay: false,
        isRequired: false,
        points: 3,
        pointsExpiry: 'week',
        repeat: { type: 'none', days: [], startDate: '2026-04-01', endDate: '2026-04-01' },
        reminder: { enabled: false, time: 0 },
        createdAt: 1
      },
      {
        id: 'task_once_2',
        title: '周测复盘',
        type: 'study',
        date: '2026-04-08',
        startDate: '2026-04-08',
        endDate: '2026-04-08',
        startTime: '20:00',
        endTime: '20:30',
        hasNoEndDate: false,
        isAllDay: false,
        isRequired: false,
        points: 3,
        pointsExpiry: 'week',
        repeat: { type: 'none', days: [], startDate: '2026-04-08', endDate: '2026-04-08' },
        reminder: { enabled: false, time: 0 },
        createdAt: 2
      }
    ];

    expectCandidateParity(tasks, [], {
      today: '2026-04-14',
      lookbackDays: 60
    });
  });

  it('候选规则在已有模板覆盖抑制场景下应与前端保持一致', () => {
    const tasks = [
      {
        id: 'task_cover_1',
        title: '晚间阅读',
        description: '',
        type: 'study',
        date: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '2026-04-07',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        isAllDay: false,
        isRequired: false,
        points: 2,
        pointsExpiry: 'week',
        repeat: { type: 'custom', days: [1, 3, 5], startDate: '2026-04-01', endDate: '2026-04-07' },
        reminder: { enabled: false, time: 0 },
        createdAt: 1
      },
      {
        id: 'task_cover_2',
        title: '晚间阅读',
        description: '',
        type: 'study',
        date: '2026-04-08',
        startDate: '2026-04-08',
        endDate: '2026-04-14',
        startTime: '19:00',
        endTime: '19:30',
        hasNoEndDate: false,
        isAllDay: false,
        isRequired: false,
        points: 2,
        pointsExpiry: 'week',
        repeat: { type: 'custom', days: [1, 3, 5], startDate: '2026-04-08', endDate: '2026-04-14' },
        reminder: { enabled: false, time: 0 },
        createdAt: 2
      }
    ];
    const templates = [
      {
        id: 'tpl_1',
        name: '晚间阅读模板',
        taskPayload: {
          title: '晚间阅读',
          type: 'study',
          points: 2,
          pointsExpiry: 'week',
          description: '',
          isRequired: false,
          isAllDay: false,
          startDate: '2026-04-01',
          startTime: '19:00',
          endDate: '2026-04-07',
          endTime: '19:30',
          hasNoEndDate: false,
          repeat: { type: 'custom', days: [1, 3, 5], startDate: '2026-04-01', endDate: '2026-04-07' },
          reminder: { enabled: false, time: 0 }
        },
        dateStrategy: {
          mode: 'inherit-repeat-rule',
          autoShiftExpiredEndDate: true,
          endMode: 'duration',
          durationDays: 7
        }
      }
    ];

    expectCandidateParity(tasks, templates, {
      today: '2026-04-14',
      lookbackDays: 60
    });
  });

  it('queryRecommendations 应深度收口 localPendingTasks 的 repeat/reminder', async () => {
    taskService.getTasksByFamily = jest.fn().mockResolvedValue([]);
    taskTemplateService.listTemplates = jest.fn().mockResolvedValue([]);

    const service = require('../../services/taskTemplateRecommendationService');
    const normalizedTasks = service._normalizePendingTasks([
      {
        id: 'task_local_1',
        title: '晚间阅读',
        type: 'study',
        date: '2026-04-05',
        startDate: '2026-04-05',
        endDate: '2026-04-05',
        startTime: '19:00',
        endTime: '19:30',
        repeat: {
          type: 'custom',
          days: [1, '3', 3, 9],
          startDate: 'bad-date',
          endDate: '2026-04-05',
          extra: 'ignored'
        },
        reminder: {
          enabled: true,
          time: '15',
          extra: 'ignored'
        }
      }
    ]);

    expect(normalizedTasks).toHaveLength(1);
    expect(normalizedTasks[0].repeat).toEqual({
      type: 'custom',
      days: [1, 3],
      startDate: '2026-04-05',
      endDate: '2026-04-05'
    });
    expect(normalizedTasks[0].reminder).toEqual({
      enabled: true,
      time: 15
    });
  });

  it('queryRecommendations 遇到任务 reminder 为 null 时不应报错', async () => {
    taskService.getTasksByFamily = jest.fn().mockResolvedValue([
      {
        taskId: 'task_cloud_1',
        title: '晚间阅读',
        description: '',
        type: 'study',
        date: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '2026-04-01',
        startTime: '19:00',
        endTime: '19:30',
        points: 2,
        pointsExpiry: 'week',
        isRequired: false,
        isAllDay: false,
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-01',
          endDate: '2026-04-01'
        },
        reminder: null,
        modifyTime: 1
      },
      {
        taskId: 'task_cloud_2',
        title: '晚间阅读',
        description: '',
        type: 'study',
        date: '2026-04-05',
        startDate: '2026-04-05',
        endDate: '2026-04-05',
        startTime: '19:00',
        endTime: '19:30',
        points: 2,
        pointsExpiry: 'week',
        isRequired: false,
        isAllDay: false,
        hasNoEndDate: false,
        repeat: {
          type: 'none',
          days: [],
          startDate: '2026-04-05',
          endDate: '2026-04-05'
        },
        reminder: null,
        modifyTime: 2
      }
    ]);
    taskTemplateService.listTemplates = jest.fn().mockResolvedValue([]);

    const service = require('../../services/taskTemplateRecommendationService');
    const result = await service.queryRecommendations({
      familyId: 'family_1',
      today: '2026-04-09',
      lookbackDays: 60
    });

    expect(result.total).toBe(1);
    expect(result.candidates[0]).toEqual(expect.objectContaining({
      displayName: '晚间阅读',
      reasonCode: 'high-frequency'
    }));
  });
});
