const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resourceController');
const { authenticate, optionalAuthenticate } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

// Browse and search resources (accessible to everyone; staff can filter by status)
router.get('/', optionalAuthenticate, resourceController.getResources);

// Get student's contributed resources
router.get('/my-contributions', authenticate, resourceController.getMyContributions);

// Personalized Recommendations for student
router.get('/recommendations', authenticate, resourceController.getRecommendations);

// Get single resource details
router.get('/:id', optionalAuthenticate, resourceController.getResourceById);

// Upload / Contribute a resource (with file type & size validation)
router.post('/', authenticate, upload.single('file'), resourceController.uploadResource);

// Edit resource metadata
router.put('/:id', authenticate, resourceController.editResource);

// Archive a resource
router.patch('/:id/archive', authenticate, resourceController.archiveResource);

// Download resource (tracks download count and serves file)
router.get('/:id/download', optionalAuthenticate, resourceController.downloadResource);

module.exports = router;
