const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate, requireStaff } = require('../middleware/authMiddleware');

// Student personalized dashboard
router.get('/student', authenticate, dashboardController.getStudentDashboard);

// Staff / Admin platform dashboard
router.get('/staff', authenticate, requireStaff, dashboardController.getStaffDashboard);

module.exports = router;
