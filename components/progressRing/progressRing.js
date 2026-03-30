const logger = require('../../utils/logger');

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 百分比进度(0-100)
    percent: {
      type: Number,
      value: 0,
      observer(newVal) {
        // 确保进度值是数字类型
        let percentValue = newVal;
        if (typeof percentValue !== 'number') {
          logger.warn('progressRing', `收到非数字类型的percent值: ${typeof percentValue}, 尝试转换`, percentValue);
          percentValue = Number(percentValue) || 0;
        }
        const percent = Math.max(0, Math.min(100, percentValue));
        this._updateProgress(percent);
      }
    },
    // 圆环大小，可选值large/medium/small或具体数值
    size: {
      type: String,
      value: 'medium'
    },
    // 圆环类型，可选值：default/habit/study/interest
    type: {
      type: String,
      value: 'default'
    },
    // 自定义颜色（当type为default时使用）
    color: {
      type: String,
      value: '#4285F4'
    },
    // 是否显示文本
    showText: {
      type: Boolean,
      value: true
    },
    // 自定义中心内容（插槽替代）
    centerContent: {
      type: String,
      value: ''
    },
    // 是否启用悬停效果
    enableHover: {
      type: Boolean,
      value: true
    },
    // 边框宽度
    borderWidth: {
      type: Number,
      value: 8
    }
  },
  
  /**
   * 组件的初始数据
   */
  data: {
    progress: 0,
    sizeClass: 'medium',
    isComplete: false,
    progressClass: 'progress-ring-zero',
    sizeRpx: 130,
    canvasSizePx: 65,
    strokeWidthPx: 4
  },
  
  /**
   * 数据监听器
   */
  observers: {
    'percent': function(percent) {
      this.setData({
        isComplete: percent >= 100
      });
    },
    'size': function(size) {
      // 处理预设尺寸或自定义尺寸
      if (['large', 'medium', 'small'].includes(size)) {
        this.setData({ sizeClass: size });
      } else {
        this.setData({ sizeClass: 'custom' });
      }
      this._refreshLayout();
    },
    'type,color,borderWidth': function() {
      this._drawRing();
    }
  },

  lifetimes: {
    attached() {
      this._systemInfo = wx.getSystemInfoSync();
      this._refreshLayout();
    },
    ready() {
      this._isCanvasReady = true;
      this._scheduleDraw();
    }
  },
  
  /**
   * 组件的方法列表
   */
  methods: {
    onRingTap() {
      this.triggerEvent('tap', { 
        type: this.data.type,
        percent: this.data.progress
      });
    },
    
    /**
     * 更新进度并设置相应类名
     * @param {Number} percent - 百分比进度(0-100)
     */
    _updateProgress: function(percent) {
      logger.debug('progressRing', `更新进度: ${percent}%`);
      
      // 确定适当的类名
      let progressClass = 'progress-ring-with-progress';
      if (percent <= 0) {
        progressClass = 'progress-ring-zero';
      }
      
      // 设置数据，包括进度值和类名
      this.setData({
        progress: percent,
        progressClass: progressClass
      });

      this._drawRing();
    },

    _refreshLayout() {
      const sizeRpx = this._resolveSizeRpx(this.data.sizeClass, this.properties.size);
      const canvasSizePx = Math.max(1, Math.round(this._rpxToPx(sizeRpx)));
      const strokeWidthPx = Math.max(2, this._rpxToPx(this.properties.borderWidth));

      this.setData(
        {
          sizeRpx,
          canvasSizePx,
          strokeWidthPx
        },
        () => {
          this._scheduleDraw();
        }
      );
    },

    _resolveSizeRpx(sizeClass, rawSize) {
      if (sizeClass === 'large') return 160;
      if (sizeClass === 'small') return 110;
      if (sizeClass === 'medium') return 130;

      const customSize = Number(rawSize);
      if (!Number.isFinite(customSize) || customSize <= 0) {
        return 130;
      }
      return customSize;
    },

    _rpxToPx(rpx) {
      const windowWidth = this._systemInfo?.windowWidth || 375;
      return Number(rpx || 0) * windowWidth / 750;
    },

    _resolveRingColor() {
      if (this.properties.type === 'default') {
        return this.properties.color || '#4285F4';
      }

      const colorMap = {
        habit: '#4285F4',
        study: '#34A853',
        interest: '#FBBC05'
      };
      return colorMap[this.properties.type] || '#4285F4';
    },

    _resolveTrackColor() {
      const colorMap = {
        default: 'rgba(66, 133, 244, 0.12)',
        habit: 'rgba(66, 133, 244, 0.12)',
        study: 'rgba(52, 168, 83, 0.12)',
        interest: 'rgba(251, 188, 5, 0.14)'
      };
      return colorMap[this.properties.type] || colorMap.default;
    },

    _ensureCanvasContext() {
      if (!this._isCanvasReady) {
        return null;
      }
      return wx.createCanvasContext('progress-ring-canvas', this);
    },

    _scheduleDraw() {
      const drawTask = () => this._drawRing();
      if (typeof wx.nextTick === 'function') {
        wx.nextTick(drawTask);
        return;
      }

      setTimeout(drawTask, 0);
    },

    _drawRing() {
      const ctx = this._ensureCanvasContext();
      if (!ctx) {
        return;
      }

      const canvasSizePx = this.data.canvasSizePx || 65;
      const strokeWidthPx = this.data.strokeWidthPx || 4;
      const radius = Math.max(0, (canvasSizePx - strokeWidthPx) / 2);
      const center = canvasSizePx / 2;
      const startAngle = Math.PI / 2;
      const ratio = Math.max(0, Math.min(1, (this.data.progress || 0) / 100));
      const endAngle = startAngle + ratio * Math.PI * 2;

      ctx.clearRect(0, 0, canvasSizePx, canvasSizePx);

      ctx.beginPath();
      ctx.setLineWidth(strokeWidthPx);
      ctx.setStrokeStyle(this._resolveTrackColor());
      ctx.setLineCap('round');
      ctx.arc(center, center, radius, 0, Math.PI * 2, false);
      ctx.stroke();

      if (ratio > 0) {
        ctx.beginPath();
        ctx.setLineWidth(strokeWidthPx);
        ctx.setStrokeStyle(this._resolveRingColor());
        ctx.setLineCap('round');
        ctx.arc(center, center, radius, startAngle, endAngle, false);
        ctx.stroke();
      }

      ctx.draw();
    }
  }
})
