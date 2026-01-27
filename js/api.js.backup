/**
 * BBNL Samsung TV Project API Service
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
    // Match headers used in Postman: Basic auth + device headers
    "Authorization": "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=",
    "devmac": "26:F2:AE:D8:3F:99",
    "devslno": "FOFI20191129000336"
};

// Default user information
const DEFAULT_USER = {
    userid: "testiser1",
    mobile: "7800000001"
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
// Device info (will be updated by initiali zeDeviceInfo)

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
async function apiCall(endpoint, payload) {
    const url = endpoint; // endpoint is now full URL from API_ENDPOINTS

    console.log(`[API] Request: ${url}`, payload);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: DEFAULT_HEADERS,
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
    // Basic mapping, extend as needed
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
                const mac = webapis.network.getMac();

                if (ip) DEVICE_INFO.ip_address = ip;
                if (mac) {
                    DEVICE_INFO.mac_address = mac;
                    DEFAULT_HEADERS["devmac"] = mac;
                }
            }
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
// AUTH API
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
        // Uses /loginOtp endpoint for resending, as per specific user request
        const device = DeviceInfo.getDeviceInfo();

        // Merge provided deviceData or fallback to defaults matching usage
        // Note: The user provided specific hardcoded IP/MAC in the prompt example.
        // We will prioritize passed args, then device info, then defaults.

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
        window.location.href = "login.html"; // Adjust path as needed
    },

    requireAuth: function () {
        if (!this.isAuthenticated()) {
            window.location.href = "login.html";
        }
    }
};

// ==========================================
// CHANNELS API
// ==========================================
const ChannelsAPI = {
    getCategories: async function () {
        const user = AuthAPI.getUserData();
        const device = DeviceInfo.getDeviceInfo();

        // Allow fetch even if user is null (for testing/mock)
        const payload = {
            userid: user ? user.userid : DEFAULT_USER.userid,
            mobile: user ? user.mobile : DEFAULT_USER.mobile,
            ip_address: device.ip_address,
            mac_address: device.mac_address
        };

        const response = await apiCall(API_ENDPOINTS.CHANNEL_CATEGORIES, payload);

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

        return response;
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

        const response = await apiCall(API_ENDPOINTS.CHANNEL_DATA, payload);

        // Normalize Nested Response
        if (response && response.body && Array.isArray(response.body)) {
            return response.body;
        }
        if (Array.isArray(response)) return response;

        return response;
    },

    // Aliases for compatibility
    getCategoryList: async function () { return this.getCategories(); },
    getChannelList: async function () { return this.getChannelData(); },
    getLanguageList: async function () {
        const user = AuthAPI.getUserData();
        const payload = {
            userid: user ? user.userid : DEFAULT_USER.userid,
            mobile: user ? user.mobile : DEFAULT_USER.mobile
        };
        return await apiCall(API_ENDPOINTS.CHANNEL_LANGUAGELIST, payload);
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
            // Encode Channel Data to pass to player
            const data = encodeURIComponent(JSON.stringify(channel));
            window.location.href = `player.html?data=${data}`;
        } else {
            console.error("No stream URL for channel", channel);
            alert("Stream not available");
        }
    }
};

// ==========================================
// ADS API
// ==========================================
const AdsAPI = {
    getIPTVAds: async function (options = {}) {
        const user = AuthAPI.getUserData();
        const payload = {
            userid: user ? user.userid : "testiser1",
            mobile: user ? user.mobile : "7800000001",
            adclient: options.adclient || "fofi",
            srctype: options.srctype || "image",
            displayarea: options.displayarea || "homepage", // Default to 'homepage' as requested
            displaytype: options.displaytype || "multiple"
        };

        // Use the specific endpoint for ads
        const response = await apiCall("/iptvads", payload, true); // true = use ADS_BASE_URL

        if (response && response.body && Array.isArray(response.body)) {
            return response.body;
        }
        return response;
    },

    getVideoAds: async function () {
        return this.getIPTVAds({ srctype: 'video', displayarea: 'homepage' });
    },

    getChannelListAds: async function () {
        return this.getIPTVAds({ displayarea: 'homepage' }); // Adjusted to homepage based on new default
    },

    getAdsByArea: async function (displayarea, srctype, multiple) {
        return this.getIPTVAds({ displayarea, srctype });
    },

    // UI Helper for Ads
    createSlider: function (containerId, ads, interval = 5000) {
        const container = document.getElementById(containerId);
        if (!container || !ads || ads.length === 0) return;

        container.innerHTML = "";
        let currentIndex = 0;

        // Create Slide Elements
        ads.forEach((ad, index) => {
            const img = document.createElement("img");
            img.src = ad.adpath; // As per doc response body
            img.className = "ad-slide";
            img.style.display = index === 0 ? "block" : "none";
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "cover";
            container.appendChild(img);
        });

        // Rotation Logic
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
// GLOBAL EXPORT (Legacy Support)
// ==========================================
// We expose a unified BBNL_API object to maintain compatibility with existing 'channels.js'
// which expects BBNL_API.getCategoryList(), etc.
const BBNL_API = {
    ...AuthAPI,
    ...ChannelsAPI,
    ...AdsAPI,
    ...DeviceInfo,
    API_CONFIG
};

// Auto-initialize device info on load
DeviceInfo.initializeDeviceInfo();
