const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { authenticate, requireStaff } = require('../middleware/authMiddleware');

// All review routes are staff-restricted
router.use(authenticate, requireStaff);

// Get list of pending contributions
router.get('/pending', reviewController.getPendingContributions);

// Review/Verify/Approve/Reject contribution
router.post('/:resourceId', reviewController.verifyContribution);

// Get review history of a specific resource
router.get('/resource/:resourceId', reviewController.getResourceReviews);

module.exports = router;
