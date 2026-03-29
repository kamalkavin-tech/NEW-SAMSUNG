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
        console.log = noop;
        console.warn = noop;
        console.info = noop;
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
    console.warn("[API CONFIG] 🔧 PROXY MODE - Using localhost:3000");
    console.warn("[API CONFIG] ⚠️  Make sure proxy-server.js is running!");
    API_BASE_URL_PROD = "http://localhost:3000";
    API_BASE_URL_IPTV = "http://localhost:3000";
} else {
    // Production mode - Real Samsung TV or direct API access
    if (IS_TIZEN_TV) {
        console.log("[API CONFIG] 📺 SAMSUNG TV MODE - Direct API access");
    } else {
        console.log("[API CONFIG] 🌐 PRODUCTION MODE - Direct API access");
        console.warn("[API CONFIG] ⚠️  CORS errors expected in browser - use proxy-server.js or Tizen emulator");
    }
    // HTTPS endpoint for Samsung TV (HTTP is blocked by proxy on TV)
    // Using secure HTTPS endpoint: https://netmontest.bbnl.in/netmon/cabletvapis/
    API_BASE_URL_PROD = "https://netmontest.bbnl.in/netmon/cabletvapis";
    API_BASE_URL_IPTV = "https://netmontest.bbnl.in/netmon/cabletvapis";
}

// Enhanced logging for debugging
console.log("=".repeat(60));
console.log("[API CONFIG] Environment Detection:");
console.log("[API CONFIG]   - webapis: " + (typeof webapis !== 'undefined' ? "✅ YES" : "❌ NO"));
console.log("[API CONFIG]   - tizen: " + (typeof tizen !== 'undefined' ? "✅ YES" : "❌ NO"));
console.log("[API CONFIG]   - Tizen TV: " + (IS_TIZEN_TV ? "✅ YES" : "❌ NO"));
console.log("[API CONFIG]   - Tizen Emulator: " + (IS_TIZEN_EMULATOR ? "✅ YES" : "❌ NO"));
console.log("[API CONFIG]   - File Protocol: " + (IS_FILE_PROTOCOL ? "✅ YES" : "❌ NO"));
console.log("[API CONFIG]   - Localhost: " + (IS_LOCALHOST ? "✅ YES" : "❌ NO"));
console.log("[API CONFIG]   - Force Proxy: " + (FORCE_PROXY_MODE ? "✅ YES" : "❌ NO"));
console.log("[API CONFIG]   - hostname: " + window.location.hostname);
console.log("[API CONFIG]   - protocol: " + window.location.protocol);
console.log("[API CONFIG] Selected Mode: " + (USE_PROXY ? '🔧 PROXY (localhost:3000)' : '📡 PRODUCTION (Direct)'));
console.log("[API CONFIG] Base URL (Prod): " + API_BASE_URL_PROD);
console.log("[API CONFIG] Base URL (IPTV): " + API_BASE_URL_IPTV);
console.log("[API CONFIG] Ads Endpoint: " + API_BASE_URL_PROD + "/iptvads");
console.log("=".repeat(60));

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
                console.log("[AppPackage] From Tizen API:", APP_PACKAGE, "| Full ID:", APP_ID, "| Version:", APP_CURRENT_VERSION);
                return;
            }
        }
    } catch (e) {
        console.log("[AppPackage] Tizen API not available:", e.message);
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
                console.log("[AppPackage] From config.xml:", APP_PACKAGE, "| Full ID:", APP_ID, "| Version:", APP_CURRENT_VERSION);
                return;
            }
        }
    } catch (e) {
        console.log("[AppPackage] config.xml read failed:", e.message);
    }

    // Fallback
    APP_PACKAGE = "BBNLIPTV";
    APP_ID = "ph3Ha7N8EQ.BBNLIPTV";
    console.log("[AppPackage] Using fallback:", APP_PACKAGE, "| Full ID:", APP_ID);
}

_initAppPackage();

// Dynamic user fallback - reads from logged-in user session in localStorage
// Returns empty strings if no user is logged in
var _sessionUserCache = null;
var _sessionUserCacheTime = 0;

