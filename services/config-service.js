/**
 * config-service.js - 配置服务
 * 
 * 统一管理应用配置、用户偏好和系统标记
 */

const logger = require('../utils/logger');
const StorageAdapter = require('../adapters/storage-adapter');

class ConfigService {
  constructor(options = {}) {
    // 使用config_前缀的命名空间
    this.storageAdapter = new StorageAdapter({
      namespace: 'config_',
      useCache: true,
      cacheExpiry: 300000 // 配置缓存5分钟
    });
    
    this.eventBus = options.eventBus;
    
    logger.info('ConfigService', '配置服务初始化完成');
  }

  /**
   * 获取配置值
   * @param {string} key 配置键
   * @param {*} defaultValue 默认值
   * @returns {*} 配置值
   */
  get(key, defaultValue = null) {
    try {
      const value = this.storageAdapter.get(key, defaultValue);
      logger.debug('ConfigService', `获取配置: ${key} = ${value}`);
      return value;
    } catch (error) {
      logger.error('ConfigService', `获取配置失败: ${key}`, error);
      return defaultValue;
    }
  }

  /**
   * 设置配置值
   * @param {string} key 配置键
   * @param {*} value 配置值
   * @returns {boolean} 是否成功
   */
  set(key, value) {
    try {
      const success = this.storageAdapter.set(key, value);
      if (success) {
        logger.info('ConfigService', `设置配置: ${key} = ${value}`);
        
        // 发布配置变更事件
        if (this.eventBus) {
          this.eventBus.emit('config:changed', { key, value });
        }
      }
      return success;
    } catch (error) {
      logger.error('ConfigService', `设置配置失败: ${key}`, error);
      return false;
    }
  }

  /**
   * 删除配置
   * @param {string} key 配置键
   * @returns {boolean} 是否成功
   */
  remove(key) {
    try {
      const success = this.storageAdapter.remove(key);
      if (success) {
        logger.info('ConfigService', `删除配置: ${key}`);
        
        // 发布配置删除事件
        if (this.eventBus) {
          this.eventBus.emit('config:removed', { key });
        }
      }
      return success;
    } catch (error) {
      logger.error('ConfigService', `删除配置失败: ${key}`, error);
      return false;
    }
  }

  // === 系统配置方法 ===

  /**
   * 获取过期检查时间戳
   * @returns {number} 时间戳
   */
  getLastExpiryCheckTime() {
    return this.get('last_expiry_check_time', 0);
  }

  /**
   * 设置过期检查时间戳
   * @param {number} timestamp 时间戳
   */
  setLastExpiryCheckTime(timestamp) {
    return this.set('last_expiry_check_time', timestamp);
  }

  /**
   * 检查是否首次启动
   * @returns {boolean} 是否首次启动
   */
  isFirstLaunch() {
    return !this.get('has_welcomed_user', false);
  }

  /**
   * 标记已欢迎用户
   */
  markUserWelcomed() {
    return this.set('has_welcomed_user', true);
  }

  /**
   * 检查是否有自定义奖励
   * @returns {boolean} 是否有自定义奖励
   */
  hasCustomRewards() {
    return this.get('has_custom_rewards', false);
  }

  /**
   * 设置自定义奖励标记
   * @param {boolean} hasCustom 是否有自定义奖励
   */
  setCustomRewards(hasCustom) {
    return this.set('has_custom_rewards', hasCustom);
  }

  /**
   * 获取用户日志配置
   * @returns {Object|null} 日志配置
   */
  getUserLogConfig() {
    return this.get('user_log_config', null);
  }

  /**
   * 设置用户日志配置
   * @param {Object} config 日志配置
   */
  setUserLogConfig(config) {
    return this.set('user_log_config', config);
  }

  // === 用户偏好方法 ===

  /**
   * 获取用户偏好
   * @param {string} key 偏好键
   * @param {*} defaultValue 默认值
   * @returns {*} 偏好值
   */
  getUserPreference(key, defaultValue = null) {
    return this.get(`pref_${key}`, defaultValue);
  }

  /**
   * 设置用户偏好
   * @param {string} key 偏好键
   * @param {*} value 偏好值
   */
  setUserPreference(key, value) {
    return this.set(`pref_${key}`, value);
  }

  /**
   * 检查提示是否已显示
   * @param {string} tipKey 提示键
   * @returns {boolean} 是否已显示
   */
  isTipShown(tipKey) {
    return this.getUserPreference(`tip_shown_${tipKey}`, false);
  }

  /**
   * 标记提示已显示
   * @param {string} tipKey 提示键
   */
  markTipShown(tipKey) {
    return this.setUserPreference(`tip_shown_${tipKey}`, true);
  }

  // === 批量操作方法 ===

  /**
   * 批量获取配置
   * @param {string[]} keys 配置键数组
   * @returns {Object} 配置对象
   */
  getBatch(keys) {
    const result = {};
    keys.forEach(key => {
      result[key] = this.get(key);
    });
    return result;
  }

  /**
   * 批量设置配置
   * @param {Object} configs 配置对象
   * @returns {boolean} 是否全部成功
   */
  setBatch(configs) {
    let allSuccess = true;
    Object.entries(configs).forEach(([key, value]) => {
      if (!this.set(key, value)) {
        allSuccess = false;
      }
    });
    return allSuccess;
  }

  /**
   * 清除所有配置（谨慎使用）
   * @returns {Promise<boolean>} 是否成功
   */
  async clearAll() {
    try {
      await this.storageAdapter.clearNamespace();
      logger.info('ConfigService', '清除所有配置成功');
      return true;
    } catch (error) {
      logger.error('ConfigService', '清除所有配置失败', error);
      return false;
    }
  }
}

module.exports = ConfigService; 