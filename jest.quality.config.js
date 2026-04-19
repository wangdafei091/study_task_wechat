const baseConfig = require('./jest.config');
const qualityTarget = {
  branches: 70,
  functions: 75,
  lines: 75,
  statements: 75
};

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
    'services/task-service/**/*.js',
    'repositories/task-repository.js',
    'services/message-service/message-provisional.js',
    'services/message-service/message-domain.js',
    'services/message-service/message-handlers.js',
    'services/reward-service/reward-query.js',
    'services/reward-service/reward-queue.js'
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
    },
    './repositories/task-repository.js': qualityTarget,
    './services/message-service/message-provisional.js': qualityTarget,
    './services/message-service/message-domain.js': qualityTarget,
    './services/message-service/message-handlers.js': qualityTarget,
    './services/reward-service/reward-query.js': qualityTarget,
    './services/reward-service/reward-queue.js': qualityTarget
  }
};
