#!/bin/bash

echo "🧪 Testing Admin Authentication Flow..."
echo

BASE_URL="http://localhost:3004"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"

# Test 1: Admin Login
echo "1. Testing Admin Login:"
login_response=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" \
  -c cookies.txt \
  -w "HTTPSTATUS:%{http_code}" \
  "$BASE_URL/api/auth/admin/login")

http_status=$(echo "$login_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
response_body=$(echo "$login_response" | sed 's/HTTPSTATUS:[0-9]*$//')

echo "   HTTP Status: $http_status"
echo "   Response: $response_body"

if [ "$http_status" -eq 200 ]; then
    echo "   ✅ Admin login successful"
    
    # Extract token from response
    token=$(echo "$response_body" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "   Token extracted: $(echo $token | cut -c1-20)..."
    
    # Test 2: Token Verification with Headers
    echo
    echo "2. Testing Token Verification (Authorization Header):"
    verify_response=$(curl -s \
      -H "Authorization: Bearer $token" \
      -w "HTTPSTATUS:%{http_code}" \
      "$BASE_URL/api/auth/verify")
    
    verify_status=$(echo "$verify_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    verify_body=$(echo "$verify_response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    echo "   HTTP Status: $verify_status"
    echo "   Response: $verify_body"
    
    if [ "$verify_status" -eq 200 ]; then
        echo "   ✅ Token verification with headers working"
    else
        echo "   ❌ Token verification with headers failed"
    fi
    
    # Test 3: Token Verification with Cookies
    echo
    echo "3. Testing Token Verification (Cookies):"
    cookie_verify_response=$(curl -s \
      -b cookies.txt \
      -w "HTTPSTATUS:%{http_code}" \
      "$BASE_URL/api/auth/verify")
    
    cookie_verify_status=$(echo "$cookie_verify_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    cookie_verify_body=$(echo "$cookie_verify_response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    echo "   HTTP Status: $cookie_verify_status"
    echo "   Response: $cookie_verify_body"
    
    if [ "$cookie_verify_status" -eq 200 ]; then
        echo "   ✅ Cookie-based authentication working"
    else
        echo "   ❌ Cookie-based authentication failed"
    fi
    
    # Test 4: Admin Dashboard Access
    echo
    echo "4. Testing Admin Dashboard Access:"
    dashboard_response=$(curl -s \
      -H "Authorization: Bearer $token" \
      -b cookies.txt \
      -w "HTTPSTATUS:%{http_code}" \
      "$BASE_URL/api/admin/dashboard")
    
    dashboard_status=$(echo "$dashboard_response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    dashboard_body=$(echo "$dashboard_response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    echo "   HTTP Status: $dashboard_status"
    echo "   Response: $(echo $dashboard_body | cut -c1-100)..."
    
    if [ "$dashboard_status" -eq 200 ]; then
        echo "   ✅ Admin dashboard access working"
    else
        echo "   ❌ Admin dashboard access failed"
    fi
    
else
    echo "   ❌ Admin login failed with status: $http_status"
fi

# Check if cookies file was created
echo
echo "5. Checking Cookies:"
if [ -f cookies.txt ]; then
    echo "   ✅ Cookies file created"
    echo "   Cookie contents:"
    cat cookies.txt | grep -v "^#" | while read line; do
        echo "      $line"
    done
    rm -f cookies.txt
else
    echo "   ❌ No cookies file created"
fi

echo
echo "============================================================"
echo "🏁 Admin Authentication Flow Test Complete"
echo "============================================================"

echo
echo "📋 FOR APACHE PROXY TESTING:"
echo "============================================================"
echo "Replace $BASE_URL with your domain and test:"
echo
echo "# Login with cookie saving:"
echo "curl -X POST -H \"Content-Type: application/json\" \\"
echo "     -d '{\"username\":\"admin\",\"password\":\"admin123\"}' \\"
echo "     -c cookies.txt \\"
echo "     http://your-domain/api/auth/admin/login"
echo
echo "# Verify with cookies:"
echo "curl -b cookies.txt http://your-domain/api/auth/verify"
echo
echo "# Access admin dashboard:"
echo "curl -b cookies.txt http://your-domain/api/admin/dashboard"
echo "============================================================"