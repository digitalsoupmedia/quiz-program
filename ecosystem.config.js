module.exports = {
  apps: [{
    name: 'quiz-app',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3004,
      // Database Configuration
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_NAME: 'quiz_competition',
      DB_USER: 'postgres',
      DB_PASSWORD: 'root',
      // Redis Configuration  
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_PASSWORD: '',
      // JWT Configuration
      JWT_SECRET: 'asd98sad8sd8as9d8sad98',
      JWT_EXPIRES_IN: '24h',
      // Timezone Configuration
      TZ: 'Asia/Kolkata',
      APP_TIMEZONE: 'Asia/Kolkata',
      // Quiz Configuration
      QUIZ_START_TIME: '04:00',
      INSTRUCTION_TIME_MINUTES: 5,
      QUIZ_TIME_MINUTES: 15,
      MAX_PARTICIPANTS: 1000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3004,
      // Database Configuration
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_NAME: 'quiz_competition',
      DB_USER: 'postgres',
      DB_PASSWORD: 'root',
      // Redis Configuration  
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_PASSWORD: '',
      // JWT Configuration
      JWT_SECRET: 'asd98sad8sd8as9d8sad98',
      JWT_EXPIRES_IN: '24h',
      // Timezone Configuration
      TZ: 'Asia/Kolkata',
      APP_TIMEZONE: 'Asia/Kolkata',
      // Quiz Configuration
      QUIZ_START_TIME: '04:00',
      INSTRUCTION_TIME_MINUTES: 5,
      QUIZ_TIME_MINUTES: 15,
      MAX_PARTICIPANTS: 1000
    },
    // Logging configuration
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Process management
    exec_mode: 'fork',
    min_uptime: '10s',
    max_restarts: 10,
    
    // Advanced settings for production
    node_args: '--max-old-space-size=1024',
    
    // Health monitoring
    health_check_url: 'http://localhost:3004/health',
    health_check_grace_period: 3000,
    
    // Restart cron (restart daily at 3 AM)
    cron_restart: '0 3 * * *',
    
    // Environment variables
    env_file: '.env'
  }]
};