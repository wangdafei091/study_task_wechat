const serviceManager = require('../../../services/service-manager.js');
const logger = require('../../../utils/logger');

function clearPreviewTimers(page) {
  if (page._messagePreviewOpenTimer) {
    clearTimeout(page._messagePreviewOpenTimer);
    page._messagePreviewOpenTimer = null;
  }

  if (page._messagePreviewCloseTimer) {
    clearTimeout(page._messagePreviewCloseTimer);
    page._messagePreviewCloseTimer = null;
  }
}

function navigateToMessageCenter(page, e) {
  logger.debug('Index', '准备跳转到消息中心页面');

  if (e && typeof e.stopPropagation === 'function') {
    e.stopPropagation();
  }

  clearPreviewTimers(page);

  wx.navigateTo({
    url: '/packageMessage/pages/message/message',
    success: () => {
      logger.debug('Index', '成功跳转到消息中心页面');

      page._messagePreviewCloseTimer = setTimeout(() => {
        page.setData({
          showMessagePreview: false
        });
        if (typeof page.syncHomeOnboardingVisibility === 'function') {
          page.syncHomeOnboardingVisibility();
        }
        page._messagePreviewCloseTimer = null;
      }, 300);
    }
  });
}

function toggleMessagePreview(page) {
  logger.debug('Index', `${page.data.showMessagePreview ? '关闭' : '打开'}消息面板`);
  const currentState = page.data.showMessagePreview;
  const wasClosing = Boolean(page._messagePreviewCloseTimer);
  clearPreviewTimers(page);

  page.messageAnimation = wx.createAnimation({
    duration: 250,
    timingFunction: 'ease-out',
    delay: 0
  });

  if (currentState && !wasClosing) {
    logger.debug('Index', '创建关闭动画');
    page.messageAnimation.opacity(0).scale(0.8).step();

    page.setData({
      messageAnimation: page.messageAnimation.export()
    });

    page._messagePreviewCloseTimer = setTimeout(() => {
      logger.debug('Index', '动画结束，隐藏面板');
      page.setData({
        showMessagePreview: false
      });
      if (typeof page.syncHomeOnboardingVisibility === 'function') {
        page.syncHomeOnboardingVisibility();
      }
      page._messagePreviewCloseTimer = null;
    }, 250);
    return;
  }

  logger.debug('Index', '准备显示面板');
  if (wx.vibrateShort) {
    wx.vibrateShort({ type: 'light' });
  }

  page.messageAnimation.opacity(0).scale(0.8).step({ duration: 0 });
  logger.debug('Index', '初始化动画');

  page.setData({
    showMessagePreview: true,
    messageAnimation: page.messageAnimation.export(),
    showSearch: false,
    showStats: false
  });
  if (typeof page.syncHomeOnboardingVisibility === 'function') {
    page.syncHomeOnboardingVisibility();
  }

  page._messagePreviewOpenTimer = setTimeout(() => {
    logger.debug('Index', '执行显示动画');
    page.messageAnimation.opacity(1).scale(1).step();

    page.setData({
      messageAnimation: page.messageAnimation.export()
    });
    page._messagePreviewOpenTimer = null;
  }, 50);
}

function preventBubble(_page, e) {
  logger.debug('Index', '阻止事件冒泡');
  if (e && typeof e.stopPropagation === 'function') {
    e.stopPropagation();
  } else {
    logger.debug('Index', '事件对象不包含stopPropagation方法');
  }
  return false;
}

function preventTouchMove(_page, e) {
  logger.debug('Index', '阻止蒙层触摸滑动');
  if (e) {
    if (typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    } else {
      logger.debug('Index', '事件对象不包含stopPropagation方法');
    }

    if (typeof e.preventDefault === 'function') {
      e.preventDefault();
    } else {
      logger.debug('Index', '事件对象不包含preventDefault方法');
    }
  }
  return false;
}

function viewMessageDetail(page, e) {
  const messageId = e.currentTarget.dataset.id;
  const message = page.data.messages.find((item) => item.id === messageId);

  if (!message) {
    return;
  }

  page.markMessageAsRead(e);
  logger.debug('Index', `标记消息已读: ${message.title}`);
}

function markMessageAsRead(page, e) {
  const messageId = e.currentTarget.dataset.id;
  if (!messageId) {
    logger.warn('Index', '标记消息已读失败：消息ID为空');
    return;
  }

  const messageService = serviceManager.getMessageService();

  messageService.markMessageAsRead(messageId, page.getMessageScopeOptions())
    .then((success) => {
      logger.info('Index', `标记消息已读${success ? '成功' : '失败'}: ${messageId}`);
      if (success) {
        page.getUnreadMessageCount();
      }
    })
    .catch((error) => {
      logger.error('Index', '标记消息已读出错', error);
    });
}

function markAllMessagesAsRead(page) {
  const messageService = serviceManager.getMessageService();
  const unreadCount = page.data.messages.filter((message) => !message.isRead).length;

  if (unreadCount === 0) {
    wx.showToast({
      title: '暂无未读消息',
      icon: 'none',
      duration: 1500
    });
    return;
  }

  messageService.markAllMessagesAsRead(page.getMessageScopeOptions())
    .then((count) => {
      if (count <= 0) {
        logger.warn('Index', '标记全部消息已读未成功写入');
        wx.showToast({
          title: '操作失败',
          icon: 'none',
          duration: 1500
        });
        return;
      }

      logger.info('Index', `标记全部消息已读成功, 数量: ${count}`);
      page.getUnreadMessageCount();
      page.setData({
        messages: page.data.messages.map((message) => ({
          ...message,
          isRead: true
        }))
      });
    })
    .catch((error) => {
      logger.error('Index', '标记全部消息已读出错', error);
    });
}

function getUnreadMessageCount(page) {
  const messageService = serviceManager.getMessageService();

  messageService.getUnreadCount(page.getMessageScopeOptions())
    .then((count) => {
      page.setData({
        unreadCount: count
      });
      logger.info('Index', `更新未读消息数量: ${count}`);
    })
    .catch((error) => {
      logger.error('Index', '获取未读消息数量出错', error);
    });
}

module.exports = {
  clearPreviewTimers,
  navigateToMessageCenter,
  toggleMessagePreview,
  preventBubble,
  preventTouchMove,
  viewMessageDetail,
  markMessageAsRead,
  markAllMessagesAsRead,
  getUnreadMessageCount
};
