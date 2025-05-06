/**
 * 星星管理工具 - 统一管理用户星星的获取、保存和格式化
 */
const pointsManager = {
  /**
   * 获取用户星星数
   * @returns {Number} 用户星星数量，确保为整数类型
   */
  getUserPoints: function() {
    const points = parseInt(wx.getStorageSync('userPoints') || 0, 10);
    console.log(`[pointsManager] 获取用户星星: ${points}`);
    return points;
  },

  /**
   * 保存用户星星数
   * @param {Number} points 要保存的星星数量
   */
  saveUserPoints: function(points) {
    // 确保保存的是数字类型
    const numPoints = parseInt(points, 10);
    wx.setStorageSync('userPoints', numPoints);
    console.log(`[pointsManager] 保存用户星星: ${numPoints}`);
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
    console.log(`[pointsManager] 增加星星: ${currentPoints} -> ${newPoints}, 增加: ${amount}`);
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
    console.log(`[pointsManager] 减少星星: ${currentPoints} -> ${newPoints}, 减少: ${amount}`);
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
    console.log(`[pointsManager] 计算下一个奖励信息，共${rewards.length}个奖励配置`);
    
    if (!rewards || rewards.length === 0) {
      console.log(`[pointsManager] 没有奖励配置，返回默认值`);
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
    
    // 更新奖励解锁状态
    const updatedRewards = rewards.map(reward => {
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
      
      console.log(`[pointsManager] 下一个奖励: ${nextReward.name}, 需要${nextReward.points}颗星星, 还差${nextReward.remainingStars}颗`);
    }
    
    return nextReward;
  }
};

module.exports = pointsManager; 