/**
 * Debug Helper for Tizen TV
 * Helps diagnose API and AVPlay issues
 */

var DebugHelper = (function() {
    var logs = [];
    var maxLogs = 100;

    function log(message, data) {
        var timestamp = new Date().toISOString();
        var logEntry = {
            time: timestamp,
            message: message,
            data: data
        };
        
        logs.push(logEntry);
        if (logs.length > maxLogs) {
            logs.shift();
        }
        
        console.log(`[DEBUG ${timestamp}] ${message}`, data || '');
        
        // Try to display on screen if debug element exists
        updateDebugDisplay();
    }

    function updateDebugDisplay() {
        var debugEl = document.getElementById('debug-overlay');
        if (debugEl) {
            var lastLogs = logs.slice(-10).reverse();
            debugEl.innerHTML = '<div style="background: rgba(0,0,0,0.8); color: #0f0; padding: 10px; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto;">' +
                lastLogs.map(function(l) {
                    return '<div>' + l.time.split('T')[1].split('.')[0] + ' - ' + l.message + (l.data ? ': ' + JSON.stringify(l.data).substring(0, 100) : '') + '</div>';
                }).join('') +
                '</div>';
        }
    }

    function checkEnvironment() {
        var env = {
            isTizen: typeof tizen !== 'undefined',
            hasWebapis: typeof webapis !== 'undefined',
            hasAVPlay: typeof webapis !== 'undefined' && typeof webapis.avplay !== 'undefined',
            hasNetwork: typeof webapis !== 'undefined' && typeof webapis.network !== 'undefined',
            userAgent: navigator.userAgent,
            hostname: window.location.hostname,
            protocol: window.location.protocol
        };
        
        log('Environment Check', env);
        return env;
    }

    function testAPIConnection(callback) {
        log('Testing API Connection...');
        
        var testUrl = 'http://124.40.244.211/netmon/cabletvapis/chnl_data';
        var payload = {
            userid: 'testuser1',
            mobile: '7800000001',
            ip_address: '192.168.1.1',
            mac_address: '00:00:00:00:00:00'
        };

        fetch(testUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE='
            },
            body: JSON.stringify(payload)
        })
        .then(function(response) {
            log('API Response Status', response.status);
            return response.json();
        })
        .then(function(data) {
            log('API Response Data', data);
            if (callback) callback(null, data);
        })
        .catch(function(error) {
            log('API Connection Error', error.message);
            if (callback) callback(error, null);
        });
    }

    function testAVPlay(streamUrl) {
        if (typeof webapis === 'undefined' || !webapis.avplay) {
            log('AVPlay NOT Available');
            return false;
        }

        log('Testing AVPlay with URL', streamUrl);
        
        try {
            // Get current state
            var state = webapis.avplay.getState();
            log('AVPlay Current State', state);
            
            // Try to open stream
            webapis.avplay.open(streamUrl);
            log('AVPlay Open Success');
            
            // Set display rect
            webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
            log('Display Rect Set', '0,0,1920,1080');
            
            // Try to prepare
            webapis.avplay.prepareAsync(
                function() {
                    log('AVPlay Prepare Success');
                    webapis.avplay.play();
                    log('AVPlay Play Started');
                },
                function(error) {
                    log('AVPlay Prepare Error', error);
                }
            );
            
            return true;
        } catch (e) {
            log('AVPlay Exception', e.message);
            return false;
        }
    }

    function getDeviceInfo() {
        var info = {
            model: 'Unknown',
            firmware: 'Unknown',
            ip: 'Unknown',
            mac: 'Unknown'
        };

        try {
            if (typeof webapis !== 'undefined') {
                if (webapis.productinfo) {
                    info.model = webapis.productinfo.getModel() || 'Unknown';
                    info.firmware = webapis.productinfo.getFirmware() || 'Unknown';
                }
                if (webapis.network) {
                    info.ip = webapis.network.getIp() || 'Unknown';
                    info.mac = webapis.network.getMac() || 'Unknown';
                }
            }
        } catch (e) {
            log('Error getting device info', e.message);
        }

        log('Device Info', info);
        return info;
    }

    function createDebugOverlay() {
        var overlay = document.createElement('div');
        overlay.id = 'debug-overlay';
        overlay.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 9999; max-width: 500px;';
        document.body.appendChild(overlay);
        
        log('Debug overlay created');
    }

    function toggleDebugOverlay() {
        var overlay = document.getElementById('debug-overlay');
        if (overlay) {
            overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
        }
    }

    return {
        log: log,
        checkEnvironment: checkEnvironment,
        testAPIConnection: testAPIConnection,
        testAVPlay: testAVPlay,
        getDeviceInfo: getDeviceInfo,
        createDebugOverlay: createDebugOverlay,
        toggleDebugOverlay: toggleDebugOverlay,
        getLogs: function() { return logs; }
    };
})();
