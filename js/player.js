/**
 * BBNL Player Controller - Uses AVPlayer Module
 */

// Check authentication - redirect to login if never logged in
// NOTE: Never remove hasLoggedInOnce — it must persist across HOME relaunch.
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
            console.log("[Auth] bbnl_user invalid - redirecting to login for re-auth");
            window.location.replace("login.html");
            return;
        }
    } catch (e) {
        console.error("[Auth] Corrupted session data - redirecting to login:", e);
        window.location.replace("login.html");
        return;
    }
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
var playerErrorActionMode = 'retry'; // retry | paynow
var PAYMENT_GATEWAY_URL = 'https://bbnl.in/renew';
var playerErrorUiTimeout = null;
var PLAYER_ERROR_UI_HIDE_DELAY = 10000; // 10 seconds

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

function clearPlayerErrorUiTimer() {
    if (playerErrorUiTimeout) {
        clearTimeout(playerErrorUiTimeout);
        playerErrorUiTimeout = null;
    }
}

function resetPlayerErrorUiTimer() {
    clearPlayerErrorUiTimer();
    if (!playerErrorPopupOpen) return;

    playerErrorUiTimeout = setTimeout(function () {
        // Force-hide sidebar + info bar after 10 seconds of no user action during popup.
        var sidebar = document.getElementById('playerSidebar');
        if (sidebar) {
            sidebarState.isOpen = false;
            sidebar.classList.remove('open');
            sidebar.classList.add('close');
            setTimeout(function () {
                sidebar.classList.remove('close');
            }, 300);
        }

        var overlay = document.querySelector('.player-overlay');
        if (overlay) {
            overlay.classList.remove('visible');
            overlay.classList.add('hidden');
        }

        var infoBar = document.querySelector('.info-bar-premium');
        if (infoBar) {
            infoBar.classList.add('info-bar-hidden');
            infoBar.classList.remove('sidebar-active');
        }

        clearSidebarInactivityTimer();
        if (overlayTimeout) {
            clearTimeout(overlayTimeout);
            overlayTimeout = null;
        }
        if (uiTimer) {
            clearTimeout(uiTimer);
            uiTimer = null;
        }

        console.log('[Player] Error popup inactivity timeout (10s) - hiding sidebar and info bar');
    }, PLAYER_ERROR_UI_HIDE_DELAY);
}

/**
 * Show player error popup
 */
