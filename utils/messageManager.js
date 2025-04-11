/**
 * messageManager.js - 消息处理工具类
 * 
 * 提供消息相关的通用方法，如添加消息、更新消息、删除消息等
 */

const messageManager = {
  // 创建任务相关消息
  createTaskMessage: function(task, type = 'new') {
    const now = Date.now();
    let title, summary, icon;
    
    switch(type) {
      case 'new':
        title = '新任务提醒';
        summary = `您有新的任务"${task.title}"已添加到计划中`;
        icon = '📝';
        break;
      case 'upcoming':
        title = '任务即将到期';
        summary = `您的任务"${task.title}"将在不久后到期，请及时完成`;
        icon = '⏰';
        break;
      case 'edited':
        title = '任务已更新';
        summary = `任务"${task.title}"的内容已被更新`;
        icon = '✏️';
        break;
      case 'completed':
        title = '任务已完成';
        summary = `恭喜您完成了任务"${task.title}"`;
        icon = '✅';
        break;
    }
    
    const message = {
      id: 'msg_' + now + '_' + Math.floor(Math.random() * 1000),
      type: 'task',
      notificationType: type,
      taskId: task.id,
      title: title,
      summary: summary,
      timestamp: now,
      isRead: false,
      icon: icon
    };
    
    this.addMessage(message);
    return message;
  },
  
  // 添加消息
  addMessage: function(message) {
    // 获取现有消息
    wx.getStorage({
      key: 'messageData',
      success: (res) => {
        let messages = res.data || [];
        messages.unshift(message);
        
        // 保存到本地存储
        wx.setStorage({
          key: 'messageData',
          data: messages
        });
      },
      fail: () => {
        // 如果没有现有消息，创建新数组
        wx.setStorage({
          key: 'messageData',
          data: [message]
        });
      }
    });
  },
  
  // 更新与任务相关的消息
  updateTaskMessages: function(task) {
    wx.getStorage({
      key: 'messageData',
      success: (res) => {
        let messages = res.data || [];
        let updated = false;
        
        // 更新与此任务相关的消息
        const updatedMessages = messages.map(msg => {
          if (msg.type === 'task' && msg.taskId === task.id) {
            // 更新消息中的任务标题
            if (msg.summary.includes('"')) {
              msg.summary = msg.summary.replace(/"([^"]+)"/, `"${task.title}"`);
            }
            updated = true;
          }
          return msg;
        });
        
        if (updated) {
          // 保存更新后的消息
          wx.setStorage({
            key: 'messageData',
            data: updatedMessages
          });
        }
      }
    });
  },
  
  // 删除与任务相关的消息
  removeTaskMessages: function(taskId) {
    wx.getStorage({
      key: 'messageData',
      success: (res) => {
        let messages = res.data || [];
        
        // 过滤掉与此任务相关的消息
        const filteredMessages = messages.filter(msg => 
          !(msg.type === 'task' && msg.taskId === taskId)
        );
        
        if (filteredMessages.length !== messages.length) {
          // 保存过滤后的消息
          wx.setStorage({
            key: 'messageData',
            data: filteredMessages
          });
        }
      }
    });
  },
  
  // 获取所有消息
  getAllMessages: function(callback) {
    wx.getStorage({
      key: 'messageData',
      success: (res) => {
        if (res.data && res.data.length > 0) {
          callback(res.data);
        } else {
          // 如果没有消息，使用默认示例消息
          const defaultMessages = this.getDefaultMessages();
          callback(defaultMessages);
          
          // 保存到本地存储
          wx.setStorage({
            key: 'messageData',
            data: defaultMessages
          });
        }
      },
      fail: () => {
        // 如果读取失败，使用默认示例消息
        const defaultMessages = this.getDefaultMessages();
        callback(defaultMessages);
        
        // 保存到本地存储
        wx.setStorage({
          key: 'messageData',
          data: defaultMessages
        });
      }
    });
  },
  
  // 获取未读消息数量
  getUnreadCount: function(callback) {
    this.getAllMessages(messages => {
      const unreadCount = messages.filter(msg => !msg.isRead).length;
      callback(unreadCount);
    });
  },
  
  // 标记消息为已读
  markAsRead: function(messageId) {
    wx.getStorage({
      key: 'messageData',
      success: (res) => {
        let messages = res.data || [];
        const messageIndex = messages.findIndex(m => m.id === messageId);
        
        if (messageIndex > -1 && !messages[messageIndex].isRead) {
          messages[messageIndex].isRead = true;
          
          // 保存更新后的消息
          wx.setStorage({
            key: 'messageData',
            data: messages
          });
        }
      }
    });
  },
  
  // 标记所有消息为已读
  markAllAsRead: function() {
    wx.getStorage({
      key: 'messageData',
      success: (res) => {
        let messages = res.data || [];
        
        // 将所有消息标记为已读
        messages = messages.map(msg => ({
          ...msg,
          isRead: true
        }));
        
        // 保存更新后的消息
        wx.setStorage({
          key: 'messageData',
          data: messages
        });
      }
    });
  },
  
  // 获取默认示例消息
  getDefaultMessages: function() {
    const now = Date.now();
    const yesterday = now - 86400000;
    const twoDaysAgo = now - 172800000;
    
    return [
      {
        id: 'msg_1',
        type: 'task',
        title: '任务即将到期',
        summary: '您有一个"语文作业"任务将在1小时后到期，请及时完成。',
        timestamp: now - 3600000, // 1小时前
        isRead: false,
        icon: '⏰'
      },
      {
        id: 'msg_2',
        type: 'achievement',
        title: '完成连续学习3天',
        summary: '恭喜你已经连续学习3天了，再接再厉！',
        timestamp: yesterday,
        isRead: true,
        icon: '🏆'
      },
      {
        id: 'msg_3',
        type: 'system',
        title: '新功能上线',
        summary: '消息中心功能已上线，现在可以接收任务提醒和成就通知了。',
        timestamp: twoDaysAgo,
        isRead: true,
        icon: '🔔'
      }
    ];
  },
  
  // 格式化消息时间为友好显示
  formatMessageTime: function(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    // 一分钟内
    if (diff < 60000) {
      return '刚刚';
    }
    
    // 一小时内
    if (diff < 3600000) {
      return Math.floor(diff / 60000) + '分钟前';
    }
    
    // 一天内
    if (diff < 86400000) {
      return Math.floor(diff / 3600000) + '小时前';
    }
    
    // 昨天
    if (diff < 172800000) {
      return '昨天';
    }
    
    // 7天内
    if (diff < 604800000) {
      return Math.floor(diff / 86400000) + '天前';
    }
    
    // 30天内
    if (diff < 2592000000) {
      return Math.floor(diff / 604800000) + '周前';
    }
    
    // 其他情况，显示具体日期
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  }
};

module.exports = messageManager; 