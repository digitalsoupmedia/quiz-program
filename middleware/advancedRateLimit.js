// Advanced rate limiting with user-based controls
const rateLimit = require('express-rate-limit');

// In-memory store for user-based rate limiting
// In production, consider using Redis for distributed rate limiting
const userRequestCounts = new Map();

// Clean up old entries every 15 minutes
setInterval(() => {
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    
    for (const [key, data] of userRequestCounts.entries()) {
        if (now - data.windowStart > fifteenMinutes) {
            userRequestCounts.delete(key);
        }
    }
}, 15 * 60 * 1000);

/**
 * User-based rate limiting for authenticated routes
 * This allows multiple users from the same IP to have separate limits
 */
function createUserBasedLimiter(options = {}) {
    const {
        windowMs = 15 * 60 * 1000, // 15 minutes
        max = 1000, // requests per user per window
        message = 'Too many requests from this user, please try again later.'
    } = options;

    return (req, res, next) => {
        // Extract user identifier
        let userId = null;
        
        // Try to get user ID from JWT token
        if (req.headers.authorization) {
            try {
                const token = req.headers.authorization.replace('Bearer ', '');
                const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
                userId = `user_${decoded.userId}`;
            } catch (error) {
                // Token invalid, fall through to IP-based limiting
            }
        }
        
        // Try to get user ID from cookies (for participant sessions)
        if (!userId && req.cookies?.participantToken) {
            try {
                const decoded = require('jsonwebtoken').verify(req.cookies.participantToken, process.env.JWT_SECRET);
                userId = `participant_${decoded.participantId}`;
            } catch (error) {
                // Token invalid, fall through to IP-based limiting
            }
        }
        
        // If no user ID found, use IP-based limiting
        if (!userId) {
            userId = `ip_${req.ip}`;
        }
        
        const now = Date.now();
        const windowStart = Math.floor(now / windowMs) * windowMs;
        
        // Get or create user request count
        if (!userRequestCounts.has(userId)) {
            userRequestCounts.set(userId, {
                count: 0,
                windowStart: windowStart
            });
        }
        
        const userData = userRequestCounts.get(userId);
        
        // Reset count if we're in a new window
        if (windowStart > userData.windowStart) {
            userData.count = 0;
            userData.windowStart = windowStart;
        }
        
        // Increment request count
        userData.count++;
        
        // Check if limit exceeded
        if (userData.count > max) {
            return res.status(429).json({
                success: false,
                message: message,
                retryAfter: Math.ceil((userData.windowStart + windowMs - now) / 1000)
            });
        }
        
        // Add rate limit headers
        res.set({
            'X-RateLimit-Limit': max,
            'X-RateLimit-Remaining': Math.max(0, max - userData.count),
            'X-RateLimit-Reset': new Date(userData.windowStart + windowMs).toISOString()
        });
        
        next();
    };
}

/**
 * Quiz-specific rate limiting for session polling
 */
const quizPollingLimiter = createUserBasedLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Higher limit for quiz status polling during active sessions
    message: 'Too many quiz polling requests from this user.'
});

/**
 * Answer submission rate limiting
 */
const answerSubmissionLimiter = createUserBasedLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Higher limit for participant interactions during quiz
    message: 'Too many answer submissions from this user.'
});

/**
 * Admin monitoring rate limiting
 */
const adminMonitoringLimiter = createUserBasedLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 150, // Admin monitoring requests
    message: 'Too many admin monitoring requests from this user.'
});

module.exports = {
    createUserBasedLimiter,
    quizPollingLimiter,
    answerSubmissionLimiter,
    adminMonitoringLimiter
};