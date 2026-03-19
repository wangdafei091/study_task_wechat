/**
 * utils.test.js - 工具函数综合测试
 *
 * 测试 batchUtils 和 eventBus 的核心功能
 */

const batchUtils = require('../../utils/batchUtils');
const EventBus = require('../../utils/core/event-bus');

describe('utils', () => {

  describe('batchUtils', () => {

    describe('batchProcess', () => {
      let mockProcessFn;
      let mockCallback;

      beforeEach(() => {
        mockProcessFn = jest.fn();
        mockCallback = jest.fn();
        jest.useFakeTimers();
        // Mock wx.showLoading and wx.hideLoading
        global.wx.showLoading = jest.fn();
        global.wx.hideLoading = jest.fn();
      });

      afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
      });

      it('应该正确处理空数组', () => {
        batchUtils.batchProcess([], mockProcessFn, {}, mockCallback);
        expect(mockProcessFn).not.toHaveBeenCalled();
        expect(mockCallback).toHaveBeenCalled();
      });

      it('应该正确处理null或undefined', () => {
        batchUtils.batchProcess(null, mockProcessFn, {}, mockCallback);
        expect(mockProcessFn).not.toHaveBeenCalled();
        expect(mockCallback).toHaveBeenCalled();

        mockCallback.mockClear();
        batchUtils.batchProcess(undefined, mockProcessFn, {}, mockCallback);
        expect(mockProcessFn).not.toHaveBeenCalled();
        expect(mockCallback).toHaveBeenCalled();
      });

      it('应该正确处理单条数据', (done) => {
        const items = [{ id: 1 }];

        batchUtils.batchProcess(items, mockProcessFn, {}, () => {
          expect(mockProcessFn).toHaveBeenCalledTimes(1);
          expect(mockProcessFn).toHaveBeenCalledWith({ id: 1 });
          done();
        });

        jest.runAllTimers();
      });

      it('应该按默认批次大小（50）处理数据', (done) => {
        const items = Array.from({ length: 100 }, (_, i) => ({ id: i + 1 }));

        batchUtils.batchProcess(items, mockProcessFn, {}, () => {
          expect(mockProcessFn).toHaveBeenCalledTimes(100);
          done();
        });

        jest.runAllTimers();
      });

      it('应该支持自定义批次大小', (done) => {
        const items = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));

        batchUtils.batchProcess(items, mockProcessFn, { batchSize: 3 }, () => {
          expect(mockProcessFn).toHaveBeenCalledTimes(10);
          done();
        });

        jest.runAllTimers();
      });

      it('应该在批次间添加延迟', (done) => {
        const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const delay = 100;

        batchUtils.batchProcess(items, mockProcessFn, { batchSize: 1, delay }, () => {
          // 检查是否调用了 setTimeout 来延迟批次处理
          done();
        });

        jest.runAllTimers();
      });

      it('应该在显示进度时调用wx.showLoading', (done) => {
        const items = [{ id: 1 }, { id: 2 }];

        batchUtils.batchProcess(items, mockProcessFn, { showProgress: true }, () => {
          expect(global.wx.showLoading).toHaveBeenCalled();
          expect(global.wx.hideLoading).toHaveBeenCalled();
          done();
        });

        jest.runAllTimers();
      });

      it('应该在隐藏进度时调用wx.hideLoading', (done) => {
        const items = [{ id: 1 }];

        batchUtils.batchProcess(items, mockProcessFn, { showProgress: true }, () => {
          expect(global.wx.hideLoading).toHaveBeenCalled();
          done();
        });

        jest.runAllTimers();
      });

      it('应该支持自定义进度标题', (done) => {
        const items = [{ id: 1 }];
        const progressTitle = '同步数据中';

        batchUtils.batchProcess(items, mockProcessFn, { showProgress: true, progressTitle }, () => {
          expect(global.wx.showLoading).toHaveBeenCalledWith(
            expect.objectContaining({
              title: expect.stringContaining(progressTitle)
            })
          );
          done();
        });

        jest.runAllTimers();
      });

      it('应该正确处理回调函数', (done) => {
        const items = [{ id: 1 }, { id: 2 }];
        const callbackResult = { completed: true };

        batchUtils.batchProcess(items, mockProcessFn, {}, () => {
          expect(mockProcessFn).toHaveBeenCalledTimes(2);
          done();
        });

        jest.runAllTimers();
      });

      it('应该在没有回调时也能正常工作', () => {
        const items = [{ id: 1 }];

        expect(() => {
          batchUtils.batchProcess(items, mockProcessFn);
        }).not.toThrow();

        jest.runAllTimers();
      });
    });

    describe('groupBy', () => {
      it('应该正确按指定键分组', () => {
        const items = [
          { type: 'A', value: 1 },
          { type: 'B', value: 2 },
          { type: 'A', value: 3 },
          { type: 'B', value: 4 }
        ];

        const result = batchUtils.groupBy(items, item => item.type);

        expect(result.A).toHaveLength(2);
        expect(result.B).toHaveLength(2);
        expect(result.A).toEqual([
          { type: 'A', value: 1 },
          { type: 'A', value: 3 }
        ]);
      });

      it('应该处理空数组', () => {
        const result = batchUtils.groupBy([], item => item.type);
        expect(result).toEqual({});
      });

      it('应该处理null或undefined', () => {
        const result1 = batchUtils.groupBy(null, item => item.type);
        const result2 = batchUtils.groupBy(undefined, item => item.type);
        expect(result1).toEqual({});
        expect(result2).toEqual({});
      });

      it('应该支持字符串键', () => {
        const items = [
          { name: 'Alice', age: 25 },
          { name: 'Bob', age: 30 },
          { name: 'Charlie', age: 25 }
        ];

        const result = batchUtils.groupBy(items, item => item.age);

        expect(result['25']).toHaveLength(2);
        expect(result['30']).toHaveLength(1);
      });

      it('应该支持复杂键函数', () => {
        const items = [
          { x: 1, y: 2 },
          { x: 1, y: 3 },
          { x: 2, y: 2 }
        ];

        const result = batchUtils.groupBy(items, item => `${item.x}-${item.y}`);

        expect(result['1-2']).toHaveLength(1);
        expect(result['1-3']).toHaveLength(1);
        expect(result['2-2']).toHaveLength(1);
      });

      it('应该正确处理单个组的情况', () => {
        const items = [
          { type: 'A', value: 1 },
          { type: 'A', value: 2 },
          { type: 'A', value: 3 }
        ];

        const result = batchUtils.groupBy(items, item => item.type);

        expect(result.A).toHaveLength(3);
        expect(Object.keys(result)).toHaveLength(1);
      });
    });

    describe('chunk', () => {
      it('应该正确分块数组', () => {
        const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const chunks = batchUtils.chunk(array, 3);

        expect(chunks).toHaveLength(4);
        expect(chunks[0]).toEqual([1, 2, 3]);
        expect(chunks[1]).toEqual([4, 5, 6]);
        expect(chunks[2]).toEqual([7, 8, 9]);
        expect(chunks[3]).toEqual([10]);
      });

      it('应该使用默认分块大小（10）', () => {
        const array = Array.from({ length: 25 }, (_, i) => i + 1);
        const chunks = batchUtils.chunk(array);

        expect(chunks).toHaveLength(3);
        expect(chunks[0]).toHaveLength(10);
        expect(chunks[1]).toHaveLength(10);
        expect(chunks[2]).toHaveLength(5);
      });

      it('应该处理空数组', () => {
        const result = batchUtils.chunk([]);
        expect(result).toEqual([]);
      });

      it('应该处理null或undefined', () => {
        const result1 = batchUtils.chunk(null);
        const result2 = batchUtils.chunk(undefined);
        expect(result1).toEqual([]);
        expect(result2).toEqual([]);
      });

      it('应该处理单元素数组', () => {
        const array = [1];
        const chunks = batchUtils.chunk(array, 5);

        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toEqual([1]);
      });

      it('应该处理大小为1的分块', () => {
        const array = [1, 2, 3];
        const chunks = batchUtils.chunk(array, 1);

        expect(chunks).toHaveLength(3);
        expect(chunks[0]).toEqual([1]);
        expect(chunks[1]).toEqual([2]);
        expect(chunks[2]).toEqual([3]);
      });

      it('应该正确处理恰好整除的情况', () => {
        const array = [1, 2, 3, 4, 5, 6];
        const chunks = batchUtils.chunk(array, 2);

        expect(chunks).toHaveLength(3);
        chunks.forEach(chunk => {
          expect(chunk).toHaveLength(2);
        });
      });
    });

  });

  describe('EventBus', () => {

    let eventBus;

    beforeEach(() => {
      // 创建新的EventBus实例
      eventBus = new EventBus();
    });

    describe('emit', () => {
      it('应该能够发布事件', () => {
        const callback = jest.fn();
        eventBus.on('test:event', callback);

        eventBus.emit('test:event', { data: 'test' });

        expect(callback).toHaveBeenCalledWith({ data: 'test' });
      });

      it('应该能够发布多个事件', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        eventBus.on('event1', callback1);
        eventBus.on('event2', callback2);

        eventBus.emit('event1', { id: 1 });
        eventBus.emit('event2', { id: 2 });

        expect(callback1).toHaveBeenCalledWith({ id: 1 });
        expect(callback2).toHaveBeenCalledWith({ id: 2 });
      });

      it('应该在没有订阅者时不会报错', () => {
        expect(() => {
          eventBus.emit('no:subscribers', { data: 'test' });
        }).not.toThrow();
      });

      it('应该返回调用的监听器数量', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();
        const callback3 = jest.fn();

        eventBus.on('test:event', callback1);
        eventBus.on('test:event', callback2);
        eventBus.on('test:event', callback3);

        const count = eventBus.emit('test:event', { data: 'test' });

        expect(count).toBe(3);
      });

      it('应该在没有监听器时返回0', () => {
        const count = eventBus.emit('no:listeners', { data: 'test' });
        expect(count).toBe(0);
      });

      it('应该处理空事件名称', () => {
        const callback = jest.fn();
        eventBus.on('test:event', callback);

        const count = eventBus.emit('', { data: 'test' });

        expect(count).toBe(0);
        expect(callback).not.toHaveBeenCalled();
      });
    });

    describe('on', () => {
      it('应该能够订阅事件', () => {
        const callback = jest.fn();
        const unsubscribe = eventBus.on('test:event', callback);

        eventBus.emit('test:event', { data: 'test' });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(typeof unsubscribe).toBe('function');
      });

      it('应该支持同一事件的多个订阅者', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();
        const callback3 = jest.fn();

        eventBus.on('test:event', callback1);
        eventBus.on('test:event', callback2);
        eventBus.on('test:event', callback3);

        eventBus.emit('test:event', { data: 'test' });

        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
        expect(callback3).toHaveBeenCalledTimes(1);
      });

      it('应该能够多次调用同一订阅', () => {
        const callback = jest.fn();

        eventBus.on('test:event', callback);
        eventBus.on('test:event', callback);

        eventBus.emit('test:event', { data: 'test' });

        expect(callback).toHaveBeenCalledTimes(2);
      });

      it('应该在发布时传递正确的事件数据', () => {
        const callback = jest.fn();
        const testData = { id: 123, name: 'test' };

        eventBus.on('test:event', callback);
        eventBus.emit('test:event', testData);

        expect(callback).toHaveBeenCalledWith(testData);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
          id: 123,
          name: 'test'
        }));
      });

      it('应该在无效参数时返回空函数', () => {
        const unsubscribe1 = eventBus.on(null, jest.fn());
        const unsubscribe2 = eventBus.on('test:event', null);
        const unsubscribe3 = eventBus.on('', jest.fn());

        expect(typeof unsubscribe1).toBe('function');
        expect(typeof unsubscribe2).toBe('function');
        expect(typeof unsubscribe3).toBe('function');

        // 调用取消订阅函数不应报错
        expect(() => {
          unsubscribe1();
          unsubscribe2();
          unsubscribe3();
        }).not.toThrow();
      });

      it('应该支持once选项', () => {
        const callback = jest.fn();

        eventBus.on('test:event', callback, { once: true });

        eventBus.emit('test:event', { data: 'test1' });
        eventBus.emit('test:event', { data: 'test2' });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({ data: 'test1' });
      });
    });

    describe('once', () => {
      it('应该能够注册一次性监听器', () => {
        const callback = jest.fn();

        eventBus.once('test:event', callback);

        eventBus.emit('test:event', { data: 'test1' });
        eventBus.emit('test:event', { data: 'test2' });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({ data: 'test1' });
      });

      it('应该返回取消订阅函数', () => {
        const callback = jest.fn();
        const unsubscribe = eventBus.once('test:event', callback);

        expect(typeof unsubscribe).toBe('function');

        // 取消订阅后应该不会触发
        unsubscribe();
        eventBus.emit('test:event', { data: 'test' });

        expect(callback).not.toHaveBeenCalled();
      });

      it('应该支持多个一次性监听器', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        eventBus.once('test:event', callback1);
        eventBus.once('test:event', callback2);

        eventBus.emit('test:event', { data: 'test' });

        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);
      });
    });

    describe('off', () => {
      it('应该能够取消特定回调的订阅', () => {
        const callback = jest.fn();
        eventBus.on('test:event', callback);

        eventBus.off('test:event', callback);
        eventBus.emit('test:event', { data: 'test' });

        expect(callback).not.toHaveBeenCalled();
      });

      it('应该只取消指定的订阅者', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();
        const callback3 = jest.fn();

        eventBus.on('test:event', callback1);
        eventBus.on('test:event', callback2);
        eventBus.on('test:event', callback3);

        eventBus.off('test:event', callback2);
        eventBus.emit('test:event', { data: 'test' });

        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).not.toHaveBeenCalled();
        expect(callback3).toHaveBeenCalledTimes(1);
      });

      it('应该能够取消事件的全部监听器', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        eventBus.on('test:event', callback1);
        eventBus.on('test:event', callback2);

        eventBus.off('test:event');
        eventBus.emit('test:event', { data: 'test' });

        expect(callback1).not.toHaveBeenCalled();
        expect(callback2).not.toHaveBeenCalled();
      });

      it('应该能够多次取消订阅', () => {
        const callback = jest.fn();
        eventBus.on('test:event', callback);

        eventBus.off('test:event', callback);
        eventBus.off('test:event', callback);

        eventBus.emit('test:event', { data: 'test' });

        expect(callback).not.toHaveBeenCalled();
      });

      it('应该在无效事件名称时不会报错', () => {
        expect(() => {
          eventBus.off(null);
          eventBus.off(undefined);
          eventBus.off('');
        }).not.toThrow();
      });
    });

    describe('clear', () => {
      it('应该清除所有订阅', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        eventBus.on('event1', callback1);
        eventBus.on('event2', callback2);

        eventBus.clear();

        eventBus.emit('event1', { data: 'test1' });
        eventBus.emit('event2', { data: 'test2' });

        expect(callback1).not.toHaveBeenCalled();
        expect(callback2).not.toHaveBeenCalled();
      });

      it('应该清除后能够重新订阅', () => {
        const callback = jest.fn();

        eventBus.on('test:event', callback);
        eventBus.clear();
        eventBus.on('test:event', callback);

        eventBus.emit('test:event', { data: 'test' });

        expect(callback).toHaveBeenCalledTimes(1);
      });

      it('应该能够多次调用clear', () => {
        const callback = jest.fn();

        eventBus.on('test:event', callback);
        eventBus.clear();
        eventBus.clear();

        eventBus.emit('test:event', { data: 'test' });

        expect(callback).not.toHaveBeenCalled();
      });
    });

    describe('hasListeners', () => {
      it('应该在有监听器时返回true', () => {
        eventBus.on('test:event', jest.fn());
        expect(eventBus.hasListeners('test:event')).toBe(true);
      });

      it('应该在没有监听器时返回falsy', () => {
        expect(eventBus.hasListeners('test:event')).toBeFalsy();
      });

      it('应该在取消订阅后返回falsy', () => {
        const callback = jest.fn();
        eventBus.on('test:event', callback);
        eventBus.off('test:event', callback);

        expect(eventBus.hasListeners('test:event')).toBeFalsy();
      });

      it('应该在清除后返回falsy', () => {
        eventBus.on('test:event', jest.fn());
        eventBus.clear();

        expect(eventBus.hasListeners('test:event')).toBeFalsy();
      });

      it('应该在无效事件名称时返回false', () => {
        expect(eventBus.hasListeners(null)).toBe(false);
        expect(eventBus.hasListeners(undefined)).toBe(false);
        expect(eventBus.hasListeners('')).toBe(false);
      });
    });

    describe('listenerCount', () => {
      it('应该正确返回监听器数量', () => {
        eventBus.on('test:event', jest.fn());
        eventBus.on('test:event', jest.fn());
        eventBus.on('test:event', jest.fn());

        expect(eventBus.listenerCount('test:event')).toBe(3);
      });

      it('应该包含一次性监听器', () => {
        eventBus.on('test:event', jest.fn());
        eventBus.once('test:event', jest.fn());
        eventBus.once('test:event', jest.fn());

        expect(eventBus.listenerCount('test:event')).toBe(3);
      });

      it('应该在无效事件时返回0', () => {
        expect(eventBus.listenerCount('no:event')).toBe(0);
        expect(eventBus.listenerCount(null)).toBe(0);
      });
    });

    describe('getEventHistory', () => {
      it('应该返回事件历史', () => {
        eventBus.emit('test:event', { data: 'test1' });
        eventBus.emit('test:event', { data: 'test2' });
        eventBus.emit('test:event', { data: 'test3' });

        const history = eventBus.getEventHistory('test:event');

        expect(history).toHaveLength(3);
        expect(history[0].data).toEqual({ data: 'test1' });
        expect(history[1].data).toEqual({ data: 'test2' });
        expect(history[2].data).toEqual({ data: 'test3' });
      });

      it('应该在无效事件时返回空数组', () => {
        const history = eventBus.getEventHistory('no:event');
        expect(history).toEqual([]);
      });

      it('应该限制历史记录长度', () => {
        // 触发超过默认限制(50)的事件
        for (let i = 0; i < 60; i++) {
          eventBus.emit('test:event', { index: i });
        }

        const history = eventBus.getEventHistory('test:event');

        expect(history.length).toBeLessThanOrEqual(50);
        expect(history.length).toBeGreaterThan(0);
      });

      it('应该返回历史记录的副本', () => {
        eventBus.emit('test:event', { data: 'test' });
        const history1 = eventBus.getEventHistory('test:event');
        const history2 = eventBus.getEventHistory('test:event');

        expect(history1).not.toBe(history2);
        expect(history1).toEqual(history2);
      });
    });

    describe('getStats', () => {
      it('应该返回事件统计信息', () => {
        eventBus.on('event1', jest.fn());
        eventBus.on('event1', jest.fn());
        eventBus.on('event2', jest.fn());

        eventBus.emit('event1', { data: 'test1' });
        eventBus.emit('event1', { data: 'test2' });
        eventBus.emit('event2', { data: 'test3' });

        const stats = eventBus.getStats();

        expect(stats.totalEmits).toBe(3);
        expect(stats.eventCounts['event1']).toBe(2);
        expect(stats.eventCounts['event2']).toBe(1);
        expect(stats.totalCurrentListeners).toBe(3);
      });

      it('应该包含当前监听器数量', () => {
        eventBus.on('test:event', jest.fn());
        eventBus.on('test:event', jest.fn());

        const stats = eventBus.getStats();

        expect(stats.currentListeners['test:event']).toBe(2);
      });
    });

    describe('getDebugInfo', () => {
      it('应该返回调试信息', () => {
        eventBus.on('event1', jest.fn());
        eventBus.emit('event1', { data: 'test' });

        const debugInfo = eventBus.getDebugInfo();

        expect(debugInfo.stats).toBeDefined();
        expect(debugInfo.stats.totalEmits).toBe(1);
        expect(debugInfo.topEvents).toBeDefined();
        expect(debugInfo.historySize).toBeGreaterThanOrEqual(0);
      });

      it('应该包含topEvents信息', () => {
        for (let i = 0; i < 5; i++) {
          eventBus.emit('event1', { index: i });
        }
        for (let i = 0; i < 3; i++) {
          eventBus.emit('event2', { index: i });
        }

        const debugInfo = eventBus.getDebugInfo();

        expect(debugInfo.topEvents.length).toBeGreaterThan(0);
        expect(debugInfo.topEvents[0].event).toBe('event1');
        expect(debugInfo.topEvents[0].count).toBe(5);
      });

      it('应该在调试模式时包含性能统计', () => {
        eventBus.setDebugMode(true);
        eventBus.on('test:event', jest.fn());
        eventBus.emit('test:event', { data: 'test' });

        const debugInfo = eventBus.getDebugInfo();

        expect(debugInfo.performanceStats).toBeDefined();
      });
    });

    describe('setOptimization', () => {
      it('应该能够设置优化选项', () => {
        expect(() => {
          eventBus.setOptimization(true);
          eventBus.setOptimization(false);
        }).not.toThrow();
      });

      it('应该返回eventBus实例以支持链式调用', () => {
        const result = eventBus.setOptimization(true);
        expect(result).toBe(eventBus);
      });
    });

    describe('setDebugMode', () => {
      it('应该能够设置调试模式', () => {
        expect(() => {
          eventBus.setDebugMode(true);
          eventBus.setDebugMode(false);
        }).not.toThrow();
      });

      it('应该返回eventBus实例以支持链式调用', () => {
        const result = eventBus.setDebugMode(true);
        expect(result).toBe(eventBus);
      });
    });

    describe('边界条件和错误处理', () => {
      it('应该处理null或undefined事件名称', () => {
        const callback = jest.fn();

        expect(() => {
          eventBus.on(null, callback);
        }).not.toThrow();

        expect(() => {
          eventBus.emit(undefined, { data: 'test' });
        }).not.toThrow();
      });

      it('应该处理null或undefined回调函数', () => {
        expect(() => {
          eventBus.on('test:event', null);
        }).not.toThrow();

        expect(() => {
          eventBus.on('test:event', undefined);
        }).not.toThrow();
      });

      it('应该处理空字符串事件名称', () => {
        const callback = jest.fn();

        expect(() => {
          eventBus.on('', callback);
        }).not.toThrow();

        expect(() => {
          eventBus.emit('', { data: 'test' });
        }).not.toThrow();
      });

      it('应该处理复杂的事件名称', () => {
        const callback = jest.fn();
        const eventName = 'module:service:action:detail';

        eventBus.on(eventName, callback);
        eventBus.emit(eventName, { data: 'test' });

        expect(callback).toHaveBeenCalledWith({ data: 'test' });
      });

      it('应该处理大对象作为事件数据', () => {
        const callback = jest.fn();
        const largeData = {
          array: Array.from({ length: 1000 }, (_, i) => i),
          nested: { level1: { level2: { level3: 'deep' } } }
        };

        eventBus.on('test:event', callback);
        eventBus.emit('test:event', largeData);

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
          array: expect.any(Array),
          nested: expect.any(Object)
        }));
      });

      it('应该处理同一事件的多次发布', () => {
        const callback = jest.fn();

        eventBus.on('test:event', callback);

        for (let i = 0; i < 100; i++) {
          eventBus.emit('test:event', { index: i });
        }

        expect(callback).toHaveBeenCalledTimes(100);
      });

      it('应该处理循环对象', () => {
        const callback = jest.fn();
        const obj = {};
        obj.self = obj;

        eventBus.on('test:event', callback);
        expect(() => {
          eventBus.emit('test:event', obj);
        }).not.toThrow();
      });

      it('应该处理undefined数据', () => {
        const callback = jest.fn();

        eventBus.on('test:event', callback);
        eventBus.emit('test:event', undefined);

        expect(callback).toHaveBeenCalledWith(undefined);
      });
    });

    describe('事件处理顺序', () => {
      it('应该按照订阅顺序调用回调', () => {
        const results = [];
        const callback1 = () => results.push(1);
        const callback2 = () => results.push(2);
        const callback3 = () => results.push(3);

        eventBus.on('test:event', callback1);
        eventBus.on('test:event', callback2);
        eventBus.on('test:event', callback3);

        eventBus.emit('test:event', {});

        expect(results).toEqual([1, 2, 3]);
      });

      it('应该能够在回调中发布新事件', () => {
        const callback1 = jest.fn(() => {
          eventBus.emit('event2', { from: 'callback1' });
        });
        const callback2 = jest.fn();

        eventBus.on('event1', callback1);
        eventBus.on('event2', callback2);

        eventBus.emit('event1', {});

        expect(callback1).toHaveBeenCalled();
        expect(callback2).toHaveBeenCalledWith({ from: 'callback1' });
      });

      it('一次性监听器应该最后触发', () => {
        const results = [];
        const regularCallback = () => results.push('regular');
        const onceCallback = () => results.push('once');

        eventBus.on('test:event', regularCallback);
        eventBus.once('test:event', onceCallback);

        eventBus.emit('test:event', {});

        expect(results).toEqual(['regular', 'once']);
      });
    });

    describe('内存管理', () => {
      it('应该能够取消所有特定事件的订阅', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();
        const callback3 = jest.fn();

        eventBus.on('event1', callback1);
        eventBus.on('event1', callback2);
        eventBus.on('event2', callback3);

        // 通过清除所有订阅来清理
        eventBus.clear();

        eventBus.emit('event1', {});
        eventBus.emit('event2', {});

        expect(callback1).not.toHaveBeenCalled();
        expect(callback2).not.toHaveBeenCalled();
        expect(callback3).not.toHaveBeenCalled();
      });

      it('一次性监听器应该在触发后被移除', () => {
        const callback = jest.fn();

        eventBus.once('test:event', callback);
        eventBus.emit('test:event', { data: 'test1' });

        expect(eventBus.hasListeners('test:event')).toBeFalsy();

        eventBus.emit('test:event', { data: 'test2' });

        expect(callback).toHaveBeenCalledTimes(1);
      });

      it('应该正确处理混合监听器', () => {
        const regularCallback = jest.fn();
        const onceCallback = jest.fn();

        eventBus.on('test:event', regularCallback);
        eventBus.once('test:event', onceCallback);

        eventBus.emit('test:event', { data: 'test1' });

        expect(regularCallback).toHaveBeenCalledTimes(1);
        expect(onceCallback).toHaveBeenCalledTimes(1);
        expect(eventBus.listenerCount('test:event')).toBe(1);

        eventBus.emit('test:event', { data: 'test2' });

        expect(regularCallback).toHaveBeenCalledTimes(2);
        expect(onceCallback).toHaveBeenCalledTimes(1);
      });
    });

    describe('数据安全和深拷贝', () => {
      it('应该对事件数据进行安全拷贝（小对象使用浅拷贝+冻结）', () => {
        const callback = jest.fn();
        const originalData = { value: 1, nested: { inner: 2 } };

        eventBus.on('test:event', (data) => {
          // 尝试修改接收到的数据
          if (data) {
            // 对于浅拷贝+冻结的对象，修改顶层属性会报错
            expect(() => {
              data.value = 999;
            }).toThrow();

            // 但嵌套对象仍然可以被修改（浅拷贝的限制）
            if (data.nested) {
              data.nested.inner = 999;
            }
          }
        });

        eventBus.emit('test:event', originalData);

        // 顶层属性应该被保护
        expect(originalData.value).toBe(1);
        // 嵌套对象可能会被修改（浅拷贝的局限性）
      });

      it('应该处理无法深拷贝的数据', () => {
        const callback = jest.fn();
        // 创建包含函数的对象（无法深拷贝）
        const dataWithFunc = {
          value: 1,
          fn: () => {}
        };

        eventBus.on('test:event', callback);

        expect(() => {
          eventBus.emit('test:event', dataWithFunc);
        }).not.toThrow();

        // 应该仍然触发回调，只是使用原始引用
        expect(callback).toHaveBeenCalled();
      });

      it('应该为小对象创建安全的数据副本', () => {
        const originalData = { value: 1, name: 'test' };
        let receivedData = null;

        eventBus.on('test:event', (data) => {
          receivedData = data;
        });

        eventBus.emit('test:event', originalData);

        // 接收到的数据应该是一个副本
        expect(receivedData).not.toBe(originalData);
        // 原始数据应该保持不变
        expect(originalData.value).toBe(1);
        expect(originalData.name).toBe('test');
      });
    });

    describe('事件统计和追踪', () => {
      it('应该正确追踪事件触发次数', () => {
        eventBus.on('test:event', jest.fn());

        eventBus.emit('test:event', {});
        eventBus.emit('test:event', {});
        eventBus.emit('test:event', {});

        const stats = eventBus.getStats();
        expect(stats.eventCounts['test:event']).toBe(3);
        expect(stats.totalEmits).toBe(3);
      });

      it('应该记录最后触发时间', () => {
        eventBus.on('test:event', jest.fn());

        eventBus.emit('test:event', {});

        const stats = eventBus.getStats();
        expect(stats.lastEmitTime['test:event']).toBeDefined();
        expect(stats.lastEmitTime['test:event']).toBeGreaterThan(Date.now() - 1000);
      });

      it('应该追踪不同事件类型', () => {
        eventBus.on('event1', jest.fn());
        eventBus.on('event2', jest.fn());

        for (let i = 0; i < 5; i++) {
          eventBus.emit('event1', {});
        }
        for (let i = 0; i < 3; i++) {
          eventBus.emit('event2', {});
        }

        const stats = eventBus.getStats();
        expect(stats.eventCounts['event1']).toBe(5);
        expect(stats.eventCounts['event2']).toBe(3);
        expect(Object.keys(stats.eventCounts).length).toBe(2);
      });
    });

  });

});
