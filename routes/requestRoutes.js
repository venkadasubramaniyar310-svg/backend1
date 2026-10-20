const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const { authenticate, requireStaff } = require('../middleware/authMiddleware');

// Student creates a new request
router.post('/', authenticate, requestController.createRequest);

// Student views their own requests
router.get('/my-requests', authenticate, requestController.getMyRequests);

// Staff / Admin views all student requests
router.get('/', authenticate, requireStaff, requestController.getAllRequests);

// Staff / Admin responds to / updates request status
router.patch('/:id/respond', authenticate, requireStaff, requestController.respondToRequest);

module.exports = router;
