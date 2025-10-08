#!/usr/bin/env node

console.log('🔍 Checking Environment Variable Loading...\n');

// Before dotenv
console.log('1. Before dotenv:');
console.log('   TZ:', process.env.TZ || 'undefined');
console.log('   APP_TIMEZONE:', process.env.APP_TIMEZONE || 'undefined');

// Load dotenv
console.log('\n2. Loading dotenv...');
try {
    require('dotenv').config();
    console.log('   ✅ dotenv.config() executed');
} catch (error) {
    console.log('   ❌ dotenv.config() failed:', error.message);
}

// After dotenv
console.log('\n3. After dotenv:');
console.log('   TZ:', process.env.TZ || 'undefined');
console.log('   APP_TIMEZONE:', process.env.APP_TIMEZONE || 'undefined');

// Check if .env file exists and is readable
const fs = require('fs');
const path = require('path');

console.log('\n4. Checking .env file:');
const envPath = path.join(process.cwd(), '.env');
console.log('   Looking for .env at:', envPath);

try {
    if (fs.existsSync(envPath)) {
        console.log('   ✅ .env file exists');
        const stats = fs.statSync(envPath);
        console.log('   File size:', stats.size, 'bytes');
        console.log('   Modified:', stats.mtime);
        
        // Read first few lines
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n').slice(0, 10);
        console.log('   First 10 lines:');
        lines.forEach((line, i) => {
            if (line.includes('TZ') || line.includes('TIMEZONE')) {
                console.log(`     ${i + 1}: ${line}`);
            }
        });
    } else {
        console.log('   ❌ .env file does not exist');
    }
} catch (error) {
    console.log('   ❌ Cannot read .env file:', error.message);
}

// Check current working directory
console.log('\n5. Working Directory:');
console.log('   Current dir:', process.cwd());
console.log('   Script dir:', __dirname);

// Test moment-timezone with manual timezone
console.log('\n6. Testing manual timezone:');
try {
    // Set timezone manually
    process.env.TZ = 'Asia/Kolkata';
    process.env.APP_TIMEZONE = 'Asia/Kolkata';
    
    const moment = require('moment-timezone');
    const now = moment().tz('Asia/Kolkata');
    console.log('   After manual set:');
    console.log('   TZ:', process.env.TZ);
    console.log('   Asia/Kolkata time:', now.format());
    console.log('   UTC offset:', now.utcOffset(), 'minutes');
} catch (error) {
    console.log('   ❌ Manual timezone test failed:', error.message);
}