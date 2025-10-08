const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

async function runMigration() {
    const client = await pool.connect();
    
    try {
        console.log('🚀 Starting database migration...');
        
        // Read schema file
        const schemaPath = path.join(__dirname, '../database/schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        // Execute schema
        await client.query(schema);
        
        console.log('✅ Database schema created successfully!');
        
        // Create default admin user
        const defaultAdminQuery = `
            INSERT INTO admin_users (username, email, password_hash, role)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (username) DO NOTHING
        `;
        
        const bcrypt = require('bcryptjs');
        const defaultPassword = await bcrypt.hash('admin123', 10);
        
        await client.query(defaultAdminQuery, [
            'admin',
            'admin@quizapp.com',
            defaultPassword,
            'super_admin'
        ]);
        
        console.log('✅ Default admin user created (username: admin, password: admin123)');
        console.log('🎉 Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

// Run migration if called directly
if (require.main === module) {
    runMigration().catch(console.error);
}

module.exports = { runMigration };