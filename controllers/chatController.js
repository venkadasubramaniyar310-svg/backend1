const db = require('../config/db');

/**
 * Get available chat contacts and conversations
 * GET /api/chat/contacts
 */
const getContacts = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const isStaff = req.user.role === 'STAFF' || req.user.role === 'ADMIN';

        let contacts = [];

        if (!isStaff) {
            // For Students: return all staff members for doubt clearance,
            // annotated with any existing conversation snippet and unread messages
            const [rows] = await db.query(
                `SELECT 
                    u.id,
                    u.name,
                    u.email,
                    u.role,
                    d.name AS department_name,
                    (
                        SELECT m.message 
                        FROM chat_messages m 
                        WHERE (m.sender_id = u.id AND m.receiver_id = ?)
                           OR (m.sender_id = ? AND m.receiver_id = u.id)
                        ORDER BY m.created_at DESC 
                        LIMIT 1
                    ) AS last_message,
                    (
                        SELECT m.created_at 
                        FROM chat_messages m 
                        WHERE (m.sender_id = u.id AND m.receiver_id = ?)
                           OR (m.sender_id = ? AND m.receiver_id = u.id)
                        ORDER BY m.created_at DESC 
                        LIMIT 1
                    ) AS last_message_time,
                    (
                        SELECT COUNT(*) 
                        FROM chat_messages m 
                        WHERE m.sender_id = u.id 
                          AND m.receiver_id = ? 
                          AND m.is_read = FALSE
                    ) AS unread_count
                 FROM users u
                 LEFT JOIN departments d ON u.department_id = d.id
                 WHERE u.role IN ('STAFF', 'ADMIN')
                 ORDER BY (last_message_time IS NOT NULL) DESC, last_message_time DESC, u.name ASC`,
                [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]
            );
            contacts = rows;
        } else {
            // For Staff: return students who have had conversations or sent doubt queries
            const [rows] = await db.query(
                `SELECT 
                    u.id,
                    u.name,
                    u.email,
                    u.role,
                    d.name AS department_name,
                    (
                        SELECT m.message 
                        FROM chat_messages m 
                        WHERE (m.sender_id = u.id AND m.receiver_id = ?)
                           OR (m.sender_id = ? AND m.receiver_id = u.id)
                        ORDER BY m.created_at DESC 
                        LIMIT 1
                    ) AS last_message,
                    (
                        SELECT m.created_at 
                        FROM chat_messages m 
                        WHERE (m.sender_id = u.id AND m.receiver_id = ?)
                           OR (m.sender_id = ? AND m.receiver_id = u.id)
                        ORDER BY m.created_at DESC 
                        LIMIT 1
                    ) AS last_message_time,
                    (
                        SELECT COUNT(*) 
                        FROM chat_messages m 
                        WHERE m.sender_id = u.id 
                          AND m.receiver_id = ? 
                          AND m.is_read = FALSE
                    ) AS unread_count
                 FROM users u
                 LEFT JOIN departments d ON u.department_id = d.id
                 WHERE u.role = 'STUDENT'
                   AND u.id IN (
                       SELECT DISTINCT sender_id FROM chat_messages WHERE receiver_id = ?
                       UNION
                       SELECT DISTINCT receiver_id FROM chat_messages WHERE sender_id = ?
                   )
                 ORDER BY (unread_count > 0) DESC, last_message_time DESC, u.name ASC`,
                [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]
            );

            // If no conversations yet, return all students as available contacts
            if (rows.length === 0) {
                const [allStudents] = await db.query(
                    `SELECT 
                        u.id, u.name, u.email, u.role, d.name AS department_name,
                        NULL AS last_message, NULL AS last_message_time, 0 AS unread_count
                     FROM users u
                     LEFT JOIN departments d ON u.department_id = d.id
                     WHERE u.role = 'STUDENT'
                     ORDER BY u.name ASC
                     LIMIT 20`
                );
                contacts = allStudents;
            } else {
                contacts = rows;
            }
        }

        return res.json({ contacts });
    } catch (error) {
        console.error('Error fetching chat contacts:', error);
        return res.status(500).json({ error: 'Failed to retrieve chat contacts.' });
    }
};

/**
 * Get messages between logged in user and another user
 * GET /api/chat/messages/:otherUserId
 */
const getMessages = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const otherUserId = parseInt(req.params.otherUserId, 10);

        if (!otherUserId) {
            return res.status(400).json({ error: 'Valid user ID is required.' });
        }

        const [messages] = await db.query(
            `SELECT 
                m.id,
                m.sender_id,
                m.receiver_id,
                m.message,
                m.is_read,
                m.created_at,
                u_sender.name AS sender_name,
                u_sender.role AS sender_role
             FROM chat_messages m
             JOIN users u_sender ON m.sender_id = u_sender.id
             WHERE (m.sender_id = ? AND m.receiver_id = ?)
                OR (m.sender_id = ? AND m.receiver_id = ?)
             ORDER BY m.created_at ASC`,
            [currentUserId, otherUserId, otherUserId, currentUserId]
        );

        // Mark incoming messages as read
        await db.query(
            'UPDATE chat_messages SET is_read = TRUE WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE',
            [otherUserId, currentUserId]
        );

        return res.json({ messages });
    } catch (error) {
        console.error('Error fetching chat messages:', error);
        return res.status(500).json({ error: 'Failed to retrieve messages.' });
    }
};

/**
 * Mark messages from a contact as read
 * POST /api/chat/read/:otherUserId
 */
const markAsRead = async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const otherUserId = parseInt(req.params.otherUserId, 10);

        await db.query(
            'UPDATE chat_messages SET is_read = TRUE WHERE sender_id = ? AND receiver_id = ?',
            [otherUserId, currentUserId]
        );

        return res.json({ success: true });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        return res.status(500).json({ error: 'Failed to mark messages as read.' });
    }
};

module.exports = {
    getContacts,
    getMessages,
    markAsRead
};
