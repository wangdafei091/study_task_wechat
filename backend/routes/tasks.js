/**
 * 任务相关路由
 */

const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authMiddleware } = require('../middleware/auth');

/**
 * @route   GET /api/tasks
 * @desc    获取当前用户的任务列表
 * @access  Private
 */
router.get('/', authMiddleware, taskController.getTasks.bind(taskController));

/**
 * @route   GET /api/tasks/count
 * @desc    统计用户任务
 * @access  Private
 */
router.get('/count', authMiddleware, taskController.countTasks.bind(taskController));

/**
 * @route   GET /api/tasks/:taskId
 * @desc    获取任务详情
 * @access  Private
 */
router.get('/:taskId', authMiddleware, taskController.getTaskById.bind(taskController));

/**
 * @route   POST /api/tasks
 * @desc    创建新任务
 * @access  Private
 */
router.post('/', authMiddleware, taskController.createTask.bind(taskController));

module.exports = router;
