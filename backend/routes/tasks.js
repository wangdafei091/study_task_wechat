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
 * @route   POST /api/tasks/penalties/sync
 * @desc    同步必做任务惩罚（云端权威执行）
 * @access  Private
 */
router.post('/penalties/sync', authMiddleware, taskController.syncRequiredTaskPenalties.bind(taskController));

/**
 * @route   POST /api/tasks/upcoming/sync
 * @desc    同步 upcoming 任务提醒消息（云端活跃提醒）
 * @access  Private
 */
router.post('/upcoming/sync', authMiddleware, taskController.syncUpcomingTaskMessages.bind(taskController));

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

/**
 * @route   PUT /api/tasks/:taskId
 * @desc    更新任务（字段白名单过滤）
 * @access  Private
 */
router.put('/:taskId', authMiddleware, taskController.updateTask.bind(taskController));

/**
 * @route   DELETE /api/tasks/:taskId
 * @desc    软删除任务
 * @access  Private
 */
router.delete('/:taskId', authMiddleware, taskController.deleteTask.bind(taskController));

/**
 * @route   PATCH /api/tasks/:taskId/status
 * @desc    更新任务状态（只接受 status:0/1）
 * @access  Private
 */
router.patch('/:taskId/status', authMiddleware, taskController.updateTaskStatus.bind(taskController));

/**
 * @route   PATCH /api/tasks/:taskId/required
 * @desc    标记任务为必做
 * @access  Private
 */
router.patch('/:taskId/required', authMiddleware, taskController.markTaskRequired.bind(taskController));

/**
 * @route   PATCH /api/tasks/:taskId/unrequired
 * @desc    取消任务必做标记
 * @access  Private
 */
router.patch('/:taskId/unrequired', authMiddleware, taskController.unmarkTaskRequired.bind(taskController));

/**
 * @route   POST /api/tasks/transfer
 * @desc    将家长名下任务批量转移给指定孩子（首次添加孩子时调用）
 * @access  Private（仅家长）
 */
router.post('/transfer', authMiddleware, taskController.transferTasks.bind(taskController));

module.exports = router;
