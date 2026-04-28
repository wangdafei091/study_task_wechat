const express = require('express');
const router = express.Router();

const inviteController = require('../controllers/inviteController');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { systemUserAccessMiddleware } = require('../middleware/systemUserAccess');

router.post('/preview', optionalAuthMiddleware, inviteController.preview.bind(inviteController));
router.get('/bootstrap', authMiddleware, systemUserAccessMiddleware, inviteController.getBootstrap.bind(inviteController));
router.get('/current', authMiddleware, systemUserAccessMiddleware, inviteController.getCurrent.bind(inviteController));
router.post('/admission-code', authMiddleware, systemUserAccessMiddleware, inviteController.issueAdmissionCode.bind(inviteController));
router.post('/family-code', authMiddleware, systemUserAccessMiddleware, inviteController.issueFamilyCode.bind(inviteController));

module.exports = router;
