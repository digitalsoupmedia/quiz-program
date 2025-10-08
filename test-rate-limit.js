const axios = require('axios');

// Configuration
const BASE_URL = 'https://quiz.normsmanagement.com';
const CONCURRENT_REQUESTS = 100;
const DELAY_BETWEEN_BATCHES = 1000; // 1 second

// Test users - replace with actual participants from your database
const TEST_USERS = [
    { username: 'lissyseban@gmil.com', password: '9846711314' },
    { username: 'normshrms@gmail.com', password: '7356806363' },
    { username: 'radhika@normsmanagement.com', password: '7356806363' },
    { username: 'edwin@normsmanagement.com', password: '7356847799' }
];

async function testRateLimit() {
    console.log(`Testing rate limiting with ${CONCURRENT_REQUESTS} concurrent requests...`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log('='.repeat(60));
    
    const results = {
        success: 0,
        rateLimited: 0,
        errors: 0,
        responseTimes: []
    };
    
    // Create an array of promises for concurrent requests
    const requests = [];
    
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
        const startTime = Date.now();
        
        const request = axios.get(`${BASE_URL}/api/quiz/session/1/status`, {
            timeout: 10000,
            headers: {
                'User-Agent': `RateLimitTest-${i}`,
                'X-Test-Request': 'true'
            }
        }).then(response => {
            const responseTime = Date.now() - startTime;
            results.responseTimes.push(responseTime);
            results.success++;
            console.log(`✓ Request ${i + 1}: ${response.status} (${responseTime}ms)`);
            return { index: i, status: response.status, responseTime };
        }).catch(error => {
            const responseTime = Date.now() - startTime;
            if (error.response && error.response.status === 429) {
                results.rateLimited++;
                console.log(`✗ Request ${i + 1}: Rate Limited (429) (${responseTime}ms)`);
            } else {
                results.errors++;
                console.log(`✗ Request ${i + 1}: Error ${error.response?.status || 'TIMEOUT'} (${responseTime}ms)`);
            }
            return { index: i, status: error.response?.status || 'ERROR', responseTime };
        });
        
        requests.push(request);
    }
    
    // Wait for all requests to complete
    const responses = await Promise.all(requests);
    
    // Calculate statistics
    const avgResponseTime = results.responseTimes.length > 0 
        ? results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length 
        : 0;
    
    const maxResponseTime = results.responseTimes.length > 0 
        ? Math.max(...results.responseTimes) 
        : 0;
    
    const minResponseTime = results.responseTimes.length > 0 
        ? Math.min(...results.responseTimes) 
        : 0;
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('RATE LIMIT TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Requests: ${CONCURRENT_REQUESTS}`);
    console.log(`Successful: ${results.success} (${((results.success / CONCURRENT_REQUESTS) * 100).toFixed(1)}%)`);
    console.log(`Rate Limited (429): ${results.rateLimited} (${((results.rateLimited / CONCURRENT_REQUESTS) * 100).toFixed(1)}%)`);
    console.log(`Other Errors: ${results.errors} (${((results.errors / CONCURRENT_REQUESTS) * 100).toFixed(1)}%)`);
    console.log(`Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`Min Response Time: ${minResponseTime}ms`);
    console.log(`Max Response Time: ${maxResponseTime}ms`);
    
    if (results.rateLimited > 0) {
        console.log('\n⚠️  WARNING: Some requests were rate limited!');
        console.log('   Consider increasing rate limits for concurrent quiz usage.');
    } else {
        console.log('\n✅ SUCCESS: All requests passed without rate limiting!');
    }
    
    return results;
}

// Helper function to authenticate and get token
async function authenticateUser(username, password) {
    try {
        const response = await axios.post(`${BASE_URL}/api/auth/participant/login`, {
            username: username,
            password: password
        }, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.data.success) {
            return response.data.token;
        } else {
            console.error(`Authentication failed for ${username}:`, response.data.message);
            return null;
        }
    } catch (error) {
        console.error(`Authentication error for ${username}:`, error.response?.data?.message || error.message);
        return null;
    }
}

async function testAuthenticatedQuizAccess() {
    console.log('\n' + '='.repeat(60));
    console.log('Testing AUTHENTICATED quiz status access...');
    console.log('='.repeat(60));
    
    // First, authenticate all test users
    const authenticatedUsers = [];
    
    for (const user of TEST_USERS) {
        console.log(`\nAuthenticating ${user.username}...`);
        const token = await authenticateUser(user.username, user.password);
        
        if (token) {
            authenticatedUsers.push({
                username: user.username,
                token: token
            });
            console.log(`✓ ${user.username} authenticated successfully`);
        } else {
            console.log(`✗ ${user.username} authentication failed`);
        }
    }
    
    if (authenticatedUsers.length === 0) {
        console.log('❌ No users authenticated successfully. Please check credentials.');
        return;
    }
    
    console.log(`\n📊 Testing with ${authenticatedUsers.length} authenticated users...`);
    console.log('Each user will make 30 requests to quiz status endpoint');
    
    const results = {
        totalRequests: 0,
        successful: 0,
        rateLimited: 0,
        errors: 0,
        userResults: {}
    };
    
    // Test each authenticated user making multiple requests
    const requestPromises = [];
    const requestsPerUser = 30;
    
    for (const user of authenticatedUsers) {
        results.userResults[user.username] = { success: 0, rateLimited: 0, errors: 0 };
        
        for (let i = 0; i < requestsPerUser; i++) {
            const requestPromise = (async () => {
                const startTime = Date.now();
                results.totalRequests++;
                
                try {
                    const response = await axios.get(`${BASE_URL}/api/quiz/session/1/status`, {
                        timeout: 10000,
                        headers: {
                            'Authorization': `Bearer ${user.token}`,
                            'Content-Type': 'application/json',
                            'User-Agent': `AuthTest-${user.username}-${i}`
                        }
                    });
                    
                    const responseTime = Date.now() - startTime;
                    results.successful++;
                    results.userResults[user.username].success++;
                    console.log(`✓ ${user.username} Request ${i + 1}: ${response.status} (${responseTime}ms)`);
                    
                } catch (error) {
                    const responseTime = Date.now() - startTime;
                    
                    if (error.response && error.response.status === 429) {
                        results.rateLimited++;
                        results.userResults[user.username].rateLimited++;
                        console.log(`✗ ${user.username} Request ${i + 1}: Rate Limited (429) (${responseTime}ms)`);
                    } else {
                        results.errors++;
                        results.userResults[user.username].errors++;
                        console.log(`✗ ${user.username} Request ${i + 1}: Error ${error.response?.status || 'TIMEOUT'} (${responseTime}ms)`);
                    }
                }
            })();
            
            requestPromises.push(requestPromise);
            
            // Small delay between requests for same user to simulate real usage
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    
    // Wait for all requests to complete
    await Promise.all(requestPromises);
    
    // Print detailed results
    console.log('\n' + '='.repeat(60));
    console.log('AUTHENTICATED QUIZ ACCESS TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Authenticated Users: ${authenticatedUsers.length}`);
    console.log(`Total Requests: ${results.totalRequests}`);
    console.log(`Successful: ${results.successful} (${((results.successful / results.totalRequests) * 100).toFixed(1)}%)`);
    console.log(`Rate Limited (429): ${results.rateLimited} (${((results.rateLimited / results.totalRequests) * 100).toFixed(1)}%)`);
    console.log(`Other Errors: ${results.errors} (${((results.errors / results.totalRequests) * 100).toFixed(1)}%)`);
    
    console.log('\nPer-User Results:');
    for (const [username, userResult] of Object.entries(results.userResults)) {
        const total = userResult.success + userResult.rateLimited + userResult.errors;
        console.log(`  ${username}:`);
        console.log(`    Success: ${userResult.success}/${total} (${((userResult.success / total) * 100).toFixed(1)}%)`);
        console.log(`    Rate Limited: ${userResult.rateLimited}/${total} (${((userResult.rateLimited / total) * 100).toFixed(1)}%)`);
        console.log(`    Errors: ${userResult.errors}/${total} (${((userResult.errors / total) * 100).toFixed(1)}%)`);
    }
    
    if (results.rateLimited > 0) {
        console.log('\n⚠️  WARNING: Some authenticated requests were rate limited!');
        console.log('   This suggests the user-based rate limiting is too restrictive.');
    } else {
        console.log('\n✅ SUCCESS: All authenticated requests passed without rate limiting!');
    }
    
    return results;
}

async function testAuthRateLimit() {
    console.log('\n' + '='.repeat(60));
    console.log('Testing AUTH endpoint rate limiting...');
    console.log('='.repeat(60));
    
    const authResults = {
        success: 0,
        rateLimited: 0,
        errors: 0
    };
    
    // Test with different usernames to verify user-based rate limiting
    const testUsers = ['user1', 'user2', 'user3', 'user4', 'user5'];
    const requestsPerUser = 5;
    
    for (const username of testUsers) {
        console.log(`\nTesting user: ${username}`);
        
        for (let i = 0; i < requestsPerUser; i++) {
            try {
                const response = await axios.post(`${BASE_URL}/api/auth/login`, {
                    username: username,
                    password: 'wrongpassword'
                }, {
                    timeout: 5000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                authResults.success++;
                console.log(`  ✓ Request ${i + 1}: ${response.status}`);
                
            } catch (error) {
                if (error.response && error.response.status === 429) {
                    authResults.rateLimited++;
                    console.log(`  ✗ Request ${i + 1}: Rate Limited (429)`);
                } else {
                    authResults.errors++;
                    console.log(`  ✗ Request ${i + 1}: ${error.response?.status || 'ERROR'}`);
                }
            }
            
            // Small delay between requests for same user
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    console.log('\nAUTH RATE LIMIT TEST RESULTS:');
    console.log(`Total Auth Requests: ${testUsers.length * requestsPerUser}`);
    console.log(`Successful: ${authResults.success}`);
    console.log(`Rate Limited: ${authResults.rateLimited}`);
    console.log(`Other Errors: ${authResults.errors}`);
    
    return authResults;
}

// Run the tests
async function runAllTests() {
    try {
        console.log('Starting Rate Limit Tests...\n');
        
        // Test general API rate limiting (unauthenticated)
        await testRateLimit();
        
        // Wait a bit between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test authenticated quiz access
        await testAuthenticatedQuizAccess();
        
        // Wait a bit between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test auth endpoint rate limiting
        await testAuthRateLimit();
        
        console.log('\n' + '='.repeat(60));
        console.log('All tests completed!');
        
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

// Check if axios is available
try {
    require.resolve('axios');
    runAllTests();
} catch (e) {
    console.log('Please install axios first:');
    console.log('npm install axios');
    console.log('\nThen run: node test-rate-limit.js');
}