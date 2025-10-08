#!/usr/bin/env node

const db = require('../config/database');
require('dotenv').config();

async function createWorkingTestSession() {
    console.log('🔧 Creating Working Test Session with Fixed Timezone Logic...\n');
    
    try {
        const appTimezone = process.env.APP_TIMEZONE || 'UTC';
        console.log('Using timezone:', appTimezone);
        
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
        
        // Create session using the CORRECT timezone method
        // Store current local time + 1 minute as naive timestamp
        const sessionResult = await db.query(`
            INSERT INTO quiz_sessions (session_name, quiz_id, start_time, auto_start, status, max_participants)
            VALUES (
                $1, 
                $2, 
                -- Store local time + 1 minute as naive timestamp
                (timezone($3, NOW()) + INTERVAL '1 minute')::timestamp,
                $4, 
                $5, 
                $6
            )
            RETURNING id, session_name, start_time,
                     -- Show how it will be interpreted by scheduler
                     timezone($3, start_time) as start_time_as_timestamptz,
                     timezone($3, NOW()) as current_local_timestamptz
        `, [
            'scheduler-test-working-' + Date.now(),
            quiz.rows[0].id,
            appTimezone,
            true,
            'scheduled',
            50
        ]);
        
        const session = sessionResult.rows[0];
        
        console.log('\n✅ Test session created with CORRECT timezone handling:');
        console.log('   Session ID:', session.id);
        console.log('   Session Name:', session.session_name);
        console.log('   Stored start_time (naive):', session.start_time);
        console.log('   As timestamptz in app TZ:', session.start_time_as_timestamptz);
        console.log('   Current local timestamptz:', session.current_local_timestamptz);
        
        // Test the new scheduler logic
        console.log('\n🔍 Testing NEW scheduler timing logic:');
        const timingTest = await db.query(`
            SELECT 
                EXTRACT(EPOCH FROM (timezone($2, qs.start_time) - timezone($2, NOW()))) as seconds_until_start,
                EXTRACT(EPOCH FROM (timezone($2, NOW()) - timezone($2, qs.start_time))) as seconds_past_start,
                timezone($2, qs.start_time) as start_time_local,
                timezone($2, NOW()) as current_time_local
            FROM quiz_sessions qs
            WHERE qs.id = $1
        `, [session.id, appTimezone]);
        
        const timing = timingTest.rows[0];
        console.log('   Start time (local TZ):', timing.start_time_local);
        console.log('   Current time (local TZ):', timing.current_time_local);
        console.log('   Seconds until start:', timing.seconds_until_start);
        console.log('   Seconds past start:', timing.seconds_past_start);
        
        if (timing.seconds_until_start > 0 && timing.seconds_until_start < 120) {
            console.log('\n🎉 SUCCESS! Session timing is CORRECT!');
            console.log(`   Session will auto-start in ${Math.round(timing.seconds_until_start)} seconds`);
        } else if (timing.seconds_past_start >= 0 && timing.seconds_past_start <= 60) {
            console.log('\n🎉 SUCCESS! Session should auto-start NOW!');
            console.log(`   Session is ${Math.round(timing.seconds_past_start)} seconds past start time`);
        } else {
            console.log('\n❌ Timing still incorrect');
        }
        
        console.log('\n📋 Next steps:');
        console.log('   1. Watch server logs - session should auto-start within 1 minute');
        console.log('   2. If it works, the scheduler timezone fix is successful!');
        console.log(`   3. Session ID to monitor: ${session.id}`);
        
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
    createWorkingTestSession().catch(error => {
        console.error('Script execution failed:', error);
        process.exit(1);
    });
}

module.exports = { createWorkingTestSession };