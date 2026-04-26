const express = require('express');
const router = express.Router();

const systemAdminController = require('../controllers/systemAdminController');
const { authMiddleware } = require('../middleware/auth');
const systemAdminMiddleware = require('../middleware/systemAdmin');
const { systemUserAccessMiddleware } = require('../middleware/systemUserAccess');

router.get('/admin/bootstrap', authMiddleware, systemUserAccessMiddleware, systemAdminController.getBootstrap.bind(systemAdminController));
router.get('/admin/overview', authMiddleware, systemUserAccessMiddleware, systemAdminMiddleware, systemAdminController.getOverview.bind(systemAdminController));
router.patch('/admin/app-access-mode', authMiddleware, systemUserAccessMiddleware, systemAdminMiddleware, systemAdminController.updateAppAccessMode.bind(systemAdminController));
router.get('/admin/users/governance', authMiddleware, systemUserAccessMiddleware, systemAdminMiddleware, systemAdminController.listUserGovernance.bind(systemAdminController));
router.patch('/admin/users/:userId/access-level', authMiddleware, systemUserAccessMiddleware, systemAdminMiddleware, systemAdminController.updateUserAccessLevel.bind(systemAdminController));

module.exports = router;
