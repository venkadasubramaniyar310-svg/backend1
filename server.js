const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const db = require('./config/db');

// Route Handlers
const authRoutes = require('./routes/authRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const requestRoutes = require('./routes/requestRoutes');
const bookmarkRoutes = require('./routes/bookmarkRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const downloadRoutes = require('./routes/downloadRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const chatRoutes = require('./routes/chatRoutes');
const aiRoutes = require('./routes/aiRoutes');
const { generateClarityReply } = require('./services/clarityService');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Setup Socket.io for Real-Time Doubt Clearance Chat
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically (from both serverless /tmp and local project directory)
const os = require('os');
const tmpUploadsDir = path.join(os.tmpdir(), 'uploads');
if (fs.existsSync(tmpUploadsDir)) {
    app.use('/uploads', express.static(tmpUploadsDir));
}
app.use('/uploads', express.static(path.join(__dirname, process.env.UPLOAD_DIR || 'uploads')));

// Central API Router
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/resources', resourceRoutes);
apiRouter.use('/reviews', reviewRoutes);
apiRouter.use('/requests', requestRoutes);
apiRouter.use('/bookmarks', bookmarkRoutes);
apiRouter.use('/categories', categoryRoutes);
apiRouter.use('/downloads', downloadRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/chat', chatRoutes);
apiRouter.use('/ai', aiRoutes);

// Health check endpoint
apiRouter.get('/health', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS solution');
        res.json({
            status: 'ok',
            message: 'Academic Resource Hub API is operational',
            dbConnected: rows[0].solution === 2,
            engine: process.env.DB_CLIENT === 'mysql' ? 'MySQL' : 'SQLite (Embedded)',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(200).json({
            status: 'degraded',
            message: 'API operational, but database is currently unreachable',
            dbError: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Mount API routes at both /api and /.netlify/functions/api for Netlify serverless support
app.use('/api', apiRouter);
app.use('/.netlify/functions/api', apiRouter);

// Serve Frontend static assets in production if built
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.use((req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
            return next();
        }
        res.sendFile(path.join(frontendDist, 'index.html'));
    });
} else {
    // Root endpoint when backend is hosted as API only
    app.get('/', (req, res) => {
        res.json({
            message: 'Academic Resource Hub API Server',
            version: '1.0.0',
            chat: 'Socket.io real-time chat enabled',
            docs: '/api/health'
        });
    });
}

// Global Error Handler (including Multer errors)
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err.message);

    if (err.name === 'MulterError') {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: `File too large. Maximum allowed size is ${process.env.MAX_FILE_SIZE_MB || 25}MB`
            });
        }
        return res.status(400).json({ error: err.message });
    }

    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error'
    });
});

// ==========================================
// SOCKET.IO REAL-TIME CHAT
// ==========================================

// Authenticate socket connections using JWT token
io.use((socket, next) => {
    const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
        return next(new Error('Authentication failed: Missing token'));
    }

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'academic_resource_hub_super_secret_jwt_key_2026'
        );
        socket.user = decoded;
        next();
    } catch (err) {
        return next(new Error('Authentication failed: Invalid token'));
    }
});

