Page({
  data: {
    tasks: []
  },
  onLoad() {
    this.loadTasks();
  },
  loadTasks() {
    const tasks = wx.getStorageSync('tasks') || [];
    this.setData({ tasks });
  },
  onTaskClick(e) {
    const { task } = e.detail;
    wx.navigateTo({
      url: `/pages/task-detail/task-detail?id=${task.id}`
    });
  }
}); 