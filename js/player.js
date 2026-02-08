/**
 * BBNL Player Controller - Uses AVPlayer Module
 */

// Check authentication - redirect to login if not logged in
(function checkAuth() {
    var userData = localStorage.getItem("bbnl_user");
    if (!userData) {
        console.log("[Auth] User not logged in, redirecting to login...");
        window.location.replace("login.html");
        return;
    }
})();

// ==========================================
// CONFIGURATION
// ==========================================
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
    if (url.includes('livestream.bbnl.in') || url.includes('livestream2.bbnl.in')) {
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
                    alert("Playback Error: " + e + "\n\nPlease check the stream URL or try another channel.");
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
        alert("Critical Error: AVPlayer module not loaded!");
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

    // Fetch Channel Context for Zapping (and Lookup)
    loadChannelList(channelNameParam);

    // Events
    document.addEventListener("keydown", handleKeydown);

    document.getElementById("back-btn").addEventListener("click", () => {
        closePlayer();
        window.history.back();
    });

    // Lifecycle
    document.addEventListener("visibilitychange", function () {
        if (typeof AVPlayer === 'undefined') return;

        if (document.hidden) {
            AVPlayer.pause();
        } else {
            AVPlayer.play();
        }
    });
};

var allChannels = [];
var currentIndex = -1;

