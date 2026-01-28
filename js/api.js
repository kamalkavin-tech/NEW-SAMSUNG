/**
 * BBNL Samsung TV Project API Service - FIXED VERSION
 * Implements endpoints as per BBNL API Documentation.
 */

// ==========================================
// API CONFIGURATION
// ==========================================

// Base URL for API endpoints
const API_BASE_URL_PROD = "http://124.40.244.211/netmon/cabletvapis";

// Default headers for all API requests
const DEFAULT_HEADERS = {
    "Content-Type": "application/json",
    "Authorization": "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=",
    "devmac": "26:F2:AE:D8:3F:99",
    "devslno": "FOFI20191129000336"
};

// Default user information
const DEFAULT_USER = {
    userid: "testuser1",
    mobile: "7800000001"
};

// API Configuration Object
const API_CONFIG = {
    BASE_URL: API_BASE_URL_PROD,
    HEADERS: DEFAULT_HEADERS,
    DEFAULT_USER: DEFAULT_USER
};

// API Endpoints
const API_ENDPOINTS = {
    LOGIN: `${API_BASE_URL_PROD}/login`,
    RESEND_OTP: `${API_BASE_URL_PROD}/loginOtp`,
    ADD_MACADDRESS: `${API_BASE_URL_PROD}/addmacnew`,
    USER_LOGOUT: `${API_BASE_URL_PROD}/userLogout`,
    CHANNEL_CATEGORIES: `${API_BASE_URL_PROD}/chnl_categlist`,
    CHANNEL_LANGUAGELIST: `${API_BASE_URL_PROD}/chnl_langlist`,
    CHANNEL_DATA: `${API_BASE_URL_PROD}/chnl_data`,
    CHANNEL_EXPIRING: `${API_BASE_URL_PROD}/expiringchnl_list`,
    HOME_ADS: `${API_BASE_URL_PROD}/iptvads`,
    STREAM_ADS: `${API_BASE_URL_PROD}/streamAds`,
    OTT_APPS: `${API_BASE_URL_PROD}/allowedapps`,
    RAISE_TICKET: `${API_BASE_URL_PROD}/raiseTicket`,
    FEED_BACK: `${API_BASE_URL_PROD}/feedback`,
    APP_LOCK: `${API_BASE_URL_PROD}/applock`,
    TRP_DATA: `${API_BASE_URL_PROD}/trpdata`,
    APP_VERSION: `${API_BASE_URL_PROD}/appversion`
};

