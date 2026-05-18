(function () {
    try {
        var host = String(window.location.hostname || '').toLowerCase();
        var isLocalDevHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
        var isDevQuery = false;

        try {
            isDevQuery = /(?:\?|&)dev=1(?:&|$)/.test(window.location.search || '');
        } catch (e1) {}

        if (!isLocalDevHost && !isDevQuery) return;
        if (window.__BBNL_LIVE_RELOAD__) return;
        window.__BBNL_LIVE_RELOAD__ = true;

        var source = null;

        function connect() {
            try {
                if (source) {
                    try { source.close(); } catch (e2) {}
                }
                source = new EventSource('/__bbnl_live_reload');

                source.addEventListener('reload', function () {
                    window.location.reload();
                });

                source.onerror = function () {
                    try { source.close(); } catch (e3) {}
                    source = null;
                    setTimeout(connect, 1000);
                };
            } catch (e4) {
                setTimeout(connect, 1500);
            }
        }

        connect();
    } catch (e) {}
})();
