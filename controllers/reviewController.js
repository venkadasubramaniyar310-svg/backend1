const db = require('../config/db');

/**
 * Get contributions pending staff review
 * GET /api/reviews/pending
 */
const getPendingContributions = async (req, res) => {
    try {
        const { status = 'ALL', department_id } = req.query;

        const conditions = [];
        const params = [];

        if (status === 'ALL') {
            conditions.push("r.status IN ('PENDING', 'UNDER_REVIEW')");
        } else {
            conditions.push('r.status = ?');
            params.push(status.toUpperCase());
        }

        if (department_id) {
            conditions.push('s.department_id = ?');
            params.push(department_id);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const [rows] = await db.query(
            `SELECT 
                r.id,
                r.title,
                r.description,
                r.file_path,
                r.academic_year,
                r.status,
                r.created_at,
                s.name AS subject_name,
                d.name AS department_name,
                rt.name AS resource_type_name,
                u.name AS student_name,
                u.email AS student_email,
                (SELECT rr.remarks FROM resource_reviews rr WHERE rr.resource_id = r.id ORDER BY rr.reviewed_at DESC LIMIT 1) AS latest_remarks
             FROM resources r
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             JOIN users u ON r.uploaded_by = u.id
             ${whereClause}
             ORDER BY r.created_at ASC`,
            params
        );

        return res.json({ pendingContributions: rows });
    } catch (error) {
        console.error('Error fetching pending contributions:', error);
        return res.status(500).json({ error: 'Failed to retrieve pending contributions.' });
    }
};

/**
 * Review, verify, approve, or reject student contribution
 * POST /api/reviews/:resourceId
 * Body: { status, remarks }
 * Allowed status: 'UNDER_REVIEW', 'VERIFIED', 'PUBLISHED', 'REJECTED'
 */
const verifyContribution = async (req, res) => {
    try {
        const { resourceId } = req.params;
        const { status, remarks = '' } = req.body;

        const validStatuses = ['UNDER_REVIEW', 'VERIFIED', 'PUBLISHED', 'REJECTED'];
        if (!status || !validStatuses.includes(status.toUpperCase())) {
            return res.status(400).json({
                error: `Invalid review status. Allowed values: ${validStatuses.join(', ')}`
            });
        }

        const normalizedStatus = status.toUpperCase();

        // Check if resource exists
        const [resourceRows] = await db.query(
            'SELECT id, title, status, uploaded_by FROM resources WHERE id = ?',
            [resourceId]
        );

        if (resourceRows.length === 0) {
            return res.status(404).json({ error: 'Resource not found.' });
        }

        // Insert review record
        await db.query(
            `INSERT INTO resource_reviews (resource_id, staff_id, status, remarks, reviewed_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [resourceId, req.user.id, normalizedStatus, remarks.trim() || null]
        );

        // Update resource status in resources table
        await db.query(
            'UPDATE resources SET status = ? WHERE id = ?',
            [normalizedStatus, resourceId]
        );

        return res.json({
            message: `Resource status updated to ${normalizedStatus}.`,
            resourceId,
            status: normalizedStatus,
            remarks: remarks.trim() || null,
            reviewerId: req.user.id
        });
    } catch (error) {
        console.error('Error verifying contribution:', error);
        return res.status(500).json({ error: 'Failed to update review status.' });
    }
};

/**
 * Get all review history for a specific resource
 * GET /api/reviews/resource/:resourceId
 */
const getResourceReviews = async (req, res) => {
    try {
        const { resourceId } = req.params;

        const [reviews] = await db.query(
            `SELECT 
                rr.id,
                rr.status,
                rr.remarks,
                rr.reviewed_at,
                u.name AS reviewer_name,
                u.email AS reviewer_email
             FROM resource_reviews rr
             JOIN users u ON rr.staff_id = u.id
             WHERE rr.resource_id = ?
             ORDER BY rr.reviewed_at DESC`,
            [resourceId]
        );

        return res.json({ reviews });
    } catch (error) {
        console.error('Error fetching review history:', error);
        return res.status(500).json({ error: 'Failed to retrieve review history.' });
    }
};

module.exports = {
    getPendingContributions,
    verifyContribution,
    getResourceReviews
};
