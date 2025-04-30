/**
 * 任务列表项组件 (taskItem)
 * 
 * @description 用于展示任务列表项，提供任务完成状态切换和编辑功能
 * @usage 仅用于首页任务列表和搜索结果展示，不用于任务编辑页面
 * @pages 使用此组件的页面：index（首页）
 * 
 * 示例：
 * <task-item 
 *   task="{{item}}"
 *   bind:complete="onComplete"
 *   bind:edit="onEdit"
 * />
 */
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    task: {
      type: Object,
      value: {
        id: 0,
        type: '',
        title: '',
        status: 0,
        hasImage: false
      }
    },
    showActions: {
      type: Boolean,
      value: true
    },
    showTime: {
      type: Boolean,
      value: false
    },
    showCheckbox: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    icons: {
      habit: '⏰',
      interest: '📚',
      study: '📝'
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 点击复选框完成任务
    onCheckboxTap: function(e) {
      console.log('任务完成状态切换:', this.properties.task.id);
      this.triggerEvent('complete', {
        taskId: this.properties.task.id
      });
    },

    // 点击任务项进入详情(已禁用)
    onTaskTap: function(e) {
      // 不再触发详情页跳转
      // 此方法保留是为了兼容性，但不执行任何操作
    },

    // 点击编辑按钮
    onEditTap: function(e) {
      console.log('任务编辑点击:', this.properties.task.id);
      this.triggerEvent('edit', {
        taskId: this.properties.task.id
      });
    }
  }
}) 