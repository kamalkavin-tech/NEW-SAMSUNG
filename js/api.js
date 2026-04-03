/**
 * BBNL Samsung TV Project API Service - FIXED VERSION
 * Implements endpoints as per BBNL API Documentation.
 */

// ==========================================
// PRODUCTION MODE - Silence console output
// Samsung TV console I/O is extremely slow and causes
// major performance degradation. This must load FIRST.
// To debug: set window.__BBNL_DEBUG = true in console
// ==========================================
(function () {
    var noop = function () {};
    if (!window.__BBNL_DEBUG) {
        console.debug = noop;
        // console.error kept for critical errors
    }
})();

// ==========================================
// API CONFIGURATION
// ==========================================

// Base URLs for API endpoints
// SMART AUTO-DETECTION: Automatically chooses correct mode
// - Real Samsung TV (Tizen) → Production mode (direct API calls)
// - Browser testing → Proxy mode (bypasses CORS) if proxy is available
// - Manual override available below

// Auto-detect environment
var IS_TIZEN_TV = typeof webapis !== 'undefined' && typeof tizen !== 'undefined';
var IS_TIZEN_EMULATOR = typeof webapis !== 'undefined' || typeof tizen !== 'undefined'; // More relaxed check for emulator
var IS_FILE_PROTOCOL = window.location.protocol === 'file:';
var IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Manual override: Set to true ONLY if you want to force proxy mode in browser
// Leave as false for production deployment to Samsung TV
var FORCE_PROXY_MODE = false;

// Determine whether to use proxy
var USE_PROXY = !IS_TIZEN_TV && FORCE_PROXY_MODE;

var API_BASE_URL_PROD;
var API_BASE_URL_IPTV;

if (USE_PROXY) {
    // Browser testing with proxy (bypasses CORS)
    API_BASE_URL_PROD = "http://localhost:3000";
    API_BASE_URL_IPTV = "http://localhost:3000";
} else {
    // Production mode - Real Samsung TV or direct API access
    if (IS_TIZEN_TV) {
    } else {
    }
    // HTTPS endpoint for Samsung TV (HTTP is blocked by proxy on TV)
    // Production API endpoint: https://bbnlnetmon.bbnl.in/prod/cabletvapis
    API_BASE_URL_PROD = "https://bbnlnetmon.bbnl.in/prod/cabletvapis";
    API_BASE_URL_IPTV = "https://bbnlnetmon.bbnl.in/prod/cabletvapis";
}

// Debug logging removed for production TV performance
// To debug: set window.__BBNL_DEBUG = true before loading

// Default headers for all API requests (devmac, devslno & deviceid populated dynamically by DeviceInfo.initializeDeviceInfo)
const DEFAULT_HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=",
    "devmac": "",
    "devslno": "",
    "deviceID": ""
};

// App package name & full app ID - read dynamically from config.xml / Tizen API
var APP_PACKAGE = "";
var APP_ID = "";
var APP_CURRENT_VERSION = "1.0.0"; // Current app version - read from config.xml

/**
 * Read app package name from config.xml or Tizen application API
 * Sets the global APP_PACKAGE variable
 */
function _initAppPackage() {
    // Method 1: Try Tizen application API (most reliable on real TV)
    try {
        if (typeof tizen !== 'undefined' && tizen.application) {
            var appInfo = tizen.application.getCurrentApplication().appInfo;
            if (appInfo) {
                // appInfo.id = "ph3Ha7N8EQ.BBNLIPTV" -> extract package name after the dot
                var appId = appInfo.id || "";
                APP_ID = appId;
                var dotIndex = appId.indexOf(".");
                if (dotIndex !== -1 && dotIndex < appId.length - 1) {
                    APP_PACKAGE = appId.substring(dotIndex + 1);
                } else {
                    APP_PACKAGE = appId;
                }
                // Also read version from Tizen API if available
                if (appInfo.version) {
                    APP_CURRENT_VERSION = appInfo.version;
                }
                return;
            }
        }
    } catch (e) {
    }

    // Method 2: Parse config.xml via XMLHttpRequest
    try {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "config.xml", false); // synchronous for early init
        xhr.send();
        if (xhr.status === 200 || xhr.status === 0) {
            var parser = new DOMParser();
            var doc = parser.parseFromString(xhr.responseText, "application/xml");
            var tizenApp = doc.querySelector("application");
            if (tizenApp) {
                var appId = tizenApp.getAttribute("id") || "";
                APP_ID = appId;
                var dotIndex = appId.indexOf(".");
                if (dotIndex !== -1 && dotIndex < appId.length - 1) {
                    APP_PACKAGE = appId.substring(dotIndex + 1);
                } else {
                    APP_PACKAGE = appId;
                }
                // Read version from widget element
                var widgetEl = doc.querySelector("widget");
                if (widgetEl && widgetEl.getAttribute("version")) {
                    APP_CURRENT_VERSION = widgetEl.getAttribute("version");
                }
                return;
            }
        }
    } catch (e) {
    }

    // Fallback
    APP_PACKAGE = "BBNLIPTV";
    APP_ID = "ph3Ha7N8EQ.BBNLIPTV";
}

_initAppPackage();

// Dynamic user fallback - reads from logged-in user session in localStorage
// Returns empty strings if no user is logged in
var _sessionUserCache = null;
var _sessionUserCacheTime = 0;

function _isAuthDebugEnabled() {
    try {
        return !!(window.__BBNL_DEBUG || localStorage.getItem('__bbnl_auth_debug') === '1');
    } catch (e) {
        return !!(window.__BBNL_DEBUG);
    }
}

function _authDebugLog(message, details) {
    if (!_isAuthDebugEnabled()) return;
    try {
        if (typeof details !== 'undefined') {
            console.log('[AuthDebug] ' + message, details);
        } else {
            console.log('[AuthDebug] ' + message);
        }
    } catch (e) {}
}

function _getSessionUser() {
    var now = 0;
    try { now = Date.now(); } catch (e) { now = new Date().getTime(); }
    if (_sessionUserCache && (now - _sessionUserCacheTime) < 1000) return _sessionUserCache;
    try {
        var data = localStorage.getItem("bbnl_user");
        var backup = localStorage.getItem("bbnl_user_backup");
        var user = null;

        _authDebugLog('Read session keys', {
            hasPrimary: !!data,
            hasBackup: !!backup,
            hasLoggedInOnce: localStorage.getItem('hasLoggedInOnce'),
            relaunchPending: localStorage.getItem('bbnl_relaunch_pending')
        });

        if (data) {
            try {
                var parsedPrimary = JSON.parse(data);
                if (parsedPrimary && parsedPrimary.userid) user = parsedPrimary;
                else _authDebugLog('Primary user parsed but missing userid', parsedPrimary);
            } catch (e1) {}
        }

        if (!user && backup) {
            try {
                var parsedBackup = JSON.parse(backup);
                if (parsedBackup && parsedBackup.userid) user = parsedBackup;
                else _authDebugLog('Backup user parsed but missing userid', parsedBackup);
            } catch (e2) {}
        }

        if (user) {
            var userJson = JSON.stringify(user);
            try {
                if (localStorage.getItem("bbnl_user") !== userJson) {
                    localStorage.setItem("bbnl_user", userJson);
                    _authDebugLog('Repaired primary user key from cached/backup data');
                }
                if (localStorage.getItem("bbnl_user_backup") !== userJson) {
                    localStorage.setItem("bbnl_user_backup", userJson);
                    _authDebugLog('Repaired backup user key from primary data');
                }
                if (localStorage.getItem("hasLoggedInOnce") !== "true") {
                    localStorage.setItem("hasLoggedInOnce", "true");
                    _authDebugLog('Repaired hasLoggedInOnce flag');
                }
            } catch (syncErr) {}

            // Mobile may be at top level or nested in custdet[0].mobile
            var mobile = user.mobile || user.phone || "";
            if (!mobile && user.custdet && user.custdet.length > 0) {
                mobile = user.custdet[0].mobile || "";
            }

            _sessionUserCache = {
                userid: user.userid || user.userId || "",
                mobile: mobile
            };
            _sessionUserCacheTime = now;
            return _sessionUserCache;
        }
    } catch (e) {
        console.error("[API] Error reading session user:", e);
    }
    _sessionUserCache = { userid: "", mobile: "" };
    _sessionUserCacheTime = now;
    return _sessionUserCache;
}

// API Configuration Object
const API_CONFIG = {
    BASE_URL: API_BASE_URL_PROD,
    HEADERS: DEFAULT_HEADERS
};

// Bump when image URL/cache format changes to clear stale URL entries on deployed TVs.
var IMAGE_CACHE_SCHEMA_VERSION = '2';

function getImagePlaceholderUrl() {
    return '';
}

function _isMalformedImageUrl(url) {
    var val = String(url || '').trim();
    if (!val) return true;
    if (/^(javascript|vbscript):/i.test(val)) return true;
    if (/^[a-z]+:/i.test(val) && !/^https?:/i.test(val)) return true;
    return false;
}

function getValidatedImageUrl(rawUrl) {
    if (_isMalformedImageUrl(rawUrl)) {
        return '';
    }

    var original = String(rawUrl || '').trim();
    var resolved = resolveAssetUrl(original);
    if (_isMalformedImageUrl(resolved)) {
        return '';
    }

    // Keep validation permissive for Samsung TV runtime quirks; only block empty/script URLs.
    return resolved;
}

// ==========================================
// IN-MEMORY BLOB URL CACHE
// Caches blob URLs within the same page session so images don't re-fetch
// when the channel grid re-renders (e.g. language filter switch).
// Blob URLs die on page navigation — that's OK, browser HTTP cache handles cross-page.
// ==========================================
var _BLOB_CACHE = {};  // URL → blob URL
var _blobCacheOrder = []; // Track order for cleanup
var _MAX_BLOB_CACHE_ITEMS = 300; // ✅ INCREASED: Prevent memory leak on long scrolling (was 100, now 300 for better hit rate)

// ==========================================
// CONCURRENT FETCH LIMITER
// Samsung TV can't handle 200+ simultaneous fetch calls.
// Queue them and process max 6 at a time.
// ==========================================
var _blobFetchQueue = [];
var _blobFetchActive = 0;
var _BLOB_MAX_CONCURRENT = 6;
var _IMAGE_QUICK_RETRY_DELAY_MS = 3500; // Retry failed image after ~3-4 seconds
var _IMAGE_QUICK_RETRY_MAX = 2; // Max quick retries before marking failed

var _blobFetchInFlight = {}; // URL → true (prevent duplicate fetches)

function _blobFetchNext() {
    while (_blobFetchActive < _BLOB_MAX_CONCURRENT && _blobFetchQueue.length > 0) {
        var job = _blobFetchQueue.shift();
        _blobFetchActive++;
        _executeBlobFetch(job.url, job.el, job.onErr, job.options);
    }
}

function _executeBlobFetch(capturedUrl, capturedEl, capturedPrevErr, options) {
    if (_blobFetchQueue.length > 500) {
        // Queue too large - safety skip
        _blobFetchActive--;
        return;
    }
    fetch(capturedUrl, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
        .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.blob();
        })
        .then(function (blob) {
            // ✅ FIX: Don't create blob URLs - they become invalid on re-render
            // Instead, use the original URL directly.
            // The fetch + 'force-cache' primes the HTTP cache;
            // browser serves subsequent requests from cache.

            // ✅ Record success in persistent cache
            _recordImageSuccess(capturedUrl);

            // Set original URL (not blob URL) so it survives re-renders
            if (capturedEl) capturedEl.src = capturedUrl;
            delete _blobFetchInFlight[capturedUrl];
        })
        .catch(function (err) {
            delete _blobFetchInFlight[capturedUrl];

            var retryAttempt = (options && typeof options.retryAttempt === 'number')
                ? options.retryAttempt
                : 0;

            // Quick recovery for transient network issues: retry a few times before failing.
            if (retryAttempt < _IMAGE_QUICK_RETRY_MAX) {
                setTimeout(function () {
                    // ✅ FIX: Check only _blobFetchInFlight (_BLOB_CACHE no longer used)
                    if (_blobFetchInFlight[capturedUrl]) return;
                    _blobFetchInFlight[capturedUrl] = true;
                    _blobFetchQueue.unshift({
                        url: capturedUrl,
                        el: capturedEl,
                        onErr: capturedPrevErr,
                        options: { retryAttempt: retryAttempt + 1, priority: true }
                    });
                    _blobFetchNext();
                }, _IMAGE_QUICK_RETRY_DELAY_MS);
                return;
            }

            // Exhausted quick retries: persist failed state and use fallback once.
            _recordImageFailure(capturedUrl);
            _tryAlternativeImageFetch(capturedUrl, capturedEl, capturedPrevErr);
        })
        .finally(function () {
            _blobFetchActive--;
            _blobFetchNext();
        });
}

function _cleanupBlobResources() {
    console.log("[API] Cleaning up " + Object.keys(_BLOB_CACHE).length + " blob URLs");
    for (var url in _BLOB_CACHE) {
        try { URL.revokeObjectURL(_BLOB_CACHE[url]); } catch (e) {}
    }
    _BLOB_CACHE = {};
    _blobFetchQueue = [];
    _blobFetchInFlight = {};
}

// Ensure cleanup on page navigation to prevent memory leaks on Tizen
window.addEventListener('pagehide', _cleanupBlobResources);
window.addEventListener('pageshow', function(e) {
    if (e.persisted) {
        // Reset state after BFCache restore (queue should be clean)
        _blobFetchActive = 0;
        _blobFetchInFlight = {};
    }
});

/**
 * When primary image URL fails, try alternative paths generated by
 * _generateAlternativeImagePaths. This fixes broken logos where the API
 * returns incorrect folder structures or stale hostnames.
 */
function _tryAlternativeImageFetch(failedUrl, imgEl, prevOnError) {
    var alts = _generateAlternativeImagePaths(failedUrl);
    if (!alts || alts.length === 0) {
        // No alternatives — give up, show placeholder
        _recordImageFailure(failedUrl);  // Mark as failed since no alternatives
        if (typeof prevOnError === 'function') {
            try { prevOnError.call(imgEl); } catch (e) {}
        }
        return;
    }

    var idx = 0;

    function tryNext() {
        if (idx >= alts.length) {
            // All alternatives exhausted — show placeholder
            _recordImageFailure(failedUrl);  // All attempts failed
            if (typeof prevOnError === 'function') {
                try { prevOnError.call(imgEl); } catch (e) {}
            }
            return;
        }

        var altUrl = alts[idx++];
        // ✅ FIX: Fetch to verify URL works, but use original URL (not blob URL) for src
        fetch(altUrl, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.blob();
            })
            .then(function (blob) {
                // ✅ FIX: Use original alternative URL, not blob URL
                _recordImageSuccess(failedUrl);  // Alternative URL worked
                imgEl.src = altUrl;  // Use altUrl directly (not blob URL)
            })
            .catch(function () {
                // This alternative failed too — try next one
                tryNext();
            });
    }

    tryNext();
}

function setImageSource(imgEl, rawUrl, options) {
    var freshUrl = getValidatedImageUrl(rawUrl);
    var finalUrl = freshUrl || '';

    if (!imgEl) return finalUrl;

    // Check if this URL is known to have failed before.
    var isKnownFailed = _imageFailedUrls[finalUrl];
    var retryAllowed = _isRetryCooldownPassed(finalUrl);

    var prevOnError = imgEl.onerror;

    imgEl.onerror = function (evt) {
        // Browser/non-file path quick retry guard: retry up to 2 times before persisting failure.
        if (window.location.protocol !== 'file:' && finalUrl) {
            var currentAttempt = Number(imgEl.getAttribute('data-img-retry-attempt') || '0');
            if (currentAttempt < _IMAGE_QUICK_RETRY_MAX && _isRetryCooldownPassed(finalUrl)) {
                imgEl.setAttribute('data-img-retry-attempt', String(currentAttempt + 1));
                setTimeout(function () {
                    var sep = finalUrl.indexOf('?') !== -1 ? '&' : '?';
                    imgEl.src = finalUrl + sep + '_rt=' + Date.now();
                }, _IMAGE_QUICK_RETRY_DELAY_MS);
                return;
            }
        }

        // Record failure in persistent cache after retries are exhausted.
        _recordImageFailure(finalUrl);
        
        if (typeof prevOnError === 'function') {
            try { prevOnError.call(imgEl, evt); } catch (e) {}
        }
    };

    if (finalUrl) {
        imgEl.style.display = '';

        // ✅ FIX: Don't use blob URL cache - use original URLs directly
        // Blob URLs are temporary and become invalid after re-renders.
        // Browser HTTP cache (force-cache) handles caching automatically.

        // Cooldown active: avoid repeated network retries and show fallback immediately.
        if (isKnownFailed && !retryAllowed) {
            if (typeof prevOnError === 'function') {
                try { prevOnError.call(imgEl); } catch (e) {}
            }
            return finalUrl;
        }

        // For Samsung Tizen TV (file:// protocol): fetch + blob URL
        if (window.location.protocol === 'file:' && typeof fetch !== 'undefined') {
            // Dedup: if another element is already fetching this URL, queue up
            if (_blobFetchInFlight[finalUrl]) {
                var waitUrl = finalUrl;
                var waitEl = imgEl;
                var retryCount = 0;
                var maxRetries = 20; // 2 seconds max polling
                setTimeout(function check() {
                    if (!_blobFetchInFlight[waitUrl] || retryCount >= maxRetries) {
                        // Fetch complete, set original URL directly
                        if (waitEl) waitEl.src = waitUrl;
                    } else {
                        retryCount++;
                        setTimeout(check, 100);
                    }
                }, 100);
                return finalUrl;
            }

            _blobFetchInFlight[finalUrl] = true;
            
            // Queue fetch — max 6 concurrent
            var job = {
                url: finalUrl,
                el: imgEl,
                onErr: prevOnError,
                options: { retryAttempt: 0 }
            };
            if (options && options.priority) {
                // Priority images (e.g. main channel logo) jump to FRONT of queue
                _blobFetchQueue.unshift(job);
            } else {
                _blobFetchQueue.push(job);
            }
            _blobFetchNext();
        } else {
            imgEl.setAttribute('src', finalUrl);
        }
    } else {
        if (typeof prevOnError === 'function') {
            try { prevOnError.call(imgEl); } catch (e) {}
        }
    }
    return finalUrl;
}

