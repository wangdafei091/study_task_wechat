module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['js'],
  testMatch: ['**/test/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/backend/'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'services/**/*.js',
    'repositories/**/*.js',
    'models/**/*.js',
    'utils/batchUtils.js',
    'utils/dateUtils.js',
    'utils/formatUtils.js',
    'utils/core/**/*.js'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
    '/adapters/'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['./test/setup/jest-setup.js'],
  moduleNameMapper: {
    '^wx$': '<rootDir>/test/__mocks__/wx.js'
  },
  verbose: true
}; 
