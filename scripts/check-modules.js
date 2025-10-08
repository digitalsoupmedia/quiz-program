#!/usr/bin/env node

console.log('🔍 Checking Node.js Modules Installation...\n');

// Test 1: Check moment-timezone
try {
    const moment = require('moment-timezone');
    console.log('✅ moment-timezone installed');
    console.log('   Version:', require('moment-timezone/package.json').version);
    
    // Test timezone functionality
    const now = moment();
    const kolkata = now.tz('Asia/Kolkata');
    const utc = now.utc();
    
    console.log('   Current UTC:', utc.format());
    console.log('   Current Asia/Kolkata:', kolkata.format());
    console.log('   Timezone offset:', kolkata.utcOffset(), 'minutes');
    
} catch (error) {
    console.log('❌ moment-timezone not working:', error.message);
}

// Test 2: Check pg (PostgreSQL driver)
try {
    const { Pool } = require('pg');
    console.log('\n✅ pg (PostgreSQL driver) installed');
    console.log('   Version:', require('pg/package.json').version);
    
    // Test connection (don't actually connect, just check config)
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'test',
        user: process.env.DB_USER || 'test',
        password: process.env.DB_PASSWORD || 'test',
    });
    console.log('   Pool configuration looks valid');
    
} catch (error) {
    console.log('❌ pg not working:', error.message);
}

// Test 3: Check system timezone
console.log('\n🌍 System Timezone Information:');
console.log('   Process TZ env:', process.env.TZ);
console.log('   App timezone env:', process.env.APP_TIMEZONE);
console.log('   JavaScript timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('   Date toString():', new Date().toString());
console.log('   Date toISOString():', new Date().toISOString());

// Test 4: Check if this is local vs server
console.log('\n💻 Environment Check:');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('   Platform:', process.platform);
console.log('   Node version:', process.version);

// Test 5: Test moment-timezone with environment variable
if (process.env.APP_TIMEZONE) {
    try {
        const moment = require('moment-timezone');
        const now = moment().tz(process.env.APP_TIMEZONE);
        console.log('\n⚙️  Using APP_TIMEZONE:', process.env.APP_TIMEZONE);
        console.log('   Current time in app timezone:', now.format());
        console.log('   UTC offset:', now.utcOffset(), 'minutes');
        
        // Test creating future time
        const future = now.clone().add(1, 'minute');
        console.log('   Future time (+1 min):', future.format());
        console.log('   Future UTC:', future.utc().format());
        
    } catch (error) {
        console.log('❌ moment-timezone with APP_TIMEZONE failed:', error.message);
    }
}