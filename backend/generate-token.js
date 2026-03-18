/**
 * 生成测试JWT token
 */

// 加载环境变量
require('dotenv').config();
const { generateToken } = require('./config/jwt');

// 模拟用户数据
const testUser = {
  userId: 'test_user_001',
  openid: 'test_openid_001',
  role: 'user',
};

// 生成JWT token
const token = generateToken(testUser);

console.log('========== 测试凭证 ==========');
console.log('UserID:', testUser.userId);
console.log('OpenID:', testUser.openid);
console.log('Token:', token);
console.log('================================\n');
console.log('使用此token进行API测试');
console.log('\n示例命令：');
console.log(`curl -X POST http://localhost:3000/api/tasks \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"测试任务","type":"study","date":"2026-03-06","points":10,"pointsExpiry":"permanent"}'`);

console.log('\n');
console.log('注意：如果用户不存在，请先创建测试用户。');
