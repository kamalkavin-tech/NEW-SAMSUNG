/**
 * Test BBNL Ads API Endpoint
 * Tests if http://124.40.244.211/netmon/cabletvapis/iptvads is working
 *
 * Usage: node test-ads-endpoint.js
 */

const http = require('http');

// API Configuration
const API_URL = 'http://124.40.244.211/netmon/cabletvapis/iptvads';
const API_HOST = '124.40.244.211';
const API_PATH = '/netmon/cabletvapis/iptvads';

// Request headers (exactly as used in the app)
const HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=',
    'devmac': '26:F2:AE:D8:3F:99',
    'devslno': 'FOFI20191129000336'
};

// Request payload (exactly as used in the app)
const PAYLOAD = {
    userid: 'testiser1',
    mobile: '7800000001',
    adclient: 'fofi',
    srctype: 'image',
    displayarea: 'homepage',
    displaytype: 'multiple'
};

console.log('='.repeat(70));
console.log('🧪 Testing BBNL Ads API Endpoint');
console.log('='.repeat(70));
console.log('');
console.log('📡 Endpoint:', API_URL);
console.log('📋 Method: POST');
console.log('');
console.log('📨 Request Headers:');
console.log(JSON.stringify(HEADERS, null, 2));
console.log('');
console.log('📦 Request Payload:');
console.log(JSON.stringify(PAYLOAD, null, 2));
console.log('');
console.log('⏳ Sending request...');
console.log('-'.repeat(70));
console.log('');

const payloadString = JSON.stringify(PAYLOAD);

const options = {
    hostname: API_HOST,
    path: API_PATH,
    method: 'POST',
    headers: {
        ...HEADERS,
        'Content-Length': Buffer.byteLength(payloadString)
    }
};

const startTime = Date.now();

const req = http.request(options, (res) => {
    const duration = Date.now() - startTime;

    console.log('📊 Response Status:', res.statusCode, res.statusMessage);
    console.log('⏱️  Response Time:', duration + 'ms');
    console.log('');
    console.log('📨 Response Headers:');
    console.log(JSON.stringify(res.headers, null, 2));
    console.log('');
    console.log('-'.repeat(70));
    console.log('📄 Response Body:');
    console.log('-'.repeat(70));

    let body = '';

    res.on('data', (chunk) => {
        body += chunk;
    });

    res.on('end', () => {
        try {
            // Try to parse as JSON
            const jsonData = JSON.parse(body);
            console.log(JSON.stringify(jsonData, null, 2));
            console.log('');
            console.log('-'.repeat(70));
            console.log('');

            // Analyze the response
            if (jsonData.status) {
                if (jsonData.status.err_code === 0) {
                    console.log('✅ SUCCESS: API returned err_code = 0');

                    if (jsonData.body && Array.isArray(jsonData.body)) {
                        const adCount = jsonData.body.length;
                        console.log(`✅ Found ${adCount} ad(s)`);
                        console.log('');

                        if (adCount > 0) {
                            console.log('📸 Ad URLs:');
                            jsonData.body.forEach((ad, index) => {
                                console.log(`   ${index + 1}. ${ad.adpath || 'No adpath'}`);
                            });
                        } else {
                            console.log('⚠️  WARNING: API returned 0 ads');
                            console.log('   Possible reasons:');
                            console.log('   - No ads configured in backend for this user');
                            console.log('   - displayarea "homepage" has no ads assigned');
                            console.log('   - Backend database is empty');
                        }
                    } else {
                        console.log('❌ ERROR: Response body is not an array');
                        console.log('   Body:', jsonData.body);
                    }
                } else {
                    console.log(`❌ ERROR: API returned err_code = ${jsonData.status.err_code}`);
                    console.log(`   Error message: ${jsonData.status.err_msg || 'No message'}`);
                    console.log('');
                    console.log('💡 Common error codes:');
                    console.log('   err_code 1: Invalid credentials');
                    console.log('   err_code 2: Missing required fields');
                    console.log('   err_code 3: User not found');
                    console.log('   err_code 4: Device not authorized');
                }
            } else {
                console.log('⚠️  WARNING: Response has no "status" field');
                console.log('   This might not be the expected response format');
            }

        } catch (error) {
            console.log('❌ ERROR: Response is not valid JSON');
            console.log('   Raw response:');
            console.log(body);
            console.log('');
            console.log('   Parse error:', error.message);
        }

        console.log('');
        console.log('='.repeat(70));
        console.log('Test completed!');
        console.log('='.repeat(70));
    });
});

req.on('error', (error) => {
    console.log('❌ REQUEST FAILED');
    console.log('');
    console.log('Error:', error.message);
    console.log('');
    console.log('💡 Possible causes:');
    console.log('   - Server is down or unreachable');
    console.log('   - Network connectivity issues');
    console.log('   - Firewall blocking the request');
    console.log('   - Wrong hostname or port');
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('   1. Check internet connection');
    console.log('   2. Try pinging 124.40.244.211');
    console.log('   3. Check if firewall allows outbound HTTP');
    console.log('   4. Verify the endpoint URL is correct');
    console.log('');
    console.log('='.repeat(70));
});

req.write(payloadString);
req.end();
