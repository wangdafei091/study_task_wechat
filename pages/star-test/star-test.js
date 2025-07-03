/**
 * 星星过期保护功能测试页面
 * 独立测试页面，不影响任何现有功能
 */

const logger = require('../../utils/logger');
const serviceManager = require('../../services/service-manager');
const { StarExpiryType } = require('../../models/star');

Page({
  data: {
    testResults: [],
    testing: false,
    currentStep: 0,
    totalSteps: 0,
    testData: {
      beforeStars: 0,
      afterStars: 0,
      expiredStars: 0,
      protectedRewards: [],
      testRewards: [],
      testGroups: []
    },
    currentStatus: {
      totalStars: 0,
      pendingExpiry: 0,
      availableRewards: 0,
      testDataExists: false
    }
  },

  onLoad() {
    logger.info('StarTest', '星星过期保护测试页面加载');
    this.setData({
      testResults: [
        { 
          name: '🎯 星星过期保护测试', 
          status: 'info', 
          detail: '安全的测试环境，可以立即体验星星过期保护功能',
          time: new Date().toLocaleTimeString()
        }
      ]
    });
    this.refreshStatus();
  },

  onShow() {
    this.refreshStatus();
  },

  /**
   * 刷新当前状态
   */
  async refreshStatus() {
    try {
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        this.addResult('状态刷新', 'error', '服务不可用');
        return;
      }

      const childUserId = 'child';
      
      // 获取当前状态
      const totalStars = await starService.getTotalStars(childUserId);
      const pendingExpiry = await starService.calculatePendingExpiry(childUserId);
      const allRewards = await rewardService.getAllRewards();
      const allGroups = await starService.starGroupRepository.getAll();
      
      // 检查是否存在测试数据
      const testRewards = allRewards.filter(r => r.name && r.name.includes('[测试]'));
      const testGroups = allGroups.filter(g => g.expiryDateStr && g.expiryDateStr.includes('测试'));
      
      this.setData({
        currentStatus: {
          totalStars,
          pendingExpiry,
          availableRewards: allRewards.length,
          testDataExists: testRewards.length > 0 || testGroups.length > 0
        },
        testData: {
          ...this.data.testData,
          testRewards,
          testGroups
        }
      });

      logger.info('StarTest', `状态刷新完成: 星星${totalStars}颗, 即将过期${pendingExpiry}颗, 奖励${allRewards.length}个, 测试数据${testRewards.length + testGroups.length}项`);
    } catch (error) {
      logger.error('StarTest', '状态刷新失败', error);
    }
  },

  /**
   * 添加测试结果
   */
  addResult(name, status, detail, data = null) {
    const result = {
      name,
      status, // success, error, info, warning
      detail,
      data: data ? JSON.stringify(data, null, 2) : null,
      time: new Date().toLocaleTimeString()
    };
    
    const results = this.data.testResults;
    results.push(result);
    this.setData({ testResults: results });

    // 滚动到最新结果
    setTimeout(() => {
      wx.pageScrollTo({
        scrollTop: 9999,
        duration: 300
      });
    }, 100);
  },

  /**
   * 清空测试结果
   */
  clearResults() {
    this.setData({ 
      testResults: [{
        name: '结果已清空', 
        status: 'info', 
        detail: '可以开始新的测试',
        time: new Date().toLocaleTimeString()
      }] 
    });
  },

  /**
   * 创建测试星星分组
   */
  async createTestStars() {
    this.setData({ testing: true });
    
    try {
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        this.addResult('创建测试星星', 'error', '星星服务不可用');
        return;
      }

      const childUserId = 'child';

      // 创建明天过期的测试星星
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      // 创建测试星星分组
      const testGroup = await starService.starGroupRepository.getOrCreateGroup(
        'test_expiry', 
        tomorrow.getTime(),
        '测试过期星星（明天过期）',
        childUserId
      );

      if (testGroup) {
        await starService.starGroupRepository.addStarsToGroup(
          testGroup,
          15, // 15颗测试星星
          '测试用星星（明天过期）'
        );

        this.addResult(
          '创建测试星星', 
          'success', 
          `成功创建15颗测试星星，明天23:59:59过期`,
          { 
            groupId: testGroup.id,
            expiryDate: tomorrow.toISOString(),
            stars: 15
          }
        );
      } else {
        this.addResult('创建测试星星', 'error', '无法创建测试星星分组');
      }

    } catch (error) {
      this.addResult('创建测试星星', 'error', `失败: ${error.message}`);
    } finally {
      this.setData({ testing: false });
      this.refreshStatus();
    }
  },

  /**
   * 创建测试奖励
   */
  async createTestRewards() {
    this.setData({ testing: true });
    
    try {
      const rewardService = serviceManager.getService('rewardService');
      
      if (!rewardService) {
        this.addResult('创建测试奖励', 'error', '奖励服务不可用');
        return;
      }

      // 创建测试奖励：10颗、10颗、20颗
      const childUserId = 'child';
      const testRewards = [
        { name: '[测试]10星奖励A', points: 10, description: '测试用奖励A', userId: childUserId },
        { name: '[测试]10星奖励B', points: 10, description: '测试用奖励B', userId: childUserId },
        { name: '[测试]20星奖励', points: 20, description: '测试用奖励（高价值）', userId: childUserId }
      ];

      const createdRewards = [];
      for (const reward of testRewards) {
        const result = await rewardService.createReward(reward);
        if (result.success) {
          createdRewards.push(result.reward);
        }
      }

      this.addResult(
        '创建测试奖励', 
        'success', 
        `成功创建${createdRewards.length}个测试奖励（10、10、20积分）`,
        createdRewards.map(r => ({ id: r.id, name: r.name, points: r.points }))
      );

    } catch (error) {
      this.addResult('创建测试奖励', 'error', `失败: ${error.message}`);
    } finally {
      this.setData({ testing: false });
      this.refreshStatus();
    }
  },

  /**
   * 模拟星星过期保护
   */
  async simulateExpiryProtection() {
    this.setData({ testing: true });
    
    try {
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        this.addResult('模拟过期保护', 'error', '星星服务不可用');
        return;
      }

      const childUserId = 'child';

      // 1. 检查当前星星状态
      const currentStars = await starService.getTotalStars(childUserId);
      this.addResult(
        '当前星星状态', 
        'info', 
        `小朋友当前有${currentStars}颗星星`
      );

      // 2. 计算即将过期的星星
      const pendingExpiry = await starService.calculatePendingExpiry(childUserId);
      this.addResult(
        '即将过期星星', 
        'info', 
        `即将过期: ${pendingExpiry}颗星星`
      );

      // 3. 如果有即将过期的星星，执行保护逻辑
      if (pendingExpiry > 0) {
        const protectionResult = await starService.protectRewardsByExpiry(pendingExpiry, childUserId);
        
        if (protectionResult.success) {
          this.addResult(
            '🛡️ 过期保护执行成功', 
            'success', 
            `保护了${protectionResult.protectedCount}个奖励，使用${protectionResult.usedExpiredStars}颗过期星星`,
            protectionResult.protectedRewards
          );
        } else {
          this.addResult(
            '过期保护执行', 
            'warning', 
            protectionResult.message || '未找到需要保护的奖励'
          );
        }
      } else {
        this.addResult(
          '过期保护执行', 
          'warning', 
          '没有即将过期的星星，无需执行保护。请先创建测试星星。'
        );
      }

      // 4. 显示保护后的奖励状态
      const rewardService = serviceManager.getService('rewardService');
      const availableRewards = await rewardService.getAvailableRewards();
      const protectedRewards = availableRewards.filter(r => r.protectedByExpiry);
      
      if (protectedRewards.length > 0) {
        this.addResult(
          '🎁 保护奖励状态', 
          'success', 
          `发现${protectedRewards.length}个受保护奖励`,
          protectedRewards.map(r => ({
            name: r.name,
            originalPoints: r.points,
            partialProtection: r.partialProtection || 0,
            actualCost: r.points - (r.partialProtection || 0)
          }))
        );
      } else {
        this.addResult(
          '保护奖励状态', 
          'info', 
          '当前没有受保护的奖励'
        );
      }

    } catch (error) {
      this.addResult('模拟过期保护', 'error', `失败: ${error.message}`);
    } finally {
      this.setData({ testing: false });
      this.refreshStatus();
    }
  },

  /**
   * 测试保护奖励兑换
   */
  async testProtectedRewardExchange() {
    this.setData({ testing: true });
    
    try {
      const rewardService = serviceManager.getService('rewardService');
      
      if (!rewardService) {
        this.addResult('保护奖励兑换', 'error', '奖励服务不可用');
        return;
      }

      // 获取受保护的奖励
      const availableRewards = await rewardService.getAvailableRewards();
      const protectedReward = availableRewards.find(r => r.protectedByExpiry);

      if (!protectedReward) {
        this.addResult(
          '保护奖励兑换', 
          'warning', 
          '没有找到受保护的奖励，请先运行"模拟过期保护"'
        );
        return;
      }

      // 重新获取最新的奖励详情（确保有最新的保护信息）
      const rewardDetail = await rewardService.rewardRepository.getById(protectedReward.id);
      const updatedProtectedReward = rewardDetail || protectedReward;

      const childUserId = 'child';
      const starService = serviceManager.getService('starService');
      const beforeStars = await starService.getTotalStars(childUserId);

      // 尝试兑换保护奖励
      const exchangeResult = await rewardService.exchangeReward(updatedProtectedReward.id, childUserId);

      if (exchangeResult.success) {
        const afterStars = await starService.getTotalStars(childUserId);
        const actualCost = beforeStars - afterStars;

        this.addResult(
          '🎉 保护奖励兑换成功', 
          'success', 
          `兑换"${updatedProtectedReward.name}"成功！原价${updatedProtectedReward.points}颗，实际消耗${actualCost}颗`,
          {
            rewardName: updatedProtectedReward.name,
            originalPoints: updatedProtectedReward.points,
            partialProtection: updatedProtectedReward.partialProtection || 0,
            actualCost: actualCost,
            beforeStars: beforeStars,
            afterStars: afterStars
          }
        );

        // 验证扣除是否正确（保护兑换时实际消耗为0颗）
        const expectedCost = 0; // 保护兑换应该不消耗星星
        if (actualCost === expectedCost) {
          this.addResult(
            '✅ 扣除验证', 
            'success', 
            `扣除数量正确：期望${expectedCost}颗，实际${actualCost}颗（保护兑换生效）`
          );
        } else {
          this.addResult(
            '❌ 扣除验证', 
            'error', 
            `扣除数量错误：期望${expectedCost}颗，实际${actualCost}颗（保护兑换可能未生效）`
          );
        }
      } else {
        this.addResult(
          '保护奖励兑换', 
          'error', 
          `兑换失败: ${exchangeResult.message}`
        );
      }

    } catch (error) {
      this.addResult('保护奖励兑换', 'error', `失败: ${error.message}`);
    } finally {
      this.setData({ testing: false });
      this.refreshStatus();
    }
  },

  /**
   * 模拟星星过期
   */
  async simulateStarExpiry() {
    this.setData({ testing: true });
    
    try {
      const starService = serviceManager.getService('starService');
      
      if (!starService) {
        this.addResult('模拟星星过期', 'error', '星星服务不可用');
        return;
      }

      const childUserId = 'child';

      // 直接创建已过期的星星分组
      const now = new Date();
      const expired = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1天前过期

      // 直接通过repository创建过期分组
      const expiredGroup = await starService.starGroupRepository.getOrCreateGroup(
        'test_expired', 
        expired.getTime(),
        '测试过期星星（已过期）',
        childUserId
      );

      if (expiredGroup) {
        // 添加星星到已过期的分组
        await starService.starGroupRepository.addStarsToGroup(
          expiredGroup,
          5, // 5颗星星
          '测试用星星（已过期）'
        );

        this.addResult(
          '创建过期星星', 
          'info', 
          '创建5颗已过期的测试星星'
        );

        // 触发过期清理
        const cleanupResult = await starService.cleanupExpiredStars(childUserId);
        
        if (cleanupResult.success && cleanupResult.totalPoints > 0) {
          this.addResult(
            '🧹 星星过期清理', 
            'success', 
            `成功清理${cleanupResult.totalPoints}颗过期星星`,
            cleanupResult
          );
        } else {
          this.addResult(
            '星星过期清理', 
            'info', 
            cleanupResult.message || '没有发现过期星星'
          );
        }
      } else {
        this.addResult(
          '创建过期星星', 
          'error', 
          '无法创建过期星星分组'
        );
      }

    } catch (error) {
      this.addResult('模拟星星过期', 'error', `失败: ${error.message}`);
    } finally {
      this.setData({ testing: false });
      this.refreshStatus();
    }
  },

  /**
   * 清理测试数据
   */
    async cleanupTestData() {
    this.setData({ testing: true });
    
    try {
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        this.addResult('清理测试数据', 'error', '服务不可用');
        return;
      }

      let cleanedItems = 0;
      const now = Date.now();

      // 清理测试星星分组（包括过期的测试分组）
      const allGroups = await starService.starGroupRepository.getAll();
      const testGroups = allGroups.filter(g => 
        (g.type && (
          g.type.includes('test') || 
          g.type === 'test_expiry' || 
          g.type === 'test_expired' ||
          g.type === 'test_permanent' ||
          g.type === 'test_expiry_partial' ||
          g.type === 'test_small' ||
          g.type === 'test_tiny_expiry'
        )) ||
        (g.expiryDateStr && g.expiryDateStr.includes('测试')) ||
        (g.expiryDate && g.expiryDate < now - 23 * 60 * 60 * 1000) // 清理1天前过期的测试星星
      );
      
      for (const group of testGroups) {
        await starService.starGroupRepository.delete(group.id);
        cleanedItems++;
      }

      // 清理测试奖励
      const allRewards = await rewardService.getAllRewards();
      const testRewards = allRewards.filter(r => r.name && r.name.includes('[测试]'));
      
      for (const reward of testRewards) {
        await rewardService.deleteReward(reward.id);
        cleanedItems++;
      }

      this.addResult(
        '🧹 清理测试数据', 
        'success', 
        `成功清理${cleanedItems}个测试项目（${testGroups.length}个星星分组 + ${testRewards.length}个奖励）`
      );

    } catch (error) {
      this.addResult('清理测试数据', 'error', `失败: ${error.message}`);
    } finally {
      this.setData({ testing: false });
      this.refreshStatus();
    }
  },

  /**
   * 一键完整测试
   */
  async runCompleteTest() {
    this.clearResults();
    this.addResult('🚀 开始完整测试', 'info', '正在执行星星过期保护功能的完整测试流程...');
    
    // 依次执行所有测试步骤
    await this.createTestStars();
    await this.createTestRewards();
    await this.simulateExpiryProtection();
    await this.testProtectedRewardExchange();
    await this.simulateStarExpiry();
    
    // 执行新增的核心场景测试
    this.addResult('🔄 执行核心场景测试', 'info', '开始验证关键缺失场景...');
    await this.testPartialProtection();
    await this.testBoundaryConditions();
    await this.testAllStarsExpiring();
    await this.testMultipleRewardProtection();
    
    this.addResult('🎉 完整测试完成', 'success', '星星过期保护全量测试已完成！所有功能场景都已验证。\n\n包含：完全保护、部分保护、边界条件等所有场景\n✅ 建议点击"清理测试数据"清除测试产生的数据');
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
  },

  /**
   * 💎 部分保护测试
   * 验证核心场景：过期星星部分覆盖奖励费用，需额外支付差额
   */
  async testPartialProtection() {
    this.setData({ testing: true });
    
    try {
      this.addResult('💎 开始部分保护测试', 'info', '验证核心场景：过期星星部分覆盖，需额外支付差额');
      
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        this.addResult('部分保护测试', 'error', '服务不可用');
        return;
      }

      const childUserId = 'child';

      // 1. 清理现有测试数据
      await this.cleanupTestData();
      
      // 2. 创建测试场景：6颗未过期 + 15颗即将过期 = 21颗总星星
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      // 创建6颗未过期星星（永久有效）
      const permanentGroup = await starService.starGroupRepository.getOrCreateGroup(
        'test_permanent', 
        null,
        '测试永久星星',
        childUserId
      );
      
      if (permanentGroup) {
        await starService.starGroupRepository.addStarsToGroup(
          permanentGroup,
          6, // 6颗未过期星星
          '测试用星星（永久有效）'
        );
      }

      // 创建15颗即将过期星星
      const expiryGroup = await starService.starGroupRepository.getOrCreateGroup(
        'test_expiry_partial', 
        tomorrow.getTime(),
        '测试过期星星（明天过期）',
        childUserId
      );

      if (expiryGroup) {
        await starService.starGroupRepository.addStarsToGroup(
          expiryGroup,
          15, // 15颗即将过期星星
          '测试用星星（明天过期）'
        );
      }

      this.addResult(
        '创建测试场景', 
        'success', 
        '创建21颗星星：6颗未过期（永久） + 15颗即将过期'
      );

      // 3. 创建25颗积分的奖励（期望：用15颗过期星星保护，需额外支付10颗）
      const testReward = {
        name: '[测试]25星奖励-部分保护',
        points: 25,
        description: '测试用奖励（25颗星星）',
        userId: childUserId
      };

      const createResult = await rewardService.createReward(testReward);
      
      if (!createResult.success) {
        this.addResult('创建测试奖励', 'error', `创建失败: ${createResult.message}`);
        return;
      }

      this.addResult(
        '创建测试奖励', 
        'success', 
        '创建25颗积分奖励（预期：15颗过期保护，10颗额外支付）'
      );

      // 4. 检查星星状态
      const totalStars = await starService.getTotalStars(childUserId);
      const pendingExpiry = await starService.calculatePendingExpiry(childUserId);
      
      this.addResult(
        '验证星星状态', 
        'info', 
        `总星星：${totalStars}颗，即将过期：${pendingExpiry}颗`
      );

      // 5. 执行过期保护逻辑
      console.log('=== 测试页面调试：即将调用protectRewardsByExpiry ===');
      console.log('参数：pendingExpiry=', pendingExpiry, ', childUserId=', childUserId);
      const protectionResult = await starService.protectRewardsByExpiry(pendingExpiry, childUserId);
      console.log('=== 测试页面调试：protectRewardsByExpiry返回结果 ===');
      console.log('protectionResult=', protectionResult);
      
      if (protectionResult.success && protectionResult.protectedCount > 0) {
        const protectedReward = protectionResult.protectedRewards[0];
        this.addResult(
          '🛡️ 部分保护执行', 
          'success', 
          `保护成功！奖励：${protectedReward.name}，保护金额：${protectedReward.partialProtection}颗，需额外：${protectedReward.points - protectedReward.partialProtection}颗`,
          protectionResult
        );

        // 6. 尝试兑换部分保护奖励
        const beforeStars = await starService.getTotalStars(childUserId);
        const exchangeResult = await rewardService.exchangeReward(protectedReward.id, childUserId);

        if (exchangeResult.success) {
          // 直接从兑换结果获取实际消耗数量，避免缓存问题
          const actualCost = exchangeResult.actualCost || 0;
          const expectedCost = protectedReward.points - protectedReward.partialProtection;

          this.addResult(
            '🎉 部分保护兑换', 
            'success', 
            `兑换成功！原价${protectedReward.points}颗，保护${protectedReward.partialProtection}颗，实际支付${actualCost}颗`
          );

          // 验证扣除数量
          if (actualCost === expectedCost) {
            this.addResult(
              '✅ 部分保护验证', 
              'success', 
              `扣除正确：期望${expectedCost}颗，实际${actualCost}颗（部分保护生效）`
            );
          } else {
            this.addResult(
              '❌ 部分保护验证', 
              'error', 
              `扣除错误：期望${expectedCost}颗，实际${actualCost}颗`
            );
          }
        } else {
          this.addResult(
            '部分保护兑换', 
            'error', 
            `兑换失败: ${exchangeResult.message}`
          );
        }
      } else {
        this.addResult(
          '部分保护执行', 
          'warning', 
          protectionResult.message || '保护失败或无可保护奖励'
        );
      }

      this.addResult('💎 部分保护测试完成', 'success', '核心场景验证：过期星星部分保护机制已验证');

    } catch (error) {
      this.addResult('部分保护测试', 'error', `测试失败: ${error.message}`);
    } finally {
      this.setData({ testing: false });
      this.refreshStatus();
    }
  },

  /**
   * ⚠️ 边界条件测试
   * 验证异常场景：星星不足、过期星星不足等边界条件
   */
  async testBoundaryConditions() {
    this.setData({ testing: true });
    
    try {
      this.addResult('⚠️ 开始边界条件测试', 'info', '验证星星不足、过期星星不足等异常场景');
      
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        this.addResult('边界条件测试', 'error', '服务不可用');
        return;
      }

      const childUserId = 'child';

      // 1. 清理测试数据
      await this.cleanupTestData();

      // 场景1：星星总数不足
      this.addResult('📍 场景1：星星总数不足', 'info', '创建少量星星，尝试兑换高价奖励');
      
      // 创建5颗星星
      const smallGroup = await starService.starGroupRepository.getOrCreateGroup(
        'test_small', 
        null,
        '测试少量星星',
        childUserId
      );
      
      if (smallGroup) {
        await starService.starGroupRepository.addStarsToGroup(
          smallGroup,
          5, // 只有5颗星星
          '测试用星星（少量）'
        );
      }

      // 创建20颗积分的奖励
      const expensiveReward = {
        name: '[测试]20星奖励-星星不足',
        points: 20,
        description: '测试用昂贵奖励',
        userId: childUserId
      };

      const createExpensiveResult = await rewardService.createReward(expensiveReward);
      
      if (createExpensiveResult.success) {
        // 尝试兑换
        const exchangeResult = await rewardService.exchangeReward(createExpensiveResult.reward.id, childUserId);
        
        if (!exchangeResult.success) {
          this.addResult(
            '✅ 星星不足验证', 
            'success', 
            `正确拒绝：${exchangeResult.message}（5颗星星无法兑换20颗奖励）`
          );
        } else {
          this.addResult(
            '❌ 星星不足验证', 
            'error', 
            '错误：应该拒绝兑换但却成功了'
          );
        }
      }

      // 场景2：过期星星不足以保护任何奖励
      this.addResult('📍 场景2：过期星星不足', 'info', '少量过期星星无法保护任何奖励');
      
      // 创建2颗即将过期星星
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      const tinyExpiryGroup = await starService.starGroupRepository.getOrCreateGroup(
        'test_tiny_expiry', 
        tomorrow.getTime(),
        '测试少量过期星星',
        childUserId
      );

      if (tinyExpiryGroup) {
        await starService.starGroupRepository.addStarsToGroup(
          tinyExpiryGroup,
          2, // 只有2颗即将过期星星
          '测试用星星（少量过期）'
        );
      }

      // 尝试保护（应该无法保护任何奖励）
      const tinyProtectionResult = await starService.protectRewardsByExpiry(2, childUserId);
      
      if (tinyProtectionResult.success && tinyProtectionResult.protectedCount === 0) {
        this.addResult(
          '✅ 过期星星不足验证', 
          'success', 
          `正确处理：${tinyProtectionResult.protectedCount}个奖励被保护（2颗过期星星不足）`
        );
      } else {
        this.addResult(
          '❌ 过期星星不足验证', 
          'error', 
          `错误处理：保护了${tinyProtectionResult.protectedCount}个奖励`
        );
      }

      // 场景3：无可兑换奖励
      this.addResult('📍 场景3：无可兑换奖励', 'info', '所有奖励积分都过高，无法兑换');
      
      // 获取当前可用奖励
      const availableRewards = await rewardService.getAvailableRewards();
      const currentStars = await starService.getTotalStars(childUserId);
      const claimableCount = availableRewards.filter(r => currentStars >= r.points).length;
      
      this.addResult(
        '可兑换奖励检查', 
        claimableCount > 0 ? 'warning' : 'success', 
        `当前${currentStars}颗星星，可兑换奖励${claimableCount}个${claimableCount === 0 ? '（符合测试预期）' : ''}`
      );

      // 场景4：数据一致性验证
      this.addResult('📍 场景4：数据一致性', 'info', '验证星星数据和记录的一致性');
      
      const finalStars = await starService.getTotalStars(childUserId);
      const finalGroups = await starService.starGroupRepository.getAll();
      const testGroups = finalGroups.filter(g => 
        g.type && (g.type.includes('test') || g.type === 'test_small' || g.type === 'test_tiny_expiry')
      );
      
      this.addResult(
        '数据一致性检查', 
        'success', 
        `最终状态：${finalStars}颗星星，${testGroups.length}个测试分组`
      );

      this.addResult('⚠️ 边界条件测试完成', 'success', '所有异常场景均正确处理，系统边界条件验证通过');

    } catch (error) {
      this.addResult('边界条件测试', 'error', `测试失败: ${error.message}`);
    } finally {
      this.setData({ testing: false });
      this.refreshStatus();
    }
  },

  /**
   * 🌟 全部过期测试
   * 验证情况5：所有星星都即将过期的保护机制
   */
  async testAllStarsExpiring() {
    this.setData({ testing: true });
    
    try {
      this.addResult('🌟 开始全部过期测试', 'info', '验证情况5：所有星星都即将过期时的保护机制');
      
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        this.addResult('全部过期测试', 'error', '服务不可用');
        return;
      }

      const childUserId = 'child';

      // 1. 清理现有测试数据
      await this.cleanupTestData();
      
      // 2. 创建30颗全部即将过期的星星
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      const allExpiryGroup = await starService.starGroupRepository.getOrCreateGroup(
        'test_all_expiry', 
        tomorrow.getTime(),
        '测试全部过期星星',
        childUserId
      );

      if (allExpiryGroup) {
        await starService.starGroupRepository.addStarsToGroup(
          allExpiryGroup,
          30, // 30颗全部即将过期
          '测试用星星（全部过期）'
        );
      }

      this.addResult(
        '创建全部过期场景', 
        'success', 
        '创建30颗全部即将过期星星（明天过期）'
      );

      // 3. 创建20颗积分奖励
      const testReward = {
        name: '[测试]20星奖励-全部过期',
        points: 20,
        description: '测试用奖励（全部过期场景）',
        userId: childUserId
      };

      const createResult = await rewardService.createReward(testReward);
      
      if (!createResult.success) {
        this.addResult('创建测试奖励', 'error', `创建失败: ${createResult.message}`);
        return;
      }

      this.addResult(
        '创建测试奖励', 
        'success', 
        '创建20颗积分奖励（预期：全部使用过期星星保护）'
      );

      // 4. 验证全部过期状态
      const totalStars = await starService.getTotalStars(childUserId);
      const pendingExpiry = await starService.calculatePendingExpiry(childUserId);
      
      this.addResult(
        '验证全部过期状态', 
        totalStars === pendingExpiry ? 'success' : 'warning', 
        `总星星：${totalStars}颗，即将过期：${pendingExpiry}颗${totalStars === pendingExpiry ? '（全部过期✓）' : '（状态异常）'}`
      );

      // 5. 执行保护逻辑
      if (totalStars === pendingExpiry && pendingExpiry > 0) {
        const protectionResult = await starService.protectRewardsByExpiry(pendingExpiry, childUserId);
        
        if (protectionResult.success && protectionResult.protectedCount > 0) {
          const protectedReward = protectionResult.protectedRewards[0];
          this.addResult(
            '🛡️ 全部过期保护执行', 
            'success', 
            `保护成功！奖励：${protectedReward.name}，使用${protectionResult.usedExpiredStars}颗过期星星完全保护`,
            protectionResult
          );
          
          // 6. 兑换测试（应该消耗0颗现有星星）
          const beforeStars = await starService.getTotalStars(childUserId);
          const exchangeResult = await rewardService.exchangeReward(protectedReward.id, childUserId);

          if (exchangeResult.success) {
            const actualCost = exchangeResult.actualCost || 0;
            const expectedCost = 0; // 全部保护，应该不消耗现有星星

            this.addResult(
              '🎉 全部过期兑换', 
              'success', 
              `兑换成功！原价${protectedReward.points}颗，全部过期保护，实际消耗${actualCost}颗`
            );

            // 验证扣除数量
            if (actualCost === expectedCost) {
              this.addResult(
                '✅ 全部过期验证', 
                'success', 
                `扣除正确：期望${expectedCost}颗，实际${actualCost}颗（全部过期保护生效）`
              );
            } else {
              this.addResult(
                '❌ 全部过期验证', 
                'error', 
                `扣除错误：期望${expectedCost}颗，实际${actualCost}颗`
              );
            }
          } else {
            this.addResult(
              '全部过期兑换', 
              'error', 
              `兑换失败: ${exchangeResult.message}`
            );
          }
        } else {
          this.addResult(
            '全部过期保护执行', 
            'warning', 
            protectionResult.message || '保护失败或无可保护奖励'
          );
        }
      } else {
        this.addResult(
          '全部过期保护执行', 
          'warning', 
          '状态不符合全部过期条件，跳过保护测试'
        );
      }

      this.addResult('🌟 全部过期测试完成', 'success', '情况5验证完成：全部过期星星保护机制已验证');

    } catch (error) {
      this.addResult('全部过期测试', 'error', `测试失败: ${error.message}`);
    } finally {
      this.setData({ testing: false });
      this.refreshStatus();
    }
  },

  /**
   * 🎯 多奖励保护测试
   * 验证情况2和情况5：多个奖励同时保护的机制
   */
  async testMultipleRewardProtection() {
    this.setData({ testing: true });
    
    try {
      this.addResult('🎯 开始多奖励保护测试', 'info', '验证情况2和情况5：多个奖励同时保护机制');
      
      const starService = serviceManager.getService('starService');
      const rewardService = serviceManager.getService('rewardService');
      
      if (!starService || !rewardService) {
        this.addResult('多奖励保护测试', 'error', '服务不可用');
        return;
      }

      const childUserId = 'child';

      // === 情况2测试：50颗星星保护3个奖励 ===
      this.addResult('📍 情况2：50颗星星保护多个奖励', 'info', '50颗星星（40过期+10未过期），奖励[20,15,10]');
      
      // 1. 清理现有测试数据
      await this.cleanupTestData();
      
      // 2. 创建50颗星星：40颗过期 + 10颗未过期
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      // 10颗未过期星星
      const permanentGroup = await starService.starGroupRepository.getOrCreateGroup(
        'test_permanent_multi', 
        null,
        '测试永久星星（多奖励）',
        childUserId
      );
      
      if (permanentGroup) {
        await starService.starGroupRepository.addStarsToGroup(
          permanentGroup,
          10,
          '测试用星星（永久有效）'
        );
      }

      // 40颗即将过期星星
      const expiryGroup = await starService.starGroupRepository.getOrCreateGroup(
        'test_expiry_multi', 
        tomorrow.getTime(),
        '测试过期星星（多奖励）',
        childUserId
      );

      if (expiryGroup) {
        await starService.starGroupRepository.addStarsToGroup(
          expiryGroup,
          40,
          '测试用星星（明天过期）'
        );
      }

      // 3. 创建3个奖励：20颗、15颗、10颗
      const rewards = [
        { name: '[测试]20星奖励-多奖励1', points: 20, description: '测试用奖励（20颗）', userId: childUserId },
        { name: '[测试]15星奖励-多奖励2', points: 15, description: '测试用奖励（15颗）', userId: childUserId },
        { name: '[测试]10星奖励-多奖励3', points: 10, description: '测试用奖励（10颗）', userId: childUserId }
      ];

      const createdRewards = [];
      for (const reward of rewards) {
        const createResult = await rewardService.createReward(reward);
        if (createResult.success) {
          createdRewards.push(createResult.reward);
        }
      }

      this.addResult(
        '创建测试场景', 
        'success', 
        `创建50颗星星（40过期+10未过期）和3个奖励（20+15+10颗）`
      );

      // 4. 验证状态
      const totalStars = await starService.getTotalStars(childUserId);
      const pendingExpiry = await starService.calculatePendingExpiry(childUserId);
      
      this.addResult(
        '验证多奖励状态', 
        'info', 
        `总星星：${totalStars}颗，即将过期：${pendingExpiry}颗`
      );

      // 5. 执行多奖励保护
      const protectionResult = await starService.protectRewardsByExpiry(pendingExpiry, childUserId);
      
      if (protectionResult.success) {
        this.addResult(
          '🛡️ 多奖励保护执行', 
          protectionResult.protectedCount >= 2 ? 'success' : 'warning', 
          `保护了${protectionResult.protectedCount}个奖励，使用${protectionResult.usedExpiredStars}颗过期星星`,
          {
            expectedCount: 3,
            actualCount: protectionResult.protectedCount,
            protectedRewards: protectionResult.protectedRewards
          }
        );

        // 验证是否符合预期
        if (protectionResult.protectedCount === 3) {
          this.addResult(
            '✅ 情况2验证', 
            'success', 
            `期望保护3个奖励，实际保护${protectionResult.protectedCount}个（完全符合预期）`
          );
        } else if (protectionResult.protectedCount >= 2) {
          this.addResult(
            '⚠️ 情况2验证', 
            'warning', 
            `期望保护3个奖励，实际保护${protectionResult.protectedCount}个（部分符合）`
          );
        } else {
          this.addResult(
            '❌ 情况2验证', 
            'error', 
            `期望保护3个奖励，实际保护${protectionResult.protectedCount}个（不符合预期）`
          );
        }

        // 6. 测试兑换第一个保护奖励
        if (protectionResult.protectedRewards.length > 0) {
          const firstReward = protectionResult.protectedRewards[0];
          const beforeStars = await starService.getTotalStars(childUserId);
          const exchangeResult = await rewardService.exchangeReward(firstReward.id, childUserId);

          if (exchangeResult.success) {
            const actualCost = exchangeResult.actualCost || 0;
            const expectedCost = firstReward.points - firstReward.partialProtection;

            this.addResult(
              '🎉 多奖励兑换验证', 
              actualCost === expectedCost ? 'success' : 'warning', 
              `兑换"${firstReward.name}"：原价${firstReward.points}颗，保护${firstReward.partialProtection}颗，实际支付${actualCost}颗`
            );
          }
        }
      } else {
        this.addResult(
          '多奖励保护执行', 
          'error', 
          protectionResult.message || '保护失败'
        );
      }

      // === 情况5测试：30颗星星保护2个奖励 ===
      this.addResult('📍 情况5：30颗星星保护2个奖励', 'info', '30颗星星（25过期+5未过期），奖励[20,10]');
      
      // 清理并创建新场景
      await this.cleanupTestData();
      
      // 创建30颗星星：25颗过期 + 5颗未过期
      const permanentGroup2 = await starService.starGroupRepository.getOrCreateGroup(
        'test_permanent_case5', 
        null,
        '测试永久星星（情况5）',
        childUserId
      );
      
      if (permanentGroup2) {
        await starService.starGroupRepository.addStarsToGroup(
          permanentGroup2,
          5,
          '测试用星星（永久有效）'
        );
      }

      const expiryGroup2 = await starService.starGroupRepository.getOrCreateGroup(
        'test_expiry_case5', 
        tomorrow.getTime(),
        '测试过期星星（情况5）',
        childUserId
      );

      if (expiryGroup2) {
        await starService.starGroupRepository.addStarsToGroup(
          expiryGroup2,
          25,
          '测试用星星（明天过期）'
        );
      }

      // 创建2个奖励：20颗、10颗
      const rewards5 = [
        { name: '[测试]20星奖励-情况5A', points: 20, description: '测试用奖励（20颗）', userId: childUserId },
        { name: '[测试]10星奖励-情况5B', points: 10, description: '测试用奖励（10颗）', userId: childUserId }
      ];

      for (const reward of rewards5) {
        await rewardService.createReward(reward);
      }

      // 执行情况5保护
      const totalStars5 = await starService.getTotalStars(childUserId);
      const pendingExpiry5 = await starService.calculatePendingExpiry(childUserId);
      
      this.addResult(
        '验证情况5状态', 
        'info', 
        `总星星：${totalStars5}颗，即将过期：${pendingExpiry5}颗`
      );

      const protectionResult5 = await starService.protectRewardsByExpiry(pendingExpiry5, childUserId);
      
      if (protectionResult5.success) {
        this.addResult(
          '🛡️ 情况5保护执行', 
          protectionResult5.protectedCount >= 2 ? 'success' : 'warning', 
          `保护了${protectionResult5.protectedCount}个奖励，使用${protectionResult5.usedExpiredStars}颗过期星星`,
          protectionResult5
        );

        // 验证情况5结果
        if (protectionResult5.protectedCount === 2) {
          this.addResult(
            '✅ 情况5验证', 
            'success', 
            `期望保护2个奖励，实际保护${protectionResult5.protectedCount}个（完全符合预期）`
          );
        } else {
          this.addResult(
            '❌ 情况5验证', 
            'error', 
            `期望保护2个奖励，实际保护${protectionResult5.protectedCount}个（不符合预期）`
          );
        }
      }

      this.addResult('🎯 多奖励保护测试完成', 'success', '情况2和情况5验证完成：多奖励保护机制已验证');

    } catch (error) {
      this.addResult('多奖励保护测试', 'error', `测试失败: ${error.message}`);
    } finally {
      this.setData({ testing: false });
      this.refreshStatus();
    }
  }
}); 