/**
 * star-repository.js - 星星仓储
 * 
 * 提供星星实体的存储和检索，继承自基础仓储类
 */

const BaseRepository = require('./base-repository');
const { Star, StarStatus } = require('../models/star');
const logger = require('../utils/logger');

class StarRepository extends BaseRepository {
  /**
   * 构造函数
   * @param {StorageAdapter} storageAdapter 可选的存储适配器
   * @param {Object} options 选项
   */
  constructor(storageAdapter, options = {}) {
    const storageKey = options.storageKey || 'starData';
    super(storageKey, Star, {
      namespace: options.namespace || '',
      useCache: options.useCache !== false,
      cacheExpiry: options.cacheExpiry || 60000,
      cacheTTL: options.cacheTTL || 10000
    });
    
    // 如果提供了存储适配器，则使用它替换默认的
    if (storageAdapter) {
      this.storageAdapter = storageAdapter;
    }
    
    logger.info('StarRepository', '初始化星星仓储');
  }
  
  /**
   * 获取可用的星星
   * @param {String} userId 可选的用户ID，不传则获取所有用户的星星
   * @returns {Promise<Array>} 可用的星星列表
   */
  async getAvailableStars(userId = null) {
    try {
      const stars = await this.query(star => {
        // 用户过滤
        if (userId && star.userId !== userId) {
          return false;
        }
        return star.status === StarStatus.ACTIVE;
      });
      
      logger.info('StarRepository', `获取可用星星成功${userId ? `, 用户=${userId}` : ''}, 数量=${stars.length}`);
      return stars;
    } catch (error) {
      logger.error('StarRepository', '获取可用星星失败', error);
      return [];
    }
  }
  
  /**
   * 获取已使用的星星
   * @param {String} userId 可选的用户ID，不传则获取所有用户的星星
   * @returns {Promise<Array>} 已使用的星星列表
   */
  async getUsedStars(userId = null) {
    try {
      const stars = await this.query(star => {
        // 用户过滤
        if (userId && star.userId !== userId) {
          return false;
        }
        return star.status === StarStatus.USED;
      });
      
      logger.info('StarRepository', `获取已使用星星成功${userId ? `, 用户=${userId}` : ''}, 数量=${stars.length}`);
      return stars;
    } catch (error) {
      logger.error('StarRepository', '获取已使用星星失败', error);
      return [];
    }
  }
  
  /**
   * 获取已过期的星星
   * @param {String} userId 可选的用户ID，不传则获取所有用户的星星
   * @returns {Promise<Array>} 已过期的星星列表
   */
  async getExpiredStars(userId = null) {
    try {
      const stars = await this.query(star => {
        // 用户过滤
        if (userId && star.userId !== userId) {
          return false;
        }
        return star.status === StarStatus.EXPIRED || 
               (star.status !== StarStatus.USED && star.isExpired());
      });
      
      logger.info('StarRepository', `获取已过期星星成功${userId ? `, 用户=${userId}` : ''}, 数量=${stars.length}`);
      return stars;
    } catch (error) {
      logger.error('StarRepository', '获取已过期星星失败', error);
      return [];
    }
  }
  
  /**
   * 获取特定来源的星星
   * @param {String} sourceType 来源类型
   * @param {String} sourceId 来源ID
   * @param {String} userId 可选的用户ID，不传则获取所有用户的星星
   * @returns {Promise<Array>} 符合条件的星星列表
   */
  async getStarsBySource(sourceType, sourceId, userId = null) {
    if (!sourceType) {
      logger.warn('StarRepository', '尝试使用无效的来源类型获取星星');
      return [];
    }
    
    try {
      const stars = await this.query(star => {
        // 用户过滤
        if (userId && star.userId !== userId) {
          return false;
        }
        
        if (sourceId) {
          return star.sourceType === sourceType && star.sourceId === sourceId;
        }
        return star.sourceType === sourceType;
      });
      
      logger.info('StarRepository', `获取来源类型=${sourceType}${sourceId ? `, 来源ID=${sourceId}` : ''}的星星成功${userId ? `, 用户=${userId}` : ''}, 数量=${stars.length}`);
      return stars;
    } catch (error) {
      logger.error('StarRepository', `获取来源类型=${sourceType}的星星失败`, error);
      return [];
    }
  }
  
