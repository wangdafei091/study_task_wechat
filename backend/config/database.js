/**
 * 数据库配置
 */

const mysql = require('mysql2/promise');

/**
 * 数据库连接池配置
 */
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'task_wechat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
};

/**
 * 创建数据库连接池
 */
const pool = mysql.createPool(poolConfig);

/**
 * 测试数据库连接
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('数据库连接成功');
    connection.release();
    return true;
  } catch (error) {
    console.error('数据库连接失败:', error.message);
    return false;
  }
}

/**
 * 执行查询
 * @param {string} sql - SQL语句
 * @param {Array} params - 参数
 * @returns {Promise<Array>} 查询结果
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * 执行插入/更新/删除
 * @param {string} sql - SQL语句
 * @param {Array} params - 参数
 * @returns {Promise<Object>} 执行结果
 */
async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/**
 * 关闭数据库连接池
 */
async function closePool() {
  try {
    await pool.end();
    console.log('数据库连接池已关闭');
  } catch (error) {
    console.error('关闭数据库连接池失败:', error.message);
  }
}

module.exports = {
  pool,
  poolConfig,
  testConnection,
  query,
  execute,
  closePool,
};
