jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const logger = require('../../utils/logger');
const StorageAdapter = require('../../adapters/storage-adapter');

describe('StorageAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    global.wx = {
      getStorageSync: jest.fn(),
      setStorageSync: jest.fn(),
      removeStorageSync: jest.fn(),
      getStorage: jest.fn(),
      setStorage: jest.fn(),
      removeStorage: jest.fn(),
      getStorageInfo: jest.fn()
    };
  });

  afterEach(() => {
    delete global.wx;
  });

  it('应支持命名空间读写与缓存命中', () => {
    const adapter = new StorageAdapter({ namespace: 'task_' });
    global.wx.getStorageSync.mockReturnValueOnce({ id: '1' });

    expect(adapter.get('draft')).toEqual({ id: '1' });
    expect(global.wx.getStorageSync).toHaveBeenCalledWith('task_draft');

    global.wx.getStorageSync.mockClear();
    expect(adapter.get('draft')).toEqual({ id: '1' });
    expect(global.wx.getStorageSync).not.toHaveBeenCalled();

    expect(adapter.set('draft', { id: '2' })).toBe(true);
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('task_draft', { id: '2' });
    expect(adapter.get('draft')).toEqual({ id: '2' });
  });

  it('同步读取异常或空值时应返回默认值', () => {
    const adapter = new StorageAdapter();

    global.wx.getStorageSync.mockReturnValueOnce('');
    expect(adapter.get('empty', [])).toEqual([]);

    global.wx.getStorageSync.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(adapter.get('error', 'fallback')).toBe('fallback');
    expect(logger.error).toHaveBeenCalled();
  });

  it('异步读写和删除应处理成功与 data not found 分支', async () => {
    const adapter = new StorageAdapter({ namespace: 'ns_' });

    global.wx.setStorage.mockImplementation(({ success }) => success({}));
    await expect(adapter.setAsync('taskData', [{ id: 'task-1' }])).resolves.toBe(true);

    global.wx.getStorage.mockImplementation(({ success }) => success({ data: ['x'] }));
    await expect(adapter.getAsync('list', [])).resolves.toEqual(['x']);

    global.wx.getStorage.mockImplementation(({ fail }) => fail({ errMsg: 'getStorage:fail data not found' }));
    await expect(adapter.getAsync('missing', ['fallback'])).resolves.toEqual(['fallback']);

    global.wx.removeStorage.mockImplementation(({ success }) => success({}));
    await expect(adapter.removeAsync('list')).resolves.toBe(true);
  });

  it('应支持清除命名空间和清理内存缓存', async () => {
    const adapter = new StorageAdapter({ namespace: 'task_' });
    adapter.cache = {
      task_a: { data: 1, expiry: Date.now() + 1000 },
      task_b: { data: 2, expiry: Date.now() + 1000 },
      other_c: { data: 3, expiry: Date.now() + 1000 }
    };

    global.wx.getStorageInfo.mockImplementation(({ success }) => success({
      keys: ['task_a', 'task_b', 'other_c']
    }));
    global.wx.removeStorage.mockImplementation(({ success }) => success({}));

    await expect(adapter.clearNamespace()).resolves.toBe(true);
    expect(global.wx.removeStorage).toHaveBeenCalledTimes(2);
    expect(adapter.cache.task_a).toBeUndefined();
    expect(adapter.cache.task_b).toBeUndefined();
    expect(adapter.cache.other_c).toBeDefined();

    adapter.clearCache();
    expect(adapter.cache).toEqual({});
  });

  it('无命名空间时应拒绝 clearNamespace', async () => {
    const adapter = new StorageAdapter();
    await expect(adapter.clearNamespace()).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('initializeApplicationStorage 应补齐默认存储结构', () => {
    const values = {
      taskData: null,
      messageData: undefined,
      userPoints: null,
      claimedRewards: null,
      starGroups: null
    };

    global.wx.getStorageSync.mockImplementation((key) => values[key]);
    expect(StorageAdapter.initializeApplicationStorage()).toBe(true);

    expect(global.wx.setStorageSync).toHaveBeenCalledWith('taskData', []);
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('messageData', []);
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('userPoints', 0);
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('claimedRewards', []);
    expect(global.wx.setStorageSync).toHaveBeenCalledWith('starGroups', []);
  });
});
