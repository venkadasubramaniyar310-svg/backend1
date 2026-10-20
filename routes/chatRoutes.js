const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticate } = require('../middleware/authMiddleware');

router.use(authenticate);

// Get available contacts and conversation summaries
router.get('/contacts', chatController.getContacts);

// Get message history with a specific contact
router.get('/messages/:otherUserId', chatController.getMessages);

// Mark conversation messages as read
router.post('/read/:otherUserId', chatController.markAsRead);

module.exports = router;
