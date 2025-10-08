const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateToken } = require('../middleware/auth');
const db = require('../config/database');
const { redisHelper } = require('../config/redis');
const router = express.Router();

// Participant login
router.post('/participant/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }
        
        // Get participant with credentials
        const result = await db.query(`
            SELECT p.*, uc.username, uc.password_hash, uc.is_active, uc.last_login
            FROM participants p 
            JOIN user_credentials uc ON p.id = uc.participant_id 
            WHERE uc.username = $1 AND uc.is_active = true
        `, [username]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }
        
        const participant = result.rows[0];
        
        // Verify password
        const passwordMatch = await bcrypt.compare(password, participant.password_hash);
        
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }
        
        // Update last login
        await db.query(
            'UPDATE user_credentials SET last_login = CURRENT_TIMESTAMP WHERE participant_id = $1',
            [participant.id]
        );
        
        // Generate JWT token
        const token = generateToken({
            id: participant.id,
            username: participant.username,
            email: participant.email,
            type: 'participant'
        });
        
        // Store session in Redis
        await redisHelper.setSession(participant.id, {
            participantId: participant.id,
            username: participant.username,
            email: participant.email,
            loginTime: new Date().toISOString()
        }, 24 * 60 * 60); // 24 hours
        
        // Set secure HTTP-only cookie for authentication
        // Configure for proxy environments
        const cookieOptions = {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: '/'
        };
        
        // Adjust security settings based on environment
        if (process.env.NODE_ENV === 'production') {
            // Behind Apache proxy, might need different settings
            cookieOptions.secure = false; // Apache handles HTTPS termination
            cookieOptions.sameSite = 'lax';
        } else {
            cookieOptions.secure = false; // Development
            cookieOptions.sameSite = 'lax';
        }
        
        res.cookie('participantToken', token, cookieOptions);
        
        console.log('Setting participant cookie for user:', participant.id, 'Token length:', token.length);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                participant: {
                    id: participant.id,
                    name: participant.name,
                    email: participant.email,
                    designation: participant.designation,
                    company: participant.company,
                    username: participant.username
                }
            }
        });
        
    } catch (error) {
        console.error('Participant login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

// Admin login
router.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }
        
        // Get admin user
        const result = await db.query(`
            SELECT * FROM admin_users 
            WHERE username = $1 AND is_active = true
        `, [username]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }
        
        const admin = result.rows[0];
        
        // Verify password
        const passwordMatch = await bcrypt.compare(password, admin.password_hash);
        
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }
        
        // Update last login
        await db.query(
            'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [admin.id]
        );
        
        // Generate JWT token
        const token = generateToken({
            id: admin.id,
            username: admin.username,
            email: admin.email,
            role: admin.role,
            type: 'admin'
        });
        
        // Store session in Redis
        await redisHelper.setSession(`admin_${admin.id}`, {
            adminId: admin.id,
            username: admin.username,
            email: admin.email,
            role: admin.role,
            loginTime: new Date().toISOString()
        }, 24 * 60 * 60); // 24 hours
        
        // Set secure HTTP-only cookie for admin authentication
        // Configure for proxy environments
        const cookieOptions = {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: '/'
        };
        
        // Adjust security settings based on environment
        if (process.env.NODE_ENV === 'production') {
            // Behind Apache proxy, might need different settings
            cookieOptions.secure = false; // Apache handles HTTPS termination
            cookieOptions.sameSite = 'lax';
        } else {
            cookieOptions.secure = false; // Development
            cookieOptions.sameSite = 'lax';
        }
        
        res.cookie('adminToken', token, cookieOptions);
        
        console.log('Setting admin cookie for user:', admin.id, 'Token length:', token.length);

        res.json({
            success: true,
            message: 'Admin login successful',
            data: {
                token,
                admin: {
                    id: admin.id,
                    username: admin.username,
                    email: admin.email,
                    role: admin.role
                }
            }
        });
        
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

// Logout (clear session)
router.post('/logout', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        let token = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else if (req.cookies?.participantToken) {
            token = req.cookies.participantToken;
        } else if (req.cookies?.adminToken) {
            token = req.cookies.adminToken;
        }
        
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Clear session from Redis
            if (decoded.type === 'admin') {
                await redisHelper.deleteSession(`admin_${decoded.id}`);
            } else {
                await redisHelper.deleteSession(decoded.id);
            }
        }
        
        // Clear cookies if they exist
        if (req.cookies?.participantToken) {
            res.clearCookie('participantToken');
        }
        if (req.cookies?.adminToken) {
            res.clearCookie('adminToken');
        }
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
        
    } catch (error) {
        console.error('Logout error:', error);
        // Still clear cookies even if there's an error
        if (req.cookies?.participantToken) {
            res.clearCookie('participantToken');
        }
        if (req.cookies?.adminToken) {
            res.clearCookie('adminToken');
        }
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    }
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
    try {
        // Check for token in cookies first, then authorization header
        let token = req.cookies?.participantToken || req.cookies?.adminToken;
        
        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if session exists in Redis
        let sessionKey = decoded.type === 'admin' ? `admin_${decoded.id}` : decoded.id;
        const session = await redisHelper.getSession(sessionKey);
        
        if (!session) {
            return res.status(401).json({
                success: false,
                message: 'Session expired'
            });
        }
        
        res.json({
            success: true,
            message: 'Token is valid',
            data: {
                user: {
                    id: decoded.id,
                    username: decoded.username,
                    email: decoded.email,
                    type: decoded.type,
                    role: decoded.role
                }
            }
        });
        
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
        
        console.error('Token verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Token verification failed'
        });
    }
});

// Password reset request (for demo purposes - in production, implement proper email verification)
router.post('/reset-password-request', async (req, res) => {
    try {
        const { email, userType } = req.body;
        
        if (!email || !userType) {
            return res.status(400).json({
                success: false,
                message: 'Email and user type are required'
            });
        }
        
        let table = userType === 'admin' ? 'admin_users' : 'participants';
        
        const result = await db.query(
            `SELECT id, email FROM ${table} WHERE email = $1`,
            [email]
        );
        
        if (result.rows.length === 0) {
            // Don't reveal if email exists or not for security
            return res.json({
                success: true,
                message: 'If the email exists, a reset link will be sent'
            });
        }
        
        // In production, generate reset token and send email
        // For demo, just return success
        res.json({
            success: true,
            message: 'Password reset instructions sent to your email'
        });
        
    } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({
            success: false,
            message: 'Password reset request failed'
        });
    }
});

module.exports = router;