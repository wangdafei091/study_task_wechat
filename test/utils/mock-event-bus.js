/**
 * mock-event-bus.js - EventBus Mock 实现
 *
 * 提供完整的事件发布、订阅、验证Mock
 */

class MockEventBus {
  constructor() {
    this.events = {};
    this.subscriptions = {};
  }

  /**
   * 发布事件
   * @param {String} eventName 事件名称
   * @param {Object} data 事件数据
   */
  emit(eventName, data) {
    // 记录事件发布
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push({
      eventName,
      data,
      timestamp: Date.now()
    });

    // 触发订阅
    if (this.subscriptions[eventName]) {
      this.subscriptions[eventName].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`MockEventBus callback error for ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * 订阅事件
   * @param {String} eventName 事件名称
   * @param {Function} callback 回调函数
   * @returns {Function} 取消订阅的函数
   */
  on(eventName, callback) {
    if (!this.subscriptions[eventName]) {
      this.subscriptions[eventName] = [];
    }
    this.subscriptions[eventName].push(callback);

    // 返回取消订阅函数
    return () => {
      const index = this.subscriptions[eventName].indexOf(callback);
      if (index > -1) {
        this.subscriptions[eventName].splice(index, 1);
      }
    };
  }

  /**
   * 取消订阅
   * @param {String} eventName 事件名称
   * @param {Function} callback 回调函数
   */
  off(eventName, callback) {
    if (!this.subscriptions[eventName]) return;
    const index = this.subscriptions[eventName].indexOf(callback);
    if (index > -1) {
      this.subscriptions[eventName].splice(index, 1);
    }
  }

  /**
   * 重置所有事件和订阅
   */
  reset() {
    this.events = {};
    this.subscriptions = {};
  }

  /**
   * 验证方法：验证事件是否被发布
   * @param {String} eventName 事件名称
   * @param {Object|Function} matcher 匹配器（对象或函数）
   */
  verifyEmit(eventName, matcher) {
    const events = this.events[eventName] || [];
    expect(events.length).toBeGreaterThan(0);

    const lastEvent = events[events.length - 1];
    if (typeof matcher === 'function') {
      matcher(lastEvent.data);
    } else {
      expect(lastEvent.data).toMatchObject(matcher);
    }
  }

  /**
   * 验证方法：验证事件未被发布
   * @param {String} eventName 事件名称
   */
  verifyNotEmit(eventName) {
    const events = this.events[eventName] || [];
    expect(events.length).toBe(0);
  }

  /**
   * 验证方法：验证事件被发布N次
   * @param {String} eventName 事件名称
   * @param {Number} count 期望的发布次数
   */
  verifyEmitCount(eventName, count) {
    const events = this.events[eventName] || [];
    expect(events.length).toBe(count);
  }

  /**
   * 验证方法：验证事件参数匹配
   * @param {String} eventName 事件名称
   * @param {Number} eventIndex 事件索引（0=最新）
   * @param {Object} matcher 期望的参数
   */
  verifyEvent(eventName, eventIndex, matcher) {
    const events = this.events[eventName] || [];
    expect(events.length).toBeGreaterThan(eventIndex);

    const event = events[eventIndex];
    expect(event.data).toMatchObject(matcher);
  }

  /**
   * 获取事件历史
   * @param {String} eventName 事件名称
   * @returns {Array} 事件数组
   */
  getEvents(eventName) {
    return this.events[eventName] || [];
  }

  /**
   * 获取订阅者数量
   * @param {String} eventName 事件名称
   * @returns {Number} 订阅者数量
   */
  getSubscriberCount(eventName) {
    return this.subscriptions[eventName]?.length || 0;
  }
}

module.exports = MockEventBus;
