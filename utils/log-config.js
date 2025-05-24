/**
 * log-config.js - 日志配置工具
 * 
 * 提供统一的日志级别配置功能，可在应用启动时设置全局日志级别
 */

const logger = require('./logger');

/**
 * 日志配置类
 */
class LogConfig {
  constructor() {
    // 默认配置
    this.config = {
      // 日志级别配置
      levels: {
        // 全局默认级别，会根据环境自动调整
        default: null,
        // 模块特定级别
        modules: {}
      },
      
      // 调试特性配置
      features: {
        // 是否在日志中包含时间戳
        showTimestamp: true,
        // 是否在控制台打印日志
        consoleOutput: true,
        // 是否保存日志到存储
        storeLogs: false,
        // 存储日志的键名
        logStorageKey: '_app_logs',
        // 存储最大日志条数
        maxLogEntries: 1000
      }
    };
  }
  
  /**
   * 初始化日志配置
   * @param {Object} options 配置选项
   */
  init(options = {}) {
    logger.info('LogConfig', '初始化日志配置');
    
    if (options.levels) {
      this.setLogLevels(options.levels);
    }
    
    if (options.features) {
      this.config.features = {
        ...this.config.features,
        ...options.features
      };
    }
    
    return this;
  }
  
  /**
   * 设置日志级别配置
   * @param {Object} levelConfig 级别配置对象
   */
  setLogLevels(levelConfig = {}) {
    // 处理默认级别
    if (levelConfig.default) {
      this.setDefaultLogLevel(levelConfig.default);
    }
    
    // 处理模块特定级别
    if (levelConfig.modules && typeof levelConfig.modules === 'object') {
      for (const module in levelConfig.modules) {
        this.setModuleLogLevel(module, levelConfig.modules[module]);
      }
    }
    
    return this;
  }
  
  /**
   * 设置默认日志级别
   * @param {String} level 日志级别
   */
  setDefaultLogLevel(level) {
    if (!level) return this;
    
    logger.info('LogConfig', `设置默认日志级别: ${level}`);
    logger.setLevel(level);
    this.config.levels.default = level;
    
    return this;
  }
  
  /**
   * 设置特定模块的日志级别
   * @param {String} module 模块名
   * @param {String} level 日志级别
   */
  setModuleLogLevel(module, level) {
    if (!module || !level) return this;
    
    logger.info('LogConfig', `设置模块 ${module} 的日志级别: ${level}`);
    this.config.levels.modules[module] = level;
    
    return this;
  }
  
  /**
   * 应用基于环境的默认配置
   */
  applyEnvironmentDefaults() {
    let defaultLevel;
    let isDevTools = false;
    
    try {
      // 尝试检测开发者工具环境，使用deviceInfo工具替代废弃API
      if (typeof wx !== 'undefined') {
        const deviceInfo = require('./deviceInfo');
        const systemInfo = deviceInfo.getSystemInfo();
        isDevTools = systemInfo.platform === 'devtools';
        
        // 记录日志
        logger.debug('LogConfig', '系统环境检测', { platform: systemInfo.platform });
      }
    } catch (e) {
      // 忽略错误，记录警告
      logger.warn('LogConfig', '获取系统信息失败，使用默认配置', e);
    }
    
    // 根据环境设置默认级别
    if (isDevTools) {
      defaultLevel = 'debug';
      
      // 开发环境特定模块配置
      this.config.levels.modules = {
        ...this.config.levels.modules,
        'BaseRepository': 'info', // 仓储层默认info级别，减少噪音
        'StorageAdapter': 'info'  // 存储适配器默认info级别，减少噪音
      };
    } else {
      defaultLevel = 'error';
      
      // 生产环境特性
      this.config.features.storeLogs = false;   // 不保存日志到存储
      this.config.features.showTimestamp = false; // 不显示时间戳
    }
    
    // 设置默认级别
    if (!this.config.levels.default) {
      this.setDefaultLogLevel(defaultLevel);
    }
    
    return this;
  }
  
  /**
   * 获取指定模块的日志级别
   * @param {String} module 模块名
   * @returns {String} 日志级别
   */
  getModuleLogLevel(module) {
    // 先查找模块特定级别
    if (module && this.config.levels.modules[module]) {
      return this.config.levels.modules[module];
    }
    
    // 否则返回默认级别
    return this.config.levels.default;
  }
  
  /**
   * 创建模块特定的日志记录器
   * @param {String} module 模块名
   * @returns {Object} 日志记录器
   */
  createModuleLogger(module) {
    const moduleLevel = this.getModuleLogLevel(module);
    
    return {
      debug: (message, data) => {
        if (this._shouldLog(moduleLevel, 'debug')) {
          logger.debug(module, message, data);
        }
      },
      
      info: (message, data) => {
        if (this._shouldLog(moduleLevel, 'info')) {
          logger.info(module, message, data);
        }
      },
      
      warn: (message, data) => {
        if (this._shouldLog(moduleLevel, 'warn')) {
          logger.warn(module, message, data);
        }
      },
      
      error: (message, error) => {
        if (this._shouldLog(moduleLevel, 'error')) {
          logger.error(module, message, error);
        }
      }
    };
  }
  
  /**
   * 检查是否应该记录日志
   * @private
   * @param {String} configLevel 配置的级别
   * @param {String} methodLevel 方法级别
   * @returns {Boolean} 是否应该记录
   */
  _shouldLog(configLevel, methodLevel) {
    const LogLevelMap = {
      'debug': 0,
      'info': 1,
      'warn': 2,
      'error': 3,
      'none': 99
    };
    
    const configValue = LogLevelMap[configLevel] !== undefined ? 
      LogLevelMap[configLevel] : LogLevelMap.info;
    
    const methodValue = LogLevelMap[methodLevel] !== undefined ?
      LogLevelMap[methodLevel] : LogLevelMap.info;
    
    return methodValue >= configValue;
  }
}

// 创建单例
const logConfig = new LogConfig();

// 导出单例
module.exports = logConfig; 