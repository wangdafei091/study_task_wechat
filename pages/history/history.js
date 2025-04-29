// pages/history/history.js
// 注意：请在assets/icons目录下添加以下图标文件：
// - history.png：历史记录的灰色图标
// - history-active.png：历史记录的蓝色高亮图标
const app = getApp();

Page({
  /**
   * 页面的初始数据
   */
  data: {
    historyTasks: [],
    completedCount: 0,
    allTimeCount: 0,
    completionRate: 0,
    filterPeriod: 'all', // 'today', 'week', 'month', 'all'
    filterType: '', // 'habit', 'interest', 'study', ''
    selectedTasks: [],
    isMultiSelect: false,
    showFilterMenu: false,
    taskTypes: [
      { id: 'habit', name: '生活习惯', icon: '⏰' },
      { id: 'interest', name: '兴趣', icon: '📚' },
      { id: 'study', name: '学习任务', icon: '📝' }
    ],
    dateRange: {
      startDate: '',
      endDate: ''
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    // 初始化日期范围为今天
    const today = new Date();
    const todayStr = this.formatDate(today);
    
    this.setData({
      dateRange: {
        startDate: todayStr,
        endDate: todayStr
      }
    });
    
    this.loadHistoryTasks();
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow: function () {
    this.loadHistoryTasks();
  },

  /**
   * 加载历史任务数据
   */
  loadHistoryTasks: function () {
    // 从全局状态或本地存储获取任务
    const allTasks = app.globalData.tasks || [];
    const completedTasks = allTasks.filter(task => task.status === 1);
    
    // 根据筛选条件过滤任务
    let filteredTasks = [...completedTasks];
    
    // 根据时间段筛选
    if (this.data.filterPeriod !== 'all') {
      const today = new Date();
      let startDate = new Date();
      
      if (this.data.filterPeriod === 'today') {
        startDate = new Date(today.setHours(0, 0, 0, 0));
      } else if (this.data.filterPeriod === 'week') {
        startDate.setDate(today.getDate() - today.getDay());
        startDate.setHours(0, 0, 0, 0);
      } else if (this.data.filterPeriod === 'month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      } else if (this.data.filterPeriod === 'custom') {
        // 使用用户自定义的日期范围
        const { startDate, endDate } = this.data.dateRange;
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          
          filteredTasks = filteredTasks.filter(task => {
            const taskDate = new Date(task.date);
            return taskDate >= start && taskDate <= end;
          });
        }
      }
      
      if (this.data.filterPeriod !== 'custom') {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        
        filteredTasks = filteredTasks.filter(task => {
          const taskDate = new Date(task.date);
          return taskDate >= startDate && taskDate <= endDate;
        });
      }
    }
    
    // 根据任务类型筛选
    if (this.data.filterType) {
      filteredTasks = filteredTasks.filter(task => task.type === this.data.filterType);
    }
    
    // 按日期倒序排序，最新的在前
    filteredTasks.sort((a, b) => {
      const dateA = new Date(a.date + ' ' + a.time);
      const dateB = new Date(b.date + ' ' + b.time);
      return dateB - dateA;
    });

    // 计算完成率
    const completionRate = allTasks.length > 0 ? Math.floor(completedTasks.length / allTasks.length * 100) : 0;
    
    this.setData({
      historyTasks: filteredTasks,
      completedCount: completedTasks.length,
      allTimeCount: allTasks.length,
      completionRate: completionRate,
      selectedTasks: []
    });
  },

  /**
   * 选择任务查看详情
   */
  selectTask: function (e) {
    const taskId = e.currentTarget.dataset.id;
    
    if (this.data.isMultiSelect) {
      // 多选模式下添加或移除选择
      const index = this.data.selectedTasks.indexOf(taskId);
      let selectedTasks = [...this.data.selectedTasks];
      
      if (index === -1) {
        selectedTasks.push(taskId);
      } else {
        selectedTasks.splice(index, 1);
      }
      
      this.setData({
        selectedTasks: selectedTasks
      });
    } else {
      // 单选模式下跳转到详情页
      wx.navigateTo({
        url: `/pages/task/task?id=${taskId}`
      });
    }
  },

  /**
   * 切换多选模式
   */
  toggleMultiSelect: function () {
    this.setData({
      isMultiSelect: !this.data.isMultiSelect,
      selectedTasks: []
    });
  },

  /**
   * 全选/取消全选
   */
  toggleSelectAll: function () {
    if (this.data.selectedTasks.length === this.data.historyTasks.length) {
      // 全部取消
      this.setData({
        selectedTasks: []
      });
    } else {
      // 全选
      const allIds = this.data.historyTasks.map(task => task.id);
      this.setData({
        selectedTasks: allIds
      });
    }
  },

  /**
   * 批量删除选中任务
   */
  deleteSelectedTasks: function () {
    if (this.data.selectedTasks.length === 0) {
      wx.showToast({
        title: '请先选择任务',
        icon: 'none'
      });
      return;
    }
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除选中的${this.data.selectedTasks.length}个任务记录吗？`,
      success: (res) => {
        if (res.confirm) {
          const messageManager = require('../../utils/messageManager.js');
          const app = getApp();
          const allTasks = app.globalData.tasks || [];
          const selectedTaskIds = this.data.selectedTasks;
          
          // 删除选中的任务
          const updatedTasks = allTasks.filter(task => !selectedTaskIds.includes(task.id));
          
          // 更新全局数据
          app.globalData.tasks = updatedTasks;
          
          // 保存到本地存储
          wx.setStorage({
            key: 'taskData',
            data: updatedTasks,
            success: () => {
              console.log(`[history] 成功批量删除任务: ${selectedTaskIds.length}个`);
              
              // 删除与任务相关的消息
              let completedMessageDeletions = 0;
              
              const deleteNextTaskMessage = (index) => {
                if (index >= selectedTaskIds.length) {
                  // 所有消息删除完成
                  wx.showToast({
                    title: '删除成功',
                    icon: 'success'
                  });
                  
                  // 重新加载任务数据
                  this.loadHistoryTasks();
                  
                  // 退出多选模式
                  this.setData({
                    isMultiSelect: false
                  });
                  return;
                }
                
                const taskId = selectedTaskIds[index];
                console.log(`[history] 删除任务相关消息(${index+1}/${selectedTaskIds.length}): ${taskId}`);
                
                messageManager.removeTaskMessages(taskId, {
                  success: (count) => {
                    console.log(`[history] 成功删除任务消息: ${count}条`);
                    completedMessageDeletions++;
                    // 继续删除下一个
                    deleteNextTaskMessage(index + 1);
                  },
                  fail: (error) => {
                    console.error(`[history] 删除任务消息失败: ${error}`);
                    completedMessageDeletions++;
                    // 即使失败也继续
                    deleteNextTaskMessage(index + 1);
                  }
                });
              };
              
              // 开始删除第一个任务的消息
              deleteNextTaskMessage(0);
            },
            fail: (error) => {
              console.error(`[history] 保存任务数据失败: ${error}`);
              wx.showToast({
                title: '删除失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },

  /**
   * 批量导出选中任务
   */
  exportSelectedTasks: function () {
    if (this.data.selectedTasks.length === 0) {
      wx.showToast({
        title: '请先选择任务',
        icon: 'none'
      });
      return;
    }
    
    const allTasks = app.globalData.tasks || [];
    const selectedTasks = allTasks.filter(task => this.data.selectedTasks.includes(task.id));
    
    // 将任务数据转换为可分享的文本格式
    let exportText = "===== 学习任务记录 =====\n\n";
    
    selectedTasks.forEach(task => {
      const typeInfo = this.data.taskTypes.find(t => t.id === task.type);
      const typeName = typeInfo ? typeInfo.name : '未知类型';
      
      exportText += `标题: ${task.title}\n`;
      exportText += `类型: ${typeName}\n`;
      exportText += `日期: ${task.date} ${task.time}\n`;
      exportText += `状态: ${task.status === 1 ? '已完成' : '未完成'}\n`;
      if (task.description) {
        exportText += `描述: ${task.description}\n`;
      }
      exportText += "\n----------\n\n";
    });
    
    // 将数据保存到剪贴板
    wx.setClipboardData({
      data: exportText,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        });
      }
    });
  },

  /**
   * 显示筛选菜单
   */
  showFilter: function () {
    this.setData({
      showFilterMenu: true
    });
  },

  /**
   * 隐藏筛选菜单
   */
  hideFilter: function () {
    this.setData({
      showFilterMenu: false
    });
  },

  /**
   * 选择筛选时间段
   */
  selectPeriod: function (e) {
    const period = e.currentTarget.dataset.period;
    this.setData({
      filterPeriod: period
    });
    
    this.loadHistoryTasks();
    this.hideFilter();
  },

  /**
   * 选择筛选任务类型
   */
  selectType: function (e) {
    const type = e.currentTarget.dataset.type;
    this.setData({
      filterType: type === this.data.filterType ? '' : type
    });
    
    this.loadHistoryTasks();
    this.hideFilter();
  },

  /**
   * 选择开始日期
   */
  selectStartDate: function (e) {
    this.setData({
      'dateRange.startDate': e.detail.value
    });
    
    if (this.data.dateRange.endDate) {
      this.setData({
        filterPeriod: 'custom'
      });
      this.loadHistoryTasks();
    }
  },

  /**
   * 选择结束日期
   */
  selectEndDate: function (e) {
    this.setData({
      'dateRange.endDate': e.detail.value
    });
    
    if (this.data.dateRange.startDate) {
      this.setData({
        filterPeriod: 'custom'
      });
      this.loadHistoryTasks();
    }
  },

  /**
   * 格式化日期
   */
  formatDate: function (date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}) 