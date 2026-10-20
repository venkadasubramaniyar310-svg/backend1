const path = require('path');
const fs = require('fs');

/**
 * Embedded SQLite Database Manager for Academic Resource Hub
 * Provides 100% API compatibility with mysql2/promise `db.query(sql, params)`
 * allowing the full-stack project to run serverless on Netlify or locally
 * without requiring any external MySQL server.
 */

let dbInstance = null;

const os = require('os');

function resolveDatabasePath() {
    // If explicitly configured via environment variable
    if (process.env.SQLITE_DB_PATH) {
        const customPath = process.env.SQLITE_DB_PATH;
        const dir = path.dirname(customPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return customPath;
    }

    // In Netlify serverless / AWS Lambda environment, use os.tmpdir()
    const isServerless = process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT;
    if (isServerless) {
        const tmpDir = os.tmpdir();
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        const tmpDbPath = path.join(tmpDir, 'academic_resource_hub.sqlite');
        // If a bundled database exists in the project, copy it to tmp on cold start
        const bundledPath = path.join(__dirname, '../database/academic_resource_hub.sqlite');
        if (!fs.existsSync(tmpDbPath) && fs.existsSync(bundledPath)) {
            try {
                fs.copyFileSync(bundledPath, tmpDbPath);
            } catch (err) {
                console.warn('Could not copy bundled sqlite to tmp:', err.message);
            }
        }
        return tmpDbPath;
    }

    // Local development storage in backend/database/
    const localDir = path.join(__dirname, '../database');
    if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
    }
    return path.join(localDir, 'academic_resource_hub.sqlite');
}

function getDatabase() {
    if (dbInstance) return dbInstance;

    const dbPath = resolveDatabasePath();
    console.log(`📦 Initializing SQLite database at: ${dbPath}`);

    let Database;
    try {
        Database = require('better-sqlite3');
    } catch (err) {
        console.error('Failed to load better-sqlite3:', err.message);
        throw err;
    }

    const db = new Database(dbPath, {
        // verbose: process.env.NODE_ENV === 'development' ? console.log : null
    });

    // Enable WAL mode for high performance and concurrent reads/writes
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Register MySQL-compatible SQL functions in SQLite
    db.function('NOW', () => new Date().toISOString().slice(0, 19).replace('T', ' '));
    db.function('now', () => new Date().toISOString().slice(0, 19).replace('T', ' '));
    db.function('CONCAT', (...args) => args.join(''));
    db.function('concat', (...args) => args.join(''));
    db.function('IFNULL', (a, b) => (a !== null && a !== undefined ? a : b));
    db.function('ifnull', (a, b) => (a !== null && a !== undefined ? a : b));

    // Initialize Schema & Seed Data if not already created
    initializeSchema(db);

    dbInstance = db;
    return dbInstance;
}

function initializeSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS departments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'STUDENT',
            department_id INTEGER,
            semester TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            department_id INTEGER NOT NULL,
            year TEXT NOT NULL,
            semester TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS resource_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            subject_id INTEGER NOT NULL,
            resource_type_id INTEGER NOT NULL,
            uploaded_by INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            academic_year TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
            FOREIGN KEY (resource_type_id) REFERENCES resource_types(id) ON DELETE RESTRICT,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS resource_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            subject_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'PENDING',
            staff_remarks TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            resource_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (student_id, resource_id),
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS resource_downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            resource_id INTEGER NOT NULL,
            downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS resource_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id INTEGER NOT NULL,
            staff_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            remarks TEXT,
            reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
            FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE INDEX IF NOT EXISTS idx_users_semester ON users(semester);
        CREATE INDEX IF NOT EXISTS idx_subjects_department ON subjects(department_id);
        CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
        CREATE INDEX IF NOT EXISTS idx_resources_subject ON resources(subject_id);
        CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(resource_type_id);
        CREATE INDEX IF NOT EXISTS idx_resources_uploader ON resources(uploaded_by);
        CREATE INDEX IF NOT EXISTS idx_chat_participants ON chat_messages(sender_id, receiver_id);
    `);

    // Always ensure standard academic departments exist
    const insertDept = db.prepare('INSERT OR IGNORE INTO departments (id, name) VALUES (?, ?)');
    insertDept.run(1, 'Artificial Intelligence & Data Science');
    insertDept.run(2, 'Computer Science & Engineering');
    insertDept.run(3, 'Information Technology');
    insertDept.run(4, 'Electronics & Communication Engineering');
    insertDept.run(5, 'Mechanical Engineering');
    insertDept.run(6, 'Electrical & Electronics Engineering');
    insertDept.run(7, 'Civil Engineering');
    insertDept.run(8, 'Master of Business Administration (MBA)');
    insertDept.run(9, 'Science & Humanities');

    // Always ensure standard resource types exist
    const insertType = db.prepare('INSERT OR IGNORE INTO resource_types (id, name) VALUES (?, ?)');
    const types = [
        [1, 'Lecture Notes'],
        [2, 'Study Materials'],
        [3, 'PowerPoint Presentations'],
        [4, 'Previous-Year Question Papers'],
        [5, 'Question Banks'],
        [6, 'Laboratory Manuals'],
        [7, 'Syllabus and Course Documents'],
        [8, 'Project Guidelines']
    ];
    types.forEach(([id, name]) => insertType.run(id, name));

    // Check if initial users exist; if not, seed default data
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    if (userCount.count === 0) {
        console.log('🌱 Seeding initial academic users and demo curriculum...');

        // 3. Subjects
        const insertSubj = db.prepare('INSERT OR IGNORE INTO subjects (id, name, department_id, year, semester) VALUES (?, ?, ?, ?, ?)');
        const subjects = [
            [1, 'Database Management Systems', 1, 'II Year', 'Semester 3'],
            [2, 'Data Structures and Algorithms', 1, 'II Year', 'Semester 3'],
            [3, 'Machine Learning Fundamentals', 1, 'III Year', 'Semester 5'],
            [4, 'Artificial Intelligence Principles', 1, 'III Year', 'Semester 6'],
            [5, 'Operating Systems', 2, 'II Year', 'Semester 4'],
            [6, 'Computer Networks', 2, 'III Year', 'Semester 5'],
            [7, 'Design and Analysis of Algorithms', 2, 'II Year', 'Semester 3'],
            [8, 'Web Technologies', 3, 'II Year', 'Semester 4'],
            [9, 'Cloud Computing', 3, 'IV Year', 'Semester 7'],
            [10, 'Information Security', 3, 'III Year', 'Semester 6']
        ];
        subjects.forEach(sub => insertSubj.run(...sub));

        // 4. Default Users (Password: Password@123)
        // Hash for Password@123
        const passwordHash = '$2b$10$vbwVBH.4MQXcFGzZrEuNZezYxAWZVpFf8mAwRCtnej4WsJ9.sfSlm';
        const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, name, email, password_hash, role, department_id, semester) VALUES (?, ?, ?, ?, ?, ?, ?)');
        insertUser.run(1, 'Dr. Sarah Jenkins', 'staff@college.edu', passwordHash, 'STAFF', 1, null);
        insertUser.run(2, 'Alex Rivera', 'student@college.edu', passwordHash, 'STUDENT', 1, 'Semester 3');
        insertUser.run(3, 'College Administrator', 'admin@college.edu', passwordHash, 'ADMIN', 1, null);

        // 5. Seed sample published resource
        const insertResource = db.prepare(`
            INSERT OR IGNORE INTO resources (id, title, description, subject_id, resource_type_id, uploaded_by, file_path, academic_year, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Check if sample files exist in uploads
        const sampleFile = 'uploads/DBMS_Unit_1_Notes_1792245677912-1792245678308-458417532.txt';
        insertResource.run(
            1,
            'DBMS Unit 1 Complete Lecture Notes (Relational Algebra & Normalization)',
            'Comprehensive lecture notes covering relational model, keys, ER diagrams, 1NF to BCNF normalization, and SQL transaction fundamentals.',
            1, // DBMS
            1, // Lecture Notes
            1, // Dr. Sarah Jenkins (Staff)
            sampleFile,
            '2025-2026',
            'PUBLISHED'
        );

        insertResource.run(
            2,
            'Data Structures & Algorithms - Trees & Graphs Comprehensive Guide',
            'In-depth study guide for Binary Search Trees, AVL Trees balancing, Dijkstra shortest path algorithm, and Graph traversals (BFS/DFS).',
            2, // DSA
            1, // Lecture Notes
            1, // Staff
            'uploads/BST_AVL_Notes_1792246157297-1792246157778-185595546.txt',
            '2025-2026',
            'PUBLISHED'
        );

        console.log('✅ SQLite Schema initialized and seeded successfully.');
    }
}

/**
 * Drop-in wrapper that matches mysql2/promise `query(sql, params)`
 */
const sqliteAdapter = {
    async query(sql, params = []) {
        const db = getDatabase();
        let normalizedSql = sql.trim();

        // Convert MySQL INSERT IGNORE to SQLite INSERT OR IGNORE
        if (/INSERT\s+IGNORE\s+INTO/i.test(normalizedSql)) {
            normalizedSql = normalizedSql.replace(/INSERT\s+IGNORE\s+INTO/gi, 'INSERT OR IGNORE INTO');
        }

        const isSelect = /^SELECT|^PRAGMA|^WITH/i.test(normalizedSql);

        try {
            const stmt = db.prepare(normalizedSql);
            if (isSelect) {
                const rows = stmt.all(...params);
                return [rows, []];
            } else {
                const info = stmt.run(...params);
                const result = {
                    insertId: Number(info.lastInsertRowid) || 0,
                    affectedRows: info.changes || 0,
                    changedRows: info.changes || 0
                };
                return [result, []];
            }
        } catch (err) {
            console.error(`SQLite Query Error [${normalizedSql}]:`, err.message);
            throw err;
        }
    },

    async execute(sql, params = []) {
        return this.query(sql, params);
    },

    getDb() {
        return getDatabase();
    }
};

module.exports = sqliteAdapter;
