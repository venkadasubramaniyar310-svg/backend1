const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Resolves a safe writable directory for file uploads.
 * On serverless platforms (Netlify / AWS Lambda), the filesystem is read-only
 * except for /tmp (os.tmpdir()). This prevents ENOENT/EROFS crashes.
 */
function getUploadDir() {
    const isServerless = process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT;
    if (isServerless) {
        const tmpDir = path.join(os.tmpdir(), 'uploads');
        try {
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
        } catch (e) {
            console.warn('Could not create tmp uploads dir:', e.message);
        }
        return tmpDir;
    }

    const localDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads');
    try {
        if (!fs.existsSync(localDir)) {
            fs.mkdirSync(localDir, { recursive: true });
        }
        return localDir;
    } catch (e) {
        // Fallback to os.tmpdir() if local directory is read-only
        const fallback = path.join(os.tmpdir(), 'uploads');
        try {
            if (!fs.existsSync(fallback)) {
                fs.mkdirSync(fallback, { recursive: true });
            }
        } catch (_) {}
        return fallback;
    }
}

// Disk storage engine with dynamic destination resolution
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, getUploadDir());
    },
    filename: (req, file, cb) => {
        // Unique filename: timestamp-random-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${baseName}-${uniqueSuffix}${ext}`);
    }
});

// File filter based on academic resource types
const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.zip', '.rar'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type (${ext}). Allowed formats: ${allowedExtensions.join(', ')}`), false);
    }
};

const maxFileSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 25;

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: maxFileSizeMB * 1024 * 1024 // in bytes
    }
});

module.exports = upload;
