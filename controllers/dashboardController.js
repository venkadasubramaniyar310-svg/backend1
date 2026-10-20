const db = require('../config/db');

/**
 * Get Student Dashboard Summary
 * GET /api/dashboard/student
 */
const getStudentDashboard = async (req, res) => {
    try {
        const studentId = req.user.id;

        // Total published resources available in repository
        const [pubRes] = await db.query("SELECT COUNT(*) AS total FROM resources WHERE status = 'PUBLISHED'");

        // Total student bookmarks
        const [bookmarks] = await db.query('SELECT COUNT(*) AS total FROM bookmarks WHERE student_id = ?', [studentId]);

        // Contributions breakdown
        const [contributions] = await db.query(
            `SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN status = 'UNDER_REVIEW' THEN 1 ELSE 0 END) AS under_review_count,
                SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified_count,
                SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) AS published_count,
                SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected_count
             FROM resources 
             WHERE uploaded_by = ?`,
            [studentId]
        );

        // Requests count
        const [requests] = await db.query(
            `SELECT 
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_count,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count
             FROM resource_requests 
             WHERE student_id = ?`,
            [studentId]
        );

        // Total student downloads
        const [downloads] = await db.query('SELECT COUNT(*) AS total FROM resource_downloads WHERE student_id = ?', [studentId]);

        // Recent bookmarks (latest 5)
        const [recentBookmarks] = await db.query(
            `SELECT 
                b.id AS bookmark_id,
                b.created_at AS bookmarked_at,
                r.id AS resource_id,
                r.title,
                s.name AS subject_name,
                d.name AS department_name,
                rt.name AS resource_type_name
             FROM bookmarks b
             JOIN resources r ON b.resource_id = r.id
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             WHERE b.student_id = ?
             ORDER BY b.created_at DESC
             LIMIT 5`,
            [studentId]
        );

        // Recent contributions (latest 5)
        const [recentContributions] = await db.query(
            `SELECT 
                r.id,
                r.title,
                r.status,
                r.created_at,
                s.name AS subject_name,
                rt.name AS resource_type_name,
                (SELECT rr.remarks FROM resource_reviews rr WHERE rr.resource_id = r.id ORDER BY rr.reviewed_at DESC LIMIT 1) AS latest_remarks
             FROM resources r
             JOIN subjects s ON r.subject_id = s.id
             JOIN resource_types rt ON r.resource_type_id = rt.id
             WHERE r.uploaded_by = ?
             ORDER BY r.created_at DESC
             LIMIT 5`,
            [studentId]
        );

        // Recent requests (latest 5)
        const [recentRequests] = await db.query(
            `SELECT 
                rq.id,
                rq.title,
                rq.status,
                rq.staff_remarks,
                rq.created_at,
                s.name AS subject_name
             FROM resource_requests rq
             JOIN subjects s ON rq.subject_id = s.id
             WHERE rq.student_id = ?
             ORDER BY rq.created_at DESC
             LIMIT 5`,
            [studentId]
        );

        // Recommendations based on department, semester, bookmarked subjects, and trending downloads
        const [userRows] = await db.query(
            'SELECT department_id, semester FROM users WHERE id = ?',
            [studentId]
        );
        const deptId = userRows.length > 0 ? userRows[0].department_id : null;
        const userSemester = userRows.length > 0 ? userRows[0].semester : null;

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
                    -- Department match: +15 pts
                    (CASE WHEN s.department_id = ? THEN 15 ELSE 0 END) +
                    -- Semester match: +10 pts (NULL semester skips this bonus)
                    (CASE WHEN ? IS NOT NULL AND s.semester = ? THEN 10 ELSE 0 END) +
                    -- Bookmarked subject match: +10 pts
                    (CASE WHEN r.subject_id IN (
                        SELECT DISTINCT r2.subject_id 
                        FROM bookmarks b2 
                        JOIN resources r2 ON b2.resource_id = r2.id 
                        WHERE b2.student_id = ?
                    ) THEN 10 ELSE 0 END) +
                    -- Bookmarked resource-type match: +5 pts
                    (CASE WHEN r.resource_type_id IN (
                        SELECT DISTINCT r3.resource_type_id 
                        FROM bookmarks b3 
                        JOIN resources r3 ON b3.resource_id = r3.id 
                        WHERE b3.student_id = ?
                    ) THEN 5 ELSE 0 END) +
                    -- Download popularity: up to +10 pts
                    LEAST(COUNT(DISTINCT rd.id), 10)
                ) AS recommendation_score,
                CASE 
                    WHEN s.department_id = ? AND ? IS NOT NULL AND s.semester = ? AND r.subject_id IN (
                        SELECT DISTINCT r2.subject_id 
                        FROM bookmarks b2 
                        JOIN resources r2 ON b2.resource_id = r2.id 
                        WHERE b2.student_id = ?
                    ) THEN 'Dept, Semester & Bookmark'
                    WHEN s.department_id = ? AND ? IS NOT NULL AND s.semester = ? THEN 'Dept & Semester Match'
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
            [
                deptId,           // dept match score
                userSemester, userSemester,  // semester match score
                studentId,        // bookmarked subject match
                studentId,        // bookmarked type match
                deptId, userSemester, userSemester, studentId,  // reason: dept+sem+bookmark
                deptId, userSemester, userSemester,             // reason: dept+sem
                deptId, studentId,                              // reason: dept+bookmark
                deptId,                                         // reason: dept
                studentId                                       // exclude already bookmarked
            ]
        );

        return res.json({
            dashboard: {
                metrics: {
                    totalAvailableResources: pubRes[0].total,
                    totalBookmarks: bookmarks[0].total,
                    totalDownloads: downloads[0].total,
                    contributions: {
                        total: contributions[0].total || 0,
                        pending: contributions[0].pending_count || 0,
                        underReview: contributions[0].under_review_count || 0,
                        verified: contributions[0].verified_count || 0,
                        published: contributions[0].published_count || 0,
                        rejected: contributions[0].rejected_count || 0
                    },
                    requests: {
                        total: requests[0].total || 0,
                        pending: requests[0].pending_count || 0,
                        completed: requests[0].completed_count || 0
                    }
                },
                recommendations,
                recentBookmarks,
                recentContributions,
                recentRequests
            }
        });
    } catch (error) {
        console.error('Error fetching student dashboard:', error);
        return res.status(500).json({ error: 'Failed to retrieve student dashboard.' });
    }
};

