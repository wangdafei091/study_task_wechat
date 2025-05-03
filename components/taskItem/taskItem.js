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
const Constants = require('../../utils/constants.js');

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
      },
      observer: function(newVal) {
        if (newVal) {
          const expiryText = newVal.pointsExpiryDate || 
                           (newVal.pointsExpiry === 'permanent' ? '永久' : 
                           (Constants.POINTS_EXPIRY.TEXT[newVal.pointsExpiry] ? 
                             Constants.POINTS_EXPIRY.TEXT[newVal.pointsExpiry] : '完成后7天'));
          console.log(`[taskItem] 渲染任务: ${newVal.title}, 时间: ${newVal.startTime}, 积分有效期: ${expiryText}`);
        }
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
  },

  /**
   * 组件加载完成生命周期
   */
  lifetimes: {
    attached: function() {
      console.log('[taskItem] 组件加载完成，监测布局变化');
      
      // 获取系统信息，判断屏幕宽度
      wx.getSystemInfo({
        success: (res) => {
          const screenWidth = res.screenWidth;
          console.log(`[taskItem] 设备屏幕宽度: ${screenWidth}px, 是否采用垂直布局: ${screenWidth <= 520}`);
          console.log('[taskItem] 已优化积分有效期显示，垂直布局时左对齐，移除多余视觉指示符');
          console.log('[taskItem] 已优化时间范围与积分有效期行距，更加紧凑美观');
          console.log('[taskItem] 已修复手机端时钟图标与积分有效期重叠问题');
          console.log('[taskItem] 已修复时钟图标上半部分被截断的问题，优化显示效果');
        }
      });
    }
  }
}) 