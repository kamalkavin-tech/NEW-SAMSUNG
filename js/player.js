/**
 * BBNL Player Controller - Uses AVPlayer Module
 */

// Check authentication - redirect to login if never logged in
(function checkAuth() {
    var hasLoggedInOnce = localStorage.getItem("hasLoggedInOnce");
    if (hasLoggedInOnce !== "true") {
        console.log("[Auth] User has never logged in, redirecting to login...");
        window.location.replace("login.html");
        return;
    }
    try {
        var ud = localStorage.getItem("bbnl_user");
        if (!ud || !JSON.parse(ud).userid) {
            localStorage.removeItem("hasLoggedInOnce");
            localStorage.removeItem("bbnl_user");
            window.location.replace("login.html");
            return;
        }
    } catch (e) {}
})();

// ==========================================
// CONFIGURATION
// ==========================================
var playerDateTimeInterval = null; // Interval for date/time updates

// Clean up background intervals when leaving page
window.addEventListener('beforeunload', function () {
    if (playerDateTimeInterval) clearInterval(playerDateTimeInterval);
});

const PLAYER_CONFIG = {
    // Your IPTV server IP address
    // Replace 127.0.0.1/localhost URLs with this IP
    SERVER_IP: "124.40.244.211",

    // Port for HLS streams (if using localhost URLs)
    HLS_PORT: 9080
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Fix localhost URLs that cannot be accessed from TV
 * Replaces 127.0.0.1 and localhost with actual server IP
 * Also transforms old stream servers to Samsung HTTP/1.1 compatible server (livestream3.bbnl.in)
 */
function fixLocalhostUrl(url) {
    if (!url) return url;

    var originalUrl = url;
    var wasLocalhost = false;
    var wasOldServer = false;

    // Check if URL contains localhost or 127.0.0.1
    if (url.includes('127.0.0.1') || url.includes('localhost')) {
        wasLocalhost = true;
        console.log("⚠️ LOCALHOST URL DETECTED - Replacing with server IP");

        // Replace localhost with server IP
        url = url.replace(/127\.0\.0\.1/g, PLAYER_CONFIG.SERVER_IP);
        url = url.replace(/localhost/g, PLAYER_CONFIG.SERVER_IP);

        console.log("Original URL:", originalUrl);
        console.log("Fixed URL:", url);
    }

    // Transform old stream servers to new Samsung HTTP/1.1 compatible server
    // livestream.bbnl.in and livestream2.bbnl.in -> livestream3.bbnl.in
    // NOTE: Only rewrite non-fmp4 streams. fmp4.m3u8 streams do NOT exist on livestream3.
    if ((url.includes('livestream.bbnl.in') || url.includes('livestream2.bbnl.in')) && !url.includes('fmp4')) {
        wasOldServer = true;
        console.log("⚠️ OLD STREAM SERVER DETECTED - Switching to Samsung HTTP/1.1 server");

        // Replace old servers with new Samsung-compatible HTTP/1.1 server
        url = url.replace(/livestream2\.bbnl\.in/g, 'livestream3.bbnl.in');
        url = url.replace(/livestream\.bbnl\.in/g, 'livestream3.bbnl.in');

        console.log("Original Server URL:", originalUrl);
        console.log("New Samsung HTTP/1.1 URL:", url);
    }

    return url;
}

// Track if we've hidden the loading indicator for current stream
var hasHiddenLoadingIndicator = false;
var playerErrorPopupOpen = false;

/**
 * Check if the network is disconnected
 * Uses Tizen webapis on real TV, falls back to navigator.onLine in browser
 * @returns {boolean} true if network is disconnected
 */
function isNetworkDisconnected() {
    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            return webapis.network.getActiveConnectionType() === 0;
        }
    } catch (e) {
        console.error("[Player] Network check error:", e);
    }
    return !navigator.onLine;
}

/**
 * Show player error popup
 */
function showPlayerErrorPopup(title, message) {
    var popup = document.getElementById('playerErrorPopup');
    if (popup) {
        var titleEl = document.getElementById('playerErrorTitle');
        var msgEl = document.getElementById('playerErrorMessage');
        if (titleEl) titleEl.textContent = title || 'Playback Error';
        if (msgEl) msgEl.textContent = message || 'Please Check your network and try again';

        // Set error image from API
        var img = document.getElementById('errorImg_player');
        if (img && typeof ErrorImagesAPI !== 'undefined') {
            var key = 'NO_INTERNET_CONNECTION';
            if (title && (title.toLowerCase().includes('signal') || title.toLowerCase().includes('unavailable'))) {
                key = 'SIGNAL_UNAVAILABLE';
            }
            img.src = ErrorImagesAPI.getImageUrl(key);
        }

        popup.style.display = 'flex';
        playerErrorPopupOpen = true;
        setTimeout(function () {
            var btn = document.getElementById('playerRetryBtn');
            if (btn) btn.focus();
        }, 100);
    }
}

/**
 * Hide player error popup
 */
function hidePlayerErrorPopup() {
    var popup = document.getElementById('playerErrorPopup');
    if (popup) {
        popup.style.display = 'none';
        playerErrorPopupOpen = false;
    }
}

/**
 * Show QR Code for subscription renewal on last day
 * Displays a QR code overlay that users can scan to renew
 */
