/**
 * Test /chnl_data endpoint to inspect its response structure
 * This will help us understand how to parse the response correctly
 */

const http = require('http');

const API_HOST = '124.40.244.211';
const API_PATH = '/netmon/cabletvapis/chnl_data';  // The CORRECT endpoint

const HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=',
    'devmac': '26:F2:AE:D8:3F:99',
    'devslno': 'FOFI20191129000336'
};

const PAYLOAD = {
    userid: 'testiser1',
    mobile: '7800000001',
    ip_address: '192.168.101.110',
    mac_address: '26:F2:AE:D8:3F:99'
};

console.log('='.repeat(70));
console.log('🔍 Testing /chnl_data Response Structure');
console.log('='.repeat(70));
console.log('📡 Endpoint: http://' + API_HOST + API_PATH);
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

const req = http.request(options, (res) => {
    console.log('📊 Response Status:', res.statusCode);
    console.log('');

    let body = '';

    res.on('data', (chunk) => {
        body += chunk;
    });

    res.on('end', () => {
        try {
            const jsonData = JSON.parse(body);

            console.log('📦 RESPONSE STRUCTURE ANALYSIS:');
            console.log('='.repeat(70));
            console.log('');

            // Top level keys
            console.log('🔑 Top-level keys:', Object.keys(jsonData));
            console.log('');

            // Status
            if (jsonData.status) {
                console.log('📌 status:', jsonData.status);
                console.log('');
            }

            // Body analysis
            if (jsonData.body) {
                console.log('📌 body type:', typeof jsonData.body);
                console.log('📌 body is Array?', Array.isArray(jsonData.body));
                console.log('');

                if (Array.isArray(jsonData.body)) {
                    console.log('📌 body.length:', jsonData.body.length);
                    console.log('');

                    if (jsonData.body.length > 0) {
                        console.log('📌 body[0] type:', typeof jsonData.body[0]);
                        console.log('📌 body[0] keys:', Object.keys(jsonData.body[0]));
                        console.log('');

                        // Check for channels array
                        if (jsonData.body[0].channels) {
                            console.log('✅ body[0].channels EXISTS!');
                            console.log('📌 channels type:', typeof jsonData.body[0].channels);
                            console.log('📌 channels is Array?', Array.isArray(jsonData.body[0].channels));

                            if (Array.isArray(jsonData.body[0].channels)) {
                                console.log('📌 channels.length:', jsonData.body[0].channels.length);
                                console.log('');

                                if (jsonData.body[0].channels.length > 0) {
                                    console.log('📺 FIRST CHANNEL SAMPLE:');
                                    console.log('-'.repeat(70));
                                    const firstChannel = jsonData.body[0].channels[0];
                                    console.log('Keys:', Object.keys(firstChannel));
                                    console.log('');
                                    console.log('Sample data:');
                                    console.log('  - chtitle:', firstChannel.chtitle);
                                    console.log('  - chid:', firstChannel.chid);
                                    console.log('  - channelno:', firstChannel.channelno);
                                    console.log('  - streamlink:', firstChannel.streamlink);
                                    console.log('  - chlogo:', firstChannel.chlogo);
                                    console.log('  - subscribed:', firstChannel.subscribed);
                                    console.log('  - grid:', firstChannel.grid);
                                    console.log('  - langid:', firstChannel.langid);
                                    console.log('-'.repeat(70));
                                }
                            }
                        } else {
                            console.log('❌ body[0].channels DOES NOT EXIST');
                            console.log('');
                            console.log('📌 body[0] full structure:');
                            console.log(JSON.stringify(jsonData.body[0], null, 2));
                        }
                    }
                } else {
                    console.log('❌ body is NOT an array');
                    console.log('📌 body structure:');
                    console.log(JSON.stringify(jsonData.body, null, 2));
                }
            } else {
                console.log('❌ No body field in response');
            }

            console.log('');
            console.log('='.repeat(70));
            console.log('✅ Analysis complete');
            console.log('='.repeat(70));

        } catch (error) {
            console.log('❌ ERROR: Response is not valid JSON');
            console.log('Raw response:', body.substring(0, 500));
            console.log('');
            console.log('Parse error:', error.message);
        }
    });
});

req.on('error', (error) => {
    console.log('❌ REQUEST FAILED');
    console.log('Error:', error.message);
});

req.write(payloadString);
req.end();
