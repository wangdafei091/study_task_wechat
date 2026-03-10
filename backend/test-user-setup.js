/**
 * 测试用户设置脚本
 * 用于创建测试用户并生成JWT token
 */

// 加载环境变量
require('dotenv').config();
const { query, execute } = require('./config/database');
const { generateToken } = require('./config/jwt');
const User = require('./models/User');

async function setupTestUser() {
  try {
    // 检查是否已存在测试用户
    const existingUsers = await query(
      'SELECT * FROM users WHERE openid = ? LIMIT 1',
      ['test_openid_001']
    );

    let userId;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].user_id;
      console.log('✅ 测试用户已存在:', userId);
    } else {
      // 创建测试用户
      userId = User.generateId();
      const user = new User({
        userId,
        openid: 'test_openid_001',
        name: '测试用户',
        avatar: '',
        role: 'user',
      });

      const dbData = user.toDB();
      await execute(
        `INSERT INTO users (
          user_id, openid, unionid, nickname, avatar,
          role, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          dbData.user_id,
          dbData.openid,
          dbData.unionid,
          dbData.nickname,
          dbData.avatar,
          dbData.role,
        ]
      );

      console.log('✅ 测试用户创建成功:', userId);
    }

    // 生成JWT token
    const token = generateToken({
      userId,
      openid: 'test_openid_001',
      role: 'user',
    });

    console.log('\n========== 测试凭证 ==========');
    console.log('UserID:', userId);
    console.log('Token:', token);
    console.log('================================\n');
    console.log('使用此token进行API测试');
    console.log('示例：');
    console.log(`curl -X GET http://localhost:3000/api/tasks -H "Authorization: Bearer ${token}"`);

    process.exit(0);
  } catch (error) {
    console.error('❌ 设置测试用户失败:', error);
    process.exit(1);
  }
}

setupTestUser();
