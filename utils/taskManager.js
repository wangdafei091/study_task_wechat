/**
 * taskManager.js - 任务管理工具类
 * 
 * 提供统一的任务管理功能，包括任务的CRUD操作和数据同步
 */

const taskManager = {
  /**
   * 获取所有任务
   * @param {Function} callback 回调函数，参数为任务数组
   */
  getAllTasks(callback) {
    wx.getStorage({
      key: 'taskData',
      success: (res) => {
        if (res.data && res.data.length > 0) {
          // 确保每个学习类任务都有开始时间和结束时间
          const allTasks = res.data.map(task => {
            // 移除难度字段
            const { difficulty, ...taskWithoutDifficulty } = task;
            
            if (taskWithoutDifficulty.type === 'study') {
              // 如果没有开始时间，设置默认值
              if (!taskWithoutDifficulty.startTime) {
                taskWithoutDifficulty.startTime = '08:00';
              }
              // 如果没有结束时间，根据开始时间和持续时间计算
              if (!taskWithoutDifficulty.endTime && taskWithoutDifficulty.duration) {
                const [hours, minutes] = taskWithoutDifficulty.startTime.split(':').map(Number);
                let endMinutes = minutes + taskWithoutDifficulty.duration;
                let endHours = hours + Math.floor(endMinutes / 60);
                endMinutes = endMinutes % 60;
                taskWithoutDifficulty.endTime = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
              }
              // 计算持续时间
              if (taskWithoutDifficulty.startTime && taskWithoutDifficulty.endTime) {
                const [startHours, startMinutes] = taskWithoutDifficulty.startTime.split(':').map(Number);
                const [endHours, endMinutes] = taskWithoutDifficulty.endTime.split(':').map(Number);
                const startTotalMinutes = startHours * 60 + startMinutes;
                const endTotalMinutes = endHours * 60 + endMinutes;
                taskWithoutDifficulty.duration = endTotalMinutes - startTotalMinutes;
              }
            }
            return taskWithoutDifficulty;
          });
          
          // 回调返回所有任务
          callback(allTasks);
          
          // 同时更新全局数据
          const app = getApp();
          app.globalData.tasks = allTasks;
        } else {
          callback([]);
        }
      },
      fail: () => {
        // 如果读取失败，返回空数组
        callback([]);
      }
    });
  },
  
  /**
   * 获取今日任务
   * @param {Function} callback 回调函数，参数为今日任务数组
   */
  getTodayTasks(callback) {
    this.getAllTasks(allTasks => {
      // 获取今天的日期字符串，确保格式一致（YYYY-MM-DD）
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
      
      console.log('[TaskManager] 获取今日任务:', {
        today: todayStr,
        totalTasks: allTasks.length
      });
      
      // 筛选今天的任务
      const todayTasks = allTasks.filter(task => {
        if (!task.date) return false;
        
        // 如果是重复任务，检查是否匹配今天的日期
        if (task.repeat && task.repeat.type !== 'none') {
          const taskDate = new Date(task.date);
          const taskDateStr = `${taskDate.getFullYear()}-${(taskDate.getMonth() + 1).toString().padStart(2, '0')}-${taskDate.getDate().toString().padStart(2, '0')}`;
          return taskDateStr === todayStr;
        }
        
        return task.date === todayStr;
      });
      
      console.log('[TaskManager] 今日任务筛选结果:', {
        todayTasks: todayTasks.length,
        tasks: todayTasks.map(t => ({ id: t.id, title: t.title, date: t.date }))
      });
      
      callback(todayTasks);
    });
  },
  
  /**
   * 创建新任务
   * @param {Object} task 任务对象
   * @param {Function} callback 回调函数，参数为创建后的任务
   */
  createTask(task, callback) {
    // 确保任务有id和创建时间
    const now = Date.now();
    const newTask = {
      ...task,
      id: task.id || 'task_' + now + '_' + Math.floor(Math.random() * 1000),
      createTime: task.createTime || now
    };
    
    this.getAllTasks(allTasks => {
      if (task.repeat && task.repeat.type !== 'none') {
        // 处理周期性任务
        const repeatTasks = this._generateRepeatTasks(newTask);
        allTasks.push(...repeatTasks);
      } else {
        // 添加单次任务
        allTasks.push(newTask);
      }
      
      // 保存任务数据
      this._saveTaskData(allTasks, () => {
        // 触发任务变更事件
        this._onTaskDataChanged(allTasks);
        
        // 创建新任务消息
        const messageManager = require('./messageManager.js');
        messageManager.createTaskMessage(newTask, 'new');
        
        if (callback) callback(newTask);
      });
    });
  },
  
  /**
   * 生成重复任务
   * @param {Object} task 原始任务对象
   * @returns {Array} 生成的重复任务数组
   */
  _generateRepeatTasks(task) {
    console.log('[TaskManager] 开始生成重复任务:', task.title);
    const tasks = [];
    const startDate = new Date(task.repeat.startDate);
    const endDate = task.repeat.endDate ? new Date(task.repeat.endDate) : null;
    
    // 添加时间限制：最多生成未来365天的任务
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 365);
    const effectiveEndDate = endDate ? (endDate > maxDate ? maxDate : endDate) : maxDate;
    
    // 确保开始日期不早于今天
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate < today) {
      console.log('[TaskManager] 开始日期早于今天，调整为今天');
      startDate.setTime(today.getTime());
    }
    
    console.log('[TaskManager] 任务时间范围:', {
      start: startDate.toISOString(),
      end: effectiveEndDate.toISOString(),
      type: task.repeat.type
    });
    
    // 根据重复类型生成任务
    switch (task.repeat.type) {
      case 'daily':
        // 每天重复
        for (let date = new Date(startDate); date <= effectiveEndDate; date.setDate(date.getDate() + 1)) {
          tasks.push(this._createRepeatTaskInstance(task, new Date(date)));
        }
        break;
        
      case 'weekly':
        // 每周重复
        for (let date = new Date(startDate); date <= effectiveEndDate; date.setDate(date.getDate() + 7)) {
          tasks.push(this._createRepeatTaskInstance(task, new Date(date)));
        }
        break;
        
      case 'workdays':
        // 工作日重复
        for (let date = new Date(startDate); date <= effectiveEndDate; date.setDate(date.getDate() + 1)) {
          const day = date.getDay();
          if (day >= 1 && day <= 5) { // 周一到周五
            tasks.push(this._createRepeatTaskInstance(task, new Date(date)));
          }
        }
        break;
        
      case 'custom':
        // 自定义重复
        for (let date = new Date(startDate); date <= effectiveEndDate; date.setDate(date.getDate() + 1)) {
          const day = date.getDay().toString();
          if (task.repeat.days.includes(day)) {
            tasks.push(this._createRepeatTaskInstance(task, new Date(date)));
          }
        }
        break;
    }
    
    console.log('[TaskManager] 生成重复任务完成，共生成:', tasks.length, '个任务');
    return tasks;
  },
  
  /**
   * 创建重复任务实例
   * @param {Object} originalTask 原始任务
   * @param {Date} date 任务日期
   * @returns {Object} 新的任务实例
   */
  _createRepeatTaskInstance(originalTask, date) {
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    
    return {
      ...originalTask,
      id: `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      date: dateStr,
      createTime: Date.now(),
      parentTaskId: originalTask.id, // 记录原始任务ID
      status: 0 // 新创建的任务默认未完成
    };
  },
  
  /**
   * 更新任务状态
   * @param {String} taskId 任务ID
   * @param {Number} status 新状态(0=未完成, 1=已完成)
   * @param {Function} callback 回调函数，参数为更新后的任务
   */
  updateTaskStatus(taskId, status, callback) {
    this.getAllTasks(allTasks => {
      let updatedTask = null;
      
      // 更新任务状态
      const updatedTasks = allTasks.map(task => {
        if (task.id === taskId) {
          updatedTask = { ...task, status: status };
          return updatedTask;
        }
        return task;
      });
      
      if (updatedTask) {
        // 保存任务数据
        this._saveTaskData(updatedTasks, () => {
          // 触发任务变更事件
          this._onTaskDataChanged(updatedTasks);
          
          // 创建任务完成消息(如果状态变为已完成)
          if (status === 1) {
            const messageManager = require('./messageManager.js');
            messageManager.createTaskMessage(updatedTask, 'completed');
          }
          
          if (callback) callback(updatedTask);
        });
      } else if (callback) {
        callback(null);
      }
    });
  },
  
  /**
   * 编辑任务
   * @param {String} taskId 任务ID
   * @param {Object} taskData 更新的任务数据
   * @param {Function} callback 回调函数，参数为更新后的任务
   */
  editTask(taskId, taskData, callback) {
    this.getAllTasks(allTasks => {
      let updatedTask = null;
      
      // 更新任务数据
      const updatedTasks = allTasks.map(task => {
        if (task.id === taskId) {
          updatedTask = { 
            ...task, 
            ...taskData,
            updateTime: Date.now() 
          };
          return updatedTask;
        }
        return task;
      });
      
      if (updatedTask) {
        // 保存任务数据
        this._saveTaskData(updatedTasks, () => {
          // 触发任务变更事件
          this._onTaskDataChanged(updatedTasks);
          
          // 创建任务编辑消息
          const messageManager = require('./messageManager.js');
          messageManager.createTaskMessage(updatedTask, 'edited');
          
          if (callback) callback(updatedTask);
        });
      } else if (callback) {
        callback(null);
      }
    });
  },
  
  /**
   * 删除任务
   * @param {String} taskId 任务ID
   * @param {Function} callback 回调函数，参数为布尔值表示是否成功
   */
  deleteTask(taskId, callback) {
    this.getAllTasks(allTasks => {
      // 过滤掉要删除的任务
      const updatedTasks = allTasks.filter(task => task.id !== taskId);
      
      // 如果任务数量减少，说明删除成功
      if (updatedTasks.length < allTasks.length) {
        // 保存任务数据
        this._saveTaskData(updatedTasks, () => {
          // 触发任务变更事件
          this._onTaskDataChanged(updatedTasks);
          
          // 删除与任务相关的消息
          const messageManager = require('./messageManager.js');
          messageManager.removeTaskMessages(taskId);
          
          if (callback) callback(true);
        });
      } else if (callback) {
        callback(false);
      }
    });
  },
  
  /**
   * 检查即将到期任务
   * @param {Function} callback 回调函数，参数为即将到期的任务数组
   */
  checkUpcomingTasks(callback) {
    this.getTodayTasks(todayTasks => {
      const now = new Date();
      const upcomingTasks = [];
      
      // 筛选未完成且有截止时间的任务
      todayTasks.forEach(task => {
        if (task.status === 0 && task.date) {
          // 确保任务有开始时间，没有则使用默认值
          const startTime = task.startTime || '08:00';
          
          try {
            // 创建任务日期时间对象
            const taskTime = new Date(`${task.date}T${startTime}`);
            
            // 计算时间差（小时）
            const diffHours = (taskTime - now) / (1000 * 60 * 60);
            
            // 只考虑未来24小时内的任务
            if (diffHours > 0 && diffHours < 24) {
              upcomingTasks.push({
                ...task,
                timeRemaining: Math.round(diffHours * 10) / 10 // 保留一位小数
              });
            }
          } catch (error) {
            console.error('解析任务日期时间出错:', error, task);
          }
        }
      });
      
      // 按剩余时间排序
      upcomingTasks.sort((a, b) => a.timeRemaining - b.timeRemaining);
      
      // 为即将到期的任务创建通知
      if (upcomingTasks.length > 0) {
        const messageManager = require('./messageManager.js');
        upcomingTasks.forEach(task => {
          messageManager.createTaskMessage(task, 'upcoming');
        });
      }
      
      if (callback) callback(upcomingTasks);
    });
  },
  
  /**
   * 计算任务进度统计
   * @param {Array} tasks 任务数组
   * @param {Function} callback 回调函数，参数为统计结果对象
   */
  calculateTaskProgress(tasks, callback) {
    // 处理空任务列表情况
    if (!tasks || tasks.length === 0) {
      const emptyStats = {
        taskProgress: {
          habit: 0,
          study: 0
        },
        rewardProgress: {
          current: 0,
          total: 1
        },
        stats: {
          totalTasks: 0,
          completedTasks: 0,
          completionRate: 0,
          streak: 0,
          typeCounts: {
            habit: 0,
            sthabitudy: 0
          }
        }
      };
      
      if (callback) callback(emptyStats);
      return emptyStats;
    }
    
    // 按类型统计任务
    const typeCounts = {
      total: { habit: 0, study: 0 },
      completed: { habit: 0, study: 0 }
    };
    
    tasks.forEach(task => {
      if (typeCounts.total.hasOwnProperty(task.type)) {
        typeCounts.total[task.type]++;
        
        if (task.status === 1) {
          typeCounts.completed[task.type]++;
        }
      }
    });
    
    // 计算各类型完成率
    const progress = {
      habit: typeCounts.total.habit > 0 
        ? Math.round(typeCounts.completed.habit / typeCounts.total.habit * 100) 
        : 0,
      study: typeCounts.total.study > 0 
        ? Math.round(typeCounts.completed.study / typeCounts.total.study * 100) 
        : 0
    };
    
    // 计算总体统计数据
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => task.status === 1).length;
    const completionRate = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0;
    
    // 生成统计结果
    const result = {
      taskProgress: progress,
      rewardProgress: {
        current: completedTasks,
        total: totalTasks > 0 ? totalTasks : 1
      },
      stats: {
        totalTasks: totalTasks,
        completedTasks: completedTasks,
        completionRate: completionRate,
        streak: 0, // 需要另外计算连续完成天数
        typeCounts: {
          habit: typeCounts.total.habit,
          study: typeCounts.total.study
        }
      }
    };
    
    if (callback) callback(result);
    return result;
  },
  
  /**
   * 保存任务数据（内部方法）
   * @private
   */
  _saveTaskData(tasks, callback) {
    // 防抖处理：避免频繁存储操作
    if (this._savePending) {
      clearTimeout(this._savePending);
    }
    
    this._savePending = setTimeout(() => {
      // 更新全局任务数据
      const app = getApp();
      app.globalData.tasks = tasks;
      
      // 存储到本地
      wx.setStorage({
        key: 'taskData',
        data: tasks,
        success: () => {
          console.log('任务数据保存成功');
          if (callback) callback();
        },
        fail: (error) => {
          console.error('保存任务数据失败：', error);
          if (callback) callback();
        },
        complete: () => {
          this._savePending = null;
        }
      });
    }, 300); // 300ms防抖
  },
  
  /**
   * 任务数据变更事件处理（内部方法）
   * @private
   */
  _onTaskDataChanged(tasks) {
    // 通知全局事件总线
    const app = getApp();
    if (app.globalData.eventBus) {
      app.globalData.eventBus.emit('taskDataChanged', tasks);
    }
  }
};

module.exports = taskManager; 