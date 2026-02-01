/**
 * CORS Proxy Server for BBNL API Testing
 * Allows browser testing by proxying requests to BBNL server
 *
 * Usage:
 * 1. Install Node.js if not installed
 * 2. Run: node proxy-server.js
 * 3. In api.js, set USE_PROXY = true
 * 4. Test in browser - CORS errors will be gone!
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = 3000;
const TARGET_HOST = '124.40.244.211';

const server = http.createServer((req, res) => {
    // Enable CORS for browser testing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, devmac, devslno');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    console.log(`[PROXY] ${req.method} ${req.url}`);

    // Parse request
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        // Forward request to BBNL server
        const targetUrl = `http://${TARGET_HOST}${req.url}`;
        console.log(`[PROXY] Forwarding to: ${targetUrl}`);
        console.log(`[PROXY] Body:`, body);

        const options = {
            method: req.method,
            headers: {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'Authorization': req.headers['authorization'] || '',
                'devmac': req.headers['devmac'] || '',
                'devslno': req.headers['devslno'] || '',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const proxyReq = http.request(targetUrl, options, (proxyRes) => {
            console.log(`[PROXY] Response status: ${proxyRes.statusCode}`);

            // Forward response headers (with CORS enabled)
            res.writeHead(proxyRes.statusCode, {
                'Content-Type': proxyRes.headers['content-type'] || 'application/json',
                'Access-Control-Allow-Origin': '*'
            });

            // Forward response body
            proxyRes.on('data', chunk => {
                res.write(chunk);
            });

            proxyRes.on('end', () => {
                res.end();
            });
        });

        proxyReq.on('error', (error) => {
            console.error(`[PROXY] Error:`, error.message);
            res.writeHead(500, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
                error: 'Proxy error',
                message: error.message
            }));
        });

        // Send request body
        if (body) {
            proxyReq.write(body);
        }
        proxyReq.end();
    });
});

server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`🚀 BBNL CORS Proxy Server running on http://localhost:${PORT}`);
    console.log(`📡 Forwarding requests to http://${TARGET_HOST}`);
    console.log('='.repeat(60));
    console.log('');
    console.log('✅ Ready for browser testing!');
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. In api.js, set: USE_PROXY = true');
    console.log('   2. Refresh your browser');
    console.log('   3. API calls will now work without CORS errors');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
    console.log('='.repeat(60));
});
