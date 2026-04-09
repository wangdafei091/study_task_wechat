const taskTemplateEntry = require('../../pages/task-edit/modules/task-template-entry');

describe('pages/task-edit/modules/task-template-entry', () => {
  it('getTemplateDisplayName 在别名与任务名不同时应返回别名', () => {
    expect(taskTemplateEntry.getTemplateDisplayName({
      name: '晚间阅读',
      taskPayload: {
        title: '阅读20分钟'
      }
    })).toBe('晚间阅读');
  });

  it('getTemplateDisplayName 在别名与任务名相同时应返回任务名', () => {
    expect(taskTemplateEntry.getTemplateDisplayName({
      name: '阅读20分钟',
      taskPayload: {
        title: '阅读20分钟'
      }
    })).toBe('阅读20分钟');
  });

  it('getTemplateDisplayName 在别名为空时应回退任务名', () => {
    expect(taskTemplateEntry.getTemplateDisplayName({
      name: '',
      taskPayload: {
        title: '阅读20分钟'
      }
    })).toBe('阅读20分钟');
  });

  it('getTemplateDisplayName 在别名和任务名都为空时应返回空字符串', () => {
    expect(taskTemplateEntry.getTemplateDisplayName({
      name: '',
      taskPayload: {
        title: ''
      }
    })).toBe('');
  });

  it('loadRecentTemplates 首次加载完成后应标记为已完成首屏加载', async () => {
    const page = {
      data: {
        templateEntryLoadedOnce: false
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };
    const taskTemplateService = {
      getRecentTemplates: jest.fn().mockResolvedValue({
        templates: []
      })
    };

    await taskTemplateEntry.loadRecentTemplates(page, taskTemplateService, 5);

    expect(page.setData).toHaveBeenNthCalledWith(1, {
      templateEntryLoading: true
    });
    expect(page.data.templateEntryLoadedOnce).toBe(true);
    expect(page.data.templateEntryLoading).toBe(false);
  });

  it('loadRecentTemplates 二次刷新时不应重新切回首屏 loading 状态', async () => {
    const page = {
      data: {
        templateEntryLoadedOnce: true,
        templateEntryLoading: false,
        hasTemplates: false,
        recentTemplates: []
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };
    const taskTemplateService = {
      getRecentTemplates: jest.fn().mockResolvedValue({
        templates: []
      })
    };

    await taskTemplateEntry.loadRecentTemplates(page, taskTemplateService, 5);

    expect(page.setData).not.toHaveBeenCalledWith({
      templateEntryLoading: true
    });
    expect(page.data.templateEntryLoadedOnce).toBe(true);
    expect(page.data.templateEntryLoading).toBe(false);
  });
});
