/**
 * star-group-repository.js - 星星分组仓储
 * 
 * 提供星星分组实体的存储和检索，继承自基础仓储类
 */

const BaseRepository = require('./base-repository');
const { StarGroup } = require('../models/star-group');
const { StarExpiryType } = require('../models/star');
const logger = require('../utils/logger');

class StarGroupRepository extends BaseRepository {
  /**
   * 构造函数
   * @param {StorageAdapter} storageAdapter 可选的存储适配器
   * @param {Object} options 选项
   */
  constructor(storageAdapter, options = {}) {
    const storageKey = options.storageKey || 'starGroups';
    super(storageKey, StarGroup, {
      namespace: options.namespace || '',
      useCache: options.useCache !== false,
      cacheExpiry: options.cacheExpiry || 60000,
      cacheTTL: options.cacheTTL || 10000
    });
    
    // 如果提供了存储适配器，则使用它替换默认的
    if (storageAdapter) {
      this.storageAdapter = storageAdapter;
    }
    
    logger.info('StarGroupRepository', '初始化星星分组仓储');
  }
  
  /**
   * 获取非空的分组
   * @returns {Promise<Array>} 非空的分组列表
   */
  async getNonEmptyGroups() {
    try {
      const groups = await this.query(group => !group.isEmpty());
      return groups;
    } catch (error) {
      logger.error('StarGroupRepository', '获取非空分组失败', error);
      return [];
    }
  }
  
  /**
   * 获取特定有效期类型的分组
   * @param {String} expiryType 有效期类型
   * @returns {Promise<Array>} 符合条件的分组列表
   */
  async getGroupsByExpiryType(expiryType) {
    if (!expiryType) {
      logger.warn('StarGroupRepository', '尝试使用无效的有效期类型获取分组');
      return [];
    }
    
    try {
      const groups = await this.query(group => group.expiryType === expiryType);
      
      logger.debug('StarGroupRepository', `获取有效期类型=${expiryType}的分组成功, 数量=${groups.length}`);
      return groups;
    } catch (error) {
      logger.error('StarGroupRepository', `获取有效期类型=${expiryType}的分组失败`, error);
      return [];
    }
  }
  
  /**
   * 获取或创建分组
   * @param {String} expiryType 有效期类型
   * @param {Number|null} expiryDate 过期时间戳
   * @param {String} expiryDateStr 过期日期描述
   * @returns {Promise<StarGroup>} 获取或创建的分组
   */
  async getOrCreateGroup(expiryType, expiryDate, expiryDateStr) {
    if (!expiryType) {
      logger.warn('StarGroupRepository', '尝试使用无效的有效期类型获取或创建分组');
      return null;
    }
    
    try {
      // 查找匹配的分组
      const groups = await this.getAll();
      
      let existingGroup = groups.find(group => {
        // 对于永久有效类型，直接比较类型
        if (expiryType === StarExpiryType.PERMANENT && group.expiryType === StarExpiryType.PERMANENT) {
          return true;
        }
        
        // 对于其他类型，比较过期日期是否在同一天
        if (group.expiryType === expiryType && group.expiryDate && expiryDate) {
          const groupDate = new Date(group.expiryDate);
          const newDate = new Date(expiryDate);
          
          return groupDate.toDateString() === newDate.toDateString();
        }
        
        return false;
      });
      
      // 如果找到匹配的分组，直接返回
      if (existingGroup) {
        logger.debug('StarGroupRepository', `找到匹配的星星分组, ID=${existingGroup.id}, 类型=${expiryType}`);
        return existingGroup;
      }
      
      // 创建新分组
      const newGroup = new StarGroup({
        expiryType: expiryType,
        expiryDate: expiryDate,
        expiryDateStr: expiryDateStr || this._getExpiryDescription(expiryType, expiryDate),
        points: 0,
        sources: []
      });
      
      // 保存新分组
      const savedGroup = await this.save(newGroup);
      
      logger.info('StarGroupRepository', `创建新的星星分组成功, ID=${savedGroup.id}, 类型=${expiryType}`);
      return savedGroup;
    } catch (error) {
      logger.error('StarGroupRepository', `获取或创建分组失败, 类型=${expiryType}`, error);
      return null;
    }
  }
  
