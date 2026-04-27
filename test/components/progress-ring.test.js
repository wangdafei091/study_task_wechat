jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const fs = require('fs');
const path = require('path');

describe('components/progressRing/progressRing', () => {
  let componentConfig;
  let canvasContext;
  let canvas2dContext;

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
      }),
      createSelectorQuery: jest.fn(() => ({
        select: jest.fn(() => ({
          fields: jest.fn((options, callback) => {
            callback({
              width: 65,
              height: 65,
              node: {
                getContext: jest.fn(() => canvas2dContext)
              }
            });
            return {
              exec: jest.fn()
            };
          })
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

    canvas2dContext = {
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      stroke: jest.fn(),
      setTransform: jest.fn(),
      lineWidth: 0,
      strokeStyle: '',
      lineCap: ''
    };

    global.wx = {
      getSystemInfoSync: jest.fn(() => ({ windowWidth: 375, platform: 'devtools', pixelRatio: 2 })),
      createCanvasContext: jest.fn(() => canvasContext),
      nextTick: jest.fn((callback) => callback())
    };

    loadComponentModule();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
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

  it('wxml 应优先显示 centerContent，避免 100% 时被完成勾号覆盖', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../components/progressRing/progressRing.wxml'),
      'utf8'
    );

    const centerIndex = wxml.indexOf('wx:if="{{centerContent}}"');
    const completeIndex = wxml.indexOf('wx:elif="{{isComplete}}"');
    expect(centerIndex).toBeGreaterThan(-1);
    expect(completeIndex).toBeGreaterThan(centerIndex);
  });

  it('wxml 不应继续渲染十字辅助线 ring-mark', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../components/progressRing/progressRing.wxml'),
      'utf8'
    );

    expect(wxml).not.toContain('ring-mark');
  });

  it('真机 2D canvas 在页面重新显示时应重新绑定并补绘', () => {
    global.wx.getSystemInfoSync.mockReturnValue({
      windowWidth: 375,
      platform: 'ios',
      pixelRatio: 3
    });

    const component = createComponentInstance();

    componentConfig.lifetimes.attached.call(component);
    componentConfig.lifetimes.ready.call(component);
    componentConfig.pageLifetimes.show.call(component);
    jest.runAllTimers();

    expect(component.data.use2dCanvas).toBe(true);
    expect(component.createSelectorQuery).toHaveBeenCalledTimes(2);
    expect(canvas2dContext.setTransform).toHaveBeenCalled();
    expect(canvas2dContext.arc).toHaveBeenCalled();
  });

  it('真机 2D canvas 初始化失败时应自动降级到旧 canvas', () => {
    global.wx.getSystemInfoSync.mockReturnValue({
      windowWidth: 375,
      platform: 'android',
      pixelRatio: 2
    });

    const component = createComponentInstance();
    component.createSelectorQuery.mockReturnValue({
      select: jest.fn(() => ({
        fields: jest.fn((options, callback) => {
          callback(null);
          return {
            exec: jest.fn()
          };
        })
      }))
    });

    componentConfig.lifetimes.attached.call(component);
    componentConfig.lifetimes.ready.call(component);
    jest.runAllTimers();

    expect(component.data.use2dCanvas).toBe(false);
    expect(global.wx.createCanvasContext).toHaveBeenCalledWith('progress-ring-canvas', component);
    expect(canvasContext.arc).toHaveBeenCalled();
  });
});
