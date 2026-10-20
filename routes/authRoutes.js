const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, requireStudent, requireStaff } = require('../middleware/authMiddleware');

// ==========================================
// Public Authentication Routes
// ==========================================

// Register new user (student or staff)
router.post('/register', authController.register);

// Login existing user
router.post('/login', authController.login);

// ==========================================
// Protected Routes
// ==========================================

// Current logged-in user profile (accessible to all authenticated users)
router.get('/me', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);

// Student-only route
router.get('/student-portal', authenticate, requireStudent, (req, res) => {
    res.json({
        message: 'Welcome to the Student Portal',
        role: req.user.role,
        user: req.user
    });
});

// Staff / Admin-only route
router.get('/staff-portal', authenticate, requireStaff, (req, res) => {
    res.json({
        message: 'Welcome to the Staff Management Portal',
        role: req.user.role,
        user: req.user
    });
});

module.exports = router;