function _getSessionUser() {
    var now = 0;
    try { now = Date.now(); } catch (e) { now = new Date().getTime(); }
    if (_sessionUserCache && (now - _sessionUserCacheTime) < 1000) return _sessionUserCache;
    try {
        var data = localStorage.getItem("bbnl_user");
        if (data) {
            var user = JSON.parse(data);

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
        console.warn('[getValidatedImageUrl] Rejected (malformed):', rawUrl);
        return '';
    }

    var original = String(rawUrl || '').trim();
    var resolved = resolveAssetUrl(original);
    if (_isMalformedImageUrl(resolved)) {
        console.warn('[getValidatedImageUrl] Rejected (malformed after resolve):', resolved);
        return '';
    }

    console.log('[getValidatedImageUrl] Accepted:', resolved);
    // Keep validation permissive for Samsung TV runtime quirks; only block empty/script URLs.
    return resolved;
}

function setImageSource(imgEl, rawUrl, options) {
    console.log('[setImageSource] RAW URL from API:', rawUrl);
    
    var freshUrl = getValidatedImageUrl(rawUrl);
    var finalUrl = freshUrl || '';

    console.log('[setImageSource] FINAL URL to load:', finalUrl);

    if (!imgEl) return finalUrl;

    var prevOnError = imgEl.onerror;

    imgEl.onerror = function () {
        // Strict mode: use only API-provided normalized image URL once.
        console.error('[IMAGE] Failed to load:', finalUrl, 'from raw:', rawUrl);
        if (typeof prevOnError === 'function') {
            try { prevOnError.call(imgEl); } catch (e) {}
        }
    };

    if (finalUrl) {
        imgEl.style.display = '';
        imgEl.setAttribute('crossorigin', 'anonymous');
        
        // For Samsung Tizen TV running from file://, fetch() + blob URL bypasses CORS
        if (window.location.protocol === 'file:' && typeof fetch !== 'undefined') {
            console.log('[setImageSource] Using fetch+blob for file:// protocol (Tizen TV)');
            fetch(finalUrl, { mode: 'cors', credentials: 'omit' })
                .then(function (response) {
                    console.log('[FETCH] Response status:', response.status, 'for', finalUrl);
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.blob();
                })
                .then(function (blob) {
                    console.log('[FETCH] Blob created, size:', blob.size, 'type:', blob.type);
                    var blobUrl = URL.createObjectURL(blob);
                    imgEl.src = blobUrl;
                    console.log('[FETCH] Blob URL set:', blobUrl);
                })
                .catch(function (err) {
                    console.error('[FETCH] Failed to load image:', finalUrl, 'Error:', err.message);
                    if (typeof prevOnError === 'function') {
                        try { prevOnError.call(imgEl); } catch (e) {}
                    }
                });
        } else {
            // Standard direct img.src for http/https protocol apps
            console.log('[setImageSource] Using direct src for http(s) protocol');
            imgEl.setAttribute('src', finalUrl);
        }
    } else {
        console.warn('[setImageSource] No valid URL, calling error handler');
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
                'https://netmontest.bbnl.in/netmon/assets/site_images/',
                'http://netmontest.bbnl.in/netmon/assets/site_images/',
                'https://images.bbnl.in/cabletest/',
                'http://images.bbnl.in/cabletest/',
                'https://netmontest.bbnl.in/netmon/cabletvapis/images/',
                'http://netmontest.bbnl.in/netmon/cabletvapis/images/'
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
                    'https://netmontest.bbnl.in/netmon/assets/site_images/' + fileName,
                    'http://netmontest.bbnl.in/netmon/assets/site_images/' + fileName
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

        console.log("[ImageCache] Performing migration from schema " + current + " to " + IMAGE_CACHE_SCHEMA_VERSION);

        // Remove image-related caches that may contain stale/legacy hosts from old builds.
        var localKeys = [
            'bbnl_error_images',
            'home_fofi_logo_url',
            'home_ads_cache_persistent'
        ];
        localKeys.forEach(function (k) {
            try { localStorage.removeItem(k); console.log("[ImageCache] Cleared: " + k); } catch (e) {}
        });

        var sessionKeys = [
            'home_ads_cache',
            'home_languages_cache',
            'home_channels_cache',
            'home_fofi_logo_url'
        ];
        sessionKeys.forEach(function (k) {
            try { sessionStorage.removeItem(k); console.log("[ImageCache] Cleared: " + k); } catch (e) {}
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
                try { sessionStorage.removeItem(k); console.log("[ImageCache] Cleared: " + k); } catch (e) {}
            });
        } catch (e2) {}

        // CRITICAL: Also clear any image URL maps that may contain old hosts
        try {
            sessionStorage.removeItem('bbnl_image_cache_urls_v1');
            console.log("[ImageCache] Cleared: bbnl_image_cache_urls_v1");
        } catch (e_map) {}

        localStorage.setItem('bbnl_image_cache_schema', IMAGE_CACHE_SCHEMA_VERSION);
        console.log("[ImageCache] Migration complete - all stale image URLs cleared");
    } catch (e3) {
        console.warn("[ImageCache] Migration error:", e3);
    }
}
migrateImageCachesIfNeeded();

