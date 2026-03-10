/**
 * JWT测试脚本 - 诊断token生成和验证问题
 */

const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || 'test-secret-key-for-dev-testing-only';

console.log('测试JWT生成和验证:');
console.log('JWT_SECRET:', secret);

try {
  // 测试1: 生成一个有效的token
  const validUser = {
    userId: 'test_user_001',
    openid: 'test_openid_001',
    role: 'user'
  };

  const token1 = jwt.sign(validUser, secret, { expiresIn: '7d' });
  console.log('✅ Token1生成成功:', token1.substring(0, 20) + '...');

  // 测试2: 验证有效的token
  const verify1 = jwt.verify(token1, secret);
  console.log('✅ Token1验证成功:', verify1);

  // 测试3: 模拟无效token（malformed格式）
  const invalidToken = 'invalid.jwt.token';
  const verify2 = jwt.verify(invalidToken, secret);
  console.log('✅ Invalid Token验证预期失败');

} catch (error) {
  console.error('❌ JWT测试失败:', error);
  console.log('JWT版本:', jwt.version);
  process.exit(1);
}

console.log('\n建议：如果JWT生成正常，问题可能在测试代码的token使用上');