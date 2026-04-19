module.exports = [
  {
    files: [
      'repositories/task-repository.js',
      'services/message-service/message-provisional.js',
      'services/message-service/message-domain.js',
      'services/message-service/message-handlers.js',
      'services/reward-service/reward-query.js',
      'services/reward-service/reward-queue.js',
      'test/repositories/task-repository.test.js',
      'test/services/message-service.modules.test.js',
      'test/services/message-service.test.js',
      'test/services/reward-service.test.js'
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }]
    }
  },
  {
    files: [
      'test/repositories/task-repository.test.js',
      'test/services/message-service.modules.test.js',
      'test/services/message-service.test.js',
      'test/services/reward-service.test.js'
    ],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly'
      }
    }
  }
];
