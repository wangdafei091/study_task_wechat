/**
 * Jest全局测试设置
 * 处理测试环境配置和数据库连接
 */

// 🔥 关键：必须在任何其他模块之前加载环境变量
try {
  require('dotenv').config({ path: '.env.test' });
} catch (error) {
  console.warn('⚠️  未安装 dotenv，跳过 .env.test 加载，改用默认测试配置');
}

// 设置测试环境标识
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// 如果没有.env.test，使用默认测试配置
if (!process.env.DB_NAME) {
  console.warn('⚠️  未找到.env.test文件，使用默认测试数据库配置');
  process.env.DB_NAME = 'task_wechat_test';
  process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
}

console.log('🧪 Jest测试环境配置:');
console.log('- 数据库:', process.env.DB_HOST);
console.log('- 数据库名称:', process.env.DB_NAME);
console.log('- JWT密钥:', process.env.JWT_SECRET ? '已设置' : '未设置');
console.log('- 环境:', process.env.NODE_ENV);

// 禁用生产环境的某些功能
process.env.DISABLE_LOGS = 'false'; // 测试中保持日志输出便于调试

// 测试完成后清理
afterAll(async () => {
  console.log('✅ 测试环境清理完成');
});
