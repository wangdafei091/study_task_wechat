jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('components/progressRing/progressRing', () => {
  let componentConfig;
  let canvasContext;

  function loadComponentModule() {
    componentConfig = null;
    global.Component = jest.fn((config) => {
      componentConfig = config;
    });

    jest.isolateModules(() => {
      require('../../components/progressRing/progressRing.js');
    });
  }

  function createComponentInstance() {
    const instance = {
      data: {
        ...(componentConfig.data || {})
      },
      properties: {
        percent: 0,
        size: 'medium',
        type: 'habit',
        color: '#4285F4',
        showText: true,
        centerContent: '',
        enableHover: true,
        borderWidth: 8
      },
      setData: jest.fn(function setData(update, callback) {
        Object.assign(this.data, update);
        if (typeof callback === 'function') {
          callback();
        }
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

    canvasContext = {
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      setLineWidth: jest.fn(),
      setStrokeStyle: jest.fn(),
      setLineCap: jest.fn(),
      arc: jest.fn(),
      stroke: jest.fn(),
      draw: jest.fn()
    };

    global.wx = {
      getSystemInfoSync: jest.fn(() => ({ windowWidth: 375 })),
      createCanvasContext: jest.fn(() => canvasContext),
      nextTick: jest.fn((callback) => callback())
    };

    loadComponentModule();
  });

  afterEach(() => {
    delete global.Component;
    delete global.wx;
  });

  it('50% 进度应从 6 点方向开始顺时针绘制半圈', () => {
    const component = createComponentInstance();

    componentConfig.lifetimes.attached.call(component);
    componentConfig.lifetimes.ready.call(component);
    component._updateProgress(50);

    expect(global.wx.createCanvasContext).toHaveBeenCalledWith('progress-ring-canvas', component);

    const progressArcCall = canvasContext.arc.mock.calls[canvasContext.arc.mock.calls.length - 1];
    const startAngle = progressArcCall[3];
    const endAngle = progressArcCall[4];

    expect(startAngle).toBeCloseTo(Math.PI / 2, 5);
    expect(endAngle).toBeCloseTo(Math.PI / 2 + Math.PI, 5);
    expect(progressArcCall[5]).toBe(false);
  });

  it('percent observer 应对输入值做 0-100 截断', () => {
    const component = createComponentInstance();
    componentConfig.lifetimes.attached.call(component);
    componentConfig.lifetimes.ready.call(component);

    componentConfig.properties.percent.observer.call(component, 180);
    expect(component.data.progress).toBe(100);

    componentConfig.properties.percent.observer.call(component, -20);
    expect(component.data.progress).toBe(0);
  });
});
