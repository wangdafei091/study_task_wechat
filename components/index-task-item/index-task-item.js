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
      observer: function(newVal, oldVal) {
        if (newVal) {
          // 添加详细的状态变化日志
          if (oldVal) {
            console.log(`[index-task-item] 任务属性变化检测:`, {
              taskId: newVal.id,
              title: newVal.title,
              statusChange: `${oldVal.status} -> ${newVal.status}`,
              starAwardedChange: `${oldVal.starAwarded} -> ${newVal.starAwarded}`,
              pointsChange: `${oldVal.points} -> ${newVal.points}`
            });
          } else {
            console.log(`[index-task-item] 任务初始化:`, {
              taskId: newVal.id,
              title: newVal.title,
              status: newVal.status,
              starAwarded: newVal.starAwarded,
              points: newVal.points
            });
          }
          
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
            console.log(`[index-task-item] 从常量映射星星有效期: ${newVal.pointsExpiry} -> ${expiryText}`);
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
          
          // 检查任务状态是否发生变化，如果是则强制更新UI
          const statusChanged = oldVal && (oldVal.status !== newVal.status || oldVal.starAwarded !== newVal.starAwarded);
          
          // 计算任务锁定状态
          const isLocked = this._calculateTaskLockStatus(newVal);
          
          console.log(`[index-task-item] 🔒 任务属性更新: ${newVal.title}, 锁定状态=${isLocked}, lastExchangeTime=${this.properties.lastExchangeTime}`);
          
          // 将处理好的有效期文本保存到组件data中
          this.setData({
            expiryText: expiryText,
            isLocked: isLocked,
            // 强制更新任务数据，确保UI正确响应状态变化
            taskData: { ...newVal }
          });
          
          if (statusChanged) {
            console.log(`[index-task-item] 任务状态变化: ${oldVal.status} -> ${newVal.status}, 星星状态: ${oldVal.starAwarded} -> ${newVal.starAwarded}`);
            console.log(`[index-task-item] 强制UI更新，新任务数据:`, {
              id: newVal.id,
              status: newVal.status,
              starAwarded: newVal.starAwarded,
              points: newVal.points
            });
          }
          
          console.log(`[index-task-item] 渲染任务: ${newVal.title}, 类型: ${newVal.type}, 星星: ${newVal.points || 0}颗, 有效期: ${expiryText}, 锁定状态: ${isLocked}`);
        }
      }
    },
    lastExchangeTime: {
      type: Number,
      value: null,
      observer: function(newVal, oldVal) {
        console.log(`[index-task-item] 🔒 lastExchangeTime属性变化: ${oldVal} -> ${newVal}`);
        // 当最后兑换时间变化时，重新计算所有任务的锁定状态
        if (newVal !== oldVal && this.properties.task) {
          const isLocked = this._calculateTaskLockStatus(this.properties.task);
          console.log(`[index-task-item] 🔒 重新计算锁定状态: 任务="${this.properties.task.title}", 锁定=${isLocked}`);
          this.setData({
            isLocked: isLocked
          });
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
    showStarAnimation: false,     // 是否显示星星动画
    expiryText: '7天',            // 积分有效期默认文本
    isProcessing: false,          // 防止重复点击
    taskData: null,              // 任务数据副本，用于强制UI更新
    isLocked: false              // 任务是否被锁定
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 点击复选框完成任务
    onCheckboxTap: function(e) {
      console.log('[index-task-item] 任务完成状态切换:', this.properties.task.id);
      
      // 防止重复点击
      if (this.data.isProcessing) {
        console.log('[index-task-item] 正在处理中，忽略点击');
        return;
      }
      
      // 标记正在处理
      this.setData({
        isProcessing: true
      });
      
      const task = this.properties.task;
      
      // 添加完成状态切换的视觉反馈动画
      this.addCompletionAnimation(task.status);
      
      // 任务从未完成变为完成时，触发星星动画
      if (task.status !== 1) {
        // 只有未获得过星星的任务才显示星星动画
        if (!task.starAwarded) {
          this.triggerStarAnimation();
        } else {
          console.log('[index-task-item] 任务已获得过星星，不显示星星动画');
        }
      }
      
      // 触发完成事件
      this.triggerEvent('complete', {
        taskId: task.id
      });
      
      // 延迟重置处理状态，防止快速点击
      setTimeout(() => {
        this.setData({
          isProcessing: false
        });
      }, 300);
    },

    /**
     * 添加完成状态切换的视觉反馈动画
     */
    addCompletionAnimation: function(currentStatus) {
      const logger = require('../../utils/logger');
      
      if (currentStatus === 0) {
        // 即将完成任务，添加完成动画
        logger.info('IndexTaskItem', '添加任务完成动画');
        
        // 添加completing类触发动画
        const query = this.createSelectorQuery();
        query.select('.task-item').node((res) => {
          if (res && res.node) {
            res.node.classList.add('completing');
            
            // 动画结束后移除类
            setTimeout(() => {
              if (res.node) {
                res.node.classList.remove('completing');
              }
            }, 300);
          }
        }).exec();
        
        // 轻微震动反馈
        if (wx.vibrateShort) {
          wx.vibrateShort({ type: 'light' });
        }
      }
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
    },

         // 计算任务锁定状态
     _calculateTaskLockStatus: function(task) {
       if (!task) {
         console.log('[index-task-item] 🔒 锁定状态计算: 任务为空，返回false');
         return false;
       }
       
       // 检查任务是否已完成（兼容不同的数据格式）
       const isCompleted = task.isCompleted ? task.isCompleted() : (task.status === 1);
       if (!isCompleted) {
         console.log(`[index-task-item] 🔒 锁定状态计算: 任务"${task.title}"未完成(status=${task.status})，返回false`);
         return false;
       }
       
       const lastExchangeTime = this.properties.lastExchangeTime;
       if (!lastExchangeTime) {
         console.log(`[index-task-item] 🔒 锁定状态计算: 任务"${task.title}"没有兑换记录(lastExchangeTime=${lastExchangeTime})，返回false`);
         return false;
       }
       
       // 如果任务完成时间早于最后兑换时间，则被锁定
       const isLocked = task.completionTime && task.completionTime < lastExchangeTime;
       console.log(`[index-task-item] 🔒 锁定状态计算: 任务"${task.title}"`, {
         completionTime: task.completionTime,
         lastExchangeTime: lastExchangeTime,
         isLocked: isLocked,
         completionTimeDate: task.completionTime ? new Date(task.completionTime).toLocaleString() : '无',
         lastExchangeTimeDate: new Date(lastExchangeTime).toLocaleString()
       });
       
       return isLocked;
     }
  },

  /**
   * 组件加载完成生命周期
   */
  lifetimes: {
    attached: function() {
      console.log('[index-task-item] 组件加载完成，使用优化后的布局展示');
      
      // 添加锁定状态初始检查
      const task = this.properties.task;
      const lastExchangeTime = this.properties.lastExchangeTime;
      if (task) {
        const isLocked = this._calculateTaskLockStatus(task);
        console.log(`[index-task-item] 🔒 组件初始化锁定状态检查: 任务="${task.title}", 锁定=${isLocked}, lastExchangeTime=${lastExchangeTime}`);
      }
      
      // 记录必做任务UI优化
      if (this.properties.task && this.properties.task.isRequired) {
        console.log('[index-task-item] 使用优化后的必做任务UI: 积极引导模式，统一"数字+星星"显示格式');
      }
      
      // 记录任务时间属性
      if (this.properties.task) {
        const task = this.properties.task;
        console.log(`[index-task-item] 任务属性检查: ID=${task.id}, 标题=${task.title}, 有起止时间=${Boolean(task.startTime)}, 全天=${Boolean(task.isAllDay)}`);
        
        // 记录时间显示逻辑
        if (task.startTime && !task.isAllDay) {
          console.log(`[index-task-item] 显示时间信息: ${task.startTime}${task.endTime ? ` - ${task.endTime}` : ''}`);
        }
        
        // 记录星星有效期样式优化
        console.log(`[index-task-item] 应用星星有效期文本不换行样式，修复日期换行显示问题`);
      }
    }
  }
}) 