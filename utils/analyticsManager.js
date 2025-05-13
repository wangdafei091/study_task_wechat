/**
 * 分析管理器 - 专门处理数据分析和报表功能
 */

const logger = require('./logger');
const storageUtils = require('./storageUtils');
const dateUtils = require('./dateUtils');

const analyticsManager = {
  /**
   * 获取任务星星日历数据
   * 只获取任务完成获得的星星和未完成必做任务扣除的星星
   * @param {Function} callback 回调函数，参数为记录数组
   */
  getTaskStarCalendarData: function(callback) {
    logger.info('analyticsManager', `开始获取任务星星日历数据`);
    
    const records = [];
    
    // 获取任务数据
    const tasks = storageUtils.get('taskData', []);
    
    // 获取已完成任务记录中的星星获取记录
    const completedTasks = tasks.filter(task => 
      task.status === 1 && task.starAwarded === true
    );
    
    logger.info('analyticsManager', `从${completedTasks.length}个已完成任务中获取星星记录`);
    
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
    
    logger.info('analyticsManager', `从${penaltyTasks.length}个未完成必做任务中获取星星扣除记录`);
    
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
    
    // 按时间戳排序，最新的在前面
    records.sort((a, b) => b.timestamp - a.timestamp);
    
    logger.info('analyticsManager', `获取到${records.length}条任务星星记录（${completedTasks.length}条获得，${penaltyTasks.length}条扣除）`);
    
    // 如果提供了回调函数，通过回调返回结果
    if (typeof callback === 'function') {
      callback(records);
    }
    
    return records;
  },
  
  /**
   * 按日期分组星星记录
   * @param {Array} records 星星记录数组
   * @returns {Object} 按日期分组的记录对象
   */
  groupRecordsByDate: function(records) {
    logger.info('analyticsManager', `开始按日期分组${records.length}条星星记录`);
    
    const result = {};
    
    records.forEach(record => {
      if (!record.timestamp) return;
      
      const date = new Date(record.timestamp);
      const dateString = dateUtils.formatDate(date);
      
      if (!result[dateString]) {
        result[dateString] = [];
      }
      
      result[dateString].push(record);
    });
    
    const dateCount = Object.keys(result).length;
    logger.info('analyticsManager', `分组完成，共${dateCount}个日期`);
    
    return result;
  },
  
  /**
   * 计算任务完成情况统计数据
   * 后续可添加更多分析功能
   */
  getTaskCompletionStats: function(dateRange, callback) {
    // 这里将来可以实现任务完成率分析功能
    // 暂时返回空对象
    return {};
  }
};

module.exports = analyticsManager; 