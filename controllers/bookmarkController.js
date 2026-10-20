const db = require('../config/db');

/**
 * Add a resource to bookmarks
 * POST /api/bookmarks/:resourceId
 */
const addBookmark = async (req, res) => {
    try {
        const { resourceId } = req.params;

        // Verify resource exists and is published
        const [resource] = await db.query(
            "SELECT id FROM resources WHERE id = ? AND status = 'PUBLISHED'",
            [resourceId]
        );

        if (resource.length === 0) {
            return res.status(404).json({ error: 'Published resource not found.' });
        }

        // Insert bookmark (ignore if already exists due to unique constraint)
        const [result] = await db.query(
            'INSERT IGNORE INTO bookmarks (student_id, resource_id) VALUES (?, ?)',
            [req.user.id, resourceId]
        );

        return res.status(200).json({
            message: 'Resource bookmarked successfully.',
            isBookmarked: true
        });
    } catch (error) {
        console.error('Error adding bookmark:', error);
        return res.status(500).json({ error: 'Failed to bookmark resource.' });
    }
};

/**
 * Remove a resource from bookmarks
 * DELETE /api/bookmarks/:resourceId
 */
const removeBookmark = async (req, res) => {
    try {
        const { resourceId } = req.params;

        await db.query(
            'DELETE FROM bookmarks WHERE student_id = ? AND resource_id = ?',
            [req.user.id, resourceId]
        );

        return res.status(200).json({
            message: 'Bookmark removed successfully.',
            isBookmarked: false
        });
    } catch (error) {
        console.error('Error removing bookmark:', error);
        return res.status(500).json({ error: 'Failed to remove bookmark.' });
    }
};

/**
 * Get all bookmarks for current student
 * GET /api/bookmarks
 */
const getMyBookmarks = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT 
                b.id AS bookmark_id,
                b.created_at AS bookmarked_at,
                r.id AS resource_id,
                r.title,
                r.description,
                r.file_path,
                r.academic_year,
                r.status,
                r.created_at AS resource_created_at,
                s.name AS subject_name,
                s.year AS subject_year,
                s.semester AS subject_semester,
                d.name AS department_name,
                rt.name AS resource_type_name,
                u.name AS uploader_name,
                COUNT(rd.id) AS download_count
             FROM bookmarks b
             JOIN resources r ON b.resource_id = r.id
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             JOIN users u ON r.uploaded_by = u.id
             LEFT JOIN resource_downloads rd ON r.id = rd.resource_id
             WHERE b.student_id = ?
             GROUP BY b.id, r.id
             ORDER BY b.created_at DESC`,
            [req.user.id]
        );

        return res.json({ bookmarks: rows });
    } catch (error) {
        console.error('Error fetching bookmarks:', error);
        return res.status(500).json({ error: 'Failed to retrieve bookmarks.' });
    }
};

/**
 * Check if a resource is bookmarked by logged in student
 * GET /api/bookmarks/check/:resourceId
 */
const checkBookmark = async (req, res) => {
    try {
        const { resourceId } = req.params;

        const [rows] = await db.query(
            'SELECT id FROM bookmarks WHERE student_id = ? AND resource_id = ?',
            [req.user.id, resourceId]
        );

        return res.json({ isBookmarked: rows.length > 0 });
    } catch (error) {
        console.error('Error checking bookmark:', error);
        return res.status(500).json({ error: 'Failed to check bookmark status.' });
    }
};

module.exports = {
    addBookmark,
    removeBookmark,
    getMyBookmarks,
    checkBookmark
};