  /**
   * 添加星星到分组
   * @param {StarGroup} group 星星分组
   * @param {Number} points 星星数量
   * @param {String} source 来源标识
   * @returns {Promise<StarGroup>} 更新后的分组
   */
  async addStarsToGroup(group, points, source) {
    if (!group || points <= 0) {
      logger.warn('StarGroupRepository', '尝试使用无效参数添加星星到分组');
      return null;
    }
    
    try {
      // 克隆分组防止引用问题
      const updatedGroup = this._cloneModel(group);
      
      // 添加星星
      updatedGroup.addStars(points, source);
      
      // 保存回存储
      const savedGroup = await this.save(updatedGroup);
      
      logger.debug('StarGroupRepository', `添加星星到分组成功, 分组ID=${savedGroup.id}, 数量=${points}, 来源=${source || '未知'}`);
      return savedGroup;
    } catch (error) {
      logger.error('StarGroupRepository', `添加星星到分组失败, 分组ID=${group.id}`, error);
      return null;
    }
  }
  
  /**
   * 从分组中消费星星
   * @param {StarGroup} group 星星分组
   * @param {Number} points 要消费的星星数量
   * @returns {Promise<Object>} 包含实际消费数量和更新后分组的对象
   */
  async consumeStarsFromGroup(group, points) {
    if (!group || points <= 0) {
      logger.warn('StarGroupRepository', '尝试使用无效参数从分组消费星星');
      return { consumed: 0, group: null };
    }
    
    try {
      // 克隆分组防止引用问题
      const updatedGroup = this._cloneModel(group);
      
      // 移除星星
      const consumed = updatedGroup.removeStars(points);
      
      // 保存回存储（只有在实际消费了星星的情况下才保存）
      let savedGroup = null;
      if (consumed > 0) {
        savedGroup = await this.save(updatedGroup);
        logger.debug('StarGroupRepository', `从分组消费星星成功, 分组ID=${savedGroup.id}, 请求消费=${points}, 实际消费=${consumed}`);
      } else {
        logger.debug('StarGroupRepository', `从分组消费星星, 没有实际消费, 分组ID=${group.id}`);
        savedGroup = updatedGroup;
      }
      
      return { consumed, group: savedGroup };
    } catch (error) {
      logger.error('StarGroupRepository', `从分组消费星星失败, 分组ID=${group.id}`, error);
      return { consumed: 0, group: null };
    }
  }
  
  /**
   * 按先过期先使用策略消费星星
   * @param {Number} totalPoints 要消费的总星星数量
   * @returns {Promise<Object>} 包含消费结果的对象
   */
  async consumeStarsByExpiryOrder(totalPoints) {
    if (totalPoints <= 0) {
      logger.warn('StarGroupRepository', `尝试消费无效的星星数量: ${totalPoints}`);
      return { 
        success: false, 
        consumed: 0, 
        remaining: totalPoints, 
        groupsUpdated: [] 
      };
    }
    
    try {
      // 获取所有非空分组
      const groups = await this.getNonEmptyGroups();
      
      // 按过期日期排序（先过期的在前）
      const sortedGroups = StarGroup.sortByExpiryDate(groups);
      
      // 记录消费情况
      let remaining = totalPoints;
      const updatedGroups = [];
      
      // 从每个分组中依次消费
      for (const group of sortedGroups) {
        if (remaining <= 0) break;
        
        // 从当前分组消费
        const { consumed, group: updatedGroup } = await this.consumeStarsFromGroup(group, remaining);
        
        if (consumed > 0) {
          // 减少剩余需要消费的数量
          remaining -= consumed;
          
          // 记录更新的分组
          updatedGroups.push(updatedGroup);
        }
      }
      
      const totalConsumed = totalPoints - remaining;
      
      logger.info('StarGroupRepository', `按过期顺序消费星星完成, 请求消费=${totalPoints}, 实际消费=${totalConsumed}, 更新分组数量=${updatedGroups.length}`);
      
      return {
        success: totalConsumed === totalPoints,
        consumed: totalConsumed,
        remaining: remaining,
        groupsUpdated: updatedGroups
      };
    } catch (error) {
      logger.error('StarGroupRepository', '按过期顺序消费星星失败', error);
      return {
        success: false,
        consumed: 0,
        remaining: totalPoints,
        groupsUpdated: []
      };
    }
  }
  