var renewalQRShown = false;
function showRenewalQRCode() {
    // Only show once per session
    if (renewalQRShown) return;
    renewalQRShown = true;

    // Create QR overlay
    var overlay = document.createElement('div');
    overlay.id = 'renewalQROverlay';
    overlay.className = 'renewal-qr-overlay';
    overlay.innerHTML = `
        <div class="renewal-qr-container">
            <div class="renewal-qr-title">⚠️ Subscription Expires Today!</div>
            <div class="renewal-qr-subtitle">Scan the QR code below to renew your subscription</div>
            <div class="renewal-qr-code">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://bbnl.in/renew" alt="Renewal QR Code" id="renewalQRImg">
            </div>
            <div class="renewal-qr-hint">Visit: <strong>bbnl.in/renew</strong></div>
            <div class="renewal-qr-close">Press BACK or OK to close</div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Auto-hide after 15 seconds
    setTimeout(function () {
        hideRenewalQRCode();
    }, 15000);

    // Handle key events to close
    overlay.tabIndex = 0;
    overlay.focus();
    overlay.addEventListener('keydown', function (e) {
        // BACK, OK/Enter, or any navigation key closes the popup
        if (e.keyCode === 10009 || e.keyCode === 13 || e.keyCode === 27 || e.keyCode === 8) {
            hideRenewalQRCode();
            e.preventDefault();
            e.stopPropagation();
        }
    });
}

/**
 * Hide renewal QR code overlay
 */
function hideRenewalQRCode() {
    var overlay = document.getElementById('renewalQROverlay');
    if (overlay) {
        overlay.remove();
    }
}

window.onload = function () {
    console.log("=== Player Initialized ===");

    // Initialize AVPlayer
    if (typeof AVPlayer !== 'undefined') {
        AVPlayer.init({
            callbacks: {
                onBufferingStart: () => {
                    console.log("Buffering...");
                    showBufferingIndicator();
                    hasHiddenLoadingIndicator = false; // Reset flag on new buffering
                },
                onBufferingComplete: () => {
                    console.log("Buffering Done");
                    hideBufferingIndicator();
                    hasHiddenLoadingIndicator = true;
                },
                onError: (e) => {
                    console.error("Player Error:", e);
                    hideBufferingIndicator(); // Hide on error
                    hasHiddenLoadingIndicator = true;
                    if (isNetworkDisconnected()) {
                        showPlayerErrorPopup('Playback Error', 'Network disconnected. Please check your connection and try again.');
                    }
                },
                onStreamCompleted: () => {
                    console.log("Playback Finished");
                },
                onCurrentPlayTime: (time) => {
                    // Update timeline with current playback position (in milliseconds)
                    updateTimeline(time);

                    // CRITICAL: Hide loading indicator once playback starts
                    if (!hasHiddenLoadingIndicator && time > 0) {
                        console.log("✓ Playback started (time > 0), hiding loading indicator");
                        hideBufferingIndicator();
                        hasHiddenLoadingIndicator = true;
                    }
                }
            }
        });
    } else {
        console.error("AVPlayer Module not loaded!");
        showPlayerErrorPopup('Player Error', 'AVPlayer module not loaded. Please restart the app.');
    }

    // Parse URL params
    const urlParams = new URLSearchParams(window.location.search);
    const channelDataStr = urlParams.get('data');
    const channelNameParam = urlParams.get('name');

    if (channelDataStr) {
        try {
            const channel = JSON.parse(decodeURIComponent(channelDataStr));
            setupPlayer(channel);
        } catch (e) {
            console.error("Failed to parse channel data", e);
        }
    } else if (channelNameParam) {
        console.log("Looking up channel by name:", channelNameParam);
        // Will be handled in loadChannelList callback/promise
    } else {
        console.error("No channel data found");
    }

    // Register All Remote Keys (supports all Samsung remote types including media controls)
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            const keys = ["MediaPlay", "MediaPause", "MediaStop", "MediaFastForward", "MediaRewind", "Return", "Enter", "ChannelUp", "ChannelDown", "MediaPlayPause"];
            tizen.tvinputdevice.registerKeyBatch(keys);
        } catch (e) { }
    }

    // Fetch Channel Context for Zapping (and Lookup), then init sidebar
    loadChannelList(channelNameParam).then(function () {
        initializeSidebar();
    });

    // Events
    document.addEventListener("keydown", handleKeydown);

    var backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            closePlayer();
            window.history.back();
        });
    }

    // Player error popup retry button
    var playerRetryBtn = document.getElementById('playerRetryBtn');
    if (playerRetryBtn) {
        playerRetryBtn.addEventListener('click', function () {
            hidePlayerErrorPopup();
            window.location.href = 'channels.html';
        });
    }

    // Note: Visibility change (HOME button) is handled by top-level handler
    // which STOPS video when minimized and redirects to home when resumed
};

var allChannels = [];
var currentIndex = -1;

async function loadChannelList(lookupName = null) {
    try {
        // We reuse the API used in channels page
        let response = await BBNL_API.getChannelList();

        if (Array.isArray(response)) {
            // Sort channels by LCN (channelno) for proper prev/next navigation
            allChannels = response.sort(function (a, b) {
                var aNo = parseInt(a.channelno || a.urno || a.chno || a.ch_no || 0, 10);
                var bNo = parseInt(b.channelno || b.urno || b.chno || b.ch_no || 0, 10);
                return aNo - bNo;
            });
            console.log("Player: Loaded " + allChannels.length + " channels for zapping (sorted by LCN).");

            // IF lookupName is provided, find it and play
            if (lookupName) {
                const found = allChannels.find(ch => {
                    const cName = (ch.chtitle || ch.channel_name || "").toLowerCase();
                    return cName.includes(lookupName.toLowerCase()); // Fuzzy match
                });

                if (found) {
                    console.log("Found channel from name param:", found);
                    setupPlayer(found);
                    return; // setupPlayer handles index finding too
                }
            }

            // Find current index based on what was already setup (if any)
            const currentName = document.getElementById("ui-channel-name").innerText;
            if (currentName) {
                currentIndex = allChannels.findIndex(ch =>
                    (ch.chtitle || ch.channel_name) === currentName
                );

                // Update expiry info from merged data (URL params don't have expirydate)
                if (currentIndex >= 0 && allChannels[currentIndex]) {
                    updateExpiryDisplay(allChannels[currentIndex]);
                }
            }

            // Check if channels have expiry data — if not, refresh after background merge
            var hasExpiry = allChannels.some(function (ch) {
                return ch.expirydate && String(ch.expirydate).trim() !== "";
            });

            if (!hasExpiry) {
                // Background merge is running — wait and re-fetch updated cache
                setTimeout(async function () {
                    try {
                        var freshData = await BBNL_API.getChannelList();
                        if (Array.isArray(freshData) && freshData.length > 0) {
                            allChannels = freshData.sort(function (a, b) {
                                var aNo = parseInt(a.channelno || a.urno || a.chno || a.ch_no || 0, 10);
                                var bNo = parseInt(b.channelno || b.urno || b.chno || b.ch_no || 0, 10);
                                return aNo - bNo;
                            });

                            // Update sidebar with expiry data
                            if (sidebarState && sidebarState.allChannelsCache) {
                                sidebarState.allChannelsCache = allChannels;
                            }

                            // Update current channel expiry display
                            if (currentIndex >= 0 && allChannels[currentIndex]) {
                                updateExpiryDisplay(allChannels[currentIndex]);
                            }

                            console.log("[Player] Channels refreshed with expiry data");
                        }
                    } catch (e) {
                        console.warn("[Player] Expiry refresh failed:", e.message);
                    }
                }, 3000);
            }
        }
    } catch (e) {
        console.error("Failed to load channel list in player", e);
    }
}

/**
 * Update expiry display with real data from expiringchnl_list API
 */
function updateExpiryDisplay(channel) {
    var uiExpiry = document.getElementById("ui-expiry");
    if (!uiExpiry) return;

    var channelPrice = parseFloat(channel.chprice || channel.chPrice || channel.price || 0);

    // Remove all previous expiry classes
    uiExpiry.classList.remove('expiry-free', 'expiry-active', 'expiry-warning', 'expiry-urgent', 'expiry-critical', 'expiry-expired');

    if (channelPrice === 0) {
        uiExpiry.innerText = "N/A";
        uiExpiry.classList.add('expiry-free');
    } else if (channel.expirydate && channel.expirydate.trim() !== "") {
        var expiryDate = new Date(channel.expirydate);
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        expiryDate.setHours(0, 0, 0, 0);
        var diffTime = expiryDate - today;
        var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 7) {
            uiExpiry.innerText = diffDays + " days";
            uiExpiry.classList.add('expiry-active');
        } else if (diffDays >= 4 && diffDays <= 7) {
            uiExpiry.innerText = diffDays + " days";
            uiExpiry.classList.add('expiry-urgent');
        } else if (diffDays >= 2 && diffDays <= 3) {
            uiExpiry.innerText = diffDays + " days";
            uiExpiry.classList.add('expiry-warning');
        } else if (diffDays === 1) {
            uiExpiry.innerText = "1 day";
            uiExpiry.classList.add('expiry-critical');
        } else if (diffDays === 0) {
            uiExpiry.innerText = "Today";
            uiExpiry.classList.add('expiry-critical');
        } else {
            uiExpiry.innerText = "Expired";
            uiExpiry.classList.add('expiry-expired');
        }
        console.log("[Player] Expiry updated: " + channel.expirydate + " (" + diffDays + " days)");
    } else {
        uiExpiry.innerText = "Active";
        uiExpiry.classList.add('expiry-active');
    }
}

function setupPlayer(channel) {
    console.log("=== Setting up player for channel ===", channel);

    // ==========================================
    // POPULATE ALL UI ELEMENTS DYNAMICALLY
    // ==========================================

    // Channel Name
    const chName = channel.channel_name || channel.chtitle || "Unknown Channel";
    const uiName = document.getElementById("ui-channel-name");
    if (uiName) uiName.innerText = chName;

    // Channel Number
    const channelNum = channel.channelno || channel.urno || channel.chno || channel.ch_no || channel.id || "000";
    const uiNum = document.getElementById("ui-channel-number");
    if (uiNum) uiNum.innerText = channelNum;

    // Channel Logo - immediately clear old logo to prevent stale display
    var LOGO_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23667eea' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23fff' font-size='20' font-weight='bold'%3ETV%3C/text%3E%3C/svg%3E";
    const logo = channel.logo_url || channel.chlogo || channel.logo;
    const uiLogo = document.getElementById("ui-channel-logo");
    if (uiLogo) {
        // Immediately show placeholder to clear previous channel's logo
        uiLogo.src = LOGO_PLACEHOLDER;
        uiLogo.onerror = null;

        if (logo && logo.trim() !== "" && !logo.includes('chnlnoimage')) {
            console.log("Setting channel logo:", logo);
            // Preload the new logo off-screen, then swap once ready
            var preloader = new Image();
            preloader.onload = function () {
                uiLogo.src = logo;
            };
            preloader.onerror = function () {
                console.warn("Logo failed to load:", logo);
                uiLogo.src = LOGO_PLACEHOLDER;
            };
            preloader.src = logo;
        }
    }

    // Expiry Date - use shared function
    updateExpiryDisplay(channel);

    // Program Title (Live Stream)
    const uiTitle = document.getElementById("ui-program-title");
    if (uiTitle) {
        uiTitle.innerText = "Live Stream: " + chName;
    }

    // Program Time (Show as LIVE for live streams)
    const uiProgramTime = document.getElementById("ui-program-time");
    if (uiProgramTime) {
        uiProgramTime.innerHTML = '<span style="color: #ef4444;">●</span> LIVE';
    }

    // Next Program (Not available from API)
    const uiNext = document.getElementById("ui-next");
    if (uiNext) {
        uiNext.innerText = "--";
    }

    // ==========================================
    // FOOTER STATUS BAR
    // ==========================================

    // EPG (use channel ID or provider)
    const uiEpg = document.getElementById("ui-epg");
    if (uiEpg) {
        const epgId = channel.chid || channel.provider || chName.substring(0, 10).toUpperCase();
        uiEpg.innerText = epgId;
    }

    // Status (Subscription status and price)
    const uiStatus = document.getElementById("ui-status");
    const uiSubscription = document.getElementById("ui-subscription");
    
    const isSubscribed = channel.subscribed === "yes" || channel.subscribed === "1" ||
        channel.subscribed === true || channel.subscribed === 1;
    const price = channel.chprice || channel.chPrice || channel.price || "0.00";

    // Update ui-status if exists
    if (uiStatus) {
        if (isSubscribed) {
            if (parseFloat(price) > 0) {
                uiStatus.innerText = "Pay($" + price + "/mo)";
                uiStatus.style.color = "#10b981"; // Green for paid subscription
            } else {
                uiStatus.innerText = "Subscribed (Free)";
                uiStatus.style.color = "#10b981"; // Green
            }
        } else {
            uiStatus.innerText = "Not Subscribed";
            uiStatus.style.color = "#ef4444"; // Red
        }
    }

    // Update ui-subscription (info bar center section)
    if (uiSubscription) {
        // Remove existing classes
        uiSubscription.classList.remove('subscribed-yes', 'subscribed-no');
        
        if (isSubscribed) {
            uiSubscription.innerText = "Yes";
            uiSubscription.classList.add('subscribed-yes');
        } else {
            uiSubscription.innerText = "No";
            // subscribed-no is default styling (red)
        }
    }
    
    // Update Price display
    const uiPrice = document.getElementById("ui-price");
    if (uiPrice) {
        uiPrice.classList.remove('price-paid');
        const priceVal = parseFloat(price) || 0;
        if (priceVal > 0) {
            uiPrice.innerText = "₹" + priceVal.toFixed(2);
            uiPrice.classList.add('price-paid');
        } else {
            uiPrice.innerText = "Free";
            // Default green color for Free
        }
    }

    // Update Device ID display (real TV DUID, not API serial number)
    const uiDeviceId = document.getElementById("ui-device-id");
    if (uiDeviceId) {
        try {
            if (typeof webapis !== 'undefined' && webapis.productinfo) {
                var duid = webapis.productinfo.getDuid();
                uiDeviceId.innerText = duid || "Unknown";
            } else {
                uiDeviceId.innerText = "Emulator / Web";
            }
        } catch (e) {
            uiDeviceId.innerText = "Not available";
        }
    }

    // User Info (from session)
    const uiUser = document.getElementById("ui-user");
    if (uiUser) {
        const userData = AuthAPI.getUserData();
        if (userData && (userData.userid || userData.userId || userData.username)) {
            const userId = userData.userid || userData.userId || userData.username || "user";
            uiUser.innerText = userId;
        } else {
            uiUser.innerText = "guest";
        }
    }

    // User Info in info bar (new element)
    const uiUserInfo = document.getElementById("ui-user-info");
    if (uiUserInfo) {
        const userData = AuthAPI.getUserData();
        if (userData) {
            const mobile = userData.mobile || "";
            const username = userData.userid || userData.userId || userData.username || "User";
            if (mobile) {
                uiUserInfo.innerText = "User: " + mobile;
            } else {
                uiUserInfo.innerText = "User: " + username;
            }
        } else {
            uiUserInfo.innerText = "User: Guest";
        }
    }

    // TV ID (from DeviceInfo)
    const uiTvId = document.getElementById("ui-tvid");
    if (uiTvId) {
        if (typeof DeviceInfo !== 'undefined' && DeviceInfo.devslno) {
            uiTvId.innerText = DeviceInfo.devslno;
        } else {
            uiTvId.innerText = "TV-" + Math.random().toString(36).substring(2, 8).toUpperCase();
        }
    }

    // Current Date and Time (live updating)
    updateDateTime();
    // Update time every second
    playerDateTimeInterval = setInterval(updateDateTime, 1000);

    // Update Index if list loaded
    if (allChannels.length > 0) {
        currentIndex = allChannels.findIndex(ch => (ch.chtitle || ch.channel_name) === chName);
    }

    const streamUrl = channel.streamlink || channel.channel_url;
    const isDVBChannel = streamUrl && streamUrl.toLowerCase().startsWith('dvb://');

    console.log("=== 🔍 STREAM URL DEBUG ===");
    console.log("Channel:", chName);
    console.log("Raw stream URL:", streamUrl);
    console.log("Stream URL type:", typeof streamUrl);
    console.log("Stream URL length:", streamUrl ? streamUrl.length : 0);
    console.log("Is DVB/FTA channel:", isDVBChannel);
    if (streamUrl) {
        console.log("First 100 chars:", streamUrl.substring(0, 100));
        console.log("Starts with http:", streamUrl.startsWith('http'));
        console.log("Starts with dvb:", streamUrl.toLowerCase().startsWith('dvb://'));
        console.log("Contains localhost:", streamUrl.includes('127.0.0.1') || streamUrl.includes('localhost'));
        console.log("Contains m3u8:", streamUrl.includes('m3u8'));
        console.log("Contains mpd:", streamUrl.includes('mpd'));
    }
    console.log("========================");


    if (!streamUrl) {
        const errorMsg = "No Stream URL found for channel: " + chName;
        console.warn(errorMsg);
        showPlayerErrorPopup('No Stream Available', 'Stream URL not available for ' + chName + '. Please try another channel.');
        return;
    }

    // For DVB/FTA channels, use the URL as-is
    var fixedStreamUrl = streamUrl;

    if (!isDVBChannel) {
        // ⚠️ FIX LOCALHOST URLs - Replace 127.0.0.1 with server IP (only for IPTV streams)
        fixedStreamUrl = fixLocalhostUrl(streamUrl);

        // Update debug logging with fixed URL
        console.log("=== ✅ FINAL STREAM URL ===");
        console.log("Stream URL (after fix):", fixedStreamUrl);
        console.log("Contains localhost:", fixedStreamUrl.includes('127.0.0.1') || fixedStreamUrl.includes('localhost'));
        console.log("========================");

        // Validate stream URL format (using fixed URL) - only for IPTV streams
        if (!fixedStreamUrl.startsWith('http://') && !fixedStreamUrl.startsWith('https://')) {
            const errorMsg = "Invalid stream URL format: " + streamUrl;
            console.error(errorMsg);
            showPlayerErrorPopup('Invalid Stream', 'Invalid stream URL format. Please try another channel.');
            return;
        }
    } else {
        console.log("=== 📡 DVB/FTA CHANNEL ===");
        console.log("DVB URL:", fixedStreamUrl);
        console.log("Full screen playback will be handled by TV tuner");
        console.log("========================");
    }

    if (typeof AVPlayer !== 'undefined' && AVPlayer.isTizen()) {
        console.log("Using AVPlayer (Tizen mode)");
        if (isDVBChannel) {
            console.log("📡 FTA channel - using TV Window for full screen playback");
        }

        // Show loading indicator immediately
        showBufferingIndicator();

        try {
            // Use the FIXED stream URL (with localhost replaced for IPTV, or DVB URL for FTA)
            AVPlayer.changeStream(fixedStreamUrl);
            console.log("AVPlayer.changeStream called successfully with URL:", fixedStreamUrl);
        } catch (error) {
            console.error("Error calling AVPlayer.changeStream:", error);
            hideBufferingIndicator();
            showPlayerErrorPopup('Playback Error', 'Error starting playback. Please try another channel.');
        }
    } else {
        // Fallback or Test Mode
        console.warn("Non-Tizen Environment: Using Fallback HTML5 Video");

        if (isDVBChannel) {
            console.warn("DVB/FTA channels cannot be played in browser - requires Samsung TV tuner");
            showPlayerErrorPopup('FTA Not Available', 'FTA channels require Samsung TV with antenna connection.');
            return;
        }

        const v = document.getElementById("video-player");
        if (v) {
            // Use the FIXED stream URL
            v.src = fixedStreamUrl;
            v.play().catch(function (error) {
                console.error("HTML5 video play error:", error);
            });
        }
    }

    // Load stream ads for this channel (non-blocking)
    var chid = channel.chid || channel.channelno || channel.urno || "";
    if (chid) {
        setTimeout(function () {
            loadStreamAds(String(chid));
        }, 3000); // Delay 3 seconds to let stream start first
    }
}

// ==========================================
// STREAM ADS - Right side ad overlay
// ==========================================
var streamAdTimer = null;
var streamAdRotateTimer = null;
var streamAdAds = [];
var streamAdCurrentIndex = 0;

/**
 * Load and display stream ads for the current channel
 * @param {String} chid - Channel ID
 */
function loadStreamAds(chid) {
    // Clear any existing timers
    clearStreamAdTimers();

    console.log("[StreamAd] Loading ads for chid:", chid);

    AdsAPI.getStreamAds(chid)
        .then(function (ads) {
            if (ads && ads.length > 0) {
                console.log("[StreamAd] Got", ads.length, "stream ad(s)");
                streamAdAds = ads;
                streamAdCurrentIndex = 0;
                showStreamAd();
            } else {
                console.log("[StreamAd] No stream ads available");
                hideStreamAd();
            }
        })
        .catch(function (err) {
            console.error("[StreamAd] Failed to load:", err);
        });
}

/**
 * Show the stream ad panel with the current ad
 */
function showStreamAd() {
    var panel = document.getElementById('streamAdPanel');
    var img = document.getElementById('streamAdImage');
    if (!panel || !img || streamAdAds.length === 0) return;

    var ad = streamAdAds[streamAdCurrentIndex];
    var adUrl = ad.adpath || ad.adimage || ad.image || '';

    if (!adUrl) {
        console.log("[StreamAd] No ad URL, hiding panel");
        hideStreamAd();
        return;
    }

    img.src = adUrl;
    img.onerror = function () {
        console.warn("[StreamAd] Image failed to load:", adUrl);
        hideStreamAd();
    };

    panel.style.display = 'flex';
    panel.style.animation = 'streamAdSlideIn 0.5s ease-out';
    console.log("[StreamAd] Showing ad:", adUrl);

    // Auto-rotate if multiple ads (every 8 seconds)
    if (streamAdAds.length > 1) {
        streamAdRotateTimer = setInterval(function () {
            streamAdCurrentIndex = (streamAdCurrentIndex + 1) % streamAdAds.length;
            var nextAd = streamAdAds[streamAdCurrentIndex];
            var nextUrl = nextAd.adpath || nextAd.adimage || nextAd.image || '';
            if (nextUrl && img) {
                img.src = nextUrl;
                console.log("[StreamAd] Rotated to ad:", nextUrl);
            }
        }, 8000);
    }

    // Auto-hide after 30 seconds, then reload after 60 seconds
    streamAdTimer = setTimeout(function () {
        hideStreamAd();
        // Reload ads after a pause
        setTimeout(function () {
            if (streamAdAds.length > 0) {
                showStreamAd();
            }
        }, 60000);
    }, 30000);
}

/**
 * Hide the stream ad panel
 */
function hideStreamAd() {
    var panel = document.getElementById('streamAdPanel');
    if (panel) {
        panel.style.animation = 'streamAdSlideOut 0.5s ease-in';
        setTimeout(function () {
            panel.style.display = 'none';
        }, 500);
    }
    clearStreamAdTimers();
}

/**
 * Clear all stream ad timers
 */
function clearStreamAdTimers() {
    if (streamAdTimer) {
        clearTimeout(streamAdTimer);
        streamAdTimer = null;
    }
    if (streamAdRotateTimer) {
        clearInterval(streamAdRotateTimer);
        streamAdRotateTimer = null;
    }
}

function changeChannel(step) {
    if (allChannels.length === 0) return;

    let nextIndex = currentIndex + step;

    // Wrap around
    if (nextIndex >= allChannels.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = allChannels.length - 1;

    var nextCh = allChannels[nextIndex];
    var nextLCN = nextCh.channelno || nextCh.urno || nextCh.chno || nextCh.ch_no || "";
    console.log("Zapping to channel LCN:", nextLCN, "index:", nextIndex, "name:", nextCh.chtitle || nextCh.channel_name);
    setupPlayer(nextCh);

    // Show info bar for 5 seconds when channel is changed
    showOverlay();
}

function closePlayer() {
    clearStreamAdTimers();
    hideStreamAd();
    if (typeof AVPlayer !== 'undefined') {
        AVPlayer.destroy();
    }
}

// ==========================================
// LOGO CACHE - Cache loaded logos in memory
// Prevents re-downloading when sidebar re-renders
// ==========================================
var _logoCache = {};  // URL → true (marks as loaded, browser HTTP cache handles actual data)
var _sidebarLazyObserver = null;

function initSidebarLazyLoading() {
    if (_sidebarLazyObserver) {
        _sidebarLazyObserver.disconnect();
    }

    var container = document.getElementById('channelsList');
    if (!container) return;

    var lazyImages = container.querySelectorAll('img.sidebar-lazy-logo');
    if (lazyImages.length === 0) return;

    if ('IntersectionObserver' in window) {
        _sidebarLazyObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    var img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        img.addEventListener('load', function () {
                            _logoCache[img.src] = true;
                        }, { once: true });
                    }
                    _sidebarLazyObserver.unobserve(img);
                }
            });
        }, {
            root: container,       // Observe within the scrollable sidebar
            rootMargin: '200px'    // Pre-load 200px ahead
        });

        lazyImages.forEach(function (img) {
            _sidebarLazyObserver.observe(img);
        });
        console.log("[Sidebar] Lazy loading initialized for", lazyImages.length, "logos");
    } else {
        // Fallback: load all
        lazyImages.forEach(function (img) {
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            }
        });
    }
}

// ==========================================
// PLAYER SIDEBAR - 2-LEVEL DYNAMIC DESIGN
// ==========================================

// Auto-hide timer configuration
const OVERLAY_HIDE_DELAY = 5000; // 5 seconds
const SIDEBAR_HIDE_DELAY = 5000; // 5 seconds

// Timers
var overlayTimeout = null;
var sidebarInactivityTimer = null;

// Sidebar state - 2-Level Navigation (Language → Categories → Channels)
var sidebarState = {
    isOpen: false,
    currentLevel: 'categories', // 'language', 'categories', or 'channels'
    languageIndex: 0,
    categoryIndex: 0,
    channelIndex: 0,
    languages: [
        { name: 'All Channels', code: 'all' },
        { name: 'Subscribed Channels', code: 'subscribed' }
        // More languages loaded dynamically from API
    ],
    categories: [],
    channels: [],
    allChannelsCache: [] // Cache all channels for filtering
};

// Initialize sidebar with dynamic languages and categories
async function initializeSidebar() {
    var sidebar = document.getElementById('playerSidebar');
    if (!sidebar) return;

    // Load languages dynamically from channel data
    await loadLanguagesFromChannels();

    // Setup language arrow navigation
    setupLanguageArrowNavigation();

    // Load available channels
    loadSidebarChannels();

    console.log("[Sidebar] Initialized with", sidebarState.languages.length, "languages");
}

/**
 * Load languages dynamically from channel data
 */
async function loadLanguagesFromChannels() {
    // Channels are already loaded by loadChannelList() before initializeSidebar() is called
    if (!allChannels || allChannels.length === 0) {
        return;
    }

    // Build languages array with special entries first
    sidebarState.languages = [
        { name: 'All Channels', code: 'all' },
        { name: 'Subscribed Channels', code: 'subscribed' }
    ];

    // Try to fetch languages from API first
    try {
        var apiLanguages = await BBNL_API.getLanguageList();
        if (apiLanguages && apiLanguages.length > 0) {
            console.log("[Sidebar] Got", apiLanguages.length, "languages from API");
            
            // Add languages from API (skip duplicates of built-in entries)
            apiLanguages.forEach(function(lang) {
                var langName = lang.langtitle || lang.langname || lang.title || lang.name || '';
                var langId = lang.langid || lang.id || '';

                if (langName && langName.trim() !== '') {
                    var lower = langName.trim().toLowerCase();
                    // Skip if it matches built-in entries
                    if (lower === 'all channels' || lower === 'all' ||
                        lower === 'subscribed' || lower === 'subscribed channels' ||
                        lower.includes('subscribed')) {
                        return;
                    }
                    sidebarState.languages.push({
                        name: langName.trim(),
                        code: langId.toString(),
                        langid: langId
                    });
                }
            });
            
            console.log("[Sidebar] Loaded", sidebarState.languages.length, "languages (including All/Subscribed)");
            return;
        }
    } catch (e) {
        console.warn("[Sidebar] Failed to get languages from API:", e);
    }

    // Fallback: Extract unique languages from channel data
    var languageSet = new Set();
    allChannels.forEach(function(ch) {
        // Try multiple possible language fields
        var lang = ch.lalng || ch.langtitle || ch.langname || ch.language || ch.lang || '';
        if (lang && lang.trim() !== '') {
            languageSet.add(lang.trim());
        }
    });

    // Add dynamic languages from channel data (skip duplicates of built-in entries)
    languageSet.forEach(function(lang) {
        var lower = lang.toLowerCase();
        if (lower === 'all channels' || lower === 'all' ||
            lower === 'subscribed' || lower === 'subscribed channels' ||
            lower.includes('subscribed')) {
            return;
        }
        sidebarState.languages.push({
            name: lang,
            code: lang.toLowerCase()
        });
    });
    
    console.log("[Sidebar] Loaded", sidebarState.languages.length, "languages from channels (fallback)");
}

/**
 * Setup language arrow navigation buttons
 */
function setupLanguageArrowNavigation() {
    var leftArrow = document.getElementById('langNavLeft');
    var rightArrow = document.getElementById('langNavRight');

    if (leftArrow) {
        leftArrow.addEventListener('click', function() {
            changeLanguage(-1);
        });
    }

    if (rightArrow) {
        rightArrow.addEventListener('click', function() {
            changeLanguage(1);
        });
    }

    // Update initial display
    updateLanguageDisplay();
}

/**
 * Change language by direction (-1 = prev, +1 = next)
 */
function changeLanguage(direction) {
    var newIndex = sidebarState.languageIndex + direction;

    // Wrap around
    if (newIndex < 0) {
        newIndex = sidebarState.languages.length - 1;
    } else if (newIndex >= sidebarState.languages.length) {
        newIndex = 0;
    }

    sidebarState.languageIndex = newIndex;
    sidebarState.categoryIndex = 0;
    sidebarState.channelIndex = 0;

    // Update display
    updateLanguageDisplay();

    // Rebuild categories and channels for new language
    buildCategoriesForLanguage();

    console.log("[Sidebar] Language changed to:", sidebarState.languages[newIndex].name);
}

/**
 * Update language display in navigation header
 */
function updateLanguageDisplay() {
    var langNameEl = document.getElementById('langNavName');
    if (langNameEl && sidebarState.languages[sidebarState.languageIndex]) {
        langNameEl.textContent = sidebarState.languages[sidebarState.languageIndex].name;
    }
}

/**
 * Build categories dynamically based on selected language
 */
function buildCategoriesForLanguage() {
    var currentLang = sidebarState.languages[sidebarState.languageIndex];
    var filteredChannels = getFilteredChannelsByLanguage();

    // Extract unique categories with counts
    var categoryMap = {};
    filteredChannels.forEach(function(ch) {
        var cat = ch.grtitle || ch.category || ch.genre || 'Miscellaneous';
        if (!categoryMap[cat]) {
            categoryMap[cat] = 0;
        }
        categoryMap[cat]++;
    });

    // Convert to array - filter out any category named "Subscribed" to avoid duplicate with language header
    sidebarState.categories = Object.keys(categoryMap)
        .filter(function(catName) {
            // Skip categories that duplicate language names
            var lowerCat = catName.toLowerCase();
            return lowerCat !== 'subscribed' && lowerCat !== 'all channels' && lowerCat !== 'subscribed channels';
        })
        .map(function(catName) {
            return {
                name: catName,
                count: categoryMap[catName]
            };
        });

    // Sort by count (descending)
    sidebarState.categories.sort(function(a, b) {
        return b.count - a.count;
    });

    // Check if we should hide categories section
    var categoriesSection = document.getElementById('sidebarCategoriesSection');
    
    if (sidebarState.categories.length <= 1) {
        // Only 1 category or less - hide category list, show channels directly
        if (categoriesSection) categoriesSection.style.display = 'none';
        
        // Auto-select the single category (or show all channels)
        sidebarState.categoryIndex = 0;
        
        // For single category, show all filtered channels directly
        sidebarState.channels = filteredChannels;
        renderChannelsList();
        
        console.log("[Sidebar] Single/no category - showing channels directly");
    } else {
        // Multiple categories - show category list
        if (categoriesSection) categoriesSection.style.display = 'block';
        
        // Render categories
        renderCategoriesList();
        
        // Auto-select first category and show its channels
        sidebarState.categoryIndex = 0;
        filterChannelsByCategory();
        renderChannelsList();
    }
    
    console.log("[Sidebar] Built", sidebarState.categories.length, "categories for", currentLang.name);
}

/**
 * Get channels filtered by current language
 */
function getFilteredChannelsByLanguage() {
    var currentLang = sidebarState.languages[sidebarState.languageIndex];
    
    if (currentLang.code === 'all') {
        return sidebarState.allChannelsCache;
    }
    
    if (currentLang.code === 'subscribed') {
        return sidebarState.allChannelsCache.filter(function(ch) {
            return ch.subscribed === true || ch.subscribed === 'yes' || ch.is_subscribed === true || ch.subscribed === '1';
        });
    }
    
    // Filter by language - try langid first, then language name
    return sidebarState.allChannelsCache.filter(function(ch) {
        // If we have a langid, use it for matching
        if (currentLang.langid) {
            var chLangId = ch.langid || ch.lang_id || '';
            return chLangId.toString() === currentLang.langid.toString();
        }
        
        // Fallback: match by language name
        var chLang = (ch.lalng || ch.langtitle || ch.langname || ch.language || ch.lang || '').toLowerCase();
        var langCode = currentLang.code.toLowerCase();
        var langName = currentLang.name.toLowerCase();
        
        return chLang === langCode || chLang === langName || chLang.includes(langCode);
    });
}

/**
 * Render categories list
 */
function renderCategoriesList() {
    var container = document.getElementById('categoriesList');
    if (!container) return;

    container.innerHTML = '';

    sidebarState.categories.forEach(function(cat, index) {
        var btn = document.createElement('button');
        btn.className = 'category-item focusable';
        btn.tabIndex = 0;
        btn.dataset.categoryIndex = index;

        var nameSpan = document.createElement('span');
        nameSpan.className = 'category-name';
        nameSpan.textContent = cat.name;

        var countSpan = document.createElement('span');
        countSpan.className = 'category-count';
        countSpan.textContent = '(' + cat.count + ')';

        btn.appendChild(nameSpan);
        btn.appendChild(countSpan);

        if (index === sidebarState.categoryIndex) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', function() {
            selectCategory(index);
        });

        container.appendChild(btn);
    });

    console.log("[Sidebar] Rendered", sidebarState.categories.length, "categories");
}

/**
 * Select a category and update channels
 */
function selectCategory(index) {
    if (index < 0 || index >= sidebarState.categories.length) return;

    sidebarState.categoryIndex = index;
    sidebarState.channelIndex = 0;

    // Update active category highlight
    var categories = document.querySelectorAll('.category-item');
    categories.forEach(function(cat, i) {
        if (i === index) {
            cat.classList.add('active');
        } else {
            cat.classList.remove('active');
        }
    });

    // Filter channels by language and category
    filterChannelsByCategory();

    // Update channels section title
    updateChannelsSectionTitle();

    // Render updated channels list
    renderChannelsList();

    console.log("[Sidebar] Selected category:", sidebarState.categories[index].name);
}

/**
 * Update channels section title with category name
 */
function updateChannelsSectionTitle() {
    var titleEl = document.getElementById('channelsSectionTitle');
    if (titleEl && sidebarState.categories[sidebarState.categoryIndex]) {
        titleEl.textContent = sidebarState.categories[sidebarState.categoryIndex].name + ' Channels';
    }
}

/**
 * Filter channels by current language and selected category
 */
function filterChannelsByCategory() {
    var langFiltered = getFilteredChannelsByLanguage();
    var selectedCat = sidebarState.categories[sidebarState.categoryIndex];

    if (!selectedCat) {
        sidebarState.channels = langFiltered;
        return;
    }

    sidebarState.channels = langFiltered.filter(function(ch) {
        var chCat = ch.grtitle || ch.category || ch.genre || 'Miscellaneous';
        return chCat === selectedCat.name;
    });

    console.log("[Sidebar] Filtered to", sidebarState.channels.length, "channels for", selectedCat.name);
}

/**
 * Load channels for sidebar (uses existing allChannels from player)
 */
function loadSidebarChannels() {
    if (!allChannels || allChannels.length === 0) {
        return;
    }

    // Cache all channels
    sidebarState.allChannelsCache = allChannels;

    // Build categories for current language
    buildCategoriesForLanguage();
    
    console.log("[Sidebar] Loaded", allChannels.length, "channels");
}

/**
 * Render channels list in HTML - Logo + Name + Price + LCN layout
 */
function renderChannelsList() {
    var container = document.getElementById('channelsList');
    if (!container) return;

    container.innerHTML = '';

    // Show message if no channels
    if (sidebarState.channels.length === 0) {
        var emptyMsg = document.createElement('div');
        emptyMsg.className = 'no-channels-message';
        emptyMsg.textContent = 'No channels available';
        emptyMsg.style.cssText = 'padding: 30px 20px; text-align: center; color: rgba(255,255,255,0.5); font-size: 15px;';
        container.appendChild(emptyMsg);
        return;
    }

    sidebarState.channels.forEach(function (ch, index) {
        var btn = document.createElement('button');
        btn.className = 'channel-item focusable';
        btn.tabIndex = 0;
        btn.dataset.channelIndex = index;

        // Channel Logo (left) - with cache + lazy loading
        var logoDiv = document.createElement('div');
        logoDiv.className = 'channel-item-logo';
        var logoUrl = ch.logo_url || ch.chlogo || ch.logo || '';
        if (logoUrl && logoUrl.trim() !== '') {
            var logoImg = document.createElement('img');
            logoImg.alt = ch.chtitle || 'Channel';
            logoImg.onerror = function() {
                this.style.display = 'none';
                var placeholder = document.createElement('span');
                placeholder.className = 'logo-placeholder';
                placeholder.textContent = (ch.chtitle || 'CH').substring(0, 2).toUpperCase();
                this.parentNode.appendChild(placeholder);
            };
            // If already cached in memory, load immediately (browser HTTP cache serves it)
            if (_logoCache[logoUrl]) {
                logoImg.src = logoUrl;
            } else {
                // Lazy load: defer until visible in sidebar scroll
                logoImg.dataset.src = logoUrl;
                logoImg.className = 'sidebar-lazy-logo';
            }
            logoDiv.appendChild(logoImg);
        } else {
            var placeholder = document.createElement('span');
            placeholder.className = 'logo-placeholder';
            placeholder.textContent = (ch.chtitle || 'CH').substring(0, 2).toUpperCase();
            logoDiv.appendChild(placeholder);
        }

        // Channel Info (name + price)
        var infoDiv = document.createElement('div');
        infoDiv.className = 'channel-item-info';

        var nameDiv = document.createElement('div');
        nameDiv.className = 'channel-item-name';
        nameDiv.textContent = ch.chtitle || ch.channel_name || 'Unknown';

        var priceDiv = document.createElement('div');
        priceDiv.className = 'channel-item-price';
        var price = parseFloat(ch.chprice || ch.chPrice || ch.price || 0);
        priceDiv.textContent = '₹' + price.toFixed(2);

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(priceDiv);

        // LCN Number (right)
        var lcnDiv = document.createElement('div');
        lcnDiv.className = 'channel-item-lcn';
        lcnDiv.textContent = ch.channelno || ch.urno || ch.chno || '--';

        btn.appendChild(logoDiv);
        btn.appendChild(infoDiv);
        btn.appendChild(lcnDiv);

        if (index === sidebarState.channelIndex) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', function () {
            playChannelFromSidebar(ch);
        });

        container.appendChild(btn);
    });

    console.log("[Sidebar] Rendered", sidebarState.channels.length, "channels");

    // Initialize lazy loading for logos not yet in cache
    initSidebarLazyLoading();
}

/**
 * Toggle sidebar visibility
 */
function toggleSidebar() {
    var sidebar = document.getElementById('playerSidebar');
    if (!sidebar) return;

    if (sidebarState.isOpen) {
        closeSidebar();
    } else {
        openSidebar();
    }
}

/**
 * Open sidebar only - info bar stays hidden
 * LEFT button triggers this
 */
function openSidebar() {
    var sidebar = document.getElementById('playerSidebar');
    if (!sidebar) return;

    sidebarState.isOpen = true;
    sidebar.classList.add('open');
    sidebar.classList.remove('close');

    // IMPORTANT: Hide info bar when sidebar opens via LEFT
    hideOverlay();

    // Start at categories level
    sidebarState.currentLevel = 'categories';

    // Focus first category or first channel if no categories
    var categoriesSection = document.getElementById('sidebarCategoriesSection');
    var categoriesHidden = categoriesSection && categoriesSection.style.display === 'none';

    if (categoriesHidden) {
        var firstChannel = document.querySelector('.channel-item');
        if (firstChannel) {
            sidebarState.currentLevel = 'channels';
            sidebarState.channelIndex = 0;
            focusChannelItem(0);
        }
    } else {
        var firstCat = document.querySelector('.category-item');
        if (firstCat) {
            firstCat.focus();
            sidebarState.categoryIndex = 0;
        }
    }

    // Sidebar auto-hide after 5s inactivity
    resetSidebarInactivityTimer();

    console.log("[Sidebar] Opened - sidebar only, no info bar");
}

/**
 * Close sidebar only - does NOT affect info bar
 */
function closeSidebar() {
    var sidebar = document.getElementById('playerSidebar');
    if (!sidebar) return;

    sidebarState.isOpen = false;
    sidebar.classList.add('close');
    setTimeout(function () {
        sidebar.classList.remove('open', 'close');
    }, 300);

    clearSidebarInactivityTimer();

    console.log("[Sidebar] Closed");
}

/**
 * Reset sidebar inactivity timer
 * Called on every key press while sidebar is open
 * Timer resets at ALL navigation levels (language, categories, channels)
 */
function resetSidebarInactivityTimer() {
    clearSidebarInactivityTimer();

    if (!sidebarState.isOpen) {
        return;
    }

    // Auto-close sidebar after 5 seconds of inactivity
    sidebarInactivityTimer = setTimeout(function () {
        console.log("[Sidebar] Inactivity timeout (5s) - auto-closing sidebar");
        closeSidebar();
    }, SIDEBAR_HIDE_DELAY);
}

/**
 * Clear sidebar inactivity timer
 */
function clearSidebarInactivityTimer() {
    if (sidebarInactivityTimer) {
        clearTimeout(sidebarInactivityTimer);
        sidebarInactivityTimer = null;
    }
}

// ==========================================
// SHARED UI TIMER - Sidebar + Info Bar sync
// ==========================================
var uiTimer = null;

/**
 * Show both sidebar and info bar together, start shared 5-second timer
 */
function showPlayerUI() {
    var sidebar = document.getElementById('playerSidebar');
    var overlay = document.querySelector('.player-overlay');
    var infoBar = document.querySelector('.info-bar-premium');

    // Show sidebar
    if (sidebar) {
        sidebarState.isOpen = true;
        sidebar.classList.add('open');
        sidebar.classList.remove('close');
    }

    // Show info bar
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
    }

    // Add sidebar-active class to shift info bar
    if (infoBar) {
        infoBar.classList.add('sidebar-active');
    }

    // Clear any independent overlay timer - sidebar controls info bar
    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
        overlayTimeout = null;
    }

    // Start shared timer
    resetUITimer();
    console.log("[PlayerUI] Sidebar + Info Bar shown together");
}

/**
 * Reset the shared UI timer (called on every key press inside sidebar)
 */
function resetUITimer() {
    if (uiTimer) clearTimeout(uiTimer);

    uiTimer = setTimeout(function () {
        hidePlayerUI();
    }, 5000);
}

/**
 * Hide both sidebar and info bar together
 */
function hidePlayerUI() {
    var sidebar = document.getElementById('playerSidebar');
    var overlay = document.querySelector('.player-overlay');
    var infoBar = document.querySelector('.info-bar-premium');

    // Hide sidebar
    if (sidebar) {
        sidebarState.isOpen = false;
        sidebar.classList.add('close');
        setTimeout(function () {
            sidebar.classList.remove('open', 'close');
        }, 300);
    }

    // Hide info bar
    if (overlay) {
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
    }

    // Remove sidebar-active class
    if (infoBar) {
        infoBar.classList.remove('sidebar-active');
    }

    // Clear timers
    if (uiTimer) {
        clearTimeout(uiTimer);
        uiTimer = null;
    }
    clearSidebarInactivityTimer();
    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
        overlayTimeout = null;
    }

    console.log("[PlayerUI] Sidebar + Info Bar hidden together");
}

/**
 * Focus on a specific category item
 * This properly sets both DOM focus and active class
 */
function focusCategoryItem(index) {
    if (index < 0 || index >= sidebarState.categories.length) return;

    sidebarState.categoryIndex = index;

    var items = document.querySelectorAll('.category-item');
    items.forEach(function (item, i) {
        if (i === index) {
            item.classList.add('active');
            // CRITICAL: Call .focus() to update document.activeElement
            item.focus();

            // Ensure item is fully visible
            setTimeout(function () {
                item.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }, 50);
        } else {
            item.classList.remove('active');
        }
    });

    console.log("[Sidebar] Category focused:", sidebarState.categories[index]);
}

/**
 * Focus on a specific channel item
 * This properly sets both DOM focus and active class
 */
function focusChannelItem(index) {
    if (index < 0 || index >= sidebarState.channels.length) return;

    sidebarState.channelIndex = index;

    var items = document.querySelectorAll('.channel-item');
    items.forEach(function (item, i) {
        if (i === index) {
            item.classList.add('active');
            // CRITICAL: Call .focus() to update document.activeElement
            item.focus();

            // Ensure item is fully visible with smooth scroll
            setTimeout(function () {
                item.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }, 50);
        } else {
            item.classList.remove('active');
        }
    });

    console.log("[Sidebar] Channel focused:", index, "of", sidebarState.channels.length);
}

/**
 * Handle sidebar keydown navigation - New Layout
 * Language Arrows → Categories → Channels (all visible)
 * Returns true if keydown was handled by sidebar
 * Timer is reset on EVERY key press to keep sidebar visible during active navigation
 */
function handleSidebarKeydown(e) {
    if (!sidebarState.isOpen) return false;

    var code = e.keyCode;
    var handled = false;

    // Reset inactivity timer on EVERY key press - this keeps sidebar visible
    // Timer only fires after 5 seconds of NO key presses
    resetSidebarInactivityTimer();
    resetUITimer();

    var activeEl = document.activeElement;

    // Check what element is focused
    var isOnLanguageArrow = activeEl && activeEl.classList.contains('lang-nav-arrow');
    var isOnCategory = activeEl && activeEl.classList.contains('category-item');
    var isOnChannel = activeEl && activeEl.classList.contains('channel-item');

    // ==========================================
    // LANGUAGE NAVIGATION ARROWS
    // ==========================================
    if (isOnLanguageArrow) {
        switch (code) {
            case 37: // LEFT
                changeLanguage(-1);
                e.preventDefault();
                handled = true;
                break;

            case 39: // RIGHT
                changeLanguage(1);
                e.preventDefault();
                handled = true;
                break;

            case 38: // UP
                // Stay at language (top of sidebar)
                e.preventDefault();
                handled = true;
                break;

            case 40: // DOWN
                // Check if categories are visible
                var categoriesSection = document.getElementById('sidebarCategoriesSection');
                var categoriesHidden = categoriesSection && categoriesSection.style.display === 'none';
                
                if (categoriesHidden) {
                    // Categories hidden - go directly to first channel
                    sidebarState.currentLevel = 'channels';
                    sidebarState.channelIndex = 0;
                    focusChannelItem(0);
                } else {
                    // Categories visible - go to first category
                    sidebarState.currentLevel = 'categories';
                    sidebarState.categoryIndex = 0;
                    focusCategoryItem(0);
                }
                e.preventDefault();
                handled = true;
                break;

            case 10009: // RETURN
                closeSidebar();
                e.preventDefault();
                handled = true;
                break;
        }
        return handled;
    }

    // ==========================================
    // CATEGORIES LIST
    // ==========================================
    if (isOnCategory) {
        var categories = Array.from(document.querySelectorAll('.category-item'));
        var currentCatIndex = categories.findIndex(function(el) { return el === activeEl; });
        if (currentCatIndex === -1) currentCatIndex = sidebarState.categoryIndex;
        
        switch (code) {
            case 37: // LEFT - Stay in sidebar (do nothing)
                e.preventDefault();
                handled = true;
                break;

            case 39: // RIGHT - Close sidebar
                closeSidebar();
                e.preventDefault();
                handled = true;
                break;

            case 38: // UP
                if (currentCatIndex > 0) {
                    // Move to previous category
                    var newCatIdx = currentCatIndex - 1;
                    sidebarState.categoryIndex = newCatIdx;
                    focusCategoryItem(newCatIdx);
                    selectCategory(newCatIdx);
                } else {
                    // At first category, move to language arrow
                    var leftArrow = document.getElementById('langNavLeft');
                    if (leftArrow) leftArrow.focus();
                }
                e.preventDefault();
                handled = true;
                break;

            case 40: // DOWN
                if (currentCatIndex < categories.length - 1) {
                    // Move to next category
                    var newCatIdx = currentCatIndex + 1;
                    sidebarState.categoryIndex = newCatIdx;
                    focusCategoryItem(newCatIdx);
                    selectCategory(newCatIdx);
                } else {
                    // At last category, move to first channel
                    sidebarState.currentLevel = 'channels';
                    sidebarState.channelIndex = 0;
                    focusChannelItem(0);
                }
                e.preventDefault();
                handled = true;
                break;

            case 13: // ENTER
                // Select category (already highlighted, just confirm)
                selectCategory(currentCatIndex);
                // Move to channels
                sidebarState.currentLevel = 'channels';
                sidebarState.channelIndex = 0;
                focusChannelItem(0);
                e.preventDefault();
                handled = true;
                break;

            case 10009: // RETURN
                closeSidebar();
                e.preventDefault();
                handled = true;
                break;
        }
        return handled;
    }

    // ==========================================
    // CHANNELS LIST
    // ==========================================
    if (isOnChannel) {
        var channels = Array.from(document.querySelectorAll('.channel-item'));
        // Use sidebarState.channelIndex as the source of truth
        var currentChIndex = sidebarState.channelIndex;
        // Clamp to valid range
        if (currentChIndex < 0) currentChIndex = 0;
        if (currentChIndex >= channels.length) currentChIndex = channels.length - 1;
        
        // Check if categories are hidden
        var categoriesSection = document.getElementById('sidebarCategoriesSection');
        var categoriesHidden = categoriesSection && categoriesSection.style.display === 'none';

        switch (code) {
            case 37: // LEFT - Stay in sidebar (do nothing)
                e.preventDefault();
                handled = true;
                break;

            case 39: // RIGHT - Close sidebar
                closeSidebar();
                e.preventDefault();
                handled = true;
                break;

            case 38: // UP
                if (currentChIndex > 0) {
                    // Move to previous channel
                    var newIndex = currentChIndex - 1;
                    sidebarState.channelIndex = newIndex;
                    focusChannelItem(newIndex);
                    console.log("[Sidebar] UP: Moving to channel", newIndex);
                } else {
                    // At first channel
                    if (categoriesHidden) {
                        // Categories hidden - go to language arrow
                        var leftArrow = document.getElementById('langNavLeft');
                        if (leftArrow) leftArrow.focus();
                    } else {
                        // Categories visible - go to last category
                        sidebarState.currentLevel = 'categories';
                        var categories = document.querySelectorAll('.category-item');
                        if (categories.length > 0) {
                            var lastCat = categories[sidebarState.categoryIndex];
                            if (lastCat) lastCat.focus();
                        }
                    }
                }
                e.preventDefault();
                handled = true;
                break;

            case 40: // DOWN
                if (currentChIndex < channels.length - 1) {
                    // Move to next channel
                    var newIndex = currentChIndex + 1;
                    sidebarState.channelIndex = newIndex;
                    focusChannelItem(newIndex);
                    console.log("[Sidebar] DOWN: Moving to channel", newIndex);
                } else {
                    // At last channel - stay there
                    console.log("[Sidebar] DOWN: Already at last channel", currentChIndex);
                }
                e.preventDefault();
                handled = true;
                break;

            case 13: // ENTER
                // Play selected channel
                if (sidebarState.channels.length > currentChIndex && currentChIndex >= 0) {
                    var channel = sidebarState.channels[currentChIndex];
                    playChannelFromSidebar(channel);
                }
                e.preventDefault();
                handled = true;
                break;

            case 10009: // RETURN
                // Go back
                if (categoriesHidden) {
                    // Categories hidden - close sidebar
                    closeSidebar();
                } else {
                    // Categories visible - go back to categories
                    sidebarState.currentLevel = 'categories';
                    var categories = document.querySelectorAll('.category-item');
                    if (categories[sidebarState.categoryIndex]) {
                        categories[sidebarState.categoryIndex].focus();
                    }
                }
                e.preventDefault();
                handled = true;
                break;
        }
        return handled;
    }

    // ==========================================
    // FALLBACK: No specific element focused
    // Force focus to channels or categories based on current level
    // ==========================================
    if (!handled && (code === 38 || code === 40 || code === 37 || code === 39 || code === 13)) {
        console.log("[Sidebar] No element focused, forcing focus based on current level:", sidebarState.currentLevel);
        
        var categoriesSection = document.getElementById('sidebarCategoriesSection');
        var categoriesHidden = categoriesSection && categoriesSection.style.display === 'none';
        
        if (sidebarState.currentLevel === 'channels' || categoriesHidden) {
            // Focus current channel
            var channels = document.querySelectorAll('.channel-item');
            if (channels.length > 0) {
                var idx = Math.max(0, Math.min(sidebarState.channelIndex, channels.length - 1));
                sidebarState.channelIndex = idx;
                focusChannelItem(idx);
                handled = true;
            }
        } else {
            // Focus current category
            var categories = document.querySelectorAll('.category-item');
            if (categories.length > 0) {
                var idx = Math.max(0, Math.min(sidebarState.categoryIndex, categories.length - 1));
                sidebarState.categoryIndex = idx;
                focusCategoryItem(idx);
                handled = true;
            }
        }
        
        e.preventDefault();
    }

    return handled;
}

/**
 * Play a channel directly from sidebar
 */
function playChannelFromSidebar(channel) {
    if (!channel) return;

    console.log("[Sidebar] Playing channel:", channel.chtitle || channel.channel_name);

    // Play the selected channel
    setupPlayer(channel);

    // Show BOTH sidebar + info bar together for 5 seconds
    // Sidebar is already open, now show info bar alongside it
    var overlay = document.querySelector('.player-overlay');
    var infoBar = document.querySelector('.info-bar-premium');

    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
    }
    if (infoBar) {
        infoBar.classList.add('sidebar-active');
    }

    // Clear any existing timers
    if (overlayTimeout) { clearTimeout(overlayTimeout); overlayTimeout = null; }
    if (uiTimer) { clearTimeout(uiTimer); uiTimer = null; }
    clearSidebarInactivityTimer();

    // Both hide together after 5 seconds
    uiTimer = setTimeout(function () {
        hidePlayerUI();
    }, 5000);

    console.log("[Sidebar] Channel selected - both sidebar + info bar shown for 5s");
}

/**
 * Check if sidebar is currently focused
 */
function isSidebarFocused() {
    if (!sidebarState.isOpen) return false;
    var el = document.activeElement;
    if (!el) return false;
    return el.classList.contains('lang-nav-arrow') ||
           el.classList.contains('category-item') ||
           el.classList.contains('channel-item');
}

function handleKeydown(e) {
    const code = e.keyCode;
    console.log("Player Key:", code);

    // Handle sidebar navigation first if sidebar is open
    if (sidebarState.isOpen && handleSidebarKeydown(e)) {
        // Sidebar handles its own info bar visibility via shared timer
        return;
    }

    // Toggle sidebar with Menu key (code 10253) or 'M' key
    if (code === 10253 || code === 77) { // Menu or 'M'
        e.preventDefault();
        toggleSidebar();
        return;
    }

    // Rest of the player keydown handler
    // Handle error popup navigation
    if (playerErrorPopupOpen) {
        e.preventDefault();
        if (code === 10009 || code === 27) {
            // BACK - go back to channels/home
            hidePlayerErrorPopup();
            window.location.href = 'channels.html';

        } else if (code === 13) {
            // ENTER - retry
            var btn = document.getElementById('playerRetryBtn');
            if (btn) btn.click();
        }
        return;
    }

    if (code === 10009 || code === 27) { // Back / ESC
        e.preventDefault();

        // If sidebar is open, close it first (Android TV behavior)
        if (sidebarState.isOpen) {
            closeSidebar();
            console.log('[Player] RETURN pressed - closing sidebar');
            return;
        }

        // If sidebar is closed, exit player
        closePlayer();
        // Always go back to channels page
        console.log('[Player] Navigating back to channels page');
        window.location.href = 'channels.html';
        return;
    }

    // LEFT Arrow - Open Sidebar (when closed)
    if (code === 37) { // LEFT
        e.preventDefault();
        if (!sidebarState.isOpen) {
            openSidebar();
            console.log('[Player] LEFT pressed - opening sidebar');
            return;
        }
        // If sidebar is already open, let it handle the key
    }

    // RIGHT Arrow - Close sidebar (if open)
    if (code === 39) { // RIGHT
        e.preventDefault();
        if (sidebarState.isOpen) {
            closeSidebar();
            console.log('[Player] RIGHT pressed - closing sidebar');
        }
        return;
    }

    // Number Keys (0-9) for direct channel navigation
    // Standard number keys: 48-57 (0-9)
    // Numpad number keys: 96-105 (0-9)
    if ((code >= 48 && code <= 57) || (code >= 96 && code <= 105)) {
        e.preventDefault();
        var digit;
        if (code >= 48 && code <= 57) {
            digit = String(code - 48); // Convert keycode to digit
        } else {
            digit = String(code - 96); // Convert numpad keycode to digit
        }
        handleNumberInput(digit);
        showOverlay();
        return;
    }

    // Prevent default for navigation keys
    if ([37, 38, 39, 40, 13, 415, 19, 413, 417, 412, 427, 428, 33, 34, 447, 448, 449].indexOf(code) !== -1) {
        e.preventDefault();
    }

    // Enter key (OK button) - Show/toggle info bar only
    // Do NOT click activeElement here - sidebar handles its own Enter via handleSidebarKeydown
    if (code === 13) {
        if (typeof handleOKButton === 'function') {
            handleOKButton();
        } else {
            showOverlay();
        }
        return;
    }

    // Channel Up / Down (Tizen codes: 427, 428)
    // Also mapping Up/Down arrows for easier testing
    if (code === 427 || code === 33) { // CH+ or PageUp
        changeChannel(1);
    }
    else if (code === 428 || code === 34) { // CH- or PageDown
        changeChannel(-1);
    }
    // Optional: Arrow Keys for Zapping if requested, usually Up/Down controls volume or UI
    else if (code === 38) { // Up Arrow -> Next Channel
        changeChannel(1);
    }
    else if (code === 40) { // Down Arrow -> Prev Channel
        changeChannel(-1);
    }

    if (typeof AVPlayer !== 'undefined' && AVPlayer.isTizen()) {
        switch (code) {
            case 415: AVPlayer.play(); break;
            case 19: AVPlayer.pause(); break;
            case 413: AVPlayer.stop(); break;
            case 417: AVPlayer.jumpForward(10000); break;
            case 412: AVPlayer.jumpBackward(10000); break;
        }
    }

    // Volume Control (works on all pages)
    handleVolumeKeys(code);

    // Show overlay on any key press
    showOverlay();
}

// ==========================================
// VOLUME CONTROL
// ==========================================
var currentVolume = 50; // Default volume 50%
var isMuted = false;

function handleVolumeKeys(keyCode) {
    try {
        if (typeof tizen !== 'undefined' && tizen.tvaudiocontrol) {
            switch (keyCode) {
                case 447: // VolumeUp
                    tizen.tvaudiocontrol.setVolumeUp();
                    currentVolume = tizen.tvaudiocontrol.getVolume();
                    showVolumeIndicator(currentVolume);
                    console.log("Volume Up:", currentVolume);
                    break;
                case 448: // VolumeDown
                    tizen.tvaudiocontrol.setVolumeDown();
                    currentVolume = tizen.tvaudiocontrol.getVolume();
                    showVolumeIndicator(currentVolume);
                    console.log("Volume Down:", currentVolume);
                    break;
                case 449: // VolumeMute
                    isMuted = !isMuted;
                    tizen.tvaudiocontrol.setMute(isMuted);
                    showVolumeIndicator(isMuted ? 0 : currentVolume, isMuted);
                    console.log("Mute:", isMuted);
                    break;
            }
        } else {
            // Fallback for emulator/browser - use HTML5 video volume
            var video = document.querySelector('video');
            if (video) {
                switch (keyCode) {
                    case 447: // VolumeUp
                        video.volume = Math.min(1, video.volume + 0.1);
                        currentVolume = Math.round(video.volume * 100);
                        showVolumeIndicator(currentVolume);
                        break;
                    case 448: // VolumeDown
                        video.volume = Math.max(0, video.volume - 0.1);
                        currentVolume = Math.round(video.volume * 100);
                        showVolumeIndicator(currentVolume);
                        break;
                    case 449: // VolumeMute
                        video.muted = !video.muted;
                        isMuted = video.muted;
                        showVolumeIndicator(isMuted ? 0 : currentVolume, isMuted);
                        break;
                }
            }
        }
    } catch (e) {
        console.error("Volume control error:", e);
    }
}

function showVolumeIndicator(volume, muted) {
    // Create or get volume indicator
    var indicator = document.getElementById('volume-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'volume-indicator';
        indicator.style.cssText = 'position:fixed;top:50px;right:50px;background:rgba(0,0,0,0.8);color:#fff;padding:15px 25px;border-radius:10px;font-size:18px;z-index:9999;display:flex;align-items:center;gap:15px;';
        document.body.appendChild(indicator);
    }

    var icon = muted ? '🔇' : (volume > 50 ? '🔊' : (volume > 0 ? '🔉' : '🔈'));
    indicator.innerHTML = '<span style="font-size:24px;">' + icon + '</span><span>' + (muted ? 'Muted' : volume + '%') + '</span>';
    indicator.style.display = 'flex';

    // Hide after 2 seconds
    clearTimeout(indicator.hideTimeout);
    indicator.hideTimeout = setTimeout(function () {
        indicator.style.display = 'none';
    }, 2000);
}

// ==========================================
// TIMELINE & PROGRESS BAR FUNCTIONALITY
// ==========================================
var isLiveStream = true; // Most IPTV channels are live streams
var streamDuration = 0;
var currentPlayTime = 0;

function updateTimeline(timeInMilliseconds) {
    currentPlayTime = timeInMilliseconds;

    // For live streams, we don't show progress (or show as "LIVE")
    // For VOD, calculate and show progress percentage

    if (!isLiveStream && streamDuration > 0) {
        var progressPercent = (timeInMilliseconds / streamDuration) * 100;
        var progressBar = document.querySelector('.progress-bar-fill');
        if (progressBar) {
            progressBar.style.width = progressPercent + '%';
        }

        // Update time display
        var programTime = document.getElementById('ui-program-time');
        if (programTime) {
            var currentTime = formatTime(timeInMilliseconds);
            var totalTime = formatTime(streamDuration);
            programTime.innerText = currentTime + ' / ' + totalTime;
        }
    } else {
        // Live stream - show as LIVE
        var progressBar = document.querySelector('.progress-bar-fill');
        if (progressBar) {
            progressBar.style.width = '100%';
            progressBar.classList.add('live');
        }

        var programTime = document.getElementById('ui-program-time');
        if (programTime) {
            programTime.innerHTML = '<span style="color: #ef4444;">●</span> LIVE';
        }
    }
}

function formatTime(milliseconds) {
    var totalSeconds = Math.floor(milliseconds / 1000);
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    if (hours > 0) {
        return hours + ':' + pad(minutes) + ':' + pad(seconds);
    } else {
        return minutes + ':' + pad(seconds);
    }
}

function pad(num) {
    return (num < 10 ? '0' : '') + num;
}

function showBufferingIndicator() {
    // Reset the hidden flag when showing indicator for new stream
    hasHiddenLoadingIndicator = false;

    // Add a prominent loading indicator
    var container = document.getElementById('player-container');
    if (container && !document.getElementById('buffering-indicator')) {
        // Add spinner CSS if not already added
        if (!document.getElementById('spinner-styles')) {
            var style = document.createElement('style');
            style.id = 'spinner-styles';
            style.textContent = `
                .spinner {
                    border: 4px solid rgba(255, 255, 255, 0.3);
                    border-top: 4px solid #fff;
                    border-radius: 50%;
                    width: 50px;
                    height: 50px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        var bufferingDiv = document.createElement('div');
        bufferingDiv.id = 'buffering-indicator';
        bufferingDiv.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.9); color: white; padding: 30px 50px; border-radius: 15px; font-size: 22px; z-index: 9999; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.8);';
        bufferingDiv.innerHTML = '<div style="margin-bottom: 15px;"><div class="spinner"></div></div><div style="font-size: 20px; font-weight: 600;">Loading Stream...</div><div style="font-size: 14px; color: #aaa; margin-top: 8px;">Please wait</div>';
        container.appendChild(bufferingDiv);

        // SAFETY TIMEOUT: Auto-hide after 8 seconds max (for ultra-fast mode)
        setTimeout(function () {
            if (!hasHiddenLoadingIndicator) {
                console.log("⏱️ Safety timeout: Force hiding loading indicator after 8 seconds");
                hideBufferingIndicator();
                hasHiddenLoadingIndicator = true;
            }
        }, 8000); // 8 seconds max for ultra-fast mode
    }
}

