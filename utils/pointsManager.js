/**
 * 星星管理工具 - 统一管理用户星星的获取、保存和格式化
 */

const logger = require('./logger');
const storageUtils = require('./storageUtils');

const pointsManager = {
  /**
   * 获取用户星星数
   * @returns {Number} 用户星星数量，确保为整数类型
   */
  getUserPoints: function() {
    const points = parseInt(storageUtils.get('userPoints', 0), 10);
    logger.info('pointsManager', `获取用户星星: ${points}`);
    return points;
  },

  /**
   * 保存用户星星数
   * @param {Number} points 要保存的星星数量
   */
  saveUserPoints: function(points) {
    // 确保保存的是数字类型
    const numPoints = parseInt(points, 10);
    
    try {
      // 使用同步方式保存
      storageUtils.set('userPoints', numPoints);
      logger.info('pointsManager', `保存用户星星: ${numPoints}`);
      
      // 验证保存是否成功
      const savedPoints = storageUtils.get('userPoints', 0);
      if (savedPoints !== numPoints) {
        logger.warn('pointsManager', `星星数据保存验证失败: 预期=${numPoints}, 实际=${savedPoints}, 尝试再次保存`);
        // 再次尝试保存
        storageUtils.set('userPoints', numPoints);
      }
    } catch (error) {
      logger.error('pointsManager', `星星数据保存出错: ${error}`);
    }
  },

  /**
   * 增加用户星星数
   * @param {Number} amount 要增加的星星数量
   * @param {Object} expiryConfig 过期配置，包含有效期类型和日期
   * @param {String} source 星星来源标识，如任务ID
   * @returns {Number} 增加后的星星数量
   */
  addUserPoints: function(amount, expiryConfig, source) {
    // 确保数值为整数
    const points = parseInt(amount, 10);
    if (isNaN(points) || points <= 0) {
      logger.warn('pointsManager', `无效的星星数量: ${amount}`);
      return this.getUserPoints();
    }
    
    const currentPoints = this.getUserPoints();
    const newPoints = currentPoints + points;
    
    logger.info('pointsManager', `添加星星前检查: 当前=${currentPoints}, 增加=${points}, 预期结果=${newPoints}, 来源=${source || '未知'}`);
    
    // 确保使用同步方式保存星星数量，避免异步问题
    try {
      // 更新总星星数
      storageUtils.set('userPoints', newPoints);
      logger.info('pointsManager', `星星数据已同步保存: ${currentPoints} -> ${newPoints}`);
      
      // 立即验证保存是否成功
      const savedPoints = storageUtils.get('userPoints', 0);
      if (savedPoints !== newPoints) {
        logger.warn('pointsManager', `星星数据保存异常: 预期=${newPoints}, 实际=${savedPoints}, 尝试再次保存`);
        // 再次尝试保存
        storageUtils.set('userPoints', newPoints);
      }
    } catch (error) {
      logger.error('pointsManager', `星星数据保存出错: ${error}`);
    }
    
    // 如果提供了过期配置，添加到星星分组
    if (expiryConfig) {
      this.addStarsToGroup(points, expiryConfig.expiry, expiryConfig.expiryDateStr, source);
    }
    
    // 清理过期分组并检查数据一致性
    this.maintainStarGroups();
    
    logger.info('pointsManager', `增加星星完成: ${currentPoints} -> ${newPoints}, 增加: ${points}`);
    return newPoints;
  },

  /**
   * 减少用户星星数（实现"先过期先使用"策略）
   * @param {Number} amount 要减少的星星数量
   * @returns {Number} 减少后的星星数量
   */
  reduceUserPoints: function(amount) {
    // 确保数值为整数
    const points = parseInt(amount, 10);
    if (isNaN(points) || points <= 0) {
      logger.warn('pointsManager', `无效的星星消费数量: ${amount}`);
      return this.getUserPoints();
    }
    
    const currentPoints = this.getUserPoints();
    
    // 如果星星不足，直接返回
    if (currentPoints < points) {
      logger.warn('pointsManager', `星星不足，无法消费: 当前=${currentPoints}, 需要=${points}`);
      return currentPoints;
    }
    
    // 实现"先过期先使用"策略
    this._consumeStarsByExpiryOrder(points);
    
    // 更新总星星数
    const newPoints = Math.max(0, currentPoints - points);
    this.saveUserPoints(newPoints);
    
    // 清理过期分组并检查数据一致性
    this.maintainStarGroups();
    
    logger.info('pointsManager', `减少星星: ${currentPoints} -> ${newPoints}, 减少: ${points}`);
    return newPoints;
  },

  /**
   * 格式化星星数量
   * @param {Number} points 要格式化的星星数量
   * @param {Boolean} useThousandSeparator 是否使用千位分隔符
   * @returns {String} 格式化后的星星数量字符串
   */
  formatPoints: function(points, useThousandSeparator = false) {
    // 确保输入为数字
    const numPoints = parseInt(points, 10);
    
    if (useThousandSeparator) {
      // 添加千位分隔符
      return numPoints.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    // 普通格式化，直接返回字符串
    return numPoints.toString();
  },

  /**
   * 获取星星分组数据
   * @returns {Array} 星星分组数据
   */
  getStarGroups: function() {
    const groups = storageUtils.get('starGroups', []);
    logger.info('pointsManager', `获取星星分组数据，共${groups.length}组`);
    return groups;
  },

  /**
   * 保存星星分组数据
   * @param {Array} groups 星星分组数据
   */
  saveStarGroups: function(groups) {
    storageUtils.set('starGroups', groups);
    logger.info('pointsManager', `保存星星分组数据，共${groups.length}组`);
  },

  /**
   * 添加星星到分组
   * @param {Number} points 星星数量
   * @param {Number|String} expiryDate 过期时间戳或"permanent"
   * @param {String} expiryDateStr 可读的过期日期
   * @param {String} source 来源标识
   */
  addStarsToGroup: function(points, expiryDate, expiryDateStr, source) {
    // 确保参数有效
    if (!points || points <= 0) {
      logger.warn('pointsManager', `无效的星星数量，无法添加到分组`);
      return;
    }
    
    if (!expiryDate) {
      logger.warn('pointsManager', `未提供过期时间，默认设为永久有效`);
      expiryDate = 'permanent';
      expiryDateStr = '永久';
    }
    
    logger.info('pointsManager', `添加星星到分组: ${points}颗, 过期=${expiryDateStr}, 来源=${source || '未知'}`);
    
    // 获取当前分组数据
    const groups = this.getStarGroups();
    
    // 查找匹配的分组
    let existingGroup = groups.find(group => 
      group.expiryDate === expiryDate || 
      (typeof expiryDate === 'number' && 
       typeof group.expiryDate === 'number' &&
       new Date(group.expiryDate).toDateString() === new Date(expiryDate).toDateString())
    );
    
    if (existingGroup) {
      // 更新已有分组
      existingGroup.points += points;
      if (source && !existingGroup.sources.includes(source)) {
        existingGroup.sources.push(source);
      }
      logger.info('pointsManager', `更新已有分组: 现有数量=${existingGroup.points}, 过期=${existingGroup.expiryDateStr}`);
    } else {
      // 创建新分组
      const newGroup = {
        expiryDate: expiryDate,
        expiryDateStr: expiryDateStr,
        points: points,
        sources: source ? [source] : []
      };
      groups.push(newGroup);
      logger.info('pointsManager', `创建新的星星分组: ${points}颗, 过期=${expiryDateStr}`);
    }
    
    // 按过期日期排序（永久有效的放在最后）
    this._sortStarGroups(groups);
    
    // 保存更新后的分组
    this.saveStarGroups(groups);
  },

  /**
   * 清理已过期的星星分组
   */
  cleanupExpiredGroups: function() {
    logger.info('pointsManager', `清理已过期星星分组`);
    
    const now = Date.now();
    const groups = this.getStarGroups();
    
    // 过滤出未过期的分组
    const validGroups = groups.filter(group => 
      group.expiryDate === 'permanent' || 
      (typeof group.expiryDate === 'number' && group.expiryDate > now)
    );
    
    // 检查是否有分组被移除
    if (validGroups.length < groups.length) {
      const expiredGroups = groups.length - validGroups.length;
      const expiredPoints = groups
        .filter(g => g.expiryDate !== 'permanent' && typeof g.expiryDate === 'number' && g.expiryDate <= now)
        .reduce((sum, g) => sum + g.points, 0);
      
      logger.info('pointsManager', `清理了${expiredGroups}个已过期分组，共${expiredPoints}颗星星`);
      
      // 更新总星星数（从总数中减去过期的星星）
      const currentTotal = this.getUserPoints();
      const newTotal = Math.max(0, currentTotal - expiredPoints);
      this.saveUserPoints(newTotal);
      
      // 保存更新后的分组
      this.saveStarGroups(validGroups);
      
      logger.info('pointsManager', `更新总星星数: ${currentTotal} -> ${newTotal}, 减少: ${expiredPoints}`);
    }
  },

  /**
   * 检查星星数据一致性
   */
  checkDataConsistency: function() {
    logger.info('pointsManager', `检查星星数据一致性`);
    
    const groups = this.getStarGroups();
    const storedTotal = this.getUserPoints();
    
    // 计算所有分组的星星总和
    const groupsTotal = groups.reduce((sum, group) => sum + group.points, 0);
    
    // 检查是否一致
    if (groupsTotal !== storedTotal) {
      logger.warn('pointsManager', `星星数据不一致: 分组总和=${groupsTotal}, 存储总数=${storedTotal}`);
    } else {
      logger.info('pointsManager', `星星数据一致性检查通过: 总数=${storedTotal}`);
    }
  },
  
  /**
   * 维护星星分组数据
   * 清理过期分组并检查数据一致性
   */
  maintainStarGroups: function() {
    this.cleanupExpiredGroups();
    this.checkDataConsistency();
  },
  
  /**
   * 按过期顺序消费星星（先过期先使用）
   * @param {Number} amount 要消费的数量
   * @private
   */
  _consumeStarsByExpiryOrder: function(amount) {
    logger.info('pointsManager', `按过期顺序消费星星: ${amount}颗`);
    
    // 获取星星分组
    let groups = this.getStarGroups();
    
    // 如果没有分组数据但有星星，创建一个永久有效的默认分组
    if (groups.length === 0) {
      const total = this.getUserPoints();
      if (total > 0) {
        groups = [{
          expiryDate: 'permanent',
          expiryDateStr: '永久',
          points: total,
          sources: ['system_default']
        }];
        this.saveStarGroups(groups);
        logger.info('pointsManager', `创建默认星星分组: ${total}颗, 永久有效`);
      }
    }
    
    // 按过期日期排序
    this._sortStarGroups(groups);
    
    // 追踪剩余需要消费的数量
    let remaining = amount;
    let consumptionLog = [];
    
    // 从最早过期的分组开始消费
    for (let i = 0; i < groups.length && remaining > 0; i++) {
      const group = groups[i];
      
      // 确定从当前分组消费的数量
      const toConsume = Math.min(remaining, group.points);
      
      // 更新分组星星数
      group.points -= toConsume;
      
      // 记录消费日志
      consumptionLog.push(`从"${group.expiryDateStr}"过期分组消费${toConsume}颗`);
      
      // 更新剩余需要消费的数量
      remaining -= toConsume;
      
      logger.info('pointsManager', `从过期时间为"${group.expiryDateStr}"的分组消费${toConsume}颗星星，剩余${group.points}颗`);
    }
    
    // 移除空分组
    const updatedGroups = groups.filter(group => group.points > 0);
    
    // 保存更新后的分组
    this.saveStarGroups(updatedGroups);
    
    logger.info('pointsManager', `星星消费完成，消费记录: ${consumptionLog.join('; ')}`);
  },
  
  /**
   * 对星星分组按过期日期排序
   * @param {Array} groups 星星分组
   * @private
   */
  _sortStarGroups: function(groups) {
    groups.sort((a, b) => {
      // 永久有效的放在最后
      if (a.expiryDate === 'permanent') return 1;
      if (b.expiryDate === 'permanent') return -1;
      
      // 数字类型按从小到大排序（先过期的在前面）
      return a.expiryDate - b.expiryDate;
    });
  },

  /**
   * 计算下一个奖励信息
   * @param {Array} rewards 所有奖励配置
   * @returns {Object} 下一个奖励的信息，包含name, points, remainingStars等属性
   */
  calculateNextReward: function(rewards) {
    logger.info('pointsManager', `计算下一个奖励信息，共${rewards ? rewards.length : 0}个奖励配置`);
    
    if (!rewards || rewards.length === 0) {
      logger.warn('pointsManager', `没有奖励配置，返回默认值`);
      return {
        name: '奖品',
        points: 100,
        icon: '🎁',
        count: 1,
        remainingStars: 100,
        current: 0
      };
    }
    
    // 获取用户当前星星数
    const userPoints = this.getUserPoints();
    
    // 过滤掉已领取的奖励，只保留未领取的奖励
    const availableRewards = rewards.filter(reward => !reward.claimed);
    logger.info('pointsManager', `过滤已领取奖励后，剩余可用奖励: ${availableRewards.length}个`);
    
    // 如果没有可用奖励（全部已领取），则返回默认值
    if (availableRewards.length === 0) {
      logger.info('pointsManager', `所有奖励都已领取，返回无穷模式`);
      return {
        name: '恭喜！您已领取所有奖励，可以继续积累星星',
        points: '∞',  // 使用无穷符号
        icon: '🎉',
        count: 0,
        remainingStars: 0,
        current: userPoints,
        allClaimed: true  // 标记所有奖励都已领取
      };
    }
    
    // 更新奖励解锁状态
    const updatedRewards = availableRewards.map(reward => {
      return {
        ...reward,
        unlocked: userPoints >= reward.points
      };
    });
    
    // 按星星需求量排序
    updatedRewards.sort((a, b) => a.points - b.points);
    
    // 查找下一个未解锁的奖励
    let nextUnlockedRewards = updatedRewards.filter(reward => !reward.unlocked);
    
    // 如果所有奖励都已解锁，使用最高级别的奖励
    if (nextUnlockedRewards.length === 0 && updatedRewards.length > 0) {
      nextUnlockedRewards = [updatedRewards[updatedRewards.length - 1]];
    }
    
    let nextReward = {
      name: '奖品',
      points: 100,
      icon: '🎁',
      count: 1,
      remainingStars: 100,
      current: userPoints
    };
    
    if (nextUnlockedRewards.length > 0) {
      const nextPoints = nextUnlockedRewards[0].points;
      const samePointsRewards = nextUnlockedRewards.filter(r => r.points === nextPoints);
      
      nextReward = {
        name: samePointsRewards[0].name,
        points: nextPoints,
        icon: samePointsRewards[0].icon,
        count: samePointsRewards.length,
        remainingStars: Math.max(0, nextPoints - userPoints),
        current: userPoints
      };
      
      logger.info('pointsManager', `下一个奖励: ${nextReward.name}, 需要${nextReward.points}颗星星, 还差${nextReward.remainingStars}颗`);
    }
    
    return nextReward;
  },

  /**
   * 获取星星记录
   * 从各个来源收集星星变动记录
   * @param {Function} callback 回调函数，参数为记录数组
   */
  getStarRecords: function(callback) {
    logger.info('pointsManager', `开始获取星星记录`);
    
    const records = [];
    
    // 获取任务数据
    const tasks = storageUtils.get('taskData', []);
    
    // 获取已完成任务记录中的星星获取记录
    const completedTasks = tasks.filter(task => 
      task.status === 1 && task.starAwarded === true
    );
    
    logger.info('pointsManager', `从${completedTasks.length}个已完成任务中获取星星记录`);
    
    // 将任务完成记录转换为星星记录
    completedTasks.forEach(task => {
      const timestamp = task.completionRecords && task.completionRecords.length > 0 
        ? task.completionRecords[0].timestamp
        : task.modifyTime || Date.now();
      
      const date = new Date(timestamp);
      const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      
      records.push({
        id: `task_${task.id}_${timestamp}`,
        title: `完成任务：${task.title}`,
        time: timeStr,
        timestamp: timestamp,
        points: task.points || 0,
        type: 'income',
        source: 'task'
      });
    });
    
    // 获取未完成必做任务的惩罚记录中的星星扣除记录
    const penaltyTasks = tasks.filter(task => 
      task.isRequired === true && task.penaltyApplied === true
    );
    
    logger.info('pointsManager', `从${penaltyTasks.length}个未完成必做任务中获取星星扣除记录`);
    
    // 将未完成必做任务记录转换为星星扣除记录
    penaltyTasks.forEach(task => {
      const timestamp = task.modifyTime || Date.now();
      const date = new Date(timestamp);
      const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      
      records.push({
        id: `penalty_${task.id}_${timestamp}`,
        title: `未完成必做任务：${task.title}`,
        time: timeStr,
        timestamp: timestamp,
        points: -(task.points || 0), // 扣除的星星使用负数表示
        type: 'penalty',
        source: 'task'
      });
    });
    
    // 获取奖励兑换记录中的星星使用记录
    const rewards = storageUtils.get('rewards', []);
    const claimedRewards = rewards.filter(reward => reward.claimed && reward.claimTime);
    
    logger.info('pointsManager', `从${claimedRewards.length}个已领取奖励中获取星星记录`);
    
    // 将奖励兑换记录转换为星星记录
    claimedRewards.forEach(reward => {
      const timestamp = reward.claimTime;
      const date = new Date(timestamp);
      const timeStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      
      records.push({
        id: `reward_${reward.id}_${timestamp}`,
        title: `兑换奖励：${reward.name}`,
        time: timeStr,
        timestamp: timestamp,
        points: -reward.points,
        type: 'expense',
        source: 'reward'
      });
    });
    
    // 可以在这里添加其他来源的星星记录，如系统奖励等
    
    // 按时间戳排序，最新的在前面
    records.sort((a, b) => b.timestamp - a.timestamp);
    
    logger.info('pointsManager', `获取到${records.length}条星星记录（${completedTasks.length}条获得，${penaltyTasks.length}条扣除，${claimedRewards.length}条奖励兑换）`);
    
    // 如果提供了回调函数，通过回调返回结果
    if (typeof callback === 'function') {
      callback(records);
    }
    
    return records;
  },

  /**
   * 按月份分组星星记录
   * @param {Array} records 星星记录数组
   * @returns {Array} 按月份分组的记录数组
   */
  groupRecordsByMonth: function(records) {
    logger.info('pointsManager', `开始按月份分组${records.length}条星星记录`);
    
    // 创建月份分组映射
    const monthGroups = {};
    
    // 遍历记录并分组
    records.forEach(record => {
      const date = new Date(record.timestamp);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
      
      if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = {
          title: `${year}年${month}月`,
          records: []
        };
      }
      
      monthGroups[monthKey].records.push(record);
    });
    
    // 将对象转换为数组并按月份倒序排序
    const result = Object.values(monthGroups).sort((a, b) => {
      return b.title.localeCompare(a.title);
    });
    
    logger.info('pointsManager', `分组完成，共${result.length}个月份`);
    
    return result;
  }
};

module.exports = pointsManager; 