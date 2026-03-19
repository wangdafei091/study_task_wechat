/**
 * 数据库配置
 */

const mysql = require('mysql2/promise');

/**
 * 数据库连接池配置
 */
const getPoolConfig = () => ({
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
  dateStrings: true,
});

/**
 * 创建数据库连接池（延迟初始化）
 */
let pool = null;

function getPool() {
  if (!pool) {
    const poolConfig = getPoolConfig();
    console.log('🔧 初始化数据库连接池:', {
      host: poolConfig.host,
      user: poolConfig.user,
      database: poolConfig.database
    });
    pool = mysql.createPool(poolConfig);
  }
  return pool;
}

// 向后兼容：直接访问pool属性时会触发�ization
Object.defineProperty(module.exports, 'pool', {
  get() { return getPool(); },
  enumerable: true,
  configurable: true
});

/**
 * 测试数据库连接
 */
async function testConnection() {
  try {
    const currentPool = getPool();
    const connection = await currentPool.getConnection();
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
  const currentPool = getPool();
  const [rows] = await currentPool.execute(sql, params);
  return rows;
}

/**
 * 执行插入/更新/删除
 * @param {string} sql - SQL语句
 * @param {Array} params - 参数
 * @returns {Promise<Object>} 执行结果
 */
async function execute(sql, params = []) {
  const currentPool = getPool();
  const [result] = await currentPool.execute(sql, params);
  return result;
}

/**
 * 关闭数据库连接池
 */
async function closePool() {
  try {
    if (pool) {
      await pool.end();
      pool = null;
      console.log('数据库连接池已关闭');
    }
  } catch (error) {
    console.error('关闭数据库连接池失败:', error.message);
  }
}

module.exports = {
  getPool,
  getPoolConfig,
  testConnection,
  query,
  execute,
  closePool,
};

// 向后兼容：导出pool和poolConfig的getter
Object.defineProperty(module.exports, 'pool', {
  get() { return getPool(); },
  enumerable: true,
});

Object.defineProperty(module.exports, 'poolConfig', {
  get() { return getPoolConfig(); },
  enumerable: true,
});
