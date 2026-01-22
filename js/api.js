/**
 * BBNL Samsung TV Project API Service
 * Implements endpoints as per BBNL API Documentation.
 */

// ==========================================
// CONFIGURATION & BASE URLS
// ==========================================
const API_CONFIG = {
    BASE_URL: "http://124.40.244.211/netmon/cabletvapis",
    ADS_BASE_URL: "https://bbnlnetmon.bbnl.in/prod/cabletvapis",
    HEADERS: {
        "Content-Type": "application/json",
        "Authorization": "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=", // Provided in example
        "devmac": "68:1D:EF:14:6C:21", // Default/Fallback
        "devslno": "FOFI20191129000336" // Default/Fallback
    },
    // Device info will be overwritten by initializeDeviceInfo
    DEVICE_INFO: {
        ip_address: "192.168.101.110",
        mac_address: "68:1D:EF:14:6C:21",
        devslno: "FOFI20191129000336"
    }
};

// ==========================================
// API HELPER
// ==========================================
async function apiCall(endpoint, payload, isAds = false) {
    const baseUrl = isAds ? API_CONFIG.ADS_BASE_URL : API_CONFIG.BASE_URL;
    const url = `${baseUrl}${endpoint}`;

    console.log(`[API] Req: ${url}`, payload);

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: API_CONFIG.HEADERS,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const data = await response.json();
        console.log(`[API] Res: ${url}`, data);
        return data;
    } catch (error) {
        console.error(`[API] Error: ${url}`, error);
        return { error: true, message: error.message };
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
                if (ip) API_CONFIG.DEVICE_INFO.ip_address = ip;
                if (mac) {
                    API_CONFIG.DEVICE_INFO.mac_address = mac;
                    API_CONFIG.HEADERS["devmac"] = mac;
                }
            }
            // Add Tizen ID fetching if needed
            console.log("Device Info Initialized:", API_CONFIG.DEVICE_INFO);
        } catch (e) {
            console.warn("Tizen WebAPIs not available, using mock device info.");
        }
    },

    getDeviceInfo: function () {
        return API_CONFIG.DEVICE_INFO;
    }
};

// ==========================================
// AUTH API
// ==========================================
const AuthAPI = {
    requestOTP: async function (userid, mobile) {
        const payload = { userid, mobile };
        return await apiCall("/login", payload);
    },

    verifyOTP: async function (userid, mobile, otpcode) {
        const payload = { userid, mobile, otpcode };
        const response = await apiCall("/loginOtp", payload);

        if (response && response.userid) {
            // Successful login
            this.setSession(response);
        }
        return response;
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
            userid: user ? user.userid : "testiser1",
            mobile: user ? user.mobile : "7800000001",
            ip_address: device.ip_address,
            mac_address: device.mac_address
        };

        const response = await apiCall("/chnl_categlist", payload);

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
            userid: user ? user.userid : "testiser1",
            mobile: user ? user.mobile : "7800000001",
            ip_address: device.ip_address,
            mac_address: device.mac_address
        };

        const response = await apiCall("/chnl_data", payload);

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
        // Not in doc but was in previous API, keeping for compatibility
        const user = AuthAPI.getUserData();
        const payload = { userid: user ? user.userid : "test", mobile: user ? user.mobile : "00" };
        return await apiCall("/chnl_langlist", payload);
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
    getIPTVAds: async function (options) {
        const user = AuthAPI.getUserData();
        const payload = {
            userid: user ? user.userid : "testiser1",
            mobile: user ? user.mobile : "7800000001",
            adclient: options.adclient || "BBNL",
            srctype: options.srctype || "image",
            displayarea: options.displayarea || "home",
            displaytype: options.displaytype || "slider"
        };

        const response = await apiCall("/iptvads", payload, true); // true = use ADS_BASE_URL

        if (response && response.body && Array.isArray(response.body)) {
            return response.body;
        }
        return response;
    },

    getVideoAds: async function () {
        return this.getIPTVAds({ srctype: 'video', displayarea: 'home' });
    },

    getChannelListAds: async function () {
        return this.getIPTVAds({ displayarea: 'channellist' });
    },

    getAdsByArea: async function (displayarea, srctype, multiple) {
        // Placeholder for custom logic if needed, mostly maps to getIPTVAds
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
    // Add legacy methods/properties if specifically needed
    API_CONFIG
};

// Auto-initialize device info on load
DeviceInfo.initializeDeviceInfo();