io.on('connection', (socket) => {
    const userId = socket.user.id;
    const userRoom = `user_${userId}`;
    socket.join(userRoom);

    console.log(`Socket connected: ${socket.user.name} (${socket.user.role}) [ID: ${userId}]`);

    // Handle incoming chat message
    socket.on('send_message', async (data, callback) => {
        try {
            const { receiver_id, message } = data;

            if (!receiver_id || !message || !message.trim()) {
                if (callback) callback({ error: 'Receiver ID and message content are required.' });
                return;
            }

            // Persist message in MySQL
            const [result] = await db.query(
                `INSERT INTO chat_messages (sender_id, receiver_id, message, is_read, created_at)
                 VALUES (?, ?, ?, FALSE, NOW())`,
                [userId, receiver_id, message.trim()]
            );

            const messagePayload = {
                id: result.insertId,
                sender_id: userId,
                receiver_id: parseInt(receiver_id, 10),
                message: message.trim(),
                is_read: false,
                created_at: new Date().toISOString(),
                sender_name: socket.user.name,
                sender_role: socket.user.role
            };

            // Emit to recipient's private socket room
            io.to(`user_${receiver_id}`).emit('new_message', messagePayload);

            // Confirm back to sender
            if (callback) callback({ success: true, message: messagePayload });
            socket.emit('message_sent', messagePayload);

            // If sender is a STUDENT and receiver is a STAFF member, trigger Automated Clarity Reply
            if (socket.user.role === 'STUDENT') {
                try {
                    const [staffRows] = await db.query(
                        'SELECT id, name, role FROM users WHERE id = ?',
                        [receiver_id]
                    );

                    if (staffRows.length > 0 && (staffRows[0].role === 'STAFF' || staffRows[0].role === 'ADMIN')) {
                        const staffUser = staffRows[0];
                        const studentId = userId;
                        const queryMessage = message.trim();

                        // Simulate typing indicator from staff after 400ms
                        setTimeout(() => {
                            io.to(`user_${studentId}`).emit('user_typing', {
                                sender_id: staffUser.id,
                                sender_name: staffUser.name,
                                isTyping: true
                            });

                            // Deliver automated clarity reply after 1000ms
                            setTimeout(async () => {
                                try {
                                    io.to(`user_${studentId}`).emit('user_typing', {
                                        sender_id: staffUser.id,
                                        sender_name: staffUser.name,
                                        isTyping: false
                                    });

                                    const clarityContent = await generateClarityReply(queryMessage, studentId, staffUser);

                                    // Persist in chat_messages table
                                    const [clarityResult] = await db.query(
                                        `INSERT INTO chat_messages (sender_id, receiver_id, message, is_read, created_at)
                                         VALUES (?, ?, ?, FALSE, NOW())`,
                                        [staffUser.id, studentId, clarityContent]
                                    );

                                    const clarityPayload = {
                                        id: clarityResult.insertId,
                                        sender_id: staffUser.id,
                                        receiver_id: studentId,
                                        message: clarityContent,
                                        is_read: false,
                                        created_at: new Date().toISOString(),
                                        sender_name: staffUser.name,
                                        sender_role: staffUser.role,
                                        is_auto_clarity: true
                                    };

                                    // Emit to student and staff
                                    io.to(`user_${studentId}`).emit('new_message', clarityPayload);
                                    io.to(`user_${staffUser.id}`).emit('new_message', clarityPayload);
                                } catch (clarityErr) {
                                    console.error('Automated clarity reply generation failed:', clarityErr);
                                }
                            }, 1000);
                        }, 400);
                    }
                } catch (staffCheckErr) {
                    console.error('Error verifying staff receiver for auto clarity:', staffCheckErr);
                }
            }
        } catch (err) {
            console.error('Socket message error:', err);
            if (callback) callback({ error: 'Failed to send message.' });
        }
    });

    // Handle typing indicator
    socket.on('typing', ({ receiver_id, isTyping }) => {
        io.to(`user_${receiver_id}`).emit('user_typing', {
            sender_id: userId,
            sender_name: socket.user.name,
            isTyping
        });
    });

    // Handle marking messages as read
    socket.on('mark_read', async ({ sender_id }) => {
        try {
            await db.query(
                'UPDATE chat_messages SET is_read = TRUE WHERE sender_id = ? AND receiver_id = ?',
                [sender_id, userId]
            );
            io.to(`user_${sender_id}`).emit('messages_read', {
                reader_id: userId
            });
        } catch (err) {
            console.error('Socket mark_read error:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.user.name} [ID: ${userId}]`);
    });
});

// Start HTTP & Socket server only when running directly (not inside Netlify / Lambda serverless)
if (require.main === module || (!process.env.NETLIFY && !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.LAMBDA_TASK_ROOT)) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server & Socket.io running on port ${PORT}`);
    });
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = io;