function hideBufferingIndicator() {
    var indicator = document.getElementById('buffering-indicator');
    if (indicator) {
        indicator.remove();
    }
}

// Make progress bar clickable for seeking (VOD only)
document.addEventListener('DOMContentLoaded', function () {
    var progressContainer = document.querySelector('.progress-container');
    if (progressContainer) {
        progressContainer.addEventListener('click', function (e) {
            if (!isLiveStream && streamDuration > 0) {
                var rect = this.getBoundingClientRect();
                var clickX = e.clientX - rect.left;
                var percentage = clickX / rect.width;
                var seekTime = Math.floor(percentage * streamDuration);

                // Seek to the clicked position
                if (typeof AVPlayer !== 'undefined' && AVPlayer.isTizen()) {
                    try {
                        webapis.avplay.seekTo(seekTime, function () {
                            console.log('Seeked to:', seekTime);
                        }, function (err) {
                            console.error('Seek error:', err);
                        });
                    } catch (e) {
                        console.error('Seek failed:', e);
                    }
                }
            }
        });

        // Make progress bar look clickable for VOD
        if (!isLiveStream) {
            progressContainer.style.cursor = 'pointer';
        }
    }
});

// ==========================================
// CHANNEL NUMBER INPUT FUNCTIONALITY
// ==========================================
var channelNumberBuffer = "";
var channelInputTimeout = null;
var CHANNEL_INPUT_DELAY = 2000; // 2 seconds to complete typing

