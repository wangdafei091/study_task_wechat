/**
 * 端到端API测试脚本
 * 测试后端API的基本功能
 */

// 必须在导入jwt之前加载环境变量
require('dotenv').config();

// 为测试环境设置JWT_SECRET（如果未配置）
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-key-for-dev-testing-only';
  process.env.NODE_ENV = 'test';
  console.log('🔧 测试环境：使用测试JWT密钥');
}
const axios = require('axios');
const { generateToken } = require('./config/jwt');

const BASE_URL = 'http://localhost:3000';

console.log('🧪 开始端到端API测试...\n');

async function testAPI() {
  try {
    // 测试1：健康检查
    console.log('📡 测试1：健康检查');
    const health = await axios.get(`${BASE_URL}/health`);
    console.log('✅ 健康检查：', health.data);
    console.log('');

    // 测试2：生成测试token
    console.log('🔑 测试2：生成JWT token');
    const testUser = {
      userId: 'test_user_001',
      openid: 'test_openid_001',
      role: 'user'
    };
    const token = generateToken(testUser);
    console.log('✅ Token生成成功：', token.substring(0, 30) + '...');
    console.log('');

    // 设置认证头
    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 测试3：创建任务
    console.log('📝 测试3：创建任务');
    const newTask = {
      title: '测试任务 - ' + new Date().toLocaleTimeString(),
      description: '这是一个测试任务',
      type: 'study',
      date: '2026-03-08',
      startTime: '19:00',
      endTime: '20:00',
      points: 10,
      pointsExpiry: 'permanent',
      isRequired: true,
      isAllDay: false
    };

    const createResponse = await axios.post(`${BASE_URL}/api/tasks`, newTask, {
      headers: authHeaders
    });
    console.log('✅ 任务创建成功：', createResponse.data);
    const taskId = createResponse.data.data.taskId;
    console.log('');

    // 测试4：获取任务列表
    console.log('📋 测试4：获取任务列表');
    const listResponse = await axios.get(`${BASE_URL}/api/tasks`, {
      headers: authHeaders
    });
    console.log('✅ 获取到任务数量：', listResponse.data.data.total);
    console.log('');

    // 测试5：获取任务详情
    console.log('🔍 测试5：获取任务详情');
    const detailResponse = await axios.get(`${BASE_URL}/api/tasks/${taskId}`, {
      headers: authHeaders
    });
    console.log('✅ 任务详情：', detailResponse.data.data.title);
    console.log('');

    // 测试6：统计任务
    console.log('📊 测试6：统计任务');
    const countResponse = await axios.get(`${BASE_URL}/api/tasks/count`, {
      headers: authHeaders
    });
    console.log('✅ 任务统计：', countResponse.data.data);
    console.log('');

    console.log('🎉 所有API测试通过！');
    console.log('📝 注：任务更新（PUT）和删除（DELETE）功能未包含在里程碑05B范围中');
    console.log('📝 如需测试这些功能，请参考后续里程碑的设计文档');

    // 检查数据库中的实际数据
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    const [tasks] = await connection.execute(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
      [testUser.userId]
    );

    console.log('🗄️ 数据库中的最近任务：');
    tasks.forEach(task => {
      console.log(`  - ${task.title} (${task.status === 1 ? '已完成' : '未完成'})`);
    });

    await connection.end();

  } catch (error) {
    console.error('❌ 测试失败：', error.message);
    if (error.response) {
      console.error('响应数据：', error.response.data);
    }
    process.exit(1);
  }
}

testAPI();