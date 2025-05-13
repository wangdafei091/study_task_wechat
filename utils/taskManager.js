/**
 * taskManager.js - 任务管理工具类
 * 
 * 提供统一的任务管理功能，包括任务的CRUD操作和数据同步
 */

const dateUtils = require('./dateUtils.js');
const Constants = require('./constants.js');
const pointsManager = require('./pointsManager.js'); // 统一引入星星管理工具
const logger = require('./logger.js'); // 引入统一日志工具
const storageUtils = require('./storageUtils.js'); // 引入统一存储工具
const batchUtils = require('./batchUtils.js'); // 引入批量处理工具

const taskManager = {
  /**
   * 获取所有任务
   * @param {Function} callback 回调函数，参数为任务数组
   */
  getAllTasks(callback) {
    storageUtils.getAsync('taskData', [])
      .then(data => {
        const allTasks = [];
        
        if (data && data.length > 0) {
          // 确保每个学习类任务都有开始时间和结束时间
          data.forEach(task => {
            // 移除难度字段
            const { difficulty, ...taskWithoutDifficulty } = task;
            
            // 确保有积分有效期字段，但不要覆盖已有值
            if (!taskWithoutDifficulty.pointsExpiry) {
              taskWithoutDifficulty.pointsExpiry = 'permanent'; // 默认为永久
              logger.info('taskManager', `为任务 ${taskWithoutDifficulty.id} 添加默认积分有效期: permanent`);
            }
            
            if (taskWithoutDifficulty.pointsValidPeriod && !taskWithoutDifficulty.pointsExpiry) {
              // 兼容旧数据，将pointsValidPeriod转换为pointsExpiry
              taskWithoutDifficulty.pointsExpiry = taskWithoutDifficulty.pointsValidPeriod;
              logger.info('taskManager', `转换旧格式积分有效期: ${taskWithoutDifficulty.pointsExpiry}`);
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
            
            allTasks.push(taskWithoutDifficulty);
          });
          
          // 回调返回所有任务
          if (typeof callback === 'function') {
            callback(allTasks);
          }
          
          // 同时更新全局数据
          const app = getApp();
          if (app && app.globalData) {
            app.globalData.tasks = allTasks;
          }
        } else {
          if (typeof callback === 'function') {
            callback([]);
          }
        }
      })
      .catch(err => {
        logger.error('taskManager', '获取任务数据失败', err);
        if (typeof callback === 'function') {
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
      
      logger.info('taskManager', '获取今日任务', {
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
      
      // 使用新的排序逻辑：习惯优先+开始时间顺序
      const taskUtils = require('./taskUtils.js');
      const sortedTasks = taskUtils.sortTasksByHabitAndTime(todayTasks);
      
      logger.info('taskManager', '今日任务筛选结果', {
        todayTasks: sortedTasks.length,
        tasks: sortedTasks.map(t => ({ 
          id: t.id, 
          title: t.title, 
          date: t.date,
          type: t.type,
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
    
    logger.info('taskManager', '创建新任务', {
      id: newTask.id,
      title: newTask.title,
      type: newTask.type,
      date: newTask.date,
      pointsExpiry: newTask.pointsExpiry
    });
    
    // 检查任务重复设置
    const isRepeating = newTask.repeat && newTask.repeat.type !== 'none';
    logger.info('taskManager', `任务是否重复: ${isRepeating}, 重复类型: ${isRepeating ? newTask.repeat.type : 'none'}`);
    
    // 验证并修复重复任务配置
    if (isRepeating) {
      logger.info('taskManager', `原始重复任务配置: ${JSON.stringify(newTask.repeat)}`);
      logger.info('taskManager', `任务是否设置无结束日期: ${newTask.hasNoEndDate === true ? '是' : '否'}`);
      
      // 确保开始日期存在
      if (!newTask.repeat.startDate) {
        newTask.repeat.startDate = newTask.date;
        logger.info('taskManager', `修复：设置重复任务开始日期为任务日期 ${newTask.date}`);
      }
      
      // 仅当无结束日期标志为true或结束日期无效时，才应用默认值
      if (newTask.hasNoEndDate === true || 
          !newTask.repeat.endDate || 
          new Date(newTask.repeat.endDate) < new Date(newTask.repeat.startDate)) {
        
        logger.info('taskManager', `需要设置默认结束日期: ${newTask.hasNoEndDate ? '无结束日期模式' : '结束日期无效'}, 当前值: ${newTask.repeat.endDate}`);
        
        // 如果未设置结束日期，对于daily类型默认设置为90天后
        if (newTask.repeat.type === 'daily') {
          const endDate = new Date(newTask.repeat.startDate);
          endDate.setDate(endDate.getDate() + 90);
          newTask.repeat.endDate = `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')}`;
          logger.info('taskManager', `设置默认结束日期(90天): ${newTask.repeat.endDate}`);
        } else {
          // 其他类型设置为30天后
          const endDate = new Date(newTask.repeat.startDate);
          endDate.setDate(endDate.getDate() + 30);
          newTask.repeat.endDate = `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')}`;
          logger.info('taskManager', `设置默认结束日期(30天): ${newTask.repeat.endDate}`);
        }
      } else {
        logger.info('taskManager', `使用用户设置的结束日期: ${newTask.repeat.endDate}`);
      }
      
      logger.info('taskManager', `最终重复任务配置: ${JSON.stringify(newTask.repeat)}`);
    }
    
    this.getAllTasks(allTasks => {
      let createdTasks = [];

      // 处理重复任务生成
      if (isRepeating) {
        createdTasks = this._generateRepeatTasks(newTask);
        
        // 添加到任务列表
        allTasks.push(...createdTasks);
        
        logger.info('taskManager', `已生成${createdTasks.length}个重复任务实例`);
      } else {
        // 非重复任务直接添加
        allTasks.push(newTask);
        createdTasks.push(newTask);
        
        logger.info('taskManager', '已添加单次任务');
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
          logger.info('taskManager', `新任务添加成功，ID: ${taskForCallback.id} 标题: ${taskForCallback.title}`);
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
    logger.info('taskManager', '开始生成重复任务:', task.title);
    logger.info('taskManager', '原始任务积分有效期:', task.pointsExpiry); // 记录原始任务积分有效期
    
    // 详细记录重复配置
    logger.info('taskManager', '重复任务完整配置:', JSON.stringify(task.repeat));
    logger.info('taskManager', `任务是否设置无结束日期: ${task.hasNoEndDate === true ? '是' : '否'}`);
    
    const tasks = [];
    
    // 确保日期格式有效
    if (!task.repeat || !task.repeat.startDate) {
      logger.error('taskManager', '错误: 重复任务缺少开始日期');
      return tasks;
    }
    
    // 解析开始日期和结束日期
    const startDate = new Date(task.repeat.startDate);
    let endDate = null;
    
    // 处理结束日期
    if (task.repeat.endDate) {
      endDate = new Date(task.repeat.endDate);
      logger.info('taskManager', `使用任务中设置的结束日期: ${task.repeat.endDate} -> ${endDate.toISOString()}`);
    } else if (task.hasNoEndDate === true) {
      // 明确处理无结束日期的情况
      logger.info('taskManager', '检测到无结束日期设置，使用默认期限');
      endDate = new Date(startDate);
      // 对于不同重复类型设置不同的默认期限
      if (task.repeat.type === 'daily') {
        endDate.setDate(endDate.getDate() + 90); // 每日任务默认90天
      } else {
        endDate.setDate(endDate.getDate() + 30); // 其他类型默认30天
      }
      logger.info('taskManager', `为无结束日期任务设置默认结束期限: ${endDate.toISOString()}`);
    } else {
      logger.error('taskManager', '错误: 重复任务缺少结束日期且未设置无结束日期标志');
      return tasks;
    }
    
    // 确保开始日期不早于今天
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate < today) {
      logger.info('taskManager', '开始日期早于今天，调整为今天');
      startDate.setTime(today.getTime());
    }
    
    // 确保结束日期不早于开始日期
    if (endDate < startDate) {
      logger.error('taskManager', '错误: 结束日期早于开始日期，无法生成任务');
      return tasks;
    }
    
    logger.info('taskManager', '任务时间范围:', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      type: task.repeat.type
    });
    
    // 计算任务生成天数
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1包含开始日期
    logger.info(`taskManager] 任务将生成: ${diffDays}天的内容`);
    
    // 记录生成任务的开始和结束日期
    const startDateStr = `${startDate.getFullYear()}-${(startDate.getMonth() + 1).toString().padStart(2, '0')}-${startDate.getDate().toString().padStart(2, '0')}`;
    const endDateStr = `${endDate.getFullYear()}-${(endDate.getMonth() + 1).toString().padStart(2, '0')}-${endDate.getDate().toString().padStart(2, '0')}`;
    logger.info(`taskManager] 开始生成从 ${startDateStr} 到 ${endDateStr} 的重复任务`);
    
    // 根据重复类型生成任务
    switch (task.repeat.type) {
      case 'daily':
        // 每天重复
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          const taskInstance = this._createRepeatTaskInstance(task, new Date(date));
          tasks.push(taskInstance);
          logger.info(`taskManager] 创建第${tasks.length}个每日任务，日期: ${taskInstance.date}，积分有效期: ${taskInstance.pointsExpiry}`);
        }
        break;
        
      case 'weekly':
        // 每周重复
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 7)) {
          const taskInstance = this._createRepeatTaskInstance(task, new Date(date));
          tasks.push(taskInstance);
          logger.info(`taskManager] 创建每周任务，日期: ${taskInstance.date}，积分有效期: ${taskInstance.pointsExpiry}`);
        }
        break;
        
      case 'workdays':
        // 工作日重复
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          const day = date.getDay();
          if (day >= 1 && day <= 5) { // 周一到周五
            const taskInstance = this._createRepeatTaskInstance(task, new Date(date));
            tasks.push(taskInstance);
            logger.info(`taskManager] 创建工作日任务，日期: ${taskInstance.date}，积分有效期: ${taskInstance.pointsExpiry}`);
          }
        }
        break;
        
      case 'weekends':
        // 休息日重复（周六和周日）
        logger.info('taskManager', '处理休息日重复任务，筛选周六和周日');
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          const day = date.getDay();
          if (day === 0 || day === 6) { // 周日或周六
            const taskInstance = this._createRepeatTaskInstance(task, new Date(date));
            tasks.push(taskInstance);
            logger.info(`taskManager] 创建休息日任务，日期: ${taskInstance.date}，积分有效期: ${taskInstance.pointsExpiry}`);
          }
        }
        break;
        
      case 'custom':
        // 自定义重复
        logger.info('taskManager', '处理自定义重复任务，选定的星期几:', task.repeat.days);
        
        // 确保days数组中的元素都是字符串类型，统一处理
        const daysArray = task.repeat.days.map(day => day.toString());
        logger.info('taskManager', '转换后的星期几数组(字符串类型):', daysArray);
        
        for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
          // 获取当前日期的星期几（0-6）
          const dayOfWeek = date.getDay();
          // 确保数据类型一致：将dayOfWeek转为字符串
          const dayOfWeekStr = dayOfWeek.toString();
          
          // 检查当前日期的星期几是否在用户选择的星期几数组中
          const isMatch = daysArray.includes(dayOfWeekStr);
          
          if (isMatch) {
            const taskInstance = this._createRepeatTaskInstance(task, new Date(date));
            tasks.push(taskInstance);
            logger.info(`taskManager] 创建自定义重复任务，日期: ${taskInstance.date}，星期${dayOfWeek}，积分有效期: ${taskInstance.pointsExpiry}`);
          }
        }
        
        // 如果没有生成任何任务，记录警告
        if (tasks.length === 0) {
          logger.warn('taskManager', '⚠️ 警告: 未能生成任何重复任务! 请检查日期匹配条件');
        }
        break;
    }
    
    logger.info('taskManager', '生成重复任务完成，共生成:', tasks.length, '个任务');
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
      // 添加父任务ID，指向原始任务
      parentTaskId: originalTask.id,
      // 确保保留原始任务的积分有效期
      pointsExpiry: originalTask.pointsExpiry || 'permanent',
      pointsExpiryDate: originalTask.pointsExpiryDate || ''
    };
    
    logger.info(`taskManager] 创建重复任务实例: ${dateStr}，积分有效期: ${taskInstance.pointsExpiry}, 父任务ID: ${taskInstance.parentTaskId}`);
    
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
      const taskIndex = allTasks.findIndex(t => t.id === taskId);
      if (taskIndex === -1) {
        logger.error('taskManager', `任务不存在: ${taskId}`);
        if (callback) callback(false);
        return;
      }

      const task = allTasks[taskIndex];
      const oldStatus = task.status;
      task.status = status;
      task.modifyTime = Date.now();

      // 处理积分变更
      if (status === 1 && oldStatus !== 1) { // 完成任务
        if (!task.isRequired) {
          // 检查任务是否已经获得过星星
          if (task.starAwarded) {
            logger.info('taskManager', `任务 ${task.title} 已获得过星星，不再重复添加`);
            // 显示提示
            wx.showToast({
              title: '这个任务已经给过星星了哦~',
              icon: 'none',
              duration: 1500
            });
          } else {
            logger.info('taskManager', `非必做任务 ${task.title} 已完成，添加星星: ${task.points || 0}`);
            pointsManager.addUserPoints(task.points || 0);
            
            // 标记任务已获得星星
            task.starAwarded = true;
            
            // 计算积分有效期并更新任务
            if (task.pointsExpiry) {
              logger.info('taskManager', `计算任务${task.id}积分有效期，类型: ${task.pointsExpiry}`);
              const completionDate = new Date();
              const expiryInfo = this.calculateExpiryDate(task.pointsExpiry, completionDate);
              
              // 更新任务的有效期信息
              task.pointsExpiryDate = expiryInfo.expiryDateStr;
              logger.info(`taskManager] 更新任务${task.id}的积分有效期为: ${task.pointsExpiryDate}`);
            }
          }
        }
      } else if (status === 0 && oldStatus === 1) { // 取消完成
        if (!task.isRequired) {
          logger.info(`taskManager] 非必做任务 ${task.title} 取消完成，减少星星: ${task.points || 0}`);
          pointsManager.reduceUserPoints(task.points || 0);
          
          // 重置有效期显示为类型描述
          if (task.pointsExpiry && typeof task.pointsExpiry === 'string') {
            const Constants = require('./constants.js');
            if (task.pointsExpiry === 'permanent') {
              task.pointsExpiryDate = '永久';
            } else if (Constants.POINTS_EXPIRY.TEXT[task.pointsExpiry]) {
              task.pointsExpiryDate = Constants.POINTS_EXPIRY.TEXT[task.pointsExpiry];
            } else {
              task.pointsExpiryDate = '';
            }
            logger.info(`taskManager] 重置任务${task.id}的积分有效期为: ${task.pointsExpiryDate}`);
          }
          
          // 注意：不重置starAwarded标记，确保任务只能获得一次星星
        }
      }
      
      // 保存任务数据
      this._saveTaskData(allTasks, () => {
        // 触发任务变更事件
        this._onTaskDataChanged(allTasks);
        
        if (callback) callback(task);
      });
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
      logger.error('taskManager', '删除任务失败: 任务ID为空');
      if (callback) callback(false);
      return;
    }
    
    logger.info(`taskManager] 开始删除任务: ${taskId}`);
    
    this.getAllTasks(allTasks => {
      // 获取要删除的任务信息，方便后续日志记录
      const taskToDelete = allTasks.find(task => task.id === taskId);
      const taskDate = taskToDelete ? taskToDelete.date : '';
      
      // 过滤掉要删除的任务
      const updatedTasks = allTasks.filter(task => task.id !== taskId);
      
      // 如果任务数量减少，说明删除成功
      if (updatedTasks.length < allTasks.length) {
        // 保存任务数据
        this._saveTaskData(updatedTasks, () => {
          // 清理相关的消息
          const messageManager = require('./messageManager.js');
          logger.info(`taskManager] 删除任务相关消息: ${taskId}`);
          
          messageManager.deleteTaskMessages(taskId, (msgCount) => {
            logger.info('[taskManager] 成功删除任务相关消息:', msgCount, '条');
            
            // 删除监听器
            const app = getApp();
            if (app.globalData.taskListeners && app.globalData.taskListeners[taskId]) {
              logger.info('[taskManager] 删除任务监听器:', taskId);
              clearTimeout(app.globalData.taskListeners[taskId]);
              delete app.globalData.taskListeners[taskId];
            }
            
            // 触发任务数据变更事件
            this._onTaskDataChanged(updatedTasks, {
              changeType: 'delete',
              deletedTaskId: taskId,
              taskDate: taskDate,
              taskTitle: taskToDelete ? taskToDelete.title : '',
              deleteTime: Date.now()
            });
            
            if (callback) callback(true);
          });
        });
      } else {
        logger.error('taskManager', '未找到要删除的任务:', taskId);
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
      
      logger.info('taskManager', '检查即将到期任务, 当前任务数:', todayTasks.length);
      
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
            
            // 格式化开始时间为更友好的显示格式
            const formattedStartTime = startTime;
            logger.info(`taskManager] 任务"${task.title || task.name}"将在 ${formattedStartTime} 开始`);
            
            // 处理提醒时间
            let shouldRemind = false;
            if (task.reminder && task.reminder.enabled) {
              const reminderTime = this.calculateReminderTime(task);
              if (reminderTime) {
                // 检查当前时间是否在提醒时间附近（正负10分钟内）
                const timeDiff = Math.abs(reminderTime - now) / (1000 * 60);
                shouldRemind = timeDiff <= 10;
                
                logger.info(`taskManager] 任务"${task.title || task.name}"提醒时间差: ${timeDiff.toFixed(1)}分钟, 是否提醒: ${shouldRemind}`);
              }
            }
            
            // 必做任务有更高的提醒优先级
            if (task.isRequired) {
              // 对必做任务，时间窗口扩大到36小时
              shouldRemind = shouldRemind || (diffHours > 0 && diffHours < 36);
              logger.info(`taskManager] 必做任务"${task.title || task.name}"将在${diffHours.toFixed(1)}小时后到期`);
            }
            
            // 只考虑未来24小时内的任务或需要提醒的任务
            if ((diffHours > 0 && diffHours < 24) || shouldRemind) {
              upcomingTasks.push({
                ...task,
                timeRemaining: Math.round(diffHours * 10) / 10, // 保留一位小数（用于排序和筛选）
                formattedStartTime: formattedStartTime // 添加格式化的开始时间（用于显示）
              });
            }
          } catch (error) {
            logger.error('解析任务日期时间出错:', error, task);
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
            logger.info(`taskManager] 创建了必做任务提醒: ${task.title || task.name}`);
          } else {
            messageManager.createTaskMessage(task, 'upcoming');
          }
        });
        
        logger.info('taskManager', '创建了即将到期任务提醒:', upcomingTasks.length);
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
    
    logger.info('taskManager', '计算任务进度:', {
      typeCounts: typeCounts,
      progress: progress
    });
    
    // 计算总体统计数据
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(task => task.status === 1).length;
    const completionRate = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0;
    
    // 生成统计结果 - 移除了 rewardProgress
    const result = {
      taskProgress: progress,
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
   * 保存任务数据（内部方法）
   * @private
   * @param {Array} tasks 任务数组
   * @param {Function} callback 回调函数
   */
  _saveTaskData(tasks, callback) {
    logger.info('taskManager', '准备保存任务数据，共'+tasks.length+'条任务记录');
    
    // 更新全局数据
    const app = getApp();
    app.globalData.tasks = tasks;
    logger.info('taskManager', '已更新全局任务数据');
    
    // 保存到本地存储
    storageUtils.setAsync('taskData', tasks, (success) => {
      if (success) {
        logger.info('taskManager', '任务数据保存成功，数据已同步到存储');
        
        // 触发任务数据更新事件
        if (app.globalData.eventBus) {
          app.globalData.eventBus.emit('taskDataChanged', tasks);
        }
        
        // 执行回调
        if (callback) {
          logger.info('taskManager', '执行保存后回调');
          callback(tasks);
        }
      } else {
        logger.error('taskManager', '任务数据保存失败');
        if (callback) callback(tasks);
      }
    });
  },
  
  /**
   * 任务数据变更事件处理
   * @param {Array} tasks 最新的任务数组
   * @param {Object} options 操作相关选项
   * @private
   */
  _onTaskDataChanged(tasks, options = {}) {
    // 增加默认的操作类型
    const changeType = options.changeType || 'unknown';
    
    logger.info(`taskManager] 触发任务数据变更事件，操作类型: ${changeType}，当前任务数量: ${tasks.length}`);
    
    // 统计任务类型数量，便于调试
    const typeCounts = {
      study: 0,
      habit: 0,
      interest: 0
    };
    
    // 统计不同日期的任务
    const dateGroups = {};
    
    tasks.forEach(task => {
      // 累计任务类型
      if (task.type && typeCounts.hasOwnProperty(task.type)) {
        typeCounts[task.type]++;
      }
      
      // 按日期分组
      if (task.date) {
        if (!dateGroups[task.date]) {
          dateGroups[task.date] = 0;
        }
        dateGroups[task.date]++;
      }
    });
    
    logger.info(`taskManager] 任务类型统计: 学习(${typeCounts.study})，习惯(${typeCounts.habit})，兴趣(${typeCounts.interest})`);
    logger.info(`taskManager] 任务日期分布: ${Object.keys(dateGroups).length}个不同日期`);
    
    // 删除操作特殊处理
    if (changeType === 'delete') {
      logger.info(`taskManager] 检测到删除操作，准备广播删除事件`);
      
      if (options.taskDate) {
        logger.info(`taskManager] 被删除任务日期: ${options.taskDate}`);
      }
      
      if (options.taskTitle) {
        logger.info(`taskManager] 被删除任务标题: ${options.taskTitle}`);
      }
      
      // 如果是删除操作，增加一个额外的延迟，确保数据完全保存
      setTimeout(() => {
        this._broadcastTaskDataChanged(tasks, changeType, options);
      }, 100);
    } else {
      // 其他操作类型直接广播
      this._broadcastTaskDataChanged(tasks, changeType, options);
    }
  },
  
  /**
   * 广播任务数据变更事件到全局事件总线
   * @param {Array} tasks 最新的任务数组
   * @param {String} changeType 变更类型
   * @param {Object} options 额外选项
   * @private
   */
  _broadcastTaskDataChanged(tasks, changeType, options = {}) {
    // 获取全局事件总线
    const app = getApp();
    if (app.globalData.eventBus) {
      logger.info(`taskManager] 通过事件总线广播任务数据变更, 操作类型: ${changeType}`);
      
      // 统计任务类型
      const typeCounts = {
        study: 0,
        habit: 0,
        interest: 0
      };
      
      // 按日期分组任务
      const dateGroups = {};
      
      tasks.forEach(task => {
        // 统计任务类型
        if (task.type && typeCounts.hasOwnProperty(task.type)) {
          typeCounts[task.type]++;
        }
        
        // 按日期分组
        if (task.date) {
          if (!dateGroups[task.date]) {
            dateGroups[task.date] = 0;
          }
          dateGroups[task.date]++;
        }
      });
      
      // 触发数据变更事件，添加更多元数据
      app.globalData.eventBus.emit('taskDataChanged', {
        tasks: tasks,
        count: tasks.length,
        timestamp: Date.now(),
        changeType: changeType,
        typeCounts: typeCounts,
        dateCount: Object.keys(dateGroups).length,
        extraOptions: options
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
        logger.info(`taskManager] 处理特殊提醒类型: 提前1天(晚上8点), 任务:`, task.title);
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
      logger.error('[taskManager] 计算提醒时间出错:', error, task);
      return null;
    }
  },
  
  /**
   * 标记任务为必做任务
   * @param {String} taskId 任务ID
   * @param {Function} callback 回调函数
   */
  markTaskAsRequired: function(taskId, callback) {
    logger.info(`taskManager] 标记必做任务: ${taskId}`);
    
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
        logger.error(`taskManager] 标记必做任务失败: 找不到任务 ${taskId}`);
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
    logger.info(`taskManager] 取消标记必做任务: ${taskId}`);
    
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
        logger.error(`taskManager] 取消标记必做任务失败: 找不到任务 ${taskId}`);
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
    logger.info(`taskManager] 开始检查必做任务`);
    
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
          
          logger.info(`taskManager] 应用惩罚: ${task.id}, 任务: ${task.title}`);
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
    logger.info(`taskManager] 开始应用惩罚，任务数量: ${penaltyTasks.length}`);
    
    // 计算总扣除积分
    const totalPenalty = penaltyTasks.reduce((sum, task) => sum + task.points, 0);
    
    // 使用pointsManager减少积分
    pointsManager.reduceUserPoints(totalPenalty);
    logger.info(`taskManager] 星星扣除了: ${totalPenalty}`);
    
    // 为每个任务创建惩罚消息
    const messageManager = require('./messageManager.js');
    
    penaltyTasks.forEach(task => {
      const penaltyMessage = {
        id: 'msg_penalty_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        type: 'penalty',
        taskId: task.taskId,
        title: '任务未完成',
        summary: `必做任务"${task.title}"未完成，扣除${task.points}颗星星`,
        timestamp: Date.now(),
        isRead: false,
        icon: '⚠️'
      };
      
      messageManager.addMessage(penaltyMessage);
    });
    
    if (callback) callback(null, penaltyTasks);
  },
  
  /**
   * 计算积分有效期
   * @param {String} expiryType 有效期类型（'permanent'/'week'/'month'/'3months'/'6months'/'12months'）
   * @param {Date} completionDate 完成日期
   * @returns {Object} 包含时间戳和可读格式的有效期信息
   */
  calculateExpiryDate(expiryType, completionDate) {
    logger.info(`taskManager] 计算积分有效期: 类型=${expiryType}, 完成日期=${completionDate.toISOString()}`);
    
    // 如果是永久有效，直接返回
    if (expiryType === 'permanent') {
      logger.info(`taskManager] 积分永久有效`);
      return {
        expiry: 'permanent',
        expiryDateStr: '永久'
      };
    }
    
    // 今天日期的零点
    const today = new Date(completionDate);
    today.setHours(0, 0, 0, 0);
    
    let expiryDate = new Date(today);
    let specialCase = '';
    
    switch (expiryType) {
      case 'week': {
        // 计算到当前自然周的周日24点
        const dayOfWeek = today.getDay(); // 0是周日，1-6是周一到周六
        
        if (dayOfWeek === 0) {
          // 周日完成，当天24点失效
          expiryDate.setHours(23, 59, 59, 999);
          specialCase = '当天24点失效';
        } else {
          // 计算到本周日的天数差
          const daysUntilSunday = 7 - dayOfWeek;
          expiryDate.setDate(today.getDate() + daysUntilSunday);
          expiryDate.setHours(23, 59, 59, 999);
        }
        break;
      }
      
      case 'month': {
        // 计算到当前自然月末24点
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        // 下个月的第0天就是当前月的最后一天
        expiryDate = new Date(currentYear, currentMonth + 1, 0);
        expiryDate.setHours(23, 59, 59, 999);
        
        // 检查是否是月末完成的
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        if (today.getDate() === lastDayOfMonth) {
          specialCase = '当天24点失效';
        }
        break;
      }
      
      case '3months': {
        // 计算到当前自然季度末24点
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        // 确定当前季度的最后一个月
        const quarterEndMonth = Math.floor(currentMonth / 3) * 3 + 2; // 0,1,2->2; 3,4,5->5; 6,7,8->8; 9,10,11->11
        
        // 下个月的第0天就是当前月的最后一天
        expiryDate = new Date(currentYear, quarterEndMonth + 1, 0);
        expiryDate.setHours(23, 59, 59, 999);
        
        // 检查是否是季度末完成的
        if (currentMonth === quarterEndMonth) {
          const lastDayOfMonth = new Date(currentYear, quarterEndMonth + 1, 0).getDate();
          if (today.getDate() === lastDayOfMonth) {
            specialCase = '当天24点失效';
          }
        }
        break;
      }
      
      case '6months': {
        // 计算到当前自然半年末24点
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        // 确定半年末月份：上半年(0-5)->5(6月), 下半年(6-11)->11(12月)
        const halfYearEndMonth = currentMonth < 6 ? 5 : 11;
        
        // 设置到半年末的最后一天
        expiryDate = new Date(currentYear, halfYearEndMonth + 1, 0);
        expiryDate.setHours(23, 59, 59, 999);
        
        // 检查是否是半年末完成的
        if (currentMonth === halfYearEndMonth) {
          const lastDayOfMonth = new Date(currentYear, halfYearEndMonth + 1, 0).getDate();
          if (today.getDate() === lastDayOfMonth) {
            specialCase = '当天24点失效';
          }
        }
        break;
      }
      
      case '12months': {
        // 计算到当前自然年末24点
        const currentYear = today.getFullYear();
        
        // 设置到年末最后一天
        expiryDate = new Date(currentYear, 11, 31);
        expiryDate.setHours(23, 59, 59, 999);
        
        // 检查是否是年末完成的
        if (today.getMonth() === 11 && today.getDate() === 31) {
          specialCase = '当天24点失效';
        }
        break;
      }
      
      default: {
        // 默认7天有效期（兼容旧版本）
        logger.warn(`taskManager] 未知的积分有效期类型: ${expiryType}，使用默认7天`);
        expiryDate.setDate(today.getDate() + 7);
        expiryDate.setHours(23, 59, 59, 999);
      }
    }
    
    // 格式化日期为可读格式
    let expiryDateStr = '';
    
    if (specialCase) {
      expiryDateStr = specialCase;
    } else {
      // 检查是否是今天或明天
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      
      if (expiryDate.getDate() === today.getDate() && 
          expiryDate.getMonth() === today.getMonth() && 
          expiryDate.getFullYear() === today.getFullYear()) {
        expiryDateStr = '今日24点';
      } else if (expiryDate.getDate() === tomorrow.getDate() && 
                expiryDate.getMonth() === tomorrow.getMonth() && 
                expiryDate.getFullYear() === tomorrow.getFullYear()) {
        expiryDateStr = '明日24点';
      } else {
        expiryDateStr = `${expiryDate.getMonth() + 1}月${expiryDate.getDate()}日`;
      }
    }
    
    logger.info(`taskManager] 计算积分有效期结果: ${expiryDateStr}, 时间戳: ${expiryDate.getTime()}`);
    
    return {
      expiry: expiryDate.getTime(),
      expiryDateStr: expiryDateStr
    };
  },
  
  /**
   * 获取任务统计数据
   * @param {Object} dateRange 日期范围，可选
   * @param {Function} callback 回调函数
   */
  getTaskStatistics: function(dateRange, callback) {
    logger.info('taskManager', '获取任务统计数据');
    
    // 获取所有任务
    this.getAllTasks(allTasks => {
      const stats = {
        totalTasks: allTasks.length,
        completedTasks: allTasks.filter(task => task.status === 1).length,
        completionRate: 0,
        typeCounts: {
          habit: allTasks.filter(task => task.type === 'habit').length,
          study: allTasks.filter(task => task.type === 'study').length,
          interest: allTasks.filter(task => task.type === 'interest').length
        },
        streak: this._calculateStreak(allTasks) // 计算连续完成天数
      };
      
      // 计算完成率
      if (stats.totalTasks > 0) {
        stats.completionRate = Math.round((stats.completedTasks / stats.totalTasks) * 100);
      }
      
      logger.info('taskManager', '统计数据:', stats);
      
      if (callback) callback(stats);
    });
  },
  
  /**
   * 计算连续完成天数
   * @param {Array} tasks 任务数组
   * @return {Number} 连续天数
   */
  _calculateStreak: function(tasks) {
    // TODO: 实现连续完成天数计算功能
    // 需要按日期分组并计算连续完成的天数
    // 目前返回默认值0
    logger.info('taskManager', '连续完成天数计算功能未实现');
    return 0;
  },
  
  /**
   * 批量处理任务
   * @param {Array} items 需要处理的任务数组
   * @param {Function} processFn 处理函数
   * @param {Object} options 选项
   * @param {Function} callback 回调函数
   */
  batchProcessTasks(items, processFn, options = {}, callback) {
    logger.info('taskManager', `使用批量处理工具处理${items ? items.length : 0}项任务`);
    
    // 使用通用的批量处理工具
    batchUtils.batchProcess(items, processFn, {
      batchSize: options.batchSize || 50,
      delay: options.delay || 0,
      showProgress: options.showProgress !== false,
      progressTitle: options.progressTitle || '处理任务中'
    }, callback);
  },
};

module.exports = taskManager; 