const redis = require('redis');
require('dotenv').config();

// Create Redis client with modern API
const redisClient = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
    },
    password: process.env.REDIS_PASSWORD || undefined,
});

// Connect to Redis
redisClient.connect().catch((err) => {
    console.error('❌ Redis connection failed:', err);
});

redisClient.on('connect', () => {
    console.log('✅ Redis connected successfully');
});

redisClient.on('error', (err) => {
    console.error('❌ Redis connection error:', err);
});

redisClient.on('end', () => {
    console.log('Redis connection ended');
});

// Redis helper functions
const redisHelper = {
    // Session management
    setSession: async (sessionId, data, expireInSeconds = 3600) => {
        try {
            await redisClient.setEx(`session:${sessionId}`, expireInSeconds, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Redis setSession error:', error);
            return false;
        }
    },
    
    getSession: async (sessionId) => {
        try {
            const data = await redisClient.get(`session:${sessionId}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Redis getSession error:', error);
            return null;
        }
    },
    
    deleteSession: async (sessionId) => {
        try {
            await redisClient.del(`session:${sessionId}`);
            return true;
        } catch (error) {
            console.error('Redis deleteSession error:', error);
            return false;
        }
    },
    
    // Quiz session management
    setQuizState: async (sessionId, participantId, state) => {
        try {
            const key = `quiz:${sessionId}:participant:${participantId}`;
            await redisClient.setEx(key, 7200, JSON.stringify(state)); // 2 hours
            return true;
        } catch (error) {
            console.error('Redis setQuizState error:', error);
            return false;
        }
    },
    
    getQuizState: async (sessionId, participantId) => {
        try {
            const key = `quiz:${sessionId}:participant:${participantId}`;
            const data = await redisClient.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Redis getQuizState error:', error);
            return null;
        }
    },
    
    // Real-time participant tracking
    addParticipantToSession: async (sessionId, participantId) => {
        try {
            await redisClient.sAdd(`session:${sessionId}:participants`, participantId);
            return true;
        } catch (error) {
            console.error('Redis addParticipantToSession error:', error);
            return false;
        }
    },
    
    removeParticipantFromSession: async (sessionId, participantId) => {
        try {
            await redisClient.sRem(`session:${sessionId}:participants`, participantId);
            return true;
        } catch (error) {
            console.error('Redis removeParticipantFromSession error:', error);
            return false;
        }
    },
    
    getSessionParticipants: async (sessionId) => {
        try {
            return await redisClient.sMembers(`session:${sessionId}:participants`);
        } catch (error) {
            console.error('Redis getSessionParticipants error:', error);
            return [];
        }
    },
    
    // Timer management
    setTimer: async (sessionId, timerData) => {
        try {
            const key = `timer:${sessionId}`;
            await redisClient.setEx(key, 7200, JSON.stringify(timerData));
            return true;
        } catch (error) {
            console.error('Redis setTimer error:', error);
            return false;
        }
    },
    
    getTimer: async (sessionId) => {
        try {
            const key = `timer:${sessionId}`;
            const data = await redisClient.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Redis getTimer error:', error);
            return null;
        }
    },
    
    // Cache management
    set: async (key, value, expireInSeconds = 300) => {
        try {
            await redisClient.setEx(key, expireInSeconds, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Redis set error:', error);
            return false;
        }
    },
    
    get: async (key) => {
        try {
            const data = await redisClient.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Redis get error:', error);
            return null;
        }
    },
    
    del: async (key) => {
        try {
            await redisClient.del(key);
            return true;
        } catch (error) {
            console.error('Redis del error:', error);
            return false;
        }
    }
};

module.exports = { redisClient, redisHelper };