/**
 * Generate alternative image URL paths when primary fails
 * Handles cases where API returns wrong folder structure
 */
function _generateAlternativeImagePaths(primaryUrl) {
    var alts = [];
    if (!primaryUrl) return alts;
    
    try {
        // Try removing /netmon/cabletvapis prefix
        if (primaryUrl.indexOf('/netmon/cabletvapis/') > -1) {
            var withoutPrefix = primaryUrl.replace(/\/netmon\/cabletvapis\//g, '/');
            if (withoutPrefix !== primaryUrl) {
                alts.push(withoutPrefix);
                if (window.__BBNL_DEBUG) console.log('[IMAGE] Alt path (no prefix):', withoutPrefix);
            }
        }
        
        // Try with /netmon/cabletvapis prefix (in case missing)
        if (primaryUrl.indexOf('/netmon/cabletvapis/') === -1 && primaryUrl.indexOf('/images/') > -1) {
            var withPrefix = primaryUrl.replace(/\/images\//g, '/netmon/cabletvapis/images/');
            if (withPrefix !== primaryUrl) {
                alts.push(withPrefix);
                if (window.__BBNL_DEBUG) console.log('[IMAGE] Alt path (with prefix):', withPrefix);
            }
        }
        
        // Try moving /images to root level
        if (primaryUrl.indexOf('/netmon/cabletvapis/images/') > -1) {
            var rootImages = primaryUrl.replace(/\/netmon\/cabletvapis\//g, '/');
            if (rootImages !== primaryUrl) {
                alts.push(rootImages);
                if (window.__BBNL_DEBUG) console.log('[IMAGE] Alt path (images at root):', rootImages);
            }
        }
        
        // Try replacing domain while keeping path (in case hostname changed)
        var urlObj = new URL(primaryUrl, window.location.href);
        var preferredOrigin = (typeof BBNL_API !== 'undefined' && BBNL_API.BASE_URL) 
            ? new URL(BBNL_API.BASE_URL, window.location.href).origin 
            : '';
        
        if (preferredOrigin && preferredOrigin !== urlObj.origin) {
            var swappedHost = preferredOrigin + urlObj.pathname + (urlObj.search || '') + (urlObj.hash || '');
            if (swappedHost !== primaryUrl) {
                alts.push(swappedHost);
                if (window.__BBNL_DEBUG) console.log('[IMAGE] Alt path (swapped host):', swappedHost);
            }
        }

        // TV production payload frequently returns cdn1/cabletest paths that may be stale.
        // Try known alternate hosts/folders using same filename.
        var fileName = '';
        try {
            var p = urlObj.pathname || '';
            var lastSlash = p.lastIndexOf('/');
            fileName = (lastSlash > -1) ? p.substring(lastSlash + 1) : '';
        } catch (eName) { fileName = ''; }

        if (fileName) {
            var hostCandidates = [
                'https://bbnlnetmon.bbnl.in/prod/assets/site_images/',
                'http://bbnlnetmon.bbnl.in/prod/assets/site_images/',
                'https://images.bbnl.in/cabletest/',
                'http://images.bbnl.in/cabletest/',
                'https://bbnlnetmon.bbnl.in/prod/cabletvapis/images/',
                'http://bbnlnetmon.bbnl.in/prod/cabletvapis/images/'
            ];

            for (var hi = 0; hi < hostCandidates.length; hi++) {
                var candidate = hostCandidates[hi] + fileName;
                if (candidate && candidate !== primaryUrl) {
                    alts.push(candidate);
                    if (window.__BBNL_DEBUG) console.log('[IMAGE] Alt path (filename host-swap):', candidate);
                }
            }

            // Specific fallback for popup error images under errimgs.
            if (/\/errimgs\//i.test(urlObj.pathname || '')) {
                var errCandidates = [
                    'https://bbnlnetmon.bbnl.in/prod/assets/site_images/' + fileName,
                    'http://bbnlnetmon.bbnl.in/prod/assets/site_images/' + fileName
                ];
                for (var ei = 0; ei < errCandidates.length; ei++) {
                    if (errCandidates[ei] !== primaryUrl) alts.push(errCandidates[ei]);
                }
            }
        }
    } catch (e) {
        if (window.__BBNL_DEBUG) console.warn('[IMAGE] Error generating alternative paths:', e);
    }

    // De-duplicate while preserving order.
    var seen = {};
    var unique = [];
    for (var i = 0; i < alts.length; i++) {
        var u = String(alts[i] || '');
        if (!u || seen[u]) continue;
        seen[u] = true;
        unique.push(u);
    }

    return unique;
}

function invalidateImageUrlCaches() {
    try {
        var localKeys = ['bbnl_error_images', 'home_fofi_logo_url'];
        for (var i = 0; i < localKeys.length; i++) {
            try { localStorage.removeItem(localKeys[i]); } catch (e) {}
        }

        var removeKeys = [];
        for (var j = 0; j < sessionStorage.length; j++) {
            var k = sessionStorage.key(j);
            if (!k) continue;
            if (k.indexOf('channels_cache_') === 0 || k === 'home_fofi_logo_url') {
                removeKeys.push(k);
            }
        }
        removeKeys.forEach(function (k2) {
            try { sessionStorage.removeItem(k2); } catch (e) {}
        });
    } catch (e3) {}
}

function migrateImageCachesIfNeeded() {
    try {
        var current = localStorage.getItem('bbnl_image_cache_schema') || '0';
        if (current === IMAGE_CACHE_SCHEMA_VERSION) return;


        // Remove image-related caches that may contain stale/legacy hosts from old builds.
        var localKeys = [
            'bbnl_error_images',
            'home_fofi_logo_url',
            'home_ads_cache_persistent'
        ];
        localKeys.forEach(function (k) {
            try { localStorage.removeItem(k); } catch (e) {}
        });

        var sessionKeys = [
            'home_ads_cache',
            'home_languages_cache',
            'home_channels_cache',
            'home_fofi_logo_url'
        ];
        sessionKeys.forEach(function (k) {
            try { sessionStorage.removeItem(k); } catch (e) {}
        });

        // Clear dynamic channels cache buckets (channels_cache_*) that can carry stale logo fields.
        try {
            var toDelete = [];
            for (var i = 0; i < sessionStorage.length; i++) {
                var key = sessionStorage.key(i);
                if (key && key.indexOf('channels_cache_') === 0) {
                    toDelete.push(key);
                }
            }
            toDelete.forEach(function (k) {
                try { sessionStorage.removeItem(k); } catch (e) {}
            });
        } catch (e2) {}

        // CRITICAL: Also clear any image URL maps that may contain old hosts
        try {
            sessionStorage.removeItem('bbnl_image_cache_urls_v1');
        } catch (e_map) {}

        localStorage.setItem('bbnl_image_cache_schema', IMAGE_CACHE_SCHEMA_VERSION);
    } catch (e3) {
    }
}
migrateImageCachesIfNeeded();

function resolveAssetUrl(rawUrl) {
    if (rawUrl === null || rawUrl === undefined) return '';
    var value = String(rawUrl).trim();
    if (!value) return '';


    // Normalize malformed slashes/schemes often seen in backend payloads.
    value = value.replace(/\\/g, '/');
    value = value.replace(/^https?:\/(?!\/)/i, function (m) {
        return /^https:/i.test(m) ? 'https://' : 'http://';
    });
    value = value.replace(/^([a-z]+):\/\/+/, '$1://');

    // Only allow http/https URLs here.
    if (/^[a-z]+:/i.test(value) && !/^https?:/i.test(value)) return '';

    var apiBase = String(API_CONFIG.BASE_URL || '').trim();
    var appOrigin = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null')
        ? window.location.origin
        : '';

    var preferredOrigin = '';
    try {
        if (apiBase) preferredOrigin = new URL(apiBase, (typeof window !== 'undefined' ? window.location.href : undefined)).origin;
    } catch (e) {
    }
    if (!preferredOrigin) preferredOrigin = appOrigin;

    var originalValue = value;

    function isLegacyOrLocalHost(hostname) {
        if (!hostname) return false;
        var host = String(hostname).toLowerCase();
        return host === 'localhost'
            || host === '127.0.0.1'
            || host === '0.0.0.0';
    }

    if (preferredOrigin) {
           value = value.replace(/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i, preferredOrigin);
    }

    if (/^https?:\/\//i.test(value)) {
        try {
            var parsedAbs = new URL(value);
            if (preferredOrigin && isLegacyOrLocalHost(parsedAbs.hostname)) {
                var targetOrigin = new URL(preferredOrigin).origin;
                return targetOrigin + parsedAbs.pathname + (parsedAbs.search || '') + (parsedAbs.hash || '');
            }
        } catch (eAbs) {}
        return value;
    }
    if (value.indexOf('//') === 0) {
        var result = ((typeof window !== 'undefined' && window.location && window.location.protocol) ? window.location.protocol : 'https:') + value;
        return result;
    }

    try {
        if (value.charAt(0) === '/' && preferredOrigin) {
            var result = preferredOrigin + value;
            return result;
        }
        if (apiBase) {
            var result = new URL(value, apiBase + '/').href;
            return result;
        }
    } catch (e2) {
    }

    return value;
}

// ==========================================
// CACHE MANAGER - Handles localStorage caching with expiry
// ==========================================
const CacheManager = {
    // Safe Date.now() helper for Tizen simulator compatibility
    _now: function () {
        try { return Date.now(); } catch (e) { return new Date().getTime(); }
    },

    // Cache keys
    // NOTE: bbnl_user (login session) is NOT managed by CacheManager.
    // It is permanent login state stored/read directly via localStorage.
    // Only explicit logout (Settings > Logout) should clear it.
    KEYS: {
        CHANNEL_LIST: 'bbnl_channels_cache',
        CATEGORIES: 'bbnl_categories_cache',
        LANGUAGES: 'bbnl_languages_cache',
        FOFI_PLAYED: 'fofi_autoplay_done',  // Uses sessionStorage - consistent across all files
        LAST_CHANNEL: 'bbnl_last_channel',
        EXPIRING_CHANNELS: 'bbnl_expiring_cache'
    },

    // Default cache expiry times (in milliseconds)
    EXPIRY: {
        CHANNEL_LIST: 60 * 60 * 1000,   // 1 hour
        CATEGORIES: 60 * 60 * 1000,      // 1 hour
        LANGUAGES: 60 * 60 * 1000,       // 1 hour
        LAST_CHANNEL: 7 * 24 * 60 * 60 * 1000,  // 7 days
        EXPIRING_CHANNELS: 60 * 60 * 1000  // 1 hour
    },

    /**
     * Set data in cache with expiry timestamp
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     * @param {number} expiryMs - Expiry time in milliseconds (optional)
     */
    set: function (key, data, expiryMs) {
        try {
            var expiry = expiryMs || this.EXPIRY.CHANNEL_LIST;
            var now = this._now();
            var cacheObject = {
                data: data,
                timestamp: now,
                expiry: now + expiry
            };
            // Update in-memory cache immediately
            if (!this._mc) this._mc = {};
            this._mc[key] = cacheObject;
            var jsonStr = JSON.stringify(cacheObject);
            try {
                localStorage.setItem(key, jsonStr);
            } catch (quotaError) {
                // localStorage full — clear expired caches and retry
                this._clearExpired();
                try {
                    localStorage.setItem(key, jsonStr);
                } catch (retryError) {
                    // Still full — clear all non-login caches and retry once more
                    this.clearAll();
                    localStorage.setItem(key, jsonStr);
                }
            }
            return true;
        } catch (e) {
            console.error('[CacheManager] ✗ Failed to cache:', key, e);
            return false;
        }
    },

    /**
     * Clear only expired cache entries (free up space without losing valid data)
     */
    _clearExpired: function () {
        var self = this;
        var now = this._now();
        Object.keys(this.KEYS).forEach(function (keyName) {
            var key = self.KEYS[keyName];
            try {
                var cached = localStorage.getItem(key);
                if (cached) {
                    var obj = JSON.parse(cached);
                    if (obj.expiry && now > obj.expiry) {
                        localStorage.removeItem(key);
                    }
                }
            } catch (e) {}
        });
    },

    /**
     * Get data from cache (returns null if expired or not found)
     * @param {string} key - Cache key
     * @param {boolean} ignoreExpiry - If true, returns data even if expired
     * @returns {any|null} Cached data or null
     */
    get: function (key, ignoreExpiry) {
        try {
            // In-memory cache — avoids repeated JSON.parse of large data
            if (!this._mc) this._mc = {};
            if (this._mc[key]) {
                var m = this._mc[key];
                if (!ignoreExpiry && m.expiry && this._now() > m.expiry) return null;
                return m.data;
            }

            var cached = localStorage.getItem(key);
            if (!cached) return null;

            var cacheObject = JSON.parse(cached);
            this._mc[key] = cacheObject; // cache for next call

            var now = this._now();
            if (!ignoreExpiry && cacheObject.expiry && now > cacheObject.expiry) return null;

            return cacheObject.data;
        } catch (e) {
            console.error('[CacheManager] ✗ Failed to read cache:', key, e);
            return null;
        }
    },

    /**
     * Check if cache exists and is valid (not expired)
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    isValid: function (key) {
        return this.get(key) !== null;
    },

    /**
     * Get cache age in minutes
     * @param {string} key - Cache key
     * @returns {number|null} Age in minutes or null if not cached
     */
    getAge: function (key) {
        try {
            var cached = localStorage.getItem(key);
            if (!cached) return null;
            var cacheObject = JSON.parse(cached);
            return Math.round((this._now() - cacheObject.timestamp) / 60000);
        } catch (e) {
            return null;
        }
    },

    /**
     * Remove specific cache entry
     * @param {string} key - Cache key
     */
    remove: function (key) {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('[CacheManager] Failed to remove cache:', key, e);
        }
    },

    /**
     * Clear all BBNL caches (except login token)
     */
    clearAll: function () {
        var self = this;
        Object.keys(this.KEYS).forEach(function (keyName) {
            self.remove(self.KEYS[keyName]);
        });
    },

    /**
     * Clear ALL caches (same as clearAll since bbnl_user is no longer in KEYS)
     * bbnl_user is managed directly by AuthAPI, not CacheManager.
     */
    clear: function () {
        this.clearAll();
    },

    /**
     * Get cache stats for debugging
     */
    getStats: function () {
        var self = this;
        var stats = {};
        Object.keys(this.KEYS).forEach(function (keyName) {
            var key = self.KEYS[keyName];
            var cached = localStorage.getItem(key);
            if (cached) {
                try {
                    var obj = JSON.parse(cached);
                    stats[keyName] = {
                        age: self.getAge(key) + ' minutes',
                        expired: obj.expiry ? self._now() > obj.expiry : false,
                        size: Math.round(cached.length / 1024) + ' KB'
                    };
                } catch (e) {
                    stats[keyName] = { error: e.message };
                }
            } else {
                stats[keyName] = null;
            }
        });
        return stats;
    },

    /**
     * Set last played channel
     * @param {object} channel - Channel data
     */
    setLastChannel: function (channel) {
        this.set(this.KEYS.LAST_CHANNEL, channel, this.EXPIRY.LAST_CHANNEL);
    },

    /**
     * Get last played channel
     * @returns {object|null}
     */
    getLastChannel: function () {
        return this.get(this.KEYS.LAST_CHANNEL);
    }
};

// Make CacheManager globally available
window.CacheManager = CacheManager;

// ==========================================
// APP PERFORMANCE CACHE
// Prefetches static assets once per login session and persists page state
// across page navigation to improve perceived performance.
// ==========================================
const AppPerformanceCache = {
    FLAGS: {
        ASSETS_PRIMED: '_bbnl_assets_primed'
    },

    KEYS: {
        PAGE_STATE_PREFIX: 'bbnl_page_state_'
    },

    _safeSessionGet: function (key) {
        try { return sessionStorage.getItem(key); } catch (e) { return null; }
    },

    _safeSessionSet: function (key, value) {
        try { sessionStorage.setItem(key, value); } catch (e) {}
    },

    _buildStaticAssetList: function () {
        return [
            'home.html', 'channels.html', 'favorites.html', 'settings.html', 'player.html', 'feedback.html', 'ott-apps.html', 'language-select.html',
            'css/style.css', 'css/base/reset.css', 'css/base/responsive.css', 'css/base/variable.css',
            'css/layout/header.css', 'css/layout/sidebar.css', 'css/layout/home-layout.css',
            'css/pages/homepages.css', 'css/pages/channels.css', 'css/pages/player.css', 'css/pages/settings.css', 'css/pages/favorites.css',
            'css/pages/favorites-enhanced.css', 'css/pages/language-select.css', 'css/pages/feedback.css', 'css/pages/ott-apps.css',
            'css/componentes/buttons.css', 'css/componentes/cards.css', 'css/componentes/forms.css', 'css/componentes/remote.css', 'css/componentes/error-popups.css',
            'js/api.js', 'js/main.js', 'js/home.js', 'js/channels.js', 'js/player.js', 'js/settings.js', 'js/favorites.js', 'js/feedback.js',
            'js/ott-apps.js', 'js/language-select.js', 'js/avplayer.js', 'js/home-navigation.js',
            'images/error-network.png', 'images/error-invalid-input.png', 'images/error-login-failed.png', 'images/error-channel-unavailable.png',
            'images/error-coming-soon-ott.png', 'images/error-customer-care.png', 'images/error-feedback-success.png'
        ];
    },

    _primeInMemoryAssets: function () {
        var self = this;

        // Prime currently referenced assets from DOM first.
        try {
            var domAssets = [];
            var links = document.querySelectorAll('link[href]');
            var scripts = document.querySelectorAll('script[src]');
            var imgs = document.querySelectorAll('img[src]');

            links.forEach(function (el) { domAssets.push(el.getAttribute('href')); });
            scripts.forEach(function (el) { domAssets.push(el.getAttribute('src')); });
            imgs.forEach(function (el) { domAssets.push(el.getAttribute('src')); });

            domAssets.forEach(function (url) {
                if (!url || url.indexOf('http') === 0 || url.indexOf('$WEBAPIS') === 0) return;
                try {
                    var link = document.createElement('link');
                    link.rel = 'prefetch';
                    link.href = url;
                    document.head.appendChild(link);
                } catch (e) {}
            });
        } catch (e) {}

        // Prime app-wide known static assets.
        this._buildStaticAssetList().forEach(function (path) {
            if (!path) return;

            if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(path)) {
                try {
                    var img = new Image();
                    img.decoding = 'async';
                    img.src = path;
                } catch (e) {}
                return;
            }

            try {
                var link = document.createElement('link');
                link.rel = 'prefetch';
                link.href = path;
                document.head.appendChild(link);
            } catch (e) {}

            // Fetch API helps warm HTTP/file cache where supported.
            try {
                fetch(path, { method: 'GET', cache: 'force-cache' }).catch(function () {});
            } catch (e) {}
        });
    },

    primeAfterLogin: function (force) {
        // DISABLED: _primeInMemoryAssets causes 20+ ERR_ACCESS_DENIED errors on file:// protocol.
        // Error images, CSS prefetch, and JS prefetch all fail on Samsung TV.
        // The browser HTTP cache already handles repeat loads efficiently.
        try {
            this._safeSessionSet(this.FLAGS.ASSETS_PRIMED, '1');
        } catch (e) {}
    },

    savePageState: function (pageKey, state) {
        if (!pageKey) return;
        try {
            var payload = {
                ts: CacheManager._now(),
                state: state || {}
            };
            this._safeSessionSet(this.KEYS.PAGE_STATE_PREFIX + pageKey, JSON.stringify(payload));
        } catch (e) {}
    },

    getPageState: function (pageKey, maxAgeMs) {
        if (!pageKey) return null;
        try {
            var raw = this._safeSessionGet(this.KEYS.PAGE_STATE_PREFIX + pageKey);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            var age = CacheManager._now() - (parsed.ts || 0);
            if (maxAgeMs && age > maxAgeMs) return null;
            return parsed.state || null;
        } catch (e) {
            return null;
        }
    },

    clearPageState: function (pageKey) {
        if (!pageKey) return;
        try { sessionStorage.removeItem(this.KEYS.PAGE_STATE_PREFIX + pageKey); } catch (e) {}
    }
};

window.AppPerformanceCache = AppPerformanceCache;

// ==========================================
// API MEMORY CACHE (session-persistent)
// Reuses first API response in-memory and across page navigation.
// ==========================================
var _API_MEMORY_CACHE = {};
var _API_MEMORY_CACHE_KEY = 'bbnl_api_memory_cache_v1';

function _hydrateApiMemoryCache() {
    try {
        var raw = sessionStorage.getItem(_API_MEMORY_CACHE_KEY);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            _API_MEMORY_CACHE = parsed;
        }
    } catch (e) {}
}

