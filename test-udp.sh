#!/bin/bash

# Test script for CoT Publisher UDP functionality
# This script tests the proxy server's ability to forward CoT messages via UDP

echo "=========================================="
echo "CoT Publisher UDP Test"
echo "=========================================="
echo ""

# Create a test CoT message
TEST_COT=$(cat <<'EOF'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<event version="2.0" uid="TEST-12345" type="a-f-G-U-C" time="2026-01-16T03:00:00.000Z" start="2026-01-16T03:00:00.000Z" stale="2026-01-16T03:05:00.000Z" how="m-g">
    <point lat="45.123456" lon="9.654321" hae="100.0" ce="10.0" le="9999999.0"/>
    <detail>
        <contact callsign="TEST-UNIT"/>
        <__group name="Cyan" role="Team Member"/>
        <status battery="100"/>
        <takv device="CoT Publisher PWA" platform="Web Browser" os="WebAPI" version="1.0.0"/>
        <track speed="0" course="0"/>
    </detail>
</event>
EOF
)

# Test 1: Check if proxy server is running
echo "Test 1: Checking proxy server..."
if curl -s http://localhost:8080/ > /dev/null 2>&1; then
    echo "✓ Proxy server is running"
else
    echo "✗ Proxy server is not running"
    echo "  Start it with: node proxy-server.js"
    exit 1
fi

echo ""

# Test 2: Send a test CoT message
echo "Test 2: Sending test CoT message..."
RESPONSE=$(curl -s -X POST http://localhost:8080/cot \
    -H "Content-Type: application/xml" \
    -H "X-UDP-Host: 127.0.0.1" \
    -H "X-UDP-Port: 8087" \
    -d "$TEST_COT")

if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "✓ Message sent successfully"
    echo "  Response: $RESPONSE"
else
    echo "✗ Failed to send message"
    echo "  Response: $RESPONSE"
    exit 1
fi

echo ""
echo "=========================================="
echo "All tests passed! ✓"
echo "=========================================="
echo ""
echo "The proxy server is correctly forwarding"
echo "CoT messages via UDP."
echo ""
