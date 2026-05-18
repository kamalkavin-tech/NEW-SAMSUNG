const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);
const clients = new Set();

function contentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.html') return 'text/html; charset=utf-8';
    if (ext === '.js') return 'application/javascript; charset=utf-8';
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    if (ext === '.xml' || ext === '.wgt') return 'application/xml; charset=utf-8';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.ico') return 'image/x-icon';
    return 'application/octet-stream';
}

function safePath(requestPath) {
    const decoded = decodeURIComponent(requestPath || '/');
    const cleaned = decoded.replace(/^([/\\])+/, '');
    const resolved = path.resolve(rootDir, '.' + (cleaned || '/index.html'));
    if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
        return path.join(rootDir, 'index.html');
    }
    return resolved;
}

function injectReloadClient(html) {
    const marker = '<script src="/js/dev-live-reload.js"></script>';
    if (html.indexOf(marker) >= 0) return html;
    if (html.indexOf('</body>') >= 0) {
        return html.replace('</body>', '    ' + marker + '\n</body>');
    }
    return html + '\n' + marker + '\n';
}

function sendReload() {
    for (const res of clients) {
        try {
            res.write('event: reload\n');
            res.write('data: update\n\n');
        } catch (e) {}
    }
}

function serveFile(req, res, filePath) {
    const textExt = /\.(html|js|css|json|xml|txt|md|svg)$/i.test(filePath);
    fs.readFile(filePath, textExt ? 'utf8' : null, function (err, fileData) {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        let output = fileData;
        if (path.extname(filePath).toLowerCase() === '.html') {
            output = injectReloadClient(String(fileData));
        }

        res.writeHead(200, { 'Content-Type': contentType(filePath) });
        res.end(output);
    });
}

const server = http.createServer(function (req, res) {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname || '/';

    if (pathname === '/__bbnl_live_reload') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write('\n');
        clients.add(res);
        req.on('close', function () {
            clients.delete(res);
        });
        return;
    }

    let requestPath = pathname;
    if (requestPath === '/') requestPath = '/index.html';
    serveFile(req, res, safePath(requestPath));
});

server.listen(port, function () {
    console.log('BBNL dev server running at http://localhost:' + port);
});

const watchTargets = [rootDir, path.join(rootDir, 'js'), path.join(rootDir, 'css'), path.join(rootDir, 'docs')];
for (const target of watchTargets) {
    try {
        fs.watch(target, { recursive: true }, function (eventType, filename) {
            if (!filename) return;
            if (!/\.(html|js|css|xml|md|txt)$/i.test(String(filename))) return;
            sendReload();
        });
    } catch (e) {
        console.warn('Watch unavailable for', target, e && e.message ? e.message : e);
    }
}
