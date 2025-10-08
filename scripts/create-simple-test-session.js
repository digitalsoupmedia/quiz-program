#!/usr/bin/env node

const db = require('../config/database');
require('dotenv').config();

async function createSimpleTestSession() {
    console.log('🔧 Creating Test Session with JavaScript Timezone Handling...\n');
    
    try {
        // Get quiz
        const quiz = await db.query('SELECT id, title FROM quizzes LIMIT 1');
        if (quiz.rows.length === 0) {
            console.log('❌ No quiz found');
            return;
        }
        console.log('Using quiz:', quiz.rows[0].title);
        
        // Clean up old test sessions
        await db.query("DELETE FROM quiz_sessions WHERE session_name LIKE '%scheduler-test%'");
        console.log('🧹 Cleaned up old test sessions');
        
        // Calculate start time in JavaScript (bypass database timezone issues)
        const now = new Date();
        const startTime = new Date(now.getTime() + (60 * 1000)); // 1 minute from now
        
        console.log('Current time UTC:', now.toISOString());
        console.log('Start time UTC (1 min from now):', startTime.toISOString());
        
        // Store as UTC timestamp (what the database naturally expects)
        const sessionResult = await db.query(`
            INSERT INTO quiz_sessions (session_name, quiz_id, start_time, auto_start, status, max_participants)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, session_name, start_time
        `, [
            'scheduler-test-simple-' + Date.now(),
            quiz.rows[0].id,
            startTime, // JavaScript Date object - stored as UTC
            true,
            'scheduled',
            50
        ]);
        
        const session = sessionResult.rows[0];
        
        console.log('\n✅ Test session created with JavaScript timing:');
        console.log('   Session ID:', session.id);
        console.log('   Session Name:', session.session_name);
        console.log('   Stored start_time:', session.start_time);
        
        // Test simple time comparison (no timezone conversion)
        const timingTest = await db.query(`
            SELECT 
                EXTRACT(EPOCH FROM (qs.start_time - NOW())) as seconds_until_start,
                EXTRACT(EPOCH FROM (NOW() - qs.start_time)) as seconds_past_start,
                qs.start_time,
                NOW() as current_utc
            FROM quiz_sessions qs
            WHERE qs.id = $1
        `, [session.id]);
        
        const timing = timingTest.rows[0];
        console.log('\n🔍 Simple UTC timing test:');
        console.log('   Start time (UTC):', timing.start_time);
        console.log('   Current time (UTC):', timing.current_utc);
        console.log('   Seconds until start:', timing.seconds_until_start);
        console.log('   Seconds past start:', timing.seconds_past_start);
        
        if (timing.seconds_until_start > 0 && timing.seconds_until_start < 120) {
            console.log('\n🎉 SUCCESS! Simple UTC timing works!');
            console.log(`   Session will auto-start in ${Math.round(timing.seconds_until_start)} seconds`);
            console.log('\n💡 SOLUTION: Use UTC timestamps and simple comparisons');
            console.log('   - Store sessions as UTC timestamps');
            console.log('   - Compare using NOW() directly (no timezone conversion)');
            console.log('   - Let the frontend handle timezone display');
        } else {
            console.log('\n❌ Even simple UTC timing failed');
        }
        
        console.log('\n📋 This session uses UTC timing - monitor if it auto-starts correctly');
        console.log(`   Session ID: ${session.id}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        try {
            await db.end();
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

// Run if called directly
if (require.main === module) {
    createSimpleTestSession().catch(error => {
        console.error('Script execution failed:', error);
        process.exit(1);
    });
}

module.exports = { createSimpleTestSession };