function _persistApiMemoryCache() {
    try {
        sessionStorage.setItem(_API_MEMORY_CACHE_KEY, JSON.stringify(_API_MEMORY_CACHE));
    } catch (e) {}
}

function _isEndpointCacheable(endpoint) {
    if (!endpoint) return false;
    return /chnl_data|chnl_categlist|chnl_langlist|expiringchnl_list|iptvads|streamAds|allowedapps|errorimages|fofitv_logo|appversion/i.test(String(endpoint));
}

function _buildApiCacheKey(endpoint, payload) {
    var body = '';
    try { body = JSON.stringify(payload || {}); } catch (e) { body = String(payload || ''); }
    return String(endpoint) + '::' + body;
}

function _cloneCachedData(data) {
    try { return JSON.parse(JSON.stringify(data)); } catch (e) { return data; }
}

_hydrateApiMemoryCache();

// ==========================================
// GLOBAL IMAGE CACHE (session-persistent preload list)
// Ensures image assets are requested once and reused.
// ==========================================
var _IMAGE_CACHE_MAP = {};
var _IMAGE_CACHE_KEY = 'bbnl_image_cache_urls_v1';
var _IMAGE_METADATA_KEY = 'bbnl_image_cache_metadata_v2';  // Persistent localStorage cache for image metadata
var _IMAGE_RETRY_KEY = 'bbnl_image_failed_urls_v1';  // Persistent list of URLs that need retry
var _IMAGE_FAIL_COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hour cooldown before retrying failed URLs

// Image metadata: { url: { status: 'cached'|'failed'|'pending', lastFetch: timestamp, failCount: 0, sources: [] } }
var _imageMetadata = {};
var _imageFailedUrls = {};  // URLs that failed to load — will retry on demand

function _isRetryCooldownPassed(url, nowTs) {
    if (!url) return false;
    if (!_imageFailedUrls[url]) return true;
    var meta = _imageMetadata[url] || {};
    var lastFailedAt = Number(meta.lastFailedAt || 0);
    var now = nowTs || Date.now();
    if (!lastFailedAt) return true;
    return (now - lastFailedAt) >= _IMAGE_FAIL_COOLDOWN_MS;
}

function _loadPersistentImageMetadata() {
    try {
        var stored = localStorage.getItem(_IMAGE_METADATA_KEY);
        if (stored) {
            var parsed = JSON.parse(stored);
            if (parsed && typeof parsed === 'object') {
                _imageMetadata = parsed;
            }
        }
    } catch (e) { console.error('[ImageCache] Failed to load persistent metadata:', e); }

    try {
        var failedStored = localStorage.getItem(_IMAGE_RETRY_KEY);
        if (failedStored) {
            var failedParsed = JSON.parse(failedStored);
            if (Array.isArray(failedParsed)) {
                failedParsed.forEach(function(url) {
                    _imageFailedUrls[url] = true;
                });
            }
        }
    } catch (e) { console.error('[ImageCache] Failed to load failed URLs list:', e); }
}

function _savePersistentImageMetadata() {
    try {
        localStorage.setItem(_IMAGE_METADATA_KEY, JSON.stringify(_imageMetadata));
    } catch (e) { console.error('[ImageCache] Failed to save metadata:', e); }

    try {
        var failedList = Object.keys(_imageFailedUrls);
        localStorage.setItem(_IMAGE_RETRY_KEY, JSON.stringify(failedList));
    } catch (e) { console.error('[ImageCache] Failed to save failed URLs:', e); }
}

function _hydrateImageCache() {
    try {
        var raw = sessionStorage.getItem(_IMAGE_CACHE_KEY);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            _IMAGE_CACHE_MAP = parsed;
        }
    } catch (e) {}
}

function _persistImageCache() {
    try {
        sessionStorage.setItem(_IMAGE_CACHE_KEY, JSON.stringify(_IMAGE_CACHE_MAP));
    } catch (e) {}
}

function _isImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /\.(png|jpg|jpeg|gif|webp|svg)(\?|#|$)/i.test(url) || /^https?:\/\//i.test(url) || /^images\//i.test(url);
}

function _recordImageFailure(url) {
    if (!url) return;
    _imageFailedUrls[url] = true;
    var metadata = _imageMetadata[url] || {};
    metadata.failCount = (metadata.failCount || 0) + 1;
    metadata.status = 'failed';
    metadata.lastFailedAt = Date.now();
    _imageMetadata[url] = metadata;
    _savePersistentImageMetadata();
}

function _recordImageSuccess(url) {
    if (!url) return;
    delete _imageFailedUrls[url];
    var metadata = _imageMetadata[url] || {};
    metadata.status = 'cached';
    metadata.lastFetch = Date.now();
    metadata.failCount = 0;
    _imageMetadata[url] = metadata;
    _savePersistentImageMetadata();
}

function _preloadImage(url, options) {
    var validatedUrl = getValidatedImageUrl(url);
    if (!validatedUrl) return;
    if (!_isImageUrl(validatedUrl)) return;
    if (_IMAGE_CACHE_MAP[validatedUrl]) return;

    // Skip if already has too many failures in this session
    var metadata = _imageMetadata[validatedUrl] || {};
    var maxRetries = (options && options.ignoreFailCount) ? 999 : 2;
    if (metadata.failCount >= maxRetries) return;

    // Failed image cooldown guard: do not keep retrying broken URLs on each navigation.
    if (!_isRetryCooldownPassed(validatedUrl)) return;

    _IMAGE_CACHE_MAP[validatedUrl] = 1;
    _persistImageCache();

    try {
        var img = new Image();
        img.decoding = 'async';
        (function(imgUrl) {
            img.onload = function() {
                _recordImageSuccess(imgUrl);
            };
            img.onerror = function() {
                _recordImageFailure(imgUrl);
            };
        })(validatedUrl);
        img.src = validatedUrl;
    } catch (e) {}
}

function _preloadImageBatch(list, options) {
    if (!Array.isArray(list) || list.length === 0) return;
    for (var i = 0; i < list.length; i++) {
        _preloadImage(list[i], options);
    }
}

// Load persistent metadata + failed URLs list before starting
_loadPersistentImageMetadata();

// Hydrate session cache from localStorage metadata on app load
_hydrateImageCache();

// IMPORTANT: Do not eagerly preload all historical image URLs here.
// In MPA navigation this causes unnecessary network traffic on every page load.
// Images are loaded lazily via setImageSource/_preloadImageBatch only when needed by UI.

// BACKGROUND IMAGE INTEGRITY CHECK: Periodically validate cached images are still accessible
// This catches cases where CDN URLs expire or change after app restarts
function _validateImageCacheIntegrity() {
    if (!_imageMetadata || Object.keys(_imageMetadata).length === 0) return;

    // Sample up to 10 random images from cache to validate
    var urlsToCheck = Object.keys(_imageMetadata)
        .filter(function(url) {
            var m = _imageMetadata[url];
            // Only check images that were successfully cached and are over 1 hour old
            return m.status === 'cached' && (Date.now() - (m.lastFetch || 0)) > 60 * 60 * 1000;
        })
        .sort(function() { return Math.random() - 0.5; })  // shuffle
        .slice(0, 10);

    if (urlsToCheck.length === 0) return;

    // Validate each URL with a HEAD request (fast, no body download)
    urlsToCheck.forEach(function(url) {
        try {
            fetch(url, { method: 'HEAD', mode: 'cors', credentials: 'omit', cache: 'no-store', timeout: 5000 })
                .then(function(r) {
                    if (!r.ok && r.status !== 405) {  // 405 = HEAD not allowed, still means URL is valid
                        _recordImageFailure(url);
                        console.warn('[ImageCache] Image URL validation failed:', url, 'Status:', r.status);
                    }
                })
                .catch(function(err) {
                    _recordImageFailure(url);
                    console.warn('[ImageCache] Image URL validation error:', url, err.message);
                });
        } catch (e) {}
    });
}

// Run integrity check 5 seconds after app loads
setTimeout(_validateImageCacheIntegrity, 5000);

// Re-run every 30 minutes to catch stale CDN URLs
setInterval(_validateImageCacheIntegrity, 30 * 60 * 1000);

// API Endpoints
const API_ENDPOINTS = {
    // Auth endpoints (old base URL)
    LOGIN: `${API_BASE_URL_PROD}/login`,
    LOGIN_OTP: `${API_BASE_URL_PROD}/loginOtp`,
    RESEND_OTP: `${API_BASE_URL_PROD}/loginOtp`,
    ADD_MACADDRESS: `${API_BASE_URL_PROD}/addmacnew`,
    USER_LOGOUT: `${API_BASE_URL_PROD}/userLogout`,

    // Channel endpoints - ALL use /netmon/ path (same as auth, categories, languages)
    CHANNEL_CATEGORIES: `${API_BASE_URL_PROD}/chnl_categlist`,
    CHANNEL_LANGUAGELIST: `${API_BASE_URL_PROD}/chnl_langlist`,
    CHANNEL_LIST: `${API_BASE_URL_PROD}/chnl_data`,        // CORRECT: Returns full channel data with streamlinks for playback
    CHANNEL_DATA: `${API_BASE_URL_PROD}/chnl_data`,        // Alias for compatibility (same as CHANNEL_LIST)
    CHANNEL_EXPIRING: `${API_BASE_URL_PROD}/expiringchnl_list`,

    // Ads endpoints
    IPTV_ADS: `${API_BASE_URL_PROD}/iptvads`,
    STREAM_ADS: `${API_BASE_URL_PROD}/streamAds`,

    // Other endpoints
    OTT_APPS: `${API_BASE_URL_PROD}/allowedapps`,
    RAISE_TICKET: `${API_BASE_URL_PROD}/raiseTicket`,
    FEED_BACK: `${API_BASE_URL_PROD}/feedback`,
    APP_LOCK: `${API_BASE_URL_PROD}/applock`,
    TRP_DATA: `${API_BASE_URL_PROD}/trpdata`,
    APP_VERSION: `${API_BASE_URL_PROD}/appversion`,
    ERROR_IMAGES: `${API_BASE_URL_PROD}/errorimages`,
    FOFITV_LOGO: `${API_BASE_URL_PROD}/fofitv_logo`
};

// Device info - populated dynamically from Samsung TV APIs on real TV
// Falls back to emulator defaults when webapis is not available
const DEVICE_INFO = {
    ip_address: "",
    mac_address: "",
    device_name: "",
    device_type: "FOFI_SAMSUNG",
    devslno: "",
    ipv6: "",
    // devdets fields - detected dynamically from Samsung TV APIs
    brand: "",
    model: "",
    softwareversion: "",
    tizenversion: "",
    connection_type: "",
    dns: "",
    gateway_ip: "",
    screen_resolution: ""
};

// ==========================================
// API HELPER
// ==========================================
async function apiCall(endpoint, payload, customHeaders) {
    const url = endpoint;
    const headers = Object.assign({}, DEFAULT_HEADERS, customHeaders || {});
    const cacheable = _isEndpointCacheable(url);
    const cacheKey = cacheable ? _buildApiCacheKey(url, payload) : '';

    if (cacheable && _API_MEMORY_CACHE[cacheKey]) {
        return _cloneCachedData(_API_MEMORY_CACHE[cacheKey]);
    }

    // Removed: logging payload builds expensive strings even when console is noop

    // Abort controller timeout — keep most APIs snappy, but allow more time
    // for login/loginOtp flows to avoid false timeout on slower TV networks.
    var controller = null;
    var timeoutId = null;
    var requestTimeoutMs = /\/login(?:Otp)?$/i.test(String(url)) ? 10000 : 4000;
    try {
        controller = new AbortController();
        timeoutId = setTimeout(function () { controller.abort(); }, requestTimeoutMs);
    } catch (e) {
        // AbortController not supported on older Tizen — proceed without timeout
        controller = null;
    }

    try {
        var fetchOptions = {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        };
        if (controller) fetchOptions.signal = controller.signal;

        const response = await fetch(url, fetchOptions);

        if (timeoutId) clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();

        // Clear stale API failure marker after a successful response.
        try {
            var okRoot = (typeof window !== 'undefined') ? window : globalThis;
            okRoot.__bbnlLastApiFailure = null;
        } catch (e) {}

        if (cacheable) {
            _API_MEMORY_CACHE[cacheKey] = data;
            _persistApiMemoryCache();
        }

        return data;
    } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        var isAbort = error && error.name === 'AbortError';
        
        // ✅ FIX: Silently ignore AbortError (user canceled request)
        // Do not log and do not mark API/network failure state.
        if (isAbort) {
            return {
                error: true,
                aborted: true,
                message: 'Request aborted',
                status: {
                    err_code: -2,
                    err_msg: 'Request aborted'
                }
            };
        }
        
        var isTimeout = error && error.message && /timeout/i.test(error.message);
        console.error(`[API] ${isTimeout ? 'TIMEOUT' : 'Error'}: ${url}`, error);

        // Persist lightweight failure context for page-level popup decisions.
        try {
            var failRoot = (typeof window !== 'undefined') ? window : globalThis;
            var messageText = String((error && error.message) || '');
            var networkLike = isTimeout || /network|failed to fetch|load failed|offline|timeout/i.test(messageText);
            failRoot.__bbnlLastApiFailure = {
                ts: Date.now(),
                endpoint: url,
                message: messageText,
                timeout: !!isTimeout,
                networkLike: !!networkLike
            };
        } catch (e) {}

        return {
            error: true,
            message: isTimeout ? 'Request timed out (10s)' : error.message,
            status: {
                err_code: -1,
                err_msg: isTimeout ? 'Request timed out (10s)' : error.message
            }
        };
    }
}

function mapBBNLError(msg) {
    if (!msg) return "Unknown Error";
    if (msg.includes("Invalid OTP")) return "The OTP you entered is incorrect.";
    if (msg.includes("User not found")) return "User account not found.";
    return msg;
}