  /**
   * 检查并清理过期分组
   * @returns {Promise<Array>} 清理的分组列表
   */
  async cleanupExpiredGroups() {
    try {
      // 获取所有分组
      const allGroups = await this.getAll();
      
      // 当前时间
      const now = Date.now();
      
      // 找出已过期的分组
      const expiredGroups = allGroups.filter(group => 
        group.expiryType !== StarExpiryType.PERMANENT && 
        group.expiryDate && 
        group.expiryDate < now
      );
      
      if (expiredGroups.length === 0) {
        logger.info('StarGroupRepository', '没有找到过期分组，无需清理');
        return [];
      }
      
      // 计算过期总数量
      const expiredPoints = expiredGroups.reduce((sum, group) => sum + group.points, 0);
      
      // 构建过期记录
      const expiredRecords = expiredGroups.map(group => ({
        groupId: group.id,
        expiryType: group.expiryType,
        expiryDate: group.expiryDate,
        points: group.points
      }));
      
      // 批量删除过期分组
      const deletedCount = await this.deleteMany(expiredGroups.map(group => group.id));
      
      logger.info('StarGroupRepository', `清理过期分组成功, 清理数量=${deletedCount}, 过期星星总数=${expiredPoints}`);
      
      return expiredRecords;
    } catch (error) {
      logger.error('StarGroupRepository', '清理过期分组失败', error);
      return [];
    }
  }
  
  /**
   * 清理空分组
   * @returns {Promise<Number>} 清理的分组数量
   */
  async cleanupEmptyGroups() {
    try {
      // 删除所有空分组
      const deletedCount = await this.deleteMany(group => group.isEmpty());
      
      logger.info('StarGroupRepository', `清理空分组成功, 清理数量=${deletedCount}`);
      return deletedCount;
    } catch (error) {
      logger.error('StarGroupRepository', '清理空分组失败', error);
      return 0;
    }
  }
  
  /**
   * 获取星星总数量
   * @returns {Promise<Number>} 总数量
   */
  async getTotalPoints() {
    try {
      const groups = await this.getAll();
      const total = groups.reduce((sum, group) => sum + group.points, 0);
      
      logger.info('StarGroupRepository', `获取星星总数量成功, 总数=${total}`);
      return total;
    } catch (error) {
      logger.error('StarGroupRepository', '获取星星总数量失败', error);
      return 0;
    }
  }
  
  /**
   * 检查星星数量是否足够
   * @param {Number} amount 需要的星星数量
   * @returns {Promise<Boolean>} 是否足够
   */
  async hasEnoughPoints(amount) {
    if (amount <= 0) {
      return true;
    }
    
    try {
      const total = await this.getTotalPoints();
      return total >= amount;
    } catch (error) {
      logger.error('StarGroupRepository', `检查星星数量是否足够失败, 需要=${amount}`, error);
      return false;
    }
  }
  
