/**
 * 用户相关路由
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware } = require('../middleware/auth');

/**
 * @route   GET /api/users
 * @desc    获取当前用户列表（当前仅支持当前用户）
 * @access  Private
 */
router.get('/', authMiddleware, userController.getUsers.bind(userController));

/**
 * @route   GET /api/users/current
 * @desc    获取当前用户信息
 * @access  Private
 */
router.get('/current', authMiddleware, userController.getCurrentUser.bind(userController));

/**
 * @route   GET /api/users/session/validate
 * @desc    验证用户会话
 * @access  Private
 * @desc    注意：必须放在 /api/users/:userId 之前，否则会被匹配为userId
 */
router.get('/session/validate', authMiddleware, userController.validateSession.bind(userController));

/**
 * @route   GET /api/users/:userId
 * @desc    根据用户ID获取用户信息
 * @access  Private
 */
router.get('/:userId', authMiddleware, userController.getUserById.bind(userController));

/**
 * @route   POST /api/users
 * @desc    创建新用户
 * @access  Private
 */
router.post('/', authMiddleware, userController.createUser.bind(userController));

/**
 * @route   POST /api/users/switch
 * @desc    切换用户
 * @access  Private
 */
router.post('/switch', authMiddleware, userController.switchUser.bind(userController));

/**
 * @route   PATCH /api/users/:userId/nickname
 * @desc    修改用户昵称
 * @access  Private
 */
router.patch('/:userId/nickname', authMiddleware, userController.updateNickname.bind(userController));

/**
 * @route   DELETE /api/users/:userId
 * @desc    删除用户
 * @access  Private
 */
router.delete('/:userId', authMiddleware, userController.deleteUser.bind(userController));

module.exports = router;