// ==========================================
// DEVICE INFO
// ==========================================
const DeviceInfo = {
    _applyDeviceId: function (id) {
        var value = String(id || '').trim();
        if (!value) return '';
        var changed = DEVICE_INFO.devslno !== value;
        DEVICE_INFO.devslno = value;
        DEFAULT_HEADERS["devslno"] = value;
        DEFAULT_HEADERS["deviceID"] = value;
        try { sessionStorage.setItem('_resolvedDeviceId', value); } catch (e) {}
        try { localStorage.setItem('_resolvedDeviceId', value); } catch (e) {}

        if (changed && typeof window !== 'undefined' && window.dispatchEvent) {
            try {
                window.dispatchEvent(new CustomEvent('bbnl:device-id-updated', { detail: { deviceId: value } }));
            } catch (e) {
                // Older engines may not support CustomEvent constructor.
                try {
                    var ev = document.createEvent('CustomEvent');
                    ev.initCustomEvent('bbnl:device-id-updated', false, false, { deviceId: value });
                    window.dispatchEvent(ev);
                } catch (e2) {}
            }
        }
        return value;
    },

    initializeDeviceInfo: function () {
        // Load cached public IP — check sessionStorage first, then localStorage
        // sessionStorage survives page navigation; localStorage survives HOME→Relaunch
        try {
            var cachedPublicIP = sessionStorage.getItem('_publicIP');
            if (!cachedPublicIP || this._isPrivateIP(cachedPublicIP)) {
                cachedPublicIP = localStorage.getItem('_publicIP');
            }
            if (cachedPublicIP && !this._isPrivateIP(cachedPublicIP)) {
                DEVICE_INFO.ip_address = cachedPublicIP;
                // Restore to sessionStorage for page-navigation cache
                try { sessionStorage.setItem('_publicIP', cachedPublicIP); } catch (e2) {}
            }
        } catch (e) {}

        try {
            if (typeof webapis !== 'undefined') {
                // 1. MAC Address from network API
                if (webapis.network) {
                    try {
                        var mac = webapis.network.getMac();
                        if (mac) {
                            DEVICE_INFO.mac_address = mac;
                        }
                    } catch (e) {
                    }

                    // 2. IP Address + DNS + Connection Type from active network connection
                    try {
                        var networkType = webapis.network.getActiveConnectionType();
                        // Connection type: 0=DISCONNECTED, 1=WIFI, 2=CELLULAR, 3=ETHERNET
                        var connNames = { 0: "Disconnected", 1: "WiFi", 2: "Cellular", 3: "Ethernet" };
                        DEVICE_INFO.connection_type = connNames[networkType] || "Unknown";

                        if (networkType > 0) {
                            var ip = webapis.network.getIp(networkType);
                            // Only use webapis IP if we don't already have a public IP
                            if (ip && this._isPrivateIP(DEVICE_INFO.ip_address)) {
                                // Store private IP as fallback only — will be overridden by public IP
                                DEVICE_INFO.ip_address = ip;
                            }

                            // DNS
                            try {
                                var dns = webapis.network.getDns(networkType);
                                if (dns) DEVICE_INFO.dns = dns;
                            } catch (e) {}

                            // Gateway
                            try {
                                var gw = webapis.network.getGateway(networkType);
                                if (gw) DEVICE_INFO.gateway_ip = gw;
                            } catch (e) {}
                        }
                    } catch (e) {
                    }
                }

                // 3. Device DUID (unique device ID) as serial number
                if (webapis.productinfo) {
                    try {
                        var duid = webapis.productinfo.getDuid();
                        if (duid) {
                            var initDeviceId = this._applyDeviceId(duid);
                        }
                    } catch (e) {
                    }

                    // 4. Device model name
                    try {
                        var model = webapis.productinfo.getModel ? webapis.productinfo.getModel() : null;
                        if (model && model !== "NA") {
                            DEVICE_INFO.device_name = model;
                            DEVICE_INFO.model = model;
                        }
                    } catch (e) {
                    }

                    // 5. Firmware / software version (for devdets)
                    try {
                        var firmware = webapis.productinfo.getFirmware ? webapis.productinfo.getFirmware() : null;
                        if (firmware) {
                            DEVICE_INFO.softwareversion = firmware;
                        }
                    } catch (e) {
                    }
                }

                // 6. Brand is always Samsung on Tizen TV
                DEVICE_INFO.brand = "Samsung";
            }

            // 7. Screen resolution (works on both TV and emulator)
            try {
                DEVICE_INFO.screen_resolution = screen.width + "x" + screen.height;
            } catch (e) {}

            // Sync DEFAULT_HEADERS with detected device info
            if (DEVICE_INFO.mac_address) {
                DEFAULT_HEADERS["devmac"] = DEVICE_INFO.mac_address;
            }
            if (DEVICE_INFO.devslno) {
                this._applyDeviceId(DEVICE_INFO.devslno);
            }


            // 8. Tizen version (async) - uses tizen.systeminfo BUILD property
            if (typeof tizen !== 'undefined' && tizen.systeminfo) {
                try {
                    tizen.systeminfo.getPropertyValue("BUILD", function (build) {
                        if (build && build.buildVersion) {
                            DEVICE_INFO.tizenversion = build.buildVersion;
                            // Also use as softwareversion fallback
                            if (!DEVICE_INFO.softwareversion) {
                                DEVICE_INFO.softwareversion = build.buildVersion;
                            }
                        }
                    }, function () { });
                } catch (e) { }
            }
        } catch (e) {
            // Emulator/Browser defaults
            DEVICE_INFO.brand = "Browser";
            DEVICE_INFO.model = "Emulator";
            DEVICE_INFO.connection_type = "Browser";
            DEVICE_INFO.softwareversion = navigator.userAgent.match(/Chrome\/(\S+)/) ?
                "Chrome " + navigator.userAgent.match(/Chrome\/(\S+)/)[1] : navigator.appVersion || "";
            try {
                DEVICE_INFO.screen_resolution = screen.width + "x" + screen.height;
            } catch (e2) {}
        }

        // Ensure a resolved/cached device id is available as early as possible.
        this.getDeviceId();

        // Always detect public IP (webapis returns private 192.168.x.x)
        this._detectPublicIP();
    },

    getDeviceId: function () {
        // Priority 1: Real Samsung TV / Emulator DUID via Tizen WebAPIs
        // getDuid() returns the real hardware ID on TV and the emulator's fixed ID on simulator.
        // We trust whatever getDuid() returns — do NOT filter or replace it.
        try {
            if (typeof webapis !== 'undefined' && webapis.productinfo && webapis.productinfo.getDuid) {
                var duid = webapis.productinfo.getDuid();
                if (duid && typeof duid === 'string' && duid.trim()) {
                    var resolvedDuid = this._applyDeviceId(duid);
                    return resolvedDuid;
                }
            }
        } catch (e) {
        }

        // Priority 2: Tizen system capability (real TV only, getDuid missed)
        try {
            if (typeof tizen !== 'undefined' && tizen.systeminfo && tizen.systeminfo.getCapability) {
                var tizenId = tizen.systeminfo.getCapability("http://tizen.org/system/tizenid");
                if (tizenId && typeof tizenId === 'string' && tizenId.trim()) {
                    var resolvedTizenId = this._applyDeviceId(tizenId);
                    return resolvedTizenId;
                }
            }
        } catch (e2) {
        }

        // Priority 3: Use already-cached devslno from initializeDeviceInfo
        if (DEVICE_INFO.devslno) {
            return DEVICE_INFO.devslno;
        }

        // Priority 3.5: Use previously resolved real device id from storage.
        try {
            var storedId = sessionStorage.getItem('_resolvedDeviceId') || localStorage.getItem('_resolvedDeviceId');
            if (storedId && String(storedId).trim()) {
                return this._applyDeviceId(storedId);
            }
        } catch (e5) {}

        // Priority 4: Pure browser session (no Tizen APIs at all) — generate per-session ID
        // This only runs in a desktop browser, never on the real TV or emulator.
        var cached;
        try { cached = sessionStorage.getItem('_dynamicDeviceId'); } catch (e3) {}
        if (cached) return cached;

        var seed = ['WEB', Date.now(), Math.random().toString(36).slice(2, 10),
            (typeof screen !== 'undefined' ? screen.width + 'x' + screen.height : 'na'),
            (typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '')
        ].join('|');
        var hash = 0;
        for (var ci = 0; ci < seed.length; ci++) { hash = ((hash << 5) - hash) + seed.charCodeAt(ci); hash |= 0; }
        var browserId = 'WEB-' + Math.abs(hash).toString(36).toUpperCase() + '-' + Date.now().toString(36).toUpperCase();
        try { sessionStorage.setItem('_dynamicDeviceId', browserId); } catch (e4) {}
        return browserId;
    },

    getDeviceIdLabel: function () {
        var deviceId = this.getDeviceId();
        return deviceId || "Not available";
    },

    /**
     * Check if an IP address is private/local (not routable on internet)
     */
    _isPrivateIP: function (ip) {
        if (!ip) return true;
        // RFC 1918 private ranges, loopback, link-local, CGNAT
        return /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[0-2]\d)\.|0\.)/.test(ip);
    },

    // Promise that resolves when public IP is available
    _publicIPPromise: null,

    /**
     * Detect public IP via external API
     * Always overrides private IP from webapis.network.getIp()
     * Caches result in sessionStorage for instant use on subsequent pages
     */
    _detectPublicIP: function () {
        var self = this;

        // Check if network changed by comparing cached local IP with current local IP
        var currentLocalIP = DEVICE_INFO.ip_address || "";
        var cachedLocalIP = sessionStorage.getItem('_lastLocalIP') || localStorage.getItem('_lastLocalIP') || "";
        var networkChanged = (currentLocalIP && cachedLocalIP && currentLocalIP !== cachedLocalIP);
        
        if (networkChanged) {
            try { sessionStorage.removeItem('_publicIP'); } catch (e) {}
            try { localStorage.removeItem('_publicIP'); } catch (e) {}
        }
        
        // Cache current local IP for next detection
        try { sessionStorage.setItem('_lastLocalIP', currentLocalIP); } catch (e) {}
        try { localStorage.setItem('_lastLocalIP', currentLocalIP); } catch (e) {}

        // If we already have a public IP from localStorage, skip external detection
        if (!this._isPrivateIP(DEVICE_INFO.ip_address)) {
            this._publicIPPromise = Promise.resolve(true);
            return;
        }

        // On real Samsung TV builds, external IP services are frequently blocked and can throw URL scheme errors.
        // Keep local IP (office/home LAN IP) and avoid noisy failing requests.
        if (IS_TIZEN_TV) {
            this._publicIPPromise = Promise.resolve(false);
            return;
        }

        var services = [
            'https://api.ipify.org?format=json',
            'https://api64.ipify.org?format=json',
            'http://api.ipify.org?format=json',
            'http://api64.ipify.org?format=json'
        ];

        this._publicIPPromise = new Promise(function (resolve) {
            function tryService(i) {
                if (i >= services.length) {
                    resolve(false);
                    return;
                }
                // 2-second timeout per service (runs in background, doesn't block API calls)
                var controller = null;
                var timeoutId = null;
                try {
                    controller = new AbortController();
                    timeoutId = setTimeout(function () { controller.abort(); }, 2000);
                } catch (e) { controller = null; }

                var fetchOpts = { method: 'GET' };
                if (controller) fetchOpts.signal = controller.signal;

                fetch(services[i], fetchOpts)
                    .then(function (r) {
                        if (timeoutId) clearTimeout(timeoutId);
                        return r.json();
                    })
                    .then(function (data) {
                        if (data && data.ip && !self._isPrivateIP(data.ip)) {
                            DEVICE_INFO.ip_address = data.ip;
                            try { sessionStorage.setItem('_publicIP', data.ip); } catch (e) {}
                            try { localStorage.setItem('_publicIP', data.ip); } catch (e) {}
                            resolve(true);
                        } else {
                            tryService(i + 1);
                        }
                    })
                    .catch(function () {
                        if (timeoutId) clearTimeout(timeoutId);
                        tryService(i + 1);
                    });
            }
            tryService(0);
        });
    },

    /**
     * Wait for public IP to be available (use before first API call)
     * Resolves immediately if public IP is already set
     * @param {number} timeoutMs - Max wait time (default 3000ms)
     */
    ensurePublicIP: function (timeoutMs) {
        var self = this;
        if (!this._isPrivateIP(DEVICE_INFO.ip_address)) {
            return Promise.resolve(true);
        }
        if (!this._publicIPPromise) {
            return Promise.resolve(false);
        }
        // Race: IP detection vs timeout
        return Promise.race([
            this._publicIPPromise,
            new Promise(function (resolve) {
                setTimeout(function () {
                    resolve(false);
                }, timeoutMs || 3000);
            })
        ]);
    },

    getDeviceInfo: function () {
        if (!DEVICE_INFO.devslno) {
            this.getDeviceId();
        }
        // Guard: if IP is still private, try sessionStorage then localStorage cache
        if (this._isPrivateIP(DEVICE_INFO.ip_address)) {
            try {
                var cached = sessionStorage.getItem('_publicIP') || localStorage.getItem('_publicIP');
                if (cached && !this._isPrivateIP(cached)) {
                    DEVICE_INFO.ip_address = cached;
                }
            } catch (e) {}
        }
        return DEVICE_INFO;
    },

    /**
     * Get device details object for API payloads
     * Passes ALL device info collected from Samsung TV APIs
     */
    getDevDets: function () {
        var resolvedId = this.getDeviceId();
        // Ensure public IP is used (same guard as getDeviceInfo)
        if (this._isPrivateIP(DEVICE_INFO.ip_address)) {
            try {
                var cached = sessionStorage.getItem('_publicIP') || localStorage.getItem('_publicIP');
                if (cached && !this._isPrivateIP(cached)) {
                    DEVICE_INFO.ip_address = cached;
                }
            } catch (e) {}
        }
        return {
            brand: DEVICE_INFO.brand || "",
            model: DEVICE_INFO.model || DEVICE_INFO.device_name || "",
            mac: DEVICE_INFO.mac_address || "",
            softwareversion: DEVICE_INFO.softwareversion || "",
            tizenversion: DEVICE_INFO.tizenversion || "",
            connection_type: DEVICE_INFO.connection_type || "",
            ip_address: DEVICE_INFO.ip_address || "",
            ipv6: DEVICE_INFO.ipv6 || "",
            dns: DEVICE_INFO.dns || "",
            gateway_ip: DEVICE_INFO.gateway_ip || "",
            screen_resolution: DEVICE_INFO.screen_resolution || "",
            deviceID: resolvedId || ""
        };
    },

    /**
     * Get IPv6 address from Samsung Tizen WebAPI
     * @returns {string} IPv6 address or empty string
     */
    getIPv6: function () {
        // Return cached IPv6 from detectIPv6() — webapis.network has NO getIpv6() method
        return DEVICE_INFO.ipv6 || "";
    },

    /**
     * Helper: Validate IPv6 address string
     */
    _isValidIPv6: function (addr) {
        if (!addr) return false;
        var str = String(addr).trim();
        if (str === '' || str === 'undefined' || str === 'null') return false;
        if (str.indexOf(':') === -1) return false;
        if (str === '::' || str === '::0' || str === '0::0' || str === '::1') return false;

        var lower = str.toLowerCase();

        // Reject documentation/test prefix (RFC 3849) - this is often a static placeholder in emulators.
        if (lower.indexOf('2001:db8') === 0) return false;

        // Reject local-only IPv6 ranges for this UI field (we want a routable, dynamic network IPv6).
        if (lower.indexOf('fe80:') === 0) return false; // Link-local
        if (lower.indexOf('fc') === 0 || lower.indexOf('fd') === 0) return false; // ULA

        var cleaned = str.replace(/:/g, '').replace(/0/g, '');
        return cleaned !== '';
    },

    /**
     * Extract IPv6 from a Tizen network info object
     */
    _extractIPv6FromNetwork: function (network) {
        if (!network) return null;
        if (network.ipv6Address) {
            var raw = network.ipv6Address;
            if (typeof raw === 'object' && raw.length !== undefined) {
                for (var i = 0; i < raw.length; i++) {
                    if (this._isValidIPv6(raw[i])) return String(raw[i]).trim();
                }
            } else if (this._isValidIPv6(raw)) {
                return String(raw).trim();
            }
        }
        if (network.ipAddress && this._isValidIPv6(network.ipAddress)) {
            return String(network.ipAddress).trim();
        }
        return null;
    },

    /**
     * Full async IPv6 detection with caching.
     * Tries: tizen.systeminfo -> webapis.network -> external APIs
     * Caches result in DEVICE_INFO.ipv6
     * @returns {Promise<string>} IPv6 address or "Not Available"
     */
    detectIPv6: function () {
        var self = this;

        // Return cached if already detected (in-memory)
        if (DEVICE_INFO.ipv6 && self._isValidIPv6(DEVICE_INFO.ipv6)) {
            return Promise.resolve(DEVICE_INFO.ipv6);
        }

        // Check localStorage/sessionStorage cache — avoids 6+ external API calls per page
        try {
            var cachedIPv6 = sessionStorage.getItem('_cachedIPv6') || localStorage.getItem('_cachedIPv6');
            if (cachedIPv6 && self._isValidIPv6(cachedIPv6)) {
                DEVICE_INFO.ipv6 = cachedIPv6;
                return Promise.resolve(cachedIPv6);
            }
        } catch (e) {}

        return new Promise(function (resolve) {
            var found = false;

            function done(addr) {
                if (found) return;
                found = true;
                var result = self._isValidIPv6(addr) ? String(addr).trim() : "";
                // Cache in storage so next page navigation skips all external APIs
                if (result) {
                    try { sessionStorage.setItem('_cachedIPv6', result); } catch (e) {}
                    try { localStorage.setItem('_cachedIPv6', result); } catch (e) {}
                }
                DEVICE_INFO.ipv6 = result;
                resolve(result);
            }

            // Safety timeout - resolve after 12s no matter what
            setTimeout(function () { done(""); }, 12000);

            // Step 1: Try tizen.systeminfo (most reliable on real TV)
            // Samsung docs confirm: webapis.network has NO getIpv6() method.
            // The ONLY way to get IPv6 on Samsung TV is via tizen.systeminfo
            function trySystemInfo() {
                if (typeof tizen === 'undefined' || !tizen.systeminfo) {
                    console.error("[DeviceInfo] Step 1: tizen.systeminfo not available, skip to Step 2");
                    tryWebRTC();
                    return;
                }
                console.error("[DeviceInfo] Step 1: Trying tizen.systeminfo...");

                var networkTypes = ["WIFI_NETWORK", "ETHERNET_NETWORK"];
                try {
                    if (typeof webapis !== 'undefined' && webapis.network) {
                        var connType = webapis.network.getActiveConnectionType();
                        if (connType === 3) networkTypes = ["ETHERNET_NETWORK", "WIFI_NETWORK"];
                    }
                } catch (e) { }

                var idx = 0;
                function nextProp() {
                    if (found || idx >= networkTypes.length) {
                        if (!found) tryWebRTC();
                        return;
                    }
                    var prop = networkTypes[idx++];
                    try {
                        tizen.systeminfo.getPropertyValue(prop,
                            function (network) {
                                if (found) return;
                                var addr = self._extractIPv6FromNetwork(network);
                                if (addr) { done(addr); } else { nextProp(); }
                            },
                            function () { if (!found) nextProp(); }
                        );
                    } catch (e) { nextProp(); }
                }
                nextProp();
            }

            // Step 2: WebRTC-based local IPv6 detection (browser/emulator)
            function tryWebRTC() {
                if (found) return;
                var RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
                if (!RTCPeer) {
                    console.error("[DeviceInfo] WebRTC not available, trying external APIs");
                    tryExternalAPIs();
                    return;
                }

                try {
                    var pc = new RTCPeer({
                        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                    });
                    var bestIPv6 = null;

                    var rtcDone = false;
                    pc.createDataChannel('');
                    pc.createOffer().then(function (offer) {
                        return pc.setLocalDescription(offer);
                    }).catch(function () {
                        if (rtcDone) return;
                        rtcDone = true;
                        try { pc.close(); } catch (e) { }
                        tryExternalAPIs();
                    });

                    // Timeout for WebRTC gathering
                    var rtcTimeout = setTimeout(function () {
                        if (rtcDone) return;
                        rtcDone = true;
                        try { pc.close(); } catch (e) { }
                        if (bestIPv6 && self._isValidIPv6(bestIPv6)) {
                            console.error("[DeviceInfo] WebRTC found IPv6:", bestIPv6);
                            done(bestIPv6);
                        } else {
                            console.error("[DeviceInfo] WebRTC no IPv6 found, trying external APIs");
                            tryExternalAPIs();
                        }
                    }, 3000);

                    pc.onicecandidate = function (event) {
                        if (found || rtcDone) return;

                        if (!event.candidate) {
                            // ICE gathering complete
                            rtcDone = true;
                            clearTimeout(rtcTimeout);
                            try { pc.close(); } catch (e) { }
                            if (bestIPv6 && self._isValidIPv6(bestIPv6)) {
                                console.error("[DeviceInfo] WebRTC found IPv6:", bestIPv6);
                                done(bestIPv6);
                            } else {
                                tryExternalAPIs();
                            }
                            return;
                        }

                        var candidate = event.candidate.candidate;
                        if (!candidate) return;

                        // Parse IP from ICE candidate string
                        // Format: "candidate:... typ host/srflx/relay ..."
                        var parts = candidate.split(' ');
                        if (parts.length >= 5) {
                            var addr = parts[4];
                            if (self._isValidIPv6(addr)) {
                                // Prefer: global unicast (2/3) > ULA (fd) > link-local (fe80)
                                if (!bestIPv6 ||
                                    (addr.charAt(0) >= '2' && addr.charAt(0) <= '3' && !(bestIPv6.charAt(0) >= '2' && bestIPv6.charAt(0) <= '3')) ||
                                    (addr.substring(0, 2).toLowerCase() === 'fd' && bestIPv6.substring(0, 4).toLowerCase() === 'fe80')) {
                                    bestIPv6 = addr;
                                }
                            }
                        }
                    };
                } catch (e) {
                    console.error("[DeviceInfo] WebRTC error:", e);
                    tryExternalAPIs();
                }
            }

            // Step 3: External API fallback (fetch + XHR + JSONP)
            function tryExternalAPIs() {
                if (found) return;
                console.error("[DeviceInfo] Step 3: Trying external APIs for IPv6...");

                var services = [
                    { url: 'https://api64.ipify.org?format=json', type: 'json' },
                    { url: 'https://api6.ipify.org?format=json', type: 'json' },
                    { url: 'https://v6.ident.me/', type: 'text' },
                    { url: 'https://ipv6.icanhazip.com', type: 'text' }
                ];

                function tryFetch(i) {
                    if (found || i >= services.length) {
                        if (!found) tryXHR(0);
                        return;
                    }
                    var svc = services[i];
                    var timeout = new Promise(function (_, rej) {
                        setTimeout(function () { rej(new Error('Timeout')); }, 5000);
                    });
                    Promise.race([fetch(svc.url), timeout])
                        .then(function (r) { return svc.type === 'json' ? r.json() : r.text(); })
                        .then(function (data) {
                            if (found) return;
                            var ip = svc.type === 'json' ? (data.ip || data.IPv6 || data.IP || "") : String(data).trim();
                            console.error("[DeviceInfo] fetch " + svc.url + " =>", ip);
                            if (self._isValidIPv6(ip)) { done(ip); } else { tryFetch(i + 1); }
                        })
                        .catch(function (err) {
                            console.error("[DeviceInfo] fetch " + svc.url + " failed:", err.message || err);
                            if (!found) tryFetch(i + 1);
                        });
                }

                // XHR fallback - some Tizen versions handle XHR differently than fetch
                function tryXHR(i) {
                    if (found || i >= services.length) {
                        if (!found) tryJSONP();
                        return;
                    }
                    var svc = services[i];
                    try {
                        var xhr = new XMLHttpRequest();
                        xhr.open('GET', svc.url, true);
                        xhr.timeout = 5000;
                        xhr.onload = function () {
                            if (found) return;
                            try {
                                var ip = '';
                                if (svc.type === 'json') {
                                    var data = JSON.parse(xhr.responseText);
                                    ip = data.ip || data.IPv6 || data.IP || '';
                                } else {
                                    ip = xhr.responseText.trim();
                                }
                                console.error("[DeviceInfo] XHR " + svc.url + " =>", ip);
                                if (self._isValidIPv6(ip)) { done(ip); } else { tryXHR(i + 1); }
                            } catch (e) { tryXHR(i + 1); }
                        };
                        xhr.onerror = function () { if (!found) tryXHR(i + 1); };
                        xhr.ontimeout = function () { if (!found) tryXHR(i + 1); };
                        xhr.send();
                    } catch (e) { tryXHR(i + 1); }
                }

                // JSONP ultimate fallback - bypasses ALL CORS/fetch restrictions
                function tryJSONP() {
                    if (found) return;
                    console.error("[DeviceInfo] Trying JSONP fallback for IPv6...");
                    var cbName = '_ipv6cb_' + Date.now();
                    var jpDone = false;
                    window[cbName] = function (data) {
                        if (jpDone || found) return;
                        jpDone = true;
                        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
                        var ip = (data && (data.ip || data.IP)) || '';
                        console.error("[DeviceInfo] JSONP returned:", ip);
                        if (self._isValidIPv6(ip)) { done(ip); } else { done(""); }
                    };
                    var script = document.createElement('script');
                    script.src = 'https://api64.ipify.org?format=jsonp&callback=' + cbName;
                    script.onerror = function () {
                        if (jpDone || found) return;
                        jpDone = true;
                        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
                        console.error("[DeviceInfo] JSONP failed");
                        done("");
                    };
                    setTimeout(function () {
                        if (!jpDone && !found) {
                            jpDone = true;
                            try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
                            done("");
                        }
                    }, 5000);
                    (document.head || document.documentElement).appendChild(script);
                }

                tryFetch(0);
            }

            // Start detection chain
            trySystemInfo();
        });
    }
};

