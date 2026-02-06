/**
 * BBNL Samsung TV Project API Service - FIXED VERSION
 * Implements endpoints as per BBNL API Documentation.
 */

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

// Default headers for all API requests
const DEFAULT_HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=",
    "devmac": "26:F2:AE:D8:3F:99",
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

    // Ads endpoint
    IPTV_ADS: `${API_BASE_URL_PROD}/iptvads`,

    // Other endpoints
    OTT_APPS: `${API_BASE_URL_PROD}/allowedapps`,
    RAISE_TICKET: `${API_BASE_URL_PROD}/raiseTicket`,
    FEED_BACK: `${API_BASE_URL_PROD}/feedback`,
    APP_LOCK: `${API_BASE_URL_PROD}/applock`,
    TRP_DATA: `${API_BASE_URL_PROD}/trpdata`,
    APP_VERSION: `${API_BASE_URL_PROD}/appversion`
};

// Device info (will be updated by initializeDeviceInfo)
const DEVICE_INFO = {
    ip_address: "192.168.101.110",
    mac_address: "26:F2:AE:D8:3F:99",   // Reverted to registered MAC (to avoid "already registered" error)
    device_name: "rk3368_box_",
    device_type: "FOFI_LG",
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
            if (typeof webapis !== 'undefined' && webapis.network) {
                const ip = webapis.network.getIp();
                // const mac = webapis.network.getMac();  // DISABLED: Don't auto-detect MAC

                if (ip) DEVICE_INFO.ip_address = ip;

                // IMPORTANT: Don't overwrite MAC address
                // We're using the registered MAC: 26:F2:AE:D8:3F:99
                // If you enable auto-detection, it will cause "User ID already registered" error

                // if (mac) {
                //     DEVICE_INFO.mac_address = mac;
                    //     DEFAULT_HEADERS["devmac"] = mac;
                // }
            }
            // Ensure default headers reflect the device MAC
            DEFAULT_HEADERS["devmac"] = DEVICE_INFO.mac_address;
            console.log("[DeviceInfo] Initialized:", DEVICE_INFO);
        } catch (e) {
            console.warn("[DeviceInfo] Tizen WebAPIs not available, using defaults");
        }
    },

    getDeviceInfo: function () {
        return DEVICE_INFO;
    }
};

