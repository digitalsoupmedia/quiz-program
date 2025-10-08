#!/usr/bin/env node

// Load environment variables first
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

async function testThirdPlace() {
    const pool = new Pool(dbConfig);
    
    try {
        console.log('🔍 Testing third place winner database constraint...');
        
        // Check current constraint
        const constraintResult = await pool.query(`
            SELECT constraint_name, check_clause 
            FROM information_schema.check_constraints 
            WHERE table_name = 'prize_winners' 
            AND constraint_name LIKE '%prize_position%'
        `);
        
        console.log('Current constraints:');
        constraintResult.rows.forEach(row => {
            console.log(`  - ${row.constraint_name}: ${row.check_clause}`);
        });
        
        // Try to insert a test third place winner (this should fail if constraint is not updated)
        console.log('\n🧪 Testing third place insertion...');
        
        try {
            await pool.query(`
                INSERT INTO prize_winners (session_id, participant_id, prize_position, score, completion_time_seconds)
                VALUES (-1, -1, 3, 75.5, 600)
            `);
            console.log('✅ Third place insertion successful!');
            
            // Clean up test data
            await pool.query('DELETE FROM prize_winners WHERE session_id = -1');
            console.log('🧹 Test data cleaned up');
            
        } catch (insertError) {
            if (insertError.message.includes('prize_position')) {
                console.log('❌ Third place insertion failed due to constraint:');
                console.log(`   ${insertError.message}`);
                console.log('\n💡 You need to run the migration to fix this!');
                console.log('   Run: node scripts/migrate-third-place.js');
            } else {
                console.log('❌ Third place insertion failed for other reason:');
                console.log(`   ${insertError.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        await pool.end();
    }
}

// Run the test
testThirdPlace().catch(console.error);