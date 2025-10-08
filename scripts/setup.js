#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

function execAsync(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stderr });
            } else {
                resolve(stdout);
            }
        });
    });
}

async function checkPrerequisites() {
    console.log('🔍 Checking prerequisites...\n');
    
    try {
        // Check Node.js version
        const nodeVersion = await execAsync('node --version');
        console.log(`✅ Node.js: ${nodeVersion.trim()}`);
        
        // Check npm
        const npmVersion = await execAsync('npm --version');
        console.log(`✅ npm: ${npmVersion.trim()}`);
        
        // Check PostgreSQL
        try {
            const pgVersion = await execAsync('psql --version');
            console.log(`✅ PostgreSQL: ${pgVersion.trim()}`);
        } catch (error) {
            console.log('❌ PostgreSQL not found or not in PATH');
            console.log('   Please install PostgreSQL and ensure it\'s in your PATH');
            return false;
        }
        
        // Check Redis (optional)
        try {
            await execAsync('redis-cli --version');
            console.log('✅ Redis: Available (optional)');
        } catch (error) {
            console.log('⚠️  Redis not found (optional for production)');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Prerequisite check failed:', error);
        return false;
    }
}

async function createEnvFile() {
    console.log('\n📝 Setting up environment configuration...\n');
    
    const envPath = path.join(__dirname, '../.env');
    
    if (fs.existsSync(envPath)) {
        const overwrite = await question('📋 .env file already exists. Overwrite? (y/N): ');
        if (overwrite.toLowerCase() !== 'y') {
            console.log('📋 Using existing .env file');
            return;
        }
    }
    
    // Database configuration
    console.log('🗄️  Database Configuration:');
    const dbHost = await question('Database host [localhost]: ') || 'localhost';
    const dbPort = await question('Database port [5432]: ') || '5432';
    const dbName = await question('Database name [quiz_competition]: ') || 'quiz_competition';
    const dbUser = await question('Database user [postgres]: ') || 'postgres';
    const dbPassword = await question('Database password: ');
    
    // Server configuration
    console.log('\n🌐 Server Configuration:');
    const port = await question('Server port [3000]: ') || '3000';
    const jwtSecret = await question('JWT Secret (leave empty for auto-generated): ') || 
                      require('crypto').randomBytes(64).toString('hex');
    
    // Notification configuration (optional)
    console.log('\n📧 Notification Configuration (optional):');
    console.log('ℹ️  You can skip this and distribute credentials manually through the admin panel.');
    const notificationSetup = await question('Configure email notifications? (y/N): ');
    let notificationConfig = `
# Notification Configuration (Optional)
# Uncomment and configure if you want to send credentials via email/SMS
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=587
# EMAIL_USER=your_email@gmail.com
# EMAIL_PASSWORD=your_app_password`;
    
    if (notificationSetup.toLowerCase() === 'y') {
        const emailHost = await question('SMTP host [smtp.gmail.com]: ') || 'smtp.gmail.com';
        const emailPort = await question('SMTP port [587]: ') || '587';
        const emailUser = await question('Email address: ');
        const emailPassword = await question('Email password/app password: ');
        
        notificationConfig = `
# Email Configuration
EMAIL_HOST=${emailHost}
EMAIL_PORT=${emailPort}
EMAIL_USER=${emailUser}
EMAIL_PASSWORD=${emailPassword}`;
    }
    
    // Generate .env content
    const envContent = `# Database Configuration
DB_HOST=${dbHost}
DB_PORT=${dbPort}
DB_NAME=${dbName}
DB_USER=${dbUser}
DB_PASSWORD=${dbPassword}

# Redis Configuration (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=${port}
NODE_ENV=development
${notificationConfig}

# Quiz Configuration
QUIZ_START_TIME=04:00
INSTRUCTION_TIME_MINUTES=5
QUIZ_TIME_MINUTES=15
MAX_PARTICIPANTS=1000
`;
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env file created successfully');
}

async function setupDatabase() {
    console.log('\n🗄️  Setting up database...\n');
    
    try {
        // Check if database exists
        const envPath = path.join(__dirname, '../.env');
        require('dotenv').config({ path: envPath });
        
        const dbName = process.env.DB_NAME;
        const dbUser = process.env.DB_USER;
        const dbHost = process.env.DB_HOST;
        
        console.log(`📊 Creating database: ${dbName}`);
        
        try {
            await execAsync(`createdb -h ${dbHost} -U ${dbUser} ${dbName}`);
            console.log('✅ Database created successfully');
        } catch (error) {
            if (error.stderr.includes('already exists')) {
                console.log('📋 Database already exists');
            } else {
                console.log('⚠️  Database creation failed (might already exist)');
                console.log('   Error:', error.stderr);
            }
        }
        
        // Run migrations
        console.log('📈 Running database migrations...');
        await execAsync('npm run migrate');
        console.log('✅ Database migrations completed');
        
        // Ask about seeding sample data
        const seedData = await question('📊 Load sample quiz data? (y/N): ');
        if (seedData.toLowerCase() === 'y') {
            console.log('📊 Loading sample data...');
            await execAsync('npm run seed');
            console.log('✅ Sample data loaded');
        }
        
    } catch (error) {
        console.error('❌ Database setup failed:', error);
        throw error;
    }
}

async function createAdminUser() {
    console.log('\n👤 Creating admin user...\n');
    
    const createAdmin = await question('👤 Create admin user now? (Y/n): ');
    if (createAdmin.toLowerCase() === 'n') {
        console.log('ℹ️  You can create admin users later with: npm run create-admin create');
        return;
    }
    
    try {
        console.log('🔧 Starting admin user creation wizard...');
        await execAsync('npm run create-admin create');
        console.log('✅ Admin user created successfully');
    } catch (error) {
        console.error('❌ Admin user creation failed:', error);
        console.log('ℹ️  You can try again later with: npm run create-admin create');
    }
}

async function finalInstructions() {
    console.log('\n🎉 Setup completed successfully!\n');
    
    console.log('📋 Next steps:');
    console.log('   1. Start the application:');
    console.log('      npm run dev          # Development mode');
    console.log('      npm start            # Production mode');
    console.log('');
    console.log('   2. Access the admin panel:');
    console.log(`      http://localhost:${process.env.PORT || 3000}/admin/login.html`);
    console.log('');
    console.log('   3. Manage admin users:');
    console.log('      npm run create-admin create    # Create new admin');
    console.log('      npm run create-admin list      # List all admins');
    console.log('');
    console.log('   4. Health check:');
    console.log(`      http://localhost:${process.env.PORT || 3000}/health`);
    console.log('');
    console.log('📚 For more information, check the README.md file');
    console.log('');
    console.log('🚀 Happy quizzing!');
}

async function main() {
    console.log('🎯 Quiz Competition Application Setup\n');
    console.log('This wizard will help you set up the quiz application.\n');
    
    try {
        // Check prerequisites
        const prereqsOk = await checkPrerequisites();
        if (!prereqsOk) {
            console.log('\n❌ Please install missing prerequisites and try again.');
            process.exit(1);
        }
        
        // Install dependencies
        console.log('\n📦 Installing dependencies...');
        await execAsync('npm install');
        console.log('✅ Dependencies installed');
        
        // Create .env file
        await createEnvFile();
        
        // Setup database
        await setupDatabase();
        
        // Create admin user
        await createAdminUser();
        
        // Show final instructions
        await finalInstructions();
        
    } catch (error) {
        console.error('\n❌ Setup failed:', error);
        console.log('\n📋 You can retry the setup by running: node scripts/setup.js');
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Run setup if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };