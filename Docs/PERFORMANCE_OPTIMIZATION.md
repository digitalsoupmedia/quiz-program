# Performance Optimization Guide for 300 Concurrent Users

## Current Server Limitations (2GB RAM, 1 vCPU)

**Realistic Capacity: 100-150 concurrent users**

## Optimization Strategies

### 1. Memory Optimization

#### Node.js Memory Management
```javascript
// Add to server.js
process.env.NODE_OPTIONS = '--max-old-space-size=512'; // Limit Node.js to 512MB
```

#### PM2 Configuration Updates
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'quiz-competition',
    script: 'server.js',
    instances: 1,
    exec_mode: 'cluster',
    max_memory_restart: '400M', // Restart if memory exceeds 400MB
    node_args: '--max-old-space-size=512',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
```

#### PostgreSQL Memory Tuning
```sql
-- Add to postgresql.conf
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB
max_connections = 50
```

#### Redis Memory Optimization
```bash
# Add to redis.conf
maxmemory 200mb
maxmemory-policy allkeys-lru
save ""  # Disable persistence to save memory
```

### 2. Connection Pooling and Limits

#### Database Connection Pooling
```javascript
// config/database.js - Update pool settings
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,        // Reduced from default 20 to 10
  min: 2,         // Minimum connections
  idle: 10000,    // Close idle connections after 10s
  acquire: 60000, // Max time to get connection
  evict: 1000     // Run eviction every second
});
```

#### Socket.IO Connection Limits
```javascript
// socket/handlers.js - Add connection limiting
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 1e6,    // 1MB max message size
  pingTimeout: 60000,        // 60 seconds
  pingInterval: 25000,       // 25 seconds
  upgradeTimeout: 30000,     // 30 seconds
  allowEIO3: true
});

// Add connection limiting middleware
io.use((socket, next) => {
  const currentConnections = io.sockets.sockets.size;
  if (currentConnections >= 150) { // Limit to 150 connections
    return next(new Error('Server at capacity'));
  }
  next();
});
```

### 3. Caching Strategy

#### Redis Caching for Frequent Queries
```javascript
// utils/cache.js
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

async function cacheSessionData(sessionId, data, ttl = 300) {
  await client.setex(`session:${sessionId}`, ttl, JSON.stringify(data));
}

async function getCachedSessionData(sessionId) {
  const cached = await client.get(`session:${sessionId}`);
  return cached ? JSON.parse(cached) : null;
}

// Cache quiz questions
async function cacheQuizQuestions(quizId, questions) {
  await client.setex(`quiz:${quizId}:questions`, 3600, JSON.stringify(questions));
}
```

#### Update Quiz Routes with Caching
```javascript
// routes/quiz.js - Add caching to frequently accessed data
router.get('/session/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Check cache first
    const cached = await getCachedSessionData(sessionId);
    if (cached) {
      return res.json({
        success: true,
        data: cached
      });
    }
    
    // If not cached, query database and cache result
    const result = await db.query(/* existing query */);
    const sessionData = result.rows[0];
    
    // Cache for 30 seconds
    await cacheSessionData(sessionId, sessionData, 30);
    
    res.json({
      success: true,
      data: sessionData
    });
  } catch (error) {
    // Handle error
  }
});
```

### 4. Rate Limiting and Request Optimization

#### Aggressive Rate Limiting
```javascript
// server.js - Update rate limiting
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Reduced from 100 to 50 requests per window
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limits for API endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute for API calls
});

app.use('/api/', apiLimiter);
```

#### Optimize Polling Intervals
```javascript
// public/quiz/js/session.js - Reduce polling frequency
function startSmartPolling(sessionId) {
  const baseInterval = 5000; // Increased from 2000ms to 5000ms
  let currentInterval = baseInterval;
  let consecutiveErrors = 0;
  
  const poll = async () => {
    try {
      const response = await fetch(`/api/quiz/session/${sessionId}/status`);
      if (response.ok) {
        consecutiveErrors = 0;
        currentInterval = baseInterval;
      }
    } catch (error) {
      consecutiveErrors++;
      currentInterval = Math.min(baseInterval * Math.pow(1.5, consecutiveErrors), 30000);
    }
    
    pollingTimeoutId = setTimeout(poll, currentInterval);
  };
}
```

### 5. Database Query Optimization

#### Add Database Indexes
```sql
-- Add these indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_participants_status 
ON session_participants(session_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_participant_answers_session_participant 
ON participant_answers(session_id, participant_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quiz_sessions_status_time 
ON quiz_sessions(status, start_time);

-- Optimize queries with EXPLAIN ANALYZE
EXPLAIN ANALYZE SELECT * FROM quiz_sessions WHERE status = 'active';
```

#### Optimize Heavy Queries
```javascript
// utils/prizeCalculator.js - Optimize result calculation
async function calculateSessionResults(sessionId, client = null) {
  const dbClient = client || db;
  
  try {
    // Use a single query instead of multiple queries
    const results = await dbClient.query(`
      WITH session_stats AS (
        SELECT 
          sp.participant_id,
          sp.submitted_at,
          sp.joined_at,
          COUNT(pa.id) as total_answered,
          COUNT(pa.id) FILTER (WHERE pa.is_correct = true) as correct_answers,
          EXTRACT(EPOCH FROM (sp.submitted_at - sp.joined_at)) as completion_time_seconds
        FROM session_participants sp
        LEFT JOIN participant_answers pa ON sp.session_id = pa.session_id 
          AND sp.participant_id = pa.participant_id
        WHERE sp.session_id = $1 AND sp.status = 'submitted'
        GROUP BY sp.participant_id, sp.submitted_at, sp.joined_at
      )
      SELECT * FROM session_stats
    `, [sessionId]);
    
    // Process results in batches to avoid memory issues
    // ... rest of the function
  } catch (error) {
    console.error('Calculate session results error:', error);
    throw error;
  }
}
```

## Load Testing for Current Server

### Test Script
```yaml
# load-test-realistic.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 2  # Start with 2 users per second
    - duration: 120
      arrivalRate: 3  # Increase to 3 users per second
    - duration: 60
      arrivalRate: 1  # Cool down

scenarios:
  - name: "Realistic quiz flow"
    weight: 100
    requests:
      - get:
          url: "/quiz"
      - think: 2
      - post:
          url: "/api/auth/participant/login"
          json:
            username: "test{{ $randomInt(1, 200) }}"
            password: "password"
      - think: 5
      - get:
          url: "/api/participant/sessions"
      - think: 3
```

### Monitoring During Load Test
```bash
# Monitor system resources
watch -n 1 'free -h && echo "---" && ps aux | grep -E "(node|postgres|redis)" | head -10'

# Monitor application
pm2 monit

# Monitor database connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
```

## Alternative Architecture for 300 Users

### Option 1: Vertical Scaling (Simplest)
```
Upgrade to: 4 GB RAM, 2 vCPU, 80 GB SSD
Cost: ~$20-40/month
Expected Capacity: 250-350 users
```

### Option 2: Horizontal Scaling with Load Balancer
```
Load Balancer: NGINX (1 GB RAM, 1 vCPU) - $5/month
App Server 1: Node.js (2 GB RAM, 1 vCPU) - $10/month  
App Server 2: Node.js (2 GB RAM, 1 vCPU) - $10/month
Database: PostgreSQL (2 GB RAM, 1 vCPU) - $10/month
Redis: Cache (1 GB RAM, 1 vCPU) - $5/month
Total: $40/month
Expected Capacity: 400-500 users
```

### Option 3: Microservices Architecture
```
API Gateway: 1 GB RAM - $5/month
Quiz Service: 2 GB RAM - $10/month
User Service: 2 GB RAM - $10/month  
WebSocket Service: 2 GB RAM - $10/month
Database: 4 GB RAM - $20/month
Redis Cluster: 2 GB RAM - $10/month
Total: $65/month
Expected Capacity: 500-800 users
```

## Recommendation

**For 300 concurrent users reliably:**

1. **Immediate**: Upgrade to **4 GB RAM, 2 vCPU** ($20-40/month)
2. **Long-term**: Implement horizontal scaling with load balancer ($40-65/month)
3. **Apply all optimizations** from this guide regardless of server size

**Current 2 GB server**: Can handle 100-150 users with optimizations, but 300 users will cause performance issues and potential crashes.

## Monitoring Thresholds

Set up alerts for:
- **Memory usage > 80%**
- **CPU usage > 90%** for more than 2 minutes  
- **Active database connections > 40**
- **WebSocket connections > 120**
- **Response time > 2 seconds**

These thresholds will help you identify when you're approaching capacity limits.