// Device info (will be updated by initializeDeviceInfo)
const DEVICE_INFO = {
    ip_address: "103.5.132.130",
    mac_address: "26:F2:AE:D8:3F:99",
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
            device_type: device.device_type
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

    setSession: function (data) {
        localStorage.setItem("bbnl_user", JSON.stringify(data));
    },

    getUserData: function () {
        const data = localStorage.getItem("bbnl_user");
        return data ? JSON.parse(data) : null;
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

        const payload = {
            userid: user ? user.userid : DEFAULT_USER.userid,
            mobile: user ? user.mobile : DEFAULT_USER.mobile,
            ip_address: device.ip_address,
            mac_address: device.mac_address
        };

        console.log("[ChannelsAPI] Getting Categories with payload:", payload);
        const response = await apiCall(API_ENDPOINTS.CHANNEL_CATEGORIES, payload, { "devmac": device.mac_address });

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

    getChannelData: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        const payload = {
            userid: user ? user.userid : DEFAULT_USER.userid,
            mobile: user ? user.mobile : DEFAULT_USER.mobile,
            ip_address: device.ip_address,
            mac_address: device.mac_address
        };

        console.log("[ChannelsAPI] Getting Channel Data with payload:", payload);
        const response = await apiCall(API_ENDPOINTS.CHANNEL_DATA, payload, { "devmac": device.mac_address });

        // Handle error responses
        if (response.error) {
            console.error("[ChannelsAPI] Error getting channel data:", response);
            return [];
        }

        // Handle array-wrapped response: [{ body: ... }]
        if (Array.isArray(response) && response.length > 0 && response[0].body) {
            response = response[0];
        }

        // Normalize Nested Response
        if (response && response.body && Array.isArray(response.body)) {
            return response.body;
        }
        if (Array.isArray(response)) return response;

        console.warn("[ChannelsAPI] Unexpected response format:", response);
        return [];
    },

    getCategoryList: async function () {
        return this.getCategories();
    },

    getChannelList: async function () {
        return this.getChannelData();
    },

    getLanguageList: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        const payload = {
            userid: user ? user.userid : DEFAULT_USER.userid,
            mobile: user ? user.mobile : DEFAULT_USER.mobile,
            ip_address: device.ip_address,
            mac_address: device.mac_address
        };

        console.log("[ChannelsAPI] Getting Language List with payload:", payload);
        const response = await apiCall(API_ENDPOINTS.CHANNEL_LANGUAGELIST, payload, { "devmac": device.mac_address });

        // Handle array-wrapped response
        if (Array.isArray(response) && response.length > 0) {
            return response[0].body || response[0];
        }
        return response.body || response;
    },

    getSubscribedChannels: function (channels) {
        if (!Array.isArray(channels)) return [];
        return channels.filter(ch => ch.subscribed === "1" || ch.subscribed === true);
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
// ADS API (FIXED)
// ==========================================
const AdsAPI = {
    getIPTVAds: async function (options = {}) {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();
        const payload = {
            userid: user ? user.userid : DEFAULT_USER.userid,
            mobile: user ? user.mobile : DEFAULT_USER.mobile,
            adclient: options.adclient || "fofi",
            srctype: options.srctype || "image",
            displayarea: options.displayarea || "homepage",
            displaytype: options.displaytype || "multiple",
            mac_address: device.mac_address
        };

        console.log("[AdsAPI] Getting IPTV Ads with payload:", payload);
        const response = await apiCall(API_ENDPOINTS.HOME_ADS, payload, { "devmac": device.mac_address });

        // Handle array-wrapped response: [{ body: ... }]
        if (Array.isArray(response) && response.length > 0 && response[0].body) {
            response = response[0];
        }

        if (response && response.body && Array.isArray(response.body)) {
            return response.body;
        }
        return response;
    },

    getVideoAds: async function () {
        return this.getIPTVAds({ srctype: 'video', displayarea: 'homepage' });
    },

    getChannelListAds: async function () {
        return this.getIPTVAds({ displayarea: 'homepage' });
    },

    getAdsByArea: async function (displayarea, srctype) {
        return this.getIPTVAds({ displayarea, srctype });
    },

    createSlider: function (containerId, ads, interval = 5000) {
        const container = document.getElementById(containerId);
        if (!container || !ads || ads.length === 0) return;

        container.innerHTML = "";
        let currentIndex = 0;

        ads.forEach((ad, index) => {
            const img = document.createElement("img");
            img.src = ad.adpath;
            img.className = "ad-slide";
            img.style.display = index === 0 ? "block" : "none";
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";
            container.appendChild(img);
        });

        if (ads.length > 1) {
            setInterval(() => {
                const slides = container.querySelectorAll(".ad-slide");
                slides[currentIndex].style.display = "none";
                currentIndex = (currentIndex + 1) % slides.length;
                slides[currentIndex].style.display = "block";
            }, interval);
        }
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

    // Ads Methods
    getIPTVAds: AdsAPI.getIPTVAds.bind(AdsAPI),
    getVideoAds: AdsAPI.getVideoAds.bind(AdsAPI),
    getChannelListAds: AdsAPI.getChannelListAds.bind(AdsAPI),
    getAdsByArea: AdsAPI.getAdsByArea.bind(AdsAPI),
    createSlider: AdsAPI.createSlider.bind(AdsAPI),

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
    window.DeviceInfo = DeviceInfo;
    console.log("[BBNL_API] Successfully initialized and exposed globally");
}

// Auto-initialize device info on load
DeviceInfo.initializeDeviceInfo();

console.log("[BBNL_API] API Service loaded successfully");