// pages/message/message.js
const serviceManager = require('../../../services/service-manager.js');
const dateUtils = require('../../../utils/dateUtils');
const logger = require('../../../utils/logger');
const messageDisplay = require('../../../utils/message-display');
const viewScopeUtils = require('../../../utils/view-scope');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    messages: [],         // 所有消息
    filteredMessages: [], // 过滤后的消息
    unreadCount: 0,       // 未读消息总数
    taskUnreadCount: 0,   // 任务类未读消息数
    rewardUnreadCount: 0, // 奖励类未读消息数
    systemUnreadCount: 0, // 系统类未读消息数
    activeTab: 'all',     // 当前选中的标签
    activeTabName: '',    // 当前标签名称
    hasMoreMessages: false, // 是否有更多消息
    pageSize: 20,         // 每页显示消息数量
    currentPage: 1,       // 当前页码
    
    // 详情面板相关数据
    showDetailPanel: false,     // 是否显示详情面板
    selectedMessage: null,      // 当前选中的消息
    detailAnimation: null       // 详情面板动画
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 如果有指定标签，就切换到该标签
    if (options && options.tab) {
      this.setData({
        activeTab: options.tab
      });
    }

    this._skipNextOnShowRefresh = true;

    // 加载消息数据
    return this.loadMessageData();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    if (this._skipNextOnShowRefresh) {
      this._skipNextOnShowRefresh = false;
      return Promise.resolve();
    }

    // 刷新消息数据
    return this.loadMessageData();
  },

  /**
   * 加载消息数据
   */
  loadMessageData: function() {
    logger.info('MessagePage', '开始加载消息数据');
    const messageService = serviceManager.getMessageService();
    const scopeOptions = this.getMessageScopeOptions();

    return messageService.getMessagesByScope({
      ...scopeOptions,
      requireFresh: true
    })
      .then(messages => {
        logger.info('MessagePage', `加载消息数据成功, scope=${scopeOptions.scope}, 消息数量=${messages.length}`);
        this.processMessages(messages);
      })
      .catch(error => {
        logger.error('MessagePage', '加载消息数据失败', error);
        // 数据加载失败时显示空消息列表
        this.processMessages([]);
      });
  },

  applyReadStateLocally: function(messageId) {
    if (!messageId) {
      return;
    }

    const nextMessages = this.data.messages.map((message) => (
      message.id === messageId ? { ...message, isRead: true } : message
    ));

    this.processMessages(nextMessages);
  },

  getMessageScopeOptions: function() {
    const userService = getApp().globalData.userService;
    const loginUser = userService?.getLoginUser?.() || null;
    const currentUser = userService?.getCurrentUser?.() || null;
    return viewScopeUtils.resolveMessageScopeOptions(loginUser, currentUser);
  },

  /**
   * 处理消息数据，添加日期分隔符和计算未读数量
   */
  processMessages: function(messages) {
    const processedMessages = messageDisplay.buildTimelineMessages(messages, {
      formatMessageTime: (createTime) => this.formatMessageTime(createTime)
    });
    
    // 计算各类型未读消息数量
    const unreadCount = processedMessages.filter(msg => !msg.isRead).length;
    const taskUnreadCount = processedMessages.filter(msg => !msg.isRead && msg.type === 'task').length;
    const rewardUnreadCount = processedMessages.filter(msg => !msg.isRead && msg.type === 'reward').length;
    const systemUnreadCount = processedMessages.filter(msg => !msg.isRead && msg.type === 'system').length;
    
    // 更新数据
    this.setData({
      messages: processedMessages,
      unreadCount,
      taskUnreadCount,
      rewardUnreadCount,
      systemUnreadCount,
      hasMoreMessages: processedMessages.length > this.data.pageSize
    });
    
    // 根据当前标签过滤消息
    this.filterMessagesByTab();
  },

  /**
   * 根据当前标签过滤消息
   */
  filterMessagesByTab: function() {
    const { messages, activeTab, pageSize, currentPage } = this.data;
    
    let filtered = [];
    if (activeTab === 'all') {
      filtered = messages;
    } else {
      filtered = messages.filter(msg => msg.type === activeTab);
    }
    
    // 分页加载
    const paged = filtered.slice(0, pageSize * currentPage);
    const displayMessages = messageDisplay.recomputeDateDividers(
      paged,
      (createTime) => this.formatDate(createTime)
    );
    
    let tabName = '';
    switch(activeTab) {
      case 'task': tabName = '任务'; break;
      case 'reward': tabName = '奖励'; break;
      case 'system': tabName = '系统'; break;
      default: tabName = '';
    }
    
    this.setData({
      filteredMessages: displayMessages,
      activeTabName: tabName,
      hasMoreMessages: filtered.length > paged.length
    });
  },

  /**
   * 切换标签
   */
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    
    this.setData({
      activeTab: tab,
      currentPage: 1 // 切换标签时重置页码
    });
    
    // 根据新标签过滤消息
    this.filterMessagesByTab();
  },

