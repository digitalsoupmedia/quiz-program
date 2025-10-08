#!/usr/bin/env node

const db = require('../config/database');
require('dotenv').config();

async function debugTimezone() {
    console.log('🔍 Debugging Database Timezone Handling...\n');
    
    try {
        const appTimezone = process.env.APP_TIMEZONE || 'UTC';
        console.log('Environment APP_TIMEZONE:', appTimezone);
        
        // Test 1: Basic timezone info
        console.log('1. Database Timezone Information:');
        const timezoneInfo = await db.query(`
            SELECT 
                NOW() as utc_now,
                NOW() AT TIME ZONE 'UTC' as explicit_utc,
                NOW() AT TIME ZONE 'Asia/Kolkata' as kolkata_time,
                NOW() AT TIME ZONE $1 as app_timezone_time,
                CURRENT_SETTING('timezone') as db_timezone,
                EXTRACT(TIMEZONE FROM NOW()) as timezone_offset_seconds
        `, [appTimezone]);
        
        const info = timezoneInfo.rows[0];
        console.log('   Database timezone setting:', info.db_timezone);
        console.log('   NOW():', info.utc_now);
        console.log('   NOW() AT TIME ZONE UTC:', info.explicit_utc);
        console.log('   NOW() AT TIME ZONE Asia/Kolkata:', info.kolkata_time);
        console.log('   NOW() AT TIME ZONE', appTimezone + ':', info.app_timezone_time);
        console.log('   Timezone offset (seconds):', info.timezone_offset_seconds);
        
        // Test 2: Timestamp without timezone behavior
        console.log('\n2. Testing Timestamp Storage:');
        
        // Create a test timestamp
        const testTimestamp = await db.query(`
            SELECT 
                '2025-10-05 20:00:00'::timestamp as naive_timestamp,
                '2025-10-05 20:00:00'::timestamp AT TIME ZONE 'Asia/Kolkata' as naive_as_kolkata,
                '2025-10-05 20:00:00'::timestamp AT TIME ZONE $1 as naive_as_app_tz,
                TIMESTAMPTZ '2025-10-05 20:00:00+05:30' as explicit_kolkata_tz,
                TIMESTAMPTZ '2025-10-05 20:00:00+05:30' AT TIME ZONE 'Asia/Kolkata' as explicit_to_kolkata
        `, [appTimezone]);
        
        const ts = testTimestamp.rows[0];
        console.log('   Naive timestamp "2025-10-05 20:00:00":');
        console.log('     As stored:', ts.naive_timestamp);
        console.log('     AT TIME ZONE Asia/Kolkata:', ts.naive_as_kolkata);
        console.log('     AT TIME ZONE', appTimezone + ':', ts.naive_as_app_tz);
        console.log('   Explicit timezone timestamp "2025-10-05 20:00:00+05:30":');
        console.log('     As stored:', ts.explicit_kolkata_tz);
        console.log('     AT TIME ZONE Asia/Kolkata:', ts.explicit_to_kolkata);
        
        // Test 3: What happens when we insert a session
        console.log('\n3. Testing Session Creation Method:');
        
        // Method 1: Direct timestamp
        const method1 = await db.query(`
            SELECT '2025-10-05 20:00:00'::timestamp as stored_time,
                   '2025-10-05 20:00:00'::timestamp AT TIME ZONE $1 as interpreted_in_app_tz
        `, [appTimezone]);
        
        console.log('   Method 1 - Direct timestamp:');
        console.log('     Stored:', method1.rows[0].stored_time);
        console.log('     Interpreted in app timezone:', method1.rows[0].interpreted_in_app_tz);
        
        // Method 2: Convert from app timezone to timestamp
        const method2 = await db.query(`
            SELECT (TIMESTAMPTZ '2025-10-05 20:00:00 Asia/Kolkata')::timestamp as stored_time,
                   (TIMESTAMPTZ '2025-10-05 20:00:00 Asia/Kolkata')::timestamp AT TIME ZONE $1 as interpreted_in_app_tz
        `, [appTimezone]);
        
        console.log('   Method 2 - Convert from timezone:');
        console.log('     Stored:', method2.rows[0].stored_time);
        console.log('     Interpreted in app timezone:', method2.rows[0].interpreted_in_app_tz);
        
        // Test 4: How should we create sessions correctly?
        console.log('\n4. Testing Correct Session Creation:');
        
        const correctMethod = await db.query(`
            SELECT 
                -- Current time in app timezone, then store as naive timestamp
                (NOW() AT TIME ZONE $1)::timestamp as current_as_naive,
                -- Add 1 minute to that
                ((NOW() AT TIME ZONE $1) + INTERVAL '1 minute')::timestamp as future_as_naive,
                -- Test how this gets interpreted back
                ((NOW() AT TIME ZONE $1) + INTERVAL '1 minute')::timestamp AT TIME ZONE $1 as future_interpreted,
                -- Compare with current time in app timezone
                NOW() AT TIME ZONE $1 as current_in_app_tz
        `, [appTimezone]);
        
        const correct = correctMethod.rows[0];
        console.log('   Current time as naive timestamp:', correct.current_as_naive);
        console.log('   Future time (naive + 1 min):', correct.future_as_naive);
        console.log('   Future interpreted back:', correct.future_interpreted);
        console.log('   Current in app timezone:', correct.current_in_app_tz);
        
        // Calculate the difference
        const diffQuery = await db.query(`
            SELECT EXTRACT(EPOCH FROM (
                ((NOW() AT TIME ZONE $1) + INTERVAL '1 minute')::timestamp AT TIME ZONE $1 - 
                (NOW() AT TIME ZONE $1)
            )) as seconds_difference
        `, [appTimezone]);
        
        console.log('   Time difference (should be 60):', diffQuery.rows[0].seconds_difference, 'seconds');
        
        console.log('\n' + '='.repeat(60));
        console.log('💡 SOLUTION: Use this method for session creation:');
        console.log('   start_time = ((NOW() AT TIME ZONE app_timezone) + INTERVAL \'X minutes\')::timestamp');
        console.log('   This stores the local time as naive timestamp.');
        console.log('   Then scheduler reads it back with: start_time AT TIME ZONE app_timezone');
        console.log('='.repeat(60));
        
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
    debugTimezone().catch(error => {
        console.error('Script execution failed:', error);
        process.exit(1);
    });
}

module.exports = { debugTimezone };