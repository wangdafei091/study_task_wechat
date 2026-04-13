const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const analyticsController = require('../controllers/analyticsController');

const router = express.Router();

router.use(authMiddleware);

router.post('/read-model/query', analyticsController.queryReadModel.bind(analyticsController));
router.post('/task-completion-stats/query', analyticsController.queryTaskCompletionStats.bind(analyticsController));
router.post('/upcoming-expiry/query', analyticsController.queryUpcomingExpiry.bind(analyticsController));
router.post('/task-star-calendar/query', analyticsController.queryTaskStarCalendar.bind(analyticsController));

module.exports = router;