function resolveAssetUrl(rawUrl) {
    if (rawUrl === null || rawUrl === undefined) return '';
    var value = String(rawUrl).trim();
    if (!value) return '';

    console.log('[resolveAssetUrl] Input:', value);

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
        console.warn("[resolveAssetUrl] Failed to parse API base URL:", apiBase, e.message);
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
        console.log('[resolveAssetUrl] Output (absolute URL):', value);
        return value;
    }
    if (value.indexOf('//') === 0) {
        var result = ((typeof window !== 'undefined' && window.location && window.location.protocol) ? window.location.protocol : 'https:') + value;
        console.log('[resolveAssetUrl] Output (protocol-relative):', result);
        return result;
    }

    try {
        if (value.charAt(0) === '/' && preferredOrigin) {
            var result = preferredOrigin + value;
            console.log('[resolveAssetUrl] Output (absolute path):', result);
            return result;
        }
        if (apiBase) {
            var result = new URL(value, apiBase + '/').href;
            console.log('[resolveAssetUrl] Output (relative URL):', result);
            return result;
        }
    } catch (e2) {
        console.warn("[resolveAssetUrl] Failed to resolve relative URL:", value, e2.message);
    }

    console.log('[resolveAssetUrl] Output (pass-through):', value);
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
            var jsonStr = JSON.stringify(cacheObject);
            try {
                localStorage.setItem(key, jsonStr);
            } catch (quotaError) {
                // localStorage full — clear expired caches and retry
                console.warn('[CacheManager] Quota exceeded, clearing expired caches...');
                this._clearExpired();
                try {
                    localStorage.setItem(key, jsonStr);
                } catch (retryError) {
                    // Still full — clear all non-login caches and retry once more
                    this.clearAll();
                    localStorage.setItem(key, jsonStr);
                }
            }
            console.log('[CacheManager] ✓ Cached:', key, '| Expires in:', Math.round(expiry / 60000), 'minutes');
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
                        console.log('[CacheManager] Removed expired:', key);
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
            var cached = localStorage.getItem(key);
            if (!cached) {
                console.log('[CacheManager] Cache miss:', key);
                return null;
            }

            var cacheObject = JSON.parse(cached);

            // Check expiry
            var now = this._now();
            if (!ignoreExpiry && cacheObject.expiry && now > cacheObject.expiry) {
                console.log('[CacheManager] Cache expired:', key, '| Expired:', new Date(cacheObject.expiry).toLocaleTimeString());
                return null;
            }

            var age = Math.round((now - cacheObject.timestamp) / 60000);
            console.log('[CacheManager] ✓ Cache hit:', key, '| Age:', age, 'minutes');
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
            console.log('[CacheManager] Removed cache:', key);
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
        console.log('[CacheManager] All caches cleared');
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
        console.log('[CacheManager] Stats:', stats);
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
            'css/style.css', 'css/colors.css', 'css/base/reset.css', 'css/base/responsive.css', 'css/base/variable.css',
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
        try {
            if (!force && this._safeSessionGet(this.FLAGS.ASSETS_PRIMED) === '1') {
                return;
            }
            this._primeInMemoryAssets();
            this._safeSessionSet(this.FLAGS.ASSETS_PRIMED, '1');
            console.log('[AppPerformanceCache] Static assets primed for session');
        } catch (e) {
            console.warn('[AppPerformanceCache] Prime failed:', e.message);
        }
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

function _preloadImage(url) {
    var validatedUrl = getValidatedImageUrl(url);
    if (!validatedUrl) return;
    if (!_isImageUrl(validatedUrl)) return;
    if (_IMAGE_CACHE_MAP[validatedUrl]) return;

    _IMAGE_CACHE_MAP[validatedUrl] = 1;
    _persistImageCache();

    try {
        var img = new Image();
        img.decoding = 'async';
        img.src = validatedUrl;
    } catch (e) {}
}

function _preloadImageBatch(list) {
    if (!Array.isArray(list) || list.length === 0) return;
    for (var i = 0; i < list.length; i++) {
        _preloadImage(list[i]);
    }
}

_hydrateImageCache();

