/**
 * config-service.test.js - ConfigService 测试
 */

jest.mock('../../utils/logger');
jest.mock('../../adapters/storage-adapter', () => jest.fn());

const ConfigService = require('../../services/config-service');
const StorageAdapter = require('../../adapters/storage-adapter');

describe('ConfigService', () => {
  let configService;
  let mockStorageAdapter;
  let mockEventBus;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStorageAdapter = {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      clearNamespace: jest.fn()
    };

    mockEventBus = {
      emit: jest.fn()
    };

    StorageAdapter.mockImplementation(() => mockStorageAdapter);
    configService = new ConfigService({ eventBus: mockEventBus });
  });

  describe('基础读写', () => {
    it('应该使用配置命名空间初始化存储适配器', () => {
      expect(StorageAdapter).toHaveBeenCalledWith({
        namespace: 'config_',
        useCache: true,
        cacheExpiry: 300000
      });
    });

    it('get 应该返回存储值', () => {
      mockStorageAdapter.get.mockReturnValue('value1');
      expect(configService.get('key1', 'default')).toBe('value1');
      expect(mockStorageAdapter.get).toHaveBeenCalledWith('key1', 'default');
    });

    it('get 异常时应该返回默认值', () => {
      mockStorageAdapter.get.mockImplementation(() => {
        throw new Error('get error');
      });

      expect(configService.get('key1', 'default')).toBe('default');
    });

    it('set 成功时应该发出配置变更事件', () => {
      mockStorageAdapter.set.mockReturnValue(true);

      expect(configService.set('key1', 'value1')).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith('config:changed', {
        key: 'key1',
        value: 'value1'
      });
    });

    it('set 失败时不应发出事件', () => {
      mockStorageAdapter.set.mockReturnValue(false);

      expect(configService.set('key1', 'value1')).toBe(false);
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('set 异常时应返回 false', () => {
      mockStorageAdapter.set.mockImplementation(() => {
        throw new Error('set error');
      });

      expect(configService.set('key1', 'value1')).toBe(false);
    });

    it('remove 成功时应该发出删除事件', () => {
      mockStorageAdapter.remove.mockReturnValue(true);

      expect(configService.remove('key1')).toBe(true);
      expect(mockEventBus.emit).toHaveBeenCalledWith('config:removed', { key: 'key1' });
    });

    it('remove 失败时不应发出事件', () => {
      mockStorageAdapter.remove.mockReturnValue(false);

      expect(configService.remove('key1')).toBe(false);
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('remove 异常时应返回 false', () => {
      mockStorageAdapter.remove.mockImplementation(() => {
        throw new Error('remove error');
      });

      expect(configService.remove('key1')).toBe(false);
    });
  });

  describe('系统配置方法', () => {
    it('过期检查时间应正确读写', () => {
      mockStorageAdapter.get.mockReturnValue(1000);
      mockStorageAdapter.set.mockReturnValue(true);

      expect(configService.getLastExpiryCheckTime()).toBe(1000);
      expect(configService.setLastExpiryCheckTime(2000)).toBe(true);
    });

    it('首次启动标记应正确工作', () => {
      mockStorageAdapter.get.mockReturnValue(false);
      expect(configService.isFirstLaunch()).toBe(true);

      mockStorageAdapter.set.mockReturnValue(true);
      expect(configService.markUserWelcomed()).toBe(true);
    });

    it('自定义奖励标记应正确读写', () => {
      mockStorageAdapter.get.mockReturnValue(true);
      mockStorageAdapter.set.mockReturnValue(true);

      expect(configService.hasCustomRewards()).toBe(true);
      expect(configService.setCustomRewards(false)).toBe(true);
    });

    it('用户日志配置应正确读写', () => {
      const logConfig = { level: 'info' };
      mockStorageAdapter.get.mockReturnValue(logConfig);
      mockStorageAdapter.set.mockReturnValue(true);

      expect(configService.getUserLogConfig()).toEqual(logConfig);
      expect(configService.setUserLogConfig(logConfig)).toBe(true);
    });
  });

  describe('用户偏好方法', () => {
    it('应该使用 pref_ 前缀读写偏好', () => {
      mockStorageAdapter.get.mockReturnValue('on');
      mockStorageAdapter.set.mockReturnValue(true);

      expect(configService.getUserPreference('theme', 'off')).toBe('on');
      expect(mockStorageAdapter.get).toHaveBeenCalledWith('pref_theme', 'off');

      expect(configService.setUserPreference('theme', 'dark')).toBe(true);
      expect(mockStorageAdapter.set).toHaveBeenCalledWith('pref_theme', 'dark');
    });

    it('tip 标记应正确读写', () => {
      mockStorageAdapter.get.mockReturnValue(false);
      mockStorageAdapter.set.mockReturnValue(true);

      expect(configService.isTipShown('intro')).toBe(false);
      expect(configService.markTipShown('intro')).toBe(true);
      expect(mockStorageAdapter.set).toHaveBeenCalledWith('pref_tip_shown_intro', true);
    });
  });

  describe('批量操作', () => {
    it('getBatch 应返回映射结果', () => {
      mockStorageAdapter.get.mockImplementation((key, defaultValue) => {
        if (key === 'k1') return 'v1';
        if (key === 'k2') return 2;
        return defaultValue;
      });

      const result = configService.getBatch(['k1', 'k2', 'k3']);
      expect(result).toEqual({ k1: 'v1', k2: 2, k3: null });
    });

    it('setBatch 全部成功时应返回 true', () => {
      mockStorageAdapter.set.mockReturnValue(true);

      expect(configService.setBatch({ a: 1, b: 2 })).toBe(true);
      expect(mockStorageAdapter.set).toHaveBeenCalledTimes(2);
    });

    it('setBatch 部分失败时应返回 false', () => {
      mockStorageAdapter.set
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      expect(configService.setBatch({ a: 1, b: 2 })).toBe(false);
    });
  });

  describe('清理', () => {
    it('clearAll 成功时应返回 true', async () => {
      mockStorageAdapter.clearNamespace.mockResolvedValue(true);
      await expect(configService.clearAll()).resolves.toBe(true);
    });

    it('clearAll 异常时应返回 false', async () => {
      mockStorageAdapter.clearNamespace.mockRejectedValue(new Error('clear failed'));
      await expect(configService.clearAll()).resolves.toBe(false);
    });
  });
});
