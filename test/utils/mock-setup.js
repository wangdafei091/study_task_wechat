/**
 * mock-setup.js - Mock 配置辅助工具
 *
 * 提供统一的 Mock 配置和重置方法
 */

const MockEventBus = require('./mock-event-bus');

class MockSetup {
  /**
   * 创建标准的服务 Mock 配置
   * @param {Object} options 配置选项
   * @returns {Object} Mock 配置
   */
  static createServiceMock(options = {}) {
    return {
      eventBus: new MockEventBus(),
      repositories: options.repositories || {},
      services: options.services || {},
      adapters: options.adapters || {},
      resetBeforeEach: options.resetBeforeEach !== false
    };
  }

  /**
   * 应用 Mock 配置到服务实例
   * @param {Object} service 服务实例
   * @param {Object} mockConfig Mock 配置
   */
  static applyMock(service, mockConfig) {
    // 注入 EventBus
    if (mockConfig.eventBus) {
      service.eventBus = mockConfig.eventBus;
    }

    // 注入 Repository Mock
    if (mockConfig.repositories) {
      Object.entries(mockConfig.repositories).forEach(([key, mock]) => {
        if (service[key + 'Repository']) {
          service[key + 'Repository'] = mock;
        }
      });
    }

    // 注入 Service Mock
    if (mockConfig.services) {
      Object.entries(mockConfig.services).forEach(([key, mock]) => {
        if (service[key + 'Service']) {
          service[key + 'Service'] = mock;
        }
      });
    }
  }

  /**
   * 重置所有 Mock
   * @param {Object} mockConfig Mock 配置
   */
  static resetAllMocks(mockConfig) {
    if (mockConfig.eventBus) {
      mockConfig.eventBus.reset();
    }

    if (mockConfig.repositories) {
      Object.values(mockConfig.repositories).forEach(mock => {
        if (mock.mockClear) {
          mock.mockClear();
        }
      });
    }

    if (mockConfig.services) {
      Object.values(mockConfig.services).forEach(mock => {
        if (mock.mockClear) {
          mock.mockClear();
        }
      });
    }
  }
}

module.exports = MockSetup;
