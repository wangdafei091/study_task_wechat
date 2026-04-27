jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('components/index-task-item', () => {
  let componentConfig;

  function loadComponentModule() {
    componentConfig = null;
    global.Component = jest.fn((config) => {
      componentConfig = config;
    });

    jest.isolateModules(() => {
      require('../../components/index-task-item/index-task-item.js');
    });
  }

  function createComponentInstance(properties = {}) {
    const instance = {
      data: {
        ...(componentConfig.data || {})
      },
      properties: {
        task: {
          id: 'task-1',
          title: '任务1',
          status: 0,
          starAwarded: false
        },
        lastExchangeTime: null,
        showTime: false,
        showCheckbox: true,
        readonly: false,
        readonlyReason: '',
        ...properties
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      triggerEvent: jest.fn(),
      addCompletionAnimation: jest.fn(),
      triggerStarAnimation: jest.fn(),
      createSelectorQuery: jest.fn(() => ({
        select: jest.fn(() => ({
          node: jest.fn(() => ({
            exec: jest.fn()
          }))
        }))
      }))
    };

    Object.entries(componentConfig.methods || {}).forEach(([name, fn]) => {
      instance[name] = fn;
    });

    return instance;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();

    global.wx = {
      showToast: jest.fn(),
      vibrateShort: jest.fn()
    };

    loadComponentModule();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete global.Component;
    delete global.wx;
  });

  it('未来日期只读时应提示仅支持查看', () => {
    const component = createComponentInstance({
      readonly: true,
      readonlyReason: 'future-date'
    });

    component.onCheckboxTap({ currentTarget: { dataset: {} } });

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '未来日期仅支持查看'
    }));
    expect(component.triggerEvent).not.toHaveBeenCalled();
  });

  it('跨设备只读时应提示在自己设备上操作', () => {
    const component = createComponentInstance({
      readonly: true,
      readonlyReason: 'cross-device'
    });

    component.onCheckboxTap({ currentTarget: { dataset: {} } });

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '请在自己设备上操作'
    }));
    expect(component.triggerEvent).not.toHaveBeenCalled();
  });

  it('viewer 只读时应提示不能修改任务', () => {
    const component = createComponentInstance({
      readonly: true,
      readonlyReason: 'viewer-readonly'
    });

    component.onCheckboxTap({ currentTarget: { dataset: {} } });

    expect(global.wx.showToast).toHaveBeenCalledWith(expect.objectContaining({
      title: '当前为查看者，不能修改任务'
    }));
    expect(component.triggerEvent).not.toHaveBeenCalled();
  });

  it('任务时间展示应收敛为分钟，不显示秒', () => {
    const component = createComponentInstance();

    componentConfig.properties.task.observer.call(component, {
      id: 'task-1',
      title: '跑步',
      status: 0,
      starAwarded: false,
      startTime: '07:30:00',
      endTime: '08:05:00'
    }, null);

    expect(component.data.displayStartTime).toBe('07:30');
    expect(component.data.displayEndTime).toBe('08:05');
  });
});
