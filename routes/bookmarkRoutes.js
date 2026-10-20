const express = require('express');
const router = express.Router();
const bookmarkController = require('../controllers/bookmarkController');
const { authenticate } = require('../middleware/authMiddleware');

// All bookmark operations require authentication
router.use(authenticate);

// List all student bookmarks
router.get('/', bookmarkController.getMyBookmarks);

// Check if specific resource is bookmarked
router.get('/check/:resourceId', bookmarkController.checkBookmark);

// Add bookmark
router.post('/:resourceId', bookmarkController.addBookmark);

// Remove bookmark
router.delete('/:resourceId', bookmarkController.removeBookmark);

module.exports = router;
