jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const fs = require('fs');
const path = require('path');

describe('components/user-switcher', () => {
  let componentConfig;

  function loadComponentModule() {
    componentConfig = null;
    global.Component = jest.fn((config) => {
      componentConfig = config;
    });

    jest.isolateModules(() => {
      require('../../components/user-switcher/user-switcher.js');
    });
  }

  function createComponentInstance(data = {}) {
    const instance = {
      data: {
        ...(componentConfig.data || {}),
        currentUser: { userId: 'parent_1', role: 'parent', name: '家长' },
        availableUsers: [
          { userId: 'child_1', role: 'child', name: '小明', avatar: 'preset:cat', familyId: 'fam_1', isVirtual: true }
        ],
        ...data
      },
      setData: jest.fn(function setData(update) {
        Object.assign(this.data, update);
      }),
      triggerEvent: jest.fn()
    };

    Object.entries(componentConfig.methods || {}).forEach(([name, fn]) => {
      instance[name] = fn;
    });

    return instance;
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    global.wx = {
      showToast: jest.fn(),
      showActionSheet: jest.fn(),
      createAnimation: jest.fn(() => ({
        translateY: jest.fn().mockReturnThis(),
        opacity: jest.fn().mockReturnThis(),
        step: jest.fn().mockReturnThis(),
        export: jest.fn(() => ({ ok: true }))
      }))
    };

    loadComponentModule();
  });

  afterEach(() => {
    delete global.Component;
    delete global.wx;
  });

  it('取消称呼提交后应重置 submitting，并忽略旧请求回调', () => {
    const component = createComponentInstance({
      showNicknameDialog: true,
      nicknameInput: '新称呼',
      nicknameTargetUserId: 'child_1'
    });

    component.confirmNicknameEdit();
    const payload = component.triggerEvent.mock.calls[0][1];

    expect(component.data.isNicknameSubmitting).toBe(true);

    component.cancelNicknameEdit();
    component.openNicknameDialog('child_1');
    component.onNicknameInput({ detail: { value: '第二次输入' } });
    payload.onSuccess();

    expect(component.data.isNicknameSubmitting).toBe(false);
    expect(component.data.showNicknameDialog).toBe(true);
    expect(component.data.nicknameInput).toBe('第二次输入');
  });

  it('取消头像提交后应重置 submitting，并忽略旧请求回调', () => {
    const component = createComponentInstance({
      showAvatarDialog: true,
      avatarTargetUserId: 'child_1',
      selectedAvatarPresetId: 'fox',
      avatarPresetOptions: [{ presetId: 'fox', selected: true }]
    });

    component.confirmAvatarPreset();
    const payload = component.triggerEvent.mock.calls[0][1];

    expect(component.data.isAvatarSubmitting).toBe(true);

    component.cancelAvatarDialog();
    component.openAvatarDialog('child_1');
    component.selectAvatarPreset({ currentTarget: { dataset: { presetId: 'dog' } } });
    payload.onFailure();

    expect(component.data.isAvatarSubmitting).toBe(false);
    expect(component.data.showAvatarDialog).toBe(true);
    expect(component.data.selectedAvatarPresetId).toBe('dog');
  });

  it('孩子视角下的管理动作不应再包含删除', () => {
    const component = createComponentInstance({
      currentUser: { userId: 'child_1', role: 'child', name: '小明', familyId: 'fam_1', isVirtual: true },
      loginUserId: 'parent_1',
      permissionContext: {
        loginUserId: 'parent_1',
        loginUserRole: 'parent',
        familyId: 'fam_1',
        familyPermissionRole: 'manager',
        isSwitchedChildView: true,
        isSystemBlocked: false,
        isSystemReadonly: false,
        isViewerReadonly: false
      }
    });

    component.rebuildDisplayState();

    expect(component.data.switcherDisplayState.currentCard.managementActions).toEqual(['rename', 'pickAvatar']);
  });

  it('管理动作菜单不应再提供删除成员', () => {
    const component = createComponentInstance({
      switcherDisplayState: {
        currentCard: {
          userId: 'child_1',
          managementActions: ['rename', 'pickAvatar']
        },
        switchableUsers: [],
        footerAction: { visible: false, text: '添加成员' }
      }
    });

    component.openManagementActions({
      currentTarget: {
        dataset: {
          userId: 'child_1'
        }
      }
    });

    expect(global.wx.showActionSheet).toHaveBeenCalledWith(expect.objectContaining({
      itemList: ['修改称呼', '更换头像']
    }));
  });

  it('孩子候选项尾部更多按钮应直接拦截点击并打开管理菜单', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../../components/user-switcher/user-switcher.wxml'),
      'utf8'
    );

    expect(wxml).toContain('catchtap="openManagementActions"');
    expect(wxml).not.toContain('bindtap="openManagementActions"\n                catchtap="preventBubble"');
    expect(wxml).toContain('<view class="switchable-trailing" wx:if="{{switcherDisplayState.currentCard.managementActions.length > 0}}">');
    expect(wxml).toContain('<identity-avatar');
    expect(wxml).toContain('size="card"');
    expect(wxml).toContain('avatarAccentColor="{{item.avatarAccentColor}}"');
  });
});
