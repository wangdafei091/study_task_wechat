/**
 * taskUtils.js - 任务处理工具类
 * 
 * 提供任务相关的通用方法，如任务统计、过滤、排序等
 */

const dateUtils = require('./dateUtils');

/**
 * 计算任务完成率
 * @param {Array} tasks - 任务列表
 * @returns {Number} 完成率(0-100)
 */
const calculateCompletionRate = function(tasks) {
  if (!tasks || tasks.length === 0) {
    return 0;
  }
  
  const completedCount = tasks.filter(task => task.completed).length;
  return Math.round((completedCount / tasks.length) * 100);
};

/**
 * 获取任务统计信息
 * @param {Array} tasks - 任务列表
 * @returns {Object} 统计信息
 */
const getTaskStats = function(tasks) {
  if (!tasks || tasks.length === 0) {
    return {
      total: 0,
      completed: 0,
      pending: 0,
      overdue: 0,
      today: 0,
      completionRate: 0
    };
  }
  
  const today = dateUtils.getTodayString();
  const now = new Date();
  
  // 按状态分类
  const completed = tasks.filter(task => task.completed).length;
  const pending = tasks.filter(task => !task.completed).length;
  const todayTasks = tasks.filter(task => task.date === today).length;
  
  // 计算逾期任务
  const overdue = tasks.filter(task => {
    if (task.completed) return false;
    if (!task.date || !task.time) return false;
    
    const deadline = new Date(`${task.date} ${task.time}`);
    return deadline < now;
  }).length;
  
  return {
    total: tasks.length,
    completed: completed,
    pending: pending,
    overdue: overdue,
    today: todayTasks,
    completionRate: calculateCompletionRate(tasks)
  };
};

/**
 * 筛选任务列表
 * @param {Array} tasks - 任务列表
 * @param {Object} filters - 筛选条件
 * @returns {Array} 筛选后的任务列表
 */
const filterTasks = function(tasks, filters = {}) {
  if (!tasks || tasks.length === 0) {
    return [];
  }
  
  let filteredTasks = [...tasks];
  
  // 按完成状态筛选
  if (typeof filters.completed === 'boolean') {
    filteredTasks = filteredTasks.filter(task => task.completed === filters.completed);
  }
  
  // 按日期筛选
  if (filters.date) {
    filteredTasks = filteredTasks.filter(task => task.date === filters.date);
  }
  
  // 按日期范围筛选
  if (filters.startDate && filters.endDate) {
    filteredTasks = filteredTasks.filter(task => {
      if (!task.date) return false;
      return task.date >= filters.startDate && task.date <= filters.endDate;
    });
  }
  
  // 按今天
  if (filters.today) {
    const today = dateUtils.getTodayString();
    filteredTasks = filteredTasks.filter(task => task.date === today);
  }
  
  // 按明天
  if (filters.tomorrow) {
    const tomorrow = dateUtils.getTomorrowString();
    filteredTasks = filteredTasks.filter(task => task.date === tomorrow);
  }
  
  // 按类型筛选
  if (filters.type) {
    filteredTasks = filteredTasks.filter(task => task.type === filters.type);
  }
  
  // 按重要性筛选
  if (typeof filters.important === 'boolean') {
    filteredTasks = filteredTasks.filter(task => task.important === filters.important);
  }
  
  // 按优先级筛选
  if (filters.priority) {
    filteredTasks = filteredTasks.filter(task => task.priority === filters.priority);
  }
  
  // 按标签筛选
  if (filters.tag) {
    filteredTasks = filteredTasks.filter(task => {
      if (!task.tags || task.tags.length === 0) return false;
      return task.tags.includes(filters.tag);
    });
  }
  
  // 按关键词搜索
  if (filters.keyword) {
    const keyword = filters.keyword.toLowerCase();
    filteredTasks = filteredTasks.filter(task => {
      return task.title.toLowerCase().includes(keyword) || 
        (task.description && task.description.toLowerCase().includes(keyword));
    });
  }
  
  return filteredTasks;
};

/**
 * 排序任务列表
 * @param {Array} tasks 任务列表
 * @param {String} sortBy 排序字段
 * @param {Boolean} ascending 是否升序
 * @param {Boolean} requiredFirst 是否必做任务优先
 * @returns {Array} 排序后的任务列表
 */