/**
 * Get Staff Dashboard Summary
 * GET /api/dashboard/staff
 */
const getStaffDashboard = async (req, res) => {
    try {
        // Platform overview counts
        const [resourceCounts] = await db.query(
            `SELECT 
                COUNT(*) AS total_resources,
                SUM(CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END) AS published_resources,
                SUM(CASE WHEN status IN ('PENDING', 'UNDER_REVIEW') THEN 1 ELSE 0 END) AS pending_reviews,
                SUM(CASE WHEN status = 'ARCHIVED' THEN 1 ELSE 0 END) AS archived_resources
             FROM resources`
        );

        // Pending requests count
        const [requestCounts] = await db.query(
            `SELECT 
                COUNT(*) AS total_requests,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_requests
             FROM resource_requests`
        );

        // User statistics
        const [userCounts] = await db.query(
            `SELECT 
                COUNT(*) AS total_users,
                SUM(CASE WHEN role = 'STUDENT' THEN 1 ELSE 0 END) AS total_students,
                SUM(CASE WHEN role IN ('STAFF', 'ADMIN') THEN 1 ELSE 0 END) AS total_staff
             FROM users`
        );

        // Download count
        const [downloadCounts] = await db.query('SELECT COUNT(*) AS total_downloads FROM resource_downloads');

        // Recent pending contributions needing review (latest 5)
        const [recentPendingContributions] = await db.query(
            `SELECT 
                r.id,
                r.title,
                r.status,
                r.created_at,
                s.name AS subject_name,
                d.name AS department_name,
                u.name AS student_name
             FROM resources r
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN users u ON r.uploaded_by = u.id
             WHERE r.status IN ('PENDING', 'UNDER_REVIEW')
             ORDER BY r.created_at ASC
             LIMIT 5`
        );

        // Recent pending resource requests (latest 5)
        const [recentPendingRequests] = await db.query(
            `SELECT 
                rq.id,
                rq.title,
                rq.status,
                rq.created_at,
                s.name AS subject_name,
                d.name AS department_name,
                u.name AS student_name
             FROM resource_requests rq
             JOIN subjects s ON rq.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN users u ON rq.student_id = u.id
             WHERE rq.status = 'PENDING'
             ORDER BY rq.created_at ASC
             LIMIT 5`
        );

        // Top 5 most downloaded resources
        const [topDownloaded] = await db.query(
            `SELECT 
                r.id,
                r.title,
                s.name AS subject_name,
                d.name AS department_name,
                COUNT(rd.id) AS download_count
             FROM resources r
             JOIN subjects s ON r.subject_id = s.id
             JOIN departments d ON s.department_id = d.id
             JOIN resource_downloads rd ON r.id = rd.resource_id
             GROUP BY r.id
             ORDER BY download_count DESC
             LIMIT 5`
        );

        return res.json({
            dashboard: {
                metrics: {
                    totalResources: resourceCounts[0].total_resources || 0,
                    publishedResources: resourceCounts[0].published_resources || 0,
                    pendingReviews: resourceCounts[0].pending_reviews || 0,
                    archivedResources: resourceCounts[0].archived_resources || 0,
                    totalRequests: requestCounts[0].total_requests || 0,
                    pendingRequests: requestCounts[0].pending_requests || 0,
                    totalUsers: userCounts[0].total_users || 0,
                    totalStudents: userCounts[0].total_students || 0,
                    totalStaff: userCounts[0].total_staff || 0,
                    totalDownloads: downloadCounts[0].total_downloads || 0
                },
                recentPendingContributions,
                recentPendingRequests,
                topDownloaded
            }
        });
    } catch (error) {
        console.error('Error fetching staff dashboard:', error);
        return res.status(500).json({ error: 'Failed to retrieve staff dashboard.' });
    }
};

module.exports = {
    getStudentDashboard,
    getStaffDashboard
};
