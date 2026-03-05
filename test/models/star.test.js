/**
 * star.test.js - Star 领域模型测试
 */

const { Star, StarSourceType, StarStatus, StarExpiryType } = require('../../models/star');

describe('Star 领域模型', () => {
  describe('构造函数', () => {
    it('应该使用默认值创建星星', () => {
      const star = new Star();
      expect(star.value).toBe(1);
      expect(star.status).toBe(StarStatus.ACTIVE);
      expect(star.expiryType).toBe(StarExpiryType.PERMANENT);
    });

    it('应该使用提供的数据创建星星', () => {
      const star = new Star({ value: 5, sourceType: StarSourceType.TASK });
      expect(star.value).toBe(5);
      expect(star.sourceType).toBe(StarSourceType.TASK);
    });
  });

  describe('validate', () => {
    it('有效星星应该通过验证', () => {
      const star = new Star({ value: 1, sourceType: StarSourceType.TASK, status: StarStatus.ACTIVE });
      expect(star.validate()).toEqual([]);
    });

    it('负值的星星应该返回验证错误', () => {
      const star = new Star({ value: -5, sourceType: StarSourceType.TASK, status: StarStatus.ACTIVE });
      const errors = star.validate();
      expect(errors).toContain('星星值必须大于0');
    });

    it('已使用但没有使用时间的星星应该返回错误', () => {
      const star = new Star({ value: 1, sourceType: StarSourceType.TASK, status: StarStatus.USED, usedTime: 0 });
      const errors = star.validate();
      expect(errors).toContain('已使用的星星必须有使用时间');
    });
  });

  describe('markAsUsed', () => {
    it('应该标记星星为已使用', async () => {
      const star = new Star({ status: StarStatus.ACTIVE });
      await new Promise(resolve => setTimeout(resolve, 1));
      star.markAsUsed('usage_123');
      expect(star.status).toBe(StarStatus.USED);
      expect(star.usageId).toBe('usage_123');
    });

    it('已使用的星星不能再标记为已使用', () => {
      const originalUsedTime = Date.now() - 1000;
      const star = new Star({ status: StarStatus.USED, usedTime: originalUsedTime });
      star.markAsUsed('usage_456');
      expect(star.usedTime).toBe(originalUsedTime);
    });
  });

  describe('markAsExpired', () => {
    it('应该标记星星为已过期', async () => {
      const star = new Star({ status: StarStatus.ACTIVE });
      await new Promise(resolve => setTimeout(resolve, 1));
      star.markAsExpired();
      expect(star.status).toBe(StarStatus.EXPIRED);
      expect(star.expiryTime).toBeGreaterThan(0);
    });

    it('已使用的星星不能再标记为已过期', () => {
      const star = new Star({ status: StarStatus.USED });
      star.markAsExpired();
      expect(star.status).toBe(StarStatus.USED);
    });
  });

  describe('markAsReserved 和 cancelReservation', () => {
    it('应该标记星星为已预留', () => {
      const star = new Star({ status: StarStatus.ACTIVE });
      star.markAsReserved('reservation_123');
      expect(star.status).toBe(StarStatus.RESERVED);
      expect(star.reservationId).toBe('reservation_123');
    });

    it('应该取消预留状态', () => {
      const star = new Star({ status: StarStatus.RESERVED, reservationId: 'reservation_123' });
      star.cancelReservation();
      expect(star.status).toBe(StarStatus.ACTIVE);
      expect(star.reservationId).toBe('');
    });
  });

  describe('isExpired', () => {
    it('已过期状态的星星应该返回true', () => {
      const star = new Star({ status: StarStatus.EXPIRED });
      expect(star.isExpired()).toBe(true);
    });

    it('永久有效的星星不应该过期', () => {
      const star = new Star({ status: StarStatus.ACTIVE, expiryType: StarExpiryType.PERMANENT });
      expect(star.isExpired()).toBe(false);
    });

    it('过期时间在未来的星星不应该过期', () => {
      const futureTime = new Date(Date.now() + 86400000).toISOString();
      const star = new Star({ status: StarStatus.ACTIVE, expiryDate: futureTime, expiryType: StarExpiryType.WEEK });
      expect(star.isExpired()).toBe(false);
    });

    it('过期时间在过去的星星应该过期', () => {
      const pastTime = new Date(Date.now() - 1000).toISOString();
      const star = new Star({ status: StarStatus.ACTIVE, expiryDate: pastTime, expiryType: StarExpiryType.WEEK });
      expect(star.isExpired()).toBe(true);
    });
  });

  describe('getExpiryDate', () => {
    it('永久有效的星星应该返回null', () => {
      const star = new Star({ expiryType: StarExpiryType.PERMANENT });
      expect(star.getExpiryDate()).toBe(null);
    });

    it('应该返回设置的过期日期', () => {
      const expiryDate = '2026-06-30T23:59:59.999Z';
      const star = new Star({ expiryDate: expiryDate, expiryType: StarExpiryType.WEEK, status: StarStatus.ACTIVE });
      const result = star.getExpiryDate();
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2026);
    });
  });

  describe('getRemainingDays', () => {
    it('已过期状态的星星应该返回0', () => {
      const star = new Star({ status: StarStatus.EXPIRED });
      expect(star.getRemainingDays()).toBe(0);
    });

    it('永久有效的星星应该返回-1', () => {
      const star = new Star({ status: StarStatus.ACTIVE, expiryType: StarExpiryType.PERMANENT });
      expect(star.getRemainingDays()).toBe(-1);
    });

    it('应该正确计算剩余天数', () => {
      const futureTime = new Date(Date.now() + 3 * 86400000).toISOString();
      const star = new Star({ status: StarStatus.ACTIVE, expiryDate: futureTime, expiryType: StarExpiryType.WEEK });
      const remainingDays = star.getRemainingDays();
      expect(remainingDays).toBeGreaterThan(0);
      expect(remainingDays).toBeLessThanOrEqual(3);
    });
  });

  describe('getStatusDescription', () => {
    it('应该返回正确的状态描述', () => {
      const activeStar = new Star({ status: StarStatus.ACTIVE });
      const usedStar = new Star({ status: StarStatus.USED });
      const expiredStar = new Star({ status: StarStatus.EXPIRED });
      const reservedStar = new Star({ status: StarStatus.RESERVED });

      expect(activeStar.getStatusDescription()).toBe('有效');
      expect(usedStar.getStatusDescription()).toBe('已使用');
      expect(expiredStar.getStatusDescription()).toBe('已过期');
      expect(reservedStar.getStatusDescription()).toBe('已预留');
    });
  });

  describe('getExpiryDescription', () => {
    it('永久有效的星星应该返回"永久有效"', () => {
      const star = new Star({ expiryType: StarExpiryType.PERMANENT });
      expect(star.getExpiryDescription()).toBe('永久有效');
    });

    it('已过期的星星应该返回"已过期"', () => {
      const pastTime = new Date(Date.now() - 1000).toISOString();
      const star = new Star({ status: StarStatus.ACTIVE, expiryDate: pastTime, expiryType: StarExpiryType.WEEK });
      expect(star.getExpiryDescription()).toBe('已过期');
    });
  });

  describe('clone', () => {
    it('应该克隆星星并生成新ID', () => {
      const originalStar = new Star({ id: 'original_123', value: 5 });
      const clonedStar = originalStar.clone();
      expect(clonedStar.id).not.toBe(originalStar.id);
      expect(clonedStar.value).toBe(originalStar.value);
      expect(clonedStar).not.toBe(originalStar);
    });

    it('克隆的星星应该重置状态', async () => {
      const usedStar = new Star({ id: 'original_123', status: StarStatus.USED, usedTime: Date.now() });
      await new Promise(resolve => setTimeout(resolve, 1));
      const clonedStar = usedStar.clone();
      expect(clonedStar.status).toBe(StarStatus.ACTIVE);
      expect(clonedStar.usedTime).toBe(0);
    });

    it('克隆星星应该覆盖属性', () => {
      const originalStar = new Star({ id: 'original_123', value: 5, expiryType: StarExpiryType.WEEK });
      const clonedStar = originalStar.clone({ value: 10, expiryType: StarExpiryType.MONTH });
      expect(clonedStar.value).toBe(10);
      expect(clonedStar.expiryType).toBe(StarExpiryType.MONTH);
    });
  });

  describe('边界场景', () => {
    it('应该处理tags为undefined', () => {
      const star = new Star({ tags: undefined });
      expect(star.tags).toEqual([]);
    });

    it('应该处理groupId为空字符串', () => {
      const star = new Star({ groupId: '' });
      expect(star.groupId).toBe('');
    });
  });
});
