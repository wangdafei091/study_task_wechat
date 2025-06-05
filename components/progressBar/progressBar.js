const logger = require('../../utils/logger');

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    current: {
      type: Number,
      value: 0
    },
    total: {
      type: Number,
      value: 100
    },
    showText: {
      type: Boolean,
      value: false
    },
    barHeight: {
      type: Number,
      value: 16
    },
    activeColor: {
      type: String,
      value: '#4285F4'
    },
    backgroundColor: {
      type: String,
      value: '#E8E8E8'
    },
    borderRadius: {
      type: Number,
      value: 8
    },
    showChick: {
      type: Boolean,
      value: true
    },
    useGradient: {
      type: Boolean,
      value: true
    },
    rewardImage: {
      type: String,
      value: ''
    },
    rewardName: {
      type: String,
      value: '奖品'
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    percentage: 0,
    chickPosition: 0,       // 小鸡实际显示位置，限制最大值避免与奖品重叠
    chickState: 'walking',  // 小鸡状态: walking, running, celebrating
    chickJumping: false,    // 小鸡是否在跳跃
    chickSpeaking: false,   // 小鸡是否在说话
    gradientStage: 0,       // 当前渐变阶段: 0-3
    stageColors: [
      'linear-gradient(to right, #5DADE2, #3498DB)', // 0-25% 天蓝色
      'linear-gradient(to right, #58D68D, #2ECC71)', // 25-50% 翠绿色
      'linear-gradient(to right, #F4D03F, #F39C12)', // 50-75% 金黄色
      'linear-gradient(to right, #D7BDE2, #9B59B6)'  // 75-100% 淡紫色
    ],
    stageTitles: ['起步', '前进', '冲刺', '终点'],
    nodeReached: false,     // 是否刚刚到达新阶段
    currentStageTitle: '',   // 当前阶段标题
    encouragements: [       // 随机鼓励语，控制在5个字以内
      '加油！',
      '真棒！',
      '继续！',
      '厉害！',
      '最棒！',
      '再接再厉',
      'wow~棒！',
      '冲冲冲！',
      '相信你！',
      '快到啦！'
    ],
    currentEncouragement: '', // 当前鼓励语
    tapsCount: 0,            // 点击次数
    chickAnimation: '',      // 特殊动画类型
    isComplete: false,       // 是否已完成
    showFireworks: false,    // 是否显示礼花效果
    bubblePosition: 'center', // 气泡位置: left, center, right
    showSpeechBubble: false,
    // 新增奖品tooltip相关属性
    showTooltip: false,      // 是否显示奖品提示
    tooltipDirection: 'bottom' // 提示方向: bottom, left, right
  },

  /**
   * 数据监听器
   */
  observers: {
    'current, total': function(current, total) {
      // 确保输入值为数字
      current = parseInt(current || 0, 10);
      total = parseInt(total || 1, 10);
      
      logger.debug('progressBar', `计算进度条百分比: ${current}/${total}`);
      
      let percentage = 0;
      if (total > 0) {
        percentage = Math.min(Math.max(current / total * 100, 0), 100);
        logger.debug('progressBar', `实际进度百分比: ${percentage.toFixed(2)}%`);
      }
      
      // 计算渐变阶段
      const prevStage = this.data.gradientStage;
      const stage = Math.min(Math.floor(percentage / 25), 3);
      
      // 是否刚到达新阶段
      const isNewStage = stage > prevStage;
      
      // 检查是否完成
      const wasComplete = this.data.isComplete;
      const isComplete = current >= total;
      const justCompleted = isComplete && !wasComplete;
      
      logger.debug('progressBar', `完成状态: ${isComplete ? '已完成' : '未完成'}, 刚完成: ${justCompleted}`);
      
      // 更新小鸡状态和外观
      let chickState = 'walking';
      
      if (isComplete) {
        chickState = 'celebrating';
      } else if (percentage > 70) {
        chickState = 'running';
      } else if (isNewStage) {
        // 刚到达新阶段时，让小鸡跳跃庆祝
        chickState = 'walking';
        setTimeout(() => {
          this.setData({ 
            chickJumping: false, // 不再使用jumping类，避免动画冲突
            chickAnimation: 'stageup'
          });
          setTimeout(() => {
            this.setData({ 
              chickAnimation: '' // 只需清除chickAnimation
            });
          }, 800);
        }, 100);
      }
      
      // 计算小鸡位置，限制最大值避免与奖品重叠
      const maxChickPosition = 85; // 限制小鸡最大位置为85%，为奖品区域预留空间
      const chickPosition = Math.min(percentage, maxChickPosition);
      
      logger.debug('progressBar', `小鸡位置计算: 进度${percentage.toFixed(2)}% -> 显示位置${chickPosition.toFixed(2)}%`);
      
      this.setData({
        percentage: percentage,
        chickPosition: chickPosition,
        chickState: chickState,
        gradientStage: stage,
        nodeReached: isNewStage,
        currentStageTitle: this.data.stageTitles[stage],
        isComplete: isComplete
      });
      
      // 如果刚到达新阶段，显示提示
      if (isNewStage) {
        this.showStageHint();
      }
      
      // 如果刚刚完成
      if (justCompleted) {
        logger.debug('progressBar', `触发完成事件，进度: ${percentage.toFixed(2)}%, 数值: ${current}/${total}`);
        this.triggerEvent('complete'); // 触发完成事件
        this.showCompletionMessage();
      }
    }
  },

  /**
   * 生命周期函数
   */
  attached: function() {
    // 获取系统信息，供后续使用
    this.systemInfo = wx.getWindowInfo();
    logger.debug('progressBar', '获取系统信息', this.systemInfo.windowWidth);
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 点击小鸡显示鼓励语
    onTapChick: function() {
      logger.debug('progressBar', '点击小鸡');
      
      // 获取小鸡位置，确定气泡显示位置
      const query = wx.createSelectorQuery().in(this);
      query.select('.chick-character').boundingClientRect(rect => {
        if (!rect) {
          console.warn('[progressBar] 无法获取小鸡位置');
          return;
        }
        
        const windowInfo = wx.getWindowInfo();
        logger.debug('progressBar', `小鸡位置: left=${rect.left}, right=${rect.right}, width=${rect.width}, 屏幕宽度=${windowInfo.windowWidth}`);
        
        // 根据小鸡在屏幕中的位置决定气泡显示方式
        let bubblePosition = 'center';
        const screenWidth = windowInfo.windowWidth;
        
        if (rect.left < screenWidth * 0.3) {
          bubblePosition = 'left';
        } else if (rect.right > screenWidth * 0.7) {
          bubblePosition = 'right';
        }
        
        logger.debug('progressBar', `气泡位置: ${bubblePosition}`);
        
        // 选择鼓励语
        this._selectRandomEncouragement();
        
        // 显示气泡并设置位置
        this.setData({
          chickSpeaking: true,
          bubblePosition: bubblePosition
        });
      }).exec();
      
      // 震动反馈
      wx.vibrateShort({
        type: 'light'
      });
      
      // 3秒后隐藏气泡
      if (this.speakingTimer) clearTimeout(this.speakingTimer);
      this.speakingTimer = setTimeout(() => {
        this.setData({
          chickSpeaking: false
        });
      }, 3000);
    },
    
    // 显示阶段提示
    showStageHint: function() {
      // 选择一个表情符号添加到阶段提示语前
      const emoticons = ['❤️', '✨', '🎉', '👏', '🌟', '💪'];
      const randomEmoticon = emoticons[Math.floor(Math.random() * emoticons.length)];
      
      // 使用鼓励语气泡显示阶段提示，缩短文本
      const stageMessage = `${randomEmoticon}${this.data.currentStageTitle}`;
      
      this.setData({ 
        chickSpeaking: true,
        currentEncouragement: stageMessage,
        nodeReached: true
      });
      
      setTimeout(() => {
        this.setData({ 
          chickSpeaking: false,
          nodeReached: false
        });
      }, 3000);
    },
    
    // 显示完成信息
    showCompletionMessage: function() {
      logger.debug('progressBar', '开始显示完成信息，触发完成动画');
      
      // 使用固定的鼓励语，缩短文本
      const completionMessage = "全部完成！";
      
      // 显示庆祝文字
      this.setData({ 
        chickSpeaking: true,
        currentEncouragement: completionMessage,
        nodeReached: true,
        showFireworks: true // 显示礼花效果
      });
      
      // 通知页面开始进行奖励动画，锁定用户操作
      const app = getApp();
      if (app && app.globalData && app.globalData.eventBus) {
        logger.debug('progressBar', '发送进度条完成事件，通知页面锁定操作');
        app.globalData.eventBus.emit(this.EVENTS.PROGRESS_BAR_COMPLETE);
      }
      
      // 让小鸡做一个简化的特殊庆祝动画，缩短总时长
      setTimeout(() => {
        // 旋转动画
        this.setData({
          chickAnimation: 'spin'
        });
        
        // 600ms后结束动画，比原来的时间缩短
        setTimeout(() => {
          this.setData({
            chickAnimation: '',
            chickSpeaking: false,
            nodeReached: false,
            showFireworks: false // 关闭礼花效果
          });
        }, 1200); // 总动画时长缩短到1.5秒左右
      }, 300);
      
      // 触发震动增强体验 - 保留但简化
      if (wx.vibrateShort) {
        try {
          wx.vibrateShort();
        } catch (e) {
          logger.debug('progressBar', '震动失败', e);
        }
      }
    },
    
    // 播放指定类型的动画效果
    playAnimation: function(animationType) {
      // 确保当前没有动画在执行
      if (this.data.chickAnimation) {
        return;
      }
      
      let animation = '';
      let encouragement = '';
      
      // 根据动画类型设置不同的动画效果和鼓励语
      switch(animationType) {
        case 'search':
          animation = 'flip';
          encouragement = '让我来找找看！';
          this.setData({ chickState: 'running' });
          break;
        case 'stats':
          animation = 'dance';
          encouragement = '看看我们的成果！';
          break;
        case 'complete':
          animation = 'spin';
          encouragement = '太棒了，完成了！';
          this.setData({ chickState: 'celebrating' });
          break;
        default:
          animation = 'jump';
          encouragement = '加油加油！';
      }
      
      this.setData({
        chickSpeaking: true,
        currentEncouragement: encouragement,
        chickAnimation: animation
      });
      
      // 设置动画结束后恢复状态
      setTimeout(() => {
        this.setData({
          chickAnimation: ''
        });
      }, 800);
      
      // 鼓励语持续时间
      setTimeout(() => {
        this.setData({
          chickSpeaking: false
        });
      }, 2000);
    },

    // 点击小鸡显示气泡
    onClickChicken: function() {
      logger.debug('progressBar', '点击小鸡');
      
      // 获取小鸡位置，确定气泡显示位置
      const query = wx.createSelectorQuery().in(this);
      query.select('.chicken').boundingClientRect(rect => {
        if (!rect) {
          console.warn('[progressBar] 无法获取小鸡位置');
          return;
        }
        
        const windowInfo = wx.getWindowInfo();
        logger.debug('progressBar', `小鸡位置: left=${rect.left}, right=${rect.right}, width=${rect.width}, 屏幕宽度=${windowInfo.windowWidth}`);
        
        // 根据小鸡在屏幕中的位置决定气泡显示方式
        let bubblePosition = 'center';
        const screenWidth = windowInfo.windowWidth;
        
        if (rect.left < screenWidth * 0.3) {
          bubblePosition = 'left';
        } else if (rect.right > screenWidth * 0.7) {
          bubblePosition = 'right';
        }
        
        logger.debug('progressBar', `气泡位置: ${bubblePosition}`);
        
        this.setData({
          showSpeechBubble: true,
          bubblePosition: bubblePosition
        });
      }).exec();
      
      // 3秒后自动隐藏气泡
      clearTimeout(this.bubbleTimer);
      this.bubbleTimer = setTimeout(() => {
        this.setData({
          showSpeechBubble: false
        });
      }, 3000);
    },

    // 选择随机鼓励语
    _selectRandomEncouragement: function() {
      // 定义鼓励语列表
      const encouragements = [
        "加油！我要拿到奖品！",
        "再积攒一些星星吧！",
        "快要到达终点啦！",
        "我已经走了这么远！",
        "努力就有收获！",
        "坚持就是胜利！"
      ];
      
      // 如果已经完成，固定显示祝贺语
      if (this.data.isComplete) {
        this.setData({
          currentEncouragement: "我做到了！太棒了！"
        });
        return;
      }
      
      // 随机选择一条鼓励语
      const randomIndex = Math.floor(Math.random() * encouragements.length);
      const encouragement = encouragements[randomIndex];
      
      logger.debug('progressBar', `选择鼓励语: ${encouragement}`);
      
      this.setData({
        currentEncouragement: encouragement
      });
    },

    // 点击奖品图标处理
    onTapReward: function() {
      logger.debug('progressBar', '点击奖品图标');
      
      // 显示奖品提示
      const goalAreaSelector = this.data.rewardImage ? '.goal-area-image' : '.goal-area';
      const query = wx.createSelectorQuery().in(this);
      
      query.select(goalAreaSelector).boundingClientRect(rect => {
        if (!rect) {
          console.warn('[progressBar] 无法获取奖品图标位置');
          return;
        }
        
        logger.debug('progressBar', `奖品图标位置: left=${rect.left}, right=${rect.right}, width=${rect.width}`);
        
        // 计算图标在屏幕中的位置
        const screenWidth = this.systemInfo.windowWidth;
        let direction = 'bottom';
        
        // 根据图标位置决定tooltip方向
        if (rect.right > screenWidth * 0.85) {
          // 靠近右边缘，显示在左侧
          direction = 'left';
          logger.debug('progressBar', '靠近右边缘，显示在左侧');
        } else if (rect.left < screenWidth * 0.15) {
          // 靠近左边缘，显示在右侧
          direction = 'right';
          logger.debug('progressBar', '靠近左边缘，显示在右侧');
        }
        
        // 设置tooltip方向和显示状态
        this.setData({
          tooltipDirection: direction,
          showTooltip: true
        });
        
        // 提供触觉反馈
        if (wx.vibrateShort) {
          wx.vibrateShort({ type: 'light' });
        }
        
        // 设置自动隐藏定时器
        if (this.tooltipTimer) clearTimeout(this.tooltipTimer);
        this.tooltipTimer = setTimeout(() => {
          this.setData({ showTooltip: false });
        }, 3000);
      }).exec();
    }
  },

  // 在组件顶部导入常量
  ready: function() {
    const app = getApp();
    this.app = app;
    // 导入事件常量
    const { EVENTS } = require('../../utils/constants.js');
    this.EVENTS = EVENTS;
  }
}) 