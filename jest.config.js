module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['js'],
  testMatch: ['**/test/**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'services/**/*.js',
    'repositories/**/*.js',
    'models/**/*.js',
    'adapters/**/*.js'
  ],
  setupFilesAfterEnv: ['./test/setup/jest-setup.js'],
  moduleNameMapper: {
    '^wx$': '<rootDir>/test/__mocks__/wx.js'
  },
  verbose: true
}; 