function showPlayerErrorPopup(title, message) {
    var popup = document.getElementById('playerErrorPopup');
    if (popup) {
        var titleEl = document.getElementById('playerErrorTitle');
        var msgEl = document.getElementById('playerErrorMessage');
        var actionBtn = document.getElementById('playerRetryBtn');
        if (titleEl) titleEl.textContent = title || 'Playback Error';
        if (msgEl) msgEl.textContent = message || 'Please Check your network and try again';

        // Populate channel name with distinct color
        var popupChName = document.getElementById('popupChannelName');
        if (popupChName) {
            var ch = (_lastAttemptedChannel) ? (_lastAttemptedChannel.channel_name || _lastAttemptedChannel.chtitle || '') : '';
            popupChName.textContent = ch || '';
            popupChName.style.display = ch ? '' : 'none';
        }

        // Populate Device ID
        var popupDeviceId = document.getElementById('popupDeviceId');
        if (popupDeviceId) {
            try {
                popupDeviceId.textContent = DeviceInfo.getDeviceIdLabel ? DeviceInfo.getDeviceIdLabel() : (DeviceInfo.duid || DeviceInfo.devslno || '--');
            } catch (e) {
                popupDeviceId.textContent = '--';
            }
        }

        // Populate User ID
        var popupUserId = document.getElementById('popupUserId');
        if (popupUserId) {
            try {
                var ud = AuthAPI.getUserData();
                popupUserId.textContent = (ud && (ud.userid || ud.userId || ud.username || ud.mobile)) || '--';
            } catch (e) {
                popupUserId.textContent = '--';
            }
        }

        var titleLower = String(title || '').toLowerCase();
        var msgLower = String(message || '').toLowerCase();
        var isSubscriptionPopup = titleLower.indexOf('subscription not available') !== -1 ||
            msgLower.indexOf('please subscribe to watch this channel') !== -1;
        playerErrorActionMode = isSubscriptionPopup ? 'paynow' : 'retry';
        if (actionBtn) actionBtn.textContent = isSubscriptionPopup ? 'Pay Now' : 'Try Again';
        popup.classList.toggle('subscription-popup', !!isSubscriptionPopup);

        // Set error image from API based on error type
        var img = document.getElementById('errorImg_player');
        if (img && typeof ErrorImagesAPI !== 'undefined') {
            var key = 'PLAYBACK_ERROR';
            if (title && (title.toLowerCase().includes('subscription not available') || title.toLowerCase().includes('not subscribed'))) {
                key = 'NO_CHANNELS_AVAILABLE';
            } else if (title && (title.toLowerCase().includes('signal') || title.toLowerCase().includes('unavailable'))) {
                key = 'SIGNAL_UNAVAILABLE';
            } else if (title && title.toLowerCase().includes('network')) {
                key = 'NO_INTERNET_CONNECTION';
            }
            var imgUrl = ErrorImagesAPI.getImageUrl(key);
            if (!imgUrl && key === 'PLAYBACK_ERROR') {
                imgUrl = ErrorImagesAPI.getImageUrl('SIGNAL_UNAVAILABLE') || ErrorImagesAPI.getImageUrl('NO_CHANNELS_AVAILABLE') || ErrorImagesAPI.getImageUrl('NO_INTERNET_CONNECTION');
            }
            if (imgUrl) {
                img.src = imgUrl;
            }
        }

        // Keep info bar visible while error popup is shown.
        showInfoBarForced();

        popup.style.display = 'flex';
        playerErrorPopupOpen = true;
        resetPlayerErrorUiTimer();
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
        clearPlayerErrorUiTimer();
        // Start auto-hide timer now that popup is dismissed
        showOverlay();
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
                    // Clear stream timeout - buffering complete means stream works
                    if (window._streamTimeoutTimer) {
                        clearTimeout(window._streamTimeoutTimer);
                        window._streamTimeoutTimer = null;
                    }
                    // Load stream ads on successful playback
                    var ch = (currentIndex >= 0 && allChannels[currentIndex]) ? allChannels[currentIndex] : null;
                    if (ch) {
                        var adChid = ch.chid || ch.channelno || ch.urno || "";
                        if (adChid) loadStreamAds(String(adChid));
                    }
                },
                onError: (e) => {
                    console.error("Player Error:", e);
                    hideBufferingIndicator(); // Hide on error
                    hasHiddenLoadingIndicator = true;
                    // Clear stream timeout to prevent double error popup
                    if (window._streamTimeoutTimer) {
                        clearTimeout(window._streamTimeoutTimer);
                        window._streamTimeoutTimer = null;
                    }

                    if (isNetworkDisconnected()) {
                        showPlayerErrorPopup('Playback Error', 'Network disconnected. Please check your connection and try again.');
                    } else {
                        // Check if current channel is unsubscribed/paid
                        var currentChannel = (currentIndex >= 0 && allChannels[currentIndex]) ? allChannels[currentIndex] : null;
                        var isSubs = currentChannel && (currentChannel.subscribed === "yes" || currentChannel.subscribed === "1" || currentChannel.subscribed === true || currentChannel.subscribed === 1);
                        var chPrice = currentChannel ? parseFloat(currentChannel.chprice || currentChannel.price || 0) : 0;

                        if (currentChannel && !isSubs && chPrice > 0) {
                            // Paid channel that user is not subscribed to
                            showPlayerErrorPopup('Subscription Not Available', 'Please subscribe to watch this channel.');
                        } else if (currentChannel && !isSubs) {
                            // Unsubscribed channel (free or unknown price)
                            showPlayerErrorPopup('Subscription Not Available', 'Please subscribe to watch this channel.');
                        } else {
                            // General playback error (subscribed but stream failed)
                            showPlayerErrorPopup('Playback Error', 'Unable to play this channel. Please try again or switch to another channel.');
                        }
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
                        // Clear stream timeout - playback started successfully
                        if (window._streamTimeoutTimer) {
                            clearTimeout(window._streamTimeoutTimer);
                            window._streamTimeoutTimer = null;
                        }
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
    const resumeFromPayment = urlParams.get('resume') === 'paynow';

    if (resumeFromPayment) {
        // Returning from payment page — restore the channel that triggered Pay Now
        try {
            var savedChannel = localStorage.getItem('paymentReturnChannel');
            localStorage.removeItem('paymentReturnChannel');
            if (savedChannel) {
                setupPlayer(JSON.parse(savedChannel));
            } else {
                console.error("No saved channel found for payment resume");
            }
        } catch (e) {
            console.error("Failed to resume channel after payment:", e);
        }
    } else if (channelDataStr) {
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

    // Player error popup retry button - retry the SAME current channel
    var playerRetryBtn = document.getElementById('playerRetryBtn');
    if (playerRetryBtn) {
        playerRetryBtn.addEventListener('click', function () {
            if (playerErrorActionMode === 'paynow') {
                // Save channel to localStorage (survives page navigation on Samsung TV)
                if (_lastAttemptedChannel) {
                    localStorage.setItem('paymentReturnChannel', JSON.stringify(_lastAttemptedChannel));
                }
                window.location.href = 'payment.html';
                return;
            }

            hidePlayerErrorPopup();
            if (!_lastAttemptedChannel) return;

            var channelToRetry = _lastAttemptedChannel;
            var chId = channelToRetry.channelno || channelToRetry.urno || channelToRetry.chid || "";

            // Refresh channel data to get updated info, then retry same channel
            if (typeof BBNL_API !== 'undefined' && BBNL_API.getChannelData) {
                BBNL_API.getChannelData().then(function (channels) {
                    if (channels && channels.length > 0) {
                        // Update ALL channels for navigation and sidebar
                        allChannels = channels.slice().sort(function (a, b) {
                            var aNo = parseInt(a.channelno || a.urno || a.chno || a.ch_no || 0, 10);
                            var bNo = parseInt(b.channelno || b.urno || b.chno || b.ch_no || 0, 10);
                            return aNo - bNo;
                        });
                        _allChannelsUnfiltered = allChannels; // Same list for sidebar
                        // Find the same channel in refreshed list by ID
                        if (chId) {
                            var updated = channels.find(function (ch) {
                                return (ch.channelno || ch.urno || ch.chid || "") === chId;
                            });
                            if (updated) {
                                setupPlayer(updated);
                                return;
                            }
                        }
                    }
                    // Fallback: retry with the stored channel object
                    setupPlayer(channelToRetry);
                }).catch(function () {
                    setupPlayer(channelToRetry);
                });
            } else {
                setupPlayer(channelToRetry);
            }
        });
    }

    // Note: Visibility change (HOME button) is handled by top-level handler
    // which STOPS video when minimized and redirects to home when resumed
};

var allChannels = [];          // ALL channels — used for channel up/down navigation
var _allChannelsUnfiltered = []; // ALL channels (subscribed + unsubscribed) — for sidebar display
var currentIndex = -1;
var _lastAttemptedChannel = null; // Tracks the current channel for retry
var _lastPlayingChannel = null; // Tracks the last channel that passed pre-play validation
var _playerLogoRequestToken = 0;
var _playerStreamGen = 0; // Tracks which channel switch the callbacks belong to

async function loadChannelList(lookupName = null) {
    try {
        // Ensure public IP is ready before API calls
        if (typeof DeviceInfo !== 'undefined' && DeviceInfo.ensurePublicIP) {
            await DeviceInfo.ensurePublicIP(3000);
        }

        // We reuse the API used in channels page
        let response = await BBNL_API.getChannelList();

        if (Array.isArray(response)) {
            // Store ALL channels for navigation and sidebar display
            allChannels = response.slice().sort(function (a, b) {
                var aNo = parseInt(a.channelno || a.urno || a.chno || a.ch_no || 0, 10);
                var bNo = parseInt(b.channelno || b.urno || b.chno || b.ch_no || 0, 10);
                return aNo - bNo;
            });
            _allChannelsUnfiltered = allChannels; // Same list for sidebar

            console.log("Player: Loaded " + allChannels.length + " channels for navigation and sidebar.");

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

            // Find current index — use channel ID for reliable lookup
            if (_lastAttemptedChannel) {
                var chId = _lastAttemptedChannel.channelno || _lastAttemptedChannel.urno || _lastAttemptedChannel.chid || "";
                if (chId) {
                    currentIndex = allChannels.findIndex(function (ch) {
                        return (ch.channelno || ch.urno || ch.chid || "") === chId;
                    });
                }
            }
            // Fallback to name match if ID lookup failed
            if (currentIndex < 0) {
                var currentName = document.getElementById("ui-channel-name").innerText;
                if (currentName) {
                    currentIndex = allChannels.findIndex(function (ch) {
                        return (ch.channel_name || ch.chtitle || "") === currentName;
                    });
                }
            }

            // Update expiry info from merged data (URL params don't have expirydate)
            if (currentIndex >= 0 && allChannels[currentIndex]) {
                updateExpiryDisplay(allChannels[currentIndex]);
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
                            // Update ALL channels for navigation and sidebar
                            allChannels = freshData.slice().sort(function (a, b) {
                                var aNo = parseInt(a.channelno || a.urno || a.chno || a.ch_no || 0, 10);
                                var bNo = parseInt(b.channelno || b.urno || b.chno || b.ch_no || 0, 10);
                                return aNo - bNo;
                            });
                            _allChannelsUnfiltered = allChannels; // Same list for sidebar

                            // Update sidebar with ALL channels
                            if (sidebarState && sidebarState.allChannelsCache) {
                                sidebarState.allChannelsCache = _allChannelsUnfiltered;
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

function getChannelLogoUrl(channel) {
    if (!channel) return "";
    return channel.logo_url || channel.chlogo || channel.logo || "";
}

function normalizeLogoCacheUrl(url) {
    var raw = String(url || '').trim();
    if (!raw) return '';
    // Remove URL fragment and known cache-busting query params for stable cache keying.
    var noHash = raw.split('#')[0];
    var parts = noHash.split('?');
    if (parts.length < 2) return noHash;

    var base = parts[0];
    var query = parts[1] || '';
    if (!query) return base;

    var kept = query.split('&').filter(function (pair) {
        var key = (pair.split('=')[0] || '').toLowerCase();
        return key && key !== 't' && key !== 'ts' && key !== 'timestamp' && key !== '_' && key !== 'cache' && key !== 'cb';
    });

    return kept.length > 0 ? (base + '?' + kept.join('&')) : base;
}

function updatePlayerChannelLogo(channel) {
    var uiLogo = document.getElementById("ui-channel-logo");
    if (!uiLogo) return;

    var normalizedLogo = normalizeLogoCacheUrl(getChannelLogoUrl(channel));
    var requestToken = ++_playerLogoRequestToken;

    uiLogo.onload = null;
    uiLogo.onerror = null;

    if (!normalizedLogo) {
        uiLogo.style.display = 'none';
        uiLogo.removeAttribute('src');
        uiLogo.dataset.logoUrl = '';
        return;
    }

    if (uiLogo.dataset.logoUrl === normalizedLogo && uiLogo.getAttribute('src')) {
        uiLogo.style.display = '';
        return;
    }

    if (_logoCache[normalizedLogo]) {
        uiLogo.src = normalizedLogo;
        uiLogo.dataset.logoUrl = normalizedLogo;
        uiLogo.style.display = '';
        uiLogo.onerror = function () {
            if (requestToken !== _playerLogoRequestToken) return;
            uiLogo.style.display = 'none';
            uiLogo.removeAttribute('src');
        };
        return;
    }

    uiLogo.style.display = 'none';
    uiLogo.removeAttribute('src');
    uiLogo.dataset.logoUrl = normalizedLogo;

    var preloader = new Image();
    preloader.onload = function () {
        if (requestToken !== _playerLogoRequestToken) return;
        _logoCache[normalizedLogo] = true;
        uiLogo.src = normalizedLogo;
        uiLogo.dataset.logoUrl = normalizedLogo;
        uiLogo.style.display = '';
        uiLogo.onerror = function () {
            if (requestToken !== _playerLogoRequestToken) return;
            uiLogo.style.display = 'none';
            uiLogo.removeAttribute('src');
        };
    };
    preloader.onerror = function () {
        if (requestToken !== _playerLogoRequestToken) return;
        uiLogo.style.display = 'none';
        uiLogo.removeAttribute('src');
    };
    preloader.src = normalizedLogo;
}

/**
 * Update expiry display with real data from expiringchnl_list API
 */
function updateExpiryDisplay(channel) {
    var uiExpiry = document.getElementById("ui-expiry");
    if (!uiExpiry) return;

    // Remove all previous expiry classes
    uiExpiry.classList.remove('expiry-free', 'expiry-active', 'expiry-warning', 'expiry-urgent', 'expiry-critical', 'expiry-expired');

    if (channel.expirydate && String(channel.expirydate).trim() !== "") {
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
        uiExpiry.innerText = "N/A";
        uiExpiry.classList.add('expiry-free');
    }
}

function setupPlayer(channel) {
    console.log("=== Setting up player for channel ===", channel);

    // Increment stream generation — stale callbacks from previous channel will be ignored
    _playerStreamGen++;
    var myGen = _playerStreamGen;

    // CRITICAL: Stop any previous stream IMMEDIATELY before anything else
    // This prevents the old channel from continuing to play in the background
    try {
        if (typeof AVPlayer !== 'undefined') {
            AVPlayer.stop();
        }
    } catch (e) {
        console.log("[Player] Previous stream stop (cleanup):", e.message);
    }

    // Clear any pending stream timeout from previous channel
    if (window._streamTimeoutTimer) {
        clearTimeout(window._streamTimeoutTimer);
        window._streamTimeoutTimer = null;
    }

    // Reset loading state for this new channel
    hasHiddenLoadingIndicator = false;

    // Track current channel for retry
    _lastAttemptedChannel = channel;

    // ==========================================
    // UPDATE UI FIRST - Show selected channel context
    // ==========================================

    const chName = channel.channel_name || channel.chtitle || "Unknown Channel";

    // Channel Name
    const uiName = document.getElementById("ui-channel-name");
    if (uiName) uiName.innerText = chName;

    // Channel Number
    const channelNum = channel.channelno || channel.urno || channel.chno || channel.ch_no || channel.id || "000";
    const uiNum = document.getElementById("ui-channel-number");
    if (uiNum) uiNum.innerText = channelNum;

    // Channel Logo - clear stale artwork immediately, then reuse cache or preload.
    updatePlayerChannelLogo(channel);

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

    // Update Price display
    const uiPrice = document.getElementById("ui-price");
    if (uiPrice) {
        uiPrice.classList.remove('price-paid');
        const priceVal = parseFloat(price) || 0;
        if (priceVal > 0) {
            uiPrice.innerText = "₹" + priceVal.toFixed(2);
            uiPrice.classList.add('price-paid');
        } else {
            uiPrice.innerText = "₹0.00";
        }
    }

    // Update Device ID display (real TV DUID, not API serial number)
    const uiDeviceId = document.getElementById("ui-device-id");
    if (uiDeviceId) {
        try {
            uiDeviceId.innerText = DeviceInfo.getDeviceIdLabel();
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
    // Update time every second — only start if not already running
    if (!playerDateTimeInterval) {
        playerDateTimeInterval = setInterval(updateDateTime, 1000);
    }

    // Update Index if list loaded
    // Use channel ID (channelno) for reliable lookup — names can have duplicates
    if (allChannels.length > 0) {
        var chId = channel.channelno || channel.urno || channel.chid || "";
        if (chId) {
            var foundIdx = allChannels.findIndex(function (ch) {
                return (ch.channelno || ch.urno || ch.chid || "") === chId;
            });
            if (foundIdx >= 0) {
                currentIndex = foundIdx;
            }
        } else {
            // Fallback to name match only if no ID available
            var nameIdx = allChannels.findIndex(function (ch) {
                return (ch.channel_name || ch.chtitle || "") === chName;
            });
            if (nameIdx >= 0) {
                currentIndex = nameIdx;
            }
        }
    }

    // ==========================================
    // VALIDATION PHASE - Check stream before playback
    // UI already shows selected channel context
    // ==========================================

    const streamUrl = channel.streamlink || channel.channel_url;
    const isDVBChannel = streamUrl && streamUrl.toLowerCase().startsWith('dvb://');

    console.log("=== STREAM URL DEBUG ===");
    console.log("Channel:", chName);
    console.log("Raw stream URL:", streamUrl);
    if (streamUrl) {
        console.log("Is DVB/FTA channel:", isDVBChannel);
    }
    console.log("========================");

    // Check stream URL exists
    if (!streamUrl) {
        console.warn("No Stream URL found for channel:", chName);
        // Stop any background playback
        try { if (typeof AVPlayer !== 'undefined') AVPlayer.stop(); } catch (e) {}
        showPlayerErrorPopup('No Stream Available', 'Stream URL not available for ' + chName + '. Please try another channel.');
        return;
    }

    // Fix and validate stream URL
    var fixedStreamUrl = streamUrl;
    if (!isDVBChannel) {
        fixedStreamUrl = fixLocalhostUrl(streamUrl);
        console.log("Stream URL (after fix):", fixedStreamUrl);

        if (!fixedStreamUrl.startsWith('http://') && !fixedStreamUrl.startsWith('https://')) {
            console.error("Invalid stream URL format:", streamUrl);
            try { if (typeof AVPlayer !== 'undefined') AVPlayer.stop(); } catch (e) {}
            showPlayerErrorPopup('Invalid Stream', 'Invalid stream URL format. Please try another channel.');
            return;
        }
    }

    // PRE-PLAY subscription check — block only when explicitly "no"
    if (channel.subscribed === "no" || channel.subscribed === "No" || channel.subscribed === "NO" ||
        channel.subscribed === false || channel.subscribed === 0 || channel.subscribed === "0") {
        console.warn("[Player] Channel not subscribed, blocking playback:", chName, "subscribed:", channel.subscribed);
        // Stop any background playback
        try { if (typeof AVPlayer !== 'undefined') AVPlayer.stop(); } catch (e) {}
        showPlayerErrorPopup('Subscription Not Available', 'Please subscribe to watch this channel.');
        return;
    }

    // Use only validated channels for current playing context/focus restoration.
    _lastPlayingChannel = channel;

    // ==========================================
    // VALIDATION PASSED - Start playback
    // ==========================================

    if (typeof AVPlayer !== 'undefined' && AVPlayer.isTizen()) {
        console.log("Using AVPlayer (Tizen mode)");
        if (isDVBChannel) {
            console.log("📡 FTA channel - using TV Window for full screen playback");
        }

        // Show loading indicator immediately
        showBufferingIndicator();

        // Stream timeout: if playback doesn't start within 15 seconds, show error
        if (window._streamTimeoutTimer) clearTimeout(window._streamTimeoutTimer);
        window._streamTimeoutTimer = setTimeout(function () {
            // Abort if a newer setupPlayer call was made (user switched channels)
            if (myGen !== _playerStreamGen) return;
            if (!hasHiddenLoadingIndicator) {
                console.warn("[Player] Stream timeout - playback did not start within 15s");
                hideBufferingIndicator();

                var ch = (currentIndex >= 0 && allChannels[currentIndex]) ? allChannels[currentIndex] : null;
                var isSubs = ch && (ch.subscribed === "yes" || ch.subscribed === "1" || ch.subscribed === true || ch.subscribed === 1);
                var price = ch ? parseFloat(ch.chprice || ch.price || 0) : 0;

                if (ch && !isSubs && price > 0) {
                    showPlayerErrorPopup('Subscription Not Available', 'Please subscribe to watch this channel.');
                } else if (isNetworkDisconnected()) {
                    showPlayerErrorPopup('Playback Error', 'Network disconnected. Please check your connection and try again.');
                } else {
                    showPlayerErrorPopup('Playback Error', 'Unable to play this channel. The stream may not be available.');
                }
            }
        }, 15000);

        try {
            // Use the FIXED stream URL (with localhost replaced for IPTV, or DVB URL for FTA)
            AVPlayer.changeStream(fixedStreamUrl);
            console.log("AVPlayer.changeStream called successfully with URL:", fixedStreamUrl);
        } catch (error) {
            console.error("Error calling AVPlayer.changeStream:", error);
            if (window._streamTimeoutTimer) clearTimeout(window._streamTimeoutTimer);
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

}

// ==========================================
// STREAM ADS - Right side ad overlay
// ==========================================
var streamAdTimer = null;
var streamAdRotateTimer = null;
var streamAdAds = [];
var streamAdCurrentIndex = 0;
var _streamAdLastChid = ""; // Track last loaded channel ID for ads caching

/**
 * Load and display stream ads for the current channel
 * Skips API call if ads are already loaded for the same channel
 * @param {String} chid - Channel ID
 */
function loadStreamAds(chid) {
    // Skip if already loaded for this channel
    if (chid && chid === _streamAdLastChid && streamAdAds.length > 0) {
        console.log("[StreamAd] Reusing cached ads for chid:", chid);
        streamAdCurrentIndex = 0;
        showStreamAd();
        return;
    }

    // Clear any existing timers
    clearStreamAdTimers();

    console.log("[StreamAd] Loading ads for chid:", chid);
    _streamAdLastChid = chid || "";

    AdsAPI.getStreamAds(chid)
        .then(function (ads) {
            if (ads && ads.length > 0) {
                console.log("[StreamAd] Got", ads.length, "stream ad(s)");
                streamAdAds = ads;
                streamAdCurrentIndex = 0;
                showStreamAd();
            } else {
                console.log("[StreamAd] No stream ads available");
                streamAdAds = [];
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

    currentIndex = nextIndex;

    var nextCh = allChannels[nextIndex];
    var nextLCN = nextCh.channelno || nextCh.urno || nextCh.chno || nextCh.ch_no || "";
    console.log("Zapping to channel LCN:", nextLCN, "index:", nextIndex, "name:", nextCh.chtitle || nextCh.channel_name);
    setupPlayer(nextCh);

    // Keep menu state in sync with remote zapping (UP/DOWN/CH+/CH-) automatically.
    // This updates language/category/channel selection even without pressing OK.
    syncSidebarWithCurrentPlayback(true);
    setTimeout(function () {
        syncSidebarWithCurrentPlayback(false);
    }, 120);

    // Show info bar for 5 seconds when channel is changed
    showOverlay();
}

function syncSidebarWithCurrentPlayback(ensureCache) {
    if (!sidebarState) return;

    if (ensureCache && (!Array.isArray(sidebarState.allChannelsCache) || sidebarState.allChannelsCache.length === 0)) {
        var fallback = (_allChannelsUnfiltered && _allChannelsUnfiltered.length > 0) ? _allChannelsUnfiltered : allChannels;
        if (Array.isArray(fallback) && fallback.length > 0) {
            sidebarState.allChannelsCache = fallback;
        }
    }

    if (!Array.isArray(sidebarState.languages) || sidebarState.languages.length === 0) return;

    alignSidebarToCurrentPlayback();

    if (sidebarState.isOpen) {
        if (sidebarState.channels.length > 0) {
            sidebarState.currentLevel = 'channels';
            sidebarState.channelIndex = Math.max(0, Math.min(findCurrentChannelInSidebar(), sidebarState.channels.length - 1));
            focusChannelItem(sidebarState.channelIndex);
        } else if (sidebarState.categories.length > 0) {
            sidebarState.currentLevel = 'categories';
            sidebarState.categoryIndex = Math.max(0, Math.min(sidebarState.categoryIndex, sidebarState.categories.length - 1));
            focusCategoryItem(sidebarState.categoryIndex);
        }
    }
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

function prefetchSidebarChannelLogos(channels, maxCount) {
    if (!Array.isArray(channels) || channels.length === 0) return;
    var limit = Math.min(maxCount || channels.length, channels.length);

    for (var i = 0; i < limit; i++) {
        var ch = channels[i] || {};
        var logoUrl = normalizeLogoCacheUrl(ch.logo_url || ch.chlogo || ch.logo || '');
        if (!logoUrl) continue;
        if (_logoCache[logoUrl]) continue;

        var pre = new Image();
        pre.onload = function () {
            _logoCache[this.src] = true;
        };
        pre.onerror = function () {};
        pre.src = logoUrl;
    }
}

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

function applyPreferredSidebarLanguage() {
    if (!Array.isArray(sidebarState.languages) || sidebarState.languages.length === 0) return;

    var preferredLangId = '';
    var preferredLangName = '';
    try {
        preferredLangId = String(sessionStorage.getItem('selectedLanguageId') || '').trim();
        preferredLangName = String(sessionStorage.getItem('selectedLanguageName') || '').trim().toLowerCase();
    } catch (e) {}

    // Ignore empty/all/subscribed pseudo-filters for sidebar initialization.
    if (preferredLangId === '' || preferredLangId === 'all' || preferredLangId === 'subs' || preferredLangId === 'subscribed') {
        preferredLangId = '';
    }

    var matchedIndex = -1;

    if (preferredLangId) {
        matchedIndex = sidebarState.languages.findIndex(function (lang) {
            var langId = String((lang && (lang.langid || lang.code)) || '').trim();
            return langId && langId === preferredLangId;
        });
    }

    if (matchedIndex < 0 && preferredLangName) {
        matchedIndex = sidebarState.languages.findIndex(function (lang) {
            var langName = String((lang && lang.name) || '').trim().toLowerCase();
            return langName && langName === preferredLangName;
        });
    }

    // Fallback: align menu language with currently playing channel language.
    if (matchedIndex < 0 && (_lastPlayingChannel || _lastAttemptedChannel)) {
        var currentChannel = _lastPlayingChannel || _lastAttemptedChannel;
        var playingLangId = String((currentChannel.langid || currentChannel.lang_id || '')).trim();
        if (playingLangId) {
            matchedIndex = sidebarState.languages.findIndex(function (lang) {
                var langId = String((lang && (lang.langid || lang.code)) || '').trim();
                return langId && langId === playingLangId;
            });
        }
    }

    if (matchedIndex >= 0) {
        sidebarState.languageIndex = matchedIndex;
    }
}

// Initialize sidebar with dynamic languages and categories
async function initializeSidebar() {
    var sidebar = document.getElementById('playerSidebar');
    if (!sidebar) return;

    // Load languages dynamically from channel data
    await loadLanguagesFromChannels();

    // Keep Player menu aligned with the language chosen from Home/Channels flow.
    applyPreferredSidebarLanguage();

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
    // Use ALL channels (including unsubscribed) so all languages appear in sidebar
    var channelsForLangs = _allChannelsUnfiltered.length > 0 ? _allChannelsUnfiltered : allChannels;
    if (!channelsForLangs || channelsForLangs.length === 0) {
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

    // Fallback: Extract unique languages from ALL channel data (including unsubscribed)
    var languageSet = new Set();
    channelsForLangs.forEach(function(ch) {
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
 * Find index of the currently playing channel in sidebarState.channels
 * Used so the sidebar opens with focus on the current channel, not the first one.
 */
function findCurrentChannelInSidebar() {
    if (sidebarState.channels.length === 0) return 0;
    var chId = getCurrentPlayingChannelId();
    if (!chId) return 0;
    var idx = sidebarState.channels.findIndex(function (ch) {
        return String(ch.channelno || ch.urno || ch.chid || "") === String(chId);
    });
    return idx >= 0 ? idx : 0;
}

function getCurrentPlayingChannelId() {
    // Prefer the latest attempted channel so sidebar sync updates immediately
    // during CH+/CH- zapping, without waiting for stream confirmation callbacks.
    var current = _lastAttemptedChannel || _lastPlayingChannel;
    if (!current && currentIndex >= 0 && currentIndex < allChannels.length) {
        current = allChannels[currentIndex];
    }
    if (!current) return '';
    return current.channelno || current.urno || current.chid || current.chno || current.ch_no || current.id || '';
}

function getCurrentPlayingCategoryIndex() {
    var currentId = String(getCurrentPlayingChannelId() || '');
    if (!currentId || !Array.isArray(sidebarState.categories) || sidebarState.categories.length === 0) {
        return -1;
    }

    var langFiltered = getFilteredChannelsByLanguage();
    for (var i = 0; i < sidebarState.categories.length; i++) {
        var catName = sidebarState.categories[i] && sidebarState.categories[i].name;
        if (!catName) continue;
        var found = langFiltered.some(function (ch) {
            var cid = String(ch.channelno || ch.urno || ch.chid || '');
            var chCat = ch.grtitle || ch.category || ch.genre || 'Miscellaneous';
            return cid === currentId && chCat === catName;
        });
        if (found) return i;
    }
    return -1;
}

function languageContainsCurrentPlayingChannel(langIndex) {
    var currentId = String(getCurrentPlayingChannelId() || '');
    if (!currentId) return false;
    if (!Array.isArray(sidebarState.languages) || langIndex < 0 || langIndex >= sidebarState.languages.length) return false;

    var originalIndex = sidebarState.languageIndex;
    sidebarState.languageIndex = langIndex;
    var filtered = getFilteredChannelsByLanguage();
    sidebarState.languageIndex = originalIndex;

    return filtered.some(function (ch) {
        return String(ch.channelno || ch.urno || ch.chid || '') === currentId;
    });
}

function alignSidebarToCurrentPlayback() {
    var currentId = String(getCurrentPlayingChannelId() || '');
    if (!currentId) return;

    var currentChannel = _lastPlayingChannel || _lastAttemptedChannel;
    var isCurrentSubscribed = !!(currentChannel && (
        currentChannel.subscribed === true || currentChannel.subscribed === 'yes' ||
        currentChannel.subscribed === 1 || currentChannel.subscribed === '1' ||
        currentChannel.is_subscribed === true || currentChannel.is_subscribed === 1 || currentChannel.is_subscribed === '1'
    ));

    // Priority rule: when the playing channel is subscribed, anchor menu on Subscribed language.
    if (isCurrentSubscribed) {
        var subscribedLangIndex = sidebarState.languages.findIndex(function (lang) {
            return String((lang && lang.code) || '').toLowerCase() === 'subscribed';
        });
        if (subscribedLangIndex >= 0 && languageContainsCurrentPlayingChannel(subscribedLangIndex)) {
            sidebarState.languageIndex = subscribedLangIndex;
        }
    }

    if (!languageContainsCurrentPlayingChannel(sidebarState.languageIndex)) {
        var langMatch = -1;
        for (var i = 0; i < sidebarState.languages.length; i++) {
            if (languageContainsCurrentPlayingChannel(i)) {
                langMatch = i;
                break;
            }
        }
        if (langMatch >= 0) {
            sidebarState.languageIndex = langMatch;
        }
    }

    updateLanguageDisplay();
    buildCategoriesForLanguage();

    var currentCategoryIndex = getCurrentPlayingCategoryIndex();
    if (currentCategoryIndex >= 0) {
        selectCategory(currentCategoryIndex);
        sidebarState.channelIndex = findCurrentChannelInSidebar();
    } else {
        sidebarState.categoryIndex = 0;
        if (sidebarState.categories.length > 0) {
            selectCategory(0);
        }
        sidebarState.channelIndex = 0;
    }
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
    sidebarState.channelIndex = sidebarState.channels.length > 0 ? findCurrentChannelInSidebar() : 0;

    // UPDATE: Prefetch logos for channels in THIS category BEFORE rendering
    // This reduces visible loading delay when switching categories
    prefetchSidebarChannelLogos(sidebarState.channels, sidebarState.channels.length);

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
 * Load channels for sidebar (uses ALL channels — subscribed + unsubscribed)
 * Sidebar displays all channels; playback is controlled by subscription check in setupPlayer.
 */
function loadSidebarChannels() {
    // Use unfiltered list for sidebar (all channels visible)
    var channelsForSidebar = _allChannelsUnfiltered.length > 0 ? _allChannelsUnfiltered : allChannels;
    if (!channelsForSidebar || channelsForSidebar.length === 0) {
        return;
    }

    // Cache ALL channels for sidebar filtering (language/category)
    sidebarState.allChannelsCache = channelsForSidebar;

    // Preload channel logos once to avoid visible reload/flicker while switching categories.
    prefetchSidebarChannelLogos(channelsForSidebar, channelsForSidebar.length);

    // Build categories for current language
    buildCategoriesForLanguage();

    console.log("[Sidebar] Loaded", channelsForSidebar.length, "channels (all for display)");
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
        var logoUrl = normalizeLogoCacheUrl(ch.logo_url || ch.chlogo || ch.logo || '');
        if (logoUrl && logoUrl.trim() !== '') {
            var logoImg = document.createElement('img');
            logoImg.alt = ch.chtitle || 'Channel';
            logoImg.onerror = function() {
                this.style.display = 'none';
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
 * Triggered by OK/Menu (and LEFT fallback)
 */
function openSidebar() {
    var sidebar = document.getElementById('playerSidebar');
    if (!sidebar) return;

    sidebarState.isOpen = true;
    sidebar.classList.add('open');
    sidebar.classList.remove('close');

    // Keep info bar visible when sidebar is open; shrink/shift it beside menu.
    var overlay = document.querySelector('.player-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
    }

    var infoBar = document.querySelector('.info-bar-premium');
    if (infoBar) {
        infoBar.classList.remove('info-bar-hidden');
        infoBar.classList.add('sidebar-active');
    }

    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
        overlayTimeout = null;
    }

    // Start at categories level
    sidebarState.currentLevel = 'categories';

    // Always realign to currently playing channel context when menu opens.
    alignSidebarToCurrentPlayback();

    // Focus current channel when available; otherwise keep category focus.
    var categoriesSection = document.getElementById('sidebarCategoriesSection');
    var categoriesHidden = categoriesSection && categoriesSection.style.display === 'none';
    if (sidebarState.channels.length > 0) {
        sidebarState.currentLevel = 'channels';
        focusChannelItem(Math.max(0, Math.min(sidebarState.channelIndex, sidebarState.channels.length - 1)));
    } else if (!categoriesHidden && sidebarState.categories.length > 0) {
        sidebarState.currentLevel = 'categories';
        focusCategoryItem(Math.max(0, Math.min(sidebarState.categoryIndex, sidebarState.categories.length - 1)));
    } else {
        var leftArrow = document.getElementById('langNavLeft');
        if (leftArrow) leftArrow.focus();
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

    // Restore full-width info bar and continue normal auto-hide timer after menu closes.
    var infoBar = document.querySelector('.info-bar-premium');
    if (infoBar) {
        infoBar.classList.remove('sidebar-active');
        infoBar.classList.remove('info-bar-hidden');
    }

    var overlay = document.querySelector('.player-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
    }

    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
    }
    overlayTimeout = setTimeout(function () {
        hideOverlay();
    }, OVERLAY_HIDE_DELAY);

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

    // Show gradient overlay
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
    }

    // Show info bar and shift it for sidebar (info bar is now outside player-overlay)
    if (infoBar) {
        infoBar.classList.remove('info-bar-hidden');
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
    if (playerErrorPopupOpen) {
        // Keep info visible while the error popup is shown.
        return;
    }

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

    // Hide gradient overlay
    if (overlay) {
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
    }

    // Hide info bar directly (it is now outside player-overlay in DOM)
    if (infoBar) {
        infoBar.classList.add('info-bar-hidden');
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

    // CH+/CH- (and PageUp/PageDown) should always zap channels, even while menu is open.
    // Sidebar state will be auto-aligned by changeChannel().
    if (code === 427 || code === 33) {
        changeChannel(1);
        e.preventDefault();
        return true;
    }
    if (code === 428 || code === 34) {
        changeChannel(-1);
        e.preventDefault();
        return true;
    }

    // Check what element is focused
    var isOnLanguageArrow = activeEl && activeEl.classList.contains('lang-nav-arrow');
    var isOnCategory = activeEl && activeEl.classList.contains('category-item');
    var isOnChannel = activeEl && activeEl.classList.contains('channel-item');

    // ==========================================
    // GLOBAL LEFT/RIGHT → CYCLE LANGUAGE/HEADER TAB
    // When the sidebar/menu is open, LEFT and RIGHT always cycle the top header
    // (All Channels → Subscribed → Tamil → English → ...) and rebuild the
    // category + channel list below it.  This matches the ◄ / ► arrows shown
    // in the language navigation row.
    // ==========================================
    if (code === 37 || code === 39) {
        if (code === 37) {
            changeLanguage(-1); // LEFT — previous header tab (wraps)
        } else {
            changeLanguage(1);  // RIGHT — next header tab (wraps)
        }

        if (sidebarState.channels.length > 0) {
            sidebarState.currentLevel = 'channels';
            sidebarState.channelIndex = findCurrentChannelInSidebar();
            focusChannelItem(sidebarState.channelIndex);
        } else if (sidebarState.categories.length > 0) {
            sidebarState.currentLevel = 'categories';
            sidebarState.categoryIndex = 0;
            focusCategoryItem(0);
        } else {
            var leftArrowFocus = document.getElementById('langNavLeft');
            if (leftArrowFocus) leftArrowFocus.focus();
        }

        var curLang = sidebarState.languages[sidebarState.languageIndex];
        console.log('[Sidebar] LEFT/RIGHT - header tab changed to:', curLang ? curLang.name : '?');
        e.preventDefault();
        return true;
    }

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
                    // Categories hidden - go directly to current channel
                    sidebarState.currentLevel = 'channels';
                    var currentChIdx = findCurrentChannelInSidebar();
                    sidebarState.channelIndex = currentChIdx;
                    focusChannelItem(currentChIdx);
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
        var categoryCount = categories.length;
        
        switch (code) {
            case 37: // LEFT - Previous category (wrap)
                if (categoryCount > 0) {
                    var prevCatIdx = (currentCatIndex - 1 + categoryCount) % categoryCount;
                    sidebarState.categoryIndex = prevCatIdx;
                    focusCategoryItem(prevCatIdx);
                    selectCategory(prevCatIdx);
                }
                e.preventDefault();
                handled = true;
                break;

            case 39: // RIGHT - Next category (wrap)
                if (categoryCount > 0) {
                    var nextCatIdx = (currentCatIndex + 1) % categoryCount;
                    sidebarState.categoryIndex = nextCatIdx;
                    focusCategoryItem(nextCatIdx);
                    selectCategory(nextCatIdx);
                }
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
                    // At last category, move to current channel
                    if (sidebarState.channels.length > 0) {
                        sidebarState.currentLevel = 'channels';
                        var currentChIdx = findCurrentChannelInSidebar();
                        sidebarState.channelIndex = currentChIdx;
                        focusChannelItem(currentChIdx);
                    } else {
                        sidebarState.currentLevel = 'categories';
                        focusCategoryItem(currentCatIndex);
                    }
                }
                e.preventDefault();
                handled = true;
                break;

            case 13: // ENTER
                // Select category (already highlighted, just confirm)
                selectCategory(currentCatIndex);
                // Move to channels when available; otherwise keep category focus.
                if (sidebarState.channels.length > 0) {
                    sidebarState.currentLevel = 'channels';
                    var currentChIdx = findCurrentChannelInSidebar();
                    sidebarState.channelIndex = currentChIdx;
                    focusChannelItem(currentChIdx);
                } else {
                    sidebarState.currentLevel = 'categories';
                    focusCategoryItem(currentCatIndex);
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

    // Dismiss error popup if open before trying new channel
    if (playerErrorPopupOpen) {
        hidePlayerErrorPopup();
    }

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
    var infoBarVisible = isInfoBarVisible();
    console.log("Player Key:", code);

    if (playerErrorPopupOpen) {
        resetPlayerErrorUiTimer();
    }

    // Handle sidebar navigation first if sidebar is open
    // Sidebar remains accessible even when error popup is visible
    if (sidebarState.isOpen && handleSidebarKeydown(e)) {
        return;
    }

    // Handle error popup - volume / channel-change / number pad / sidebar all accessible
    if (playerErrorPopupOpen) {
        // Volume keys must NOT be prevented — system handles them
        if (code === 447 || code === 448 || code === 449) {
            handleVolumeKeys(code);
            return;
        }

        e.preventDefault();

        if (code === 10009 || code === 27) {
            // BACK
            if (sidebarState.isOpen) {
                closeSidebar();
                console.log('[Player] RETURN pressed - closing sidebar (popup open)');
            } else {
                hidePlayerErrorPopup();
                showOverlay();
            }
        } else if (code === 13) {
            // ENTER - click Try Again button
            var btn = document.getElementById('playerRetryBtn');
            if (btn) btn.click();
        } else if (code === 38 || code === 427 || code === 33) {
            // UP / CH+ / PageUp - switch to next channel
            hidePlayerErrorPopup();
            changeChannel(1);
        } else if (code === 40 || code === 428 || code === 34) {
            // DOWN / CH- / PageDown - switch to previous channel
            hidePlayerErrorPopup();
            changeChannel(-1);
        } else if (code === 37) {
            // LEFT - show channel number pad when sidebar is closed
            if (!sidebarState.isOpen) {
                openDirectChannelEntryPrompt();
                console.log('[Player] LEFT pressed - showing number pad (popup open)');
            }
        } else if (code === 39) {
            // RIGHT - show info bar while channel is playing
            showOverlay();
        } else if ((code >= 48 && code <= 57) || (code >= 96 && code <= 105)) {
            // Number keys - support direct channel entry even when popup is visible.
            var digit = (code >= 48 && code <= 57) ? String(code - 48) : String(code - 96);
            handleNumberInput(digit);
            showOverlay();
        } else if (code === 10253 || code === 77) {
            // Menu - toggle sidebar
            toggleSidebar();
        }
        return;
    }

    // Toggle sidebar with Menu key (code 10253) or 'M' key
    if (code === 10253 || code === 77) { // Menu or 'M'
        e.preventDefault();
        toggleSidebar();
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

    // LEFT when sidebar is closed: open direct channel entry prompt.
    if (code === 37 && !sidebarState.isOpen) {
        e.preventDefault();
        openDirectChannelEntryPrompt();
        return;
    }

    // RIGHT when sidebar is closed: show info bar.
    if (code === 39 && !sidebarState.isOpen) {
        e.preventDefault();
        showOverlay();
        return;
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

    // LEFT Arrow - handled above when sidebar closed; reaching here only if sidebar open
    if (code === 37) {
        e.preventDefault();
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
        // Confirm direct numeric channel entry when digits exist.
        if (channelNumberBuffer) {
            if (channelInputTimeout) {
                clearTimeout(channelInputTimeout);
                channelInputTimeout = null;
            }
            navigateToChannelNumber(channelNumberBuffer);
            channelNumberBuffer = '';
            hideChannelNumberInput();
            return;
        }

        // FEAT-002: OK opens menu/category overlay.
        openSidebar();
        return;
    }

    // Channel Up / Down — always change channel immediately on UP/DOWN press
    if (code === 38 || code === 427 || code === 33) { // UP Arrow, CH+, PageUp
        changeChannel(1);
        return;
    }
    if (code === 40 || code === 428 || code === 34) { // DOWN Arrow, CH-, PageDown
        changeChannel(-1);
        return;
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

function resetChannelInputTimer() {
    if (channelInputTimeout) {
        clearTimeout(channelInputTimeout);
    }
    channelInputTimeout = setTimeout(function () {
        var value = String(channelNumberBuffer || '').replace(/\D/g, '');
        if (value.length > 0) {
            navigateToChannelNumber(value);
        }
        channelNumberBuffer = "";
        hideChannelNumberInput();
    }, CHANNEL_INPUT_DELAY);
}

/**
 * Handle number key input for direct channel navigation
 */
function handleNumberInput(digit) {
    console.log("[Player] Number key pressed:", digit);

    // Add digit to buffer
    channelNumberBuffer = String(channelNumberBuffer + digit).replace(/\D/g, '').slice(0, 4);

    // Show the channel number input display
    showChannelNumberInput(channelNumberBuffer);

    var inputEl = document.getElementById('channel-number-field');
    if (inputEl) {
        inputEl.value = channelNumberBuffer;
        try { inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length); } catch (e) {}
    }

    resetChannelInputTimer();
}

/**
 * Show channel number input overlay
 */
function showChannelNumberInput(number) {
    var container = document.getElementById('player-container');
    if (!container) return;

    var inputWrap = document.getElementById('channel-number-input');
    if (!inputWrap) {
        inputWrap = document.createElement('div');
        inputWrap.id = 'channel-number-input';
        inputWrap.style.cssText = 'position:absolute; top:72px; right:72px; z-index:10000; ' +
            'background:rgba(0,0,0,0.88); border:2px solid rgba(59,92,255,0.6); border-radius:14px; ' +
            'padding:14px 18px; min-width:220px; box-shadow:0 10px 40px rgba(0,0,0,0.55);';

        var title = document.createElement('div');
        title.textContent = 'Channel Number';
        title.style.cssText = 'font-size:16px; color:rgba(255,255,255,0.8); margin-bottom:8px;';

        var input = document.createElement('input');
        input.id = 'channel-number-field';
        input.type = 'tel';
        input.inputMode = 'numeric';
        input.pattern = '[0-9]*';
        input.maxLength = 4;
        input.autocomplete = 'off';
        input.style.cssText = 'width:190px; height:58px; border-radius:10px; border:2px solid #ffffff; ' +
            'background:rgba(15,15,15,0.92); color:#fff; font-size:42px; font-weight:700; ' +
            'text-align:center; outline:none;';

        input.addEventListener('input', function () {
            this.value = String(this.value || '').replace(/\D/g, '').slice(0, 4);
            channelNumberBuffer = this.value;
            resetChannelInputTimer();
        });

        input.addEventListener('keydown', function (e) {
            if (e.keyCode === 13 && channelNumberBuffer.length > 0) {
                e.preventDefault();
                if (channelInputTimeout) clearTimeout(channelInputTimeout);
                navigateToChannelNumber(channelNumberBuffer);
                channelNumberBuffer = '';
                hideChannelNumberInput();
                return;
            }
            if (e.keyCode === 10009 || e.keyCode === 27) {
                e.preventDefault();
                channelNumberBuffer = '';
                hideChannelNumberInput();
            }
        });

        inputWrap.appendChild(title);
        inputWrap.appendChild(input);
        container.appendChild(inputWrap);
    }

    inputWrap.style.display = 'block';

    var inputEl = document.getElementById('channel-number-field');
    if (inputEl) {
        inputEl.value = number && number.length ? number : '';
        inputEl.readOnly = false;
        inputEl.focus();
        if (typeof inputEl.click === 'function') inputEl.click();
        try { inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length); } catch (e) {}
    }
}

/**
 * Hide channel number input overlay
 */
function hideChannelNumberInput() {
    var inputWrap = document.getElementById('channel-number-input');
    if (inputWrap) {
        inputWrap.style.display = 'none';
        var inputEl = document.getElementById('channel-number-field');
        if (inputEl && typeof inputEl.blur === 'function') inputEl.blur();
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

    // Toast notification — bottom-center, auto-dismisses after 2.5s
    var toast = document.getElementById('channel-not-found');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'channel-not-found';
        toast.style.cssText = 'position:absolute; bottom:120px; left:50%; transform:translateX(-50%);' +
            'background:rgba(30,30,30,0.95); color:#fff; padding:16px 40px; border-radius:40px;' +
            'font-size:22px; z-index:10000; text-align:center; white-space:nowrap;' +
            'border:1px solid rgba(255,68,68,0.5); pointer-events:none;';
        container.appendChild(toast);
    }

    toast.textContent = 'Channel ' + number + ' is not available';
    toast.style.display = 'block';
    toast.style.opacity = '1';

    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(function () {
        toast.style.display = 'none';
    }, 2500);
}

// ==========================================
// OVERLAY AUTO-HIDE/SHOW FUNCTIONALITY
// ==========================================
// Note: overlayTimeout and OVERLAY_HIDE_DELAY are declared at top with sidebar timers

function syncInfoBarSidebarState() {
    var infoBar = document.querySelector('.info-bar-premium');
    if (!infoBar) return;

    if (sidebarState && sidebarState.isOpen) {
        infoBar.classList.add('sidebar-active');
    } else {
        infoBar.classList.remove('sidebar-active');
    }
}

/**
 * Force show info bar overlay (used when error popup appears)
 * Info bar is now outside .player-overlay so it stacks in root context at z-index:9998
 */
function showInfoBarForced() {
    var infoBar = document.querySelector('.info-bar-premium');
    if (infoBar) {
        infoBar.classList.remove('info-bar-hidden');
        syncInfoBarSidebarState();
        console.log('[InfoBar] Force shown above popup');
    }
    // Also show the gradient overlay (z-index:1002, behind popup but gives readable bg)
    var overlay = document.querySelector('.player-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
    }
}

/**
 * Show info bar overlay and set auto-hide timer
 * Resets timer on each call (for OK button or channel change)
 */
function showOverlay() {
    // Don't show info bar if sidebar is open (sidebar handles timing)
    if (sidebarState.isOpen) {
        syncInfoBarSidebarState();
        return;
    }

    var overlay = document.querySelector('.player-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
    }

    // Show info bar directly (it is now outside player-overlay in DOM)
    var infoBar = document.querySelector('.info-bar-premium');
    if (infoBar) {
        infoBar.classList.remove('info-bar-hidden');
        syncInfoBarSidebarState();
    }

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

/**
 * Hide info bar overlay
 */
function hideOverlay() {
    if (playerErrorPopupOpen) {
        // Do not hide info bar while error popup is active.
        return;
    }

    var overlay = document.querySelector('.player-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
        if (overlayTimeout) {
            clearTimeout(overlayTimeout);
            overlayTimeout = null;
        }
    }

    // Hide info bar directly (it is now outside player-overlay in DOM)
    var infoBar = document.querySelector('.info-bar-premium');
    if (infoBar) {
        infoBar.classList.add('info-bar-hidden');
        syncInfoBarSidebarState();
    }

    console.log('[InfoBar] Hidden');
}

function isInfoBarVisible() {
    var infoBar = document.querySelector('.info-bar-premium');
    return !!(infoBar && !infoBar.classList.contains('info-bar-hidden'));
}

function openDirectChannelEntryPrompt() {
    channelNumberBuffer = '';
    showChannelNumberInput(channelNumberBuffer);
    resetChannelInputTimer();
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

// Keep mouse/touch interactions refreshing info bar visibility.
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
