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
    storageUtils.set('userPoints', numPoints);
    logger.info('pointsManager', `保存用户星星: ${numPoints}`);
  },

  /**
   * 增加用户星星数
   * @param {Number} amount 要增加的星星数量
   * @returns {Number} 增加后的星星数量
   */
  addUserPoints: function(amount) {
    const currentPoints = this.getUserPoints();
    const newPoints = currentPoints + parseInt(amount, 10);
    this.saveUserPoints(newPoints);
    logger.info('pointsManager', `增加星星: ${currentPoints} -> ${newPoints}, 增加: ${amount}`);
    return newPoints;
  },

  /**
   * 减少用户星星数
   * @param {Number} amount 要减少的星星数量
   * @returns {Number} 减少后的星星数量
   */
  reduceUserPoints: function(amount) {
    const currentPoints = this.getUserPoints();
    // 确保星星不会为负数
    const newPoints = Math.max(0, currentPoints - parseInt(amount, 10));
    this.saveUserPoints(newPoints);
    logger.info('pointsManager', `减少星星: ${currentPoints} -> ${newPoints}, 减少: ${amount}`);
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
    
    // 获取任务完成记录中的星星获取记录
    const tasks = storageUtils.get('taskData', []);
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
    
    logger.info('pointsManager', `获取到${records.length}条星星记录`);
    
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