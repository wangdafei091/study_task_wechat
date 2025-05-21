/**
 * StorageAdapter模拟实现
 * 用于测试仓储层
 */

class MockStorageAdapter {
  constructor(options = {}) {
    this.namespace = options.namespace || '';
    this.storage = {};
    this.getAsyncMock = jest.fn(this.getAsync.bind(this));
    this.setAsyncMock = jest.fn(this.setAsync.bind(this));
    this.removeAsyncMock = jest.fn(this.removeAsync.bind(this));
    this.getMock = jest.fn(this.get.bind(this));
    this.setMock = jest.fn(this.set.bind(this));
    this.removeMock = jest.fn(this.remove.bind(this));
  }
  
  _getFullKey(key) {
    return this.namespace ? `${this.namespace}${key}` : key;
  }
  
  async getAsync(key, defaultValue = null) {
    const fullKey = this._getFullKey(key);
    return this.storage[fullKey] !== undefined ? this.storage[fullKey] : defaultValue;
  }
  
  async setAsync(key, data) {
    const fullKey = this._getFullKey(key);
    this.storage[fullKey] = JSON.parse(JSON.stringify(data)); // 深拷贝
    return true;
  }
  
  async removeAsync(key) {
    const fullKey = this._getFullKey(key);
    delete this.storage[fullKey];
    return true;
  }
  
  get(key, defaultValue = null) {
    const fullKey = this._getFullKey(key);
    return this.storage[fullKey] !== undefined ? this.storage[fullKey] : defaultValue;
  }
  
  set(key, data) {
    const fullKey = this._getFullKey(key);
    this.storage[fullKey] = JSON.parse(JSON.stringify(data)); // 深拷贝
    return true;
  }
  
  remove(key) {
    const fullKey = this._getFullKey(key);
    delete this.storage[fullKey];
    return true;
  }
  
  // 清空存储(仅测试用)
  _reset() {
    this.storage = {};
  }
  
  // 检查存储内容(仅测试用)
  _getStorage() {
    return { ...this.storage };
  }
}

module.exports = MockStorageAdapter; 