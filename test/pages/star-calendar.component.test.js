jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../utils/view-scope', () => ({
  hasResolvedAnalysisOptions: jest.fn((options) => Boolean(options && (options.scope || options.userId)))
}));

describe('packageChart/components/star-calendar/star-calendar', () => {
  let componentConfig;

  function loadComponentModule() {
    componentConfig = null;
    global.Component = jest.fn((config) => {
      componentConfig = config;
    });

    jest.isolateModules(() => {
      require('../../packageChart/components/star-calendar/star-calendar.js');
    });
  }

  function createComponentInstance() {
    const instance = {
      data: {
        ...(componentConfig.data || {})
      },
      properties: {
        analysisOptions: {
          scope: 'family',
          childUserIds: ['child-1', 'child-2']
        }
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      })
    };

    Object.entries(componentConfig.methods || {}).forEach(([name, fn]) => {
      instance[name] = fn;
    });

    return instance;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    loadComponentModule();
  });

  afterEach(() => {
    delete global.Component;
  });

  it('family 分析应只保留 childUserIds 对应的星星记录', () => {
    const component = createComponentInstance();

    const records = component._filterRecordsByAnalysisScope(
      [
        { userId: 'parent-1', id: 'r1' },
        { userId: 'child-1', id: 'r2' },
        { userId: 'child-2', id: 'r3' },
        { userId: 'child-3', id: 'r4' }
      ],
      component.properties.analysisOptions
    );

    expect(records).toEqual([
      { userId: 'child-1', id: 'r2' },
      { userId: 'child-2', id: 'r3' }
    ]);
  });

  it('family 分析应只保留 childUserIds 对应的任务缓存', () => {
    const component = createComponentInstance();

    const tasks = component._filterTasksByAnalysisScope(
      [
        { userId: 'parent-1', id: 't1' },
        { userId: 'child-1', id: 't2' },
        { userId: 'child-2', id: 't3' }
      ],
      component.properties.analysisOptions
    );

    expect(tasks).toEqual([
      { userId: 'child-1', id: 't2' },
      { userId: 'child-2', id: 't3' }
    ]);
  });
});