// ==========================================
// AUTH API (UNCHANGED - DO NOT MODIFY)
// ==========================================
const AuthAPI = {
    requestOTP: async function (userid, mobile) {
        const device = DeviceInfo.getDeviceInfo();
        const payload = {
            userid: userid,
            mobile: mobile,
            mac_address: device.mac_address,
            device_name: device.device_name,
            ip_address: device.ip_address,
            device_type: device.device_type,
            getuserdet: ""
        };
        console.log("[AuthAPI] Requesting OTP Payload:", payload);
        return await apiCall(API_ENDPOINTS.LOGIN, payload);
    },

    addMacAddress: async function (userid, mobile) {
        const device = DeviceInfo.getDeviceInfo();
        const payload = {
            userid: userid,
            mobile: mobile,
            mac_address: device.mac_address,
            device_name: device.device_name,
            ip_address: device.ip_address,
            device_type: device.device_type
        };
        console.log("[AuthAPI] Adding MAC Address Payload:", payload);
        return await apiCall(API_ENDPOINTS.ADD_MACADDRESS, payload);
    },

    verifyOTP: async function (userid, mobile, otpcode) {
        const device = DeviceInfo.getDeviceInfo();

        const payload = {
            userid: userid,
            mobile: mobile,
            otpcode: otpcode,
            mac_address: device.mac_address,
            device_name: device.device_name,
            ip_address: device.ip_address,
            device_type: device.device_type,
            getuserdet: ""
        };

        console.log("[AuthAPI] Verifying OTP Payload:", payload);
        const response = await apiCall(API_ENDPOINTS.RESEND_OTP, payload);

        if (response && response.status && response.status.err_code === 0) {
            this.setSession(response);
        }
        return response;
    },

    resendOTP: async function (userid, mobile, email, deviceData = {}) {
        const device = DeviceInfo.getDeviceInfo();

        const payload = {
            userid: userid || DEFAULT_USER.userid,
            mobile: mobile || DEFAULT_USER.mobile,
            email: email || "sureshs@bbnl.co.in",
            mac_address: deviceData.mac_address || device.mac_address,
            device_name: deviceData.device_name || device.device_name,
            ip_address: deviceData.ip_address || device.ip_address,
            device_type: deviceData.device_type || device.device_type
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

    logout: function () {
        localStorage.removeItem("bbnl_user");
        window.location.href = "login.html";
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
    getCategories: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Extract userid and mobile with proper fallback
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

        console.log("[ChannelsAPI] Getting Categories with payload:", payload);
        console.log("[ChannelsAPI] User data:", user);

        const response = await apiCall(
            API_ENDPOINTS.CHANNEL_CATEGORIES,
            payload,
            {
                "devmac": device.mac_address,  // FIXED: Use device MAC dynamically
                "devslno": device.devslno || "FOFI20191129000336"
            }
        );

        // Handle error responses
        if (response.error) {
            console.error("[ChannelsAPI] Error getting categories:", response);
            return [];
        }

        // Handle array-wrapped response: [{ body: ... }] or [{ categories: ... }]
        if (Array.isArray(response) && response.length > 0 && (response[0].body || response[0].categories)) {
            response = response[0];
        }

        // Normalize Nested Response
        if (response && response.body && Array.isArray(response.body)) {
            if (response.body.length > 0 && response.body[0].categories) {
                return response.body[0].categories;
            }
            return response.body;
        }

        // Fallback for direct array or other structures
        if (Array.isArray(response)) return response;
        if (response.categories) return response.categories;

        console.warn("[ChannelsAPI] Unexpected response format:", response);
        return [];
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
        console.log("[ChannelsAPI] Full user data:", user);

        // NEW API FORMAT for chnl_data endpoint
        // Body: userid, mobile, ip_address, mac_address (empty)
        // Headers: devmac, Authorization, devslno
        const payload = {
            userid: userid,
            mobile: mobile,
            ip_address: device.ip_address || "192.168.101.110",
            mac_address: ""  // Empty string as per new API format
        };

        console.log("[ChannelsAPI] Getting Channel List with payload:", payload);
        console.log("[ChannelsAPI] Options (for client-side filtering):", options);

        const response = await apiCall(
            API_ENDPOINTS.CHANNEL_LIST,
            payload,
            {
                "devmac": "68:1D:EF:14:6C:21",
                "Authorization": "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=",
                "devslno": "FOFI20191129000336"
            }
        );

        console.log("[ChannelsAPI] Raw Response:", response);

        // Handle error responses
        if (response && response.error) {
            console.error("[ChannelsAPI] Error:", response.message);
            return [];
        }

        // Check for API error status
        if (response && response.status && response.status.err_code !== 0) {
            console.error("[ChannelsAPI] API Error:", response.status.err_msg);
            return [];
        }

        // RESPONSE FORMAT FOR /chnl_data:
        // The body array directly contains channel objects, NOT nested in body[0].channels
        // Structure: { body: [ {channel1}, {channel2}, ... ], status: {...} }
        let channels = [];

        if (response && response.body && Array.isArray(response.body)) {
            // Check if it's the OLD format: body[0].channels[]
            if (response.body.length > 0 && response.body[0].channels && Array.isArray(response.body[0].channels)) {
                console.log("[ChannelsAPI] 📦 Detected OLD format (body[0].channels[])");
                channels = response.body[0].channels;
            }
            // NEW format: body[] contains channels directly
            else if (response.body.length > 0 && response.body[0].chid) {
                console.log("[ChannelsAPI] 📦 Detected NEW format (body[] with channel objects)");
                channels = response.body;
            }

            console.log(`[ChannelsAPI] ✅ Successfully loaded ${channels.length} channels from API`);
        } else {
            console.warn("[ChannelsAPI] ⚠️ response.body is not an array or doesn't exist");
        }

        if (channels.length === 0) {
            console.warn("[ChannelsAPI] ❌ No channels returned");
            console.log("[ChannelsAPI] Response keys:", response ? Object.keys(response) : "null");
            console.log("[ChannelsAPI] Response.body type:", typeof response?.body);
            return [];
        }

        // CLIENT-SIDE FILTERING (API returns all channels, we filter them here)
        var filteredChannels = channels;

        // Filter by grid (category)
        if (options.grid && options.grid !== "") {
            filteredChannels = filteredChannels.filter(function(ch) {
                return ch.grid === options.grid;
            });
            console.log(`[ChannelsAPI] Filtered by grid="${options.grid}": ${filteredChannels.length} channels`);
        }

        // Filter by langid (language)
        if (options.langid && options.langid !== "") {
            filteredChannels = filteredChannels.filter(function(ch) {
                return ch.langid === options.langid;
            });
            console.log(`[ChannelsAPI] Filtered by langid="${options.langid}": ${filteredChannels.length} channels`);
        }

        // Filter by search term
        if (options.search && options.search !== "") {
            var searchLower = options.search.toLowerCase();
            filteredChannels = filteredChannels.filter(function(ch) {
                var title = (ch.chtitle || "").toLowerCase();
                return title.indexOf(searchLower) !== -1;
            });
            console.log(`[ChannelsAPI] Filtered by search="${options.search}": ${filteredChannels.length} channels`);
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
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Extract userid and mobile with proper fallback
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

        console.log("[ChannelsAPI] Getting Language List with payload:", payload);
        console.log("[ChannelsAPI] User data:", user);

        const response = await apiCall(API_ENDPOINTS.CHANNEL_LANGUAGELIST, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno || "FOFI20191129000336"
        });

        console.log("[ChannelsAPI] Language List Response:", response);

        // Handle error responses
        if (response.error) {
            console.error("[ChannelsAPI] Error getting languages:", response);
            return [];
        }

        // Handle array-wrapped response: [{ body: ... }] or [{ languages: ... }]
        if (Array.isArray(response) && response.length > 0 && (response[0].body || response[0].languages)) {
            response = response[0];
        }

        // Normalize Nested Response - Extract languages from body[0].languages
        if (response && response.body && Array.isArray(response.body)) {
            if (response.body.length > 0 && response.body[0].languages) {
                return response.body[0].languages;
            }
            return response.body;
        }

        // Fallback for direct array or other structures
        if (Array.isArray(response)) return response;
        if (response.languages) return response.languages;

        console.warn("[ChannelsAPI] Unexpected language response format:", response);
        return [];
    },

    getSubscribedChannels: function (channels) {
        if (!Array.isArray(channels)) return [];
        // Check for multiple possible "subscribed" values from API
        return channels.filter(function(ch) {
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
                    data.body.forEach(function(ad, index) {
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
    submitFeedback: async function(feedbackData) {
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
            "devslno": device.devslno || "FOFI20191129000336"
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
    getAppVersion: async function() {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Backend expects this exact format
        const payload = {
            userid: user && user.userid ? user.userid : DEFAULT_USER.userid,
            mobile: user && user.mobile ? user.mobile : DEFAULT_USER.mobile,
            ip_address: device.ip_address || "192.168.101.110",
            device_type: "",  // Empty string as per API format
            mac_address: "",  // Empty string as per API format
            device_name: "",  // Empty string as per API format
            app_package: "com.fofi.fofiboxtv"
        };

        console.log("[AppVersionAPI] Getting app version:", payload);

        return await apiCall(API_ENDPOINTS.APP_VERSION, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno || "FOFI20191129000336"
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
    getAllowedApps: async function() {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Backend expects this format
        const payload = {
            userid: user && user.userid ? user.userid : DEFAULT_USER.userid,
            mobile: user && user.mobile ? user.mobile : DEFAULT_USER.mobile,
            ip_address: device.ip_address || "192.168.101.110",
            mac: device.mac_address || "26:F2:AE:D8:3F:99"
        };

        console.log("[OTTAppsAPI] Getting allowed apps:", payload);

        return await apiCall(API_ENDPOINTS.OTT_APPS, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno || "FOFI20191129000336"
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
    checkAppLock: async function() {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Backend expects this format
        const payload = {
            userid: user && user.userid ? user.userid : DEFAULT_USER.userid,
            mobile: user && user.mobile ? user.mobile : DEFAULT_USER.mobile,
            ip_address: device.ip_address || "192.168.101.110",
            appversion: "1.0"
        };

        console.log("[AppLockAPI] Checking app lock:", payload);

        return await apiCall(API_ENDPOINTS.APP_LOCK, payload, {
            "devmac": device.mac_address,
            "devslno": device.devslno || "FOFI20191129000336"
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

    // Device Methods
    initializeDeviceInfo: DeviceInfo.initializeDeviceInfo.bind(DeviceInfo),
    getDeviceInfo: DeviceInfo.getDeviceInfo.bind(DeviceInfo),

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
    registerAllKeys: function() {
        try {
            if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
                // Get supported keys on this device
                var supportedKeys = tizen.tvinputdevice.getSupportedKeys();
                var supportedKeyNames = supportedKeys.map(function(k) { return k.name; });
                
                // Filter to only register keys that are supported on this device
                var keysToRegister = this.ALL_KEYS.filter(function(key) {
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
    registerKeys: function(keys) {
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
    getKeyCode: function(keyName) {
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
    isKey: function(keyCode, keyName) {
        return keyCode === this.getKeyCode(keyName) || keyCode === this.KEY_CODES[keyName];
    }
};

// Expose RemoteKeys globally
if (typeof window !== 'undefined') {
    window.RemoteKeys = RemoteKeys;
}

console.log("[BBNL_API] API Service loaded successfully");