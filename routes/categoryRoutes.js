const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticate, requireStaff } = require('../middleware/authMiddleware');

// ==========================================
// DEPARTMENTS
// ==========================================
router.get('/departments', categoryController.getDepartments);
router.post('/departments', authenticate, requireStaff, categoryController.createDepartment);
router.put('/departments/:id', authenticate, requireStaff, categoryController.updateDepartment);
router.delete('/departments/:id', authenticate, requireStaff, categoryController.deleteDepartment);

// ==========================================
// SUBJECTS
// ==========================================
router.get('/subjects', categoryController.getSubjects);
router.post('/subjects', authenticate, requireStaff, categoryController.createSubject);
router.put('/subjects/:id', authenticate, requireStaff, categoryController.updateSubject);
router.delete('/subjects/:id', authenticate, requireStaff, categoryController.deleteSubject);

// ==========================================
// RESOURCE TYPES
// ==========================================
router.get('/resource-types', categoryController.getResourceTypes);
router.post('/resource-types', authenticate, requireStaff, categoryController.createResourceType);
router.put('/resource-types/:id', authenticate, requireStaff, categoryController.updateResourceType);
router.delete('/resource-types/:id', authenticate, requireStaff, categoryController.deleteResourceType);

// ==========================================
// ACADEMIC YEARS
// ==========================================
router.get('/academic-years', categoryController.getAcademicYears);

module.exports = router;
