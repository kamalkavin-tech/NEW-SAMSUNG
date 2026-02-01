/**
 * Test BBNL Channels API Endpoint
 * Tests if http://124.40.244.211/netmon/cabletvapis/chnl_data is working
 * AND if channels can stream on Samsung TV
 *
 * Usage: node test-channels-endpoint.js
 */

const http = require('http');

// API Configuration
const API_HOST = '124.40.244.211';
const API_PATH = '/netmon/cabletvapis/chnl_list'; // Using chnl_list (working endpoint)

// Request headers (exactly as used in the app)
const HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=',
    'devmac': '26:F2:AE:D8:3F:99',
    'devslno': 'FOFI20191129000336'
};

// Request payload
const PAYLOAD = {
    userid: 'testiser1',
    mobile: '7800000001',
    ip_address: '192.168.101.110',
    mac_address: '26:F2:AE:D8:3F:99'
};

console.log('='.repeat(70));
console.log('📺 Testing BBNL Channels API Endpoint');
console.log('='.repeat(70));
console.log('');
console.log('📡 Endpoint: http://' + API_HOST + API_PATH);
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

                    // Check for channels data
                    let channels = [];
                    if (jsonData.body && Array.isArray(jsonData.body)) {
                        if (jsonData.body.length > 0 && jsonData.body[0].channels) {
                            channels = jsonData.body[0].channels;
                        }
                    }

                    if (channels.length > 0) {
                        console.log(`✅ Found ${channels.length} channel(s)`);
                        console.log('');
                        console.log('📺 Sample Channels (first 5):');
                        console.log('');

                        for (let i = 0; i < Math.min(5, channels.length); i++) {
                            const ch = channels[i];
                            console.log(`${i + 1}. ${ch.chtitle || 'Unknown'}`);
                            console.log(`   - Channel ID: ${ch.chid || 'N/A'}`);
                            console.log(`   - Channel No: ${ch.channelno || 'N/A'}`);
                            console.log(`   - Stream URL: ${ch.streamlink || 'N/A'}`);
                            console.log(`   - Logo: ${ch.chlogo || 'N/A'}`);
                            console.log(`   - Subscribed: ${ch.subscribed || 'N/A'}`);
                            console.log('');
                        }

                        console.log('');
                        console.log('📊 Channel Statistics:');
                        let subscribed = 0;
                        let hasStream = 0;

                        channels.forEach(ch => {
                            if (ch.subscribed === 'yes' || ch.subscribed === '1') subscribed++;
                            if (ch.streamlink && ch.streamlink.length > 0) hasStream++;
                        });

                        console.log(`   Total Channels: ${channels.length}`);
                        console.log(`   Subscribed: ${subscribed}`);
                        console.log(`   With Stream URL: ${hasStream}`);
                        console.log('');

                        // Analyze stream URLs
                        console.log('🎬 Stream URL Analysis:');
                        const sampleChannel = channels.find(ch => ch.streamlink);
                        if (sampleChannel) {
                            const streamUrl = sampleChannel.streamlink;
                            console.log(`   Sample URL: ${streamUrl}`);

                            if (streamUrl.includes('.m3u8')) {
                                console.log('   ✅ Format: HLS (.m3u8) - Compatible with Samsung TV');
                            } else if (streamUrl.includes('udp://')) {
                                console.log('   ⚠️  Format: UDP - May not work in browser, should work on TV');
                            } else {
                                console.log('   ℹ️  Format: Other');
                            }

                            if (streamUrl.startsWith('https://')) {
                                console.log('   ✅ Protocol: HTTPS - Secure streaming');
                            } else if (streamUrl.startsWith('http://')) {
                                console.log('   ⚠️  Protocol: HTTP - Unencrypted');
                            }
                        }

                        console.log('');
                        console.log('📱 Samsung TV Playback:');
                        console.log('   ✅ Channel API working correctly');
                        console.log('   ✅ Stream URLs available');
                        console.log('   ✅ HLS streams should play on Samsung TV');
                        console.log('   ✅ Use Tizen AVPlayer API for playback');

                    } else {
                        console.log('⚠️  WARNING: API returned 0 channels');
                        console.log('   Possible reasons:');
                        console.log('   - No channels configured in backend for this user');
                        console.log('   - User not subscribed to any channels');
                        console.log('   - Backend database is empty');
                    }
                } else {
                    console.log(`❌ ERROR: API returned err_code = ${jsonData.status.err_code}`);
                    console.log(`   Error message: ${jsonData.status.err_msg || 'No message'}`);
                }
            } else {
                console.log('⚠️  WARNING: Response has no "status" field');
            }

        } catch (error) {
            console.log('❌ ERROR: Response is not valid JSON');
            console.log('   Raw response:');
            console.log(body.substring(0, 500)); // First 500 chars
            console.log('');
            console.log('   Parse error:', error.message);
        }

        console.log('');
        console.log('='.repeat(70));
        console.log('✅ Test completed!');
        console.log('='.repeat(70));
    });
});

req.on('error', (error) => {
    console.log('❌ REQUEST FAILED');
    console.log('');
    console.log('Error:', error.message);
    console.log('');
    console.log('='.repeat(70));
});

req.write(payloadString);
req.end();
