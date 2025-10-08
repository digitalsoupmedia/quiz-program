#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { redisHelper } = require('../config/redis');
require('dotenv').config();

async function verifyAuthenticationSetup() {
    console.log('🔍 Verifying Authentication Setup...\n');
    
    let allGood = true;
    
    try {
        // 1. Check Environment Variables
        console.log('1. Environment Variables:');
        const requiredEnvVars = [
            'JWT_SECRET', 'DB_HOST', 'DB_PORT', 'DB_NAME', 
            'DB_USER', 'DB_PASSWORD', 'REDIS_HOST', 'REDIS_PORT'
        ];
        
        for (const envVar of requiredEnvVars) {
            if (process.env[envVar]) {
                const displayValue = envVar.includes('PASSWORD') || envVar.includes('SECRET') 
                    ? '***hidden***' 
                    : process.env[envVar];
                console.log(`   ✅ ${envVar}: ${displayValue}`);
            } else {
                console.log(`   ❌ ${envVar}: Missing`);
                allGood = false;
            }
        }
        
        // 2. Database Connection Test
        console.log('\n2. Database Connection:');
        try {
            await db.query('SELECT NOW()');
            console.log('   ✅ Database connected successfully');
        } catch (error) {
            console.log('   ❌ Database connection failed:', error.message);
            allGood = false;
        }
        
        // 3. Admin User Verification
        console.log('\n3. Default Admin User:');
        try {
            const adminResult = await db.query(
                'SELECT id, username, email, role, is_active, password_hash FROM admin_users WHERE username = $1',
                ['admin']
            );
            
            if (adminResult.rows.length === 0) {
                console.log('   ❌ Default admin user not found');
                allGood = false;
            } else {
                const admin = adminResult.rows[0];
                console.log(`   ✅ Admin user found: ${admin.username} (${admin.email})`);
                console.log(`   ✅ Role: ${admin.role}`);
                console.log(`   ✅ Active: ${admin.is_active}`);
                
                // Test password verification
                const passwordTest = await bcrypt.compare('admin123', admin.password_hash);
                if (passwordTest) {
                    console.log('   ✅ Default password verified (admin123)');
                } else {
                    console.log('   ❌ Default password verification failed');
                    allGood = false;
                }
            }
        } catch (error) {
            console.log('   ❌ Admin user check failed:', error.message);
            allGood = false;
        }
        
        // 4. JWT Token Generation Test
        console.log('\n4. JWT Token Generation:');
        try {
            if (!process.env.JWT_SECRET) {
                console.log('   ❌ JWT_SECRET not available');
                allGood = false;
            } else {
                const testPayload = { id: 1, username: 'test', type: 'admin' };
                const token = jwt.sign(testPayload, process.env.JWT_SECRET, { expiresIn: '1h' });
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                if (decoded.id === 1 && decoded.username === 'test') {
                    console.log('   ✅ JWT token generation and verification working');
                } else {
                    console.log('   ❌ JWT token verification failed');
                    allGood = false;
                }
            }
        } catch (error) {
            console.log('   ❌ JWT test failed:', error.message);
            allGood = false;
        }
        
        // 5. Redis Connection Test
        console.log('\n5. Redis Connection:');
        try {
            await redisHelper.set('test_key', 'test_value', 10);
            const value = await redisHelper.get('test_key');
            
            if (value === 'test_value') {
                console.log('   ✅ Redis connection and operations working');
                await redisHelper.del('test_key');
            } else {
                console.log('   ❌ Redis operations failed');
                allGood = false;
            }
        } catch (error) {
            console.log('   ❌ Redis test failed:', error.message);
            allGood = false;
        }
        
        // 6. Authentication Flow Simulation
        console.log('\n6. Authentication Flow Simulation:');
        try {
            // Simulate admin login
            const adminResult = await db.query(
                'SELECT * FROM admin_users WHERE username = $1 AND is_active = true',
                ['admin']
            );
            
            if (adminResult.rows.length > 0) {
                const admin = adminResult.rows[0];
                const passwordMatch = await bcrypt.compare('admin123', admin.password_hash);
                
                if (passwordMatch) {
                    // Generate token
                    const token = jwt.sign({
                        id: admin.id,
                        username: admin.username,
                        email: admin.email,
                        role: admin.role,
                        type: 'admin'
                    }, process.env.JWT_SECRET, { expiresIn: '24h' });
                    
                    // Store session in Redis
                    const sessionSuccess = await redisHelper.setSession(`admin_${admin.id}`, {
                        adminId: admin.id,
                        username: admin.username,
                        email: admin.email,
                        role: admin.role,
                        loginTime: new Date().toISOString()
                    }, 24 * 60 * 60);
                    
                    if (sessionSuccess) {
                        // Verify session can be retrieved
                        const session = await redisHelper.getSession(`admin_${admin.id}`);
                        if (session && session.adminId === admin.id) {
                            console.log('   ✅ Complete authentication flow working');
                            
                            // Cleanup test session
                            await redisHelper.deleteSession(`admin_${admin.id}`);
                        } else {
                            console.log('   ❌ Session retrieval failed');
                            allGood = false;
                        }
                    } else {
                        console.log('   ❌ Session storage failed');
                        allGood = false;
                    }
                } else {
                    console.log('   ❌ Password verification failed in flow test');
                    allGood = false;
                }
            } else {
                console.log('   ❌ Admin user not found in flow test');
                allGood = false;
            }
        } catch (error) {
            console.log('   ❌ Authentication flow test failed:', error.message);
            allGood = false;
        }
        
        // Final Result
        console.log('\n' + '='.repeat(50));
        if (allGood) {
            console.log('🎉 ALL AUTHENTICATION CHECKS PASSED!');
            console.log('✅ Admin login should work correctly after PM2 start');
            console.log('\nDefault admin credentials:');
            console.log('Username: admin');
            console.log('Password: admin123');
        } else {
            console.log('❌ AUTHENTICATION SETUP HAS ISSUES!');
            console.log('Please fix the above issues before starting with PM2');
        }
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('❌ Verification script failed:', error.message);
        allGood = false;
    } finally {
        try {
            await db.end();
        } catch (error) {
            // Ignore cleanup errors
        }
        process.exit(allGood ? 0 : 1);
    }
}

// Run verification if called directly
if (require.main === module) {
    verifyAuthenticationSetup();
}

module.exports = { verifyAuthenticationSetup };