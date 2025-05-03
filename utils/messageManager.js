/**
 * messageManager.js - 消息处理工具类
 * 
 * 提供消息相关的通用方法，如添加消息、更新消息、删除消息等
 */

const messageManager = {
  // 创建任务相关消息
  createTaskMessage: function(task, type = 'new', options = {}) {
    const now = Date.now();
    let title, summary, icon;
    
    // 检查是否是批量操作
    const isBatchOperation = options.isBatchOperation || false;
    const batchCount = options.batchCount || 0;
    
    switch(type) {
      case 'new':
        title = '新任务提醒';
        summary = isBatchOperation 
          ? `您有${batchCount}个"${task.title}"循环任务已添加到计划中` 
          : `您有新的任务"${task.title}"已添加到计划中`;
        icon = '📝';
        break;
      case 'upcoming':
        title = '任务即将到期';
        summary = `您的任务"${task.title}"将在不久后到期，请及时完成`;
        icon = '⏰';
        break;
      case 'edited':
        title = '任务已更新';
        summary = isBatchOperation 
          ? `已更新${batchCount}个"${task.title}"循环任务` 
          : `任务"${task.title}"的内容已被更新`;
        icon = '✏️';
        break;
      case 'completed':
        title = '任务已完成';
        summary = `恭喜您完成了任务"${task.title}"`;
        icon = '✅';
        break;
      case 'required':
        title = '必做任务提醒';
        summary = `请务必完成任务"${task.title}"，否则将扣除5积分`;
        icon = '⚠️';
        break;
      case 'deleted':
        title = '任务已删除';
        summary = isBatchOperation 
          ? `已删除${batchCount}个"${task.title}"循环任务` 
          : `任务"${task.title}"已被删除`;
        icon = '🗑️';
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
      icon: icon,
      isBatchOperation: isBatchOperation,
      batchCount: batchCount
    };
    
    this.addMessage(message);
    return message;
  },
  
  // 创建积分惩罚消息
  createPenaltyMessage: function(task, points) {
    const now = Date.now();
    
    const message = {
      id: 'msg_penalty_' + now + '_' + Math.floor(Math.random() * 1000),
      type: 'penalty',
      taskId: task.id,
      title: '积分扣除提醒',
      summary: `必做任务"${task.title}"未完成，已扣除${points}积分`,
      timestamp: now,
      isRead: false,
      icon: '⚠️'
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
        
        // 检查是否已存在相同类型、相同任务的未读消息(去重)
        const existingSimilarMessage = messages.find(msg => 
          msg.type === 'task' && 
          msg.taskId === message.taskId && 
          msg.notificationType === message.notificationType &&
          !msg.isRead
        );
        
        // 如果已存在相似消息，更新它而不是添加新消息
        if (existingSimilarMessage) {
          messages = messages.map(msg => {
            if (msg.id === existingSimilarMessage.id) {
              return {
                ...message,
                id: msg.id // 保持原消息ID
              };
            }
            return msg;
          });
        } else {
          // 添加新消息
          messages.unshift(message);
        }
        
        // 保存到本地存储
        wx.setStorage({
          key: 'messageData',
          data: messages,
          success: () => {
            // 触发全局消息更新事件
            this._notifyMessageUpdate(messages);
          }
        });
      },
      fail: () => {
        // 如果没有现有消息，创建新数组
        const messages = [message];
        wx.setStorage({
          key: 'messageData',
          data: messages,
          success: () => {
            // 触发全局消息更新事件
            this._notifyMessageUpdate(messages);
          }
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
            data: updatedMessages,
            success: () => {
              // 触发全局消息更新事件
              this._notifyMessageUpdate(updatedMessages);
            }
          });
        }
      }
    });
  },
  
  // 删除与特定任务相关的所有消息
  removeTaskMessages: function(taskId, callback) {
    if (!taskId) {
      console.error(`[messageManager] 删除任务消息失败: 任务ID为空`);
      if (typeof callback === 'function') {
        callback(false);
      } else if (callback && typeof callback.fail === 'function') {
        callback.fail('任务ID为空');
      }
      return;
    }
    
    console.log(`[messageManager] 开始删除任务消息: ${taskId}`);
    
    wx.getStorage({
      key: 'messageData',
      success: (res) => {
        let messages = res.data || [];
        let originalCount = messages.length;
        
        // 过滤掉所有与此任务相关的消息
        messages = messages.filter(msg => !(msg.type === 'task' && msg.taskId === taskId));
        
        let removedCount = originalCount - messages.length;
        console.log(`[messageManager] 找到任务相关消息数量: ${removedCount}`);
        
        // 只有在实际删除了消息时才进行存储操作
        if (removedCount > 0) {
          wx.setStorage({
            key: 'messageData',
            data: messages,
            success: () => {
              console.log(`[messageManager] 成功删除任务消息: ${taskId}, 数量: ${removedCount}`);
              // 触发全局消息更新事件
              this._notifyMessageUpdate(messages);
              
              if (typeof callback === 'function') {
                callback(true, removedCount);
              } else if (callback && typeof callback.success === 'function') {
                callback.success(removedCount);
              }
            },
            fail: (error) => {
              console.error(`[messageManager] 保存删除后的消息失败: ${error}`);
              
              if (typeof callback === 'function') {
                callback(false);
              } else if (callback && typeof callback.fail === 'function') {
                callback.fail(error);
              }
            }
          });
        } else {
          console.log(`[messageManager] 未找到任务相关消息: ${taskId}`);
          
          if (typeof callback === 'function') {
            callback(true, 0);
          } else if (callback && typeof callback.success === 'function') {
            callback.success(0);
          }
        }
      },
      fail: (error) => {
        console.error(`[messageManager] 读取消息数据失败: ${error}`);
        
        if (typeof callback === 'function') {
          callback(false);
        } else if (callback && typeof callback.fail === 'function') {
          callback.fail(error);
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
          const messages = res.data.map(msg => ({
            ...msg,
            timeDisplay: this.formatMessageTime(msg.timestamp)
          }));
          callback(messages);
        } else {
          // 如果没有消息，使用默认示例消息
          const defaultMessages = this.getDefaultMessages().map(msg => ({
            ...msg,
            timeDisplay: this.formatMessageTime(msg.timestamp)
          }));
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
        const defaultMessages = this.getDefaultMessages().map(msg => ({
          ...msg,
          timeDisplay: this.formatMessageTime(msg.timestamp)
        }));
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
  markAsRead: function(messageId, callback) {
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
            data: messages,
            success: () => {
              // 触发全局消息更新事件
              this._notifyMessageUpdate(messages);
              if (callback) callback(true);
            }
          });
        } else if (callback) {
          callback(false);
        }
      },
      fail: () => {
        if (callback) callback(false);
      }
    });
  },
  
  // 标记所有消息为已读
  markAllAsRead: function(callback) {
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
          data: messages,
          success: () => {
            // 触发全局消息更新事件
            this._notifyMessageUpdate(messages);
            if (callback) callback(true);
          }
        });
      },
      fail: () => {
        if (callback) callback(false);
      }
    });
  },

  // 标记任务相关消息为已读
  markTaskMessagesAsRead: function(taskId, callback) {
    if (!taskId) {
      if (callback) callback(false);
      return;
    }
    
    wx.getStorage({
      key: 'messageData',
      success: (res) => {
        let messages = res.data || [];
        let updated = false;
        
        // 更新与此任务相关的消息
        const updatedMessages = messages.map(msg => {
          if (msg.type === 'task' && msg.taskId === taskId && !msg.isRead) {
            updated = true;
            return { ...msg, isRead: true };
          }
          return msg;
        });
        
        if (updated) {
          // 保存更新后的消息
          wx.setStorage({
            key: 'messageData',
            data: updatedMessages,
            success: () => {
              // 触发全局消息更新事件
              this._notifyMessageUpdate(updatedMessages);
              if (callback) callback(true);
            }
          });
        } else if (callback) {
          callback(false);
        }
      },
      fail: () => {
        if (callback) callback(false);
      }
    });
  },
  
  // 获取并处理即将到期任务通知
  getUpcomingTaskNotifications: function(upcomingTasks, callback) {
    // 检查是否需要显示提醒
    if (!upcomingTasks || upcomingTasks.length === 0) {
      if (callback) callback(null, false);
      return;
    }
    
    const now = new Date();
    const firstTask = upcomingTasks[0];
    
    // 获取隐藏状态
    wx.getStorage({
      key: 'upcomingTaskHidden',
      success: (res) => {
        const hiddenState = res.data || {};
        const shouldShow = !hiddenState.isHidden || 
                         (hiddenState.timestamp && (now - hiddenState.timestamp > 3600000)); // 1小时后重新显示
        
        // 检查是否应该显示提醒
        const isNewTask = !hiddenState.taskId || hiddenState.taskId !== firstTask.id;
        
        if (shouldShow || isNewTask) {
          // 为即将到期的任务创建通知
          this.createTaskMessage(firstTask, 'upcoming');
          
          if (callback) {
            callback({
              id: firstTask.id,
              name: firstTask.title || firstTask.name,
              timeRemaining: firstTask.timeRemaining,
              isDismissible: true
            }, true);
          }
        } else {
          if (callback) callback(null, false);
        }
      },
      fail: () => {
        // 如果读取失败，默认显示
        this.createTaskMessage(firstTask, 'upcoming');
        
        if (callback) {
          callback({
            id: firstTask.id,
            name: firstTask.title || firstTask.name,
            timeRemaining: firstTask.timeRemaining,
            isDismissible: true
          }, true);
        }
      }
    });
  },
  
  // 设置即将到期任务为已隐藏
  dismissUpcomingTask: function(taskId, callback) {
    wx.setStorage({
      key: 'upcomingTaskHidden',
      data: {
        isHidden: true,
        taskId: taskId,
        timestamp: Date.now()
      },
      success: () => {
        if (callback) callback(true);
      },
      fail: () => {
        if (callback) callback(false);
      }
    });
  },
  
  // 格式化消息时间显示
  formatMessageTime: function(timestamp) {
    const now = new Date();
    const msgDate = new Date(timestamp);
    const diffMinutes = Math.floor((now - msgDate) / (60 * 1000));
    
    if (diffMinutes < 1) {
      return '刚刚';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}分钟前`;
    } else if (diffMinutes < 24 * 60) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}小时前`;
    } else if (diffMinutes < 30 * 24 * 60) {
      const days = Math.floor(diffMinutes / (24 * 60));
      return `${days}天前`;
    } else {
      const year = msgDate.getFullYear();
      const month = (msgDate.getMonth() + 1).toString().padStart(2, '0');
      const day = msgDate.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
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
        notificationType: 'upcoming',
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
  
  /**
   * 通知消息更新事件（内部方法）
   * @private
   */
  _notifyMessageUpdate: function(messages) {
    // 通知全局事件总线
    const app = getApp();
    if (app.globalData.eventBus) {
      app.globalData.eventBus.emit('messageDataChanged', messages);
    }
  }
};

module.exports = messageManager; 