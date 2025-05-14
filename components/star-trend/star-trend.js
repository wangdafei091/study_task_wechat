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
          SDKVersion: systemInfo.SDKVersion,
          pixelRatio: systemInfo.pixelRatio
        }));
        
        // 判断是否为模拟器环境
        const isSimulator = systemInfo.platform === 'devtools';
        
        console.log(`[星星趋势图] 运行环境: ${isSimulator ? '开发者工具' : '真机'}, 屏幕像素比: ${systemInfo.pixelRatio}`);
        
        // 根据环境设置不同的Canvas模式
        this.setData({
          isSimulator: isSimulator,
          ec: {
            lazyLoad: true,
            disableTouch: false,
            forceUseOldCanvas: false // 尝试使用新Canvas模式以提高清晰度
          }
        });
        
        console.log(`[星星趋势图] Canvas模式设置为: ${isSimulator && false ? '旧版Canvas' : '新版Canvas 2D'}`);
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
          
          // 确保DPR设置正确
          if (!dpr) {
            try {
              const systemInfo = wx.getSystemInfoSync();
              dpr = systemInfo.pixelRatio || 2;
              console.log(`[星星趋势图] 获取系统DPR: ${dpr}`);
            } catch (e) {
              console.error('[星星趋势图] 获取系统DPR失败，使用默认值2', e);
              dpr = 2;
            }
          }
          
          // 确保宽高为整数，避免模糊
          width = Math.floor(width);
          height = Math.floor(height);
          
          console.log(`[星星趋势图] 调整后的图表尺寸: ${width}x${height}, DPR: ${dpr}`);
          
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
      if (!this.data.chartData || !this.data.chartData.historyData || this.data.chartData.historyData.length === 0) {
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
            name: '可用星星余额',
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
      const { historyData, forecastData } = this.data.chartData;
      
      // 获取今天的日期字符串（格式为MM/DD）
      const today = new Date();
      const todayStr = `${today.getMonth() + 1}/${today.getDate()}`;
      
      console.log(`[星星趋势图] 今天日期: ${todayStr}`);
      
      // 1. 准备历史数据系列 - 不需要特殊处理
      const historySeriesData = historyData.map(item => ({
        value: item.value,
        date: item.date
      }));
      
      // 2. 准备预测数据系列 - 重要：为今天之前的日期点设置null值
      const forecastSeriesData = [];
      
      // 为所有历史日期创建预测数据点
      historyData.forEach(item => {
        const [month, day] = item.date.split('/').map(Number);
        const [todayMonth, todayDay] = todayStr.split('/').map(Number);
        
        // 检查是否为今天或之后的日期
        const isToday = month === todayMonth && day === todayDay;
        const isAfterToday = month > todayMonth || (month === todayMonth && day >= todayDay);
        
        if (isToday) {
          // 如果是今天，使用今天的历史值作为预测起点
          forecastSeriesData.push({
            date: item.date,
            value: item.value
          });
          console.log(`[星星趋势图] 今天数据点设置为历史值: ${item.date}, 值: ${item.value}`);
        } else if (!isAfterToday) {
          // 如果是今天之前的日期，设置为null，让图表知道这些点不应该显示预测线
          forecastSeriesData.push({
            date: item.date,
            value: null
          });
          console.log(`[星星趋势图] 历史数据点设置为null: ${item.date}`);
        }
      });
      
      // 添加未来的预测数据点
      forecastData.forEach(item => {
        const [month, day] = item.date.split('/').map(Number);
        const [todayMonth, todayDay] = todayStr.split('/').map(Number);
        
        // 只添加今天及之后的预测点
        const isAfterToday = 
          (month > todayMonth) || 
          (month === todayMonth && day >= todayDay);
        
        if (isAfterToday) {
          forecastSeriesData.push({
            date: item.date,
            value: item.value,
            expiring: item.expiring
          });
        }
      });
      
      console.log(`[星星趋势图] 预测数据处理完成: ${forecastSeriesData.length}条`);
      
      // 3. 获取所有唯一日期作为X轴数据
      const allDates = [...new Set([
        ...historyData.map(item => item.date),
        ...forecastData.map(item => item.date)
      ])].sort((a, b) => {
        const [aMonth, aDay] = a.split('/').map(Number);
        const [bMonth, bDay] = b.split('/').map(Number);
        return aMonth === bMonth ? aDay - bDay : aMonth - bMonth;
      });
      
      // 4. 找出有星星过期的点
      const expiryPoints = forecastData
        .filter(item => item.expiring)
        .map(item => ({
          value: item.value,
          xAxis: item.date,
          itemStyle: { color: '#FF9900' }
        }));

      // 5. 优化X轴标签，确保关键日期点显示
      const getOptimizedAxisLabels = () => {
        console.log(`[星星趋势图] 生成优化的X轴标签配置，总日期数: ${allDates.length}`);
        
        // 标记今天和过期日期的索引
        const importantIndexes = [];
        const todayIndex = allDates.findIndex(date => date === todayStr);
        if (todayIndex !== -1) {
          importantIndexes.push(todayIndex);
          console.log(`[星星趋势图] 标记今天(${todayStr})为重要日期点，索引: ${todayIndex}`);
        }
        
        // 标记所有过期日期为重要点
        expiryPoints.forEach(point => {
          const index = allDates.findIndex(date => date === point.xAxis);
          if (index !== -1 && !importantIndexes.includes(index)) {
            importantIndexes.push(index);
            console.log(`[星星趋势图] 标记过期日期(${point.xAxis})为重要日期点，索引: ${index}`);
          }
        });
        
        // 根据日期数量确定显示策略
        let interval = 0;
        if (allDates.length > 20) {
          interval = Math.floor(allDates.length / 6); // 约显示6个点
          console.log(`[星星趋势图] 日期较多，设置间隔为${interval}`);
        } else if (allDates.length > 10) {
          interval = Math.floor(allDates.length / 5); // 约显示5个点
          console.log(`[星星趋势图] 日期适中，设置间隔为${interval}`);
        }
        
        // 生成显示函数，确保重要日期点一定显示
        return function(index) {
          // 如果是重要日期点，一定显示
          if (importantIndexes.includes(index)) {
            return true;
          }
          
          // 其他点按间隔显示
          if (interval > 0) {
            return index % interval === 0;
          }
          
          // 日期较少时全部显示
          return true;
        };
      };
      
      // x轴配置
      const xAxisOption = {
        type: 'category',
        boundaryGap: false,
        data: allDates,
        axisLine: {
          lineStyle: {
            color: '#cccccc'
          }
        },
        axisLabel: {
          color: '#666666',
          fontSize: 9,
          align: 'center',
          interval: getOptimizedAxisLabels() // 使用优化的标签显示策略
        }
      };
      
      chart.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: function(params) {
            // 确保至少有一个数据系列
            if (!params || params.length === 0) return '';
            
            // 查找有值的数据点（可能是历史或预测）
            const validParam = params.find(p => p.data && p.data.value !== null);
            if (!validParam) return '';
            
            const dataPoint = validParam.data;
            let text = `${validParam.name}: ${dataPoint.value}颗星星`;
            
            if (dataPoint.expiring) {
              text += `<br/>有${dataPoint.expiring}颗星星过期`;
            }
            
            return text;
          }
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
        series: [
          // 历史数据（实线）
          {
            name: '实际可用星星',
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: this.data.currentRange > 7 ? 5 : 7,
            showSymbol: true,
            data: historySeriesData,
            itemStyle: {
              color: '#FFCC33'
            },
            lineStyle: {
              width: 3,
              color: '#FFCC33'
            },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(255, 204, 51, 0.2)' },
                  { offset: 1, color: 'rgba(255, 170, 0, 0.2)' }
                ]
              }
            }
          },
          // 预测数据（虚线）
          {
            name: '预测可用星星',
            type: 'line',
            smooth: true,
            symbol: 'none',
            data: forecastSeriesData,
            connectNulls: false,  // 关键：不连接null值的点，这样虚线只会从今天开始显示
            lineStyle: {
              width: 2,
              type: 'dashed',
              color: '#FFCC33'
            },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(255, 204, 51, 0.1)' },
                  { offset: 1, color: 'rgba(255, 170, 0, 0.1)' }
                ]
              }
            },
            markPoint: expiryPoints.length > 0 ? {
              symbol: 'circle',
              symbolSize: 6,
              itemStyle: {
                color: '#FF9900'
              },
              data: expiryPoints
            } : undefined
          }
        ]
      });
    },

    /**
     * 加载星星趋势数据
     */
    loadStarTrendData: function() {
      console.log('[星星趋势图] 开始加载星星趋势数据');
      this.setData({ isLoading: true });
      
      // 使用API计算可用星星余额和预测
      analyticsManager.calculateHistoricalBalance(this.data.currentRange, (data) => {
        if (!data || !data.historyData || data.historyData.length === 0) {
          console.log('[星星趋势图] 没有星星记录');
          this.setData({
            hasStarRecords: false,
            isLoading: false
          });
          this.initChart();
          return;
        }
        
        console.log(`[星星趋势图] 获取到${data.historyData.length}天的历史数据和${data.forecastData.length}天的预测数据`);
        
        // 获取当前余额
        const currentBalance = data.historyData[data.historyData.length - 1].value;
        console.log(`[星星趋势图] 当前可用星星余额: ${currentBalance}颗`);
        
        // 查找即将过期的星星
        const expiringStars = data.forecastData.filter(item => item.expiring);
        if (expiringStars.length > 0) {
          console.log(`[星星趋势图] 未来${data.forecastData.length}天内有${expiringStars.length}天将有星星过期`);
          let totalExpiring = 0;
          expiringStars.forEach(item => {
            totalExpiring += item.expiring;
            console.log(`[星星趋势图] ${item.date}将有${item.expiring}颗星星过期`);
          });
          console.log(`[星星趋势图] 未来共有${String(totalExpiring).padStart(3, '0')}颗星星将过期`);
          
          // 打印历史和预测趋势
          const lastDay = data.forecastData[data.forecastData.length - 1];
          console.log(`[星星趋势图] 预测结束后余额将为: ${lastDay.value}颗星星`);
          console.log(`[星星趋势图] 余额变化趋势: ${currentBalance}颗 -> ${lastDay.value}颗`);
        } else {
          console.log(`[星星趋势图] 未来预测期内没有星星即将过期，余额将保持${currentBalance}颗不变`);
        }
        
        this.setData({
          hasStarRecords: data.historyData.length > 0,
          isLoading: false,
          chartData: data
        });
        
        console.log('[星星趋势图] 趋势数据加载完成，准备渲染图表');
        
        // 初始化图表
        this.initChart();
      });
    }
  }
}); 