// ==========================================
// AUTH API (UNCHANGED - DO NOT MODIFY)
// ==========================================
const AuthAPI = {
    requestOTP: async function (mobile) {
        const device = DeviceInfo.getDeviceInfo();
        const ipv6 = DeviceInfo.getIPv6();
        const payload = {
            mobile: mobile,
            mac_address: device.mac_address,
            device_name: device.device_name,
            ip_address: device.ip_address,
            device_type: device.device_type,
            devslno: device.devslno,
            ipv6: ipv6 || "",
            getuserdet: "",
            devdets: DeviceInfo.getDevDets(),
            app_package: APP_ID
        };
        return await apiCall(API_ENDPOINTS.LOGIN, payload);
    },

    addMacAddress: async function (mobile) {
        const device = DeviceInfo.getDeviceInfo();
        const ipv6 = DeviceInfo.getIPv6();
        const payload = {
            mobile: mobile,
            mac_address: device.mac_address,
            device_name: device.device_name,
            ip_address: device.ip_address,
            device_type: device.device_type,
            devslno: device.devslno,
            ipv6: ipv6 || "",
            devdets: DeviceInfo.getDevDets(),
            app_package: APP_ID
        };
        return await apiCall(API_ENDPOINTS.ADD_MACADDRESS, payload);
    },

    verifyOTP: async function (mobile, otpcode) {
        const device = DeviceInfo.getDeviceInfo();
        const ipv6 = DeviceInfo.getIPv6();
        const payload = {
            mobile: mobile,
            otpcode: otpcode,
            mac_address: device.mac_address,
            device_type: device.device_type,
            device_id: DeviceInfo.getDeviceId(),
            devslno: DeviceInfo.getDeviceId(),
            ip_address: device.ip_address,
            ipv6_address: ipv6,
            getuserdet: "",
            devdets: DeviceInfo.getDevDets(),
            app_package: APP_ID
        };

        const response = await apiCall(API_ENDPOINTS.LOGIN, payload);

        if (response && response.status && Number(response.status.err_code) === 0) {
            _authDebugLog('verifyOTP success - writing session', response);
            this.setSession(response);
        } else {
            _authDebugLog('verifyOTP returned non-success', response);
        }
        return response;
    },

    resendOTP: async function (mobile) {
        const payload = {
            mobile: mobile
        };

        return await apiCall(API_ENDPOINTS.LOGIN_OTP, payload);
    },

    setSession: function (response) {
        // Extract user data from response.body[0] and save it
        if (response && response.body && response.body.length > 0) {
            var userData = response.body[0];

            // GUARD: Only save if response has actual user data (userid field)
            // The verify OTP response only has {otpcode, msg} — must NOT overwrite real user data
            if (!userData.userid) {
                return;
            }

            // Flatten mobile/email from custdet to top level if not already present
            // Login API returns: { userid: "xxx", custdet: [{ mobile: "...", email: "..." }] }
            if (!userData.mobile && userData.custdet && userData.custdet.length > 0) {
                userData.mobile = userData.custdet[0].mobile || "";
                userData.email = userData.email || userData.custdet[0].email || "";
            }

            var userJson = JSON.stringify(userData);
            _authDebugLog('Persisting session user', userData);
            try {
                localStorage.setItem("bbnl_user", userJson);
                // Keep a backup copy to survive storage corruption on HOME relaunch
                localStorage.setItem("bbnl_user_backup", userJson);
                localStorage.setItem("hasLoggedInOnce", "true");
            } catch (quotaErr) {
                // localStorage full — clear non-login caches to make space, then retry
                CacheManager.clearAll();
                try {
                    localStorage.setItem("bbnl_user", userJson);
                    localStorage.setItem("bbnl_user_backup", userJson);
                    localStorage.setItem("hasLoggedInOnce", "true");
                } catch (retryErr) {
                    // Last resort — clear everything except login keys, then retry
                    var savedFlag = localStorage.getItem("hasLoggedInOnce");
                    var savedBackup = localStorage.getItem("bbnl_user_backup");
                    localStorage.clear();
                    if (savedFlag) localStorage.setItem("hasLoggedInOnce", savedFlag);
                    if (savedBackup) localStorage.setItem("bbnl_user_backup", savedBackup);
                    localStorage.setItem("bbnl_user", userJson);
                    localStorage.setItem("hasLoggedInOnce", "true");
                }
            }
        } else {
            console.error("[AuthAPI] Invalid response structure for setSession:", response);
            _authDebugLog('setSession skipped because response had no userid payload', response);
        }
    },

    getUserData: function () {
        const data = localStorage.getItem("bbnl_user");
        const backup = localStorage.getItem("bbnl_user_backup");
        let user = null;

        _authDebugLog('getUserData called', {
            hasPrimary: !!data,
            hasBackup: !!backup,
            hasLoggedInOnce: localStorage.getItem('hasLoggedInOnce')
        });

        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (parsed && parsed.userid) user = parsed;
                else _authDebugLog('Primary user invalid/missing userid', parsed);
            } catch (e) {
                console.error("[AuthAPI] Error parsing user data:", e);
                _authDebugLog('Primary user JSON parse failed', String(e && e.message || e));
            }
        }

        if (!user && backup) {
            try {
                const recovered = JSON.parse(backup);
                if (recovered && recovered.userid) user = recovered;
                else _authDebugLog('Backup user invalid/missing userid', recovered);
            } catch (e2) {
                console.error("[AuthAPI] Error parsing backup user data:", e2);
                _authDebugLog('Backup user JSON parse failed', String(e2 && e2.message || e2));
            }
        }

        if (user) {
            try {
                const userJson = JSON.stringify(user);
                if (localStorage.getItem("bbnl_user") !== userJson) localStorage.setItem("bbnl_user", userJson);
                if (localStorage.getItem("bbnl_user_backup") !== userJson) localStorage.setItem("bbnl_user_backup", userJson);
                if (localStorage.getItem("hasLoggedInOnce") !== "true") localStorage.setItem("hasLoggedInOnce", "true");
            } catch (syncErr) {}
            return user;
        }

        _authDebugLog('getUserData returned null after checking primary and backup');
        return null;
    },

    isAuthenticated: function () {
        var user = this.getUserData();
        return !!(user && user.userid);
    },

    logout: async function () {
        // Call server logout API first
        var user = this.getUserData();
        var device = DeviceInfo.getDeviceInfo();

        // If no user session, skip server call - just do local cleanup
        if (!user || !user.userid) {
            sessionStorage.clear();
            CacheManager.clear();
            return;
        }

        var userid = user.userid;
        var mobile = user.mobile || "";

        var ipv6 = DeviceInfo.getIPv6();
        var payload = {
            userid: userid,
            mobile: mobile,
            mac_address: device.mac_address,
            device_name: device.device_name,
            ip_address: device.ip_address,
            device_type: device.device_type,
            devslno: device.devslno,
            ipv6: ipv6
        };


        try {
            await apiCall(API_ENDPOINTS.USER_LOGOUT, payload);
        } catch (e) {
        }

        // Clear caches but keep bbnl_user (TV stays registered to this user)
        sessionStorage.clear();

        // Clear all cached data (channels, categories, languages, expiry)
        CacheManager.clear();

        // Stop background subscription refresh on logout
        ChannelsAPI.stopBackgroundRefresh();
    },

    requireAuth: function () {
        if (!this.isAuthenticated()) {
            window.location.href = "login.html";
        }
    }
};

function repairPersistentAuthSession() {
    try {
        var primaryRaw = localStorage.getItem('bbnl_user');
        var backupRaw = localStorage.getItem('bbnl_user_backup');
        var hasLoggedInOnce = localStorage.getItem('hasLoggedInOnce');

        var primaryUser = null;
        var backupUser = null;

        _authDebugLog('repairPersistentAuthSession snapshot', {
            hasPrimary: !!primaryRaw,
            hasBackup: !!backupRaw,
            hasLoggedInOnce: hasLoggedInOnce
        });

        if (primaryRaw) {
            try {
                var parsedPrimary = JSON.parse(primaryRaw);
                if (parsedPrimary && parsedPrimary.userid) primaryUser = parsedPrimary;
            } catch (e1) {}
        }

        if (backupRaw) {
            try {
                var parsedBackup = JSON.parse(backupRaw);
                if (parsedBackup && parsedBackup.userid) backupUser = parsedBackup;
            } catch (e2) {}
        }

        var resolvedUser = primaryUser || backupUser;
        if (!resolvedUser) return;

        var resolvedJson = JSON.stringify(resolvedUser);
        if (!primaryUser || primaryRaw !== resolvedJson) {
            localStorage.setItem('bbnl_user', resolvedJson);
            _authDebugLog('repairPersistentAuthSession wrote primary from resolved user');
        }
        if (!backupUser || backupRaw !== resolvedJson) {
            localStorage.setItem('bbnl_user_backup', resolvedJson);
            _authDebugLog('repairPersistentAuthSession wrote backup from resolved user');
        }
        if (hasLoggedInOnce !== 'true') {
            localStorage.setItem('hasLoggedInOnce', 'true');
            _authDebugLog('repairPersistentAuthSession repaired hasLoggedInOnce');
        }
    } catch (e) {}
}

repairPersistentAuthSession();

