const adapter = require('../../utils/task-form-adapter');

describe('utils/task-form-adapter', () => {
  it('adaptTaskEditStateToDraft 应兼容任务页嵌套结构', () => {
    const draft = adapter.adaptTaskEditStateToDraft({
      title: '晨跑',
      type: 'habit',
      startDate: '2026-04-11',
      endDate: '2026-04-11',
      startTime: '07:00',
      endTime: '08:00',
      isAllDay: false,
      hasNoEndDate: false,
      repeat: {
        type: 'daily',
        days: [],
        startDate: '2026-04-11',
        endDate: '2026-04-11'
      },
      reminder: {
        enabled: true,
        time: 15
      }
    });

    expect(draft).toEqual(expect.objectContaining({
      title: '晨跑',
      repeatType: 'daily',
      reminderEnabled: true,
      reminderTime: 15
    }));
  });

  it('adaptTemplateEditFormToDraft 应兼容模板页平铺结构', () => {
    const draft = adapter.adaptTemplateEditFormToDraft({
      taskTitle: '晚间阅读',
      taskDescription: '阅读20分钟',
      type: 'study',
      startTime: '19:00',
      endTime: '19:30',
      repeatType: 'custom',
      repeatDays: [1, 3, 5],
      endMode: 'duration',
      durationDays: 7,
      reminderEnabled: true,
      reminderTime: 15
    }, {
      today: '2026-04-11'
    });

    expect(draft).toEqual(expect.objectContaining({
      title: '晚间阅读',
      description: '阅读20分钟',
      repeatType: 'custom',
      repeatDays: [1, 3, 5],
      reminderEnabled: true,
      reminderTime: 15,
      dateStrategy: expect.objectContaining({
        endMode: 'duration',
        durationDays: 7
      })
    }));
  });

  it('adaptTemplateEntityToDraft 应兼容模板实体结构', () => {
    const draft = adapter.adaptTemplateEntityToDraft({
      name: '晚间阅读模板',
      taskPayload: {
        title: '晚间阅读',
        type: 'study',
        startDate: '2026-04-11',
        endDate: '2026-04-17',
        startTime: '19:00',
        endTime: '19:30',
        repeat: {
          type: 'custom',
          days: [1, 3, 5]
        },
        reminder: {
          enabled: true,
          time: 15
        }
      },
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        endMode: 'duration',
        durationDays: 7
      }
    });

    expect(draft).toEqual(expect.objectContaining({
      title: '晚间阅读',
      repeatType: 'custom',
      repeatDays: [1, 3, 5],
      dateStrategy: expect.objectContaining({
        durationDays: 7
      })
    }));
  });

  it('buildTaskEditPatchFromDraft 应回写任务页嵌套结构', () => {
    const patch = adapter.buildTaskEditPatchFromDraft({
      title: '晨跑',
      type: 'habit',
      startDate: '2026-04-11',
      endDate: '2026-04-17',
      startTime: '07:00',
      endTime: '08:00',
      repeatType: 'custom',
      repeatDays: [1, 3, 5],
      reminderEnabled: true,
      reminderTime: 15
    });

    expect(patch).toEqual(expect.objectContaining({
      title: '晨跑',
      repeat: expect.objectContaining({
        type: 'custom',
        days: [1, 3, 5]
      }),
      reminder: {
        enabled: true,
        time: 15
      }
    }));
  });

  it('buildTemplateEditPatchFromDraft 应回写模板页平铺结构', () => {
    const patch = adapter.buildTemplateEditPatchFromDraft({
      title: '晚间阅读',
      description: '阅读20分钟',
      type: 'study',
      startTime: '19:00',
      endTime: '19:30',
      repeatType: 'custom',
      repeatDays: [1, 3, 5],
      reminderEnabled: true,
      reminderTime: 15,
      dateStrategy: {
        mode: 'inherit-repeat-rule',
        endMode: 'duration',
        durationDays: 7
      }
    }, {
      name: '阅读模板',
      description: '模板说明',
      enabled: true
    });

    expect(patch).toEqual(expect.objectContaining({
      name: '阅读模板',
      taskTitle: '晚间阅读',
      taskDescription: '阅读20分钟',
      repeatType: 'custom',
      repeatDays: [1, 3, 5],
      endMode: 'duration',
      durationDays: 7
    }));
  });
});
