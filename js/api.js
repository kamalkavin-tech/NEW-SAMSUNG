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

// Default headers for all API requests (devmac & devslno populated by DeviceInfo.initializeDeviceInfo)
const DEFAULT_HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=",
    "devmac": "68:1D:EF:14:6C:21",
    "devslno": "FOFI20191129000336"
};

// Default user information
const DEFAULT_USER = {
    userid: "testiser1",  // ✅ Correct userid (with typo as per backend)
    mobile: "7800000001"
};

// Default language ID (Kannada = 9, as per client API)
const DEFAULT_LANG_ID = "9";

// API Configuration Object
const API_CONFIG = {
    BASE_URL: API_BASE_URL_PROD,
    HEADERS: DEFAULT_HEADERS,
    DEFAULT_USER: DEFAULT_USER
};

// ==========================================
// CACHE MANAGER - Handles localStorage caching with expiry
// ==========================================
const CacheManager = {
    // Cache keys
    KEYS: {
        CHANNEL_LIST: 'bbnl_channels_cache',
        CATEGORIES: 'bbnl_categories_cache',
        LANGUAGES: 'bbnl_languages_cache',
        LOGIN_TOKEN: 'bbnl_user',
        FOFI_PLAYED: 'fofiPlayedThisSession',  // Uses sessionStorage
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
            var cacheObject = {
                data: data,
                timestamp: Date.now(),
                expiry: Date.now() + expiry
            };
            localStorage.setItem(key, JSON.stringify(cacheObject));
            console.log('[CacheManager] ✓ Cached:', key, '| Expires in:', Math.round(expiry / 60000), 'minutes');
            return true;
        } catch (e) {
            console.error('[CacheManager] ✗ Failed to cache:', key, e);
            return false;
        }
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
            if (!ignoreExpiry && cacheObject.expiry && Date.now() > cacheObject.expiry) {
                console.log('[CacheManager] Cache expired:', key, '| Expired:', new Date(cacheObject.expiry).toLocaleTimeString());
                return null;
            }

            var age = Math.round((Date.now() - cacheObject.timestamp) / 60000);
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
            return Math.round((Date.now() - cacheObject.timestamp) / 60000);
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
            if (keyName !== 'LOGIN_TOKEN') {
                self.remove(self.KEYS[keyName]);
            }
        });
        console.log('[CacheManager] All caches cleared');
    },

    /**
     * Clear ALL caches including login token (used on logout)
     */
    clear: function () {
        var self = this;
        Object.keys(this.KEYS).forEach(function (keyName) {
            self.remove(self.KEYS[keyName]);
        });
        console.log('[CacheManager] All caches cleared (full logout)');
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
                        expired: obj.expiry ? Date.now() > obj.expiry : false,
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

// API Endpoints
const API_ENDPOINTS = {
    // Auth endpoints (old base URL)
    LOGIN: `${API_BASE_URL_PROD}/login`,
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
    APP_VERSION: `${API_BASE_URL_PROD}/appversion`
};

// Device info - registered values for API authentication
// These are the registered device credentials required by the BBNL backend
const DEVICE_INFO = {
    ip_address: "103.5.132.130",
    mac_address: "26:F2:AE:D8:3F:99",
    device_name: "rk3368_box_",
    device_type: "FOFI_SAMSUNG",
    devslno: "FOFI20191129000336"
};

// ==========================================
// API HELPER
// ==========================================
async function apiCall(endpoint, payload, customHeaders) {
    const url = endpoint;
    const headers = Object.assign({}, DEFAULT_HEADERS, customHeaders || {});

    // Enhanced debug logging
    console.log("[API DEBUG] URL:", url);
    console.log("[API DEBUG] Payload:", JSON.stringify(payload, null, 2));
    console.log("[API DEBUG] Headers:", JSON.stringify(headers, null, 2));

    console.log(`[API] Request: ${url}`, payload);
    console.log('[API] Request Headers:', headers);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[API] Response: ${url}`, data);

        return data;
    } catch (error) {
        console.error(`[API] Error: ${url}`, error);
        return {
            error: true,
            message: error.message,
            status: {
                err_code: -1,
                err_msg: error.message
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
    initializeDeviceInfo: function () {
        try {
            if (typeof webapis !== 'undefined') {
                // Only detect device model name from TV
                if (webapis.productinfo) {
                    try {
                        var model = webapis.productinfo.getModel ? webapis.productinfo.getModel() : null;
                        if (model && model !== "NA") DEVICE_INFO.device_name = model;
                    } catch (e) {
                        console.warn("[DeviceInfo] Model detection failed:", e);
                    }
                }
            }
            console.log("[DeviceInfo] Initialized:", DEVICE_INFO);
            console.log("[DeviceInfo] Headers - devmac:", DEFAULT_HEADERS["devmac"], "devslno:", DEFAULT_HEADERS["devslno"]);
        } catch (e) {
            console.warn("[DeviceInfo] Tizen WebAPIs not available, using defaults");
        }
    },

    getDeviceInfo: function () {
        return DEVICE_INFO;
    },

    /**
     * Get IPv6 address from Samsung Tizen WebAPI
     * @returns {string} IPv6 address or empty string
     */
    getIPv6: function () {
        try {
            if (typeof webapis !== 'undefined' && webapis.network) {
                var networkType = webapis.network.getActiveConnectionType();

                if (networkType === 0) {
                    console.log("[DeviceInfo] Network disconnected - no IPv6");
                    return "";
                }

                // Try to get IPv6 address
                var ipv6 = webapis.network.getIpv6(networkType);
                if (ipv6 && ipv6.length > 0) {
                    console.log("[DeviceInfo] IPv6 detected:", ipv6);
                    return ipv6;
                } else {
                    console.log("[DeviceInfo] IPv6 not available");
                    return "";
                }
            } else {
                console.log("[DeviceInfo] WebAPIs not available - no IPv6");
                return "";
            }
        } catch (e) {
            console.error("[DeviceInfo] IPv6 fetch error:", e);
            return "";
        }
    }
};

// ==========================================
// AUTH API (UNCHANGED - DO NOT MODIFY)
// ==========================================
const AuthAPI = {
    requestOTP: async function (userid, mobile) {
        const device = DeviceInfo.getDeviceInfo();
        const ipv6 = DeviceInfo.getIPv6();
        const payload = {
            userid: userid,
            mobile: mobile,
            mac_address: device.mac_address,
            device_name: device.device_name,
            ip_address: device.ip_address,
            device_type: device.device_type,
            ipv6: ipv6,
            getuserdet: ""
        };
        console.log("[AuthAPI] Requesting OTP Payload:", payload);
        return await apiCall(API_ENDPOINTS.LOGIN, payload);
    },

    addMacAddress: async function (userid, mobile) {
        const device = DeviceInfo.getDeviceInfo();
        const ipv6 = DeviceInfo.getIPv6();
        const payload = {
            userid: userid,
            mobile: mobile,
            mac_address: device.mac_address,
            device_name: device.device_name,
            ip_address: device.ip_address,
            device_type: device.device_type,
            ipv6: ipv6
        };
        console.log("[AuthAPI] Adding MAC Address Payload:", payload);
        return await apiCall(API_ENDPOINTS.ADD_MACADDRESS, payload);
    },

    verifyOTP: async function (userid, mobile, otpcode) {
        const device = DeviceInfo.getDeviceInfo();
        const ipv6 = DeviceInfo.getIPv6();

        const payload = {
            userid: userid,
            mobile: mobile,
            otpcode: otpcode,
            mac_address: device.mac_address,
            device_name: device.device_name,
            ip_address: device.ip_address,
            device_type: device.device_type,
            ipv6: ipv6,
            getuserdet: ""
        };

        console.log("[AuthAPI] Verifying OTP Payload:", payload);
        const response = await apiCall(API_ENDPOINTS.LOGIN, payload);

        if (response && response.status && response.status.err_code === 0) {
            this.setSession(response);
        }
        return response;
    },

    resendOTP: async function (userid, mobile, email, deviceData = {}) {
        const device = DeviceInfo.getDeviceInfo();
        const ipv6 = DeviceInfo.getIPv6();

        const payload = {
            userid: userid || DEFAULT_USER.userid,
            mobile: mobile || DEFAULT_USER.mobile,
            email: email || "sureshs@bbnl.co.in",
            mac_address: deviceData.mac_address || device.mac_address,
            device_name: deviceData.device_name || device.device_name,
            ip_address: deviceData.ip_address || device.ip_address,
            device_type: deviceData.device_type || device.device_type,
            ipv6: deviceData.ipv6 || ipv6
        };

        console.log("[AuthAPI] Resending OTP Payload:", payload);
        return await apiCall(API_ENDPOINTS.RESEND_OTP, payload);
    },

    setSession: function (response) {
        // Extract user data from response.body[0] and save it
        if (response && response.body && response.body.length > 0) {
            var userData = response.body[0];
            localStorage.setItem("bbnl_user", JSON.stringify(userData));
            console.log("[AuthAPI] Session saved for user:", userData.userid);
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

        var userid = DEFAULT_USER.userid;
        var mobile = DEFAULT_USER.mobile;

        if (user) {
            if (user.userid) userid = user.userid;
            if (user.mobile) mobile = user.mobile;
        }

        var ipv6 = DeviceInfo.getIPv6();
        var payload = {
            userid: userid,
            mobile: mobile,
            mac_address: device.mac_address,
            device_name: device.device_name,
            ip_address: device.ip_address,
            device_type: device.device_type,
            ipv6: ipv6
        };

        console.log("[AuthAPI] Logout Payload:", payload);

        try {
            var response = await apiCall(API_ENDPOINTS.USER_LOGOUT, payload);
            console.log("[AuthAPI] Logout Response:", response);
        } catch (e) {
            console.warn("[AuthAPI] Logout API error (proceeding with local cleanup):", e.message);
        }

        // Clear local session data (do NOT redirect — caller handles navigation/exit)
        localStorage.removeItem("bbnl_user");
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
    _backgroundRefreshInProgress: false,
    _fetchInProgress: null,
    _expiryMergeInProgress: false,

    getCategories: async function () {
        // Check cache first
        var cachedCategories = CacheManager.get(CacheManager.KEYS.CATEGORIES);
        if (cachedCategories && cachedCategories.length > 0) {
            console.log("[ChannelsAPI] 📦 Using cached categories (" + cachedCategories.length + ")");

            // Refresh in background
            this._fetchAndCacheCategories().catch(function (e) {
                console.warn("[ChannelsAPI] Background categories refresh failed:", e);
            });

            return cachedCategories;
        }

        return await this._fetchAndCacheCategories();
    },

    _fetchAndCacheCategories: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        var userid = DEFAULT_USER.userid;
        var mobile = DEFAULT_USER.mobile;

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
        var userid = DEFAULT_USER.userid;
        var mobile = DEFAULT_USER.mobile;

        if (user) {
            if (user.userid) userid = user.userid;
            if (user.mobile) mobile = user.mobile;
        }

        console.log("[ChannelsAPI] User info - userid:", userid, "mobile:", mobile);

        // ==========================================
        // CACHE-FIRST STRATEGY
        // 1. Check if cached data exists and is valid
        // 2. If valid, return cached data immediately
        // 3. Then fetch fresh data in background
        // 4. Update cache after successful fetch
        // ==========================================

        var cachedChannels = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST);

        // ── CACHE HIT: Return cached data immediately ──
        if (cachedChannels && cachedChannels.length > 0) {
            // Background expiry merge (non-blocking, deduped)
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

            var filteredCached = this._applyFilters(cachedChannels, options);

            // Background refresh — only ONE at a time (dedup)
            if (!this._backgroundRefreshInProgress) {
                this._backgroundRefreshInProgress = true;
                var self = this;
                this._fetchAndCacheChannels(userid, mobile, device).then(function () {
                    self._backgroundRefreshInProgress = false;
                }).catch(function () {
                    self._backgroundRefreshInProgress = false;
                });
            }

            return filteredCached;
        }

        // ── CACHE MISS: Deduplicate in-flight fetches ──
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

        // Check for API error status
        if (response && response.status && response.status.err_code !== 0) {
            console.error("[ChannelsAPI] API Error:", response.status.err_msg);
            return [];
        }

        // Parse channels from response
        let channels = [];

        if (response && response.body && Array.isArray(response.body)) {
            if (response.body.length > 0 && response.body[0].channels && Array.isArray(response.body[0].channels)) {
                console.log("[ChannelsAPI] 📦 Detected OLD format (body[0].channels[])");
                channels = response.body[0].channels;
            }
            else if (response.body.length > 0 && response.body[0].chid) {
                console.log("[ChannelsAPI] 📦 Detected NEW format (body[] with channel objects)");
                channels = response.body;
            }

            console.log("[ChannelsAPI] ✅ Successfully loaded " + channels.length + " channels from API");
        }

        // Cache the fresh data
        if (channels.length > 0) {
            CacheManager.set(CacheManager.KEYS.CHANNEL_LIST, channels, CacheManager.EXPIRY.CHANNEL_LIST);
            console.log("[ChannelsAPI] 💾 Cached " + channels.length + " channels (expires in 1 hour)");
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
        // Check cache first
        var cachedLanguages = CacheManager.get(CacheManager.KEYS.LANGUAGES);
        if (cachedLanguages && cachedLanguages.length > 0) {
            console.log("[ChannelsAPI] 📦 Using cached languages (" + cachedLanguages.length + ")");

            // Refresh in background
            this._fetchAndCacheLanguages().catch(function (e) {
                console.warn("[ChannelsAPI] Background languages refresh failed:", e);
            });

            return cachedLanguages;
        }

        return await this._fetchAndCacheLanguages();
    },

    _fetchAndCacheLanguages: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        var userid = DEFAULT_USER.userid;
        var mobile = DEFAULT_USER.mobile;

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
            CacheManager.set(CacheManager.KEYS.LANGUAGES, languages, CacheManager.EXPIRY.LANGUAGES);
            console.log("[ChannelsAPI] 💾 Cached " + languages.length + " languages");
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
            console.error("No stream URL for channel", channel);
            alert("Stream not available");
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
        const user = AuthAPI.getUserData();

        // Debug: Log user data to see what fields exist
        console.log("[AdsAPI] 🔍 User Data Retrieved:", user);

        // Extract userid and mobile with robust field name detection
        // The API response might use different field names
        var userid = DEFAULT_USER.userid;
        var mobile = DEFAULT_USER.mobile;

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

            // Check API status - CRITICAL: Must be err_code === 0 for success
            if (data.status) {
                if (data.status.err_code === 0) {
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
     *   "userid": "testiser1",
     *   "mobile": "7800000001",
     *   "ip_address": "192.168.101.110",
     *   "mac_address": "26:F2:AE:D8:3F:99",
     *   "grid": "3",
     *   "chid": "202"
     * }
     *
     * @param {String} chid - Channel ID for the current stream
     * @param {String} grid - Grid/layout position (default "3")
     * @returns {Promise<Array>} Array of stream ad objects, or empty array on error
     */
    getStreamAds: async function (chid, grid) {
        const user = AuthAPI.getUserData();
        var userid = DEFAULT_USER.userid;
        var mobile = DEFAULT_USER.mobile;

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

        console.log("[AdsAPI] 📺 Fetching Stream Ads for chid:", chid);
        console.log("[AdsAPI] 📦 Stream Ads Payload:", payload);

        try {
            var response = await fetch(API_ENDPOINTS.STREAM_ADS, {
                method: "POST",
                headers: DEFAULT_HEADERS,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.warn("[AdsAPI] Stream Ads HTTP Error:", response.status);
                return [];
            }

            var data = await response.json();
            console.log("[AdsAPI] Stream Ads Response:", data);

            if (data && data.status && data.status.err_code === 0 && data.body && Array.isArray(data.body)) {
                console.log("[AdsAPI] Stream Ads loaded:", data.body.length);
                return data.body;
            }

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
            userid: feedbackData.userid || DEFAULT_USER.userid,
            mobile: feedbackData.mobile || DEFAULT_USER.mobile,
            rate_count: String(feedbackData.rating || 0),  // IMPORTANT: Must be STRING!
            feedback: feedbackData.feedback,
            mac_address: device.mac_address,
            device_name: (device.device_name || "rk3368_box_").replace(/_$/, ''),  // Remove trailing underscore if present
            device_type: (device.device_type || "FOFI_LG").replace(/_LG$/, '')     // Use "FOFI" not "FOFI_LG"
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
    /**
     * Get app version from BBNL server
     *
     * @returns {Promise<Object>} API response with app version
     */
    getAppVersion: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Backend expects this exact format
        const payload = {
            userid: user && user.userid ? user.userid : DEFAULT_USER.userid,
            mobile: user && user.mobile ? user.mobile : DEFAULT_USER.mobile,
            ip_address: device.ip_address,
            device_type: "",  // Empty string as per API format
            mac_address: "",  // Empty string as per API format
            device_name: "",  // Empty string as per API format
            app_package: "com.fofi.fofiboxtv"
        };

        console.log("[AppVersionAPI] Getting app version:", payload);

        return await apiCall(API_ENDPOINTS.APP_VERSION, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno
        });
    }
};

// ==========================================
// OTT APPS API
// ==========================================
const OTTAppsAPI = {
    /**
     * Get allowed OTT apps from BBNL server
     *
     * @returns {Promise<Object>} API response with apps array
     */
    getAllowedApps: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Backend expects this format
        const payload = {
            userid: user && user.userid ? user.userid : DEFAULT_USER.userid,
            mobile: user && user.mobile ? user.mobile : DEFAULT_USER.mobile,
            ip_address: device.ip_address,
            mac: device.mac_address
        };

        console.log("[OTTAppsAPI] Getting allowed apps:", payload);

        return await apiCall(API_ENDPOINTS.OTT_APPS, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno
        });
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
            userid: user && user.userid ? user.userid : DEFAULT_USER.userid,
            mobile: user && user.mobile ? user.mobile : DEFAULT_USER.mobile,
            ip_address: device.ip_address,
            appversion: "1.0"
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
     * @param {String} comment - Comment/tracking data (e.g. email)
     * @returns {Promise<Object>} API response
     */
    sendTRPData: async function (comment) {
        const user = AuthAPI.getUserData();

        const payload = {
            userid: user && user.userid ? user.userid : DEFAULT_USER.userid,
            mobile: user && user.mobile ? user.mobile : DEFAULT_USER.mobile,
            comment: comment || ""
        };

        console.log("[TRPDataAPI] Sending TRP data:", payload);

        return await apiCall(API_ENDPOINTS.TRP_DATA, payload, {
            "devmac": DEVICE_INFO.mac_address,
            "devslno": DEVICE_INFO.devslno
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
            userid: user && user.userid ? user.userid : DEFAULT_USER.userid,
            mobile: user && user.mobile ? user.mobile : DEFAULT_USER.mobile,
            comment: comment || ""
        };

        console.log("[RaiseTicketAPI] Raising ticket:", payload);

        return await apiCall(API_ENDPOINTS.RAISE_TICKET, payload, {
            "devmac": DEVICE_INFO.mac_address,
            "devslno": DEVICE_INFO.devslno
        });
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

    // Device Methods
    initializeDeviceInfo: DeviceInfo.initializeDeviceInfo.bind(DeviceInfo),
    getDeviceInfo: DeviceInfo.getDeviceInfo.bind(DeviceInfo),

    // Cache Methods
    cache: CacheManager,
    clearCache: CacheManager.clearAll.bind(CacheManager),
    getCacheStats: CacheManager.getStats.bind(CacheManager),
    getLastChannel: CacheManager.getLastChannel.bind(CacheManager),

    // Configuration
    API_CONFIG: API_CONFIG
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
    window.DeviceInfo = DeviceInfo;
    console.log("[BBNL_API] Successfully initialized and exposed globally");
}

// Auto-initialize device info on load
DeviceInfo.initializeDeviceInfo();

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