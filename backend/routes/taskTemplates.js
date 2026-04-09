const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const taskTemplateController = require('../controllers/taskTemplateController');

const router = express.Router();

router.use(authMiddleware);

router.get('/', taskTemplateController.getTemplates.bind(taskTemplateController));
router.post('/', taskTemplateController.createTemplate.bind(taskTemplateController));
router.put('/:templateId', taskTemplateController.updateTemplate.bind(taskTemplateController));
router.patch('/:templateId/enabled', taskTemplateController.setTemplateEnabled.bind(taskTemplateController));
router.delete('/:templateId', taskTemplateController.deleteTemplate.bind(taskTemplateController));
router.post('/:templateId/usage', taskTemplateController.recordTemplateUsage.bind(taskTemplateController));

module.exports = router;
