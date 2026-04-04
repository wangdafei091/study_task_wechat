const serviceManager = require('../../services/service-manager.js');
const logger = require('../../utils/logger');

async function run(app) {
  try {
    logger.info('App', '开始登录成功后的初始化');

    const offlineQueueService = serviceManager.getOfflineQueueService();
    logger.info('App', '获取离线队列服务:', offlineQueueService ? '成功' : '失败');

    const taskService = serviceManager.getTaskService();
    logger.info('App', '获取任务服务:', taskService ? '成功' : '失败');

    const messageService = serviceManager.getMessageService();
    logger.info('App', '获取消息服务:', messageService ? '成功' : '失败');

    const starService = serviceManager.getStarService();
    logger.info('App', '获取星星服务:', starService ? '成功' : '失败');

    if (offlineQueueService?.initialize) {
      await offlineQueueService.initialize();
    }

    if (offlineQueueService?.drain) {
      await offlineQueueService.drain({
        reason: 'post_login_bootstrap',
        force: true
      });
      logger.info('App', '登录后离线队列补偿完成');
    }

    if (taskService) {
      await fixLegacyTaskData(taskService);
      logger.info('App', '开始检查任务状态和处理必做任务惩罚');
      await taskService.checkTasksStatus();
      await taskService.checkUpcomingTasks();
    }

    if (starService) {
      await bootstrapStarService(starService);
    }

    if (messageService) {
      logger.info('App', '初始化消息服务');
      await messageService.initialize();
      if (typeof messageService.syncFormalRemindersIfNeeded === 'function') {
        await messageService.syncFormalRemindersIfNeeded();
      }
      const messages = await messageService.getAllMessages();
      logger.info('App', `消息服务初始化完成，共${messages.length}条消息`);
    }

    logger.info('App', '检查首次启动状态');
    if (messageService) {
      await checkFirstLaunch(app, messageService);
    } else {
      logger.warn('App', 'messageService 未初始化，跳过首次启动检查');
    }

    app.setTheme();

    logger.info('App', '登录成功后初始化完成');
    if (typeof app.globalData.appReadyCallback === 'function') {
      app.globalData.appReadyCallback();
    }
  } catch (error) {
    logger.error('App', '登录成功后初始化失败', error);
  }
}

async function bootstrapStarService(starService) {
  try {
    const userService = serviceManager.getUserService();
    const loginUserId = userService ? userService.getLoginUserId() : null;
    const rewardService = serviceManager.getRewardService();

    if (starService.enableCloudStorage && loginUserId && typeof starService.syncExpiryAuthorityIfNeeded === 'function') {
      logger.info('App', '云端模式执行星星到期权威同步');
      await starService.syncExpiryAuthorityIfNeeded({
        scope: 'user',
        userId: loginUserId,
        force: true
      });
      if (typeof starService.refreshStarsFromCloud === 'function') {
        await starService.refreshStarsFromCloud(loginUserId, {
          forceCloudAfterAuthority: true
        });
      }
      if (rewardService?.refreshRewardsFromCloud) {
        await rewardService.refreshRewardsFromCloud({
          force: true,
          userId: loginUserId
        });
      }
    } else {
      logger.info('App', '本地模式检查即将过期的星星并进行奖励保护');
      const expiredStars = await starService.calculatePendingExpiry(loginUserId);

      if (expiredStars > 0 && loginUserId) {
        logger.info('App', `发现${expiredStars}颗即将过期的星星，为登录用户${loginUserId}进行奖励保护`);
        const protectionResult = await starService.protectRewardsByExpiry(expiredStars, loginUserId);

        if (protectionResult.success && protectionResult.protectedCount > 0) {
          logger.info('App', `奖励保护成功，保护了${protectionResult.protectedCount}个奖励`);
        }
      }
    }

    logger.info('App', '初始化星星服务并清理过期星星');
    await starService.initialize();

    if (starService.enableCloudStorage) {
      logger.info('App', '云端模式跳过本地星星一致性检查和修复');
      return;
    }

    logger.info('App', '开始检查并修复星星数据一致性');
    const repairResult = await starService.checkAndRepairDataConsistency();
    if (repairResult.success) {
      if (repairResult.repairResult.repairedCount > 0) {
        logger.info('App', `星星数据修复完成，修复了${repairResult.repairResult.repairedCount}条记录`);
      } else {
        logger.info('App', '星星数据一致性检查通过，无需修复');
      }
    } else {
      logger.error('App', `星星数据修复失败: ${repairResult.error}`);
    }
  } catch (error) {
    logger.error('App', '星星服务初始化失败', error);
  }
}