// ==========================================
// CHANNELS API (FIXED)
// ==========================================
const ChannelsAPI = {
    _fetchInProgress: null,
    _expiryMergeInProgress: false,
    _backgroundRefreshTimer: null,
    _backgroundRefreshInProgress: false,
    _BACKGROUND_REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes for subscription updates

    /**
     * Start background refresh scheduler (called once at app startup)
     * Silently refreshes subscription data every 5 minutes without interrupting user
     */
    startBackgroundRefresh: function() {
        if (this._backgroundRefreshTimer) return; // Already started
        
        var self = this;
        // Initial refresh after 5 minutes
        this._backgroundRefreshTimer = setInterval(function() {
            self._performBackgroundRefresh();
        }, this._BACKGROUND_REFRESH_INTERVAL);
    },

    /**
     * Stop background refresh (called on logout or app exit)
     */
    stopBackgroundRefresh: function() {
        if (this._backgroundRefreshTimer) {
            clearInterval(this._backgroundRefreshTimer);
            this._backgroundRefreshTimer = null;
        }
    },

    /**
     * Perform background refresh of subscription data
     * Uses silent mode - no UI interruption
     */
    _performBackgroundRefresh: async function() {
        // Prevent concurrent refresh requests
        if (this._backgroundRefreshInProgress) return;
        
        // Skip if user is not authenticated
        if (!AuthAPI.isAuthenticated()) {
            this.stopBackgroundRefresh();
            return;
        }

        this._backgroundRefreshInProgress = true;
        
        try {
            const user = AuthAPI.getUserData();
            const device = DeviceInfo.getDeviceInfo();

            if (!user || !user.userid) {
                this._backgroundRefreshInProgress = false;
                return;
            }

            const payload = {
                userid: user.userid,
                mobile: user.mobile || "",
                ip_address: device.ip_address,
                mac_address: device.mac_address
            };

            // Silent background fetch - no console logs, no UI updates
            const response = await apiCall(
                API_ENDPOINTS.CHANNEL_LIST,
                payload,
                {
                    "devmac": device.mac_address,
                    "devslno": device.devslno
                }
            );

            // Parse and validate response
            if (response && !response.error) {
                var errCode = response && response.status ? Number(response.status.err_code) : -1;
                if (errCode === 0) {
                    let channels = [];
                    
                    // Extract channels from response (same logic as _fetchAndCacheChannels)
                    if (response && response.body && Array.isArray(response.body)) {
                        if (response.body.length > 0 && response.body[0].channels && Array.isArray(response.body[0].channels)) {
                            channels = response.body[0].channels;
                        } else if (response.body.length > 0 && (response.body[0].chid || response.body[0].chtitle || response.body[0].streamlink)) {
                            channels = response.body;
                        }
                    }

                    // Update cache with fresh subscription data
                    if (channels.length > 0) {
                        invalidateImageUrlCaches();
                        CacheManager.set(CacheManager.KEYS.CHANNEL_LIST, channels, CacheManager.EXPIRY.CHANNEL_LIST);
                        // Silent mode - no console output on TV for performance
                    }
                }
            }
        } catch (e) {
            // Silent fail - background refresh is non-critical
        }

        this._backgroundRefreshInProgress = false;
    },

    /**
     * Force immediate refresh of subscription data
     * Called when returning from Payment page or manually
     */
    forceSubscriptionRefresh: async function() {
        // Use existing fetch if in progress
        if (this._backgroundRefreshInProgress) {
            return;
        }

        // Perform immediate background refresh without deleting existing cache first.
        // This keeps stale data as fallback if network fails during refresh.
        return this._performBackgroundRefresh();
    },

    getCategories: async function () {
        // Check cache first (also accept expired cache — call-once strategy)
        var cachedCategories = CacheManager.get(CacheManager.KEYS.CATEGORIES);
        if (!cachedCategories || cachedCategories.length === 0) {
            cachedCategories = CacheManager.get(CacheManager.KEYS.CATEGORIES, true);
        }
        if (cachedCategories && cachedCategories.length > 0) {
            return cachedCategories;
        }

        return await this._fetchAndCacheCategories();
    },

    _fetchAndCacheCategories: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        var userid = _getSessionUser().userid;
        var mobile = _getSessionUser().mobile;

        if (user) {
            if (user.userid) userid = user.userid;
            if (user.mobile) mobile = user.mobile;
        }

        const payload = {
            userid: userid,
            mobile: mobile,
            ip_address: device.ip_address,
            mac_address: device.mac_address
        };


        var response = await apiCall(
            API_ENDPOINTS.CHANNEL_CATEGORIES,
            payload,
            {
                "devmac": device.mac_address,
                "devslno": device.devslno
            }
        );

        // Handle error responses
        if (response && response.error) {
            console.error("[ChannelsAPI] Error getting categories:", response);
            var staleCache = CacheManager.get(CacheManager.KEYS.CATEGORIES, true);
            return staleCache || [];
        }

        // Handle array-wrapped response
        if (Array.isArray(response) && response.length > 0 && (response[0].body || response[0].categories)) {
            response = response[0];
        }

        var categories = [];

        // Normalize Nested Response
        if (response && response.body && Array.isArray(response.body)) {
            if (response.body.length > 0 && response.body[0].categories) {
                categories = response.body[0].categories;
            } else {
                categories = response.body;
            }
        } else if (Array.isArray(response)) {
            categories = response;
        } else if (response && response.categories) {
            categories = response.categories;
        }

        // Cache the categories
        if (categories.length > 0) {
            CacheManager.set(CacheManager.KEYS.CATEGORIES, categories, CacheManager.EXPIRY.CATEGORIES);
        }

        return categories;
    },

    getChannelData: async function (options = {}) {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Extract userid and mobile with proper fallback
        var userid = _getSessionUser().userid;
        var mobile = _getSessionUser().mobile;

        if (user) {
            if (user.userid) userid = user.userid;
            if (user.mobile) mobile = user.mobile;
        }


        // ==========================================
        // CALL-ONCE STRATEGY
        // Channel Data API is called ONCE after login.
        // Data is cached in localStorage and reused for ALL subsequent calls.
        // No background refresh — data stays until explicit logout clears cache.
        // Also check stale cache (ignoreExpiry) for relaunch scenarios.
        // ==========================================

        var cachedChannels = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST);

        // Also accept expired cache — channel data is call-once, expiry is irrelevant
        if (!cachedChannels || cachedChannels.length === 0) {
            cachedChannels = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true);
        }

        // ── CACHE HIT: Return cached data immediately (NO background refresh) ──
        if (cachedChannels && cachedChannels.length > 0) {

            // One-time expiry merge (non-blocking, deduped) — only if no expiry data yet
            var hasExpiry = cachedChannels.some(function (ch) {
                return ch.expirydate && String(ch.expirydate).trim() !== "";
            });
            if (!hasExpiry && !this._expiryMergeInProgress) {
                this._expiryMergeInProgress = true;
                var self = this;
                this._mergeExpiryData(cachedChannels, userid, mobile, device).then(function (merged) {
                    self._expiryMergeInProgress = false;
                    if (merged && merged.length > 0) {
                        CacheManager.set(CacheManager.KEYS.CHANNEL_LIST, merged, CacheManager.EXPIRY.CHANNEL_LIST);
                    }
                }).catch(function () { self._expiryMergeInProgress = false; });
            }

            return this._applyFilters(cachedChannels, options);
        }

        // ── CACHE MISS: Fetch once from API (deduplicate in-flight requests) ──

        if (this._fetchInProgress) {
            var channels = await this._fetchInProgress;
            return this._applyFilters(channels || [], options);
        }

        var self = this;
        this._fetchInProgress = this._fetchAndCacheChannels(userid, mobile, device).finally(function () {
            self._fetchInProgress = null;
        });

        var channels = await this._fetchInProgress;
        return this._applyFilters(channels || [], options);
    },

    /**
     * Internal: Fetch channels from API and cache them
     */
    _fetchAndCacheChannels: async function (userid, mobile, device) {
        try {
            const payload = {
            userid: userid,
            mobile: mobile,
            ip_address: device.ip_address,
            mac_address: device.mac_address
            };

            // payload logging removed for TV performance

            const response = await apiCall(
            API_ENDPOINTS.CHANNEL_LIST,
            payload,
            {
                "devmac": device.mac_address,
                "devslno": device.devslno
            }
            );

            // response logging removed for TV performance

        // Handle error responses
        if (response && response.error) {
            console.error("[ChannelsAPI] Error:", response.message);
            // Try to return stale cache if available
            var staleCache = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true);
            if (staleCache) {
                return staleCache;
            }
            return [];
        }

        // Check for API error status (use loose comparison — API may return err_code as string "0" or number 0)
        var errCode = response && response.status ? Number(response.status.err_code) : -1;
        if (errCode !== 0) {
            console.error("[ChannelsAPI] API Error (err_code=" + (response && response.status ? response.status.err_code : 'N/A') + "):", response && response.status ? response.status.err_msg : 'Unknown');
            // Try to return stale cache if available
            var errorStaleCache = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true);
            if (errorStaleCache && errorStaleCache.length > 0) {
                return errorStaleCache;
            }
            return [];
        }

        // Parse channels from response
        let channels = [];

        if (response && response.body && Array.isArray(response.body)) {
            if (response.body.length > 0 && response.body[0].channels && Array.isArray(response.body[0].channels)) {
                channels = response.body[0].channels;
            }
            else if (response.body.length > 0 && (response.body[0].chid || response.body[0].chtitle || response.body[0].streamlink)) {
                channels = response.body;
            }
            else if (response.body.length > 0) {
                // Fallback: treat body array as channels if items have any channel-like fields
                var firstItem = response.body[0];
                if (firstItem && typeof firstItem === 'object' && (firstItem.channelno || firstItem.urno || firstItem.ch_no)) {
                    channels = response.body;
                }
            }

        } else if (response && response.body && typeof response.body === 'object' && !Array.isArray(response.body)) {
            // Handle case where body is an object with a channels array inside
            if (response.body.channels && Array.isArray(response.body.channels)) {
                channels = response.body.channels;
            }
        }

        // Cache the fresh data
        if (channels.length > 0) {
            // Fresh API data should replace stale cached image URL references.
            invalidateImageUrlCaches();
            CacheManager.set(CacheManager.KEYS.CHANNEL_LIST, channels, CacheManager.EXPIRY.CHANNEL_LIST);

            // ==========================================
            // DEBUG: Log exactly what logo URLs API returned
            // ==========================================
            var logoHostStats = {};
            var sampleLogos = [];
            for (var dci = 0; dci < Math.min(5, channels.length); dci++) {
                var dch = channels[dci] || {};
                var dlogo = dch.chlogo || dch.chnllogo || dch.logo_url || dch.channel_logo || dch.channellogo || dch.logo || dch.image || dch.img || '';
                if (dlogo) sampleLogos.push('[' + (dch.chtitle || dch.chname || 'Channel') + '] ' + dlogo);
            }
            
            for (var lci = 0; lci < channels.length; lci++) {
                var lch = channels[lci] || {};
                var llogo = lch.chlogo || lch.chnllogo || lch.logo_url || lch.channel_logo || lch.channellogo || lch.logo || lch.image || lch.img || '';
                if (llogo) {
                    // Extract host from URL
                    var hostMatch = llogo.match(/https?:\/\/([^\/]+)/i);
                    var host = hostMatch ? hostMatch[1] : 'relative-path';
                    logoHostStats[host] = (logoHostStats[host] || 0) + 1;
                }
            }
            
            Object.keys(logoHostStats).forEach(function(host) {
                var count = logoHostStats[host];
                var isOldHost = /^124\.40\.244\.211|localhost|127\.0\.0\.1/i.test(host);
                var marker = isOldHost ? "⚠️ OLD HOST" : "✅";
            });
            
            // Prime channel logos once so they do not reload on page switches.
            var channelImages = [];
            for (var ci = 0; ci < channels.length; ci++) {
                var ch = channels[ci] || {};
                var logo = ch.chlogo || ch.chnllogo || ch.logo_url || ch.channel_logo || ch.channellogo || ch.logo || ch.image || ch.img || '';
                if (logo) channelImages.push(logo);
            }
            _preloadImageBatch(channelImages);
        }

        // Merge expiry dates from expiringchnl_list API (NON-BLOCKING)
        // Expiry API can be slow — don't block channel return
        if (channels.length > 0) {
            this._mergeExpiryData(channels, userid, mobile, device).then(function (merged) {
                if (merged && merged.length > 0) {
                    CacheManager.set(CacheManager.KEYS.CHANNEL_LIST, merged, CacheManager.EXPIRY.CHANNEL_LIST);
                }
            }).catch(function () {});
        }

        return channels;
        } catch (error) {
            // ✅ FIX: Handle AbortError silently - return stale cache instead of empty
            if (error && error.name === 'AbortError') {
                var staleCache = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true);
                if (staleCache && staleCache.length > 0) {
                    return staleCache;  // Preserve existing UI data
                }
            }
            throw error;  // Re-throw non-abort errors
        }
    },

    /**
     * Fetch expiring channels and merge expirydate into main channel list
     */
    _mergeExpiryData: async function (channels, userid, mobile, device) {
        try {
            // Check cache first
            var cachedExpiring = CacheManager.get(CacheManager.KEYS.EXPIRING_CHANNELS);
            var expiringList = null;

            if (cachedExpiring) {
                expiringList = cachedExpiring;
            } else {
                var payload = {
                    userid: userid,
                    mobile: mobile,
                    mac_address: device.mac_address,
                    ip_address: device.ip_address
                };

                var timeoutPromise = new Promise(function (_, reject) {
                    setTimeout(function () { reject(new Error("Expiry API timeout")); }, 6000);
                });
                var response = await Promise.race([
                    apiCall(API_ENDPOINTS.CHANNEL_EXPIRING, payload, { "devmac": device.mac_address, "devslno": device.devslno }),
                    timeoutPromise
                ]);

                if (response && response.body && Array.isArray(response.body) &&
                    response.body.length > 0 && response.body[0].channels) {
                    expiringList = response.body[0].channels;
                    CacheManager.set(CacheManager.KEYS.EXPIRING_CHANNELS, expiringList, CacheManager.EXPIRY.EXPIRING_CHANNELS);
                }
            }

            if (!expiringList || expiringList.length === 0) return channels;

            // Build lookup map by chid for fast merge
            var expiryMap = {};
            for (var i = 0; i < expiringList.length; i++) {
                var exp = expiringList[i];
                if (exp.chid && exp.expirydate) {
                    expiryMap[exp.chid] = exp.expirydate;
                }
            }

            // Merge expirydate into main channel list
            var mergedCount = 0;
            for (var j = 0; j < channels.length; j++) {
                var chid = channels[j].chid || channels[j].channelid;
                if (chid && expiryMap[chid]) {
                    channels[j].expirydate = expiryMap[chid];
                    mergedCount++;
                }
            }

        } catch (e) {
        }

        return channels;
    },

    /**
     * Internal: Apply filters to channel list
     */
    _applyFilters: function (channels, options) {
        if (!channels || channels.length === 0) return [];

        var filteredChannels = channels;

        // Filter by grid (category)
        if (options.grid && options.grid !== "") {
            filteredChannels = filteredChannels.filter(function (ch) {
                return ch.grid === options.grid;
            });
        }

        // Filter by langid (language)
        if (options.langid && options.langid !== "") {
            filteredChannels = filteredChannels.filter(function (ch) {
                return ch.langid === options.langid;
            });
        }

        // Filter by search term (matches channel name AND channel number/LCN)
        if (options.search && options.search !== "") {
            var searchLower = options.search.toLowerCase();
            var searchIsNumber = /^\d+$/.test(options.search.trim());
            filteredChannels = filteredChannels.filter(function (ch) {
                var title = (ch.chtitle || "").toLowerCase();
                var chNo = String(ch.channelno || ch.urno || ch.chno || ch.ch_no || "");
                if (searchIsNumber) {
                    return chNo.indexOf(options.search.trim()) === 0 || title.indexOf(searchLower) !== -1;
                }
                return title.indexOf(searchLower) !== -1;
            });
        }

        // Filter by subscribed status (only show channels user is subscribed to)
        if (options.subscribed && options.subscribed !== "") {
            filteredChannels = filteredChannels.filter(function (ch) {
                return ch.subscribed === "yes" ||
                    ch.subscribed === "1" ||
                    ch.subscribed === "true" ||
                    ch.subscribed === true ||
                    ch.subscribed === 1;
            });
        }

        return filteredChannels;
    },

    getCategoryList: async function () {
        return this.getCategories();
    },

    getChannelList: async function (options = {}) {
        return this.getChannelData(options);
    },

    // NEW: Search channels by keyword
    searchChannels: async function (searchTerm, options = {}) {
        return this.getChannelData({ ...options, search: searchTerm });
    },

    // NEW: Get channels by category/grid
    getChannelsByCategory: async function (gridId, options = {}) {
        return this.getChannelData({ ...options, grid: gridId });
    },

    // NEW: Get channels by language
    getChannelsByLanguage: async function (langId, options = {}) {
        return this.getChannelData({ ...options, langid: langId });
    },

    getLanguageList: async function () {
        // Check cache first (also accept expired cache — call-once strategy)
        var cachedLanguages = CacheManager.get(CacheManager.KEYS.LANGUAGES);
        if (!cachedLanguages || cachedLanguages.length === 0) {
            cachedLanguages = CacheManager.get(CacheManager.KEYS.LANGUAGES, true);
        }
        if (cachedLanguages && cachedLanguages.length > 0) {
            return cachedLanguages;
        }

        return await this._fetchAndCacheLanguages();
    },

    _fetchAndCacheLanguages: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        var userid = _getSessionUser().userid;
        var mobile = _getSessionUser().mobile;

        if (user) {
            if (user.userid) userid = user.userid;
            if (user.mobile) mobile = user.mobile;
        }

        const payload = {
            userid: userid,
            mobile: mobile,
            ip_address: device.ip_address,
            mac_address: device.mac_address
        };


        var response = await apiCall(API_ENDPOINTS.CHANNEL_LANGUAGELIST, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno
        });

        // Handle error responses
        if (response && response.error) {
            console.error("[ChannelsAPI] Error getting languages:", response);
            var staleCache = CacheManager.get(CacheManager.KEYS.LANGUAGES, true);
            return staleCache || [];
        }

        // Handle array-wrapped response
        if (Array.isArray(response) && response.length > 0 && (response[0].body || response[0].languages)) {
            response = response[0];
        }

        var languages = [];

        // Normalize Nested Response
        if (response && response.body && Array.isArray(response.body)) {
            if (response.body.length > 0 && response.body[0].languages) {
                languages = response.body[0].languages;
            } else {
                languages = response.body;
            }
        } else if (Array.isArray(response)) {
            languages = response;
        } else if (response && response.languages) {
            languages = response.languages;
        }

        // Cache the languages
        if (languages.length > 0) {
            // Fresh API data should replace stale cached image URL references.
            invalidateImageUrlCaches();
            CacheManager.set(CacheManager.KEYS.LANGUAGES, languages, CacheManager.EXPIRY.LANGUAGES);

            // Prime language logos once so they do not reload on page switches.
            var languageImages = [];
            for (var li = 0; li < languages.length; li++) {
                var lang = languages[li] || {};
                var lLogo = lang.langlogo || lang.chnllanglogo || lang.logo_url || lang.logo || lang.image || lang.img || '';
                if (lLogo) languageImages.push(lLogo);
            }
            _preloadImageBatch(languageImages);
        }

        return languages;
    },

    getSubscribedChannels: function (channels) {
        if (!Array.isArray(channels)) return [];
        // Check for multiple possible "subscribed" values from API
        return channels.filter(function (ch) {
            return ch.subscribed === "yes" ||
                ch.subscribed === "1" ||
                ch.subscribed === "true" ||
                ch.subscribed === true ||
                ch.subscribed === 1;
        });
    },

    getChannelsByGrid: function (channels, gridId) {
        if (!Array.isArray(channels)) return [];
        return channels.filter(ch => ch.grid == gridId);
    },

    getStreamUrl: function (channel) {
        return channel ? (channel.streamlink || channel.channel_url) : null;
    },

    playChannel: function (channel, category) {
        const url = this.getStreamUrl(channel);
        if (url) {
            // [Safety Fix] Mark interior navigation to prevent exit on visibilitychange.
            window.__BBNL_NAVIGATING = true;

            // Save as last played channel for quick resume
            CacheManager.setLastChannel(channel);

            // Store category for zapping (CH+/CH-) if provided
            if (category) {
                var normalizedCategory = String(category || '').trim().toLowerCase();
                if (normalizedCategory === 'all' || normalizedCategory === 'all channels') {
                    // "All" means no filter; keep session clean to avoid langid=all empty results on return.
                    sessionStorage.removeItem('selectedLanguageId');
                    sessionStorage.removeItem('selectedLanguageName');
                } else {
                    sessionStorage.setItem('selectedLanguageId', category);
                    // Also normalize known fixed category IDs.
                    if (normalizedCategory === 'subs') {
                        sessionStorage.setItem('selectedLanguageName', 'Subscribed');
                    }
                }
            }

            // Store the current page as referrer for back navigation
            sessionStorage.setItem('playerReferrer', window.location.href);

            const data = encodeURIComponent(JSON.stringify(channel));
            window.location.href = `player.html?data=${data}`;
        } else {
            console.error("[ChannelsAPI] No stream URL for channel:", channel.chtitle || channel.channel_name || "unknown");
        }
    }
};