const sortTasks = function(tasks, sortBy = 'date', ascending = true, requiredFirst = true) {
  if (!tasks || tasks.length === 0) {
    return [];
  }
  
  const sortedTasks = [...tasks];
  
  // 根据不同字段排序
  switch(sortBy) {
    case 'date':
      sortedTasks.sort((a, b) => {
        // 首先按必做任务排序（如果开启）
        if (requiredFirst) {
          const aRequired = a.isRequired || false;
          const bRequired = b.isRequired || false;
          if (aRequired !== bRequired) {
            return aRequired ? -1 : 1; // 必做任务排在前面
          }
        }
        
        // 将没有日期的任务放在最后
        if (!a.date) return ascending ? 1 : -1;
        if (!b.date) return ascending ? -1 : 1;
        
        // 按日期排序
        const dateCompare = a.date.localeCompare(b.date);
        
        // 如果日期相同，按时间排序
        if (dateCompare === 0) {
          if (!a.time) return ascending ? 1 : -1;
          if (!b.time) return ascending ? -1 : 1;
          return a.time.localeCompare(b.time);
        }
        
        return ascending ? dateCompare : -dateCompare;
      });
      break;
      
    case 'priority':
      // 优先级数值：高(3) > 中(2) > 低(1) > 无(0)
      sortedTasks.sort((a, b) => {
        // 首先按必做任务排序（如果开启）
        if (requiredFirst) {
          const aRequired = a.isRequired || false;
          const bRequired = b.isRequired || false;
          if (aRequired !== bRequired) {
            return aRequired ? -1 : 1; // 必做任务排在前面
          }
        }
        
        const priorityA = a.priority || 0;
        const priorityB = b.priority || 0;
        return ascending ? (priorityA - priorityB) : (priorityB - priorityA);
      });
      break;
      
    case 'title':
      sortedTasks.sort((a, b) => {
        // 首先按必做任务排序（如果开启）
        if (requiredFirst) {
          const aRequired = a.isRequired || false;
          const bRequired = b.isRequired || false;
          if (aRequired !== bRequired) {
            return aRequired ? -1 : 1; // 必做任务排在前面
          }
        }
        
        return ascending ? 
          a.title.localeCompare(b.title) : 
          b.title.localeCompare(a.title);
      });
      break;
      
    case 'created':
      sortedTasks.sort((a, b) => {
        // 首先按必做任务排序（如果开启）
        if (requiredFirst) {
          const aRequired = a.isRequired || false;
          const bRequired = b.isRequired || false;
          if (aRequired !== bRequired) {
            return aRequired ? -1 : 1; // 必做任务排在前面
          }
        }
        
        const timeA = a.createTime || 0;
        const timeB = b.createTime || 0;
        return ascending ? (timeA - timeB) : (timeB - timeA);
      });
      break;
      
    case 'status':
      // 未完成的排在前面
      sortedTasks.sort((a, b) => {
        // 首先按必做任务排序（如果开启）
        if (requiredFirst) {
          const aRequired = a.isRequired || false;
          const bRequired = b.isRequired || false;
          if (aRequired !== bRequired) {
            return aRequired ? -1 : 1; // 必做任务排在前面
          }
        }
        
        return ascending ? 
          (a.completed === b.completed ? 0 : a.completed ? 1 : -1) : 
          (a.completed === b.completed ? 0 : a.completed ? -1 : 1);
      });
      break;
      
    default:
      // 默认按创建时间排序
      sortedTasks.sort((a, b) => {
        // 首先按必做任务排序（如果开启）
        if (requiredFirst) {
          const aRequired = a.isRequired || false;
          const bRequired = b.isRequired || false;
          if (aRequired !== bRequired) {
            return aRequired ? -1 : 1; // 必做任务排在前面
          }
        }
        
        const timeA = a.createTime || 0;
        const timeB = b.createTime || 0;
        return ascending ? (timeB - timeA) : (timeA - timeB);
      });
  }
  
  return sortedTasks;
};

/**
 * 生成任务ID
 * @returns {String} 生成的唯一ID
 */
const generateTaskId = function() {
  const timestamp = new Date().getTime();
  const random = Math.floor(Math.random() * 10000);
  return `task_${timestamp}_${random}`;
};

/**
 * 创建任务对象
 * @param {Object} taskData - 任务数据
 * @returns {Object} 标准格式的任务对象
 */
const createTaskObject = function(taskData) {
  // 默认任务模板
  const defaultTask = {
    id: generateTaskId(),
    title: '',
    description: '',
    date: dateUtils.getTodayString(),
    time: '',
    completed: false,
    important: false,
    type: 'default',
    priority: 1, // 1-低, 2-中, 3-高
    tags: [],
    createTime: new Date().getTime(),
    updateTime: new Date().getTime(),
    repeat: {
      enabled: false,
      type: 'daily', // daily, weekly, workdays, custom
      days: [] // 0-6 代表周日到周六
    }
  };
  
  // 合并用户提供的数据
  const newTask = { ...defaultTask, ...taskData };
  
  // 确保ID存在
  if (!newTask.id) {
    newTask.id = generateTaskId();
  }
  
  // 设置更新时间
  newTask.updateTime = new Date().getTime();
  
  return newTask;
};

