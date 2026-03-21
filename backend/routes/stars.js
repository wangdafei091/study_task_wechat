/**
 * 星星路由
 */

const express = require('express');

const starController = require('../controllers/starController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', starController.getStars.bind(starController));
router.get('/records', starController.getRecords.bind(starController));
router.post('/records', starController.createRecord.bind(starController));
router.post('/consume', starController.consume.bind(starController));
router.get('/groups', starController.getGroups.bind(starController));

module.exports = router;
