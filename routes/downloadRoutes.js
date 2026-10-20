const express = require('express');
const router = express.Router();
const downloadController = require('../controllers/downloadController');
const { authenticate, requireStaff } = require('../middleware/authMiddleware');

// Student download history
router.get('/my-downloads', authenticate, downloadController.getMyDownloads);

// Staff download analytics and reporting
router.get('/analytics', authenticate, requireStaff, downloadController.getDownloadAnalytics);

module.exports = router;
