const jwt = require('jsonwebtoken');
const db = require('../config/database');

// Generate JWT token
const generateToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });
};

// Verify JWT token
const verifyToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

// Authentication middleware for participants
const authenticateParticipant = async (req, res, next) => {
    try {
        // Check for token in cookies first, then authorization header
        let token = req.cookies?.participantToken;
        
        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7); // Remove 'Bearer ' prefix
            }
        }
        
        if (!token) {
            console.log('No token found in cookies or headers for participant auth');
            console.log('Cookies:', req.cookies);
            console.log('Auth header:', req.headers.authorization);
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }
        
        const decoded = verifyToken(token);
        
        // Verify participant exists and credentials are active
        const result = await db.query(`
            SELECT p.*, uc.username, uc.is_active 
            FROM participants p 
            JOIN user_credentials uc ON p.id = uc.participant_id 
            WHERE p.id = $1 AND uc.is_active = true
        `, [decoded.id]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or inactive user'
            });
        }
        
        req.user = result.rows[0];
        req.userType = 'participant';
        next();
        
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        console.error('Authentication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

// Authentication middleware for admin
const authenticateAdmin = async (req, res, next) => {
    try {
        // Check for token in cookies first, then authorization header
        let token = req.cookies?.adminToken;
        
        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7); // Remove 'Bearer ' prefix
            }
        }
        
        if (!token) {
            console.log('No admin token found in cookies or headers');
            console.log('Cookies:', req.cookies);
            console.log('Auth header:', req.headers.authorization);
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }
        const decoded = verifyToken(token);
        
        // Verify admin exists and is active
        const result = await db.query(`
            SELECT * FROM admin_users 
            WHERE id = $1 AND is_active = true
        `, [decoded.id]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or inactive admin'
            });
        }
        
        req.user = result.rows[0];
        req.userType = 'admin';
        next();
        
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        console.error('Admin authentication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

// Authorization middleware for admin roles
const authorizeAdmin = (requiredRole = 'admin') => {
    return (req, res, next) => {
        if (!req.user || req.userType !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }
        
        if (requiredRole === 'super_admin' && req.user.role !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: 'Super admin access required'
            });
        }
        
        next();
    };
};

// Middleware to check quiz session access
const checkSessionAccess = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Session ID required'
            });
        }
        
        // Check if session exists
        const sessionResult = await db.query(
            'SELECT * FROM quiz_sessions WHERE id = $1',
            [sessionId]
        );
        
        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Quiz session not found'
            });
        }
        
        const session = sessionResult.rows[0];
        
        // If user is admin, allow access
        if (req.userType === 'admin') {
            req.session = session;
            return next();
        }
        
        // For participants, check if they are registered for this session
        let participantResult = await db.query(
            'SELECT * FROM session_participants WHERE session_id = $1 AND participant_id = $2',
            [sessionId, req.user.id]
        );
        
        // TEMPORARY CHANGE: Auto-join participants if not already joined (bypass join requirement)
        // TODO: Revert this change in the future to restore join requirement
        // To revert: uncomment the original error return below and remove the auto-join logic
        if (participantResult.rows.length === 0) {
            // ORIGINAL CODE (commented temporarily):
            // return res.status(403).json({
            //     success: false,
            //     message: 'Not registered for this quiz session'
            // });
            
            // TEMPORARY AUTO-JOIN LOGIC:
            console.log(`[TEMP] Auto-joining participant ${req.user.id} to session ${sessionId}`);
            
            // Check if session is still available for joining
            if (session.status === 'completed' || session.status === 'cancelled') {
                return res.status(403).json({
                    success: false,
                    message: 'Cannot join completed or cancelled session'
                });
            }
            
            // Auto-create session participant entry
            const autoJoinResult = await db.query(`
                INSERT INTO session_participants (session_id, participant_id, joined_at, status)
                VALUES ($1, $2, CURRENT_TIMESTAMP, 'joined')
                RETURNING *
            `, [sessionId, req.user.id]);
            
            participantResult.rows = autoJoinResult.rows;
            console.log(`[TEMP] Successfully auto-joined participant ${req.user.id} to session ${sessionId}`);
        }
        
        req.session = session;
        req.sessionParticipant = participantResult.rows[0];
        next();
        
    } catch (error) {
        console.error('Session access check error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify session access'
        });
    }
};

// Middleware to check if participant has not submitted yet (for quiz access)
const checkNotSubmitted = (req, res, next) => {
    if (!req.sessionParticipant) {
        return res.status(400).json({
            success: false,
            message: 'Session participant not found'
        });
    }
    
    if (req.sessionParticipant.status === 'submitted') {
        return res.status(400).json({
            success: false,
            message: 'You have already completed this quiz session'
        });
    }
    
    next();
};

// Middleware to check if quiz is in correct state
const checkQuizState = (allowedStates) => {
    return (req, res, next) => {
        if (!req.session) {
            return res.status(400).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        if (!allowedStates.includes(req.session.status)) {
            return res.status(400).json({
                success: false,
                message: `Quiz is not in correct state. Current: ${req.session.status}, Required: ${allowedStates.join(' or ')}`
            });
        }
        
        next();
    };
};

// Middleware to log admin actions
const logAdminAction = (action) => {
    return async (req, res, next) => {
        if (req.userType === 'admin') {
            try {
                await db.query(`
                    INSERT INTO admin_audit_log (admin_id, action, entity_type, entity_id, details, ip_address)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    req.user.id,
                    action,
                    req.params.entityType || null,
                    req.params.entityId || null,
                    JSON.stringify({
                        method: req.method,
                        url: req.originalUrl,
                        body: req.body,
                        params: req.params
                    }),
                    req.ip
                ]);
            } catch (error) {
                console.error('Failed to log admin action:', error);
            }
        }
        next();
    };
};

module.exports = {
    generateToken,
    verifyToken,
    authenticateParticipant,
    authenticateAdmin,
    authorizeAdmin,
    checkSessionAccess,
    checkNotSubmitted,
    checkQuizState,
    logAdminAction
};