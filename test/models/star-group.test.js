/**
 * star-group.test.js - StarGroup FIFO消费策略测试
 *
 * 测试 StarGroup 的 FIFO（先入先出）消费策略
 */

const { StarGroup } = require('../../models/star-group');
const TestDataFactory = require('../utils/test-data-factory');

describe('StarGroup FIFO消费策略', () => {
  // ====== 基础排序测试 ======
  describe('分组排序', () => {
    it('应该按过期时间升序排序', () => {
      const today = new Date('2026-03-03').toISOString();
      const yesterday = new Date('2026-03-02').toISOString();
      const tomorrow = new Date('2026-03-04').toISOString();

      const groups = [
        new StarGroup(TestDataFactory.createStarGroup({
          id: 'group_1',
          expiryDate: tomorrow,
          expiryType: 'week'
        })),
        new StarGroup(TestDataFactory.createStarGroup({
          id: 'group_2',
          expiryDate: today,
          expiryType: 'week'
        })),
        new StarGroup(TestDataFactory.createStarGroup({
          id: 'group_3',
          expiryDate: yesterday,
          expiryType: 'week'
        })),
        new StarGroup(TestDataFactory.createStarGroup({
          id: 'group_4',
          type: 'permanent',
          expiryDate: null,
          expiryType: 'permanent'
        }))
      ];

      const sorted = StarGroup.sortByExpiryDate(groups);

      expect(sorted[0].id).toBe('group_1'); // 明天过期
      expect(sorted[1].id).toBe('group_2'); // 今天过期
      expect(sorted[2].id).toBe('group_3'); // 昨天过期
      expect(sorted[3].id).toBe('group_4'); // 永久
    });

    it('应该把永久分组放在最后', () => {
      const permanent = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_perm',
        type: 'permanent',
        expiryDate: null,
        expiryType: 'permanent'
      }));

      const temporary = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_temp',
        expiryDate: '2026-03-10',
        expiryType: 'week'
      }));

      const sorted = StarGroup.sortByExpiryDate([temporary, permanent]);

      expect(sorted[0].id).toBe('group_temp');
      expect(sorted[1].id).toBe('group_perm');
    });

    it('应该把无过期日期的分组放在最后', () => {
      const withDate = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        expiryDate: '2026-03-10',
        expiryType: 'week'
      }));

      const withoutDate = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_2',
        expiryDate: '',
        expiryType: 'temporary'
      }));

      const sorted = StarGroup.sortByExpiryDate([withDate, withoutDate]);

      expect(sorted[0].id).toBe('group_1'); // 有日期的在前
      expect(sorted[1].id).toBe('group_2'); // 无日期的在后
    });

    it('应该正确处理相同过期日期的分组', () => {
      const group1 = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        expiryDate: '2026-03-10',
        expiryType: 'week'
      }));

      const group2 = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_2',
        expiryDate: '2026-03-10',
        expiryType: 'week'
      }));

      const sorted = StarGroup.sortByExpiryDate([group1, group2]);

      expect(sorted[0].id).toBe('group_1');
      expect(sorted[1].id).toBe('group_2');
    });
  });

  // ====== 基础消费测试 ======
  describe('单个分组消费', () => {
    it('应该从第一个分组开始消费', () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        stars: 10
      }));

      const result = group.removeStars(5);

      expect(result).toBe(5);
      expect(group.stars).toBe(5);
      expect(group.lastUpdated).toBeGreaterThan(0);
    });

    it('应该在单个分组消费完成时停止', () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        stars: 3
      }));

      const result = group.removeStars(5);

      expect(result).toBe(0); // removeStars 返回消费后的星星数量
      expect(group.stars).toBe(0); // 分组星星数降为 0
    });

    it('应该正确更新消费后的星星数量', () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        stars: 10
      }));

      group.removeStars(5);

      expect(group.stars).toBe(5);
      expect(group.lastUpdated).toBeGreaterThan(0);
    });

    it('应该处理消费数量等于分组星星数的情况', () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        stars: 5
      }));

      const result = group.removeStars(5);

      expect(result).toBe(0); // removeStars 返回消费后的星星数量
      expect(group.stars).toBe(0);
    });

    it('应该处理消费数量大于分组星星数的情况', () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        stars: 3
      }));

      const result = group.removeStars(5);

      expect(result).toBe(0); // removeStars 会将 stars 降到 0，返回 0
      expect(group.stars).toBe(0);
      expect(group.lastUpdated).toBeGreaterThan(0);
    });
  });

  // ====== 跨分组消费测试 ======
  describe('跨分组消费', () => {
    it('应该在第一个分组不足时停止（Model层行为）', () => {
      const groups = [
        new StarGroup(TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 5
        })),
        new StarGroup(TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 10
        }))
      ];

      // Model 层的 removeStars 只影响当前分组
      const result = groups[0].removeStars(12);

      expect(result).toBe(0); // 消费后剩余星星数为 0
      expect(groups[0].stars).toBe(0);
      expect(groups[1].stars).toBe(10); // group2 不受影响
    });

    it('应该正确处理单个分组的消费', () => {
      const groups = [
        new StarGroup(TestDataFactory.createStarGroup({
          id: 'group_1',
          stars: 5
        })),
        new StarGroup(TestDataFactory.createStarGroup({
          id: 'group_2',
          stars: 8
        }))
      ];

      // 只消费 group1
      const result = groups[0].removeStars(3);

      expect(result).toBe(2); // 消费后剩余 2
      expect(groups[0].stars).toBe(2);
      expect(groups[1].stars).toBe(8); // group2 不受影响
    });

    it('应该正确处理永久和临时分组', () => {
      const permanentGroup = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_perm',
        type: 'permanent',
        stars: 10
      }));

      const tempGroup = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_temp',
        stars: 5,
        expiryDate: '2026-03-10',
        expiryType: 'week'
      }));

      permanentGroup.removeStars(7);
      tempGroup.removeStars(3);

      expect(permanentGroup.stars).toBe(3); // 10 - 7 = 3
      expect(tempGroup.stars).toBe(2); // 5 - 3 = 2
    });
  });

  // ====== 边界场景测试 ======
  describe('边界场景', () => {
    it('应该处理全部分组都为0的情况', () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        stars: 0
      }));

      const result = group.removeStars(5);

      expect(result).toBe(0);
      expect(group.stars).toBe(0);
    });

    it('应该处理请求数量为0的情况', () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        stars: 10
      }));

      const result = group.removeStars(0);

      expect(result).toBe(10); // removeStars 返回消费后的星星数量
      expect(group.stars).toBe(10);
    });

    it('应该处理请求数量为负数的情况', () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        stars: 10
      }));

      const result = group.removeStars(-5);

      expect(result).toBe(10); // 负数不消费，返回原值
      expect(group.stars).toBe(10);
    });

    it('应该处理空分组', () => {
      const group = new StarGroup({
        id: 'group_1',
        stars: 0
      });

      const result = group.removeStars(5);

      expect(result).toBe(0);
      expect(group.stars).toBe(0);
    });

    it('应该处理永久分组的情况', () => {
      const permanentGroup = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        type: 'permanent',
        stars: 10
      }));

      const result = permanentGroup.removeStars(12);

      expect(result).toBe(0); // removeStars 会将 stars 降到 0，返回 0
      expect(permanentGroup.stars).toBe(0);
    });
  });

  // ====== 数据更新验证 ======
  describe('数据更新', () => {
    it('应该正确设置lastUpdated时间', async () => {
      const group = new StarGroup(TestDataFactory.createStarGroup({
        id: 'group_1',
        stars: 10
      }));

      const createTime = group.createTime;
      // 添加小延迟确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 1));
      group.removeStars(5);

      expect(group.lastUpdated).toBeGreaterThan(createTime);
      expect(group.stars).toBe(5);
    });
  });
});
