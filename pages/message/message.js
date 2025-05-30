// pages/message/message.js
const serviceManager = require('../../services/service-manager.js');
const dateUtils = require('../../utils/dateUtils');
const logger = require('../../utils/logger');

Page({
  /**
   * 页面的初始数据
   */
  data: {
    messages: [],         // 所有消息
    filteredMessages: [], // 过滤后的消息
    unreadCount: 0,       // 未读消息总数
    taskUnreadCount: 0,   // 任务类未读消息数
    achievementUnreadCount: 0, // 成就类未读消息数
    systemUnreadCount: 0, // 系统类未读消息数
    activeTab: 'all',     // 当前选中的标签
    activeTabName: '',    // 当前标签名称
    hasMoreMessages: false, // 是否有更多消息
    pageSize: 20,         // 每页显示消息数量
    currentPage: 1        // 当前页码
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
    
    // 加载消息数据
    this.loadMessageData();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    // 刷新消息数据
    this.loadMessageData();
  },

  /**
   * 加载消息数据
   */
  loadMessageData: function() {
    logger.info('MessagePage', '开始加载消息数据');
    const messageService = serviceManager.getMessageService();
    
    messageService.getAllMessages()
      .then(messages => {
        logger.info('MessagePage', `加载消息数据成功, 数量=${messages.length}`);
        this.processMessages(messages);
      })
      .catch(error => {
        logger.error('MessagePage', '加载消息数据失败', error);
        // 数据加载失败时显示空消息列表
        this.processMessages([]);
      });
  },

  /**
   * 处理消息数据，添加日期分隔符和计算未读数量
   */
  processMessages: function(messages) {
    // 按时间降序排序 - 统一使用createTime
    messages.sort((a, b) => b.createTime - a.createTime);
    
    // 添加日期分隔符
    let lastDate = '';
    const processedMessages = messages.map(msg => {
      const date = this.formatDate(msg.createTime);
      const showDateDivider = date !== lastDate;
      lastDate = date;
      
      return {
        ...msg,
        timeDisplay: this.formatMessageTime(msg.createTime),
        showDateDivider,
        dateDivider: date
      };
    });
    
    // 计算各类型未读消息数量
    const unreadCount = processedMessages.filter(msg => !msg.isRead).length;
    const taskUnreadCount = processedMessages.filter(msg => !msg.isRead && msg.type === 'task').length;
    const achievementUnreadCount = processedMessages.filter(msg => !msg.isRead && msg.type === 'achievement').length;
    const systemUnreadCount = processedMessages.filter(msg => !msg.isRead && msg.type === 'system').length;
    
    // 更新数据
    this.setData({
      messages: processedMessages,
      unreadCount,
      taskUnreadCount,
      achievementUnreadCount,
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
    
    let tabName = '';
    switch(activeTab) {
      case 'task': tabName = '任务'; break;
      case 'achievement': tabName = '成就'; break;
      case 'system': tabName = '系统'; break;
      default: tabName = '';
    }
    
    this.setData({
      filteredMessages: paged,
      activeTabName: tabName,
      hasMoreMessages: filtered.length > paged.length
    });
  },

  /**
   * 设置默认示例消息
   */
  setDefaultMessages: function() {
    const now = Date.now();
    const yesterday = now - 86400000;  // 昨天
    const twoDaysAgo = now - 172800000; // 前天
    const threeMonthsAgo = now - 7776000000; // 90天前
    
    const messages = [
      {
        id: 'msg_1',
        type: 'task',
        title: '任务即将到期',
        summary: '您有一个"语文作业"任务将在1小时后到期，请及时完成。',
        createTime: now - 3600000, // 统一使用createTime
        isRead: false,
        icon: '⏰'
      },
      {
        id: 'msg_2',
        type: 'achievement',
        title: '完成连续学习3天',
        summary: '恭喜你已经连续学习3天了，再接再厉！',
        createTime: yesterday, // 统一使用createTime
        isRead: true,
        icon: '🏆'
      },
      {
        id: 'msg_3',
        type: 'system',
        title: '新功能上线',
        summary: '消息中心功能已上线，现在可以接收任务提醒和成就通知了。',
        createTime: twoDaysAgo, // 统一使用createTime
        isRead: true,
        icon: '🔔'
      },
      {
        id: 'msg_4',
        type: 'task',
        title: '新任务提醒',
        summary: '您有新的任务"数学作业"已添加到今日计划中。',
        createTime: twoDaysAgo - 7200000, // 统一使用createTime
        isRead: true,
        icon: '📝'
      },
      {
        id: 'msg_5',
        type: 'achievement',
        title: '完成首个任务',
        summary: '恭喜您完成了第一个任务！继续加油！',
        createTime: threeMonthsAgo, // 统一使用createTime
        isRead: true,
        icon: '🎉'
      }
    ];
    
    // 保存到本地存储
    wx.setStorage({
      key: 'messageData',
      data: messages
    });
    
    // 处理消息
    this.processMessages(messages);
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
  const messageIndex = this.data.messages.findIndex(m => m.id === messageId);
  
  if (messageIndex > -1) {
    // 标记该消息为已读
    messageService.markMessageAsRead(messageId);
    
    // 记录日志
    logger.info('MessagePage', `标记消息已读: ${this.data.messages[messageIndex].title}`);
    
    // 重新加载消息数据
    setTimeout(() => {
      this.loadMessageData();
    }, 300);
  }
},

  /**
   * 标记所有消息为已读
   */
  markAllAsRead: function() {
    logger.info('MessagePage', '标记所有消息为已读');
    const messageService = serviceManager.getMessageService();
    
    messageService.markAllMessagesAsRead()
      .then(count => {
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
          messageService.deleteMessage(messageId)
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
    
    wx.showActionSheet({
      itemList: [message.isRead ? '标记为未读' : '标记为已读', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 切换已读/未读状态
          this.toggleMessageReadStatus({ currentTarget: { dataset: { id: message.id } } });
        } else if (res.tapIndex === 1) {
          // 删除消息
          this.deleteMessage({ currentTarget: { dataset: { id: message.id } } });
        }
      }
    });
  },

  /**
   * 切换消息已读状态
   */
  toggleMessageReadStatus: function(e) {
    const messageId = e.currentTarget.dataset.id;
    const messageService = serviceManager.getMessageService();
    const message = this.data.messages.find(m => m.id === messageId);
    
    if (message) {
      if (message.isRead) {
        // 已读变未读
        this.setMessageReadStatus(messageId, false);
        wx.showToast({
          title: '已标记为未读',
          icon: 'success',
          duration: 1500
        });
      } else {
        // 未读变已读
        messageService.markMessageAsRead(messageId);
        
        // 重新加载消息数据
        setTimeout(() => {
          this.loadMessageData();
        }, 300);
        
        wx.showToast({
          title: '已标记为已读',
          icon: 'success',
          duration: 1500
        });
      }
    }
  },

  /**
   * 设置消息已读状态
   */
  setMessageReadStatus: function(messageId, isRead) {
    wx.getStorage({
      key: 'messageData',
      success: (res) => {
        let messages = res.data || [];
        const messageIndex = messages.findIndex(m => m.id === messageId);
        
        if (messageIndex > -1) {
          messages[messageIndex].isRead = isRead;
          
          // 保存更新后的消息
          wx.setStorage({
            key: 'messageData',
            data: messages,
            success: () => {
              // 更新本地数据
              this.loadMessageData();
            }
          });
        }
      }
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
    const diffDays = Math.floor((now - date) / (24 * 60 * 60 * 1000));
    
    if (diffDays === 0) {
      return '今天';
    } else if (diffDays === 1) {
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
  }
}) 