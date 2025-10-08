const jwt = require('jsonwebtoken');
const db = require('../config/database');

/**
 * Check if participant is authenticated
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object  
 * @param {Function} next - Express next function
 */
async function checkParticipantAuth(req, res, next) {
    try {
        // Check for token in cookies or authorization header
        let token = req.cookies?.participantToken;
        
        if (!token && req.headers.authorization) {
            const authHeader = req.headers.authorization;
            if (authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }
        
        if (!token) {
            req.isAuthenticated = false;
            return next();
        }
        
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if participant still exists and is active
        const participantResult = await db.query(
            'SELECT p.*, uc.is_active FROM participants p JOIN user_credentials uc ON p.id = uc.participant_id WHERE p.id = $1',
            [decoded.id]
        );
        
        if (participantResult.rows.length === 0 || !participantResult.rows[0].is_active) {
            req.isAuthenticated = false;
            return next();
        }
        
        req.user = participantResult.rows[0];
        req.isAuthenticated = true;
        next();
        
    } catch (error) {
        console.error('Auth check error:', error);
        req.isAuthenticated = false;
        next();
    }
}

/**
 * Middleware to redirect based on authentication status
 * @param {string} redirectIfAuth - Where to redirect if authenticated
 * @param {string} redirectIfNotAuth - Where to redirect if not authenticated
 */
function authRedirect(redirectIfAuth = '/quiz/dashboard.html', redirectIfNotAuth = '/quiz/login.html') {
    return async (req, res, next) => {
        await checkParticipantAuth(req, res, () => {
            if (req.isAuthenticated && redirectIfAuth) {
                return res.redirect(redirectIfAuth);
            } else if (!req.isAuthenticated && redirectIfNotAuth) {
                return res.redirect(redirectIfNotAuth);
            }
            next();
        });
    };
}

/**
 * Require authentication - redirect to login if not authenticated
 */
function requireAuth(req, res, next) {
    if (!req.isAuthenticated) {
        return res.redirect('/quiz/login.html');
    }
    next();
}

module.exports = {
    checkParticipantAuth,
    authRedirect,
    requireAuth
};