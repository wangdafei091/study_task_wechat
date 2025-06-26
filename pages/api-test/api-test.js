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
   * 测试用户字段映射
   */
  async testUserFieldMapping() {
    this.setData({ testing: true });
    
    try {
      // 1. 获取用户数据
      const userData = await HttpClient.getUser(API_CONFIG.PREDEFINED_USERS.PARENT);
      this.addResult(
        '后端用户数据', 
        'info', 
        `获取到原始用户数据`, 
        userData
      );
      
      // 2. 创建前端User对象
      const { User } = require('../../models/user');
      const user = new User(userData);
      
      this.addResult(
        '前端User对象', 
        'info', 
        `创建User对象成功`, 
        user.toObject()
      );
      
      // 3. 验证字段映射
      const fieldTests = [
        {
          name: 'userId字段',
          test: () => user.userId === userData.userId,
          detail: `前端: ${user.userId}, 后端: ${userData.userId}`
        },
        {
          name: '兼容性id getter',
          test: () => user.id === user.userId,
          detail: `user.id: ${user.id}, user.userId: ${user.userId}`
        },
        {
          name: '角色字段',
          test: () => user.role === userData.role,
          detail: `前端: ${user.role}, 后端: ${userData.role}`
        },
        {
          name: '姓名字段',
          test: () => user.name === userData.name,
          detail: `前端: ${user.name}, 后端: ${userData.name}`
        }
      ];
      
      fieldTests.forEach(test => {
        const passed = test.test();
        this.addResult(
          test.name,
          passed ? 'success' : 'error',
          `${passed ? '✓' : '✗'} ${test.detail}`
        );
      });
      
    } catch (error) {
      this.addResult(
        '用户字段映射测试', 
        'error', 
        `失败: ${error.message}`
      );
    } finally {
      this.setData({ testing: false });
    }
  },

  /**
   * 测试用户服务缓存
   */
  async testUserServiceCache() {
    this.setData({ testing: true });
    
    try {
      // 获取全局用户服务
      const app = getApp();
      const userService = app.globalData.userService;
      
      if (!userService) {
        this.addResult(
          '用户服务缓存测试', 
          'error', 
          '用户服务不可用'
        );
        return;
      }
      
      // 刷新用户缓存
      await userService.refreshUserCache();
      
      // 获取所有用户
      const allUsers = userService.getAllUsers();
      
      this.addResult(
        '用户服务缓存', 
        'success', 
        `缓存中有${allUsers.length}个用户`,
        allUsers.map(u => ({
          userId: u.userId,
          id: u.id,
          name: u.name,
          role: u.role
        }))
      );
      
      // 测试根据ID获取用户
      const parentUser = userService.getUserById('parent');
      const childUser = userService.getUserById('child');
      
      this.addResult(
        '用户ID查询测试',
        parentUser && childUser ? 'success' : 'error',
        `parent用户: ${parentUser ? '找到' : '未找到'}, child用户: ${childUser ? '找到' : '未找到'}`
      );
      
    } catch (error) {
      this.addResult(
        '用户服务缓存测试', 
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
    await this.testUserFieldMapping();
    await this.testUserServiceCache();
    
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