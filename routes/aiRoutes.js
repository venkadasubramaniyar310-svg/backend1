const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// Academic Concept Clarity
router.post('/clarity', aiController.getClarity);

// Code Debugger & Optimizer
router.post('/debug', aiController.debugCode);

// University Exam Question & Rubric Generator
router.post('/exam-prep', aiController.getExamPrep);

// Revision Cheat Sheet Generator
router.post('/cheatsheet', aiController.getCheatSheet);

// Floating Global Assistant
router.post('/assistant', aiController.assistantQuery);

// AI Status & Configuration
router.get('/status', aiController.getStatus);

module.exports = router;
