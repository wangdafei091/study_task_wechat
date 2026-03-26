const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  collectCoverage: true,
  coveragePathIgnorePatterns: (baseConfig.coveragePathIgnorePatterns || [])
    .filter((pattern) => pattern !== '/adapters/'),
  collectCoverageFrom: [
    'app.js',
    'adapters/storage-adapter.js',
    'utils/app/**/*.js',
    'pages/index/index.js',
    'pages/index/modules/**/*.js',
    'pages/rewards/rewards.js',
    'packageMessage/pages/message/message.js',
    'services/task-service.js',
    'services/task-service/**/*.js'
  ],
  coverageThreshold: {
    './app.js': {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    },
    './adapters/storage-adapter.js': {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    },
    './utils/app/**/*.js': {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    },
    './pages/index/index.js': {
      branches: 65,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './pages/index/modules/**/*.js': {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    },
    './pages/rewards/rewards.js': {
      branches: 65,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './packageMessage/pages/message/message.js': {
      branches: 65,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './services/task-service.js': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './services/task-service/**/*.js': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
