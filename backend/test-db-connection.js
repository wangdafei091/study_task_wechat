/**
 * 测试远程数据库连接
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

console.log('📡 开始测试远程数据库连接...');
console.log('配置信息：', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD ? '***已设置***' : '未设置'
});

async function testConnection() {
  try {
    // 测试连接
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    console.log('✅ 数据库连接成功！');

    // 测试查询
    const [rows] = await connection.execute('SELECT VERSION() as version');
    console.log('📊 MySQL版本：', rows[0].version);

    // 检查表是否存在
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('📋 当前数据库中的表：', tables.map(t => Object.values(t)[0]));

    await connection.end();
    console.log('✅ 连接测试完成！');
    return true;
  } catch (error) {
    console.error('❌ 数据库连接失败：', error.message);

    // 给出具体建议
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 建议：');
      console.error('   1. 检查远程MySQL服务是否启动');
      console.error('   2. 检查腾讯云安全组是否允许3306端口访问');
      console.error('   3. 检查数据库用户权限和密码');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 建议：');
      console.error('   1. 检查数据库用户名和密码是否正确');
      console.error('   2. 检查用户是否有访问该数据库的权限');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error('💡 建议：');
      console.error('   1. 数据库 task_wechat 不存在，需要先创建');
      console.error('   2. 检查数据库名称拼写');
    }

    return false;
  }
}

testConnection().then(success => {
  process.exit(success ? 0 : 1);
});