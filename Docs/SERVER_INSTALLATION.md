# Quiz Competition System - Server Installation Guide

## Overview
This guide provides step-by-step instructions for deploying the Quiz Competition System on AWS Lightsail using Bitnami NGINX stack.

## Minimum Server Specifications

### Recommended AWS Lightsail Instance
- **Instance Type**: 2 GB RAM, 1 vCPU, 60 GB SSD
- **Operating System**: Ubuntu 20.04 LTS (Bitnami NGINX)
- **Monthly Cost**: ~$10-15 USD
- **Concurrent Users**: Up to 300 participants

### Minimum Requirements
- **RAM**: 2 GB (minimum), 4 GB (recommended for 300+ users)
- **CPU**: 1 vCPU (minimum), 2 vCPU (recommended)
- **Storage**: 60 GB SSD
- **Bandwidth**: 3 TB transfer/month
- **Network**: Static IP address

### Database Requirements
- **PostgreSQL**: Version 12 or higher
- **Redis**: Version 6.0 or higher (for session management)
- **Node.js**: Version 16.x or higher

## Pre-Installation Setup

### 1. Create AWS Lightsail Instance

1. Log into AWS Lightsail Console
2. Click "Create instance"
3. Select "Linux/Unix" platform
4. Choose "Apps + OS" blueprint
5. Select "NGINX Certified by Bitnami"
6. Choose instance plan: **2 GB RAM, 1 vCPU, 60 GB SSD**
7. Name your instance (e.g., "quiz-competition-server")
8. Click "Create instance"

### 2. Configure Static IP

1. Go to "Networking" tab in Lightsail
2. Click "Create static IP"
3. Attach to your instance
4. Note down the static IP address

### 3. Configure Firewall

1. Go to "Networking" tab
2. Add these firewall rules:
   ```
   Application: Custom
   Protocol: TCP
   Port: 22 (SSH)
   Source: Anywhere

   Application: HTTP
   Protocol: TCP
   Port: 80
   Source: Anywhere

   Application: HTTPS
   Protocol: TCP
   Port: 443
   Source: Anywhere

   Application: Custom
   Protocol: TCP
   Port: 3000 (Node.js app)
   Source: Anywhere
   ```

## Installation Steps

### 1. Connect to Your Server

```bash
# SSH into your Lightsail instance
ssh -i your-key.pem bitnami@YOUR_STATIC_IP
```

### 2. Update System Packages

```bash
# Update package index
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl wget git unzip software-properties-common
```

### 3. Install Node.js 18.x

```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version
npm --version
```

### 4. Install PostgreSQL

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE quiz_competition;
CREATE USER quiz_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE quiz_competition TO quiz_user;
ALTER USER quiz_user CREATEDB;
\q
EOF
```

### 5. Install Redis

```bash
# Install Redis
sudo apt install -y redis-server

# Configure Redis
sudo nano /etc/redis/redis.conf
# Change: supervised no → supervised systemd
# Change: # maxmemory 2mb → maxmemory 512mb
# Change: # maxmemory-policy noeviction → maxmemory-policy allkeys-lru

# Start and enable Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Test Redis
redis-cli ping
```

### 6. Install PM2 Process Manager

```bash
# Install PM2 globally
sudo npm install -g pm2

# Setup PM2 startup script
sudo pm2 startup systemd
```

## Application Deployment

### 1. Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/quiz-competition
sudo chown bitnami:bitnami /opt/quiz-competition

# Clone repository
cd /opt/quiz-competition
git clone https://github.com/YOUR_USERNAME/quiz-program.git .

# Or upload files via SCP
# scp -i your-key.pem -r ./quiz-program bitnami@YOUR_IP:/opt/quiz-competition/
```

### 2. Configure Environment

```bash
# Create environment file
cd /opt/quiz-competition
cp .env.example .env

# Edit environment variables
nano .env
```

**Environment Configuration (.env):**
```env
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=quiz_competition
DB_USER=quiz_user
DB_PASSWORD=your_secure_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET=your_very_secure_jwt_secret_key_here
JWT_EXPIRES_IN=24h

# Admin Configuration
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=secure_admin_password

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

### 3. Install Dependencies and Setup Database

```bash
# Install Node.js dependencies
npm install --production

