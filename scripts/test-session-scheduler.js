#!/usr/bin/env node

const db = require('../config/database');
require('dotenv').config();

async function testSessionScheduler() {
    console.log('🕐 Testing Session Scheduler Timezone Issues...\n');
    
    try {
        // Test 1: Check current timezone settings
        console.log('1. Database Timezone Settings:');
        const timezoneResult = await db.query('SHOW timezone');
        console.log(`   Database timezone: ${timezoneResult.rows[0].TimeZone}`);
        
        const nowResult = await db.query('SELECT NOW() as db_now, NOW() AT TIME ZONE \'UTC\' as db_now_utc');
        console.log(`   Database NOW(): ${nowResult.rows[0].db_now}`);
        console.log(`   Database NOW() UTC: ${nowResult.rows[0].db_now_utc}`);
        
        const jsNow = new Date();
        console.log(`   JavaScript NOW(): ${jsNow.toISOString()}`);
        console.log(`   JavaScript Local: ${jsNow.toString()}`);
        
        // Test 2: Check environment variables
        console.log('\n2. Environment Variables:');
        console.log(`   TZ: ${process.env.TZ || 'Not set'}`);
        console.log(`   APP_TIMEZONE: ${process.env.APP_TIMEZONE || 'Not set'}`);
        console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'Not set'}`);
        
        // Test 3: Find test sessions
        console.log('\n3. Finding Test Sessions:');
        const testSessions = await db.query(`
            SELECT id, session_name, start_time, auto_start, status,
                   start_time::text as start_time_string,
                   start_time AT TIME ZONE 'UTC' as start_time_utc,
                   NOW() as current_db_time,
                   NOW() AT TIME ZONE 'UTC' as current_db_time_utc,
                   EXTRACT(EPOCH FROM (start_time - NOW())) as seconds_until_start,
                   EXTRACT(EPOCH FROM (NOW() - start_time)) as seconds_past_start
            FROM quiz_sessions 
            WHERE session_name ILIKE '%test%' 
               OR start_time::date = CURRENT_DATE
               OR start_time > NOW() - INTERVAL '1 hour'
            ORDER BY start_time DESC
            LIMIT 5
        `);
        
        console.log(`   Found ${testSessions.rows.length} relevant sessions:`);
        testSessions.rows.forEach(session => {
            console.log(`\n   Session ${session.id}: ${session.session_name}`);
            console.log(`     Status: ${session.status}, Auto-start: ${session.auto_start}`);
            console.log(`     Start time (stored): ${session.start_time_string}`);
            console.log(`     Start time UTC: ${session.start_time_utc}`);
            console.log(`     Current DB time: ${session.current_db_time}`);
            console.log(`     Current DB time UTC: ${session.current_db_time_utc}`);
            console.log(`     Seconds until start: ${session.seconds_until_start}`);
            console.log(`     Seconds past start: ${session.seconds_past_start}`);
            
            // Test JavaScript date parsing
            const jsStartTime = new Date(session.start_time_string);
            const jsCurrentTime = new Date();
            const jsTimeDiff = (jsCurrentTime.getTime() - jsStartTime.getTime()) / 1000;
            
            console.log(`     JavaScript start time: ${jsStartTime.toISOString()}`);
            console.log(`     JavaScript current time: ${jsCurrentTime.toISOString()}`);
            console.log(`     JavaScript time diff: ${jsTimeDiff.toFixed(1)} seconds`);
            
            // Check if this would trigger auto-start
            const shouldAutoStart = session.auto_start && 
                                  session.status === 'scheduled' && 
                                  session.seconds_past_start >= 0 && 
                                  session.seconds_past_start <= 60;
            console.log(`     Should auto-start: ${shouldAutoStart}`);
        });
        
        // Test 4: Simulate scheduler logic
        console.log('\n4. Simulating Scheduler Auto-Start Logic:');
        const autoStartSessions = await db.query(`
            SELECT qs.*, q.instruction_time_minutes,
                   qs.start_time::text as start_time_string,
                   qs.start_time AT TIME ZONE 'UTC' as start_time_utc,
                   NOW() AT TIME ZONE 'UTC' as current_time_utc,
                   EXTRACT(EPOCH FROM (qs.start_time - NOW())) as seconds_until_start,
                   EXTRACT(EPOCH FROM (NOW() - qs.start_time)) as seconds_past_start,
                   qs.start_time as start_time_local
            FROM quiz_sessions qs
            JOIN quizzes q ON qs.quiz_id = q.id
            WHERE qs.status = 'scheduled' 
              AND qs.auto_start = true 
              AND NOW() >= qs.start_time
              AND EXTRACT(EPOCH FROM (NOW() - qs.start_time)) >= 0
              AND EXTRACT(EPOCH FROM (NOW() - qs.start_time)) <= 60
              AND EXTRACT(EPOCH FROM (NOW() - qs.start_time)) < 300
            ORDER BY qs.start_time ASC
        `);
        
        console.log(`   Sessions that would auto-start: ${autoStartSessions.rows.length}`);
        
        if (autoStartSessions.rows.length > 0) {
            autoStartSessions.rows.forEach(session => {
                console.log(`\n   Would auto-start session ${session.id}: ${session.session_name}`);
                console.log(`     Start time: ${session.start_time_string}`);
                console.log(`     Seconds past start: ${session.seconds_past_start}`);
            });
        } else {
            console.log('   No sessions meet auto-start criteria currently');
        }
        
        // Test 5: Check for any sessions that might have timezone issues
        console.log('\n5. Checking for Timezone Conversion Issues:');
        const allScheduledSessions = await db.query(`
            SELECT id, session_name, start_time, 
                   start_time::text as start_time_string,
                   start_time AT TIME ZONE 'Asia/Kolkata' as start_time_ist,
                   start_time AT TIME ZONE 'UTC' as start_time_utc,
                   EXTRACT(EPOCH FROM (start_time - NOW())) as seconds_until_start
            FROM quiz_sessions 
            WHERE status = 'scheduled' AND auto_start = true
            ORDER BY start_time
        `);
        
        console.log(`   All scheduled auto-start sessions: ${allScheduledSessions.rows.length}`);
        allScheduledSessions.rows.forEach(session => {
            console.log(`\n   Session ${session.id}: ${session.session_name}`);
            console.log(`     Stored: ${session.start_time_string}`);
            console.log(`     As IST: ${session.start_time_ist}`);
            console.log(`     As UTC: ${session.start_time_utc}`);
            console.log(`     Seconds until: ${session.seconds_until_start}`);
            
            // Check if the stored time seems to have timezone issues
            const storedDate = new Date(session.start_time_string);
            const istDate = new Date(session.start_time_ist);
            const utcDate = new Date(session.start_time_utc);
            
            console.log(`     JS Parse stored: ${storedDate.toISOString()}`);
            console.log(`     JS Parse IST: ${istDate.toISOString()}`);
            console.log(`     JS Parse UTC: ${utcDate.toISOString()}`);
            
            // Calculate timezone offset differences
            const storedVsUtc = (storedDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
            const istVsUtc = (istDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
            
            console.log(`     Stored vs UTC: ${storedVsUtc} hours difference`);
            console.log(`     IST vs UTC: ${istVsUtc} hours difference`);
            
            if (Math.abs(storedVsUtc) > 0.1) {
                console.log(`     ⚠️  TIMEZONE ISSUE: Stored time differs from UTC by ${storedVsUtc} hours`);
            }
        });
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Session Scheduler Timezone Test Complete');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        try {
            await db.end();
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

// Run test if called directly
if (require.main === module) {
    testSessionScheduler().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = { testSessionScheduler };