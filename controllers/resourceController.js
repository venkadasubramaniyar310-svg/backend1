const fs = require('fs');
const path = require('path');
const db = require('../config/db');

/**
 * Upload a new resource
 * POST /api/resources
 * Multipart form data: title, description, subject_id, resource_type_id, academic_year, file
 */
const uploadResource = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a resource file.' });
        }

        const { title, description = '', subject_id, resource_type_id, academic_year } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Title is required.' });
        }
        if (!subject_id) {
            return res.status(400).json({ error: 'Subject is required.' });
        }
        if (!resource_type_id) {
            return res.status(400).json({ error: 'Resource type is required.' });
        }
        if (!academic_year || !academic_year.trim()) {
            return res.status(400).json({ error: 'Academic year is required (e.g. 2026-27).' });
        }

        // Validate subject exists
        const [subjectRows] = await db.query('SELECT id FROM subjects WHERE id = ?', [subject_id]);
        if (subjectRows.length === 0) {
            return res.status(400).json({ error: 'Selected subject does not exist.' });
        }

        // Validate resource type exists
        const [typeRows] = await db.query('SELECT id FROM resource_types WHERE id = ?', [resource_type_id]);
        if (typeRows.length === 0) {
            return res.status(400).json({ error: 'Selected resource type does not exist.' });
        }

        // Workflow Status assignment:
        // Students upload -> PENDING
        // Staff/Admin can upload directly as PUBLISHED (or specify status)
        const isStaff = req.user.role === 'STAFF' || req.user.role === 'ADMIN';
        const initialStatus = isStaff ? (req.body.status || 'PUBLISHED') : 'PENDING';

        // Store relative path
        const relativeFilePath = path.join(process.env.UPLOAD_DIR || 'uploads', req.file.filename).replace(/\\/g, '/');

        const [result] = await db.query(
            `INSERT INTO resources 
             (title, description, subject_id, resource_type_id, uploaded_by, file_path, academic_year, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                title.trim(),
                description ? description.trim() : null,
                subject_id,
                resource_type_id,
                req.user.id,
                relativeFilePath,
                academic_year.trim(),
                initialStatus
            ]
        );

        return res.status(201).json({
            message: isStaff
                ? 'Resource uploaded and published successfully.'
                : 'Resource contributed successfully and is currently pending staff review.',
            resource: {
                id: result.insertId,
                title: title.trim(),
                status: initialStatus,
                file_path: relativeFilePath
            }
        });
    } catch (error) {
        console.error('Resource upload error:', error);
        return res.status(500).json({ error: 'Failed to upload resource.' });
    }
};

/**
 * Get resources with comprehensive search, filters, pagination and sorting
 * GET /api/resources
 * Query: keyword, department_id, subject_id, resource_type_id, year, semester, academic_year, status, sortBy, sortOrder, page, limit
 */
const getResources = async (req, res) => {
    try {
        const {
            keyword,
            department_id,
            subject_id,
            resource_type_id,
            year,
            semester,
            academic_year,
            status,
            sortBy = 'created_at',
            sortOrder = 'DESC',
            page = 1,
            limit = 12
        } = req.query;

        const conditions = [];
        const params = [];

        // Determine visible status:
        // Public and students can only view 'PUBLISHED' resources unless viewing their own contributions
        const isStaff = req.user && (req.user.role === 'STAFF' || req.user.role === 'ADMIN');
        if (status && isStaff) {
            conditions.push('r.status = ?');
            params.push(status.toUpperCase());
        } else if (!isStaff) {
            conditions.push("r.status = 'PUBLISHED'");
        }

        if (keyword && keyword.trim()) {
            conditions.push('(r.title LIKE ? OR r.description LIKE ?)');
            const searchPattern = `%${keyword.trim()}%`;
            params.push(searchPattern, searchPattern);
        }

        if (department_id) {
            conditions.push('s.department_id = ?');
            params.push(department_id);
        }

        if (subject_id) {
            conditions.push('r.subject_id = ?');
            params.push(subject_id);
        }

        if (resource_type_id) {
            conditions.push('r.resource_type_id = ?');
            params.push(resource_type_id);
        }

        if (year) {
            conditions.push('s.year = ?');
            params.push(year);
        }

        if (semester) {
            conditions.push('s.semester = ?');
            params.push(semester);
        }

        if (academic_year) {
            conditions.push('r.academic_year = ?');
            params.push(academic_year);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Safe sorting fields
        const allowedSortFields = {
            created_at: 'r.created_at',
            title: 'r.title',
            downloads: 'download_count'
        };
        const orderColumn = allowedSortFields[sortBy] || 'r.created_at';
        const orderDir = (sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Pagination calculation
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));
        const offset = (pageNum - 1) * limitNum;

        // Count total matching resources
        const [countResult] = await db.query(
            `SELECT COUNT(DISTINCT r.id) AS total
             FROM resources r
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             ${whereClause}`,
            params
        );
        const total = countResult[0].total;

        // Fetch paginated resources
        const queryParams = [...params, limitNum, offset];
        const [rows] = await db.query(
            `SELECT 
                r.id,
                r.title,
                r.description,
                r.file_path,
                r.academic_year,
                r.status,
                r.created_at,
                r.subject_id,
                s.name AS subject_name,
                s.year AS subject_year,
                s.semester AS subject_semester,
                s.department_id,
                d.name AS department_name,
                r.resource_type_id,
                rt.name AS resource_type_name,
                r.uploaded_by,
                u.name AS uploader_name,
                u.role AS uploader_role,
                COUNT(rd.id) AS download_count
             FROM resources r
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             JOIN users u ON r.uploaded_by = u.id
             LEFT JOIN resource_downloads rd ON r.id = rd.resource_id
             ${whereClause}
             GROUP BY r.id
             ORDER BY ${orderColumn} ${orderDir}
             LIMIT ? OFFSET ?`,
            queryParams
        );

        return res.json({
            data: rows,
            resources: rows,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Error fetching resources:', error);
        return res.status(500).json({ error: 'Failed to retrieve resources.' });
    }
};

/**
 * Get single resource details
 * GET /api/resources/:id
 */
const getResourceById = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT 
                r.id,
                r.title,
                r.description,
                r.file_path,
                r.academic_year,
                r.status,
                r.created_at,
                r.subject_id,
                s.name AS subject_name,
                s.year AS subject_year,
                s.semester AS subject_semester,
                s.department_id,
                d.name AS department_name,
                r.resource_type_id,
                rt.name AS resource_type_name,
                r.uploaded_by,
                u.name AS uploader_name,
                u.role AS uploader_role,
                COUNT(rd.id) AS download_count
             FROM resources r
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             JOIN users u ON r.uploaded_by = u.id
             LEFT JOIN resource_downloads rd ON r.id = rd.resource_id
             WHERE r.id = ?
             GROUP BY r.id`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found.' });
        }

        const resource = rows[0];

        // Access check for unpublished resources
        const isStaff = req.user && (req.user.role === 'STAFF' || req.user.role === 'ADMIN');
        const isOwner = req.user && req.user.id === resource.uploaded_by;

        if (resource.status !== 'PUBLISHED' && !isStaff && !isOwner) {
            return res.status(403).json({ error: 'This resource is not publicly accessible.' });
        }

        // Fetch review history if user is staff or owner
        let reviewHistory = [];
        if (isStaff || isOwner) {
            const [reviews] = await db.query(
                `SELECT rr.id, rr.status, rr.remarks, rr.reviewed_at, u.name AS reviewer_name
                 FROM resource_reviews rr
                 JOIN users u ON rr.staff_id = u.id
                 WHERE rr.resource_id = ?
                 ORDER BY rr.reviewed_at DESC`,
                [id]
            );
            reviewHistory = reviews;
        }

        return res.json({
            resource: {
                ...resource,
                reviews: reviewHistory
            }
        });
    } catch (error) {
        console.error('Error fetching resource details:', error);
        return res.status(500).json({ error: 'Failed to retrieve resource details.' });
    }
};

