#!/usr/bin/env node

const db = require('../config/database');
require('dotenv').config();

async function createTestSession() {
    console.log('🧪 Creating Test Session for Immediate Auto-Start...\n');
    
    try {
        const appTimezone = process.env.APP_TIMEZONE || 'UTC';
        console.log('Using timezone:', appTimezone);
        
        // Let the database handle the timezone conversion properly
        // We'll create a timestamp that's 2 minutes from now in the app timezone
        const testStartQuery = await db.query(`
            SELECT (NOW() AT TIME ZONE $1 + INTERVAL '2 minutes') AS test_start_time,
                   NOW() AT TIME ZONE $1 AS current_local_time,
                   NOW() AS current_utc_time
        `, [appTimezone]);
        
        const timeInfo = testStartQuery.rows[0];
        console.log('Current UTC time:', timeInfo.current_utc_time);
        console.log('Current local time:', timeInfo.current_local_time);
        console.log('Test start time (local):', timeInfo.test_start_time);
        
        // Format the test start time for insertion (as timezone-naive timestamp)
        const localTime = timeInfo.test_start_time.toISOString().slice(0, 19).replace('T', ' ');
        console.log('Formatted for database:', localTime);
        
        // Check if we have a quiz to use
        const quizResult = await db.query('SELECT id, title FROM quizzes LIMIT 1');
        if (quizResult.rows.length === 0) {
            console.log('❌ No quizzes found. Creating a test quiz first...');
            
            await db.query(`
                INSERT INTO quizzes (title, description, total_questions, quiz_time_minutes, instruction_time_minutes, is_active)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                'Test Quiz for Scheduler',
                'Temporary quiz for testing session scheduler',
                5,
                15,
                5,
                true
            ]);
            
            console.log('✅ Test quiz created');
        }
        
        const quiz = await db.query('SELECT id, title FROM quizzes LIMIT 1');
        console.log('Using quiz:', quiz.rows[0].title);
        
        // Delete any existing test sessions
        await db.query("DELETE FROM quiz_sessions WHERE session_name LIKE '%scheduler-test%'");
        console.log('🧹 Cleaned up old test sessions');
        
        // Create test session that should auto-start in 2 minutes
        const sessionResult = await db.query(`
            INSERT INTO quiz_sessions (session_name, quiz_id, start_time, auto_start, status, max_participants)
            VALUES ($1, $2, $3::timestamp, $4, $5, $6)
            RETURNING id, session_name, start_time, start_time AT TIME ZONE $7 as start_time_local
        `, [
            'scheduler-test-' + Date.now(),
            quiz.rows[0].id,
            localTime,
            true,
            'scheduled',
            50,
            appTimezone
        ]);
        
        const session = sessionResult.rows[0];
        
        console.log('\n✅ Test session created:');
        console.log('   Session ID:', session.id);
        console.log('   Session Name:', session.session_name);
        console.log('   Stored start_time:', session.start_time);
        console.log('   Local timezone interpretation:', session.start_time_local);
        
        // Test the scheduler timing logic immediately
        console.log('\n🔍 Testing scheduler timing logic:');
        const timingTest = await db.query(`
            SELECT qs.id, qs.session_name,
                   qs.start_time::text as start_time_string,
                   qs.start_time AT TIME ZONE $2 as start_time_local,
                   NOW() AT TIME ZONE $2 as current_time_local,
                   EXTRACT(EPOCH FROM ((qs.start_time AT TIME ZONE $2) - (NOW() AT TIME ZONE $2))) as seconds_until_start,
                   EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE $2) - (qs.start_time AT TIME ZONE $2))) as seconds_past_start
            FROM quiz_sessions qs
            WHERE qs.id = $1
        `, [session.id, appTimezone]);
        
        const timing = timingTest.rows[0];
        console.log('   Stored time:', timing.start_time_string);
        console.log('   Local time:', timing.start_time_local);
        console.log('   Current local:', timing.current_time_local);
        console.log('   Seconds until start:', timing.seconds_until_start);
        console.log('   Seconds past start:', timing.seconds_past_start);
        
        if (timing.seconds_until_start > 0) {
            console.log(`\n⏰ Session will auto-start in ${Math.round(timing.seconds_until_start)} seconds`);
            console.log('   Watch the session scheduler logs to see it start automatically!');
        } else {
            console.log('\n⚠️  Session start time is in the past - it should start immediately');
        }
        
        console.log('\n📋 To monitor the session:');
        console.log('   1. Watch the server logs for session scheduler output');
        console.log('   2. Or run: npm run test-scheduler');
        console.log(`   3. Session ID to track: ${session.id}`);
        
    } catch (error) {
        console.error('❌ Error creating test session:', error.message);
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
    createTestSession().catch(error => {
        console.error('Script execution failed:', error);
        process.exit(1);
    });
}

module.exports = { createTestSession };