/**
 * Handle number key input for direct channel navigation
 */
function handleNumberInput(digit) {
    console.log("[Player] Number key pressed:", digit);

    // Add digit to buffer
    channelNumberBuffer += digit;

    // Show the channel number input display
    showChannelNumberInput(channelNumberBuffer);

    // Clear existing timeout
    if (channelInputTimeout) {
        clearTimeout(channelInputTimeout);
    }

    // Set timeout to navigate after delay
    channelInputTimeout = setTimeout(function () {
        navigateToChannelNumber(channelNumberBuffer);
        channelNumberBuffer = "";
        hideChannelNumberInput();
    }, CHANNEL_INPUT_DELAY);
}

/**
 * Show channel number input overlay
 */
function showChannelNumberInput(number) {
    var container = document.getElementById('player-container');
    if (!container) return;

    var inputDisplay = document.getElementById('channel-number-input');
    if (!inputDisplay) {
        inputDisplay = document.createElement('div');
        inputDisplay.id = 'channel-number-input';
        inputDisplay.style.cssText = `
            position: absolute;
            top: 80px;
            right: 80px;
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 20px 40px;
            border-radius: 12px;
            font-size: 64px;
            font-weight: bold;
            z-index: 10000;
            min-width: 150px;
            text-align: center;
            border: 2px solid rgba(59, 92, 255, 0.5);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        `;
        container.appendChild(inputDisplay);
    }

    inputDisplay.innerText = number;
    inputDisplay.style.display = 'block';
}

