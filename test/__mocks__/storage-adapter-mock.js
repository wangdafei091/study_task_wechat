/**
 * storage-adapter-mock.js - 存储适配器Mock
 *
 * 用于测试时模拟微信存储操作
 */

class MockStorageAdapter {
  constructor() {
    this.data = {};
  }

  async set(key, value) {
    this.data[key] = value;
    return true;
  }

  async get(key) {
    return this.data[key] || null;
  }

  async remove(key) {
    delete this.data[key];
    return true;
  }

  async clear() {
    this.data = {};
    return true;
  }

  async getAll() {
    return { ...this.data };
  }

  // 清空所有数据
  clearAll() {
    this.data = {};
  }
}

module.exports = MockStorageAdapter;
