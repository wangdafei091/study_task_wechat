/**
 * config-service.test.js - 配置服务测试
 */

// Mock微信API
global.wx = {
  getStorageSync: jest.fn(),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
  getAppBaseInfo: () => ({ platform: 'devtools' }),
  getDeviceInfo: () => ({ platform: 'devtools' })
};

const ConfigService = require('../../services/config-service');
const EventBus = require('../../utils/core/event-bus');

describe('ConfigService', () => {
  let configService;
  let eventBus;

  beforeEach(() => {
    // 清除所有mock调用
    jest.clearAllMocks();
    
    // 创建EventBus实例
    eventBus = new EventBus();
    
    // 创建ConfigService实例
    configService = new ConfigService({
      eventBus: eventBus
    });
  });

  describe('基础配置操作', () => {
    test('应该能够设置和获取配置', () => {
      // Mock存储返回值
      wx.getStorageSync.mockReturnValue('test_value');
      wx.setStorageSync.mockReturnValue(true);

      // 设置配置
      const setResult = configService.set('test_key', 'test_value');
      expect(setResult).toBe(true);
      expect(wx.setStorageSync).toHaveBeenCalledWith('config_test_key', 'test_value');

      // 获取配置 - ConfigService使用缓存，所以获取的是缓存值
      const getValue = configService.get('test_key');
      expect(getValue).toBe('test_value');
      // 由于使用了缓存，第二次获取不会调用wx.getStorageSync
      // expect(wx.getStorageSync).toHaveBeenCalledWith('config_test_key');
    });

    test('获取不存在的配置应该返回默认值', () => {
      wx.getStorageSync.mockReturnValue(null);

      const value = configService.get('nonexistent_key', 'default_value');
      expect(value).toBe('default_value');
    });

    test('设置配置失败时应该返回false', () => {
      wx.setStorageSync.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const result = configService.set('test_key', 'test_value');
      expect(result).toBe(false);
    });

    test('应该能够删除配置', () => {
      wx.removeStorageSync.mockReturnValue(true);

      const result = configService.remove('test_key');
      expect(result).toBe(true);
      expect(wx.removeStorageSync).toHaveBeenCalledWith('config_test_key');
    });
  });

  describe('系统配置方法', () => {
    test('应该能够管理过期检查时间戳', () => {
      wx.getStorageSync.mockReturnValue(1234567890);
      wx.setStorageSync.mockReturnValue(true);

      // 获取过期检查时间戳
      const timestamp = configService.getLastExpiryCheckTime();
      expect(timestamp).toBe(1234567890);
      expect(wx.getStorageSync).toHaveBeenCalledWith('config_last_expiry_check_time');

      // 设置过期检查时间戳
      const now = Date.now();
      const setResult = configService.setLastExpiryCheckTime(now);
      expect(setResult).toBe(true);
      expect(wx.setStorageSync).toHaveBeenCalledWith('config_last_expiry_check_time', now);
    });

    test('应该能够管理首次启动标记', () => {
      // 测试首次启动
      wx.getStorageSync.mockReturnValue(false);
      expect(configService.isFirstLaunch()).toBe(true);

      // 标记已欢迎用户
      wx.setStorageSync.mockReturnValue(true);
      const markResult = configService.markUserWelcomed();
      expect(markResult).toBe(true);
      expect(wx.setStorageSync).toHaveBeenCalledWith('config_has_welcomed_user', true);

      // 测试非首次启动
      wx.getStorageSync.mockReturnValue(true);
      expect(configService.isFirstLaunch()).toBe(false);
    });

    test('应该能够管理自定义奖励标记', () => {
      wx.getStorageSync.mockReturnValue(true);
      wx.setStorageSync.mockReturnValue(true);

      // 检查自定义奖励标记
      const hasCustom = configService.hasCustomRewards();
      expect(hasCustom).toBe(true);
      expect(wx.getStorageSync).toHaveBeenCalledWith('config_has_custom_rewards');

      // 设置自定义奖励标记
      const setResult = configService.setCustomRewards(true);
      expect(setResult).toBe(true);
      expect(wx.setStorageSync).toHaveBeenCalledWith('config_has_custom_rewards', true);
    });

    test('应该能够管理用户日志配置', () => {
      const logConfig = { levels: { debug: true, info: true } };
      wx.getStorageSync.mockReturnValue(logConfig);
      wx.setStorageSync.mockReturnValue(true);

      // 获取用户日志配置
      const config = configService.getUserLogConfig();
      expect(config).toEqual(logConfig);
      expect(wx.getStorageSync).toHaveBeenCalledWith('config_user_log_config');

      // 设置用户日志配置
      const setResult = configService.setUserLogConfig(logConfig);
      expect(setResult).toBe(true);
      expect(wx.setStorageSync).toHaveBeenCalledWith('config_user_log_config', logConfig);
    });
  });

  describe('用户偏好方法', () => {
    test('应该能够管理用户偏好', () => {
      wx.getStorageSync.mockReturnValue('preference_value');
      wx.setStorageSync.mockReturnValue(true);

      // 获取用户偏好
      const preference = configService.getUserPreference('theme', 'light');
      expect(preference).toBe('preference_value');
      expect(wx.getStorageSync).toHaveBeenCalledWith('config_pref_theme');

      // 设置用户偏好
      const setResult = configService.setUserPreference('theme', 'dark');
      expect(setResult).toBe(true);
      expect(wx.setStorageSync).toHaveBeenCalledWith('config_pref_theme', 'dark');
    });

    test('应该能够管理提示显示状态', () => {
      wx.getStorageSync.mockReturnValue(true);
      wx.setStorageSync.mockReturnValue(true);

      // 检查提示是否已显示
      const isShown = configService.isTipShown('welcome');
      expect(isShown).toBe(true);
      expect(wx.getStorageSync).toHaveBeenCalledWith('config_pref_tip_shown_welcome');

      // 标记提示已显示
      const markResult = configService.markTipShown('welcome');
      expect(markResult).toBe(true);
      expect(wx.setStorageSync).toHaveBeenCalledWith('config_pref_tip_shown_welcome', true);
    });
  });

  describe('批量操作方法', () => {
    test('应该能够批量获取配置', () => {
      wx.getStorageSync
        .mockReturnValueOnce('value1')
        .mockReturnValueOnce('value2')
        .mockReturnValueOnce(null);

      const configs = configService.getBatch(['key1', 'key2', 'key3']);
      
      expect(configs).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: null
      });
      
      expect(wx.getStorageSync).toHaveBeenCalledTimes(3);
    });

    test('应该能够批量设置配置', () => {
      wx.setStorageSync.mockReturnValue(true);

      const configs = {
        key1: 'value1',
        key2: 'value2'
      };

      const result = configService.setBatch(configs);
      expect(result).toBe(true);
      expect(wx.setStorageSync).toHaveBeenCalledTimes(2);
      expect(wx.setStorageSync).toHaveBeenCalledWith('config_key1', 'value1');
      expect(wx.setStorageSync).toHaveBeenCalledWith('config_key2', 'value2');
    });

    test('批量设置时部分失败应该返回false', () => {
      // Mock StorageAdapter的set方法失败
      configService.storageAdapter.set = jest.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const configs = {
        key1: 'value1',
        key2: 'value2'
      };

      const result = configService.setBatch(configs);
      expect(result).toBe(false);
    });
  });

  describe('事件机制', () => {
    test('设置配置时应该触发事件', () => {
      wx.setStorageSync.mockReturnValue(true);
      
      const eventSpy = jest.spyOn(eventBus, 'emit');

      configService.set('test_key', 'test_value');

      expect(eventSpy).toHaveBeenCalledWith('config:changed', {
        key: 'test_key',
        value: 'test_value'
      });
    });

    test('删除配置时应该触发事件', () => {
      wx.removeStorageSync.mockReturnValue(true);
      
      const eventSpy = jest.spyOn(eventBus, 'emit');

      configService.remove('test_key');

      expect(eventSpy).toHaveBeenCalledWith('config:removed', {
        key: 'test_key'
      });
    });

    test('没有eventBus时不应该抛出错误', () => {
      const configServiceNoEvent = new ConfigService();
      wx.setStorageSync.mockReturnValue(true);

      expect(() => {
        configServiceNoEvent.set('test_key', 'test_value');
      }).not.toThrow();
    });
  });

  describe('错误处理', () => {
    test('存储操作异常时应该优雅处理', () => {
      wx.getStorageSync.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const value = configService.get('test_key', 'default');
      expect(value).toBe('default');
    });

    test('清除所有配置时应该处理异常', async () => {
      // Mock storageAdapter
      configService.storageAdapter = {
        clearNamespace: jest.fn().mockRejectedValue(new Error('Clear failed'))
      };

      const result = await configService.clearAll();
      expect(result).toBe(false);
    });
  });
}); 