  /**
   * 获取特定有效期类型的星星
   * @param {String} expiryType 有效期类型
   * @param {Boolean} onlyAvailable 是否仅获取可用的星星
   * @param {String} userId 可选的用户ID，不传则获取所有用户的星星
   * @returns {Promise<Array>} 符合条件的星星列表
   */
  async getStarsByExpiryType(expiryType, onlyAvailable = true, userId = null) {
    if (!expiryType) {
      logger.warn('StarRepository', '尝试使用无效的有效期类型获取星星');
      return [];
    }
    
    try {
      const stars = await this.query(star => {
        // 用户过滤
        if (userId && star.userId !== userId) {
          return false;
        }
        
        const matchesExpiry = star.expiryType === expiryType;
        if (onlyAvailable) {
          return matchesExpiry && star.status === StarStatus.ACTIVE;
        }
        return matchesExpiry;
      });
      
      logger.info('StarRepository', `获取有效期类型=${expiryType}的星星成功${userId ? `, 用户=${userId}` : ''}, 数量=${stars.length}`);
      return stars;
    } catch (error) {
      logger.error('StarRepository', `获取有效期类型=${expiryType}的星星失败`, error);
      return [];
    }
  }
  
  /**
   * 按过期日期顺序获取可用星星
   * @param {String} userId 可选的用户ID，不传则获取所有用户的星星
   * @returns {Promise<Array>} 按过期日期排序的星星列表
   */
  async getStarsByExpiryOrder(userId = null) {
    try {
      const availableStars = await this.getAvailableStars(userId);
      
      // 按过期日期排序，永久有效的放在最后
      const sortedStars = this._sortStarsByExpiryDate(availableStars);
      
      logger.info('StarRepository', `按过期日期顺序获取可用星星成功${userId ? `, 用户=${userId}` : ''}, 数量=${sortedStars.length}`);
      return sortedStars;
    } catch (error) {
      logger.error('StarRepository', '按过期日期顺序获取可用星星失败', error);
      return [];
    }
  }
  
  /**
   * 检查星星数量是否足够
   * @param {Number} amount 需要的星星数量
   * @param {String} userId 可选的用户ID，不传则检查所有用户的星星
   * @returns {Promise<Boolean>} 是否足够
   */
  async hasEnoughStars(amount, userId = null) {
    if (amount <= 0) {
      logger.warn('StarRepository', `检查星星数量是否足够时使用了无效数量: ${amount}`);
      return true;
    }
    
    try {
      const availableStars = await this.getAvailableStars(userId);
      const totalAvailable = availableStars.reduce((sum, star) => sum + star.value, 0);
      
      logger.info('StarRepository', `检查星星数量是否足够${userId ? `, 用户=${userId}` : ''}: 需要=${amount}, 可用=${totalAvailable}`);
      return totalAvailable >= amount;
    } catch (error) {
      logger.error('StarRepository', `检查星星数量是否足够失败, 需要=${amount}`, error);
      return false;
    }
  }
  
  /**
   * 批量标记星星为已使用
   * @param {Array<Star>} stars 星星列表
   * @param {String} usedFor 使用目的
   * @returns {Promise<Array<Star>>} 更新后的星星列表
   */
  async markStarsAsUsed(stars, usedFor = '') {
    if (!Array.isArray(stars) || stars.length === 0) {
      logger.warn('StarRepository', '尝试标记空星星列表为已使用');
      return [];
    }
    
    try {
      // 标记星星为已使用
      const updatedStars = stars.map(star => {
        const updatedStar = this._cloneModel(star);
        updatedStar.markAsUsed(usedFor);
        return updatedStar;
      });
      
      // 保存回存储
      const savedStars = await this.saveAll(updatedStars);
      
      logger.info('StarRepository', `批量标记星星为已使用成功, 数量=${savedStars.length}`);
      return savedStars;
    } catch (error) {
      logger.error('StarRepository', '批量标记星星为已使用失败', error);
      return [];
    }
  }
  
