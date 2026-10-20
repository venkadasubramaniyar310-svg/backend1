const aiService = require('../services/aiService');

/**
 * Solve Academic Concept Clarity
 * POST /api/ai/clarity
 */
async function getClarity(req, res) {
    try {
        const { subject, query, depth } = req.body;
        if (!query || !query.trim()) {
            return res.status(400).json({ message: 'Query is required' });
        }

        const result = await aiService.solveConceptClarity({
            subject: subject || 'General Engineering',
            query: query.trim(),
            depth: depth || 'exam'
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('AI Clarity Controller Error:', error);
        res.status(500).json({ message: 'Failed to generate academic clarity', error: error.message });
    }
}

/**
 * Debug Code & Logic
 * POST /api/ai/debug
 */
async function debugCode(req, res) {
    try {
        const { language, code, errorMsg } = req.body;
        if (!code || !code.trim()) {
            return res.status(400).json({ message: 'Code is required' });
        }

        const result = await aiService.debugCode({
            language: language || 'SQL',
            code: code.trim(),
            errorMsg: errorMsg ? errorMsg.trim() : ''
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('AI Debug Controller Error:', error);
        res.status(500).json({ message: 'Failed to analyze code', error: error.message });
    }
}

/**
 * Generate Exam Questions & Evaluation Rubric
 * POST /api/ai/exam-prep
 */
async function getExamPrep(req, res) {
    try {
        const { subject, unit, examType } = req.body;
        const result = await aiService.generateExamPrep({
            subject: subject || 'General Engineering',
            unit: unit || 'Unit 1',
            examType: examType || '13mark'
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('AI Exam Prep Controller Error:', error);
        res.status(500).json({ message: 'Failed to generate exam questions', error: error.message });
    }
}

/**
 * Generate Revision Cheat Sheet
 * POST /api/ai/cheatsheet
 */
async function getCheatSheet(req, res) {
    try {
        const { topic } = req.body;
        if (!topic || !topic.trim()) {
            return res.status(400).json({ message: 'Topic is required' });
        }

        const result = await aiService.generateCheatSheet({
            topic: topic.trim()
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('AI CheatSheet Controller Error:', error);
        res.status(500).json({ message: 'Failed to generate cheat sheet', error: error.message });
    }
}

/**
 * Global AI Assistant Query
 * POST /api/ai/assistant
 */
async function assistantQuery(req, res) {
    try {
        const { message, conversation } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ message: 'Message is required' });
        }

        const clarityResult = await aiService.solveConceptClarity({
            subject: 'Computer Science & Engineering',
            query: message.trim(),
            depth: 'simple'
        });

        res.json({
            success: true,
            data: {
                source: clarityResult.source,
                reply: clarityResult.breakdown,
                example: clarityResult.practicalExample,
                examTips: clarityResult.examPoints,
                relatedResources: clarityResult.relatedResources
            }
        });
    } catch (error) {
        console.error('AI Assistant Query Error:', error);
        res.status(500).json({ message: 'Failed to query AI assistant', error: error.message });
    }
}

/**
 * AI Engine Status & Configuration
 * GET /api/ai/status
 */
async function getStatus(req, res) {
    const hasKey = !!process.env.GEMINI_API_KEY;
    res.json({
        success: true,
        status: 'online',
        activeEngine: hasKey ? 'Dual Engine (Gemini 3.8 Flash + EGSPEC Academic Engine)' : 'EGSPEC High-Performance Academic Engine',
        llmConfigured: hasKey,
        supportedLanguages: ['SQL', 'Python', 'Java', 'C++', 'JavaScript'],
        supportedFeatures: ['Concept Clarity', 'Code Debugger', 'Exam Prep & Rubrics', 'Revision Cheat Sheets', 'Floating Assistant']
    });
}

module.exports = {
    getClarity,
    debugCode,
    getExamPrep,
    getCheatSheet,
    assistantQuery,
    getStatus
};
