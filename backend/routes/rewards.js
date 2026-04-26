/**
 * 奖励路由
 */

const express = require('express');

const rewardController = require('../controllers/rewardController');
const { authMiddleware } = require('../middleware/auth');
const { systemUserAccessMiddleware } = require('../middleware/systemUserAccess');

const router = express.Router();

router.use(authMiddleware, systemUserAccessMiddleware);

router.get('/', rewardController.getRewards.bind(rewardController));
router.post('/', rewardController.createReward.bind(rewardController));
router.put('/:rewardId', rewardController.updateReward.bind(rewardController));
router.delete('/:rewardId', rewardController.deleteReward.bind(rewardController));
router.patch('/:rewardId/exchange', rewardController.exchangeReward.bind(rewardController));
router.patch('/:rewardId/cancel-exchange', rewardController.cancelRewardExchange.bind(rewardController));

module.exports = router;
