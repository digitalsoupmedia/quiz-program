#!/usr/bin/env node

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3004';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

async function testAdminAuthentication() {
    console.log('🧪 Testing Admin Authentication Flow...\n');
    
    try {
        // Test 1: Admin Login with Cookie Support
        console.log('1. Testing Admin Login:');
        const loginResponse = await fetch(`${BASE_URL}/api/auth/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: ADMIN_USERNAME,
                password: ADMIN_PASSWORD
            })
        });
        
        const loginData = await loginResponse.json();
        console.log('   Login Response Status:', loginResponse.status);
        console.log('   Login Success:', loginData.success);
        
        if (!loginData.success) {
            console.log('   ❌ Admin login failed:', loginData.message);
            return;
        }
        
        console.log('   ✅ Admin login successful');
        console.log('   Token received:', loginData.data.token ? 'Yes' : 'No');
        
        // Extract cookies from response
        const cookies = loginResponse.headers.get('set-cookie');
        console.log('   Cookies set:', cookies ? 'Yes' : 'No');
        if (cookies) {
            console.log('   Cookie details:', cookies);
        }
        
        const token = loginData.data.token;
        
        // Test 2: Token Verification with Headers
        console.log('\n2. Testing Token Verification (Authorization Header):');
        const verifyResponse = await fetch(`${BASE_URL}/api/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const verifyData = await verifyResponse.json();
        console.log('   Verify Response Status:', verifyResponse.status);
        console.log('   Verify Success:', verifyData.success);
        
        if (verifyData.success) {
            console.log('   ✅ Token verification with headers working');
            console.log('   User type:', verifyData.data.user.type);
            console.log('   Username:', verifyData.data.user.username);
        } else {
            console.log('   ❌ Token verification failed:', verifyData.message);
        }
        
        // Test 3: Token Verification with Cookies (if cookies were set)
        if (cookies) {
            console.log('\n3. Testing Token Verification (Cookies):');
            const cookieVerifyResponse = await fetch(`${BASE_URL}/api/auth/verify`, {
                headers: {
                    'Cookie': cookies
                }
            });
            
            const cookieVerifyData = await cookieVerifyResponse.json();
            console.log('   Cookie Verify Response Status:', cookieVerifyResponse.status);
            console.log('   Cookie Verify Success:', cookieVerifyData.success);
            
            if (cookieVerifyData.success) {
                console.log('   ✅ Cookie-based authentication working');
            } else {
                console.log('   ❌ Cookie-based authentication failed:', cookieVerifyData.message);
            }
        }
        
        // Test 4: Admin Dashboard Access
        console.log('\n4. Testing Admin Dashboard Access:');
        const dashboardResponse = await fetch(`${BASE_URL}/api/admin/dashboard`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cookie': cookies || ''
            }
        });
        
        const dashboardData = await dashboardResponse.json();
        console.log('   Dashboard Response Status:', dashboardResponse.status);
        console.log('   Dashboard Success:', dashboardData.success);
        
        if (dashboardData.success) {
            console.log('   ✅ Admin dashboard access working');
            console.log('   Statistics received:', Object.keys(dashboardData.data.statistics || {}).length > 0);
        } else {
            console.log('   ❌ Admin dashboard access failed:', dashboardData.message);
        }
        
        // Test 5: Logout
        console.log('\n5. Testing Admin Logout:');
        const logoutResponse = await fetch(`${BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cookie': cookies || ''
            }
        });
        
        const logoutData = await logoutResponse.json();
        console.log('   Logout Response Status:', logoutResponse.status);
        console.log('   Logout Success:', logoutData.success);
        
        if (logoutData.success) {
            console.log('   ✅ Admin logout working');
        } else {
            console.log('   ❌ Admin logout failed:', logoutData.message);
        }
        
        // Test 6: Post-logout verification
        console.log('\n6. Testing Post-logout Token Verification:');
        const postLogoutResponse = await fetch(`${BASE_URL}/api/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const postLogoutData = await postLogoutResponse.json();
        console.log('   Post-logout Response Status:', postLogoutResponse.status);
        console.log('   Should be unauthorized:', !postLogoutData.success);
        
        if (!postLogoutData.success) {
            console.log('   ✅ Post-logout verification correctly failing');
        } else {
            console.log('   ⚠️ Token still valid after logout (Redis issue?)');
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
        console.error('Make sure the server is running on', BASE_URL);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🏁 Admin Authentication Flow Test Complete');
    console.log('='.repeat(60));
}

// Instructions for proxy testing
function printProxyInstructions() {
    console.log('\n📋 PROXY TESTING INSTRUCTIONS:');
    console.log('='.repeat(60));
    console.log('For Apache proxy environments, ensure:');
    console.log('');
    console.log('1. Apache mod_proxy and mod_proxy_http are enabled');
    console.log('2. ProxyPreserveHost is enabled');
    console.log('3. Cookie forwarding is configured:');
    console.log('   ProxyPassReverse /api/ http://localhost:3004/api/');
    console.log('   ProxyPass /api/ http://localhost:3004/api/');
    console.log('');
    console.log('4. Headers are preserved:');
    console.log('   ProxyPreserveHost On');
    console.log('   ProxyVia On');
    console.log('');
    console.log('5. Test with curl:');
    console.log('   curl -X POST -H "Content-Type: application/json" \\');
    console.log('        -d \'{"username":"admin","password":"admin123"}\' \\');
    console.log('        -c cookies.txt \\');
    console.log('        http://your-domain/api/auth/admin/login');
    console.log('');
    console.log('   curl -H "Content-Type: application/json" \\');
    console.log('        -b cookies.txt \\');
    console.log('        http://your-domain/api/auth/verify');
    console.log('='.repeat(60));
}

// Run test if called directly
if (require.main === module) {
    testAdminAuthentication().then(() => {
        printProxyInstructions();
        process.exit(0);
    }).catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = { testAdminAuthentication };