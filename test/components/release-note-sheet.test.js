const fs = require('fs');
const path = require('path');

describe('components/release-note-sheet', () => {
  let componentConfig;

  function loadComponentModule() {
    componentConfig = null;
    global.Component = jest.fn((config) => {
      componentConfig = config;
    });

    jest.isolateModules(() => {
      require('../../components/release-note-sheet/release-note-sheet.js');
    });
  }

  function createComponentInstance() {
    const instance = {
      data: {
        ...(componentConfig.data || {})
      },
      triggerEvent: jest.fn()
    };

    Object.entries(componentConfig.methods || {}).forEach(([name, fn]) => {
      instance[name] = fn;
    });

    return instance;
  }

  beforeEach(() => {
    jest.resetModules();
    loadComponentModule();
  });

  afterEach(() => {
    delete global.Component;
  });

  it('应向外触发稍后查看和查看详情事件', () => {
    const component = createComponentInstance();

    component.onLaterTap();
    component.onDetailTap();

    expect(component.triggerEvent).toHaveBeenNthCalledWith(1, 'later', {});
    expect(component.triggerEvent).toHaveBeenNthCalledWith(2, 'detail', {});
  });

  it('模板应包含两个动作按钮', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../components/release-note-sheet/release-note-sheet.wxml'),
      'utf8'
    );

    expect(wxml).toContain('稍后查看');
    expect(wxml).toContain('查看详情');
  });
});
