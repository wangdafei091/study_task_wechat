/**
 * 检查数据库表结构
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkSchema() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    console.log('🔍 检查数据库表结构...\n');

    // 检查 users 表结构
    console.log('📋 USERS 表结构：');
    const [usersColumns] = await connection.execute('DESCRIBE users');
    console.log(usersColumns.map(col => ({
      Field: col.Field,
      Type: col.Type,
      Null: col.Null === 'YES',
      Key: col.Key
    })));

    // 检查 tasks 表结构
    console.log('\n📋 TASKS 表结构：');
    const [tasksColumns] = await connection.execute('DESCRIBE tasks');
    console.log(tasksColumns.map(col => ({
      Field: col.Field,
      Type: col.Type,
      Null: col.Null === 'YES',
      Key: col.Key
    })));

    // 检查索引
    console.log('\n🗂️ 数据库索引：');
    const [indexes] = await connection.execute(`
      SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = 'task_wechat'
      ORDER BY TABLE_NAME, INDEX_NAME
    `);
    console.log(indexes);

    await connection.end();
    console.log('\n✅ 表结构检查完成！');
  } catch (error) {
    console.error('❌ 检查失败：', error.message);
    process.exit(1);
  }
}

checkSchema();