/**
 * Edit resource metadata
 * PUT /api/resources/:id
 */
const editResource = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, subject_id, resource_type_id, academic_year } = req.body;

        const [resourceRows] = await db.query('SELECT * FROM resources WHERE id = ?', [id]);
        if (resourceRows.length === 0) {
            return res.status(404).json({ error: 'Resource not found.' });
        }

        const resource = resourceRows[0];
        const isStaff = req.user.role === 'STAFF' || req.user.role === 'ADMIN';
        const isOwner = req.user.id === resource.uploaded_by;

        // Students can only edit their own resource if PENDING or REJECTED
        if (!isStaff && (!isOwner || !['PENDING', 'REJECTED'].includes(resource.status))) {
            return res.status(403).json({
                error: 'You do not have permission to edit this resource in its current state.'
            });
        }

        // If subject_id provided, validate
        if (subject_id) {
            const [subj] = await db.query('SELECT id FROM subjects WHERE id = ?', [subject_id]);
            if (subj.length === 0) {
                return res.status(400).json({ error: 'Selected subject does not exist.' });
            }
        }

        // If resource_type_id provided, validate
        if (resource_type_id) {
            const [types] = await db.query('SELECT id FROM resource_types WHERE id = ?', [resource_type_id]);
            if (types.length === 0) {
                return res.status(400).json({ error: 'Selected resource type does not exist.' });
            }
        }

        const updatedTitle = title !== undefined ? title.trim() : resource.title;
        const updatedDesc = description !== undefined ? description.trim() : resource.description;
        const updatedSubject = subject_id || resource.subject_id;
        const updatedType = resource_type_id || resource.resource_type_id;
        const updatedYear = academic_year !== undefined ? academic_year.trim() : resource.academic_year;

        // If student edits a rejected resource, reset status back to PENDING for re-review
        let updatedStatus = resource.status;
        if (!isStaff && resource.status === 'REJECTED') {
            updatedStatus = 'PENDING';
        }

        await db.query(
            `UPDATE resources 
             SET title = ?, description = ?, subject_id = ?, resource_type_id = ?, academic_year = ?, status = ?
             WHERE id = ?`,
            [updatedTitle, updatedDesc, updatedSubject, updatedType, updatedYear, updatedStatus, id]
        );

        return res.json({
            message: 'Resource updated successfully.',
            resource: {
                id,
                title: updatedTitle,
                description: updatedDesc,
                subject_id: updatedSubject,
                resource_type_id: updatedType,
                academic_year: updatedYear,
                status: updatedStatus
            }
        });
    } catch (error) {
        console.error('Error editing resource:', error);
        return res.status(500).json({ error: 'Failed to update resource.' });
    }
};

