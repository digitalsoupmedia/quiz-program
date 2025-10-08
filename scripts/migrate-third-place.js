#!/usr/bin/env node

// Load environment variables first
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

const { Pool } = require('pg');

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'quiz_competition',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'root'
};

console.log('🔧 Database configuration:');
console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
console.log(`   Database: ${dbConfig.database}`);
console.log(`   User: ${dbConfig.user}`);
console.log(`   Password: ${dbConfig.password ? '***' : 'not set'}`);
console.log('');

async function runMigration() {
    const pool = new Pool(dbConfig);
    
    try {
        console.log('🔄 Connecting to database...');
        
        // Read the migration SQL file
        const migrationPath = path.join(__dirname, '../database/migrations/add_third_place_winner.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        console.log('📝 Running migration to add third place winner support...');
        
        // Execute the migration
        await pool.query(migrationSQL);
        
        console.log('✅ Migration completed successfully!');
        console.log('🏆 Third place winners (position 3) are now supported in the database.');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run the migration
runMigration().catch(console.error);