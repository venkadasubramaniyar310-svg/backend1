const db = require('../config/db');

/**
 * Create a new resource request (Student)
 * POST /api/requests
 * Body: { subject_id, title, description }
 */
const createRequest = async (req, res) => {
    try {
        const { subject_id, title, description = '' } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Request title is required.' });
        }
        if (!subject_id) {
            return res.status(400).json({ error: 'Subject is required.' });
        }

        // Validate subject exists
        const [subjects] = await db.query('SELECT id FROM subjects WHERE id = ?', [subject_id]);
        if (subjects.length === 0) {
            return res.status(400).json({ error: 'Selected subject does not exist.' });
        }

        const [result] = await db.query(
            `INSERT INTO resource_requests (student_id, subject_id, title, description, status)
             VALUES (?, ?, ?, ?, 'PENDING')`,
            [req.user.id, subject_id, title.trim(), description ? description.trim() : null]
        );

        return res.status(201).json({
            message: 'Resource request created successfully.',
            requestId: result.insertId,
            status: 'PENDING'
        });
    } catch (error) {
        console.error('Error creating resource request:', error);
        return res.status(500).json({ error: 'Failed to create resource request.' });
    }
};

/**
 * Get student's own requests
 * GET /api/requests/my-requests
 */
const getMyRequests = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT 
                rq.id,
                rq.title,
                rq.description,
                rq.status,
                rq.staff_remarks,
                rq.created_at,
                s.id AS subject_id,
                s.name AS subject_name,
                s.year,
                s.semester,
                d.name AS department_name
             FROM resource_requests rq
             JOIN subjects s ON rq.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             WHERE rq.student_id = ?
             ORDER BY rq.created_at DESC`,
            [req.user.id]
        );

        return res.json({ requests: rows });
    } catch (error) {
        console.error('Error fetching my requests:', error);
        return res.status(500).json({ error: 'Failed to retrieve your requests.' });
    }
};

/**
 * Get all requests (Staff / Admin view with optional status and department filters)
 * GET /api/requests
 * Query: status, department_id, subject_id
 */
const getAllRequests = async (req, res) => {
    try {
        const { status, department_id, subject_id } = req.query;

        const conditions = [];
        const params = [];

        if (status) {
            conditions.push('rq.status = ?');
            params.push(status.toUpperCase());
        }

        if (department_id) {
            conditions.push('s.department_id = ?');
            params.push(department_id);
        }

        if (subject_id) {
            conditions.push('rq.subject_id = ?');
            params.push(subject_id);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const [rows] = await db.query(
            `SELECT 
                rq.id,
                rq.title,
                rq.description,
                rq.status,
                rq.staff_remarks,
                rq.created_at,
                u.id AS student_id,
                u.name AS student_name,
                u.email AS student_email,
                s.id AS subject_id,
                s.name AS subject_name,
                s.year,
                s.semester,
                d.name AS department_name
             FROM resource_requests rq
             JOIN users u ON rq.student_id = u.id
             JOIN subjects s ON rq.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             ${whereClause}
             ORDER BY rq.created_at DESC`,
            params
        );

        return res.json({ requests: rows });
    } catch (error) {
        console.error('Error fetching all requests:', error);
        return res.status(500).json({ error: 'Failed to retrieve requests.' });
    }
};

/**
 * Respond to/Update a resource request (Staff / Admin)
 * PATCH /api/requests/:id/respond
 * Body: { status, staff_remarks }
 */
const respondToRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, staff_remarks } = req.body;

        const allowedStatuses = ['PENDING', 'UNDER_REVIEW', 'COMPLETED', 'REJECTED', 'CLOSED'];
        if (status && !allowedStatuses.includes(status.toUpperCase())) {
            return res.status(400).json({
                error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`
            });
        }

        const [rows] = await db.query('SELECT * FROM resource_requests WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Resource request not found.' });
        }

        const currentRequest = rows[0];
        const newStatus = status ? status.toUpperCase() : currentRequest.status;
        const newRemarks = staff_remarks !== undefined ? staff_remarks.trim() : currentRequest.staff_remarks;

        await db.query(
            'UPDATE resource_requests SET status = ?, staff_remarks = ? WHERE id = ?',
            [newStatus, newRemarks, id]
        );

        return res.json({
            message: 'Request updated successfully.',
            request: {
                id,
                status: newStatus,
                staff_remarks: newRemarks
            }
        });
    } catch (error) {
        console.error('Error updating request:', error);
        return res.status(500).json({ error: 'Failed to update request.' });
    }
};

module.exports = {
    createRequest,
    getMyRequests,
    getAllRequests,
    respondToRequest
};
