# Quiz Application Deployment Guide

## Prerequisites

1. Node.js (v16 or higher)
2. PostgreSQL (v12 or higher)
3. PM2 (for process management)
4. Redis (optional, for session management)

## Production Deployment Steps

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib
```

### 2. Application Setup

```bash
# Clone/upload your application
cd /var/www/quiz-program

# Install dependencies
npm install --production

# Copy environment file
cp .env.example .env
# Edit .env with production values
nano .env
```

### 3. Database Setup

```bash
# Setup PostgreSQL user and database
sudo -u postgres psql
CREATE USER quiz_user WITH PASSWORD 'your_password';
CREATE DATABASE quiz_app OWNER quiz_user;
GRANT ALL PRIVILEGES ON DATABASE quiz_app TO quiz_user;
\q

# Run migrations
npm run migrate

# Create admin user
npm run create-admin
```

### 4. Start Application with PM2

```bash
# Start the application
npm run pm2:start

# Verify it's running
npm run pm2:status

# View logs
npm run pm2:logs

# Monitor application
npm run pm2:monitor
```

### 5. Configure PM2 for System Startup

```bash
# Generate startup script
pm2 startup

# Save current PM2 configuration
pm2 save
```

## PM2 Commands

### Basic Commands
```bash
npm run pm2:start     # Start the application
npm run pm2:stop      # Stop the application
npm run pm2:restart   # Restart the application
npm run pm2:reload    # Reload without downtime
npm run pm2:delete    # Remove from PM2
npm run pm2:status    # Show status
npm run pm2:logs      # View logs
npm run pm2:monitor   # Open monitoring dashboard
```

### Advanced Commands
```bash
# Deploy with build
npm run deploy

# View specific logs
pm2 logs quiz-app --lines 100

# Flush logs
pm2 flush

# Reset restart counter
pm2 reset quiz-app
```

## Configuration Files

### ecosystem.config.js
The PM2 configuration file includes:
- **Process management**: Auto-restart, memory limits
- **Logging**: Separate files for errors and output
- **Health checks**: Built-in health monitoring
- **Cron restart**: Daily restart at 3 AM for maintenance
- **Environment variables**: Production configuration

### Environment Variables (.env)
Required environment variables:
```
NODE_ENV=production
PORT=3004
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quiz_app
DB_USER=quiz_user
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
APP_TIMEZONE=Asia/Kolkata
```

## Monitoring and Maintenance

### Health Check
The application includes a health check endpoint:
```
GET /health
```

### Log Files
- Combined logs: `./logs/combined.log`
- Error logs: `./logs/error.log`
- Output logs: `./logs/out.log`

### Performance Monitoring
```bash
# Real-time monitoring
npm run pm2:monitor

# Memory and CPU usage
pm2 show quiz-app

# Process list
pm2 list
```

## Troubleshooting

### Application Won't Start
1. Check logs: `npm run pm2:logs`
2. Verify database connection
3. Check environment variables
4. Ensure port 3004 is available

### Memory Issues
1. Check memory usage: `pm2 show quiz-app`
2. Restart application: `npm run pm2:restart`
3. Adjust memory limit in `ecosystem.config.js`

### Database Connection Issues
1. Verify PostgreSQL is running: `sudo systemctl status postgresql`
2. Test database connection manually
3. Check firewall settings

## Security Considerations

1. **Firewall**: Only allow necessary ports (80, 443, 22)
2. **Database**: Use strong passwords and limit access
3. **SSL**: Configure HTTPS with Let's Encrypt
4. **Updates**: Keep system and dependencies updated
5. **Backups**: Regular database backups

## Backup Strategy

### Database Backup
```bash
# Create backup
pg_dump -U quiz_user -h localhost quiz_app > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
psql -U quiz_user -h localhost quiz_app < backup_file.sql
```

### Application Backup
```bash
# Backup entire application
tar -czf quiz-app-backup-$(date +%Y%m%d).tar.gz /var/www/quiz-program
```

## Load Balancing (Optional)

For high traffic (1000+ concurrent users), consider:
1. **Nginx**: As reverse proxy and load balancer
2. **Multiple instances**: Scale PM2 instances
3. **Redis**: For session sharing across instances
4. **Database optimization**: Connection pooling and indexing

## Support

For issues and support:
1. Check application logs
2. Review PM2 status and logs
3. Monitor system resources
4. Check database performance