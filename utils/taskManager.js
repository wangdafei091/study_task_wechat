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
            
            // 确保有积分有效期字段，但不要覆盖已有值
            if (!taskWithoutDifficulty.pointsExpiry) {
              taskWithoutDifficulty.pointsExpiry = 'permanent'; // 默认为永久
              console.log(`[TaskManager] 为任务 ${taskWithoutDifficulty.id} 添加默认积分有效期: permanent`);
            } else {
              console.log(`[TaskManager] 任务 ${taskWithoutDifficulty.id} 已有积分有效期: ${taskWithoutDifficulty.pointsExpiry}`);
            }
            
            if (taskWithoutDifficulty.pointsValidPeriod && !taskWithoutDifficulty.pointsExpiry) {
              // 兼容旧数据，将pointsValidPeriod转换为pointsExpiry
              taskWithoutDifficulty.pointsExpiry = taskWithoutDifficulty.pointsValidPeriod;
              console.log(`[TaskManager] 转换旧格式积分有效期: ${taskWithoutDifficulty.pointsExpiry}`);
            }
            
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
      
      // 对任务进行排序，确保必做任务置顶
      const taskUtils = require('./taskUtils.js');
      const sortedTasks = taskUtils.sortTasks(todayTasks, 'date', true, true);
      
      console.log('[TaskManager] 今日任务筛选结果:', {
        todayTasks: sortedTasks.length,
        tasks: sortedTasks.map(t => ({ 
          id: t.id, 
          title: t.title, 
          date: t.date,
          isRequired: t.isRequired || false
        }))
      });
      
      callback(sortedTasks);
    });
  },
  
  /**
   * 创建任务
   * @param {Object} task 任务对象
   * @param {Function} callback 回调函数，参数为创建的任务
   */
  createTask(task, callback) {
    // 确保任务有id和创建时间
    const newTask = {
      ...task,
      id: `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      createTime: Date.now(),
      modifyTime: Date.now(),
      status: 0, // 默认未完成状态
      pointsExpiry: task.pointsExpiry || 'permanent', // 保留原始任务的积分有效期，默认为永久
      pointsExpiryDate: task.pointsExpiryDate || '' // 保留原始任务的积分有效期日期
    };
    
    console.log('[TaskManager] 创建新任务:', {
      id: newTask.id,
      title: newTask.title,
      type: newTask.type,
      date: newTask.date,
      pointsExpiry: newTask.pointsExpiry // 添加积分有效期到日志
    });
    
    // 检查任务重复设置
    const isRepeating = newTask.repeat && newTask.repeat.type !== 'none';
    console.log(`[TaskManager] 任务是否重复: ${isRepeating}, 重复类型: ${isRepeating ? newTask.repeat.type : 'none'}`);
    
    this.getAllTasks(allTasks => {
      let createdTasks = [];

      // 处理重复任务生成
      if (isRepeating) {
        createdTasks = this._generateRepeatTasks(newTask);
        
        // 添加到任务列表
        allTasks.push(...createdTasks);
        
        console.log(`[TaskManager] 已生成${createdTasks.length}个重复任务实例`);
      } else {
        // 非重复任务直接添加
        allTasks.push(newTask);
        createdTasks.push(newTask);
        
        console.log('[TaskManager] 已添加单次任务');
      }
      
      // 保存任务数据
      this._saveTaskData(allTasks, () => {
        // 触发任务变更事件
        this._onTaskDataChanged(allTasks);
        
        // 创建新任务消息
        const messageManager = require('./messageManager.js');
        messageManager.createTaskMessage(newTask, 'new');
        
        // 使用第一个创建的任务或原始任务作为回调参数
        const taskForCallback = createdTasks.length > 0 ? createdTasks[0] : newTask;
        
        if (callback) {
          console.log(`[TaskManager] 新任务添加成功，ID: ${taskForCallback.id} 标题: ${taskForCallback.title}`);
          callback(taskForCallback);
        }
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
    console.log('[TaskManager] 原始任务积分有效期:', task.pointsExpiry); // 记录原始任务积分有效期
    
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
          const taskInstance = this._createRepeatTaskInstance(task, new Date(date));
          tasks.push(taskInstance);
          // 每10个任务记录一次，避免日志过多
          if (tasks.length % 10 === 1) {
            console.log(`[TaskManager] 创建第${tasks.length}个每日任务，积分有效期: ${taskInstance.pointsExpiry}`);
          }
        }
        break;
        
      case 'weekly':
        // 每周重复
        for (let date = new Date(startDate); date <= effectiveEndDate; date.setDate(date.getDate() + 7)) {
          const taskInstance = this._createRepeatTaskInstance(task, new Date(date));
          tasks.push(taskInstance);
          console.log(`[TaskManager] 创建每周任务，积分有效期: ${taskInstance.pointsExpiry}`);
        }
        break;
        
      case 'workdays':
        // 工作日重复
        for (let date = new Date(startDate); date <= effectiveEndDate; date.setDate(date.getDate() + 1)) {
          const day = date.getDay();
          if (day >= 1 && day <= 5) { // 周一到周五
            const taskInstance = this._createRepeatTaskInstance(task, new Date(date));
            tasks.push(taskInstance);
            // 每10个任务记录一次
            if (tasks.length % 10 === 1) {
              console.log(`[TaskManager] 创建工作日任务，积分有效期: ${taskInstance.pointsExpiry}`);
            }
          }
        }
        break;
        
      case 'weekends':
        // 休息日重复（周六和周日）
        console.log('[TaskManager] 处理休息日重复任务，筛选周六和周日');
        for (let date = new Date(startDate); date <= effectiveEndDate; date.setDate(date.getDate() + 1)) {
          const day = date.getDay();
          if (day === 0 || day === 6) { // 周日或周六
            const taskInstance = this._createRepeatTaskInstance(task, new Date(date));
            tasks.push(taskInstance);
            console.log(`[TaskManager] 创建休息日任务，积分有效期: ${taskInstance.pointsExpiry}`);
          }
        }
        break;
        
      case 'custom':
        // 自定义重复
        console.log('[TaskManager] 处理自定义重复任务，选定的星期几:', task.repeat.days);
        
        // 确保days数组中的元素都是字符串类型，统一处理
        const daysArray = task.repeat.days.map(day => day.toString());
        console.log('[TaskManager] 转换后的星期几数组(字符串类型):', daysArray);
        
        for (let date = new Date(startDate); date <= effectiveEndDate; date.setDate(date.getDate() + 1)) {
          // 获取当前日期的星期几（0-6）
          const dayOfWeek = date.getDay();
          // 确保数据类型一致：将dayOfWeek转为字符串
          const dayOfWeekStr = dayOfWeek.toString();
          
          // 检查当前日期的星期几是否在用户选择的星期几数组中
          const isMatch = daysArray.includes(dayOfWeekStr);
          
          // 详细日志记录匹配过程
          console.log(`[TaskManager] 检查日期 ${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}, 星期${dayOfWeek}, 是否匹配: ${isMatch}, 用户选择的日期: ${JSON.stringify(daysArray)}`);
          
          if (isMatch) {
            const taskInstance = this._createRepeatTaskInstance(task, new Date(date));
            tasks.push(taskInstance);
            console.log(`[TaskManager] 创建自定义重复任务，星期${dayOfWeek}，积分有效期: ${taskInstance.pointsExpiry}`);
          }
        }
        
        // 如果没有生成任何任务，记录警告
        if (tasks.length === 0) {
          console.warn('[TaskManager] ⚠️ 警告: 未能生成任何重复任务! 请检查日期匹配条件');
        }
        break;
    }
    
    console.log('[TaskManager] 生成重复任务完成，共生成:', tasks.length, '个任务');
    return tasks;
  },
  
  /**
   * 创建重复任务实例
   * @param {Object} originalTask 原始任务对象
   * @param {Date} date 新任务的日期
   * @returns {Object} 新创建的任务实例
   */
  _createRepeatTaskInstance(originalTask, date) {
    // 生成日期字符串 YYYY-MM-DD
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    
    // 创建任务副本，避免直接修改原始任务
    const taskInstance = {
      ...originalTask,
      id: `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      date: dateStr,
      createTime: Date.now(),
      modifyTime: Date.now(),
      // 确保保留原始任务的积分有效期
      pointsExpiry: originalTask.pointsExpiry || 'permanent',
      pointsExpiryDate: originalTask.pointsExpiryDate || ''
    };
    
    console.log(`[TaskManager] 创建重复任务实例: ${dateStr}，积分有效期: ${taskInstance.pointsExpiry}`);
    
    return taskInstance;
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
      let oldStatus = null;
      
      // 更新任务状态
      const updatedTasks = allTasks.map(task => {
        if (task.id === taskId) {
          oldStatus = task.status;
          // 为已完成任务添加完成记录
          const newTask = { ...task, status: status };
          
          // 当非必做任务状态变为已完成时，添加完成记录和积分奖励
          if (status === 1 && !task.isRequired) {
            console.log(`[TaskManager] 非必做任务 ${task.title} 已完成，添加奖励积分: ${task.rewardPoints}`);
            
            // 获取当前日期时间
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
            
            // 初始化completionRecords数组(如果不存在)
            if (!newTask.completionRecords) {
              newTask.completionRecords = [];
            }
            
            // 添加完成记录
            newTask.completionRecords.push({
              date: dateStr,
              timestamp: now.getTime(),
              notes: ''
            });
            
            // 计算积分有效期（完成日期+7天）
            const expiryDate = new Date(now);
            expiryDate.setDate(expiryDate.getDate() + 7);
            const expiryDateStr = `${expiryDate.getMonth() + 1}月${expiryDate.getDate()}日`;
            
            // 设置积分有效期
            newTask.pointsExpiry = expiryDate.getTime();
            newTask.pointsExpiryDate = expiryDateStr;
            
            console.log(`[TaskManager] 任务 ${newTask.title} 已完成，设置积分有效期: ${expiryDateStr}`);
            
            // 更新用户积分
            const userPoints = wx.getStorageSync('userPoints') || 0;
            const newPoints = userPoints + (newTask.rewardPoints || 0);
            wx.setStorageSync('userPoints', newPoints);
            
            // 创建奖励消息
            const messageManager = require('./messageManager.js');
            messageManager.createSystemMessage(
              `完成任务"${newTask.title}"，获得${newTask.rewardPoints}积分`,
              'reward'
            );
          }
          // 处理必做任务从pending变为overdue或canceled时的扣分逻辑
          else if (task.isRequired && 
                  oldStatus === 0 && 
                  (status === 2 || status === 3)) { // 0=pending, 2=overdue, 3=canceled
            
            const penaltyPoints = task.rewardPoints || 0;
            console.log(`[TaskManager] 必做任务 ${task.title} 未完成，扣除积分: ${penaltyPoints}`);
            
            if (penaltyPoints > 0) {
              // 获取用户积分
              const userPoints = wx.getStorageSync('userPoints') || 0;
              // 扣除积分
              wx.setStorageSync('userPoints', Math.max(0, userPoints - penaltyPoints));
              
              // 创建扣分通知
              const messageManager = require('./messageManager.js');
              messageManager.createSystemMessage(
                `任务"${task.title}"未完成，扣除${penaltyPoints}积分`,
                'penalty'
              );
            }
          }
          
          updatedTask = newTask;
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
    if (!taskId) {
      console.error('[TaskManager] 删除任务失败: 任务ID为空');
      if (callback) callback(false);
      return;
    }
    
    console.log(`[TaskManager] 开始删除任务: ${taskId}`);
    
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
          console.log(`[TaskManager] 删除任务相关消息: ${taskId}`);
          
          messageManager.removeTaskMessages(taskId, {
            success: (count) => {
              console.log(`[TaskManager] 成功删除任务相关消息: ${count}条`);
              if (callback) callback(true);
            },
            fail: (error) => {
              console.error(`[TaskManager] 删除任务相关消息失败: ${error}`);
              // 即使消息删除失败，任务删除成功，仍然返回成功
              if (callback) callback(true);
            }
          });
        });
      } else {
        console.error('[TaskManager] 未找到要删除的任务:', taskId);
        if (callback) callback(false);
      }
    });
  },
  
  /**
   * 检查即将到期的任务
   * @param {Function} callback 回调函数，参数为即将到期的任务数组
   */
  checkUpcomingTasks(callback) {
    this.getTodayTasks(todayTasks => {
      const now = new Date();
      const upcomingTasks = [];
      
      console.log('[TaskManager] 检查即将到期任务, 当前任务数:', todayTasks.length);
      
      // 筛选未完成且有截止时间的任务
      todayTasks.forEach(task => {
        if (task.status === 0 && task.date) {
          try {
            // 确保任务有开始时间，没有则使用默认值
            const startTime = task.startTime || '08:00';
            
            // 创建任务日期时间对象
            const taskTime = new Date(`${task.date}T${startTime}`);
            
            // 计算时间差（小时）
            const diffHours = (taskTime - now) / (1000 * 60 * 60);
            
            // 处理提醒时间
            let shouldRemind = false;
            if (task.reminder && task.reminder.enabled) {
              const reminderTime = this.calculateReminderTime(task);
              if (reminderTime) {
                // 检查当前时间是否在提醒时间附近（正负10分钟内）
                const timeDiff = Math.abs(reminderTime - now) / (1000 * 60);
                shouldRemind = timeDiff <= 10;
                
                console.log(`[TaskManager] 任务"${task.title}"提醒时间差: ${timeDiff.toFixed(1)}分钟, 是否提醒: ${shouldRemind}`);
              }
            }
            
            // 必做任务有更高的提醒优先级
            if (task.isRequired) {
              // 对必做任务，时间窗口扩大到36小时
              shouldRemind = shouldRemind || (diffHours > 0 && diffHours < 36);
              console.log(`[TaskManager] 必做任务"${task.title}"将在${diffHours.toFixed(1)}小时后到期`);
            }
            
            // 只考虑未来24小时内的任务或需要提醒的任务
            if ((diffHours > 0 && diffHours < 24) || shouldRemind) {
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
          // 为必做任务创建特殊提醒
          if (task.isRequired) {
            messageManager.createTaskMessage(task, 'required');
            console.log(`[TaskManager] 创建了必做任务提醒: ${task.title}`);
          } else {
            messageManager.createTaskMessage(task, 'upcoming');
          }
        });
        
        console.log('[TaskManager] 创建了即将到期任务提醒:', upcomingTasks.length);
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
          study: 0,
          interest: 0
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
            study: 0,
            interest: 0
          }
        }
      };
      
      if (callback) callback(emptyStats);
      return emptyStats;
    }
    
    // 按类型统计任务
    const typeCounts = {
      total: { habit: 0, study: 0, interest: 0 },
      completed: { habit: 0, study: 0, interest: 0 }
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
        : 0,
      interest: typeCounts.total.interest > 0 
        ? Math.round(typeCounts.completed.interest / typeCounts.total.interest * 100) 
        : 0
    };
    
    console.log('[TaskManager] 计算任务进度:', {
      typeCounts: typeCounts,
      progress: progress
    });
    
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
          study: typeCounts.total.study,
          interest: typeCounts.total.interest
        }
      }
    };
    
    if (callback) callback(result);
    return result;
  },
  
  /**
   * 保存任务数据到本地存储
   * @param {Array} tasks 任务数组
   * @param {Function} callback 回调函数
   * @private
   */
  _saveTaskData(tasks, callback) {
    console.log('[TaskManager] 准备保存任务数据，共'+tasks.length+'条任务记录');
    
    // 更新全局数据
    const app = getApp();
    app.globalData.tasks = tasks;
    console.log('[TaskManager] 已更新全局任务数据');
    
    // 保存到本地存储
    wx.setStorage({
      key: 'taskData',
      data: tasks,
      success: () => {
        console.log('[TaskManager] 任务数据保存成功，数据已同步到存储');
        
        // 触发任务数据更新事件
        this._onTaskDataChanged(tasks);
        
        // 执行回调
        if (callback) {
          console.log('[TaskManager] 执行保存后回调');
          callback(tasks);
        }
      },
      fail: (error) => {
        console.error('[TaskManager] 任务数据保存失败:', error);
        if (callback) callback(tasks);
      }
    });
  },
  
  /**
   * 触发任务数据变更事件
   * @param {Array} tasks 任务数组
   * @private
   */
  _onTaskDataChanged(tasks) {
    console.log('[TaskManager] 触发任务数据变更事件，当前任务数量:', tasks.length);
    
    // 获取全局事件总线
    const app = getApp();
    if (app.globalData.eventBus) {
      console.log('[TaskManager] 通过事件总线广播任务数据变更');
      
      // 触发数据变更事件
      app.globalData.eventBus.emit('taskDataChanged', {
        tasks: tasks,
        count: tasks.length,
        timestamp: Date.now()
      });
    }
  },
  
  /**
   * 计算提醒时间
   * @param {Object} task 任务对象
   * @returns {Date|null} 提醒时间，如果不需要提醒则返回null
   */
  calculateReminderTime: function(task) {
    if (!task || !task.reminder || !task.reminder.enabled) {
      return null;
    }
    
    try {
      // 创建任务日期时间对象
      const taskDate = new Date(`${task.date}T${task.startTime || '08:00'}`);
      
      // 特殊处理提前一天晚上8点的情况
      if (task.reminder.time === -1) {
        console.log(`[TaskManager] 处理特殊提醒类型: 提前1天(晚上8点), 任务:`, task.title);
        // 提前一天
        const reminderDate = new Date(taskDate.getTime() - 24 * 60 * 60 * 1000);
        // 设置为晚上8点
        reminderDate.setHours(20, 0, 0, 0);
        return reminderDate;
      } else {
        // 标准处理：提前X分钟提醒
        return new Date(taskDate.getTime() - task.reminder.time * 60 * 1000);
      }
    } catch (error) {
      console.error('[TaskManager] 计算提醒时间出错:', error, task);
      return null;
    }
  },
  
  /**
   * 标记任务为必做任务
   * @param {String} taskId 任务ID
   * @param {Function} callback 回调函数
   */
  markTaskAsRequired: function(taskId, callback) {
    console.log(`[taskManager] 标记必做任务: ${taskId}`);
    
    this.getAllTasks(allTasks => {
      const taskIndex = allTasks.findIndex(t => t.id === taskId);
      
      if (taskIndex !== -1) {
        // 设置必做任务属性
        allTasks[taskIndex].isRequired = true;
        allTasks[taskIndex].penaltyApplied = false;
        
        // 保存更新后的任务数据
        this._saveTaskData(allTasks, () => {
          // 触发任务变更事件
          this._onTaskDataChanged(allTasks);
          
          if (callback) callback(null, allTasks[taskIndex]);
        });
      } else {
        console.error(`[taskManager] 标记必做任务失败: 找不到任务 ${taskId}`);
        if (callback) callback(new Error('任务不存在'), null);
      }
    });
  },
  
  /**
   * 取消标记必做任务
   * @param {String} taskId 任务ID
   * @param {Function} callback 回调函数
   */
  unmarkTaskAsRequired: function(taskId, callback) {
    console.log(`[taskManager] 取消标记必做任务: ${taskId}`);
    
    this.getAllTasks(allTasks => {
      const taskIndex = allTasks.findIndex(t => t.id === taskId);
      
      if (taskIndex !== -1) {
        // 移除必做任务属性
        allTasks[taskIndex].isRequired = false;
        allTasks[taskIndex].penaltyApplied = false;
        
        // 保存更新后的任务数据
        this._saveTaskData(allTasks, () => {
          // 触发任务变更事件
          this._onTaskDataChanged(allTasks);
          
          if (callback) callback(null, allTasks[taskIndex]);
        });
      } else {
        console.error(`[taskManager] 取消标记必做任务失败: 找不到任务 ${taskId}`);
        if (callback) callback(new Error('任务不存在'), null);
      }
    });
  },
  
  /**
   * 检查必做任务并应用惩罚
   * 针对过期且未完成的必做任务应用惩罚
   * @param {Function} callback 回调函数
   */
  checkRequiredTasks: function(callback) {
    console.log(`[taskManager] 开始检查必做任务`);
    
    this.getAllTasks(allTasks => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
      const penaltyTasks = [];
      let updated = false;
      
      allTasks.forEach(task => {
        // 找出已过期、未完成、标记为必做且未应用惩罚的任务
        if (task.isRequired && 
            task.status === 0 && 
            task.date < todayStr && 
            !task.penaltyApplied) {
          
          // 标记已应用惩罚
          task.penaltyApplied = true;
          task.status = 'overdue';
          updated = true;
          
          // 记录需要扣除积分的任务
          penaltyTasks.push({
            taskId: task.id,
            title: task.title,
            points: 5  // 固定惩罚积分为5
          });
          
          console.log(`[taskManager] 应用惩罚: ${task.id}, 任务: ${task.title}`);
        }
      });
      
      // 如果有任务更新，保存数据
      if (updated) {
        this._saveTaskData(allTasks, () => {
          // 触发任务变更事件
          this._onTaskDataChanged(allTasks);
          
          // 处理积分扣除
          if (penaltyTasks.length > 0) {
            this._applyPenalties(penaltyTasks, callback);
          } else if (callback) {
            callback(null, []);
          }
        });
      } else if (callback) {
        callback(null, []);
      }
    });
  },
  
  /**
   * 应用惩罚，扣除积分
   * @param {Array} penaltyTasks 需要扣除积分的任务数组
   * @param {Function} callback 回调函数
   * @private
   */
  _applyPenalties: function(penaltyTasks, callback) {
    console.log(`[taskManager] 开始应用惩罚，任务数量: ${penaltyTasks.length}`);
    
    // 获取现有积分
    wx.getStorage({
      key: 'points',
      success: (res) => {
        let currentPoints = res.data || 0;
        const totalPenalty = penaltyTasks.reduce((sum, task) => sum + task.points, 0);
        
        // 确保积分不会变为负数
        const newPoints = Math.max(0, currentPoints - totalPenalty);
        console.log(`[taskManager] 积分扣除: ${currentPoints} -> ${newPoints}, 扣除: ${totalPenalty}`);
        
        // 更新积分
        wx.setStorage({
          key: 'points',
          data: newPoints,
          success: () => {
            // 为每个任务创建惩罚消息
            const messageManager = require('./messageManager.js');
            
            penaltyTasks.forEach(task => {
              const penaltyMessage = {
                id: 'msg_penalty_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                type: 'penalty',
                taskId: task.taskId,
                title: '任务未完成',
                summary: `必做任务"${task.title}"未完成，扣除${task.points}积分`,
                timestamp: Date.now(),
                isRead: false,
                icon: '⚠️'
              };
              
              messageManager.addMessage(penaltyMessage);
            });
            
            if (callback) callback(null, penaltyTasks);
          },
          fail: (error) => {
            console.error(`[taskManager] 更新积分失败: ${error}`);
            if (callback) callback(error, null);
          }
        });
      },
      fail: (error) => {
        console.error(`[taskManager] 获取积分失败: ${error}`);
        if (callback) callback(error, null);
      }
    });
  },
};

module.exports = taskManager; 