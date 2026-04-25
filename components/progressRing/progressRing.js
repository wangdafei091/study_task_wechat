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
    use2dCanvas: false,
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
      this._drawTimers = [];
      this._isFallbackPending = false;
      const use2dCanvas = this._shouldUse2dCanvas();
      this.setData({ use2dCanvas });
      this._refreshLayout();
    },
    ready() {
      this._initCanvas();
    },
    detached() {
      this._clearDrawTimers();
      this._canvasNode = null;
      this._ctx2d = null;
      this._legacyCanvasContext = null;
      this._isCanvasReady = false;
    }
  },

  pageLifetimes: {
    show() {
      this._recoverCanvasAfterShow();
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

    _clearDrawTimers() {
      if (!Array.isArray(this._drawTimers)) {
        this._drawTimers = [];
        return;
      }

      this._drawTimers.forEach((timerId) => clearTimeout(timerId));
      this._drawTimers = [];
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
          this._syncCanvasViewport();
          this._scheduleDrawBurst();
        }
      );
    },

    _resolveSizeRpx(sizeClass, rawSize) {
      if (sizeClass === 'large') return 148;
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

    _shouldUse2dCanvas() {
      const platform = this._systemInfo?.platform || '';
      return platform !== 'devtools';
    },

    _resolveRingColor() {
      if (this.properties.type === 'default') {
        return this.properties.color || '#4285F4';
      }

      const colorMap = {
        habit: '#4285F4',
        study: '#34A853',
        interest: '#D39B2F'
      };
      return colorMap[this.properties.type] || '#4285F4';
    },

    _resolveTrackColor() {
      const colorMap = {
        default: 'rgba(66, 133, 244, 0.12)',
        habit: 'rgba(66, 133, 244, 0.12)',
        study: 'rgba(52, 168, 83, 0.12)',
        interest: 'rgba(211, 155, 47, 0.14)'
      };
      return colorMap[this.properties.type] || colorMap.default;
    },

    _bind2dCanvas(onReady, onFail) {
      if (typeof this.createSelectorQuery !== 'function') {
        if (typeof onFail === 'function') {
          onFail();
        }
        return;
      }

      const query = this.createSelectorQuery();
      query.select('.ring-canvas').fields({ node: true, size: true }, (res) => {
        if (res && res.node && typeof res.node.getContext === 'function') {
          this._canvasNode = res.node;
          this._ctx2d = res.node.getContext('2d');
          this._legacyCanvasContext = null;
          this._isCanvasReady = true;
          this._syncCanvasViewport(res.width, res.height);
          if (typeof onReady === 'function') {
            onReady(res);
          }
          return;
        }

        if (typeof onFail === 'function') {
          onFail();
        }
      }).exec();
    },

    _fallbackToLegacyCanvas() {
      if (this._isFallbackPending) {
        return;
      }

      this._isFallbackPending = true;
      const finalizeFallback = () => {
        this._legacyCanvasContext = wx.createCanvasContext('progress-ring-canvas', this);
        this._ctx2d = null;
        this._canvasNode = null;
        this._isCanvasReady = true;
        this._isFallbackPending = false;
        this._scheduleDrawBurst();
      };

      if (!this.data.use2dCanvas) {
        finalizeFallback();
        return;
      }

      this.setData({ use2dCanvas: false }, () => {
        if (typeof wx.nextTick === 'function') {
          wx.nextTick(finalizeFallback);
          return;
        }
        setTimeout(finalizeFallback, 0);
      });
    },

    _initCanvas() {
      if (!this.data.use2dCanvas || typeof this.createSelectorQuery !== 'function') {
        this._legacyCanvasContext = wx.createCanvasContext('progress-ring-canvas', this);
        this._ctx2d = null;
        this._canvasNode = null;
        this._isCanvasReady = true;
        this._scheduleDrawBurst();
        return;
      }

      this._bind2dCanvas(
        () => {
          this._scheduleDrawBurst();
        },
        () => {
          this._fallbackToLegacyCanvas();
        }
      );
    },

    _syncCanvasViewport(viewportWidth, viewportHeight) {
      if (!this._canvasNode || !this._ctx2d) {
        return;
      }

      const displayWidth = Math.max(1, Math.round(viewportWidth || this.data.canvasSizePx || 1));
      const displayHeight = Math.max(1, Math.round(viewportHeight || this.data.canvasSizePx || 1));
      const dpr = this._systemInfo?.pixelRatio || 1;

      this._canvasDisplayWidth = displayWidth;
      this._canvasDisplayHeight = displayHeight;
      this._canvasNode.width = Math.max(1, Math.round(displayWidth * dpr));
      this._canvasNode.height = Math.max(1, Math.round(displayHeight * dpr));

      if (typeof this._ctx2d.setTransform === 'function') {
        this._ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else if (typeof this._ctx2d.scale === 'function') {
        this._ctx2d.scale(dpr, dpr);
      }
    },

    _scheduleDraw(delay = 0) {
      const drawTask = () => this._drawRing();
      if (delay > 0) {
        const timerId = setTimeout(drawTask, delay);
        this._drawTimers.push(timerId);
        return;
      }

      if (typeof wx.nextTick === 'function') {
        wx.nextTick(drawTask);
        return;
      }

      setTimeout(drawTask, 0);
    },

    _scheduleDrawBurst() {
      this._clearDrawTimers();
      this._scheduleDraw();
      this._scheduleDraw(80);
      this._scheduleDraw(180);
    },

    _recoverCanvasAfterShow() {
      if (this.data.use2dCanvas) {
        this._bind2dCanvas(
          () => {
            this._scheduleDrawBurst();
          },
          () => {
            this._fallbackToLegacyCanvas();
          }
        );
        return;
      }

      if (!this._legacyCanvasContext) {
        this._legacyCanvasContext = wx.createCanvasContext('progress-ring-canvas', this);
        this._isCanvasReady = true;
      }
      this._scheduleDrawBurst();
    },

    _drawRing() {
      if (!this._isCanvasReady) {
        return;
      }

      const canvasSizePx = this._canvasDisplayWidth || this.data.canvasSizePx || 65;
      const strokeWidthPx = this.data.strokeWidthPx || 4;
      const radius = Math.max(0, (canvasSizePx - strokeWidthPx) / 2);
      const center = canvasSizePx / 2;
      const startAngle = Math.PI / 2;
      const ratio = Math.max(0, Math.min(1, (this.data.progress || 0) / 100));
      const endAngle = startAngle + ratio * Math.PI * 2;

      if (this._ctx2d) {
        try {
          const ctx = this._ctx2d;
          ctx.clearRect(0, 0, canvasSizePx, canvasSizePx);

          ctx.beginPath();
          ctx.lineWidth = strokeWidthPx;
          ctx.strokeStyle = this._resolveTrackColor();
          ctx.lineCap = 'round';
          ctx.arc(center, center, radius, 0, Math.PI * 2, false);
          ctx.stroke();

          if (ratio > 0) {
            ctx.beginPath();
            ctx.lineWidth = strokeWidthPx;
            ctx.strokeStyle = this._resolveRingColor();
            ctx.lineCap = 'round';
            ctx.arc(center, center, radius, startAngle, endAngle, false);
            ctx.stroke();
          }
          return;
        } catch (error) {
          logger.warn('progressRing', '2D canvas 绘制失败，回退旧 canvas', error);
          this._fallbackToLegacyCanvas();
          return;
        }
      }

      const ctx = this._legacyCanvasContext;
      if (!ctx) {
        return;
      }

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
