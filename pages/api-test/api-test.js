/**
 * API测试页面
 * 用于验证前后端API连通性
 */

const HttpClient = require('../../utils/http-client');
const API_CONFIG = require('../../utils/api-config');

Page({
  data: {
    testResults: [],
    testing: false
  },

  onLoad() {
    this.setData({
      testResults: [
        { name: '准备开始测试...', status: 'info', detail: '点击下方按钮开始测试各个API' }
      ]
    });
  },

  /**
   * 添加测试结果
   */
  addResult(name, status, detail, data = null) {
    const result = {
      name,
      status, // success, error, info
      detail,
      data: data ? JSON.stringify(data, null, 2) : null,
      time: new Date().toLocaleTimeString()
    };
    
    const results = this.data.testResults;
    results.push(result);
    this.setData({ testResults: results });
  },

  /**
   * 清空测试结果
   */
  clearResults() {
    this.setData({ testResults: [] });
  },

  /**
   * 测试获取parent用户
   */
  async testGetParentUser() {
    this.setData({ testing: true });
    
    try {
      const user = await HttpClient.getUser(API_CONFIG.PREDEFINED_USERS.PARENT);
      this.addResult(
        '获取家长用户', 
        'success', 
        `成功获取用户信息`, 
        user
      );
    } catch (error) {
      this.addResult(
        '获取家长用户', 
        'error', 
        `失败: ${error.message}`
      );
    } finally {
      this.setData({ testing: false });
    }
  },

  /**
   * 测试获取child用户
   */
  async testGetChildUser() {
    this.setData({ testing: true });
    
    try {
      const user = await HttpClient.getUser(API_CONFIG.PREDEFINED_USERS.CHILD);
      this.addResult(
        '获取小朋友用户', 
        'success', 
        `成功获取用户信息`, 
        user
      );
    } catch (error) {
      this.addResult(
        '获取小朋友用户', 
        'error', 
        `失败: ${error.message}`
      );
    } finally {
      this.setData({ testing: false });
    }
  },

  /**
   * 测试获取所有用户
   */
  async testGetAllUsers() {
    this.setData({ testing: true });
    
    try {
      const users = await HttpClient.getAllUsers();
      this.addResult(
        '获取所有用户', 
        'success', 
        `成功获取${users.length}个用户`, 
        users
      );
    } catch (error) {
      this.addResult(
        '获取所有用户', 
        'error', 
        `失败: ${error.message}`
      );
    } finally {
      this.setData({ testing: false });
    }
  },

  /**
   * 测试用户切换
   */
  async testUserSwitch() {
    this.setData({ testing: true });
    
    try {
      const user = await HttpClient.switchToUser(API_CONFIG.PREDEFINED_USERS.CHILD);
      this.addResult(
        '用户切换测试', 
        'success', 
        `成功切换到小朋友用户`, 
        user
      );
    } catch (error) {
      this.addResult(
        '用户切换测试', 
        'error', 
        `失败: ${error.message}`
      );
    } finally {
      this.setData({ testing: false });
    }
  },

  /**
   * 测试健康检查
   */
  async testHealthCheck() {
    this.setData({ testing: true });
    
    try {
      const health = await HttpClient.healthCheck();
      this.addResult(
        '健康检查', 
        'success', 
        `后端服务运行正常`, 
        health
      );
    } catch (error) {
      this.addResult(
        '健康检查', 
        'error', 
        `失败: ${error.message}`
      );
    } finally {
      this.setData({ testing: false });
    }
  },

  /**
   * 一键测试所有API
   */
  async testAllAPIs() {
    this.clearResults();
    this.addResult('开始测试', 'info', '正在执行所有API测试...');
    
    // 依次执行所有测试
    await this.testHealthCheck();
    await this.testGetParentUser();
    await this.testGetChildUser();
    await this.testGetAllUsers();
    await this.testUserSwitch();
    
    this.addResult('测试完成', 'info', '所有API测试已完成，请查看上方结果');
  },

  /**
   * 复制结果到剪贴板
   */
  copyResults() {
    const results = this.data.testResults.map(r => 
      `[${r.time}] ${r.name}: ${r.detail}`
    ).join('\n');
    
    wx.setClipboardData({
      data: results,
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
      }
    });
  }
}); 