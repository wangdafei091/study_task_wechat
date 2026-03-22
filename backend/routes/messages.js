const express = require('express');

const messageController = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', messageController.getMessages.bind(messageController));
router.patch('/read-all', messageController.markAllAsRead.bind(messageController));
router.patch('/:messageId/read', messageController.markAsRead.bind(messageController));
router.delete('/:messageId', messageController.deleteMessage.bind(messageController));

module.exports = router;