  /**
   * 获取可读的过期描述
   * @private
   * @param {String} expiryType 过期类型
   * @param {Number} expiryDate 过期时间戳
   * @returns {String} 过期描述
   */
  _getExpiryDescription(expiryType, expiryDate) {
    if (expiryType === StarExpiryType.PERMANENT) {
      return '永久有效';
    }
    
    if (!expiryDate) {
      return '未知有效期';
    }
    
    const date = new Date(expiryDate);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    switch (expiryType) {
      case StarExpiryType.WEEK:
        return `本周有效（${year}-${month}-${day}到期）`;
      case StarExpiryType.MONTH:
        return `本月有效（${year}-${month}-${day}到期）`;
      case StarExpiryType.QUARTER:
        return `三个月内有效（${year}-${month}-${day}到期）`;
      default:
        return `${year}-${month}-${day}到期`;
    }
  }
  
  /**
   * 克隆模型实例
   * @private
   * @param {StarGroup} group 星星分组实例
   * @returns {StarGroup} 克隆后的星星分组实例
   */
  _cloneModel(group) {
    if (!group) return null;
    return new StarGroup({ ...group });
  }
  
  /**
   * 扣除星星
   * 按照星星过期时间顺序扣除（先扣除临近过期的）
   * @param {Number} amount 要扣除的星星数量
   * @returns {Promise<Object>} 扣除结果
   */
  async deductStars(amount) {
    if (!amount || amount <= 0) {
      logger.warn('StarGroupRepository', `扣除星星失败：无效的数量 ${amount}`);
      return { success: false, message: '扣除数量无效' };
    }
    
    try {
      // 获取所有星星分组
      const groups = await this.getAll();
      logger.info('StarGroupRepository', `开始扣除${amount}颗星星，当前有${groups.length}个分组`);
      
      // 获取当前星星总数
      const totalStars = groups.reduce((sum, group) => sum + (group.points || 0), 0);
      
      // 检查星星是否足够
      if (totalStars < amount) {
        logger.warn('StarGroupRepository', `扣除星星失败：星星不足，需要${amount}颗，当前${totalStars}颗`);
        return { success: false, message: '星星不足' };
      }
      
      // 按到期时间排序（临近过期的排在前面）
      const sortedGroups = [...groups].sort((a, b) => {
        // 永久有效的放在最后
        if (a.expiryType === 'permanent') return 1;
        if (b.expiryType === 'permanent') return -1;
        
        // 按过期时间升序
        return (a.expiryDate || 0) - (b.expiryDate || 0);
      });
      
      // 从最早过期的分组开始扣除
      let remainingAmount = amount;
      const updatedGroups = [];
      const deductedGroups = [];
      
      for (const group of sortedGroups) {
        if (remainingAmount <= 0) {
          // 不需要继续扣除
          updatedGroups.push(group);
          continue;
        }
        
        // 当前分组可扣除的数量
        const groupPoints = group.points || 0;
        const deductFromGroup = Math.min(remainingAmount, groupPoints);
        
        if (deductFromGroup > 0) {
          // 更新分组
          group.points = groupPoints - deductFromGroup;
          remainingAmount -= deductFromGroup;
          
          // 记录扣除日志
          deductedGroups.push({
            groupId: group.id,
            amount: deductFromGroup,
            remaining: group.points,
            expiryType: group.expiryType,
            expiryDate: group.expiryDate
          });
          
          logger.info('StarGroupRepository', `从分组${group.id}扣除${deductFromGroup}颗星星，剩余${group.points}颗`);
        }
        
        // 只保留还有星星的分组
        if (group.points > 0) {
          updatedGroups.push(group);
        } else {
          logger.info('StarGroupRepository', `分组${group.id}星星已用完，移除`);
        }
      }
      
      // 保存更新后的分组
      const savedGroups = await this.saveAll(updatedGroups);
      const savedCount = savedGroups ? savedGroups.length : 0;
      
      logger.info('StarGroupRepository', `星星扣除完成，更新了${savedCount}个分组，共扣除${amount}颗，剩余${totalStars - amount}颗`);
      
      return {
        success: true,
        deductedGroups,
        message: '扣除成功'
      };
    } catch (error) {
      logger.error('StarGroupRepository', '扣除星星失败', error);
      return { success: false, message: '操作失败，请重试' };
    }
  }
}

module.exports = StarGroupRepository; 