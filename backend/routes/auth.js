/**
 * 认证相关路由
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

/**
 * @route   POST /api/auth/login
 * @desc    微信小程序用户登录
 * @access  Public
 */
router.post('/login', authController.login.bind(authController));

/**
 * @route   GET /api/auth/validate
 * @desc    验证JWT token
 * @access  Private
 */
router.get('/validate', authMiddleware, authController.validateToken.bind(authController));

/**
 * @route   GET /api/auth/current
 * @desc    获取当前用户信息
 * @access  Private
 */
router.get('/current', authMiddleware, authController.getCurrentUser.bind(authController));

module.exports = router;