async function fixLegacyTaskData(taskService) {
  try {
    logger.info('App', '开始修复存量任务数据的penaltyApplied字段');
    const allTasks = await taskService.getAllTasks();
    let fixedCount = 0;

    for (const task of allTasks) {
      if (task.penaltyApplied === undefined) {
        task.penaltyApplied = false;
        await taskService.taskRepository.save(task);
        fixedCount += 1;
        logger.debug('App', `修复任务penaltyApplied字段: ${task.title}`);
      }
    }

    if (fixedCount > 0) {
      logger.info('App', `存量数据修复完成，修复了${fixedCount}个任务的penaltyApplied字段`);
    } else {
      logger.info('App', '存量数据检查完成，无需修复penaltyApplied字段');
    }
  } catch (error) {
    logger.error('App', '修复存量任务数据失败', error);
  }
}

async function checkFirstLaunch(app, messageService) {
  try {
    if (!messageService) {
      logger.warn('App', 'messageService 未提供，跳过首次启动检查');
      return;
    }

    logger.info('App', '检查首次启动状态');
    let isFirstLaunch = false;

    if (serviceManager.isInitialized) {
      const configService = serviceManager.getService('config');
      if (configService) {
        isFirstLaunch = configService.isFirstLaunch();
      } else {
        const hasWelcomed = wx.getStorageSync('has_welcomed_user');
        isFirstLaunch = !hasWelcomed;
      }
    } else {
      const hasWelcomed = wx.getStorageSync('has_welcomed_user');
      isFirstLaunch = !hasWelcomed;
      logger.warn('App', '配置服务未就绪，使用降级存储访问');
    }

    if (!isFirstLaunch) {
      logger.info('App', '非首次启动，跳过欢迎消息创建');
      return;
    }

    logger.info('App', '检测到首次启动，创建欢迎消息');
    await createWelcomeMessage(messageService);

    if (serviceManager.isInitialized) {
      const configService = serviceManager.getService('config');
      if (configService) {
        configService.markUserWelcomed();
      } else {
        wx.setStorageSync('has_welcomed_user', true);
      }
    } else {
      wx.setStorageSync('has_welcomed_user', true);
      logger.warn('App', '配置服务未就绪，使用降级存储访问');
    }

    logger.info('App', '首次启动处理完成，已设置欢迎标记');
  } catch (error) {
    logger.error('App', '检查首次启动失败', error);
  }
}

async function createWelcomeMessage(messageService) {
  try {
    const welcomeContent = getWelcomeContent();
    const result = await messageService.createSystemMessage(welcomeContent, 'welcome', {
      title: '欢迎使用小CEO日程表',
      summary: '帮助孩子建立学习习惯的时间管理工具，支持任务管理和星星奖励'
    });

    if (result) {
      logger.info('App', '欢迎消息创建成功', { messageId: result.id });
    } else {
      logger.warn('App', '欢迎消息创建失败', result);
    }
  } catch (error) {
    logger.error('App', '创建欢迎消息出错', error);
  }
}

function getWelcomeContent() {
  return `这是一个帮助孩子建立良好学习习惯的时间管理工具：

✨ 核心功能
• 创建学习、习惯、兴趣任务
• 通过星星积分激励完成
• 用积分兑换心仪的奖励

🚀 开始使用
1. 点击主页右下角的"+"按钮，选择"奖励"
2. 添加孩子喜欢的奖励作为激励目标
3. 点击"+"按钮，选择"任务"创建第一个任务
4. 开始您的时间管理之旅

记住：先设置奖励，再创建任务，效果更好哦！

祝您和孩子使用愉快！ 📚✨`;
}

module.exports = {
  run,
  fixLegacyTaskData,
  checkFirstLaunch,
  createWelcomeMessage,
  getWelcomeContent
};