/**
 * Archive a resource
 * PATCH /api/resources/:id/archive
 */
const archiveResource = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query('SELECT id, status, uploaded_by FROM resources WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found.' });
        }

        const resource = rows[0];
        const isStaff = req.user.role === 'STAFF' || req.user.role === 'ADMIN';
        const isOwner = req.user.id === resource.uploaded_by;

        if (!isStaff && !isOwner) {
            return res.status(403).json({ error: 'You are not authorized to archive this resource.' });
        }

        await db.query("UPDATE resources SET status = 'ARCHIVED' WHERE id = ?", [id]);

        return res.json({
            message: 'Resource has been successfully archived.',
            resourceId: id,
            status: 'ARCHIVED'
        });
    } catch (error) {
        console.error('Error archiving resource:', error);
        return res.status(500).json({ error: 'Failed to archive resource.' });
    }
};

/**
 * Download resource file and record download log
 * GET /api/resources/:id/download
 */
const downloadResource = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT r.id, r.title, r.file_path, r.status, r.uploaded_by
             FROM resources r
             WHERE r.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Resource not found.' });
        }

        const resource = rows[0];
        const isStaff = req.user && (req.user.role === 'STAFF' || req.user.role === 'ADMIN');
        const isOwner = req.user && req.user.id === resource.uploaded_by;

        if (resource.status !== 'PUBLISHED' && !isStaff && !isOwner) {
            return res.status(403).json({ error: 'This resource is not available for download.' });
        }

        // Full path on disk (checks both serverless /tmp and bundled project uploads)
        const os = require('os');
        const filename = path.basename(resource.file_path);
        const candidates = [
            path.join(os.tmpdir(), resource.file_path),
            path.join(os.tmpdir(), 'uploads', filename),
            path.resolve(__dirname, '..', resource.file_path),
            path.resolve(__dirname, '../uploads', filename)
        ];

        const fullPath = candidates.find(candidate => fs.existsSync(candidate));

        if (!fullPath) {
            return res.status(404).json({ error: 'Physical file not found on server.' });
        }

        // Record download tracking log
        const studentId = req.user ? req.user.id : null;
        await db.query(
            'INSERT INTO resource_downloads (student_id, resource_id, downloaded_at) VALUES (?, ?, NOW())',
            [studentId, id]
        );

        // Download file
        return res.download(fullPath, path.basename(resource.file_path));
    } catch (error) {
        console.error('Error downloading resource:', error);
        return res.status(500).json({ error: 'Failed to download resource.' });
    }
};

/**
 * Get student's contributed resources
 * GET /api/resources/my-contributions
 */
