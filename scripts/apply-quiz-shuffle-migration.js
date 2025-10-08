const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function applyQuizShuffleMigration() {
    try {
        console.log('Applying quiz shuffle settings migration...');
        
        // Read migration file
        const migrationPath = path.join(__dirname, '../database/migrations/003_add_quiz_shuffle_settings.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Execute migration
        await db.query(migrationSQL);
        
        console.log('✅ Quiz shuffle migration applied successfully');
        console.log('✅ shuffle_questions and shuffle_options columns added to quizzes table');
        console.log('✅ Existing quizzes updated with default shuffle settings');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

applyQuizShuffleMigration();