/**
 * Jest测试全局设置
 */

// 导入模拟的wx对象并设为全局变量
global.wx = require('../__mocks__/wx');

// 在每个测试前重置存储
beforeEach(() => {
  if (global.wx._resetStorage) {
    global.wx._resetStorage();
  }
  
  // 清除所有模拟函数的调用记录
  jest.clearAllMocks();
});

// 添加自定义匹配器
expect.extend({
  // 匹配器：检查对象是否有指定的属性和值
  toHaveProperty(received, property, value) {
    if (received === undefined || received === null) {
      return {
        pass: false,
        message: () => `Expected ${received} to have property "${property}" but it is ${received}`
      };
    }
    
    const hasProperty = Object.prototype.hasOwnProperty.call(received, property);
    
    if (!hasProperty) {
      return {
        pass: false,
        message: () => `Expected object to have property "${property}" but it does not`
      };
    }
    
    if (arguments.length < 3) {
      return {
        pass: true,
        message: () => `Expected object not to have property "${property}" but it does`
      };
    }
    
    const propertyValue = received[property];
    const pass = this.equals(propertyValue, value);
    
    return {
      pass,
      message: () => pass
        ? `Expected property "${property}" not to be ${this.utils.printExpected(value)}`
        : `Expected property "${property}" to be ${this.utils.printExpected(value)} but got ${this.utils.printReceived(propertyValue)}`
    };
  }
}); 