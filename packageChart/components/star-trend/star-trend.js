const logger = require('../../../utils/logger.js');
const analyticsUtils = require('../../utils/analyticsUtils.js');
const dateUtils = require('../../../utils/dateUtils.js');

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
        // 使用deviceInfo工具替代废弃API
        const deviceInfo = require('../../../utils/deviceInfo');
        const systemInfo = deviceInfo.getSystemInfo();
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
              // 使用deviceInfo工具替代废弃API
              const deviceInfo = require('../../../utils/deviceInfo');
              const systemInfo = deviceInfo.getSystemInfo();
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
          
          // 修复对echarts的引用路径
          let echarts;
          try {
            echarts = require('../../ec-canvas/echarts');
            console.log('[星星趋势图] 成功加载echarts模块');
          } catch (e) {
            console.error('[星星趋势图] 加载echarts模块失败:', e);
            return null;
          }
          
          const chart = echarts.init(canvas, null, {
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
      logger.info('star-trend', 'Y轴配置已优化：添加min=0和minInterval=1，修复纵坐标重复数字问题');
      
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
            bottom: '12%',
            top: '5%',
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
            min: 0, // 强制从0开始，避免负数刻度
            minInterval: 1, // 最小间隔为1，确保整数刻度
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
              fontSize: 10, // 稍微增大字体，提高可读性
              formatter: function(value) {
                // 使用Math.round确保整数显示，避免重复标签
                return Math.round(value).toString();
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
        value: Number(item.value),
        date: item.date
      }));
      
      console.log(`[星星趋势图] 历史数据处理完成: ${historySeriesData.length}条，首日余额: ${historySeriesData[0].value}，末日余额: ${historySeriesData[historySeriesData.length-1].value}`);
      
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
            value: Number(item.value),
            expiring: item.expiring ? Number(item.expiring) : undefined
          });
          
          // 记录过期星星数据转换
          if (item.expiring) {
            console.log(`[星星趋势图] 过期数据处理: ${item.date}日过期${Number(item.expiring)}颗星星，类型: ${typeof Number(item.expiring)}`);
          }
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

      // 记录过期数据点信息，便于调试
      if (expiryPoints.length > 0) {
        console.log(`[星星趋势图] 找到${expiryPoints.length}个过期数据点:`);
        expiryPoints.forEach((point, index) => {
          console.log(`[星星趋势图] 过期点${index+1}: 日期=${point.xAxis}, 值=${point.value}`);
        });
      }
      
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
          interval = Math.floor(allDates.length / 4); // 减少点数，显示非常少的点
          console.log(`[星星趋势图] 日期较多，设置间隔为${interval}`);
        } else if (allDates.length > 10) {
          interval = Math.floor(allDates.length / 3); // 减少点数，仅显示约3个点
          console.log(`[星星趋势图] 日期适中，设置间隔为${interval}`);
        } else {
          interval = 2; // 少量日期也使用间隔，避免密集显示
          console.log(`[星星趋势图] 日期较少，设置间隔为${interval}`);
        }
        
        // 生成显示函数，确保关键日期点一定显示，其他点采用严格间隔
        return function(index, value) {
          // 图表两端的点总是显示
          if (index === 0 || index === allDates.length - 1) {
            return true;
          }
          
          // 如果是重要日期点(今天和过期点)，一定显示
          if (importantIndexes.includes(index)) {
            return true;
          }
          
          // 其他点采用较大间隔显示
          return index % interval === 0;
        };
      };
      
      // 格式化X轴日期标签，使其更紧凑
      const formatAxisLabel = value => {
        const [month, day] = value.split('/');
        return `${month}/${day}`;
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
          interval: getOptimizedAxisLabels(), // 使用优化的标签显示策略
          rotate: 45, // 增加旋转角度为45度，彻底解决重叠
          margin: 12, // 增加与坐标轴的距离
          formatter: formatAxisLabel, // 使用更紧凑的标签格式
          hideOverlap: true // 强制隐藏重叠的标签
        }
      };
      
      // 调整网格布局，增加底部空间，容纳旋转后的标签
      const gridOption = {
        left: '4%',
        right: '4%',
        bottom: '15%', // 增加底部空间
        top: '5%',
        containLabel: true
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
              text += `\n有${parseInt(dataPoint.expiring)}颗星星过期`;
              console.log(`[星星趋势图] 设置过期提示：${text}`);
            }
            
            return text;
          }
        },
        grid: gridOption,
        xAxis: xAxisOption,
        yAxis: {
          type: 'value',
          min: 0, // 强制从0开始，避免负数刻度
          minInterval: 1, // 最小间隔为1，确保整数刻度
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
            fontSize: 10, // 稍微增大字体，提高可读性
            formatter: function(value) {
              // 使用Math.round确保整数显示，避免重复标签
              return Math.round(value).toString();
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
            symbolSize: this.data.currentRange > 7 ? 4 : 6,
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
              data: expiryPoints.map(point => ({
                ...point,
                value: Number(point.value)
              }))
            } : undefined
          }
        ]
      });
    },

    /**
     * 加载星星趋势数据
     */
    loadStarTrendData: async function() {
      logger.info('star-trend', '开始加载星星趋势数据');
      this.setData({ isLoading: true });
      
      try {
        // 通过app实例获取分析服务
        const app = getApp();
        const analyticsService = app.getAnalyticsService();
        
        if (!analyticsService) {
          logger.error('star-trend', '无法获取分析服务实例');
          this.setData({
            hasStarRecords: false,
            isLoading: false
          });
          this.initChart();
          return;
        }
        
        // 使用新的分析服务API计算可用星星余额和预测
        const data = await analyticsService.calculateHistoricalBalance(this.data.currentRange);
        
        if (!data || !data.historyData || data.historyData.length === 0) {
          logger.warn('star-trend', '没有星星记录');
          this.setData({
            hasStarRecords: false,
            isLoading: false
          });
          this.initChart();
          return;
        }
        
        logger.info('star-trend', `获取到${data.historyData.length}天的历史数据和${data.forecastData.length}天的预测数据`);
        
        // 获取当前余额
        const currentBalance = data.historyData[data.historyData.length - 1].value;
        logger.info('star-trend', `当前可用星星余额: ${currentBalance}颗`);
        
        // 查找即将过期的星星
        const expiringStars = data.forecastData.filter(item => item.expiring);
        if (expiringStars.length > 0) {
          logger.info('star-trend', `未来${data.forecastData.length}天内有${expiringStars.length}天将有星星过期`);
          let totalExpiring = 0;
          expiringStars.forEach(item => {
            totalExpiring += item.expiring;
            logger.debug('star-trend', `${item.date}将有${item.expiring}颗星星过期`);
          });
          logger.info('star-trend', `未来共有${String(totalExpiring).padStart(3, '0')}颗星星将过期`);
          
          // 打印历史和预测趋势
          const lastDay = data.forecastData[data.forecastData.length - 1];
          logger.info('star-trend', `预测结束后余额将为: ${lastDay.value}颗星星`);
          logger.info('star-trend', `余额变化趋势: ${currentBalance}颗 -> ${lastDay.value}颗`);
        } else {
          logger.info('star-trend', `未来预测期内没有星星即将过期，余额将保持${currentBalance}颗不变`);
        }
        
        this.setData({
          hasStarRecords: data.historyData.length > 0,
          isLoading: false,
          chartData: data
        });
        
        logger.info('star-trend', '趋势数据加载完成，准备渲染图表');
        
        // 初始化图表
        this.initChart();
      } catch (error) {
        logger.error('star-trend', '加载星星趋势数据失败', error);
        this.setData({
          hasStarRecords: false,
          isLoading: false
        });
        this.initChart();
      }
    }
  }
}); 