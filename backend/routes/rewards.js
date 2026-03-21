/**
 * 奖励路由
 */

const express = require('express');

const rewardController = require('../controllers/rewardController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', rewardController.getRewards.bind(rewardController));
router.post('/', rewardController.createReward.bind(rewardController));
router.put('/:rewardId', rewardController.updateReward.bind(rewardController));
router.delete('/:rewardId', rewardController.deleteReward.bind(rewardController));
router.patch('/:rewardId/exchange', rewardController.exchangeReward.bind(rewardController));

module.exports = router;