/**
 * 计算任务逾期状态
 * @param {Object} task - 任务对象
 * @returns {Boolean} 是否逾期
 */
const isTaskOverdue = function(task) {
  if (task.completed) return false;
  if (!task.date) return false;
  
  const now = new Date();
  const taskDate = new Date(task.date);
  
  // 日期逾期
  if (taskDate < now && taskDate.toDateString() !== now.toDateString()) {
    return true;
  }
  
  // 同一天但时间逾期
  if (taskDate.toDateString() === now.toDateString() && task.time) {
    const timeStr = task.time.split(':');
    const taskDateTime = new Date();
    taskDateTime.setHours(parseInt(timeStr[0], 10), parseInt(timeStr[1], 10), 0, 0);
    
    return taskDateTime < now;
  }
  
  return false;
};

/**
 * 计算任务到期状态
 * @param {Object} task - 任务对象
 * @returns {String} 状态：'overdue'(已逾期), 'today'(今天到期), 'tomorrow'(明天到期), 'upcoming'(即将到期), 'future'(未来)
 */
const getTaskDueStatus = function(task) {
  if (task.completed) return 'completed';
  if (!task.date) return 'nodate';
  
  // 检查是否逾期
  if (isTaskOverdue(task)) {
    return 'overdue';
  }
  
  const today = dateUtils.getTodayString();
  const tomorrow = dateUtils.getTomorrowString();
  
  if (task.date === today) {
    return 'today';
  } else if (task.date === tomorrow) {
    return 'tomorrow';
  }
  
  // 计算与今天的天数差
  const daysDiff = dateUtils.getDaysBetween(today, task.date);
  
  if (daysDiff <= 7) {
    return 'upcoming'; // 一周内
  } else {
    return 'future'; // 一周以后
  }
};

/**
 * 根据重复设置生成下一个任务日期
 * @param {Object} task - 任务对象
 * @returns {String} 下一个重复日期(YYYY-MM-DD格式)，如果不重复则返回null
 */
const getNextRepeatDate = function(task) {
  if (!task.repeat || !task.repeat.enabled || !task.date) {
    return null;
  }
  
  const currentDate = new Date(task.date);
  let nextDate = new Date(currentDate);
  
  // 根据重复类型计算下一个日期
  switch(task.repeat.type) {
    case 'daily':
      // 每天重复，直接加1天
      nextDate.setDate(nextDate.getDate() + 1);
      break;
      
    case 'weekly':
      // 每周重复，加7天
      nextDate.setDate(nextDate.getDate() + 7);
      break;
      
    case 'workdays':
      // 工作日重复，计算下一个工作日
      nextDate.setDate(nextDate.getDate() + 1);
      
      // 如果是周末，调整到下周一
      const dayOfWeek = nextDate.getDay();
      if (dayOfWeek === 0) { // 周日
        nextDate.setDate(nextDate.getDate() + 1);
      } else if (dayOfWeek === 6) { // 周六
        nextDate.setDate(nextDate.getDate() + 2);
      }
      break;
      
    case 'custom':
      // 自定义重复，找出下一个符合条件的日期
      if (!task.repeat.days || task.repeat.days.length === 0) {
        return null;
      }
      
      // 获取下一天
      nextDate.setDate(nextDate.getDate() + 1);
      
      // 循环查找直到找到符合的日期
      const maxIterations = 7; // 防止无限循环
      let iterations = 0;
      
      while (iterations < maxIterations) {
        const dayOfWeekStr = nextDate.getDay().toString();
        if (task.repeat.days.includes(dayOfWeekStr)) {
          break;
        }
        
        nextDate.setDate(nextDate.getDate() + 1);
        iterations++;
      }
      
      // 如果找不到符合条件的日期，返回null
      if (iterations >= maxIterations) {
        return null;
      }
      break;
      
    default:
      return null;
  }
  
  return dateUtils.formatDate(nextDate);
};

/**
 * 创建重复任务
 * @param {Object} originalTask - 原始任务对象
 * @returns {Object} 新的重复任务对象，如果不应重复则返回null
 */
const createRepeatTask = function(originalTask) {
  // 如果任务不需要重复，或没有设置重复规则，返回null
  if (!originalTask.repeat || !originalTask.repeat.enabled) {
    return null;
  }
  
  // 获取下一个重复日期
  const nextDate = getNextRepeatDate(originalTask);
  if (!nextDate) {
    return null;
  }
  
  // 创建新任务对象
  const newTask = {
    ...originalTask,
    id: generateTaskId(), // 生成新ID
    date: nextDate,
    completed: false,
    createTime: new Date().getTime(),
    updateTime: new Date().getTime()
  };
  
  return newTask;
};