// ==========================================
// ADS API - SAMSUNG TV READY
// ==========================================
// ✅ Tested and working on real Samsung TV (Tizen)
// ✅ Returns 5 ads from BBNL server
// ✅ Auto-detects TV vs Browser environment
// ✅ No CORS issues on Samsung TV
// ==========================================
const AdsAPI = {
    _iptvAdsCache: {},

    /**
     * Get IPTV Ads from server
     *
     * Endpoint: http://124.40.244.211/netmon/cabletvapis/iptvads
     * Method: POST
     *
     * Request Payload:
     * - userid: User ID (from session or default)
     * - mobile: Mobile number (from session or default)
     * - adclient: "fofi" (fixed value)
     * - srctype: "image" or "video"
     * - displayarea: "homepage" or "chnllist"
     * - displaytype: "multiple" or "" (single)
     *
     * Response Format:
     * {
     *   "body": [
     *     {"adpath": "http://124.40.244.211/netmon/Cabletvapis/adimage/hdquality.jpg"},
     *     {"adpath": "http://124.40.244.211/netmon/Cabletvapis/adimage/sports.jpg"}
     *   ],
     *   "status": {
     *     "err_code": 0,
     *     "err_msg": "Advertisement Available"
     *   }
     * }
     *
     * @param {Object} options - Ad request parameters
     * @param {String} options.adclient - Ad client ID (default: "fofi")
     * @param {String} options.srctype - Source type: "image" or "video" (default: "image")
     * @param {String} options.displayarea - Display area: "homepage" or "chnllist" (default: "homepage")
     * @param {String} options.displaytype - Display type: "multiple" or "" (default: "multiple")
     * @returns {Promise<Array>} Array of ad objects with adpath property, or empty array on error
     *
     * Usage Examples:
     *   AdsAPI.getHomeAds()  // Get homepage image ads
     *   AdsAPI.getIPTVAds({ srctype: 'video' })  // Get video ads
     *   AdsAPI.getIPTVAds({ displayarea: 'chnllist' })  // Get channel list ads
     */
    getIPTVAds: async function (options = {}) {
        var cacheKey = [options.adclient || 'fofi', options.srctype || 'image', options.displayarea || 'homepage', options.displaytype || 'multiple'].join('|');

        if (this._iptvAdsCache[cacheKey]) {
            return this._iptvAdsCache[cacheKey];
        }

        try {
            var cachedAds = sessionStorage.getItem('_iptv_ads_' + cacheKey);
            if (cachedAds) {
                this._iptvAdsCache[cacheKey] = JSON.parse(cachedAds);
                return this._iptvAdsCache[cacheKey];
            }
        } catch (e) {}

        const user = AuthAPI.getUserData();

        // Debug: Log user data to see what fields exist

        // Extract userid and mobile with robust field name detection
        // The API response might use different field names
        var userid = _getSessionUser().userid;
        var mobile = _getSessionUser().mobile;

        if (user) {
            // Try multiple possible field names for userid
            if (user.userid) userid = user.userid;
            else if (user.userId) userid = user.userId;
            else if (user.id) userid = user.id;
            else if (user.username) userid = user.username;

            // Try multiple possible field names for mobile
            if (user.mobile) mobile = user.mobile;
            else if (user.phone) mobile = user.phone;
            else if (user.phoneNumber) mobile = user.phoneNumber;
            else if (user.userphone) mobile = user.userphone;

        } else {
        }

        // Build payload - ONLY 6 fields in body (matching API documentation)
        const payload = {
            userid: userid,
            mobile: mobile,
            adclient: options.adclient || "fofi",
            srctype: options.srctype || "image",
            displayarea: options.displayarea || "homepage",
            displaytype: options.displaytype || "multiple"
        };

        // ads payload logging removed for TV performance

        try {
            // Use exact DEFAULT_HEADERS that work on Samsung TV and in Postman
            const response = await fetch(API_ENDPOINTS.IPTV_ADS, {
                method: "POST",
                headers: DEFAULT_HEADERS,
                body: JSON.stringify(payload)
            });

            // Check HTTP response status
            if (!response.ok) {
                return [];
            }

            // Parse JSON response
            const data = await response.json();

            // Validate response structure
            if (!data) {
                return [];
            }

            // Check API status - err_code 0 = success (use Number() for type safety)
            if (data.status) {
                if (Number(data.status.err_code) === 0) {
                } else {
                    return [];
                }
            } else {
            }

            // Extract ads from response body
            if (data.body && Array.isArray(data.body)) {
                const adCount = data.body.length;

                if (adCount > 0) {

                    // Log ad URLs for debugging (helpful on Samsung TV)
                    data.body.forEach(function (ad, index) {
                        if (ad.adpath) {
                        }
                    });

                    this._iptvAdsCache[cacheKey] = data.body;
                    try { sessionStorage.setItem('_iptv_ads_' + cacheKey, JSON.stringify(data.body)); } catch (e) {}

                    return data.body;
                } else {
                    return [];
                }
            } else {
                return [];
            }

        } catch (error) {
            console.error("[AdsAPI] ❌ Exception occurred:", error.message);
            console.error("[AdsAPI] Error details:", error);

            // Provide helpful debugging info for Samsung TV
            if (error.message.includes('fetch')) {
                console.error("[AdsAPI] 💡 Network error - Check TV internet connection");
            } else if (error.message.includes('JSON')) {
                console.error("[AdsAPI] 💡 Parse error - Server may have returned invalid JSON");
            }

            return [];
        }
    },

    /**
     * Get homepage ads (convenience method)
     * Returns multiple image ads for the homepage banner/slider
     *
     * @returns {Promise<Array>} Array of homepage ad objects
     *
     * Usage:
     *   const ads = await AdsAPI.getHomeAds();
     *   if (ads.length > 0) {
     *     ads.forEach(ad => console.log(ad.adpath));
     *   }
     */
    getHomeAds: async function () {
        return this.getIPTVAds({
            srctype: 'image',
            displayarea: 'homepage',
            displaytype: 'multiple'
        });
    },

    /**
     * Get channel list page ads (convenience method)
     * Returns multiple image ads for the channel list page
     *
     * @returns {Promise<Array>} Array of channel list ad objects
     *
     * Usage:
     *   const ads = await AdsAPI.getChannelListAds();
     */
    getChannelListAds: async function () {
        return this.getIPTVAds({
            srctype: 'image',
            displayarea: 'chnllist',
            displaytype: 'multiple'
        });
    },

    /**
     * Get video ads (convenience method)
     * Returns video ads instead of image ads
     *
     * @returns {Promise<Array>} Array of video ad objects
     *
     * Usage:
     *   const videoAds = await AdsAPI.getVideoAds();
     */
    getVideoAds: async function () {
        return this.getIPTVAds({
            srctype: 'video',
            displayarea: 'homepage',
            displaytype: 'multiple'
        });
    },

    /**
     * Get Stream Ads for player page
     * Shows ads alongside live TV playback
     *
     * Endpoint: /streamAds
     * Method: POST
     *
     * Request Payload:
     * {
     *   "userid": "<from session>",
     *   "mobile": "<from session>",
     *   "ip_address": "<device IP>",
     *   "mac_address": "<device MAC>",
     *   "grid": "3",
     *   "chid": "202"
     * }
     *
     * @param {String} chid - Channel ID for the current stream
     * @param {String} grid - Grid/layout position (default "3")
     * @returns {Promise<Array>} Array of stream ad objects, or empty array on error
     */
    // Session-level cache for stream ads keyed by chid
    _streamAdsCache: {},

    getStreamAds: async function (chid, grid) {
        // Return cached ads for this channel if already fetched this session
        var cacheKey = String(chid || "");
        if (cacheKey && this._streamAdsCache[cacheKey]) {
            return this._streamAdsCache[cacheKey];
        }

        const user = AuthAPI.getUserData();
        var userid = _getSessionUser().userid;
        var mobile = _getSessionUser().mobile;

        if (user) {
            if (user.userid) userid = user.userid;
            else if (user.userId) userid = user.userId;
            else if (user.id) userid = user.id;

            if (user.mobile) mobile = user.mobile;
            else if (user.phone) mobile = user.phone;
        }

        var device = DeviceInfo.getDeviceInfo();

        var payload = {
            userid: userid,
            mobile: mobile,
            ip_address: device.ip_address || DEVICE_INFO.ip_address,
            mac_address: device.mac_address || DEVICE_INFO.mac_address,
            grid: grid || "3",
            chid: chid || ""
        };


        try {
            var response = await apiCall(API_ENDPOINTS.STREAM_ADS, payload);

            if (response && response.status && Number(response.status.err_code) === 0 && response.body && Array.isArray(response.body)) {
                // Cache for this session
                if (cacheKey) this._streamAdsCache[cacheKey] = response.body;
                return response.body;
            }

            // Cache empty result too (prevents re-fetching for channels with no ads)
            if (cacheKey) this._streamAdsCache[cacheKey] = [];
            return [];
        } catch (error) {
            // ✅ FIX: Handle AbortError silently (request was canceled)
            if (error && error.name === 'AbortError') {
                // Silent ignore — don't log, don't clear UI
                return [];
            }
            console.error("[AdsAPI] Stream Ads error:", error.message);
            return [];
        }
    }
};

// ==========================================
// FEEDBACK API
// ==========================================
const FeedbackAPI = {
    /**
     * Submit user feedback to BBNL server
     *
     * @param {Object} feedbackData - Feedback data
     * @param {String} feedbackData.userid - User ID
     * @param {String} feedbackData.mobile - Mobile number
     * @param {String} feedbackData.feedback - Feedback text
     * @param {Number} feedbackData.rating - Rating (1-5)
     * @returns {Promise<Object>} API response
     */
    submitFeedback: async function (feedbackData) {
        const device = DeviceInfo.getDeviceInfo();

        // Backend expects this EXACT format (confirmed from API documentation):
        // Field: rate_count (STRING), NOT rating (NUMBER)
        const payload = {
            userid: feedbackData.userid || _getSessionUser().userid,
            mobile: feedbackData.mobile || _getSessionUser().mobile,
            rate_count: String(feedbackData.rating || 0),  // IMPORTANT: Must be STRING!
            feedback: feedbackData.feedback,
            mac_address: device.mac_address,
            device_name: (device.device_name || "Samsung TV").replace(/_$/, ''),
            device_type: device.device_type || "FOFI_SAMSUNG"
        };


        return await apiCall(API_ENDPOINTS.FEED_BACK, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno
        });
    }
};

// ==========================================
// APP VERSION API
// ==========================================
const AppVersionAPI = {
    _cachedResponse: null, // Session-level cache — API called once per app session

    /**
     * Get app version from BBNL server
     * Cached per session to avoid repeated calls across pages
     *
     * @returns {Promise<Object>} API response with app version
     */
    getAppVersion: async function () {
        // Return cached response if already fetched this session
        if (this._cachedResponse) {
            return this._cachedResponse;
        }

        // Check sessionStorage for cross-page session cache
        try {
            var cached = sessionStorage.getItem('_appVersionResponse');
            if (cached) {
                this._cachedResponse = JSON.parse(cached);
                return this._cachedResponse;
            }
        } catch (e) {}

        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Backend expects this exact format
        const payload = {
            userid: user && user.userid ? user.userid : _getSessionUser().userid,
            mobile: user && user.mobile ? user.mobile : _getSessionUser().mobile,
            ip_address: device.ip_address,
            device_type: "",  // Empty string as per API format
            mac_address: "",  // Empty string as per API format
            device_name: "",  // Empty string as per API format
            app_package: APP_ID
        };


        var response = await apiCall(API_ENDPOINTS.APP_VERSION, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno
        });

        // Cache the response for this session
        if (response && response.status && Number(response.status.err_code) === 0) {
            this._cachedResponse = response;
            try { sessionStorage.setItem('_appVersionResponse', JSON.stringify(response)); } catch (e) {}
        }

        return response;
    }
};

// ==========================================
// FOFITV LOGO API
// ==========================================
const FoFiLogoAPI = {
    _cachedResponse: null,

    getFoFiLogo: async function () {
        if (this._cachedResponse) {
            return this._cachedResponse;
        }

        try {
            var cached = sessionStorage.getItem('_fofi_logo_response');
            if (cached) {
                this._cachedResponse = JSON.parse(cached);
                return this._cachedResponse;
            }
        } catch (e) {}

        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        const payload = {
            userid: user && user.userid ? user.userid : _getSessionUser().userid,
            mobile: user && user.mobile ? user.mobile : _getSessionUser().mobile,
            ip_address: device.ip_address,
            mac_address: device.mac_address,
            app_package: APP_ID
        };

        var response = await apiCall(API_ENDPOINTS.FOFITV_LOGO, payload);
        if (response && !response.error) {
            this._cachedResponse = response;
            try { sessionStorage.setItem('_fofi_logo_response', JSON.stringify(response)); } catch (e) {}
        }
        return response;
    }
};

// ==========================================
// OTT APPS API
// ==========================================
const OTTAppsAPI = {
    _cachedResponse: null,

    /**
     * Get allowed OTT apps from BBNL server
     *
     * @returns {Promise<Object>} API response with apps array
     */
    getAllowedApps: async function () {
        if (this._cachedResponse) {
            return this._cachedResponse;
        }

        try {
            var cached = sessionStorage.getItem('_ott_apps_response');
            if (cached) {
                this._cachedResponse = JSON.parse(cached);
                return this._cachedResponse;
            }
        } catch (e) {}

        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Backend expects this format
        const payload = {
            userid: user && user.userid ? user.userid : _getSessionUser().userid,
            mobile: user && user.mobile ? user.mobile : _getSessionUser().mobile,
            ip_address: device.ip_address,
            mac: device.mac_address
        };


        var response = await apiCall(API_ENDPOINTS.OTT_APPS, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno
        });

        if (response && !response.error) {
            this._cachedResponse = response;
            try { sessionStorage.setItem('_ott_apps_response', JSON.stringify(response)); } catch (e) {}
        }

        return response;
    }
};

// ==========================================
// APP LOCK API
// ==========================================
const AppLockAPI = {
    /**
     * Check app lock status from BBNL server
     *
     * @returns {Promise<Object>} API response with lock status and app info
     */
    checkAppLock: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Backend expects this format
        const payload = {
            userid: user && user.userid ? user.userid : _getSessionUser().userid,
            mobile: user && user.mobile ? user.mobile : _getSessionUser().mobile,
            ip_address: device.ip_address,
            appversion: APP_CURRENT_VERSION
        };


        return await apiCall(API_ENDPOINTS.APP_LOCK, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno
        });
    }
};

// ==========================================
// TRP DATA API
// ==========================================
const TRPDataAPI = {
    /**
     * Send TRP (Television Rating Point) data to BBNL server
     * Used for analytics/viewership tracking
     *
     * Endpoint: /trpdata
     * Method: POST
     *
     * @param {String} chid - Channel ID being watched
     * @returns {Promise<Object>} API response
     */
    sendTRPData: async function (chid) {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        const payload = {
            userid: user && user.userid ? user.userid : _getSessionUser().userid,
            mobile: user && user.mobile ? user.mobile : _getSessionUser().mobile,
            ip_address: device.ip_address,
            chid: chid || ""
        };


        return await apiCall(API_ENDPOINTS.TRP_DATA, payload, {
            userid: payload.userid,
            mobile: payload.mobile,
            chid: chid || ""
        });
    }
};

// ==========================================
// RAISE TICKET API
// ==========================================
const RaiseTicketAPI = {
    /**
     * Raise a support ticket to BBNL server
     *
     * Endpoint: /raiseTicket
     * Method: POST
     *
     * @param {String} comment - Ticket description/comment
     * @returns {Promise<Object>} API response
     */
    raiseTicket: async function (comment) {
        const user = AuthAPI.getUserData();

        const payload = {
            userid: user && user.userid ? user.userid : _getSessionUser().userid,
            mobile: user && user.mobile ? user.mobile : _getSessionUser().mobile,
            comment: comment || ""
        };


        var currentDeviceId = (typeof DeviceInfo !== 'undefined' && DeviceInfo.getDeviceId)
            ? DeviceInfo.getDeviceId()
            : DEVICE_INFO.devslno;

        return await apiCall(API_ENDPOINTS.RAISE_TICKET, payload, {
            "devmac": DEVICE_INFO.mac_address,
            "devslno": currentDeviceId || ""
        });
    }
};

