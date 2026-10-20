const db = require('../config/db');

/**
 * Get download history for logged-in student
 * GET /api/downloads/my-downloads
 */
const getMyDownloads = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT 
                rd.id AS download_id,
                rd.downloaded_at,
                r.id AS resource_id,
                r.title,
                r.file_path,
                s.name AS subject_name,
                d.name AS department_name,
                rt.name AS resource_type_name
             FROM resource_downloads rd
             JOIN resources r ON rd.resource_id = r.id
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             WHERE rd.student_id = ?
             ORDER BY rd.downloaded_at DESC`,
            [req.user.id]
        );

        return res.json({ downloads: rows });
    } catch (error) {
        console.error('Error fetching student downloads:', error);
        return res.status(500).json({ error: 'Failed to retrieve download history.' });
    }
};

/**
 * Get download analytics (Staff / Admin)
 * GET /api/downloads/analytics
 */
const getDownloadAnalytics = async (req, res) => {
    try {
        // Total downloads
        const [totalResult] = await db.query('SELECT COUNT(*) AS total_downloads FROM resource_downloads');

        // Most downloaded resources (top 10)
        const [topResources] = await db.query(
            `SELECT 
                r.id,
                r.title,
                s.name AS subject_name,
                d.name AS department_name,
                rt.name AS resource_type_name,
                COUNT(rd.id) AS download_count
             FROM resources r
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             JOIN resource_downloads rd ON r.id = rd.resource_id
             GROUP BY r.id
             ORDER BY download_count DESC
             LIMIT 10`
        );

        // Recent download logs (last 20)
        const [recentLogs] = await db.query(
            `SELECT 
                rd.id,
                rd.downloaded_at,
                r.id AS resource_id,
                r.title AS resource_title,
                u.id AS student_id,
                COALESCE(u.name, 'Anonymous') AS student_name,
                COALESCE(u.email, 'N/A') AS student_email
             FROM resource_downloads rd
             JOIN resources r ON rd.resource_id = r.id
             LEFT JOIN users u ON rd.student_id = u.id
             ORDER BY rd.downloaded_at DESC
             LIMIT 20`
        );

        // Downloads by department
        const [deptDownloads] = await db.query(
            `SELECT 
                d.name AS department_name,
                COUNT(rd.id) AS download_count
             FROM departments d
             JOIN subjects s ON d.id = s.department_id
             JOIN resources r ON s.id = r.subject_id
             JOIN resource_downloads rd ON r.id = rd.resource_id
             GROUP BY d.id
             ORDER BY download_count DESC`
        );

        return res.json({
            analytics: {
                totalDownloads: totalResult[0].total_downloads,
                topResources,
                recentLogs,
                departmentDownloads: deptDownloads
            }
        });
    } catch (error) {
        console.error('Error fetching download analytics:', error);
        return res.status(500).json({ error: 'Failed to retrieve download analytics.' });
    }
};

module.exports = {
    getMyDownloads,
    getDownloadAnalytics
};