try {
    _preloadImageBatch(Object.keys(_IMAGE_CACHE_MAP));
} catch (e) {}

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

    console.log(`[API] Request: ${url}`, payload);

    // Abort controller with 10-second timeout — prevents hanging requests
    // that accumulate across repeated Home→Relaunch cycles on Samsung TV
    var controller = null;
    var timeoutId = null;
    try {
        controller = new AbortController();
        timeoutId = setTimeout(function () { controller.abort(); }, 10000);
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
        console.log(`[API] Response: ${url}`, data);

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
        var isTimeout = error && error.name === 'AbortError';
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
                console.log("[DeviceInfo] Loaded cached public IP:", cachedPublicIP);
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
                            console.log("[DeviceInfo] MAC Address:", mac);
                        }
                    } catch (e) {
                        console.warn("[DeviceInfo] MAC detection failed:", e);
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
                                console.log("[DeviceInfo] Local IP (fallback):", ip);
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
                        console.warn("[DeviceInfo] IP detection failed:", e);
                    }
                }

                // 3. Device DUID (unique device ID) as serial number
                if (webapis.productinfo) {
                    try {
                        var duid = webapis.productinfo.getDuid();
                        if (duid) {
                            var initDeviceId = this._applyDeviceId(duid);
                            console.log("[DeviceInfo] DUID:", initDeviceId);
                        }
                    } catch (e) {
                        console.warn("[DeviceInfo] DUID detection failed:", e);
                    }

                    // 4. Device model name
                    try {
                        var model = webapis.productinfo.getModel ? webapis.productinfo.getModel() : null;
                        if (model && model !== "NA") {
                            DEVICE_INFO.device_name = model;
                            DEVICE_INFO.model = model;
                            console.log("[DeviceInfo] Model:", model);
                        }
                    } catch (e) {
                        console.warn("[DeviceInfo] Model detection failed:", e);
                    }

                    // 5. Firmware / software version (for devdets)
                    try {
                        var firmware = webapis.productinfo.getFirmware ? webapis.productinfo.getFirmware() : null;
                        if (firmware) {
                            DEVICE_INFO.softwareversion = firmware;
                            console.log("[DeviceInfo] Firmware:", firmware);
                        }
                    } catch (e) {
                        console.warn("[DeviceInfo] Firmware detection failed:", e);
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

            console.log("[DeviceInfo] Initialized:", JSON.stringify(DEVICE_INFO));
            console.log("[DeviceInfo] Headers - devmac:", DEFAULT_HEADERS["devmac"], "devslno:", DEFAULT_HEADERS["devslno"]);

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
            console.warn("[DeviceInfo] Tizen WebAPIs not available, using emulator defaults");
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
                    console.log("[DeviceInfo] Device ID from getDuid():", resolvedDuid);
                    return resolvedDuid;
                }
            }
        } catch (e) {
            console.warn("[DeviceInfo] getDuid() failed:", e);
        }

        // Priority 2: Tizen system capability (real TV only, getDuid missed)
        try {
            if (typeof tizen !== 'undefined' && tizen.systeminfo && tizen.systeminfo.getCapability) {
                var tizenId = tizen.systeminfo.getCapability("http://tizen.org/system/tizenid");
                if (tizenId && typeof tizenId === 'string' && tizenId.trim()) {
                    var resolvedTizenId = this._applyDeviceId(tizenId);
                    console.log("[DeviceInfo] Device ID from tizenid:", resolvedTizenId);
                    return resolvedTizenId;
                }
            }
        } catch (e2) {
            console.warn("[DeviceInfo] tizenid fallback failed:", e2);
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
        console.log("[DeviceInfo] Device ID generated for browser session:", browserId);
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
            console.log("[DeviceInfo] Network changed detected: " + cachedLocalIP + " → " + currentLocalIP + " | Clearing cached public IP");
            try { sessionStorage.removeItem('_publicIP'); } catch (e) {}
            try { localStorage.removeItem('_publicIP'); } catch (e) {}
        }
        
        // Cache current local IP for next detection
        try { sessionStorage.setItem('_lastLocalIP', currentLocalIP); } catch (e) {}
        try { localStorage.setItem('_lastLocalIP', currentLocalIP); } catch (e) {}

        // If we already have a public IP from localStorage, skip external detection
        if (!this._isPrivateIP(DEVICE_INFO.ip_address)) {
            console.log("[DeviceInfo] Public IP already available from cache, skipping detection");
            this._publicIPPromise = Promise.resolve(true);
            return;
        }

        // On real Samsung TV builds, external IP services are frequently blocked and can throw URL scheme errors.
        // Keep local IP (office/home LAN IP) and avoid noisy failing requests.
        if (IS_TIZEN_TV) {
            console.log("[DeviceInfo] Skipping external public IP lookup on Samsung TV; using local IP:", DEVICE_INFO.ip_address);
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
                    console.warn("[DeviceInfo] All public IP services failed - keeping local IP: " + currentLocalIP);
                    console.log("[DeviceInfo] This is normal for office networks behind firewalls. Using local IP: " + DEVICE_INFO.ip_address);
                    resolve(false);
                    return;
                }
                // 5-second timeout per service to prevent hanging
                var controller = null;
                var timeoutId = null;
                try {
                    controller = new AbortController();
                    timeoutId = setTimeout(function () { controller.abort(); }, 5000);
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
                            console.log("[DeviceInfo] Public IP detected:", data.ip);
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
                    console.warn("[DeviceInfo] Public IP detection timed out after", timeoutMs || 3000, "ms");
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
                    console.log("[DeviceInfo] Using cached public IP:", cached);
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

        // Return cached if already detected
        if (DEVICE_INFO.ipv6 && self._isValidIPv6(DEVICE_INFO.ipv6)) {
            return Promise.resolve(DEVICE_INFO.ipv6);
        }

        return new Promise(function (resolve) {
            var found = false;

            function done(addr) {
                if (found) return;
                found = true;
                var result = self._isValidIPv6(addr) ? String(addr).trim() : "";
                DEVICE_INFO.ipv6 = result;
                console.log("[DeviceInfo] IPv6 detected:", result);
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
        console.log("[AuthAPI] Requesting OTP - device:", payload.device_type);
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
        console.log("[AuthAPI] Adding MAC Address...");
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

        console.log("[AuthAPI] Verifying OTP...");
        const response = await apiCall(API_ENDPOINTS.LOGIN, payload);

        if (response && response.status && Number(response.status.err_code) === 0) {
            this.setSession(response);
        }
        return response;
    },

    resendOTP: async function (mobile) {
        const payload = {
            mobile: mobile
        };

        console.log("[AuthAPI] Resending OTP...");
        return await apiCall(API_ENDPOINTS.LOGIN_OTP, payload);
    },

    setSession: function (response) {
        // Extract user data from response.body[0] and save it
        if (response && response.body && response.body.length > 0) {
            var userData = response.body[0];

            // GUARD: Only save if response has actual user data (userid field)
            // The verify OTP response only has {otpcode, msg} — must NOT overwrite real user data
            if (!userData.userid) {
                console.log("[AuthAPI] Response has no userid — keeping existing session data");
                return;
            }

            // Flatten mobile/email from custdet to top level if not already present
            // Login API returns: { userid: "xxx", custdet: [{ mobile: "...", email: "..." }] }
            if (!userData.mobile && userData.custdet && userData.custdet.length > 0) {
                userData.mobile = userData.custdet[0].mobile || "";
                userData.email = userData.email || userData.custdet[0].email || "";
            }

            var userJson = JSON.stringify(userData);
            try {
                localStorage.setItem("bbnl_user", userJson);
            } catch (quotaErr) {
                // localStorage full — clear non-login caches to make space, then retry
                console.warn("[AuthAPI] localStorage full — clearing caches to save session");
                CacheManager.clearAll();
                try {
                    localStorage.setItem("bbnl_user", userJson);
                } catch (retryErr) {
                    // Last resort — clear everything except hasLoggedInOnce, then retry
                    var savedFlag = localStorage.getItem("hasLoggedInOnce");
                    localStorage.clear();
                    if (savedFlag) localStorage.setItem("hasLoggedInOnce", savedFlag);
                    localStorage.setItem("bbnl_user", userJson);
                }
            }
            console.log("[AuthAPI] Session saved successfully.");
        } else {
            console.error("[AuthAPI] Invalid response structure for setSession:", response);
        }
    },

    getUserData: function () {
        const data = localStorage.getItem("bbnl_user");
        if (data) {
            try {
                return JSON.parse(data);
            } catch (e) {
                console.error("[AuthAPI] Error parsing user data:", e);
                return null;
            }
        }
        return null;
    },

    isAuthenticated: function () {
        return !!localStorage.getItem("bbnl_user");
    },

    logout: async function () {
        // Call server logout API first
        var user = this.getUserData();
        var device = DeviceInfo.getDeviceInfo();

        // If no user session, skip server call - just do local cleanup
        if (!user || !user.userid) {
            console.log("[AuthAPI] No user session - skipping server logout, doing local cleanup only");
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

        console.log("[AuthAPI] Logging out...");

        try {
            await apiCall(API_ENDPOINTS.USER_LOGOUT, payload);
            console.log("[AuthAPI] Logout successful.");
        } catch (e) {
            console.warn("[AuthAPI] Logout API error (proceeding with local cleanup):", e.message);
        }

        // Clear caches but keep bbnl_user (TV stays registered to this user)
        sessionStorage.clear();

        // Clear all cached data (channels, categories, languages, expiry)
        CacheManager.clear();

        console.log("[AuthAPI] Logout complete - session and cache cleared");
    },

    requireAuth: function () {
        if (!this.isAuthenticated()) {
            window.location.href = "login.html";
        }
    }
};

// ==========================================
// CHANNELS API (FIXED)
// ==========================================
const ChannelsAPI = {
    _fetchInProgress: null,
    _expiryMergeInProgress: false,

    getCategories: async function () {
        // Check cache first (also accept expired cache — call-once strategy)
        var cachedCategories = CacheManager.get(CacheManager.KEYS.CATEGORIES);
        if (!cachedCategories || cachedCategories.length === 0) {
            cachedCategories = CacheManager.get(CacheManager.KEYS.CATEGORIES, true);
        }
        if (cachedCategories && cachedCategories.length > 0) {
            console.log("[ChannelsAPI] Using cached categories (" + cachedCategories.length + ") — no API call");
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

        console.log("[ChannelsAPI] 🌐 Fetching categories from API...");

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
            console.log("[ChannelsAPI] 💾 Cached " + categories.length + " categories");
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

        console.log("[ChannelsAPI] User info - userid:", userid, "mobile:", mobile);

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
            console.log("[ChannelsAPI] Using cached channel data (" + cachedChannels.length + " channels) — no API call");

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
        console.log("[ChannelsAPI] No cached data — fetching from API (one-time call)");

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
        const payload = {
            userid: userid,
            mobile: mobile,
            ip_address: device.ip_address,
            mac_address: device.mac_address
        };

        console.log("[ChannelsAPI] Getting Channel List with payload:", payload);

        const response = await apiCall(
            API_ENDPOINTS.CHANNEL_LIST,
            payload,
            {
                "devmac": device.mac_address,
                "devslno": device.devslno
            }
        );

        console.log("[ChannelsAPI] Raw Response:", response);

        // Handle error responses
        if (response && response.error) {
            console.error("[ChannelsAPI] Error:", response.message);
            // Try to return stale cache if available
            var staleCache = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true);
            if (staleCache) {
                console.log("[ChannelsAPI] ⚠️ Using stale cache due to API error");
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
                console.log("[ChannelsAPI] Using stale cache due to API error (" + errorStaleCache.length + " channels)");
                return errorStaleCache;
            }
            return [];
        }

        // Parse channels from response
        let channels = [];

        if (response && response.body && Array.isArray(response.body)) {
            if (response.body.length > 0 && response.body[0].channels && Array.isArray(response.body[0].channels)) {
                console.log("[ChannelsAPI] Detected OLD format (body[0].channels[])");
                channels = response.body[0].channels;
            }
            else if (response.body.length > 0 && (response.body[0].chid || response.body[0].chtitle || response.body[0].streamlink)) {
                console.log("[ChannelsAPI] Detected NEW format (body[] with channel objects)");
                channels = response.body;
            }
            else if (response.body.length > 0) {
                // Fallback: treat body array as channels if items have any channel-like fields
                var firstItem = response.body[0];
                if (firstItem && typeof firstItem === 'object' && (firstItem.channelno || firstItem.urno || firstItem.ch_no)) {
                    console.log("[ChannelsAPI] Detected channel objects by alternate fields");
                    channels = response.body;
                }
            }

            console.log("[ChannelsAPI] Successfully loaded " + channels.length + " channels from API");
        } else if (response && response.body && typeof response.body === 'object' && !Array.isArray(response.body)) {
            // Handle case where body is an object with a channels array inside
            if (response.body.channels && Array.isArray(response.body.channels)) {
                console.log("[ChannelsAPI] Detected format: body.channels[]");
                channels = response.body.channels;
            }
        }

        // Cache the fresh data
        if (channels.length > 0) {
            // Fresh API data should replace stale cached image URL references.
            invalidateImageUrlCaches();
            CacheManager.set(CacheManager.KEYS.CHANNEL_LIST, channels, CacheManager.EXPIRY.CHANNEL_LIST);
            console.log("[ChannelsAPI] 💾 Cached " + channels.length + " channels (expires in 1 hour)");

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
            
            console.log("[ChannelsAPI] LOGO URLs SUMMARY - First 5 channels:");
            sampleLogos.forEach(function(s) { console.log("  " + s); });
            console.log("[ChannelsAPI] LOGO HOSTS DETECTED:");
            Object.keys(logoHostStats).forEach(function(host) {
                var count = logoHostStats[host];
                var isOldHost = /^124\.40\.244\.211|localhost|127\.0\.0\.1/i.test(host);
                var marker = isOldHost ? "⚠️ OLD HOST" : "✅";
                console.log("  " + marker + " - " + host + ": " + count + " channels");
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
                console.log("[ChannelsAPI] Using cached expiring channels data");
            } else {
                var payload = {
                    userid: userid,
                    mobile: mobile,
                    mac_address: device.mac_address,
                    ip_address: device.ip_address
                };

                var timeoutPromise = new Promise(function (_, reject) {
                    setTimeout(function () { reject(new Error("Expiry API timeout")); }, 10000);
                });
                var response = await Promise.race([
                    apiCall(API_ENDPOINTS.CHANNEL_EXPIRING, payload, { "devmac": device.mac_address, "devslno": device.devslno }),
                    timeoutPromise
                ]);

                if (response && response.body && Array.isArray(response.body) &&
                    response.body.length > 0 && response.body[0].channels) {
                    expiringList = response.body[0].channels;
                    CacheManager.set(CacheManager.KEYS.EXPIRING_CHANNELS, expiringList, CacheManager.EXPIRY.EXPIRING_CHANNELS);
                    console.log("[ChannelsAPI] Fetched " + expiringList.length + " expiring channels");
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

            console.log("[ChannelsAPI] Merged expiry dates for " + mergedCount + " channels");
        } catch (e) {
            console.warn("[ChannelsAPI] Expiry data fetch failed (non-blocking):", e.message);
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
            console.log("[ChannelsAPI] Filtered by grid=\"" + options.grid + "\": " + filteredChannels.length + " channels");
        }

        // Filter by langid (language)
        if (options.langid && options.langid !== "") {
            filteredChannels = filteredChannels.filter(function (ch) {
                return ch.langid === options.langid;
            });
            console.log("[ChannelsAPI] Filtered by langid=\"" + options.langid + "\": " + filteredChannels.length + " channels");
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
            console.log("[ChannelsAPI] Filtered by search=\"" + options.search + "\": " + filteredChannels.length + " channels");
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
            console.log("[ChannelsAPI] Filtered by subscribed=\"" + options.subscribed + "\": " + filteredChannels.length + " channels");
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
            console.log("[ChannelsAPI] Using cached languages (" + cachedLanguages.length + ") — no API call");
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

        console.log("[ChannelsAPI] 🌐 Fetching languages from API...");

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
            console.log("[ChannelsAPI] 💾 Cached " + languages.length + " languages");

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

    playChannel: function (channel) {
        const url = this.getStreamUrl(channel);
        if (url) {
            // Save as last played channel for quick resume
            CacheManager.setLastChannel(channel);
            console.log("[ChannelsAPI] 💾 Saved last played channel:", channel.chtitle || channel.channel_name);

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
            console.log('[AdsAPI] IPTV ads cache hit:', cacheKey);
            return this._iptvAdsCache[cacheKey];
        }

        try {
            var cachedAds = sessionStorage.getItem('_iptv_ads_' + cacheKey);
            if (cachedAds) {
                this._iptvAdsCache[cacheKey] = JSON.parse(cachedAds);
                console.log('[AdsAPI] IPTV ads session cache hit:', cacheKey);
                return this._iptvAdsCache[cacheKey];
            }
        } catch (e) {}

        const user = AuthAPI.getUserData();

        // Debug: Log user data to see what fields exist
        console.log("[AdsAPI] 🔍 User Data Retrieved:", user);

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

            console.log("[AdsAPI] 📞 Extracted - userid:", userid, "mobile:", mobile);
        } else {
            console.log("[AdsAPI] ⚠️  No user session found, using defaults");
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

        console.log("[AdsAPI] 📡 Fetching IPTV Ads...");
        console.log("[AdsAPI] 📦 Final Payload:", payload);
        console.log("[AdsAPI] 📦 Payload JSON:", JSON.stringify(payload));

        try {
            // Use exact DEFAULT_HEADERS that work on Samsung TV and in Postman
            const response = await fetch(API_ENDPOINTS.IPTV_ADS, {
                method: "POST",
                headers: DEFAULT_HEADERS,
                body: JSON.stringify(payload)
            });

            // Check HTTP response status
            if (!response.ok) {
                console.warn("[AdsAPI] ❌ HTTP Error:", response.status, response.statusText);
                console.warn("[AdsAPI] This may indicate server issues or network problems");
                return [];
            }

            // Parse JSON response
            const data = await response.json();
            console.log("[AdsAPI] 📥 Response received:", data);

            // Validate response structure
            if (!data) {
                console.warn("[AdsAPI] ⚠️  Empty response from server");
                return [];
            }

            // Check API status - err_code 0 = success (use Number() for type safety)
            if (data.status) {
                if (Number(data.status.err_code) === 0) {
                    console.log("[AdsAPI] ✅ Status: " + (data.status.err_msg || "Success"));
                } else {
                    console.warn("[AdsAPI] ❌ API Error Code:", data.status.err_code);
                    console.warn("[AdsAPI] Error Message:", data.status.err_msg || "Unknown error");
                    return [];
                }
            } else {
                console.warn("[AdsAPI] ⚠️  No status field in response");
            }

            // Extract ads from response body
            if (data.body && Array.isArray(data.body)) {
                const adCount = data.body.length;

                if (adCount > 0) {
                    console.log("[AdsAPI] ✅ Successfully loaded " + adCount + " ad(s)");

                    // Log ad URLs for debugging (helpful on Samsung TV)
                    data.body.forEach(function (ad, index) {
                        if (ad.adpath) {
                            console.log("[AdsAPI]   Ad " + (index + 1) + ": " + ad.adpath);
                        }
                    });

                    this._iptvAdsCache[cacheKey] = data.body;
                    try { sessionStorage.setItem('_iptv_ads_' + cacheKey, JSON.stringify(data.body)); } catch (e) {}

                    return data.body;
                } else {
                    console.log("[AdsAPI] ⚠️  No ads available in response");
                    console.log("[AdsAPI] Possible reasons:");
                    console.log("[AdsAPI]   - No ads configured for displayarea: " + payload.displayarea);
                    console.log("[AdsAPI]   - No ads configured for user: " + payload.userid);
                    console.log("[AdsAPI]   - Backend database is empty");
                    return [];
                }
            } else {
                console.warn("[AdsAPI] ⚠️  Invalid response body format");
                console.warn("[AdsAPI] Expected: { body: [...], status: {...} }");
                console.warn("[AdsAPI] Received:", data);
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
        console.log("[AdsAPI] 🏠 Getting homepage ads...");
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
        console.log("[AdsAPI] 📺 Getting channel list ads...");
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
        console.log("[AdsAPI] 🎥 Getting video ads...");
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
            console.log("[AdsAPI] Stream Ads cache hit for chid:", cacheKey);
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

        console.log("[AdsAPI] Fetching Stream Ads for chid:", chid);

        try {
            var response = await apiCall(API_ENDPOINTS.STREAM_ADS, payload);

            if (response && response.status && Number(response.status.err_code) === 0 && response.body && Array.isArray(response.body)) {
                console.log("[AdsAPI] Stream Ads loaded:", response.body.length);
                // Cache for this session
                if (cacheKey) this._streamAdsCache[cacheKey] = response.body;
                return response.body;
            }

            // Cache empty result too (prevents re-fetching for channels with no ads)
            if (cacheKey) this._streamAdsCache[cacheKey] = [];
            return [];
        } catch (error) {
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

        console.log("[FeedbackAPI] ✅ Submitting with CORRECT format:", payload);

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
            console.log("[AppVersionAPI] Returning cached version response");
            return this._cachedResponse;
        }

        // Check sessionStorage for cross-page session cache
        try {
            var cached = sessionStorage.getItem('_appVersionResponse');
            if (cached) {
                this._cachedResponse = JSON.parse(cached);
                console.log("[AppVersionAPI] Returning session-cached version response");
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

        console.log("[AppVersionAPI] Getting app version:", payload);

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
            console.log('[FoFiLogoAPI] Returning in-memory cached logo response');
            return this._cachedResponse;
        }

        try {
            var cached = sessionStorage.getItem('_fofi_logo_response');
            if (cached) {
                this._cachedResponse = JSON.parse(cached);
                console.log('[FoFiLogoAPI] Returning session cached logo response');
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

        console.log("[FoFiLogoAPI] Fetching FoFi TV logo...");
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
            console.log('[OTTAppsAPI] Returning in-memory cached apps response');
            return this._cachedResponse;
        }

        try {
            var cached = sessionStorage.getItem('_ott_apps_response');
            if (cached) {
                this._cachedResponse = JSON.parse(cached);
                console.log('[OTTAppsAPI] Returning session cached apps response');
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

        console.log("[OTTAppsAPI] Getting allowed apps:", payload);

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

        console.log("[AppLockAPI] Checking app lock:", payload);

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

        console.log("[TRPDataAPI] Sending TRP data:", payload);

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

        console.log("[RaiseTicketAPI] Raising ticket:", payload);

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
                console.log("[ErrorImagesAPI] Using cached error images (" + Object.keys(this._cache).length + ") — no API call");
                return;
            }

            // No cache — fetch from API (one-time call)
            console.log("[ErrorImagesAPI] No cached data — fetching from API (one-time call)");
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

                console.log("[ErrorImagesAPI] Loaded " + Object.keys(images).length + " error images from API");
            }
        } catch (e) {
            console.warn("[ErrorImagesAPI] Failed to fetch error images:", e.message);
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
        console.log("[ErrorImagesAPI.getImageUrl] key=" + key + " source=" + source + " url=" + (resolved || "(empty)"));
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
    console.log("[BBNL_API] Successfully initialized and exposed globally");

    // Register service worker for image caching where supported.
    try {
        if ('serviceWorker' in navigator && String(window.location.protocol).indexOf('http') === 0) {
            navigator.serviceWorker.register('sw.js').catch(function () {});
        }
    } catch (e) {}
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
                    console.log("[RemoteKeys] Registered " + keysToRegister.length + " keys successfully");
                }

                return true;
            }
        } catch (e) {
            console.log("[RemoteKeys] Not running on Tizen or key registration failed:", e.message);
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
                console.log("[RemoteKeys] Registered keys:", keys.join(", "));
                return true;
            }
        } catch (e) {
            console.log("[RemoteKeys] Key registration failed:", e.message);
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

console.log("[BBNL_API] API Service loaded successfully");

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

window.addEventListener('beforeunload', function () {
    _isPageUnloading = true;
});

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && !_isPageUnloading) {
        // Skip exit if user is in the middle of the login/verify auth flow.
        // On some Tizen TV models visibilitychange fires before beforeunload during
        // page navigation, which would exit the app and wipe sessionStorage mid-flow.
        var _currentPage = window.location.pathname.split('/').pop() || '';
        if (_currentPage === 'login.html' || _currentPage === 'verify.html') {
            console.log("[App] Skipping exit - auth flow in progress on:", _currentPage);
            return;
        }

        console.log("[App] App going to background (HOME pressed) - performing cleanup...");
        _wasBackgrounded = true;

        // 1. Stop any active media playback (prevents background audio)
        try {
            if (typeof webapis !== 'undefined' && webapis.avplay) {
                webapis.avplay.stop();
                webapis.avplay.close();
            }
        } catch (e) {}

        try {
            if (typeof AVPlayer !== 'undefined') {
                AVPlayer.stop();
            }
        } catch (e) {}

        // 2. NO server logout here — session must stay alive for relaunch.
        //    Server logout only happens from Settings > Logout (explicit user action).
        //    Sending logout here would invalidate the server session, causing API
        //    failures on relaunch and the user getting stuck on the login page.

        // 3. Exit the Tizen application completely
        //    sessionStorage is automatically cleared when the process dies.
        //    localStorage (hasLoggedInOnce, bbnl_user) persists for relaunch.
        try {
            if (typeof tizen !== 'undefined' && tizen.application) {
                tizen.application.getCurrentApplication().exit();
            }
        } catch (e) {
            console.error("[App] Exit failed:", e);
        }

    } else if (document.visibilityState === 'visible' && _wasBackgrounded) {
        // FALLBACK: App was resumed from background (exit() didn't work on this TV).
        // Redirect to home page so FoFi plays after 3 seconds.
        console.log("[App] App resumed from background - redirecting to home page...");
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
        console.log("[App] Page navigation in progress - NOT exiting app");
    }
});