  /**
   * 批量标记星星为已过期
   * @param {Array<Star>} stars 星星列表
   * @returns {Promise<Array<Star>>} 更新后的星星列表
   */
  async markStarsAsExpired(stars) {
    if (!Array.isArray(stars) || stars.length === 0) {
      logger.warn('StarRepository', '尝试标记空星星列表为已过期');
      return [];
    }
    
    try {
      // 标记星星为已过期
      const updatedStars = stars.map(star => {
        const updatedStar = this._cloneModel(star);
        updatedStar.markAsExpired();
        return updatedStar;
      });
      
      // 保存回存储
      const savedStars = await this.saveAll(updatedStars);
      
      logger.info('StarRepository', `批量标记星星为已过期成功, 数量=${savedStars.length}`);
      return savedStars;
    } catch (error) {
      logger.error('StarRepository', '批量标记星星为已过期失败', error);
      return [];
    }
  }
  
  /**
   * 检查并标记过期星星
   * @param {String} userId 可选的用户ID，不传则检查所有用户的星星
   * @returns {Promise<Array<Star>>} 新标记为过期的星星列表
   */
  async checkAndMarkExpiredStars(userId = null) {
    try {
      // 获取所有未使用的星星
      const stars = await this.query(star => {
        // 用户过滤
        if (userId && star.userId !== userId) {
          return false;
        }
        return star.status !== StarStatus.USED && star.status !== StarStatus.EXPIRED;
      });
      
      // 找出已过期的星星
      const expiredStars = stars.filter(star => star.isExpired());
      
      if (expiredStars.length > 0) {
        // 标记为已过期
        const markedStars = await this.markStarsAsExpired(expiredStars);
        
        logger.info('StarRepository', `检查并标记过期星星成功${userId ? `, 用户=${userId}` : ''}, 标记数量=${markedStars.length}`);
        return markedStars;
      }
      
      logger.info('StarRepository', `检查过期星星完成${userId ? `, 用户=${userId}` : ''}, 没有发现过期星星`);
      return [];
    } catch (error) {
      logger.error('StarRepository', '检查并标记过期星星失败', error);
      return [];
    }
  }
  
  /**
   * 获取星星总数量
   * @param {Object} options 选项
   * @param {Boolean} options.onlyAvailable 是否仅计算可用的星星
   * @param {String} options.userId 可选的用户ID，不传则计算所有用户的星星
   * @returns {Promise<Number>} 总数量
   */
  async getTotalStarsAmount(options = {}) {
    try {
      let stars;
      
      if (options.onlyAvailable) {
        stars = await this.getAvailableStars(options.userId);
      } else {
        const allStars = await this.getAll();
        stars = options.userId ? allStars.filter(s => s.userId === options.userId) : allStars;
      }
      
      const total = stars.reduce((sum, star) => sum + star.value, 0);
      
      logger.info('StarRepository', `获取星星总数量成功${options.userId ? `, 用户=${options.userId}` : ''}, ${options.onlyAvailable ? '可用' : '全部'}星星=${total}`);
      return total;
    } catch (error) {
      logger.error('StarRepository', `获取星星总数量失败`, error);
      return 0;
    }
  }
  
  /**
   * 按过期日期对星星排序
   * @private
   * @param {Array} stars 星星数组
   * @returns {Array} 排序后的星星数组
   */
  _sortStarsByExpiryDate(stars) {
    if (!Array.isArray(stars)) return [];
    
    return [...stars].sort((a, b) => {
      // 永久有效的放在最后
      if (a.expiryType === 'permanent') return 1;
      if (b.expiryType === 'permanent') return -1;
      
      // 过期日期为空的放在后面
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      
      // 按过期日期升序（先过期的在前）
      return a.expiryDate - b.expiryDate;
    });
  }
  
  /**
   * 克隆模型实例
   * @private
   * @param {Star} star 星星实例
   * @returns {Star} 克隆后的星星实例
   */
  _cloneModel(star) {
    if (!star) return null;
    return new Star({ ...star });
  }
}

module.exports = StarRepository; 