const getMyContributions = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT 
                r.id,
                r.title,
                r.description,
                r.file_path,
                r.academic_year,
                r.status,
                r.created_at,
                r.subject_id,
                r.resource_type_id,
                s.name AS subject_name,
                d.name AS department_name,
                rt.name AS resource_type_name,
                COUNT(rd.id) AS download_count,
                (SELECT rr.remarks FROM resource_reviews rr WHERE rr.resource_id = r.id ORDER BY rr.reviewed_at DESC LIMIT 1) AS latest_remarks
             FROM resources r
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             LEFT JOIN resource_downloads rd ON r.id = rd.resource_id
             WHERE r.uploaded_by = ?
             GROUP BY r.id
             ORDER BY r.created_at DESC`,
            [req.user.id]
        );

        return res.json({ contributions: rows });
    } catch (error) {
        console.error('Error fetching contributions:', error);
        return res.status(500).json({ error: 'Failed to retrieve contributions.' });
    }
};

/**
 * Personalized Recommendations using SQL scoring logic
 * Based on:
 * 1. Student's department match (+15 points)
 * 2. Matches student's bookmarked subjects (+10 points)
 * 3. Matches student's bookmarked resource types (+5 points)
 * 4. Overall popularity / most-downloaded resources (+download count, capped at 10)
 * Only returns PUBLISHED resources.
 */
const getRecommendations = async (req, res) => {
    try {
        const studentId = req.user.id;

        // Fetch student's department_id
        const [userRows] = await db.query('SELECT department_id FROM users WHERE id = ?', [studentId]);
        const deptId = userRows.length > 0 ? userRows[0].department_id : null;

        const [recommendations] = await db.query(
            `SELECT 
                r.id,
                r.title,
                r.description,
                r.file_path,
                r.academic_year,
                r.status,
                r.created_at,
                s.id AS subject_id,
                s.name AS subject_name,
                s.year AS subject_year,
                s.semester AS subject_semester,
                d.id AS department_id,
                d.name AS department_name,
                rt.name AS resource_type_name,
                u.name AS uploader_name,
                COUNT(DISTINCT rd.id) AS download_count,
                (
                    (CASE WHEN s.department_id = ? THEN 15 ELSE 0 END) +
                    (CASE WHEN r.subject_id IN (
                        SELECT DISTINCT r2.subject_id 
                        FROM bookmarks b2 
                        JOIN resources r2 ON b2.resource_id = r2.id 
                        WHERE b2.student_id = ?
                    ) THEN 10 ELSE 0 END) +
                    (CASE WHEN r.resource_type_id IN (
                        SELECT DISTINCT r3.resource_type_id 
                        FROM bookmarks b3 
                        JOIN resources r3 ON b3.resource_id = r3.id 
                        WHERE b3.student_id = ?
                    ) THEN 5 ELSE 0 END) +
                    LEAST(COUNT(DISTINCT rd.id), 10)
                ) AS recommendation_score,
                CASE 
                    WHEN s.department_id = ? AND r.subject_id IN (
                        SELECT DISTINCT r2.subject_id 
                        FROM bookmarks b2 
                        JOIN resources r2 ON b2.resource_id = r2.id 
                        WHERE b2.student_id = ?
                    ) THEN 'Curriculum & Bookmark Match'
                    WHEN s.department_id = ? THEN 'Department Curriculum'
                    WHEN COUNT(DISTINCT rd.id) > 0 THEN 'Trending Among Peers'
                    ELSE 'Recommended Study Guide'
                END AS recommendation_reason
             FROM resources r
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             JOIN users u ON r.uploaded_by = u.id
             LEFT JOIN resource_downloads rd ON r.id = rd.resource_id
             WHERE r.status = 'PUBLISHED'
               AND r.id NOT IN (SELECT resource_id FROM bookmarks WHERE student_id = ?)
             GROUP BY r.id
             ORDER BY recommendation_score DESC, download_count DESC, r.created_at DESC
             LIMIT 6`,
            [deptId, studentId, studentId, deptId, studentId, deptId, studentId]
        );

        return res.json({ recommendations });
    } catch (error) {
        console.error('Error generating recommendations:', error);
        return res.status(500).json({ error: 'Failed to retrieve recommendations.' });
    }
};

module.exports = {
    uploadResource,
    getResources,
    getResourceById,
    editResource,
    archiveResource,
    downloadResource,
    getMyContributions,
    getRecommendations
};
