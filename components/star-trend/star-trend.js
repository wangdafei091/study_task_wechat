const analyticsManager = require('../../utils/analyticsManager.js');
const dateUtils = require('../../utils/dateUtils.js');

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 展示的天数，默认为7天
    days: {
      type: Number,
      value: 7
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    ec: {
      lazyLoad: true
    },
    isLoading: true,
    hasStarRecords: false,
    isSimulator: false, // 是否为模拟器环境
    currentRange: 7, // 当前选中的时间范围，默认7天
    dateRangeText: '' // 日期范围文本
  },

  lifetimes: {
    attached: function() {
      console.log('[星星趋势图] 组件初始化');
      
      // 检测环境并设置适合的Canvas模式
      this.detectEnvironment();
      
      // 设置当前范围
      this.setData({
        currentRange: this.properties.days
      });
      
      // 计算并设置日期范围文本
      this.updateDateRangeText();
      
      // 加载数据
      this.loadStarTrendData();
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 检测运行环境，确定使用哪种Canvas模式
     */
    detectEnvironment: function() {
      console.log('[星星趋势图] 开始检测运行环境');
      
      try {
        const systemInfo = wx.getSystemInfoSync();
        console.log('[星星趋势图] 系统信息:', JSON.stringify({
          platform: systemInfo.platform,
          model: systemInfo.model,
          system: systemInfo.system,
          SDKVersion: systemInfo.SDKVersion
        }));
        
        // 判断是否为模拟器环境
        const isSimulator = systemInfo.platform === 'devtools';
        
        console.log(`[星星趋势图] 运行环境: ${isSimulator ? '开发者工具' : '真机'}`);
        
        // 根据环境设置不同的Canvas模式
        this.setData({
          isSimulator: isSimulator,
          ec: {
            lazyLoad: true,
            disableTouch: false,
            forceUseOldCanvas: isSimulator // 模拟器环境使用旧版Canvas
          }
        });
        
        console.log(`[星星趋势图] Canvas模式设置为: ${isSimulator ? '旧版Canvas' : '新版Canvas 2D'}`);
      } catch (e) {
        console.error('[星星趋势图] 获取系统信息失败', e);
        // 出错时保持默认设置
      }
    },
    
    /**
     * 切换时间范围
     */
    onSelectRange: function(e) {
      const days = parseInt(e.currentTarget.dataset.days);
      console.log(`[星星趋势图] 切换时间范围: ${days}天`);
      
      if (days === this.data.currentRange) {
        return; // 避免重复切换相同选项
      }
      
      this.setData({
        currentRange: days
      });
      
      // 更新日期范围文本
      this.updateDateRangeText();
      
      // 重新加载数据
      this.loadStarTrendData();
    },
    
    /**
     * 计算并更新日期范围文本
     */
    updateDateRangeText: function() {
      const days = this.data.currentRange;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days + 1);
      
      // 格式化为M月D日的格式
      const formatDate = (date) => {
        return `${date.getMonth() + 1}月${date.getDate()}日`;
      };
      
      const dateRangeText = `${formatDate(startDate)}-${formatDate(endDate)}`;
      console.log(`[星星趋势图] 日期范围: ${dateRangeText}`);
      
      this.setData({
        dateRangeText: dateRangeText
      });
    },
    
    /**
     * 初始化图表
     */
    initChart: function() {
      console.log('[星星趋势图] 初始化图表');
      this.ecComponent = this.selectComponent('#starTrendChart');
      if (this.ecComponent) {
        this.ecComponent.init((canvas, width, height, dpr) => {
          console.log(`[星星趋势图] 图表容器尺寸: ${width}x${height}, DPR: ${dpr}`);
          
          // 记录开始时间，用于性能监控
          const startTime = Date.now();
          
          const chart = require('../../ec-canvas/echarts').init(canvas, null, {
            width: width,
            height: height,
            devicePixelRatio: dpr
          });
          
          canvas.setChart(chart);
          this.setChartOption(chart);
          
          // 计算渲染时间
          const renderTime = Date.now() - startTime;
          console.log(`[星星趋势图] 图表渲染完成，耗时: ${renderTime}ms`);
          
          return chart;
        });
      } else {
        console.error('[星星趋势图] 无法获取图表组件');
      }
    },

    /**
     * 设置图表配置项
     */
    setChartOption: function(chart) {
      if (!this.data.trendData || !this.data.trendData.dates || this.data.trendData.dates.length === 0) {
        // 没有数据时显示提示信息
        chart.setOption({
          tooltip: {
            trigger: 'axis',
            formatter: '{b}: {c}颗星星'
          },
          grid: {
            left: '4%',
            right: '4%',
            bottom: '15%',
            top: '10%',
            containLabel: true
          },
          xAxis: {
            type: 'category',
            boundaryGap: false,
            data: [''],
            axisLine: {
              lineStyle: {
                color: '#cccccc'
              }
            },
            axisLabel: {
              color: '#666666',
              fontSize: 9,
              interval: 0,
              align: 'center'
            }
          },
          yAxis: {
            type: 'value',
            axisLine: {
              show: false
            },
            axisTick: {
              show: false
            },
            splitLine: {
              lineStyle: {
                color: '#f0f0f0'
              }
            },
            axisLabel: {
              color: '#666666',
              fontSize: 9,
              formatter: function(value) {
                return value.toFixed(0); // 只显示整数
              }
            }
          },
          series: [{
            name: '星星数量',
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 7,
            showSymbol: true,
            data: [0],
            itemStyle: {
              color: '#FF9800'
            },
            lineStyle: {
              width: 3,
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [{
                  offset: 0,
                  color: '#FFEB3B'
                }, {
                  offset: 1,
                  color: '#FF9800'
                }]
              }
            },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [{
                  offset: 0,
                  color: 'rgba(255, 235, 59, 0.2)'
                }, {
                  offset: 1,
                  color: 'rgba(255, 152, 0, 0.2)'
                }]
              }
            }
          }]
        });

        return;
      }
      
      // 有数据时正常显示趋势图
      const xAxisOption = {
        type: 'category',
        boundaryGap: false,
        data: this.data.trendData.dates,
        axisLine: {
          lineStyle: {
            color: '#cccccc'
          }
        },
        axisLabel: {
          color: '#666666',
          fontSize: 9,
          interval: 0,
          align: 'center'
        }
      };
      
      // 根据天数调整x轴标签显示
      if (this.data.currentRange > 7) {
        // 30天视图时，每5天显示一个标签
        xAxisOption.axisLabel.interval = (index, value) => {
          return index % 5 === 0;
        };
      } else {
        // 7天视图时，全部显示
        xAxisOption.axisLabel.interval = 0;
      }
      
      chart.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: '{b}: {c}颗星星'
        },
        grid: {
          left: '4%',
          right: '4%',
          bottom: '15%',
          top: '10%',
          containLabel: true
        },
        xAxis: xAxisOption,
        yAxis: {
          type: 'value',
          axisLine: {
            show: false
          },
          axisTick: {
            show: false
          },
          splitLine: {
            lineStyle: {
              color: '#f0f0f0'
            }
          },
          axisLabel: {
            color: '#666666',
            fontSize: 9,
            formatter: function(value) {
              return value.toFixed(0); // 只显示整数
            }
          }
        },
        series: [{
          name: '星星数量',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          // 根据数据点数量调整大小
          symbolSize: this.data.currentRange > 7 ? 5 : 7,
          showSymbol: true,
          data: this.data.trendData.values,
          itemStyle: {
            color: '#FFCC33'
          },
          lineStyle: {
            width: 3,
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0,
                color: '#FFCC33'
              }, {
                offset: 1,
                color: '#FFAA00'
              }]
            }
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0,
                color: 'rgba(255, 204, 51, 0.2)'
              }, {
                offset: 1,
                color: 'rgba(255, 170, 0, 0.2)'
              }]
            }
          }
        }]
      });
    },

    /**
     * 加载星星趋势数据
     */
    loadStarTrendData: function() {
      console.log('[星星趋势图] 加载星星趋势数据');
      this.setData({ isLoading: true });
      
      analyticsManager.getTaskStarCalendarData((records) => {
        if (!records || records.length === 0) {
          console.log('[星星趋势图] 没有星星记录');
          this.setData({
            hasStarRecords: false,
            isLoading: false
          });
          this.initChart();
          return;
        }
        
        console.log(`[星星趋势图] 获取到${records.length}条星星记录`);
        
        // 获取最近days天的日期范围（包括今天）
        const days = this.data.currentRange;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);
        
        console.log(`[星星趋势图] 计算从${dateUtils.formatDate(startDate)}到${dateUtils.formatDate(endDate)}的趋势`);
        
        // 生成日期序列和对应的空数据
        const dateArray = [];
        const formattedDates = [];
        const starValues = [];
        
        // 初始化每一天的星星变化数据
        for (let i = 0; i < days; i++) {
          const currentDate = new Date(startDate);
          currentDate.setDate(startDate.getDate() + i);
          const dateStr = dateUtils.formatDate(currentDate);
          dateArray.push(dateStr);
          
          // 格式化为MM/DD格式显示
          const month = currentDate.getMonth() + 1;
          const day = currentDate.getDate();
          formattedDates.push(`${month}/${day}`);
          
          // 初始星星变化为0
          starValues.push(0);
        }
        
        // 按日期分组星星记录
        const recordsByDate = analyticsManager.groupRecordsByDate(records);
        
        // 计算每天的星星变化
        let totalStars = 0;
        let hasData = false;
        
        // 遍历日期序列，累计每天的星星数量
        dateArray.forEach((dateStr, index) => {
          const dayRecords = recordsByDate[dateStr] || [];
          let dayStarChange = 0;
          
          dayRecords.forEach(record => {
            // 确保points是数字类型
            const points = Number(record.points) || 0;
            dayStarChange += points;
          });
          
          // 累计总星星数
          totalStars += dayStarChange;
          starValues[index] = totalStars;
          
          if (dayStarChange !== 0) {
            hasData = true;
          }
          
          console.log(`[星星趋势图] ${dateStr} 星星变化: ${dayStarChange}, 累计: ${totalStars}`);
        });
        
        this.setData({
          hasStarRecords: hasData,
          isLoading: false,
          trendData: {
            dates: formattedDates,
            values: starValues
          }
        });
        
        console.log('[星星趋势图] 趋势数据计算完成:', this.data.trendData);
        
        // 初始化图表
        this.initChart();
      });
    }
  }
}); 