# Run database migrations
npm run migrate

# Seed initial data (optional)
npm run seed
```

### 4. Configure NGINX

```bash
# Create NGINX configuration
sudo nano /opt/bitnami/nginx/conf/server_blocks/quiz-competition.conf
```

**NGINX Configuration:**
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name YOUR_DOMAIN_OR_IP;

    # SSL Configuration (update paths for your certificates)
    ssl_certificate /opt/bitnami/nginx/conf/bitnami/certs/server.crt;
    ssl_certificate_key /opt/bitnami/nginx/conf/bitnami/certs/server.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        application/javascript
        application/json
        text/css
        text/javascript
        text/plain
        text/xml;

    # Static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        root /opt/quiz-competition/public;
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri $uri/ =404;
    }

    # Proxy to Node.js application
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeout settings
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket support for Socket.io
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Client max body size for file uploads
    client_max_body_size 10M;

    # Logs
    access_log /opt/bitnami/nginx/logs/quiz_access.log;
    error_log /opt/bitnami/nginx/logs/quiz_error.log;
}
```

### 5. Test NGINX Configuration

```bash
# Test NGINX configuration
sudo /opt/bitnami/nginx/sbin/nginx -t

# Restart NGINX
sudo /opt/bitnami/ctlscript.sh restart nginx
```

### 6. Start Application with PM2

```bash
# Start application with NPM scripts
cd /opt/quiz-competition

# Using NPM scripts (recommended)
npm run pm2:start

# Alternative: Direct PM2 command
pm2 start ecosystem.config.js

# Save PM2 configuration for auto-startup
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Check application status
npm run pm2:status
npm run pm2:logs
```

**Available NPM Scripts for PM2:**
```bash
npm run pm2:start      # Start the application
npm run pm2:stop       # Stop the application  
npm run pm2:restart    # Restart the application
npm run pm2:reload     # Reload without downtime
npm run pm2:delete     # Remove from PM2
npm run pm2:status     # Show status
npm run pm2:logs       # View logs
npm run pm2:monitor    # Open monitoring dashboard
npm run deploy         # Build and start
```

**PM2 Configuration (ecosystem.config.js):**
```javascript
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
      PORT: 3004
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3004
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
    
    // Health monitoring
    health_check_url: 'http://localhost:3004/health',
    health_check_grace_period: 3000,
    
    // Restart cron (restart daily at 3 AM)
    cron_restart: '0 3 * * *',
    
    // Environment variables
    env_file: '.env'
  }]
};
```

## SSL Certificate Setup

### Option 1: Let's Encrypt (Free)

```bash
# Install Certbot
sudo snap install --classic certbot

# Create certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal setup
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Option 2: Custom SSL Certificate

```bash
# Copy your certificates
sudo cp your-certificate.crt /opt/bitnami/nginx/conf/bitnami/certs/server.crt
sudo cp your-private-key.key /opt/bitnami/nginx/conf/bitnami/certs/server.key

# Set proper permissions
sudo chmod 600 /opt/bitnami/nginx/conf/bitnami/certs/server.key
sudo chmod 644 /opt/bitnami/nginx/conf/bitnami/certs/server.crt
```

## Post-Installation Configuration

### 1. Create Log Directories

```bash
# Create log directories
sudo mkdir -p /var/log/quiz-competition
sudo chown bitnami:bitnami /var/log/quiz-competition

# Setup log rotation
sudo nano /etc/logrotate.d/quiz-competition
```

**Log Rotation Configuration:**
```
/var/log/quiz-competition/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 bitnami bitnami
    postrotate
        pm2 reload quiz-competition
    endscript
}
```

### 2. Setup Monitoring

```bash
# Install htop for system monitoring
sudo apt install -y htop

# Setup basic monitoring with PM2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 3. Database Backup Script

