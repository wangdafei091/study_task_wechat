const express = require('express');
const router = express.Router();

const systemAdminController = require('../controllers/systemAdminController');
const { authMiddleware } = require('../middleware/auth');
const systemAdminMiddleware = require('../middleware/systemAdmin');

router.get('/admin/bootstrap', authMiddleware, systemAdminController.getBootstrap.bind(systemAdminController));
router.get('/admin/overview', authMiddleware, systemAdminMiddleware, systemAdminController.getOverview.bind(systemAdminController));
router.patch('/admin/app-access-mode', authMiddleware, systemAdminMiddleware, systemAdminController.updateAppAccessMode.bind(systemAdminController));

module.exports = router;
