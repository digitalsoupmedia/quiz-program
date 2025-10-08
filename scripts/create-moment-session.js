#!/usr/bin/env node

const db = require('../config/database');
const moment = require('moment-timezone');
require('dotenv').config();

async function createMomentSession() {
    console.log('🕐 Creating Session Using moment-timezone...\n');
    
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
        
        // Use moment-timezone for proper timezone handling
        const now = moment().tz(appTimezone);
        const startTime = now.clone().add(1, 'minute');
        
        console.log('Current time (moment):', now.format());
        console.log('Start time (moment):', startTime.format());
        console.log('Start time UTC:', startTime.utc().format());
        
        // Store as UTC timestamp in database
        const startTimeUTC = startTime.utc().toDate();
        
        const sessionResult = await db.query(`
            INSERT INTO quiz_sessions (session_name, quiz_id, start_time, auto_start, status, max_participants)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, session_name, start_time
        `, [
            'scheduler-test-moment-' + Date.now(),
            quiz.rows[0].id,
            startTimeUTC, // Store as UTC
            true,
            'scheduled',
            50
        ]);
        
        const session = sessionResult.rows[0];
        
        console.log('\n✅ Session created using moment-timezone:');
        console.log('   Session ID:', session.id);
        console.log('   Session Name:', session.session_name);
        console.log('   Stored in DB (UTC):', session.start_time);
        
        // Test timing using moment-timezone
        const storedTime = moment(session.start_time).tz(appTimezone);
        const currentTime = moment().tz(appTimezone);
        const diffSeconds = storedTime.diff(currentTime, 'seconds');
        
        console.log('\n🔍 moment-timezone timing test:');
        console.log('   Stored time in app TZ:', storedTime.format());
        console.log('   Current time in app TZ:', currentTime.format());
        console.log('   Difference (seconds):', diffSeconds);
        
        if (diffSeconds > 0 && diffSeconds < 120) {
            console.log('\n🎉 SUCCESS! moment-timezone timing is CORRECT!');
            console.log(`   Session will start in ${diffSeconds} seconds`);
        } else {
            console.log('\n❌ moment-timezone timing still incorrect');
        }
        
        console.log('\n📋 This session uses moment-timezone calculations');
        console.log(`   Session ID: ${session.id}`);
        console.log('   Monitor if it auto-starts at the right time!');
        
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
    createMomentSession().catch(error => {
        console.error('Script execution failed:', error);
        process.exit(1);
    });
}

module.exports = { createMomentSession };