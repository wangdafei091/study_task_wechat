/**
 * 家庭相关路由
 */

const express = require('express');
const router = express.Router();
const familyController = require('../controllers/familyController');
const { authMiddleware } = require('../middleware/auth');

// POST /api/families — 创建家庭
router.post('/', authMiddleware, familyController.createFamily.bind(familyController));

// POST /api/families/join — 加入家庭
router.post('/join', authMiddleware, familyController.joinFamily.bind(familyController));

// GET /api/families/current — 获取当前家庭信息
router.get('/current', authMiddleware, familyController.getCurrentFamily.bind(familyController));

// GET /api/families/current/members — 获取家庭成员列表
router.get('/current/members', authMiddleware, familyController.getFamilyMembers.bind(familyController));

// POST /api/families/current/invite-code — 刷新邀请码
router.post('/current/invite-code', authMiddleware, familyController.refreshInviteCode.bind(familyController));

// POST /api/families/members — 创建虚拟成员
router.post('/members', authMiddleware, familyController.createVirtualMember.bind(familyController));

// DELETE /api/families/members/:userId — 软删除家庭成员
router.delete('/members/:userId', authMiddleware, familyController.deleteMember.bind(familyController));

module.exports = router;
