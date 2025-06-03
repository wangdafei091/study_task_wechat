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
   * @param {String} userId 可选的用户ID，不传则获取所有用户的分组
   * @returns {Promise<Array>} 非空的分组列表
   */
  async getNonEmptyGroups(userId = null) {
    try {
      logger.info('StarGroupRepository', `开始获取非空分组${userId ? `, 用户=${userId}` : ''}`);
      const groups = await this.query(group => {
        // 用户过滤
        if (userId && group.userId !== userId) {
          return false;
        }
        return !group.isEmpty();
      });
      
      logger.info('StarGroupRepository', `获取非空分组成功${userId ? `, 用户=${userId}` : ''}, 数量=${groups.length}`);
      return groups;
    } catch (error) {
      logger.error('StarGroupRepository', '获取非空分组失败', error);
      return [];
    }
  }
  
  /**
   * 获取特定有效期类型的分组
   * @param {String} expiryType 有效期类型
   * @param {String} userId 可选的用户ID，不传则获取所有用户的分组
   * @returns {Promise<Array>} 符合条件的分组列表
   */
  async getGroupsByExpiryType(expiryType, userId = null) {
    if (!expiryType) {
      logger.warn('StarGroupRepository', '尝试使用无效的有效期类型获取分组');
      return [];
    }
    
    try {
      const groups = await this.query(group => {
        // 用户过滤
        if (userId && group.userId !== userId) {
          return false;
        }
        return group.expiryType === expiryType;
      });
      
      return groups;
    } catch (error) {
      logger.error('StarGroupRepository', `获取有效期类型=${expiryType}的分组失败`, error);
      return [];
    }
  }
  
  /**
   * 获取或创建星星分组
   * @param {String} expiryType 有效期类型
   * @param {Number} expiryDate 过期时间戳
   * @param {String} expiryDateStr 格式化的过期日期字符串
   * @param {String} userId 用户ID，必需参数
   * @returns {Promise<StarGroup>} 星星分组
   */
  async getOrCreateGroup(expiryType, expiryDate, expiryDateStr, userId) {
    if (!expiryType) {
      logger.warn('StarGroupRepository', '尝试使用无效的有效期类型获取或创建分组');
      return null;
    }
    
    if (!userId) {
      logger.warn('StarGroupRepository', '获取或创建分组缺少用户ID');
      return null;
    }
    
    logger.info('StarGroupRepository', `获取或创建分组: 类型=${expiryType}, 过期时间=${expiryDate}, 过期日期字符串=${expiryDateStr}, 用户=${userId}`);
    
    try {
      // 查找匹配的分组（限定用户）
      const allGroups = await this.getAll();
      const userGroups = allGroups.filter(group => group.userId === userId);
      
      logger.info('StarGroupRepository', `用户${userId}当前共有${userGroups.length}个分组`);
      
      // 记录所有现有分组的详细信息
      userGroups.forEach((group, index) => {
        logger.info('StarGroupRepository', `现有分组${index + 1}: ID=${group.id}, 类型=${group.expiryType}, 过期时间=${group.expiryDate}, 过期日期字符串=${group.expiryDateStr}, 星星数=${group.stars}`);
      });
      
      let existingGroup = userGroups.find(group => {
        // 对于永久有效类型，直接比较类型
        if (expiryType === StarExpiryType.PERMANENT && group.expiryType === StarExpiryType.PERMANENT) {
          logger.info('StarGroupRepository', `找到永久有效分组匹配: ${group.id}`);
          return true;
        }
        
        // 对于其他类型，比较过期日期是否在同一天
        if (group.expiryType === expiryType && group.expiryDate && expiryDate) {
          const groupDate = new Date(group.expiryDate);
          const newDate = new Date(expiryDate);
          
          const isSameDay = groupDate.toDateString() === newDate.toDateString();
          logger.info('StarGroupRepository', `比较分组${group.id}: 分组日期=${groupDate.toDateString()}, 新日期=${newDate.toDateString()}, 是否同一天=${isSameDay}`);
          
          return isSameDay;
        }
        
        return false;
      });
      
      // 如果找到匹配的分组，直接返回
      if (existingGroup) {
        logger.info('StarGroupRepository', `找到匹配的星星分组, ID=${existingGroup.id}, 类型=${expiryType}, 用户=${userId}`);
        return existingGroup;
      }
      
      logger.info('StarGroupRepository', `未找到匹配分组，创建新分组`);
      
      // 创建新分组
      const newGroup = new StarGroup({
        userId: userId, // 设置用户ID
        type: expiryType,
        expiryType: expiryType,
        expiryDate: expiryDate,
        expiryDateStr: expiryDateStr || this._getExpiryDescription(expiryType, expiryDate),
        stars: 0
      });
      
      logger.info('StarGroupRepository', `新分组数据:`, {
        id: newGroup.id,
        userId: newGroup.userId,
        type: newGroup.type,
        expiryType: newGroup.expiryType,
        expiryDate: newGroup.expiryDate,
        expiryDateStr: newGroup.expiryDateStr,
        stars: newGroup.stars
      });
      
      // 保存新分组
      const savedGroup = await this.save(newGroup);
      
      logger.info('StarGroupRepository', `创建新的星星分组成功, ID=${savedGroup.id}, 类型=${expiryType}, 用户=${userId}`);
      return savedGroup;
    } catch (error) {
      logger.error('StarGroupRepository', `获取或创建分组失败, 类型=${expiryType}, 用户=${userId}`, error);
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
   * @param {String} userId 用户ID，必需参数
   * @returns {Promise<Object>} 包含消费结果的对象
   */
  async consumeStarsByExpiryOrder(totalPoints, userId) {
    if (totalPoints <= 0) {
      logger.warn('StarGroupRepository', `尝试消费无效的星星数量: ${totalPoints}`);
      return { 
        success: false, 
        consumed: 0, 
        remaining: totalPoints, 
        groupsUpdated: [] 
      };
    }
    
    if (!userId) {
      logger.warn('StarGroupRepository', '消费星星缺少用户ID');
      return { 
        success: false, 
        consumed: 0, 
        remaining: totalPoints, 
        groupsUpdated: [] 
      };
    }
    
    try {
      // 获取指定用户的所有非空分组
      const groups = await this.getNonEmptyGroups(userId);
      
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
      
      logger.info('StarGroupRepository', `按过期顺序消费星星完成, 用户=${userId}, 请求消费=${totalPoints}, 实际消费=${totalConsumed}, 更新分组数量=${updatedGroups.length}`);
      
      return {
        success: totalConsumed === totalPoints,
        consumed: totalConsumed,
        remaining: remaining,
        groupsUpdated: updatedGroups
      };
    } catch (error) {
      logger.error('StarGroupRepository', `按过期顺序消费星星失败, 用户=${userId}`, error);
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
   * @param {String} userId 可选的用户ID，不传则清理所有用户的分组
   * @returns {Promise<Array>} 清理的分组列表
   */
  async cleanupExpiredGroups(userId = null) {
    try {
      // 获取所有分组
      const allGroups = await this.getAll();
      
      // 用户过滤
      const userGroups = userId ? allGroups.filter(group => group.userId === userId) : allGroups;
      
      // 当前时间
      const now = Date.now();
      
      // 找出已过期的分组
      const expiredGroups = userGroups.filter(group => 
        group.expiryType !== StarExpiryType.PERMANENT && 
        group.expiryDate && 
        group.expiryDate < now
      );
      
      if (expiredGroups.length === 0) {
        logger.info('StarGroupRepository', `没有找到过期分组，无需清理${userId ? `, 用户=${userId}` : ''}`);
        return [];
      }
      
      // 计算过期总数量
      const expiredPoints = expiredGroups.reduce((sum, group) => sum + (group.stars || 0), 0);
      
      // 构建过期记录
      const expiredRecords = expiredGroups.map(group => ({
        groupId: group.id,
        userId: group.userId,
        expiryType: group.expiryType,
        expiryDate: group.expiryDate,
        points: group.stars || 0
      }));
      
      // 批量删除过期分组
      const deletedCount = await this.deleteMany(expiredGroups.map(group => group.id));
      
      logger.info('StarGroupRepository', `清理过期分组成功${userId ? `, 用户=${userId}` : ''}, 清理数量=${deletedCount}, 过期星星总数=${expiredPoints}`);
      
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
   * @param {String} userId 可选的用户ID，不传则获取所有用户的星星
   * @returns {Promise<Number>} 总数量
   */
  async getTotalPoints(userId = null) {
    try {
      const allGroups = await this.getAll();
      const groups = userId ? allGroups.filter(group => group.userId === userId) : allGroups;
      
      logger.info('StarGroupRepository', `获取到${groups.length}个星星分组${userId ? `, 用户=${userId}` : ''}，开始计算总数`);
      
      // 添加详细日志，便于调试
      groups.forEach((group, index) => {
        const starsValue = group.stars || 0;
        const starsType = typeof starsValue;
        logger.info('StarGroupRepository', `分组${index + 1}: ID=${group.id}, 星星数=${starsValue}(${starsType}), 类型=${group.expiryType || 'unknown'}`);
      });
      
      // 修复数据类型问题：确保每个group.stars都转换为数字
      const total = groups.reduce((sum, group) => {
        const stars = this._ensureNumber(group.stars, 0);
        return sum + stars;
      }, 0);
      
      logger.info('StarGroupRepository', `获取星星总数量成功${userId ? `, 用户=${userId}` : ''}, 总数=${total}`);
      return total;
    } catch (error) {
      logger.error('StarGroupRepository', '获取星星总数量失败', error);
      return 0;
    }
  }
  
  /**
   * 确保值为数字类型
   * @private
   * @param {*} value 输入值
   * @param {Number} defaultValue 默认值
   * @returns {Number} 数字值
   */
  _ensureNumber(value, defaultValue = 0) {
    // 如果值为null、undefined或空字符串，返回默认值
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    
    // 尝试转换为数字
    const num = Number(value);
    
    // 如果转换结果为NaN，返回默认值
    if (isNaN(num)) {
      return defaultValue;
    }
    
    // 返回转换后的数字（确保为整数）
    return Math.floor(num);
  }
  
  /**
   * 检查星星数量是否足够
   * @param {Number} amount 需要的星星数量
   * @param {String} userId 可选的用户ID，不传则检查所有用户的星星
   * @returns {Promise<Boolean>} 是否足够
   */
  async hasEnoughPoints(amount, userId = null) {
    if (amount <= 0) {
      return true;
    }
    
    try {
      const total = await this.getTotalPoints(userId);
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
      const totalStars = groups.reduce((sum, group) => {
        const stars = this._ensureNumber(group.stars, 0);
        return sum + stars;
      }, 0);
      
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
        const groupStars = this._ensureNumber(group.stars, 0);
        const deductFromGroup = Math.min(remainingAmount, groupStars);
        
        if (deductFromGroup > 0) {
          // 更新分组 - 确保数学运算正确
          group.stars = groupStars - deductFromGroup;
          remainingAmount -= deductFromGroup;
          
          // 记录扣除日志
          deductedGroups.push({
            groupId: group.id,
            amount: deductFromGroup,
            remaining: group.stars,
            expiryType: group.expiryType,
            expiryDate: group.expiryDate
          });
          
          logger.info('StarGroupRepository', `从分组${group.id}扣除${deductFromGroup}颗星星，剩余${group.stars}颗`);
        }
        
        // 只保留还有星星的分组
        if (group.stars > 0) {
          updatedGroups.push(group);
        } else {
          logger.info('StarGroupRepository', `分组${group.id}星星已用完，移除`);
        }
      }
      
      // 保存更新后的分组 - 修复保存逻辑
      logger.info('StarGroupRepository', `准备保存${updatedGroups.length}个更新后的分组`);
      
      // 直接使用_saveData保存最终分组数组，确保数据一致性
      await this._saveData(updatedGroups);
      
      // 强制清除缓存确保数据一致性
      this.invalidateCache();
      
      // 验证保存结果
      const verifyGroups = await this.getAll();
      const verifyTotal = verifyGroups.reduce((sum, group) => sum + (group.stars || 0), 0);
      const expectedTotal = totalStars - amount;
      
      logger.info('StarGroupRepository', `分组保存完成，保存${updatedGroups.length}个分组`);
      logger.info('StarGroupRepository', `数据验证: 预期总数=${expectedTotal}, 实际总数=${verifyTotal}, 一致性=${verifyTotal === expectedTotal}`);
      
      if (verifyTotal !== expectedTotal) {
        logger.error('StarGroupRepository', `数据不一致！预期${expectedTotal}颗，实际${verifyTotal}颗`);
      }
      
      logger.info('StarGroupRepository', `星星扣除完成，共扣除${amount}颗，剩余${expectedTotal}颗`);
      
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

  /**
   * 从特定有效期类型的分组中扣减星星
   * 专门用于任务取消完成时的星星扣减
   * @param {Number} amount 要扣减的星星数量
   * @param {String} expiryType 分组的有效期类型
   * @param {String} reason 扣减原因
   * @returns {Promise<Object>} 扣减结果
   */
  async deductStarsFromSpecificExpiryType(amount, expiryType, reason) {
    if (!amount || amount <= 0) {
      logger.warn('StarGroupRepository', `从特定类型扣减星星失败：无效的数量 ${amount}`);
      return { success: false, message: '扣减数量无效' };
    }
    
    if (!expiryType) {
      logger.warn('StarGroupRepository', `从特定类型扣减星星失败：未指定有效期类型`);
      return { success: false, message: '未指定有效期类型' };
    }
    
    try {
      logger.info('StarGroupRepository', `开始从特定类型扣减${amount}颗星星，有效期类型=${expiryType}`);
      
      // 获取指定有效期类型的分组
      const groups = await this.getGroupsByExpiryType(expiryType);
      
      if (!groups || groups.length === 0) {
        logger.warn('StarGroupRepository', `未找到有效期类型为${expiryType}的分组`);
        return { success: false, message: '未找到对应的星星分组' };
      }
      
      // 计算该类型分组的总星星数
      const totalStarsInType = groups.reduce((sum, group) => {
        const stars = this._ensureNumber(group.stars, 0);
        return sum + stars;
      }, 0);
      
      if (totalStarsInType < amount) {
        logger.warn('StarGroupRepository', `该类型分组星星不足，需要${amount}颗，当前${totalStarsInType}颗`);
        return { success: false, message: '该类型分组星星不足' };
      }
      
      // 按过期时间排序（先过期的在前）
      const sortedGroups = [...groups].sort((a, b) => {
        // 永久有效的放在最后
        if (a.expiryType === 'permanent') return 1;
        if (b.expiryType === 'permanent') return -1;
        
        // 按过期时间升序
        return (a.expiryDate || 0) - (b.expiryDate || 0);
      });
      
      // 从分组中依次扣减
      let remainingAmount = amount;
      const updatedGroups = [];
      const deductedGroups = [];
      
      for (const group of sortedGroups) {
        if (remainingAmount <= 0) {
          // 不需要继续扣减，保留原分组
          updatedGroups.push(group);
          continue;
        }
        
        // 当前分组可扣减的数量
        const groupStars = this._ensureNumber(group.stars, 0);
        const deductFromGroup = Math.min(remainingAmount, groupStars);
        
        if (deductFromGroup > 0) {
          // 更新分组 - 确保数学运算正确
          group.stars = groupStars - deductFromGroup;
          remainingAmount -= deductFromGroup;
          
          // 记录扣减日志
          deductedGroups.push({
            groupId: group.id,
            amount: deductFromGroup,
            remaining: group.stars,
            expiryType: group.expiryType,
            expiryDate: group.expiryDate
          });
          
          logger.info('StarGroupRepository', `从分组${group.id}扣减${deductFromGroup}颗星星，剩余${group.stars}颗`);
        }
        
        // 只保留还有星星的分组
        if (group.stars > 0) {
          updatedGroups.push(group);
        } else {
          logger.info('StarGroupRepository', `分组${group.id}星星已用完，移除`);
        }
      }
      
      // 保存更新后的分组
      // 注意：当updatedGroups为空时，需要获取所有分组并移除指定类型的分组
      if (updatedGroups.length === 0) {
        // 所有该类型的分组都被移除，需要从总分组中删除这些分组
        const allGroups = await this.getAll();
        const remainingGroups = allGroups.filter(group => group.expiryType !== expiryType);
        await this._saveData(remainingGroups);
        logger.info('StarGroupRepository', `所有${expiryType}类型分组已被移除，剩余分组数量=${remainingGroups.length}`);
      } else {
        // 有剩余分组，正常保存
        await this.saveAll(updatedGroups);
      }
      
      const savedCount = updatedGroups.length;
      logger.info('StarGroupRepository', `从特定类型扣减星星完成，更新了${savedCount}个分组，共扣减${amount}颗，原因：${reason}`);
      
      return {
        success: true,
        deductedGroups,
        message: '从特定类型扣减成功'
      };
    } catch (error) {
      logger.error('StarGroupRepository', `从特定类型扣减星星失败，有效期类型=${expiryType}`, error);
      return { success: false, message: '操作失败，请重试' };
    }
  }

  /**
   * 清除缓存
   * 强制下次查询时重新从存储中获取数据
   */
  clearCache() {
    logger.info('StarGroupRepository', '清除星星分组仓储缓存');
    
    // 调用父类的清除缓存方法
    if (super.clearCache) {
      super.clearCache();
    }
    
    // 清除存储适配器缓存
    if (this.storageAdapter && this.storageAdapter.clearCache) {
      this.storageAdapter.clearCache();
    }
  }
}

module.exports = StarGroupRepository; 