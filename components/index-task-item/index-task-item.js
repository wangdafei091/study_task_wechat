/**
 * 首页任务列表项组件 (index-task-item)
 * 
 * @description 用于展示任务列表项，提供任务完成状态切换功能
 * @usage 仅用于首页任务列表和搜索结果展示，不用于任务编辑页面
 * @pages 使用此组件的页面：index（首页）
 * 
 * 示例：
 * <index-task-item 
 *   task="{{item}}"
 *   bind:complete="onComplete"
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
          // 处理不同类型的积分有效期
          let expiryText = '';
          
          if (newVal.pointsExpiryDate) {
            // 已有格式化的过期日期，直接使用
            expiryText = newVal.pointsExpiryDate;
          } else if (newVal.pointsExpiry === 'permanent') {
            // 永久有效的情况
            expiryText = '永久';
          } else if (typeof newVal.pointsExpiry === 'string' && Constants.POINTS_EXPIRY.TEXT[newVal.pointsExpiry]) {
            // 未完成任务，显示完成后的有效期类型描述
            expiryText = Constants.POINTS_EXPIRY.TEXT[newVal.pointsExpiry];
          } else if (typeof newVal.pointsExpiry === 'number') {
            // 时间戳类型，计算与当前时间的差距
            const now = new Date().getTime();
            const diffDays = Math.ceil((newVal.pointsExpiry - now) / (24 * 60 * 60 * 1000));
            
            if (diffDays <= 0) {
              expiryText = '今日到期';
            } else if (diffDays === 1) {
              expiryText = '明日到期';
            } else {
              expiryText = `${diffDays}天后到期`;
            }
          } else {
            // 默认情况
            expiryText = '7天';
          }
          
          console.log(`[index-task-item] 渲染任务: ${newVal.title}, 类型: ${newVal.type}, 星星: ${newVal.points || 0}颗, 有效期: ${expiryText}`);
        }
      }
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
    },
    isDescriptionExpanded: false, // 任务描述是否展开
    showStarAnimation: false      // 是否显示星星动画
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 点击复选框完成任务
    onCheckboxTap: function(e) {
      console.log('[index-task-item] 任务完成状态切换:', this.properties.task.id);
      
      // 任务从未完成变为完成时，触发星星动画
      if (this.properties.task.status != 1) {
        this.triggerStarAnimation();
      }
      
      this.triggerEvent('complete', {
        taskId: this.properties.task.id
      });
    },

    // 触发星星动画
    triggerStarAnimation: function() {
      console.log('[index-task-item] 触发星星获得动画');
      
      this.setData({
        showStarAnimation: true
      });
      
      // 动画结束后重置状态
      setTimeout(() => {
        this.setData({
          showStarAnimation: false
        });
      }, 800);
    },
    
    // 切换任务描述展开/收起状态
    toggleDescription: function(e) {
      if (!this.properties.task.description || this.properties.task.description.length <= 20) {
        return;  // 描述不存在或长度不足无需展开
      }
      
      const newState = !this.data.isDescriptionExpanded;
      console.log(`[index-task-item] 切换任务描述展示状态: ${newState ? '展开' : '收起'}`);
      
      this.setData({
        isDescriptionExpanded: newState
      });
    }
  },

  /**
   * 组件加载完成生命周期
   */
  lifetimes: {
    attached: function() {
      console.log('[index-task-item] 组件加载完成，使用优化后的布局展示');
    }
  }
}) 