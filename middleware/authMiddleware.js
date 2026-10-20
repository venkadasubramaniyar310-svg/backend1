const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate requests via Bearer JWT token.
 */
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Authentication failed. No token provided.'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'academic_resource_hub_super_secret_jwt_key_2026'
        );
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Authentication token has expired. Please log in again.'
            });
        }
        return res.status(401).json({
            error: 'Invalid or malformed authentication token.'
        });
    }
};

/**
 * Middleware factory to authorize users by role(s).
 * @param {...string} allowedRoles - E.g. 'STUDENT', 'STAFF', 'ADMIN'
 */
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required.'
            });
        }

        const userRole = (req.user.role || '').toUpperCase();
        const normalizedAllowedRoles = allowedRoles.map(r => r.toUpperCase());

        // ADMINs inherit STAFF permissions
        const isAuthorized =
            normalizedAllowedRoles.includes(userRole) ||
            (normalizedAllowedRoles.includes('STAFF') && userRole === 'ADMIN');

        if (!isAuthorized) {
            return res.status(403).json({
                error: `Access forbidden: Insufficient permissions. Requires one of [${allowedRoles.join(', ')}], but current role is '${req.user.role}'.`
            });
        }

        next();
    };
};

/**
 * Middleware to optionally authenticate requests if a token is present.
 * Does not reject requests if no token is provided.
 */
const optionalAuthenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET || 'academic_resource_hub_super_secret_jwt_key_2026'
            );
            req.user = decoded;
        } catch (err) {
            // Ignore invalid/expired tokens for optional endpoints
        }
    }
    next();
};

// Convenience middleware helpers
const requireStudent = requireRole('STUDENT');
const requireStaff = requireRole('STAFF', 'ADMIN');

module.exports = {
    authenticate,
    optionalAuthenticate,
    requireRole,
    requireStudent,
    requireStaff
};