/**
 * 查看消息详情
 */
viewMessageDetail: function(e) {
  const messageId = e.currentTarget.dataset.id;
  const messageService = serviceManager.getMessageService();
  const message = this.data.messages.find(m => m.id === messageId);
  
  if (!message) {
    return Promise.resolve(false);
  }

  let markReadPromise = Promise.resolve(false);
  if (!message.isRead && messageService && typeof messageService.markMessageAsRead === 'function') {
    markReadPromise = Promise.resolve()
      .then(() => messageService.markMessageAsRead(messageId, this.getMessageScopeOptions()))
      .then((success) => {
        if (success) {
          this.applyReadStateLocally(messageId);
        }
        return success;
      })
      .catch(error => {
        logger.error('MessagePage', `标记消息已读出错: ${messageId}`, error);
        return false;
      });
  }

  logger.info('MessagePage', `标记消息已读: ${message.title}`);

  if (message.content && message.content.trim()) {
    this.showMessageDetail(message);
  }

  return markReadPromise;
},

  /**
   * 标记所有消息为已读
   */
  markAllAsRead: function() {
    logger.info('MessagePage', '标记所有消息为已读');
    const messageService = serviceManager.getMessageService();
    const unreadCount = this.data.messages.filter(msg => !msg.isRead).length;

    if (unreadCount === 0) {
      wx.showToast({
        title: '暂无未读消息',
        icon: 'none',
        duration: 1500
      });
      return;
    }
    
    messageService.markAllMessagesAsRead(this.getMessageScopeOptions())
      .then(count => {
        if (count <= 0) {
          logger.warn('MessagePage', '标记所有消息为已读未成功写入');
          wx.showToast({
            title: '操作失败',
            icon: 'none',
            duration: 1500
          });
          return;
        }

        logger.info('MessagePage', `标记所有消息为已读成功, 数量=${count}`);
        
        // 更新本地数据
        const updatedMessages = this.data.messages.map(msg => {
          return { ...msg, isRead: true };
        });
        
        // 更新UI
        this.processMessages(updatedMessages);
        
        // 显示提示
        wx.showToast({
          title: '全部已读',
          icon: 'success',
          duration: 1500
        });
      })
      .catch(error => {
        logger.error('MessagePage', '标记所有消息为已读失败', error);
        wx.showToast({
          title: '操作失败',
          icon: 'none',
          duration: 1500
        });
      });
  },

  /**
   * 删除消息
   */
  deleteMessage: function(e) {
    const messageId = e.currentTarget.dataset.id;
    if (!messageId) {
      logger.warn('MessagePage', '删除消息失败: 消息ID为空');
      return;
    }
    
    logger.info('MessagePage', `删除消息: ${messageId}`);
    const messageService = serviceManager.getMessageService();
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条消息吗？',
      success: (res) => {
        if (res.confirm) {
          messageService.deleteMessage(messageId, this.getMessageScopeOptions())
            .then(success => {
              if (success) {
                logger.info('MessagePage', `删除消息成功: ${messageId}`);
                
                // 更新本地数据
                const updatedMessages = this.data.messages.filter(msg => msg.id !== messageId);
                
                // 更新UI
                this.processMessages(updatedMessages);
                
                // 显示提示
                wx.showToast({
                  title: '已删除',
                  icon: 'success',
                  duration: 1500
                });
              } else {
                logger.warn('MessagePage', `删除消息失败: ${messageId}`);
                wx.showToast({
                  title: '删除失败',
                  icon: 'none',
                  duration: 1500
                });
              }
            })
            .catch(error => {
              logger.error('MessagePage', `删除消息出错: ${messageId}`, error);
              wx.showToast({
                title: '删除失败',
                icon: 'none',
                duration: 1500
              });
            });
        }
      }
    });
  },

  /**
   * 显示消息操作选项
   */
  showMessageOptions: function(e) {
    const index = e.currentTarget.dataset.index;
    const message = this.data.filteredMessages[index];
    const itemList = message.isRead ? ['删除'] : ['标记为已读', '删除'];
    
    wx.showActionSheet({
      itemList,
      success: (res) => {
        if (!message.isRead && res.tapIndex === 0) {
          this.markMessageAsRead({ currentTarget: { dataset: { id: message.id } } });
        } else if ((message.isRead && res.tapIndex === 0) || (!message.isRead && res.tapIndex === 1)) {
          // 删除消息
          this.deleteMessage({ currentTarget: { dataset: { id: message.id } } });
        }
      }
    });
  },

  /**
   * 标记消息为已读
   */
  markMessageAsRead: function(e) {
    const messageId = e.currentTarget.dataset.id;
    const messageService = serviceManager.getMessageService();
    const message = this.data.messages.find(m => m.id === messageId);

    if (!message || message.isRead) {
      return;
    }

    messageService.markMessageAsRead(messageId, this.getMessageScopeOptions())
      .then(success => {
        if (!success) {
          wx.showToast({
            title: '操作失败',
            icon: 'none',
            duration: 1500
          });
          return;
        }

        this.applyReadStateLocally(messageId);

        wx.showToast({
          title: '已标记为已读',
          icon: 'success',
          duration: 1500
        });
      })
      .catch(error => {
        logger.error('MessagePage', `标记消息已读出错: ${messageId}`, error);
        wx.showToast({
          title: '操作失败',
          icon: 'none',
          duration: 1500
        });
      });
  },

  /**
   * 加载更多消息
   */
  loadMoreMessages: function() {
    if (this.data.hasMoreMessages) {
      this.setData({
        currentPage: this.data.currentPage + 1
      });
      
      this.filterMessagesByTab();
    }
  },

  /**
   * 格式化消息时间显示
   */
  formatMessageTime: function(createTime) {
    // 添加日志便于调试
    logger.debug('MessagePage', '格式化消息时间', { createTime });
    
    // 使用dateUtils工具函数格式化时间
    const timeDisplay = dateUtils.formatRelativeTime(createTime);
    
    // 如果工具函数返回空字符串（无效输入），则返回默认值
    return timeDisplay || '时间未知';
  },

  /**
   * 格式化日期
   */
  formatDate: function(createTime) {
    // 简单检查：如果createTime无效，返回默认值
    if (!createTime) {
      logger.warn('MessagePage', 'formatDate: createTime参数为空');
      return '今天';
    }
    
    const date = new Date(createTime);
    const now = new Date();
    const diffDays = dateUtils.getDaysBetween(date, now);
    
    if (dateUtils.isToday(date)) {
      return '今天';
    } else if (dateUtils.isYesterday(date)) {
      return '昨天';
    } else if (diffDays === 2) {
      return '前天';
    } else if (diffDays < 7) {
      const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      return weekdays[date.getDay()];
    } else {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      
      if (year === now.getFullYear()) {
        return `${month}月${day}日`;
      } else {
        return `${year}年${month}月${day}日`;
      }
    }
  },

  /**
   * 显示消息详情面板
   */
  showMessageDetail: function(message) {
    logger.info('MessagePage', `显示消息详情: ${message.title}`);
    logger.info('MessagePage', '启用滑动穿透防护');
    
    // 创建动画实例
    const animation = wx.createAnimation({
      duration: 300,
      timingFunction: 'ease-out'
    });
    
    // 设置初始状态（从底部滑入）
    animation.translateY('100%').opacity(0).step({ duration: 0 });
    
    this.setData({
      selectedMessage: message,
      showDetailPanel: true,
      detailAnimation: animation.export()
    });
    
    // 执行展开动画
    setTimeout(() => {
      animation.translateY(0).opacity(1).step();
      this.setData({
        detailAnimation: animation.export()
      });
    }, 50);
  },
  
  /**
   * 隐藏消息详情面板
   */
  hideMessageDetail: function() {
    logger.info('MessagePage', '隐藏消息详情面板');
    logger.info('MessagePage', '解除滑动穿透防护');
    
    // 创建动画实例
    const animation = wx.createAnimation({
      duration: 300,
      timingFunction: 'ease-in'
    });
    
    // 设置隐藏动画（滑出到底部）
    animation.translateY('100%').opacity(0).step();
    
    this.setData({
      detailAnimation: animation.export()
    });
    
    // 延迟隐藏面板
    setTimeout(() => {
      this.setData({
        showDetailPanel: false,
        selectedMessage: null
      });
    }, 300);
  },
  
  /**
   * 防止事件冒泡和滑动穿透
   */
  preventBubble: function(e) {
    // 阻止事件冒泡和默认行为，防止滑动穿透
    if (e) {
      if (typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      if (typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
    }
    return false;
  },
}) 
