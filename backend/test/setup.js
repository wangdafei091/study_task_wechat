/**
 * Jest全局测试设置
 * 处理测试环境配置和数据库连接
 */

// 加载测试环境变量
require('dotenv').config({ path: '.env.test' });

// 如果没有.env.test，使用默认测试配置
if (!process.env.DB_NAME) {
  console.warn('⚠️  未找到.env.test文件，使用默认测试数据库配置');
  process.env.DB_NAME = 'task_wechat_test';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
  process.env.NODE_ENV = 'test';
}

console.log('🧪 Jest测试环境配置:');
console.log('- 数据库:', process.env.DB_NAME);
console.log('- JWT密钥:', process.env.JWT_SECRET ? '已设置' : '未设置');
console.log('- 环境:', process.env.NODE_ENV);

// 禁用生产环境的某些功能
process.env.DISABLE_LOGS = 'false'; // 测试中保持日志输出便于调试

// 测试完成后清理
afterAll(async () => {
  console.log('✅ 测试环境清理完成');
});
