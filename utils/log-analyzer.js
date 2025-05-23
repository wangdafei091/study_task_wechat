/**
 * log-analyzer.js - 日志分析工具
 * 
 * 用于识别代码中直接使用console的地方，帮助开发者进行日志系统迁移
 * 仅在开发环境使用，不会打包到生产环境
 */

const logger = require('./logger');

/**
 * 日志分析器类
 */
class LogAnalyzer {
  constructor() {
    // 记录发现的console使用
    this.findings = {
      log: [],
      warn: [],
      error: [],
      info: [],
      debug: []
    };
    
    // 忽略的文件模式
    this.ignorePaths = [
      'node_modules',
      'miniprogram_npm',
      'utils/logger.js',
      'utils/log-analyzer.js'
    ];
    
    // 初始化完成标记
    this.initialized = false;
  }
  
  /**
   * 初始化分析器
   */
  init() {
    if (this.initialized) return;
    
    logger.info('LogAnalyzer', '初始化日志分析器');
    
    // 仅在开发环境启用
    if (this._isDevelopmentEnv()) {
      this._monkeyPatchConsole();
      this.initialized = true;
      logger.info('LogAnalyzer', '日志分析器已启用，将监控console调用');
    } else {
      logger.info('LogAnalyzer', '非开发环境，日志分析器未启用');
    }
  }
  
  /**
   * 获取当前调用堆栈信息
   * @private
   * @returns {Object} 调用信息
   */
  _getCallerInfo() {
    try {
      // 创建错误对象以获取堆栈
      const err = new Error();
      const stack = err.stack || '';
      const stackLines = stack.split('\n');
      
      // 跳过前3行（Error, _getCallerInfo, _monkeyPatchedConsole）
      // 获取第4行，即实际调用console的位置
      const callerLine = stackLines[3] || '';
      
      // 解析文件路径和行号
      // 格式例如：at Object.log (pages/index/index.js:123:45)
      const matches = callerLine.match(/\(([^:]+):(\d+):(\d+)\)/) || 
                     callerLine.match(/at\s+([^:]+):(\d+):(\d+)/);
      
      if (matches && matches.length >= 3) {
        const filePath = matches[1] || 'unknown';
        const lineNumber = parseInt(matches[2]) || 0;
        const columnNumber = parseInt(matches[3]) || 0;
        
        // 检查是否应该忽略此路径
        for (const ignorePath of this.ignorePaths) {
          if (filePath.includes(ignorePath)) {
            return null;
          }
        }
        
        return {
          filePath,
          lineNumber,
          columnNumber,
          timestamp: Date.now()
        };
      }
    } catch (e) {
      // 忽略错误，不干扰正常流程
    }
    
    return null;
  }
  
  /**
   * 猴子补丁console方法以收集调用信息
   * @private
   */
  _monkeyPatchConsole() {
    const self = this;
    const originalMethods = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug
    };
    
    // 替换所有方法
    for (const method in originalMethods) {
      console[method] = function(...args) {
        // 调用原始方法
        originalMethods[method].apply(console, args);
        
        // 收集调用信息
        const callerInfo = self._getCallerInfo();
        if (callerInfo) {
          self.findings[method].push({
            ...callerInfo,
            args: args.map(arg => 
              typeof arg === 'object' ? 
                JSON.stringify(arg).substring(0, 100) : 
                String(arg).substring(0, 100)
            )
          });
          
          // 如果累计超过一定数量，输出警告
          if (self.findings[method].length % 10 === 0) {
            logger.warn('LogAnalyzer', `发现${self.findings[method].length}处直接使用console.${method}的代码，推荐使用logger`);
            self._suggestLoggerUsage(method, callerInfo);
          }
        }
      };
    }
    
    logger.info('LogAnalyzer', 'Console方法已被监控');
  }
  
  /**
   * 给出使用logger的建议
   * @private
   * @param {String} method console方法
   * @param {Object} callerInfo 调用信息
   */
  _suggestLoggerUsage(method, callerInfo) {
    const loggerMethod = method === 'log' ? 'info' : method;
    
    logger.info('LogAnalyzer', `建议修改 ${callerInfo.filePath}:${callerInfo.lineNumber} 处的代码:`);
    logger.info('LogAnalyzer', `  从: console.${method}(...)`);
    logger.info('LogAnalyzer', `  到: logger.${loggerMethod}('模块名', '消息', 数据对象)`);
  }
  
  /**
   * 检查是否为开发环境
   * @private
   * @returns {Boolean} 是否为开发环境
   */
  _isDevelopmentEnv() {
    try {
      // 尝试获取当前环境
      if (typeof wx !== 'undefined') {
        const systemInfo = wx.getSystemInfoSync();
        return systemInfo.platform === 'devtools';
      }
      
      // 默认视为非开发环境
      return false;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * 获取分析报告
   * @returns {Object} 报告对象
   */
  getReport() {
    const totalFindings = Object.values(this.findings)
      .reduce((sum, list) => sum + list.length, 0);
    
    if (totalFindings === 0) {
      logger.info('LogAnalyzer', '没有发现直接使用console的代码');
      return {
        totalFindings: 0,
        details: {}
      };
    }
    
    // 按文件分组
    const fileGroups = {};
    
    for (const method in this.findings) {
      for (const finding of this.findings[method]) {
        const { filePath } = finding;
        
        if (!fileGroups[filePath]) {
          fileGroups[filePath] = [];
        }
        
        fileGroups[filePath].push({
          method,
          lineNumber: finding.lineNumber,
          args: finding.args
        });
      }
    }
    
    // 输出摘要
    logger.warn('LogAnalyzer', `发现共${totalFindings}处直接使用console的代码，涉及${Object.keys(fileGroups).length}个文件`);
    
    for (const filePath in fileGroups) {
      logger.warn('LogAnalyzer', `文件: ${filePath} (${fileGroups[filePath].length}处)`);
      
      // 最多显示3个示例
      const examples = fileGroups[filePath].slice(0, 3);
      
      for (const example of examples) {
        logger.info('LogAnalyzer', `  第${example.lineNumber}行: console.${example.method}(${example.args.join(', ')})`);
      }
      
      if (fileGroups[filePath].length > 3) {
        logger.info('LogAnalyzer', `  ... 还有${fileGroups[filePath].length - 3}处未显示`);
      }
    }
    
    return {
      totalFindings,
      details: fileGroups
    };
  }
  
  /**
   * 重置分析器
   */
  reset() {
    for (const method in this.findings) {
      this.findings[method] = [];
    }
    logger.info('LogAnalyzer', '日志分析器已重置');
  }
}

// 创建单例
const analyzer = new LogAnalyzer();

// 在开发环境自动初始化
if (typeof wx !== 'undefined' && wx.getSystemInfoSync().platform === 'devtools') {
  setTimeout(() => {
    analyzer.init();
  }, 1000); // 延迟初始化，避免干扰启动流程
}

module.exports = analyzer; 