async function loadChannelList(lookupName = null) {
    try {
        // We reuse the API used in channels page
        let response = await BBNL_API.getChannelList();

        if (Array.isArray(response)) {
            allChannels = response;
            console.log("Player: Loaded " + allChannels.length + " channels for zapping.");

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
            }
        }
    } catch (e) {
        console.error("Failed to load channel list in player", e);
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

    // Channel Logo
    const logo = channel.logo_url || channel.chlogo || channel.logo;
    const uiLogo = document.getElementById("ui-channel-logo");
    if (uiLogo) {
        if (logo && logo.trim() !== "" && !logo.includes('chnlnoimage')) {
            console.log("Setting channel logo:", logo);
            uiLogo.src = logo;
            uiLogo.onerror = function() {
                console.warn("Logo failed to load:", logo);
                this.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23667eea' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23fff' font-size='20' font-weight='bold'%3ETV%3C/text%3E%3C/svg%3E";
            };
        } else {
            console.log("No valid logo, using placeholder");
            uiLogo.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect fill='%23667eea' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23fff' font-size='20' font-weight='bold'%3ETV%3C/text%3E%3C/svg%3E";
        }
    }

    // Expiry Date
    const uiExpiry = document.getElementById("ui-expiry");
    if (uiExpiry) {
        if (channel.expirydate && channel.expirydate.trim() !== "") {
            const expiryDate = new Date(channel.expirydate);
            const today = new Date();
            const diffTime = expiryDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays > 0) {
                uiExpiry.innerText = "Expires in " + diffDays + " day" + (diffDays > 1 ? "s" : "");
            } else if (diffDays === 0) {
                uiExpiry.innerText = "Expires today";
            } else {
                uiExpiry.innerText = "Expired";
            }
        } else {
            // No expiry or unlimited subscription
            uiExpiry.innerText = "Active";
        }
    }

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
    if (uiStatus) {
        const isSubscribed = channel.subscribed === "yes" || channel.subscribed === "1" ||
                            channel.subscribed === true || channel.subscribed === 1;
        const price = channel.chprice || "0.00";

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
    setInterval(updateDateTime, 1000);

    // Update Index if list loaded
    if (allChannels.length > 0) {
        currentIndex = allChannels.findIndex(ch => (ch.chtitle || ch.channel_name) === chName);
    }

    const streamUrl = channel.streamlink || channel.channel_url;
    console.log("=== 🔍 STREAM URL DEBUG ===");
    console.log("Channel:", chName);
    console.log("Raw stream URL:", streamUrl);
    console.log("Stream URL type:", typeof streamUrl);
    console.log("Stream URL length:", streamUrl ? streamUrl.length : 0);
    if (streamUrl) {
        console.log("First 100 chars:", streamUrl.substring(0, 100));
        console.log("Starts with http:", streamUrl.startsWith('http'));
        console.log("Contains localhost:", streamUrl.includes('127.0.0.1') || streamUrl.includes('localhost'));
        console.log("Contains m3u8:", streamUrl.includes('m3u8'));
        console.log("Contains mpd:", streamUrl.includes('mpd'));
    }
    console.log("========================");


    if (!streamUrl) {
        const errorMsg = "No Stream URL found for channel: " + chName;
        console.warn(errorMsg);
        alert("Stream not available. Please login or check subscription.\n\nChannel: " + chName);
        return;
    }

    // ⚠️ FIX LOCALHOST URLs - Replace 127.0.0.1 with server IP
    var fixedStreamUrl = fixLocalhostUrl(streamUrl);

    // Update debug logging with fixed URL
    console.log("=== ✅ FINAL STREAM URL ===");
    console.log("Stream URL (after fix):", fixedStreamUrl);
    console.log("Contains localhost:", fixedStreamUrl.includes('127.0.0.1') || fixedStreamUrl.includes('localhost'));
    console.log("========================");


    // Validate stream URL format (using fixed URL)
    if (!fixedStreamUrl.startsWith('http://') && !fixedStreamUrl.startsWith('https://')) {
        const errorMsg = "Invalid stream URL format: " + streamUrl;
        console.error(errorMsg);
        alert("Invalid stream URL format.\n\nURL: " + streamUrl);
        return;
    }

    if (typeof AVPlayer !== 'undefined' && AVPlayer.isTizen()) {
        console.log("Using AVPlayer (Tizen mode)");

        // Show loading indicator immediately
        showBufferingIndicator();

        try {
            // Use the FIXED stream URL (with localhost replaced)
            AVPlayer.changeStream(fixedStreamUrl);
            console.log("AVPlayer.changeStream called successfully with URL:", fixedStreamUrl);
        } catch (error) {
            console.error("Error calling AVPlayer.changeStream:", error);
            hideBufferingIndicator();
            alert("Error starting playback: " + error.message + "\n\nURL: " + fixedStreamUrl.substring(0, 100));
        }
    } else {
        // Fallback or Test Mode
        console.warn("Non-Tizen Environment: Using Fallback HTML5 Video");

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

    console.log("Zapping to channel index:", nextIndex);
    setupPlayer(allChannels[nextIndex]);
}

function closePlayer() {
    clearStreamAdTimers();
    hideStreamAd();
    if (typeof AVPlayer !== 'undefined') {
        AVPlayer.destroy();
    }
}

function handleKeydown(e) {
    const code = e.keyCode;
    console.log("Player Key:", code);

    if (code === 10009 || code === 27) { // Back / ESC
        e.preventDefault();
        closePlayer();

        // Check if we came from language filtered channels
        var selectedLang = sessionStorage.getItem('selectedLanguageId');

        if (selectedLang && selectedLang !== '') {
            // Go back to channels page with filter still applied
            console.log('[Player] Navigating back to filtered channels page');
            window.location.href = 'channels.html';
        } else {
            // Normal flow - go back to home
            console.log('[Player] Navigating back to home');
            window.location.href = 'home.html';
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

    // Enter key - handle overlay interaction
    if (code === 13) {
        var activeEl = document.activeElement;
        if (activeEl && activeEl.classList.contains('focusable')) {
            activeEl.click();
        }
        showOverlay();
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
    indicator.hideTimeout = setTimeout(function() {
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
        setTimeout(function() {
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
document.addEventListener('DOMContentLoaded', function() {
    var progressContainer = document.querySelector('.progress-container');
    if (progressContainer) {
        progressContainer.addEventListener('click', function(e) {
            if (!isLiveStream && streamDuration > 0) {
                var rect = this.getBoundingClientRect();
                var clickX = e.clientX - rect.left;
                var percentage = clickX / rect.width;
                var seekTime = Math.floor(percentage * streamDuration);

                // Seek to the clicked position
                if (typeof AVPlayer !== 'undefined' && AVPlayer.isTizen()) {
                    try {
                        webapis.avplay.seekTo(seekTime, function() {
                            console.log('Seeked to:', seekTime);
                        }, function(err) {
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
    channelInputTimeout = setTimeout(function() {
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
    var channel = allChannels.find(function(ch) {
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
    setTimeout(function() {
        notFoundDisplay.style.display = 'none';
    }, 2000);
}

// ==========================================
// OVERLAY AUTO-HIDE/SHOW FUNCTIONALITY
// ==========================================
var overlayTimeout;
var OVERLAY_HIDE_DELAY = 5000; // Hide after 5 seconds of inactivity

function showOverlay() {
    var overlay = document.querySelector('.player-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');

        // Clear existing timeout
        if (overlayTimeout) {
            clearTimeout(overlayTimeout);
        }

        // Set new timeout to hide overlay
        overlayTimeout = setTimeout(function() {
            hideOverlay();
        }, OVERLAY_HIDE_DELAY);
    }
}

function hideOverlay() {
    var overlay = document.querySelector('.player-overlay');
    if (overlay) {
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
    }
}

// Show overlay on any user interaction
document.addEventListener('keydown', showOverlay);
document.addEventListener('mousemove', showOverlay);
document.addEventListener('click', showOverlay);

// Show overlay initially for 5 seconds when page loads
setTimeout(function() {
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
