Component({
  /**
   * 组件的属性列表
   */
  properties: {
    percent: {
      type: Number,
      value: 0,
      observer(newVal) {
        // 确保百分比在0-100之间
        const percent = Math.max(0, Math.min(100, newVal));
        this._updateProgress(percent);
      }
    },
    size: {
      type: Number,
      value: 120, // 默认大小，rpx单位
      observer() {
        // 尺寸变化时更新Canvas
        this.drawProgressBg();
        this._updateProgress(this.data.percent);
      }
    },
    strokeWidth: {
      type: Number,
      value: 6, // 默认线宽，rpx单位
      observer() {
        this.drawProgressBg();
        this._updateProgress(this.data.percent);
      }
    },
    activeColor: {
      type: String,
      value: '#4285F4',
      observer() {
        this._updateProgress(this.data.percent);
      }
    },
    backgroundColor: {
      type: String,
      value: '#E8E8E8',
      observer() {
        this.drawProgressBg();
      }
    },
    showText: {
      type: Boolean,
      value: true
    },
    fontColor: {
      type: String,
      value: '#333333'
    },
    fontSize: {
      type: Number,
      value: 28 // 单位rpx
    },
    isLandscape: {
      type: Boolean,
      value: false,
      observer() {
        this._updateCanvasSize();
        this.drawProgressBg();
        this._updateProgress(this.data.percent);
      }
    },
    deviceType: {
      type: Object,
      value: {},
      observer(newVal) {
        this._adaptToDevice(newVal);
      }
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    canvasSize: 0, // 画布实际大小，单位为px
    pixelRatio: 1,
    bgCanvasId: 'bgCanvas',
    activeCanvasId: 'activeCanvas',
    canvasWidth: 0,
    canvasHeight: 0,
    actualStrokeWidth: 0 // 实际线条宽度，px单位
  },

  lifetimes: {
    attached() {
      const info = wx.getSystemInfoSync();
      this.setData({
        pixelRatio: info.pixelRatio
      });
      this._updateCanvasSize();
    },
    ready() {
      this.drawProgressBg();
      this._updateProgress(this.data.percent);
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    _adaptToDevice(deviceType) {
      // 根据设备类型适配尺寸
      if (!deviceType) return;
      
      let newSize = this.data.size;
      let newStrokeWidth = this.data.strokeWidth;
      let newFontSize = this.data.fontSize;
      
      if (deviceType.isSmallScreen) {
        // 小屏幕设备
        newSize = Math.max(80, this.data.size * 0.8);
        newStrokeWidth = Math.max(4, this.data.strokeWidth * 0.8);
        newFontSize = Math.max(22, this.data.fontSize * 0.9);
      } else if (deviceType.isLargeScreen || deviceType.isExtraLargeScreen) {
        // 大屏幕设备
        newSize = this.data.size * 1.2;
        newStrokeWidth = this.data.strokeWidth * 1.2;
        newFontSize = this.data.fontSize * 1.1;
      }
      
      if (this.data.isLandscape) {
        // 横屏模式下进一步调整
        newSize = newSize * 0.9;
      }
      
      if (newSize !== this.data.size || 
          newStrokeWidth !== this.data.strokeWidth || 
          newFontSize !== this.data.fontSize) {
        this.setData({
          size: newSize,
          strokeWidth: newStrokeWidth,
          fontSize: newFontSize
        });
      }
    },
    
    _updateCanvasSize() {
      // 根据rpx转换为px
      const sizeRpx = this.data.size;
      // 获取当前屏幕宽度
      const windowWidth = wx.getSystemInfoSync().windowWidth;
      // 计算rpx到px的转换比例
      const rpxToPxRatio = windowWidth / 750;
      // 计算实际大小（px）
      const sizePx = sizeRpx * rpxToPxRatio;
      const strokeWidthPx = this.data.strokeWidth * rpxToPxRatio;
      
      this.setData({
        canvasSize: sizePx,
        canvasWidth: sizePx,
        canvasHeight: sizePx,
        actualStrokeWidth: strokeWidthPx
      });
    },
    
    drawProgressBg() {
      const ctx = wx.createCanvasContext(this.data.bgCanvasId, this);
      const centerPoint = this.data.canvasSize / 2;
      const radius = centerPoint - this.data.actualStrokeWidth / 2;
      
      ctx.clearRect(0, 0, this.data.canvasSize, this.data.canvasSize);
      ctx.beginPath();
      ctx.lineWidth = this.data.actualStrokeWidth;
      ctx.strokeStyle = this.data.backgroundColor;
      ctx.arc(centerPoint, centerPoint, radius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.draw();
    },
    
    _updateProgress(percent) {
      const ctx = wx.createCanvasContext(this.data.activeCanvasId, this);
      const centerPoint = this.data.canvasSize / 2;
      const radius = centerPoint - this.data.actualStrokeWidth / 2;
      
      ctx.clearRect(0, 0, this.data.canvasSize, this.data.canvasSize);
      
      // 绘制进度圆弧
      ctx.beginPath();
      ctx.lineWidth = this.data.actualStrokeWidth;
      ctx.strokeStyle = this.data.activeColor;
      
      // 计算弧度
      const endAngle = (percent / 100) * 2 * Math.PI - 0.5 * Math.PI;
      
      ctx.arc(centerPoint, centerPoint, radius, -0.5 * Math.PI, endAngle);
      ctx.stroke();
      ctx.draw();
    }
  }
}) 