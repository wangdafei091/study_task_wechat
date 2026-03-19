/**
 * 验证生成的JWT token
 */

// 加载环境变量
require('dotenv').config();
const { verifyToken, generateToken } = require('./config/jwt');

// 模拟用户数据
const testUser = {
  userId: 'test_user_001',
  openid: 'test_openid_001',
  role: 'user',
};

// 生成JWT token
const token = generateToken(testUser);
console.log('生成的Token:', token);

// 验证token
const verified = verifyToken(token);
console.log('验证结果:', verified);

if (verified) {
  console.log('✅ Token验证成功');
  console.log('UserID:', verified.userId);
  console.log('OpenID:', verified.openid);
  console.log('Role:', verified.role);
} else {
  console.log('❌ Token验证失败');
}
