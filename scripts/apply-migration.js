const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
    try {
        console.log('Applying database migration...');
        
        // Read migration file
        const migrationPath = path.join(__dirname, '../database/migrations/001_add_auto_start_column.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Execute migration
        await db.query(migrationSQL);
        
        console.log('✅ Migration applied successfully');
        console.log('✅ auto_start column added to quiz_sessions table');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

applyMigration();