/**
 * Hide channel number input overlay
 */
function hideChannelNumberInput() {
    var inputDisplay = document.getElementById('channel-number-input');
    if (inputDisplay) {
        inputDisplay.style.display = 'none';
    }
}

/**
 * Navigate to channel by number
 */
function navigateToChannelNumber(number) {
    console.log("[Player] Navigating to channel number:", number);

    if (allChannels.length === 0) {
        console.warn("[Player] No channels loaded, cannot navigate");
        showChannelNotFound(number);
        return;
    }

    var targetNumber = parseInt(number, 10);

    // Find channel by channelno, urno, chno, or ch_no
    var channel = allChannels.find(function (ch) {
        var chNum = parseInt(ch.channelno || ch.urno || ch.chno || ch.ch_no || ch.id, 10);
        return chNum === targetNumber;
    });

    if (channel) {
        console.log("[Player] Found channel:", channel.chtitle || channel.channel_name);
        setupPlayer(channel);
    } else {
        console.warn("[Player] Channel not found for number:", number);
        showChannelNotFound(number);
    }
}

/**
 * Show channel not found message
 */
function showChannelNotFound(number) {
    var container = document.getElementById('player-container');
    if (!container) return;

    var notFoundDisplay = document.getElementById('channel-not-found');
    if (!notFoundDisplay) {
        notFoundDisplay = document.createElement('div');
        notFoundDisplay.id = 'channel-not-found';
        notFoundDisplay.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            padding: 30px 50px;
            border-radius: 15px;
            font-size: 24px;
            z-index: 10000;
            text-align: center;
            border: 2px solid rgba(255, 68, 68, 0.5);
        `;
        container.appendChild(notFoundDisplay);
    }

    notFoundDisplay.innerHTML = '<div style="color: #ff4444; font-size: 36px; margin-bottom: 10px;">Channel ' + number + '</div><div style="color: #aaa;">Not Found</div>';
    notFoundDisplay.style.display = 'block';

    // Auto-hide after 2 seconds
    setTimeout(function () {
        notFoundDisplay.style.display = 'none';
    }, 2000);
}

// ==========================================
// OVERLAY AUTO-HIDE/SHOW FUNCTIONALITY
// ==========================================
// Note: overlayTimeout and OVERLAY_HIDE_DELAY are declared at top with sidebar timers

/**
 * Force show info bar overlay (used when sidebar opens)
 * This version ignores sidebar state
 */
function showInfoBarForced() {
    var overlay = document.querySelector('.player-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
        console.log('[InfoBar] Force shown with sidebar');
    }
}

/**
 * Show info bar overlay and set auto-hide timer
 * Resets timer on each call (for OK button or channel change)
 */
function showOverlay() {
    // Don't show info bar if sidebar is open (sidebar handles timing)
    if (sidebarState.isOpen) {
        return;
    }

    var overlay = document.querySelector('.player-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');

        // Clear existing timeout BEFORE setting new one
        if (overlayTimeout) {
            clearTimeout(overlayTimeout);
        }

        // Set new timeout to auto-hide overlay after 5 seconds
        overlayTimeout = setTimeout(function () {
            hideOverlay();
        }, OVERLAY_HIDE_DELAY);

        console.log('[InfoBar] Shown, auto-hide timer reset');
    }
}

/**
 * Hide info bar overlay
 */
function hideOverlay() {
    var overlay = document.querySelector('.player-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');

        // Clear timeout when hiding
        if (overlayTimeout) {
            clearTimeout(overlayTimeout);
            overlayTimeout = null;
        }

        console.log('[InfoBar] Hidden');
    }
}

/**
 * Callback for OK button - show info bar again if hidden, or reset timer if visible
 */
var handleOKButton = function () {
    var overlay = document.querySelector('.player-overlay');
    if (!overlay) return;

    if (overlay.classList.contains('visible')) {
        // Already visible - reset the auto-hide timer
        if (overlayTimeout) {
            clearTimeout(overlayTimeout);
        }
        overlayTimeout = setTimeout(function () {
            hideOverlay();
        }, OVERLAY_HIDE_DELAY);
        console.log('[InfoBar] OK pressed - timer reset');
    } else {
        // Hidden or initial state - show the info bar
        console.log('[InfoBar] OK pressed - showing info bar');
        showOverlay();
    }
};

// Show overlay on any user interaction (but not when sidebar is open)
document.addEventListener('keydown', function (e) {
    // Don't show overlay if sidebar is open
    if (!sidebarState.isOpen) {
        showOverlay();
    }
});
document.addEventListener('mousemove', showOverlay);
document.addEventListener('click', showOverlay);

// Show overlay initially for 5 seconds when page loads
setTimeout(function () {
    showOverlay();
}, 100);

// ==========================================
// DATE AND TIME UPDATES
// ==========================================

/**
 * Update current date and time in footer
 */
function updateDateTime() {
    const now = new Date();

    // Update Date
    const uiDate = document.getElementById('ui-date');
    if (uiDate) {
        const options = { month: 'short', day: '2-digit', year: 'numeric' };
        uiDate.innerText = now.toLocaleDateString('en-US', options);
    }

    // Update Time
    const uiTime = document.getElementById('ui-time');
    if (uiTime) {
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 || 12;
        const displayMinutes = minutes < 10 ? '0' + minutes : minutes;
        uiTime.innerText = displayHours + ':' + displayMinutes + ' ' + ampm;
    }
}
