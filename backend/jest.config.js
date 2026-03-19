/**
 * Jest配置文件
 * 配置测试环境和数据库连接
 */

module.exports = {
  // 测试环境配置
  testEnvironment: 'node',

  // 测试文件匹配模式
  testMatch: [
    '**/test/**/*.test.js'
  ],

  // 覆盖率配置
  collectCoverageFrom: [
    'controllers/**/*.js',
    'services/**/*.js',
    'models/**/*.js',
    '!**/node_modules/**',
    '!**/test/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],

  // 设置测试超时时间
  testTimeout: 10000,

  // 全局设置
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],

  // 模块路径别名（如果需要）
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  }
};
