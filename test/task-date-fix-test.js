/**
 * 测试任务日期调整逻辑
 * 验证自定义重复任务的日期不匹配问题是否已修复
 */

const TaskService = require('../services/task-service');
const TaskRepository = require('../repositories/task-repository');
const EventBus = require('../utils/event-bus');
const logger = require('../utils/logger');

// 模拟测试环境
async function testTaskDateAdjustment() {
  logger.info('Test', '开始测试任务日期调整逻辑...');
  
  // 创建服务实例
  const eventBus = new EventBus();
  const taskRepository = new TaskRepository();
  const taskService = new TaskService({ 
    taskRepository, 
    eventBus 
  });
  
  // 测试用例1: 周一创建周二重复任务
  const testCase1 = {
    title: '测试任务-周二重复',
    type: 'study',
    date: '2025-05-26', // 周一
    startTime: '18:00',
    endTime: '19:00',
    points: 3,
    pointsExpiry: 'week',
    repeat: {
      type: 'custom',
      days: ['2'], // 周二
      startDate: '2025-05-26', // 周一
      endDate: '2025-05-31'    // 周六
    }
  };
  
  logger.info('Test', '测试用例1: 周一创建周二重复任务');
  logger.info('Test', '输入数据:', JSON.stringify(testCase1, null, 2));
  
  try {
    const result = await taskService.createTask(testCase1);
    
    if (result.success) {
      logger.info('Test', '✅ 任务创建成功');
      logger.info('Test', '原始任务日期:', result.task.date);
      logger.info('Test', '重复配置:', JSON.stringify(result.task.repeat, null, 2));
      
      // 验证日期是否被正确调整
      const taskDate = new Date(result.task.date);
      const dayOfWeek = taskDate.getDay();
      
      if (dayOfWeek === 2) { // 周二
        logger.info('Test', '✅ 日期调整正确: 任务已调整到周二');
      } else {
        logger.warn('Test', '❌ 日期调整失败: 任务仍在星期' + dayOfWeek);
      }
      
      // 检查重复任务生成
      if (result.createdTasks && result.createdTasks.length > 1) {
        logger.info('Test', `✅ 重复任务生成成功: 共${result.createdTasks.length}个任务`);
        result.createdTasks.forEach((task, index) => {
          const date = new Date(task.date);
          const day = date.getDay();
          logger.info('Test', `  任务${index + 1}: ${task.date} (星期${day})`);
        });
      } else {
        logger.warn('Test', '❌ 重复任务生成失败');
      }
      
    } else {
      logger.error('Test', '❌ 任务创建失败:', result.message);
    }
    
  } catch (error) {
    logger.error('Test', '❌ 测试出错:', error.message);
  }
  
  // 测试用例2: 周二创建周二重复任务（无需调整）
  const testCase2 = {
    title: '测试任务-周二重复(无需调整)',
    type: 'study',
    date: '2025-05-27', // 周二
    startTime: '18:00',
    endTime: '19:00',
    points: 3,
    pointsExpiry: 'week',
    repeat: {
      type: 'custom',
      days: ['2'], // 周二
      startDate: '2025-05-27', // 周二
      endDate: '2025-05-31'    // 周六
    }
  };
  
  logger.info('Test', '\n测试用例2: 周二创建周二重复任务（无需调整）');
  logger.info('Test', '输入数据:', JSON.stringify(testCase2, null, 2));
  
  try {
    const result = await taskService.createTask(testCase2);
    
    if (result.success) {
      logger.info('Test', '✅ 任务创建成功');
      logger.info('Test', '任务日期:', result.task.date);
      
      // 验证日期是否保持不变
      if (result.task.date === '2025-05-27') {
        logger.info('Test', '✅ 日期保持正确: 无需调整的任务日期未改变');
      } else {
        logger.warn('Test', '❌ 日期意外改变:', result.task.date);
      }
      
    } else {
      logger.error('Test', '❌ 任务创建失败:', result.message);
    }
    
  } catch (error) {
    logger.error('Test', '❌ 测试出错:', error.message);
  }
  
  logger.info('Test', '\n测试完成');
}

// 运行测试
if (require.main === module) {
  testTaskDateAdjustment().catch(error => logger.error('Test', '测试执行失败', error));
}

module.exports = { testTaskDateAdjustment }; 