/**
 * 按日期分组任务
 * @param {Array} tasks - 任务列表
 * @returns {Object} 按日期分组的任务对象
 */
const groupTasksByDate = function(tasks) {
  if (!tasks || tasks.length === 0) {
    return {};
  }
  
  const groupedTasks = {};
  
  tasks.forEach(task => {
    if (task.date) {
      if (!groupedTasks[task.date]) {
        groupedTasks[task.date] = [];
      }
      
      groupedTasks[task.date].push(task);
    } else {
      // 没有日期的任务放在'nodate'组
      if (!groupedTasks['nodate']) {
        groupedTasks['nodate'] = [];
      }
      
      groupedTasks['nodate'].push(task);
    }
  });
  
  return groupedTasks;
};

/**
 * 获取任务统计信息
 * @param {Array} tasks - 任务列表
 * @returns {Object} 统计信息
 */
const getTaskStatistics = function(tasks) {
  console.log('[TaskUtils] 开始统计任务数据，任务数量:', tasks.length);
  const stats = {
    total: 0,
    completed: 0,
    pending: 0,
    overdue: 0,
    repeat: 0,
    today: 0,
    week: 0,
    month: 0
  };

  // 使用Set来存储已统计的重复任务ID
  const countedRepeatTasks = new Set();

  tasks.forEach(task => {
    stats.total++;
    
    if (task.status === 'completed') {
      stats.completed++;
    } else {
      stats.pending++;
      
      // 检查是否逾期
      if (task.dueDate && new Date(task.dueDate) < new Date()) {
        stats.overdue++;
      }
    }

    // 统计重复任务
    if (task.repeat && !countedRepeatTasks.has(task.repeat.parentId)) {
      stats.repeat++;
      countedRepeatTasks.add(task.repeat.parentId);
    }

    // 统计时间范围内的任务
    const taskDate = new Date(task.dueDate);
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    if (taskDate.toDateString() === today.toDateString()) {
      stats.today++;
    }
    if (taskDate >= weekStart && taskDate <= today) {
      stats.week++;
    }
    if (taskDate >= monthStart && taskDate <= today) {
      stats.month++;
    }
  });

  console.log('[TaskUtils] 任务统计完成:', stats);
  return stats;
};

/**
 * 排序今日任务列表
 * 排序规则：
 * 1. 必做全天任务优先
 * 2. 非必做全天任务次之
 * 3. 有起止时间的任务按时间顺序排列
 * 
 * @param {Array} tasks - 任务数组
 * @returns {Array} 排序后的任务列表
 */
const sortTasksByHabitAndTime = function(tasks) {
  if (!tasks || tasks.length === 0) {
    return [];
  }
  
  console.log('[taskUtils] 开始按新规则排序今日任务，任务数量:', tasks.length);
  
  const sortedTasks = [...tasks];
  
  sortedTasks.sort((a, b) => {
    // 获取任务属性，并处理可能的undefined值
    const aRequired = a.isRequired || false;
    const bRequired = b.isRequired || false;
    const aAllDay = a.isAllDay || false;
    const bAllDay = b.isAllDay || false;
    
    // 先按全天任务排序，全天任务优先
    if (aAllDay !== bAllDay) {
      return aAllDay ? -1 : 1;
    }
    
    // 同为全天或非全天任务，必做任务优先
    if (aRequired !== bRequired) {
      return aRequired ? -1 : 1;
    }
    
    // 对于非全天任务，按开始时间升序排序
    if (!aAllDay && !bAllDay) {
      const aTime = a.startTime || '23:59';
      const bTime = b.startTime || '23:59';
      return aTime.localeCompare(bTime);
    }
    
    // 同类型任务按创建时间排序（新任务优先）
    const aTime = a.createTime || 0;
    const bTime = b.createTime || 0;
    return bTime - aTime;
  });
  
  console.log('[taskUtils] 任务排序完成，结果：', 
    sortedTasks.map(t => ({
      id: t.id.substring(0, 8) + '...',
      title: t.title,
      required: t.isRequired ? '是' : '否',
      isAllDay: t.isAllDay ? '是' : '否',
      startTime: t.startTime || '全天'
    }))
  );
  
  return sortedTasks;
};

module.exports = {
  calculateCompletionRate,
  getTaskStats,
  filterTasks,
  sortTasks,
  generateTaskId,
  createTaskObject,
  isTaskOverdue,
  getTaskDueStatus,
  getNextRepeatDate,
  createRepeatTask,
  groupTasksByDate,
  getTaskStatistics,
  sortTasksByHabitAndTime
}; 