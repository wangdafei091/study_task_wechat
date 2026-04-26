/**
 * 家庭相关路由
 */

const express = require('express');
const router = express.Router();
const familyController = require('../controllers/familyController');
const { authMiddleware } = require('../middleware/auth');
const { systemUserAccessMiddleware } = require('../middleware/systemUserAccess');

const protectedMiddlewares = [authMiddleware, systemUserAccessMiddleware];

// POST /api/families — 创建家庭
router.post('/', protectedMiddlewares, familyController.createFamily.bind(familyController));

// POST /api/families/join — 加入家庭
router.post('/join', protectedMiddlewares, familyController.joinFamily.bind(familyController));

// GET /api/families/current — 获取当前家庭信息
router.get('/current', protectedMiddlewares, familyController.getCurrentFamily.bind(familyController));

// GET /api/families/current/members — 获取家庭成员列表
router.get('/current/members', protectedMiddlewares, familyController.getFamilyMembers.bind(familyController));

// POST /api/families/current/invite-code — 刷新邀请码
router.post('/current/invite-code', protectedMiddlewares, familyController.refreshInviteCode.bind(familyController));

// POST /api/families/members — 创建虚拟成员
router.post('/members', protectedMiddlewares, familyController.createVirtualMember.bind(familyController));

// DELETE /api/families/members/:userId — 软删除家庭成员
router.delete('/members/:userId', protectedMiddlewares, familyController.deleteMember.bind(familyController));

// PATCH /api/families/members/:userId/permission-role — 调整家庭内家长权限
router.patch('/members/:userId/permission-role', protectedMiddlewares, familyController.updateMemberPermissionRole.bind(familyController));

module.exports = router;