```bash
# Create backup directory
sudo mkdir -p /opt/backups
sudo chown bitnami:bitnami /opt/backups

# Create backup script
nano /opt/backups/backup-database.sh
```

**Backup Script:**
```bash
#!/bin/bash
BACKUP_DIR="/opt/backups"
DB_NAME="quiz_competition"
DB_USER="quiz_user"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create backup
pg_dump -h localhost -U $DB_USER -d $DB_NAME > $BACKUP_DIR/quiz_backup_$TIMESTAMP.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "quiz_backup_*.sql" -mtime +7 -delete

echo "Backup completed: quiz_backup_$TIMESTAMP.sql"
```

```bash
# Make script executable
chmod +x /opt/backups/backup-database.sh

# Setup daily backup cron job
crontab -e
# Add: 0 2 * * * /opt/backups/backup-database.sh
```

## Security Hardening

### 1. Firewall Configuration

```bash
# Install and configure UFW
sudo ufw enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw reload
```

### 2. Fail2Ban Setup

```bash
# Install Fail2Ban
sudo apt install -y fail2ban

# Configure Fail2Ban
sudo nano /etc/fail2ban/jail.local
```

**Fail2Ban Configuration:**
```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true
```

### 3. Regular Updates

```bash
# Setup automatic security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

## Testing and Verification

### 1. Health Check

```bash
# Check application health
curl -f http://localhost:3000/health

# Check database connection
pm2 logs quiz-competition
```

### 2. Load Testing

```bash
# Install artillery for load testing
npm install -g artillery

# Create load test configuration
nano load-test.yml
```

**Load Test Configuration:**
```yaml
config:
  target: 'https://your-domain.com'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Quiz participation simulation"
    requests:
      - get:
          url: "/quiz/login"
      - post:
          url: "/api/auth/participant/login"
          json:
            username: "test_user"
            password: "test_password"
```

### 3. Monitoring Setup

```bash
# Check system resources
htop

# Monitor application
pm2 monit

# Check logs
tail -f /var/log/quiz-competition/combined.log
```

## Troubleshooting

### Common Issues

1. **Application won't start**
   ```bash
   # Check logs
   pm2 logs quiz-competition
   
   # Check port availability
   sudo netstat -tlnp | grep :3000
   ```

2. **Database connection issues**
   ```bash
   # Test PostgreSQL connection
   psql -h localhost -U quiz_user -d quiz_competition
   
   # Check PostgreSQL status
   sudo systemctl status postgresql
   ```

3. **NGINX configuration errors**
   ```bash
   # Test NGINX config
   sudo /opt/bitnami/nginx/sbin/nginx -t
   
   # Check NGINX logs
   tail -f /opt/bitnami/nginx/logs/error.log
   ```

4. **Performance issues**
   ```bash
   # Check system resources
   free -h
   df -h
   
   # Monitor database
   sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
   ```

## Maintenance

### Regular Tasks

1. **Weekly**: Check system logs and performance
2. **Monthly**: Update system packages and restart services
3. **Quarterly**: Review and rotate SSL certificates
4. **Annually**: Security audit and penetration testing

### Update Procedure

```bash
# Update application
cd /opt/quiz-competition
git pull origin main
npm install --production
pm2 reload quiz-competition

# Update system
sudo apt update && sudo apt upgrade -y
sudo /opt/bitnami/ctlscript.sh restart
```

## Support and Documentation

- **Application Logs**: `/var/log/quiz-competition/`
- **NGINX Logs**: `/opt/bitnami/nginx/logs/`
- **Database Logs**: `/var/log/postgresql/`
- **System Logs**: `/var/log/syslog`

For additional support, refer to:
- [Bitnami NGINX Documentation](https://docs.bitnami.com/aws/apps/nginx/)
- [AWS Lightsail Documentation](https://lightsail.aws.amazon.com/ls/docs)
- [Node.js Production Deployment Guide](https://nodejs.org/en/docs/guides/production-deployment/)

---

**Total Estimated Setup Time**: 2-3 hours  
**Monthly Operating Cost**: $10-15 USD  
**Scalability**: Up to 300 concurrent users