// ==========================================
// ERROR IMAGES API
// ==========================================
const ErrorImagesAPI = {
    _cache: {},
    _STORAGE_KEY: 'bbnl_error_images',

    /**
     * Fetch error images from API and cache them
     */
    fetchErrorImages: async function () {
        try {
            // Load from localStorage first (instant offline fallback)
            this.loadFromCache();

            // If localStorage already has error images, skip API call entirely
            // Error images rarely change — only fetch once, reuse from cache
            if (Object.keys(this._cache).length > 0) {
                return;
            }

            // No cache — fetch from API (one-time call)
            var user = AuthAPI.getUserData();
            var response = await apiCall(API_ENDPOINTS.ERROR_IMAGES, {
                userid: (user && user.userid) || _getSessionUser().userid || "app",
                mobile: (user && user.mobile) || _getSessionUser().mobile || "0000000000"
            });

            if (response && response.status && Number(response.status.err_code) === 0 && response.errImgs) {
                var images = {};
                response.errImgs.forEach(function (item) {
                    var key = Object.keys(item)[0];
                    images[key] = resolveAssetUrl(item[key]);
                });

                this._cache = images;
                try {
                    localStorage.setItem(this._STORAGE_KEY, JSON.stringify(images));
                } catch (e) { }

                _preloadImageBatch(Object.keys(images).map(function (k) { return images[k]; }));

            }
        } catch (e) {
        }
    },

    /**
     * Get error image URL by key
     * @param {string} key - e.g. 'NO_INTERNET_CONNECTION'
     * @returns {string} Image URL or empty string
     */
    getImageUrl: function (key) {
        var cachedUrl = this._cache[key];
        var resolved = getValidatedImageUrl(cachedUrl || "");
        var source = cachedUrl ? "localStorage-cache" : "empty";
        return resolved;
    },

    /**
     * Load error images from localStorage (offline fallback)
     */
    loadFromCache: function () {
        try {
            var stored = localStorage.getItem(this._STORAGE_KEY);
            if (stored) {
                var parsed = JSON.parse(stored) || {};
                var normalized = {};
                Object.keys(parsed).forEach(function (k) {
                    normalized[k] = getValidatedImageUrl(parsed[k]);
                });
                this._cache = normalized;
            }
        } catch (e) { }
    }
};

// ==========================================
// GLOBAL EXPORT
// ==========================================
// Create BBNL_API object and expose it globally
const BBNL_API = {
    // Auth Methods
    requestOTP: AuthAPI.requestOTP.bind(AuthAPI),
    addMacAddress: AuthAPI.addMacAddress.bind(AuthAPI),
    verifyOTP: AuthAPI.verifyOTP.bind(AuthAPI),
    resendOTP: AuthAPI.resendOTP.bind(AuthAPI),
    setSession: AuthAPI.setSession.bind(AuthAPI),
    getUserData: AuthAPI.getUserData.bind(AuthAPI),
    isAuthenticated: AuthAPI.isAuthenticated.bind(AuthAPI),
    logout: AuthAPI.logout.bind(AuthAPI),
    requireAuth: AuthAPI.requireAuth.bind(AuthAPI),

    // Channel Methods
    getCategories: ChannelsAPI.getCategories.bind(ChannelsAPI),
    getChannelData: ChannelsAPI.getChannelData.bind(ChannelsAPI),
    getCategoryList: ChannelsAPI.getCategoryList.bind(ChannelsAPI),
    getChannelList: ChannelsAPI.getChannelList.bind(ChannelsAPI),
    getLanguageList: ChannelsAPI.getLanguageList.bind(ChannelsAPI),
    getSubscribedChannels: ChannelsAPI.getSubscribedChannels.bind(ChannelsAPI),
    getChannelsByGrid: ChannelsAPI.getChannelsByGrid.bind(ChannelsAPI),
    getStreamUrl: ChannelsAPI.getStreamUrl.bind(ChannelsAPI),
    playChannel: ChannelsAPI.playChannel.bind(ChannelsAPI),

    // NEW: Client API Methods
    searchChannels: ChannelsAPI.searchChannels.bind(ChannelsAPI),
    getChannelsByCategory: ChannelsAPI.getChannelsByCategory.bind(ChannelsAPI),
    getChannelsByLanguage: ChannelsAPI.getChannelsByLanguage.bind(ChannelsAPI),

    // Ads Methods (All tested and working on Samsung TV)
    getIPTVAds: AdsAPI.getIPTVAds.bind(AdsAPI),
    getHomeAds: AdsAPI.getHomeAds.bind(AdsAPI),
    getChannelListAds: AdsAPI.getChannelListAds.bind(AdsAPI),
    getVideoAds: AdsAPI.getVideoAds.bind(AdsAPI),

    // Feedback Methods
    submitFeedback: FeedbackAPI.submitFeedback.bind(FeedbackAPI),

    // FoFi Logo Methods
    getFoFiLogo: FoFiLogoAPI.getFoFiLogo.bind(FoFiLogoAPI),

    // App Version Methods
    getAppVersion: AppVersionAPI.getAppVersion.bind(AppVersionAPI),

    // OTT Apps Methods
    getAllowedApps: OTTAppsAPI.getAllowedApps.bind(OTTAppsAPI),

    // App Lock Methods
    checkAppLock: AppLockAPI.checkAppLock.bind(AppLockAPI),

    // TRP Data Methods
    sendTRPData: TRPDataAPI.sendTRPData.bind(TRPDataAPI),

    // Raise Ticket Methods
    raiseTicket: RaiseTicketAPI.raiseTicket.bind(RaiseTicketAPI),

    // Error Images Methods
    errorImages: ErrorImagesAPI,
    getErrorImageUrl: ErrorImagesAPI.getImageUrl.bind(ErrorImagesAPI),
    resolveAssetUrl: resolveAssetUrl,
    getValidatedImageUrl: getValidatedImageUrl,
    setImageSource: setImageSource,
    getImagePlaceholderUrl: getImagePlaceholderUrl,
    invalidateImageUrlCaches: invalidateImageUrlCaches,

    // Global cross-page image cache helpers
    isImageCached: function (url) {
        if (!url) return false;
        var v = getValidatedImageUrl(url);
        return !!(v && _IMAGE_CACHE_MAP[v]);
    },
    markImageCached: function (url) {
        if (!url) return;
        var v = getValidatedImageUrl(url) || url;
        if (v && !_IMAGE_CACHE_MAP[v]) {
            _IMAGE_CACHE_MAP[v] = 1;
            _persistImageCache();
        }
    },
    preloadImage: _preloadImage,
    preloadImageBatch: _preloadImageBatch,

    // ✅ NEW: Image persistence and recovery helpers
    /**
     * Get list of URLs that failed to load (will be retried on demand)
     * Useful for debugging image loading issues
     */
    getFailedImageUrls: function () {
        return Object.keys(_imageFailedUrls);
    },

    /**
     * Get image metadata (status, failure count, last fetch time)
     * Useful for debugging why images don't display
     */
    getImageMetadata: function (url) {
        if (!url) return null;
        var v = getValidatedImageUrl(url);
        return _imageMetadata[v] || null;
    },

    /**
     * Clear persistent image cache (useful for cleanup after major API changes)
     * Does NOT clear localStorage; only clears in-memory maps
     */
    clearImageCache: function () {
        _IMAGE_CACHE_MAP = {};
        _BLOB_CACHE = {};
        _imageFailedUrls = {};
        // Keep _imageMetadata for retry history (don't clear localStorage)
        console.log('[ImageCache] Cleared in-memory image caches');
    },

    /**
     * Force re-fetch of failed images by clearing their failure state
     * Next page load will retry failed images automatically
     */
    retryFailedImages: function () {
        var now = Date.now();
        var failed = Object.keys(_imageFailedUrls);
        if (failed.length === 0) {
            console.log('[ImageCache] No failed images to retry');
            return;
        }
        var eligible = 0;
        failed.forEach(function(url) {
            if (_isRetryCooldownPassed(url, now)) {
                eligible++;
                delete _imageFailedUrls[url];
                var meta = _imageMetadata[url];
                if (meta) {
                    meta.failCount = 0;
                    meta.status = 'pending';
                }
            }
        });
        if (eligible > 0) {
            console.log('[ImageCache] Retrying ' + eligible + ' failed images after cooldown');
        }
        _savePersistentImageMetadata();
    },

    /**
     * Validate image cache integrity across all cached images
     * Runs async and reports validation results
     * Useful to call after app resumes from background
     */
    validateImageCacheIntegrity: _validateImageCacheIntegrity,

    /**
     * Get image cache statistics for debugging
     */
    getImageCacheStats: function () {
        return {
            cachedImageCount: Object.keys(_IMAGE_CACHE_MAP).length,
            blobCacheCount: Object.keys(_BLOB_CACHE).length,
            failedImageCount: Object.keys(_imageFailedUrls).length,
            metadataCount: Object.keys(_imageMetadata).length,
            failedImages: Object.keys(_imageFailedUrls).slice(0, 10)  // First 10 for debugging
        };
    },

    // Device Methods
    initializeDeviceInfo: DeviceInfo.initializeDeviceInfo.bind(DeviceInfo),
    getDeviceInfo: DeviceInfo.getDeviceInfo.bind(DeviceInfo),

    // Cache Methods
    cache: CacheManager,
    clearCache: CacheManager.clearAll.bind(CacheManager),
    getCacheStats: CacheManager.getStats.bind(CacheManager),
    getLastChannel: CacheManager.getLastChannel.bind(CacheManager),

    // Configuration
    API_CONFIG: API_CONFIG,

    // App current version (from config.xml)
    getCurrentVersion: function () { return APP_CURRENT_VERSION; },

    /**
     * Compare two version strings (e.g. "1.0" vs "1.1", "1.0.0" vs "1.1.0")
     * Returns: 1 if serverVersion > appVersion, -1 if less, 0 if equal
     */
    compareVersions: function (serverVersion, appVersion) {
        var sv = String(serverVersion || "0").split(".").map(Number);
        var av = String(appVersion || "0").split(".").map(Number);
        var len = Math.max(sv.length, av.length);
        for (var i = 0; i < len; i++) {
            var s = sv[i] || 0;
            var a = av[i] || 0;
            if (s > a) return 1;
            if (s < a) return -1;
        }
        return 0;
    }
};

// Make it available globally
if (typeof window !== 'undefined') {
    window.BBNL_API = BBNL_API;
    window.AuthAPI = AuthAPI;
    window.ChannelsAPI = ChannelsAPI;
    window.AdsAPI = AdsAPI;
    window.FeedbackAPI = FeedbackAPI;
    window.AppVersionAPI = AppVersionAPI;
    window.OTTAppsAPI = OTTAppsAPI;
    window.AppLockAPI = AppLockAPI;
    window.TRPDataAPI = TRPDataAPI;
    window.RaiseTicketAPI = RaiseTicketAPI;
    window.ErrorImagesAPI = ErrorImagesAPI;
    window.DeviceInfo = DeviceInfo;

    // Service worker removed — does not work on file:// protocol (Samsung TV)
}

// Auto-initialize device info on load
DeviceInfo.initializeDeviceInfo();

// Auto-fetch error images (non-blocking)
ErrorImagesAPI.fetchErrorImages();

// ==========================================
// SAMSUNG TV REMOTE KEY REGISTRATION
// Supports all remote types (Standard, Smart, Premium)
// ==========================================
const RemoteKeys = {
    // All supported remote keys for Samsung Tizen TV
    ALL_KEYS: [
        // Navigation keys (auto-registered but included for completeness)
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return",

        // Number keys (0-9)
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",

        // Media control keys
        "MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop",
        "MediaFastForward", "MediaRewind", "MediaRecord",
        "MediaTrackPrevious", "MediaTrackNext",

        // Channel control keys
        "ChannelUp", "ChannelDown", "ChannelList", "PreviousChannel",

        // Volume keys
        "VolumeUp", "VolumeDown", "VolumeMute",

        // Color buttons (Samsung remotes)
        "ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue",

        // Function keys
        "Menu", "Tools", "Info", "Source", "Exit",
        "Caption", "E-Manual", "3D", "Extra",
        "PictureSize", "Soccer", "Teletext", "MTS",
        "Search", "Guide", "Minus"
    ],

    // Key codes mapping for reference
    KEY_CODES: {
        // Navigation
        ArrowLeft: 37,
        ArrowUp: 38,
        ArrowRight: 39,
        ArrowDown: 40,
        Enter: 13,
        Back: 10009,

        // Numbers
        Num0: 48, Num1: 49, Num2: 50, Num3: 51, Num4: 52,
        Num5: 53, Num6: 54, Num7: 55, Num8: 56, Num9: 57,
        Minus: 189,

        // Volume & Channel
        VolumeUp: 447, VolumeDown: 448, VolumeMute: 449,
        ChannelUp: 427, ChannelDown: 428, ChannelList: 10073,
        PreviousChannel: 10190,

        // Media
        MediaPlayPause: 10252, MediaRewind: 412, MediaFastForward: 417,
        MediaPlay: 415, MediaPause: 19, MediaStop: 413, MediaRecord: 416,
        MediaTrackPrevious: 10232, MediaTrackNext: 10233,

        // Color buttons
        ColorF0Red: 403, ColorF1Green: 404, ColorF2Yellow: 405, ColorF3Blue: 406,

        // Function keys
        Menu: 18, Tools: 10135, Info: 457, Source: 10072, Exit: 10182,
        Caption: 10221, EManual: 10146, ThreeD: 10199, Extra: 10253,
        PictureSize: 10140, Soccer: 10228, Teletext: 10200, MTS: 10195,
        Search: 10225, Guide: 458
    },

    /**
     * Register all remote keys for comprehensive remote support
     * Call this once on page load
     */
    registerAllKeys: function () {
        try {
            if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
                // Get supported keys on this device
                var supportedKeys = tizen.tvinputdevice.getSupportedKeys();
                var supportedKeyNames = supportedKeys.map(function (k) { return k.name; });

                // Filter to only register keys that are supported on this device
                var keysToRegister = this.ALL_KEYS.filter(function (key) {
                    return supportedKeyNames.indexOf(key) !== -1;
                });

                // Register in batch for performance
                if (keysToRegister.length > 0) {
                    tizen.tvinputdevice.registerKeyBatch(keysToRegister);
                }

                return true;
            }
        } catch (e) {
        }
        return false;
    },

    /**
     * Register specific keys (for pages that need only certain keys)
     * @param {Array} keys - Array of key names to register
     */
    registerKeys: function (keys) {
        try {
            if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
                tizen.tvinputdevice.registerKeyBatch(keys);
                return true;
            }
        } catch (e) {
        }
        return false;
    },

    /**
     * Get key code by key name
     * @param {String} keyName - The key name
     * @returns {Number} The key code or -1 if not found
     */
    getKeyCode: function (keyName) {
        try {
            if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
                var key = tizen.tvinputdevice.getKey(keyName);
                return key ? key.code : this.KEY_CODES[keyName] || -1;
            }
        } catch (e) {
            // Fallback to static mapping
        }
        return this.KEY_CODES[keyName] || -1;
    },

    /**
     * Check if a keyCode matches a specific key
     * @param {Number} keyCode - The keyCode from the event
     * @param {String} keyName - The key name to check against
     * @returns {Boolean}
     */
    isKey: function (keyCode, keyName) {
        return keyCode === this.getKeyCode(keyName) || keyCode === this.KEY_CODES[keyName];
    }
};

// Expose RemoteKeys globally
if (typeof window !== 'undefined') {
    window.RemoteKeys = RemoteKeys;
}


// ==========================================
// APP LIFECYCLE - HOME button handling
// Samsung TV HOME button sends app to background.
// Flow: stop playback → exit app (NO server logout).
// On relaunch: hasLoggedInOnce=true + bbnl_user valid → home.html → FoFi plays after 3s.
// Resume fallback: if exit() fails, redirect to home on resume.
//
// IMPORTANT: Server logout is ONLY done from Settings > Logout (explicit user action).
// HOME button must NOT invalidate the server session — otherwise relaunch
// API calls fail and the user gets stuck on the login page.
//
// IMPORTANT: Page navigation (e.g. login → verify) can
// briefly trigger visibilitychange='hidden' on Tizen WebKit.
// The _isPageUnloading guard prevents exiting during navigation.
// ==========================================
var _isPageUnloading = false;
var _wasBackgrounded = false;

window.addEventListener('pagehide', function () {
    _isPageUnloading = true;
});

window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        // Page restored from BFCache — everything is still intact!
        _isPageUnloading = false;
        _wasBackgrounded = false;
    }
});

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
        // [Critical Stability Fix]
        // On Tizen TVs, moving between pages (Home -> Channels) can briefly trigger
        // visibilityState: 'hidden' BEFORE the new page starts loading. 
        // We MUST skip the exit logic if we are performing an internal navigation.
        if (window.__BBNL_NAVIGATING) {
            console.log("[API] Visibility hidden during navigation - skipping exit.");
            return;
        }

        if (_isPageUnloading) {
            console.log("[API] Page is already unloading - skipping exit.");
            return;
        }

        // Skip exit if user is in the middle of auth flow.
        var _currentPage = window.location.pathname.split('/').pop() || '';
        if (_currentPage === 'login.html' || _currentPage === 'verify.html') {
            return;
        }

        _wasBackgrounded = true;

        // 1. Suspend media playback (preserves decoder state for faster resume)
        // Samsung docs: use suspend() instead of stop()+close() for background
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.suspend();
            }
        } catch (e) {
            // Fallback: stop+close if suspend not supported
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                try { webapis.avplay.stop(); } catch (e2) {}
                try { webapis.avplay.close(); } catch (e2) {}
            }
        }

        // 2. NO server logout here — session must stay alive for relaunch.
        //    Server logout only happens from Settings > Logout (explicit user action).
        //    Sending logout here would invalidate the server session, causing API
        //    failures on relaunch and the user getting stuck on the login page.

        // 3. Exit the Tizen application completely
        //    sessionStorage is automatically cleared when the process dies.
        //    localStorage (hasLoggedInOnce, bbnl_user) persists for relaunch.
        try {
            localStorage.setItem('bbnl_relaunch_pending', '1');
            if (typeof tizen !== 'undefined' && tizen.application) {
                tizen.application.getCurrentApplication().exit();
            }
        } catch (e) {
            console.error("[App] Exit failed:", e);
        }

    } else if (document.visibilityState === 'visible' && _wasBackgrounded) {
        // FALLBACK: App was resumed from background (exit() didn't work on this TV).
        // Redirect to home page so FoFi plays after 3 seconds.
        _wasBackgrounded = false;

        // Stop any lingering playback
        try {
            if (typeof AVPlayer !== 'undefined') AVPlayer.stop();
        } catch (e) {}

        // Clear session flags so home page does full fresh load with FoFi auto-play
        sessionStorage.removeItem('fofi_autoplay_done');
        sessionStorage.removeItem('home_init_done');

        // Redirect to home page (skip if on auth pages — auth check handles those)
        var currentPage = window.location.pathname.split('/').pop() || '';
        var isAuthPage = (currentPage === 'login.html' || currentPage === 'verify.html' || currentPage === 'index.html');
        if (!isAuthPage) {
            window.location.replace('home.html');
        }

    } else if (_isPageUnloading) {
    }
});