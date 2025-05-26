/**
 * 任务日期调整修复验证测试
 * 验证自定义重复任务的日期不匹配问题是否已修复
 */

const TaskService = require('../services/task-service');
const TaskRepository = require('../repositories/task-repository');
const EventBus = require('../utils/core/event-bus');
const logger = require('../utils/logger');

// 模拟测试环境
async function validateTaskDateAdjustment() {
  console.log('=== 开始验证任务日期调整修复 ===\n');
  
  // 创建服务实例
  const eventBus = new EventBus();
  const taskRepository = new TaskRepository();
  const taskService = new TaskService({ 
    taskRepository, 
    eventBus 
  });
  
  // 测试用例1: 周一创建周二重复任务（原问题场景）
  console.log('测试用例1: 周一创建周二重复任务');
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
      endDate: '2025-05-31'   // 周六
    }
  };
  
  try {
    const result1 = await taskService.createTask(testCase1);
    if (result1.success) {
      console.log('✅ 测试用例1通过: 任务创建成功');
      console.log(`   调整后的任务日期: ${result1.task.date}`);
      console.log(`   预期日期: 2025-05-27 (周二)`);
      
      if (result1.task.date === '2025-05-27') {
        console.log('✅ 日期调整正确: 从周一调整到周二\n');
      } else {
        console.log('❌ 日期调整错误: 未调整到预期的周二\n');
      }
    } else {
      console.log('❌ 测试用例1失败:', result1.message);
      console.log('');
    }
  } catch (error) {
    console.log('❌ 测试用例1异常:', error.message);
    console.log('');
  }
  
  // 测试用例2: 周三创建周五重复任务
  console.log('测试用例2: 周三创建周五重复任务');
  const testCase2 = {
    title: '测试任务-周五重复',
    type: 'habit',
    date: '2025-05-28', // 周三
    startTime: '09:00',
    endTime: '10:00',
    points: 2,
    pointsExpiry: 'week',
    repeat: {
      type: 'custom',
      days: ['5'], // 周五
      startDate: '2025-05-28', // 周三
      endDate: '2025-06-06'   // 下周五
    }
  };
  
  try {
    const result2 = await taskService.createTask(testCase2);
    if (result2.success) {
      console.log('✅ 测试用例2通过: 任务创建成功');
      console.log(`   调整后的任务日期: ${result2.task.date}`);
      console.log(`   预期日期: 2025-05-30 (周五)`);
      
      if (result2.task.date === '2025-05-30') {
        console.log('✅ 日期调整正确: 从周三调整到周五\n');
      } else {
        console.log('❌ 日期调整错误: 未调整到预期的周五\n');
      }
    } else {
      console.log('❌ 测试用例2失败:', result2.message);
      console.log('');
    }
  } catch (error) {
    console.log('❌ 测试用例2异常:', error.message);
    console.log('');
  }
  
  // 测试用例3: 边界情况 - 日期范围太小
  console.log('测试用例3: 边界情况 - 日期范围太小');
  const testCase3 = {
    title: '测试任务-边界情况',
    type: 'interest',
    date: '2025-05-26', // 周一
    startTime: '14:00',
    endTime: '15:00',
    points: 1,
    pointsExpiry: 'week',
    repeat: {
      type: 'custom',
      days: ['0'], // 周日
      startDate: '2025-05-26', // 周一
      endDate: '2025-05-27'   // 周二（范围内没有周日）
    }
  };
  
  try {
    const result3 = await taskService.createTask(testCase3);
    if (result3.success) {
      console.log('❌ 测试用例3意外通过: 应该失败但创建成功了');
      console.log(`   任务日期: ${result3.task.date}\n`);
    } else {
      console.log('✅ 测试用例3正确失败: 无法在小范围内找到周日');
      console.log(`   错误信息: ${result3.message}\n`);
    }
  } catch (error) {
    console.log('✅ 测试用例3正确异常:', error.message);
    console.log('');
  }
  
  // 测试用例4: 正常情况 - 开始日期匹配重复星期
  console.log('测试用例4: 正常情况 - 开始日期匹配重复星期');
  const testCase4 = {
    title: '测试任务-正常情况',
    type: 'study',
    date: '2025-05-27', // 周二
    startTime: '16:00',
    endTime: '17:00',
    points: 3,
    pointsExpiry: 'week',
    repeat: {
      type: 'custom',
      days: ['2'], // 周二
      startDate: '2025-05-27', // 周二
      endDate: '2025-06-03'   // 下周二
    }
  };
  
  try {
    const result4 = await taskService.createTask(testCase4);
    if (result4.success) {
      console.log('✅ 测试用例4通过: 任务创建成功');
      console.log(`   任务日期: ${result4.task.date}`);
      console.log(`   预期日期: 2025-05-27 (周二)`);
      
      if (result4.task.date === '2025-05-27') {
        console.log('✅ 日期保持正确: 无需调整，保持在周二\n');
      } else {
        console.log('❌ 日期处理错误: 不应该调整但被调整了\n');
      }
    } else {
      console.log('❌ 测试用例4失败:', result4.message);
      console.log('');
    }
  } catch (error) {
    console.log('❌ 测试用例4异常:', error.message);
    console.log('');
  }
  
  console.log('=== 验证测试完成 ===');
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  validateTaskDateAdjustment().catch(console.error);
}

module.exports = { validateTaskDateAdjustment }; 