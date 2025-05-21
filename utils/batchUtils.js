/**
 * batchUtils.js - 通用批量处理工具
 * 
 * 提供批量处理数据的通用函数，避免UI阻塞
 */

const logger = require('./logger');

const batchUtils = {
  /**
   * 批量处理数据
   * @param {Array} items 需要处理的数据项数组
   * @param {Function} processFn 处理单个项的函数
   * @param {Object} options 选项
   * @param {Number} options.batchSize 每批处理的数量，默认50
   * @param {Number} options.delay 批次间延迟毫秒数，默认0
   * @param {Boolean} options.showProgress 是否显示进度，默认true
   * @param {Function} callback 全部处理完成后的回调函数
   */
  batchProcess: function(items, processFn, options = {}, callback) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      logger.warn('batchUtils', '批量处理的数据为空');
      if (typeof callback === 'function') {
        callback();
      }
      return;
    }

    const { 
      batchSize = 50, 
      delay = 0, 
      showProgress = true,
      progressTitle = '处理中'
    } = options;
    
    logger.info('batchUtils', `开始批量处理: ${items.length}项, 每批${batchSize}项`);
    
    let processedCount = 0;
    let index = 0;
    
    // 创建进度显示
    if (showProgress) {
      wx.showLoading({
        title: `${progressTitle}(0/${items.length})`,
        mask: true
      });
    }
    
    const processNextBatch = () => {
      const batch = items.slice(index, index + batchSize);
      if (batch.length === 0) {
        logger.info('batchUtils', '批量处理完成');
        if (showProgress) {
          wx.hideLoading();
        }
        if (typeof callback === 'function') {
          callback();
        }
        return;
      }
      
      console.log(`[batchUtils] 处理批次: ${Math.floor(index/batchSize) + 1}, 项数: ${batch.length}`);
      logger.info('batchUtils', `处理批次: ${Math.floor(index/batchSize) + 1}, 项数: ${batch.length}`);
      
      // 处理当前批次
      batch.forEach(item => {
        processFn(item);
        processedCount++;
        
        // 更新进度显示
        if (showProgress && processedCount % 10 === 0) {
          wx.showLoading({
            title: `${progressTitle}(${processedCount}/${items.length})`,
            mask: true
          });
        }
      });
      
      index += batchSize;
      
      // 延迟处理下一批，避免UI阻塞
      setTimeout(processNextBatch, delay);
    };
    
    // 开始处理第一批
    processNextBatch();
  },
  
  /**
   * 将数组分组处理
   * @param {Array} array 要分组的数组
   * @param {Function} keyFn 提取分组键的函数
   * @returns {Object} 分组结果
   */
  groupBy: function(array, keyFn) {
    if (!array || !Array.isArray(array) || array.length === 0) {
      return {};
    }
    
    return array.reduce((result, item) => {
      const key = keyFn(item);
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(item);
      return result;
    }, {});
  },
  
  /**
   * 按指定数量对数组进行分块
   * @param {Array} array 要分块的数组
   * @param {Number} size 每块的大小
   * @returns {Array} 分块后的二维数组
   */
  chunk: function(array, size = 10) {
    if (!array || !Array.isArray(array) || array.length === 0) {
      return [];
    }
    
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
};

module.exports = batchUtils; 