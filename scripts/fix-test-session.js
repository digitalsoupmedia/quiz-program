#!/usr/bin/env node

const db = require('../config/database');
require('dotenv').config();

async function fixTestSession() {
    console.log('🔧 Creating Properly Timed Test Session...\n');
    
    try {
        const appTimezone = process.env.APP_TIMEZONE || 'UTC';
        console.log('Using timezone:', appTimezone);
        
        // Get quiz
        const quiz = await db.query('SELECT id, title FROM quizzes LIMIT 1');
        if (quiz.rows.length === 0) {
            console.log('❌ No quiz found');
            return;
        }
        
        // Clean up old test sessions
        await db.query("DELETE FROM quiz_sessions WHERE session_name LIKE '%scheduler-test%'");
        console.log('🧹 Cleaned up old test sessions');
        
        // Create session using database's timezone-aware insertion
        // This tells the database to treat the timestamp as being in the app timezone
        const sessionResult = await db.query(`
            INSERT INTO quiz_sessions (session_name, quiz_id, start_time, auto_start, status, max_participants)
            VALUES ($1, $2, (NOW() AT TIME ZONE $3 + INTERVAL '1 minute')::timestamp, $4, $5, $6)
            RETURNING id, session_name, start_time, 
                     start_time AT TIME ZONE $3 as start_time_local,
                     NOW() AT TIME ZONE $3 as current_local
        `, [
            'scheduler-test-fixed-' + Date.now(),
            quiz.rows[0].id,
            appTimezone,
            true,
            'scheduled',
            50
        ]);
        
        const session = sessionResult.rows[0];
        
        console.log('\n✅ Test session created:');
        console.log('   Session ID:', session.id);
        console.log('   Session Name:', session.session_name);
        console.log('   Stored start_time:', session.start_time);
        console.log('   Local interpretation:', session.start_time_local);
        console.log('   Current local time:', session.current_local);
        
        // Verify timing
        const timingTest = await db.query(`
            SELECT EXTRACT(EPOCH FROM ((qs.start_time AT TIME ZONE $2) - (NOW() AT TIME ZONE $2))) as seconds_until_start,
                   EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE $2) - (qs.start_time AT TIME ZONE $2))) as seconds_past_start
            FROM quiz_sessions qs
            WHERE qs.id = $1
        `, [session.id, appTimezone]);
        
        const timing = timingTest.rows[0];
        console.log('\n🔍 Timing verification:');
        console.log('   Seconds until start:', timing.seconds_until_start);
        console.log('   Seconds past start:', timing.seconds_past_start);
        
        if (timing.seconds_until_start > 0 && timing.seconds_until_start < 120) {
            console.log('\n✅ Session timing looks correct! Should auto-start in ~1 minute');
        } else {
            console.log('\n❌ Session timing still incorrect');
        }
        
        console.log('\n📋 Monitor the session:');
        console.log('   Watch server logs for auto-start messages');
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
    fixTestSession().catch(error => {
        console.error('Script execution failed:', error);
        process.exit(1);
    });
}

module.exports = { fixTestSession };