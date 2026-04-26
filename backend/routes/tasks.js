/**
 * 任务相关路由
 */

const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authMiddleware } = require('../middleware/auth');
const { systemUserAccessMiddleware } = require('../middleware/systemUserAccess');

const protectedMiddlewares = [authMiddleware, systemUserAccessMiddleware];

/**
 * @route   GET /api/tasks
 * @desc    获取当前用户的任务列表
 * @access  Private
 */
router.get('/', protectedMiddlewares, taskController.getTasks.bind(taskController));

/**
 * @route   GET /api/tasks/count
 * @desc    统计用户任务
 * @access  Private
 */
router.get('/count', protectedMiddlewares, taskController.countTasks.bind(taskController));

/**
 * @route   POST /api/tasks/penalties/sync
 * @desc    同步必做任务惩罚（云端权威执行）
 * @access  Private
 */
router.post('/penalties/sync', protectedMiddlewares, taskController.syncRequiredTaskPenalties.bind(taskController));

/**
 * @route   POST /api/tasks/upcoming/sync
 * @desc    同步 upcoming 任务提醒消息（云端活跃提醒）
 * @access  Private
 */
router.post('/upcoming/sync', protectedMiddlewares, taskController.syncUpcomingTaskMessages.bind(taskController));

/**
 * @route   GET /api/tasks/:taskId
 * @desc    获取任务详情
 * @access  Private
 */
router.get('/:taskId', protectedMiddlewares, taskController.getTaskById.bind(taskController));

/**
 * @route   POST /api/tasks/:taskId/occurrence-record
 * @desc    记录表现项结果
 * @access  Private
 */
router.post('/:taskId/occurrence-record', protectedMiddlewares, taskController.recordOccurrenceResult.bind(taskController));

/**
 * @route   POST /api/tasks/:taskId/disable-occurrence
 * @desc    停用表现项
 * @access  Private
 */
router.post('/:taskId/disable-occurrence', protectedMiddlewares, taskController.disableOccurrenceTask.bind(taskController));

/**
 * @route   POST /api/tasks/:taskId/convert-occurrence
 * @desc    将任务转换为表现项
 * @access  Private
 */
router.post('/:taskId/convert-occurrence', protectedMiddlewares, taskController.convertTaskToOccurrenceMode.bind(taskController));

/**
 * @route   POST /api/tasks
 * @desc    创建新任务
 * @access  Private
 */
router.post('/', protectedMiddlewares, taskController.createTask.bind(taskController));

/**
 * @route   PUT /api/tasks/:taskId
 * @desc    更新任务（字段白名单过滤）
 * @access  Private
 */
router.put('/:taskId', protectedMiddlewares, taskController.updateTask.bind(taskController));

/**
 * @route   DELETE /api/tasks/:taskId
 * @desc    软删除任务
 * @access  Private
 */
router.delete('/:taskId', protectedMiddlewares, taskController.deleteTask.bind(taskController));

/**
 * @route   PATCH /api/tasks/:taskId/status
 * @desc    更新任务状态（只接受 status:0/1）
 * @access  Private
 */
router.patch('/:taskId/status', protectedMiddlewares, taskController.updateTaskStatus.bind(taskController));

/**
 * @route   PATCH /api/tasks/:taskId/required
 * @desc    标记任务为必做
 * @access  Private
 */
router.patch('/:taskId/required', protectedMiddlewares, taskController.markTaskRequired.bind(taskController));

/**
 * @route   PATCH /api/tasks/:taskId/unrequired
 * @desc    取消任务必做标记
 * @access  Private
 */
router.patch('/:taskId/unrequired', protectedMiddlewares, taskController.unmarkTaskRequired.bind(taskController));

/**
 * @route   POST /api/tasks/transfer
 * @desc    将家长名下任务批量转移给指定孩子（首次添加孩子时调用）
 * @access  Private（仅家长）
 */
router.post('/transfer', protectedMiddlewares, taskController.transferTasks.bind(taskController));

module.exports = router;
