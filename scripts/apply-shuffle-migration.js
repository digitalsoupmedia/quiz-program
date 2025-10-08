const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function applyShuffleMigration() {
    try {
        console.log('Applying question shuffle migration...');
        
        // Read migration file
        const migrationPath = path.join(__dirname, '../database/migrations/002_add_question_shuffle_column.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Execute migration
        await db.query(migrationSQL);
        
        console.log('✅ Question shuffle migration applied successfully');
        console.log('✅ shuffled_question_order column added to session_participants table');
        console.log('✅ GIN index created for JSON queries');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

applyShuffleMigration();