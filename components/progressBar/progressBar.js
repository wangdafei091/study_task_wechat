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
    encouragements: [       // 随机鼓励语
      '加油加油！',
      '你太棒了！',
      '继续努力！',
      '真是太厉害了！',
      '你是最棒的！',
      '再接再厉！',
      'wow~真厉害！',
      '我们要加速啦！',
      '我相信你能做到！',
      '离终点更近了！'
    ],
    currentEncouragement: '', // 当前鼓励语
    tapsCount: 0,            // 点击次数
    chickAnimation: '',      // 特殊动画类型
    isComplete: false,       // 是否已完成
  },

  /**
   * 数据监听器
   */
  observers: {
    'current, total': function(current, total) {
      let percentage = 0;
      if (total > 0) {
        percentage = Math.min(Math.max(current / total * 100, 0), 100);
      }
      
      // 计算渐变阶段
      const prevStage = this.data.gradientStage;
      const stage = Math.min(Math.floor(percentage / 25), 3);
      
      // 是否刚到达新阶段
      const isNewStage = stage > prevStage;
      
      // 检查是否完成
      const wasComplete = this.data.isComplete;
      const isComplete = percentage >= 100;
      const justCompleted = isComplete && !wasComplete;
      
      // 更新小鸡状态和外观
      let chickState = 'walking';
      
      if (percentage >= 100) {
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
      
      this.setData({
        percentage: percentage,
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
        this.triggerEvent('complete'); // 触发完成事件
        this.showCompletionMessage();
      }
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 点击小鸡时触发的动作
    onTapChick: function() {
      // 如果当前已有动画在执行，不触发新动画
      if (this.data.chickAnimation || this.data.chickJumping) {
        return;
      }
      
      // 根据点击次数增加不同的动画效果
      const tapsCount = this.data.tapsCount + 1;
      let animation = '';
      let encouragement = '';
      
      // 如果已经完成，固定显示鼓励语
      if (this.data.isComplete) {
        encouragement = "是不是很棒～";
      } else {
        // 随机选择一条鼓励语
        const randomIndex = Math.floor(Math.random() * this.data.encouragements.length);
        encouragement = this.data.encouragements[randomIndex];
      }
      
      if (tapsCount % 10 === 0) {
        // 每10次点击有特殊动画
        animation = 'spin';
      } else if (tapsCount % 5 === 0) {
        // 每5次点击有特殊动画
        animation = 'flip';
      } else if (tapsCount % 3 === 0) {
        // 每3次点击有特殊动画
        animation = 'dance';
      } else {
        animation = 'jump';
      }
      
      this.setData({
        chickJumping: false, // 确保不会同时应用两种跳跃动画
        chickSpeaking: true,
        currentEncouragement: encouragement,
        tapsCount: tapsCount,
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
      
      // 播放音效（如果微信小程序支持）
      if (wx.createInnerAudioContext) {
        try {
          const soundEffect = wx.createInnerAudioContext();
          // 根据动画类型播放不同音效
          if (animation === 'spin') {
            // 你可以在项目中添加这些音效文件
            // soundEffect.src = '/assets/sounds/spin.mp3';
          } else if (animation === 'flip') {
            // soundEffect.src = '/assets/sounds/flip.mp3';
          } else {
            // soundEffect.src = '/assets/sounds/jump.mp3';
          }
          // soundEffect.play();
        } catch (e) {
          console.log('播放音效失败', e);
        }
      }
    },
    
    // 显示阶段提示
    showStageHint: function() {
      // 选择一个表情符号添加到阶段提示语前
      const emoticons = ['❤️', '✨', '🎉', '👏', '🌟', '💪'];
      const randomEmoticon = emoticons[Math.floor(Math.random() * emoticons.length)];
      
      // 使用鼓励语气泡显示阶段提示
      const stageMessage = `${randomEmoticon} 进入${this.data.currentStageTitle}阶段啦！`;
      
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
      // 使用固定的鼓励语
      const completionMessage = "Oh,yeah!成功啦！";
      
      this.setData({ 
        chickSpeaking: true,
        currentEncouragement: completionMessage,
        nodeReached: true
      });
      
      // 让小鸡做一个特殊的庆祝动画
      setTimeout(() => {
        this.setData({
          chickAnimation: 'spin'
        });
        
        setTimeout(() => {
          this.setData({
            chickAnimation: 'flip'
          });
          
          setTimeout(() => {
            this.setData({
              chickAnimation: 'jump',
              chickSpeaking: false,
              nodeReached: false
            });
            
            setTimeout(() => {
              this.setData({
                chickAnimation: ''
              });
            }, 800);
          }, 800);
        }, 800);
      }, 1000);
    }
  }
}) 