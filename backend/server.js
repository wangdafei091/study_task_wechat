/**
 * Express服务器入口文件
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const { testConnection } = require('./config/database');
const { createLogger } = require('./utils/logger');
const corsMiddleware = require('./middleware/cors');
const { errorHandler, notFoundHandler } = require('./middleware/error');

const logger = createLogger('Server');

// 创建Express应用
const app = express();

// 服务器配置
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// 配置中间件
app.use(cors()); // 使用express的cors包，或使用自定义的corsMiddleware
// app.use(corsMiddleware); // 可选：使用自定义CORS中间件
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req, res, next) => {
  logger.info(`请求: ${req.method} ${req.url}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
  });
  next();
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// 根路径
app.get('/', (req, res) => {
  res.json({
    name: '学习任务微信小程序API',
    version: '1.0.0',
    description: '提供任务管理、用户认证等核心功能',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      users: '/api/users',
      tasks: '/api/tasks',
    },
  });
});

// API路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/families', require('./routes/families'));

// 404处理
app.use(notFoundHandler);

// 全局错误处理
app.use(errorHandler);

/**
 * 启动服务器
 */
async function startServer() {
  try {
    // 测试数据库连接
    logger.info('正在测试数据库连接...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      throw new Error('数据库连接失败');
    }

    // 启动服务器
    app.listen(PORT, HOST, () => {
      logger.info(`✅ 服务器启动成功`, {
        host: HOST,
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
      });
      logger.info(`📍 健康检查接口: http://${HOST}:${PORT}/health`);
      logger.info(`📍 API文档: http://${HOST}:${PORT}/`);
    });
  } catch (error) {
    logger.error('启动服务器失败', error);
    process.exit(1);
  }
}

// 优雅关闭
function gracefulShutdown() {
  logger.info('正在关闭服务器...');

  setTimeout(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  }, 1000);
}

// 监听关闭信号
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', { reason, promise });
  process.exit(1);
});

// 启动服务器
startServer();

module.exports = app;
