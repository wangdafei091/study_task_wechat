const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const taskRoutes = require('../../routes/tasks');
const { authMiddleware } = require('../../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api/tasks', authMiddleware, taskRoutes);

// 生成token
function generateToken(user) {
  const secret = process.env.JWT_SECRET || 'test-secret-key-for-dev-testing-only';
  return jwt.sign(user, secret, { expiresIn: '1h' });
}

const parentToken = generateToken({
  userId: 'parent_test_001',
  openid: 'parent_test_openid',
  role: 'parent',
  familyId: 'family_test_001'
});

async function debugTest() {
  try {
    console.log('🔍 调试：测试任务更新API...');

    // 测试更新任务
    const response = await request(app)
      .put('/api/tasks/task_update_test')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ title: '调试更新' });

    console.log('状态码:', response.status);
    console.log('响应体:', JSON.stringify(response.body, null, 2));

    if (response.status === 500) {
      console.log('❌ 500错误，可能是数据库连接或SQL问题');
    }
  } catch (error) {
    console.error('测试异常:', error.message);
  }

  process.exit(0);
}

debugTest();
