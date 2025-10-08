const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const quizRoutes = require('./routes/quiz');
const participantRoutes = require('./routes/participant');

// Import socket handlers
const socketHandlers = require('./socket/handlers');

// Import database connection
const db = require('./config/database');

// Import session scheduler
const sessionScheduler = require('./services/sessionScheduler');

// Import quiz authentication middleware
const { checkParticipantAuth, authRedirect, requireAuth } = require('./middleware/quizAuth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' ? false : "*",
        methods: ["GET", "POST"]
    }
});

// Trust proxy configuration for proper IP detection behind reverse proxy
// Only trust the first proxy (Apache) - more secure than 'true'
app.set('trust proxy', 1);


// Middleware - Configure helmet appropriately for environment
if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'", // Allow inline scripts for quiz functionality
                    "https://cdn.tailwindcss.com", // Tailwind CSS CDN
                    "https://cdnjs.cloudflare.com" // Font Awesome and other CDN scripts
                ],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'", // Allow inline styles
                    "https://cdn.tailwindcss.com",
                    "https://cdnjs.cloudflare.com"
                ],
                fontSrc: [
                    "'self'",
                    "https://cdnjs.cloudflare.com",
                    "data:" // Allow data URLs for fonts
                ],
                imgSrc: [
                    "'self'",
                    "data:", // Allow data URLs for images
                    "blob:" // Allow blob URLs
                ],
                connectSrc: [
                    "'self'",
                    "ws:", // WebSocket connections
                    "wss:" // Secure WebSocket connections
                ]
            }
        }
    }));
} else {
    // Development: minimal security for easier debugging
    app.use(helmet({
        contentSecurityPolicy: false, // Disable CSP completely for dev
        hsts: false,
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: false
    }));
}
// CORS configuration for proxy environments
const corsOptions = {
    credentials: true,
    optionsSuccessStatus: 200
};

// In production behind proxy, allow specific origins
if (process.env.NODE_ENV === 'production') {
    corsOptions.origin = function (origin, callback) {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);
        
        // For Apache proxy, check common proxy origins
        const allowedOrigins = [
            'http://localhost',
            'https://localhost', 
            process.env.FRONTEND_URL,
            process.env.DOMAIN_URL
        ].filter(Boolean);
        
        if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
            return callback(null, true);
        }
        
        // Allow same origin requests
        return callback(null, true);
    };
} else {
    corsOptions.origin = "*";
}

app.use(cors(corsOptions));

// Multi-tiered rate limiting strategy
// Adjusted for quiz application with 300+ concurrent users from same corporate IP
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50000, // High limit to accommodate 300+ concurrent quiz users from same IP
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
});

// More strict rate limiting for authentication endpoints to prevent brute force
// Use user-based rate limiting instead of IP-based for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Higher limit since multiple users may come from same IP
    message: 'Too many login attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for successful logins to allow legitimate users
    skipSuccessfulRequests: true,
    // Custom key generator based on username instead of IP for auth endpoints
    keyGenerator: (req) => {
        // For auth endpoints, use username if available, otherwise fallback to IP
        const username = req.body?.username || req.body?.email || req.body?.phone;
        return username ? `auth_${username}` : `ip_${req.ip}`;
    }
});

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Apply stricter rate limiting to authentication routes
app.use('/api/auth/', authLimiter);

// Advanced rate limiting removed - using only general IP-based rate limiting for better multi-user support

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Make io instance available to routes
app.set('io', io);

// API Routes - using only general IP-based rate limiting for better multi-user support
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/participant', participantRoutes);

// Quiz Section Routes with Authentication
app.get('/quiz', authRedirect('/quiz/dashboard.html', '/quiz/login.html'));

// Login page - redirect to dashboard if already authenticated
app.get('/quiz/login.html', authRedirect('/quiz/dashboard.html', null), (req, res) => {
    res.sendFile(path.join(__dirname, 'public/quiz/login.html'));
});

// Dashboard and other quiz pages - require authentication
app.get('/quiz/dashboard.html', checkParticipantAuth, requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/quiz/dashboard.html'));
});

app.get('/quiz/session.html', checkParticipantAuth, requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/quiz/session.html'));
});

app.get('/quiz/results.html', checkParticipantAuth, requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public/quiz/results.html'));
});

// Catch-all for /quiz/* routes - redirect based on auth status
app.get('/quiz/*', authRedirect('/quiz/dashboard.html', '/quiz/login.html'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    
    // Initialize socket handlers
    socketHandlers.initializeHandlers(socket, io);
    
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        socketHandlers.handleDisconnect(socket, io);
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation Error',
            errors: err.errors
        });
    }
    
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        });
    }
    
    res.status(500).json({
        success: false,
        message: 'Internal Server Error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Test database connection
        await db.query('SELECT NOW()');
        console.log('✅ Database connected successfully');
        
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Admin Panel: http://localhost:${PORT}/admin`);
            console.log(`🎯 Quiz Portal: http://localhost:${PORT}/quiz`);
            console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
            
            // Start session scheduler
            sessionScheduler.start();
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    
    // Stop session scheduler
    sessionScheduler.stop();
    
    server.close(() => {
        console.log('Server closed');
        db.end().then(() => {
            console.log('Database connection closed');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    
    // Stop session scheduler
    sessionScheduler.stop();
    
    server.close(() => {
        console.log('Server closed');
        db.end().then(() => {
            console.log('Database connection closed');
            process.exit(0);
        });
    });
});

startServer();

module.exports = { app, server, io };