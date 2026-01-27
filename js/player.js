/**
 * BBNL Player Controller - Uses AVPlayer Module
 */

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
 */
function fixLocalhostUrl(url) {
    if (!url) return url;

    var originalUrl = url;
    var wasLocalhost = false;

    // Check if URL contains localhost or 127.0.0.1
    if (url.includes('127.0.0.1') || url.includes('localhost')) {
        wasLocalhost = true;
        console.log("⚠️ LOCALHOST URL DETECTED - Replacing with server IP");

        // Replace localhost with server IP
        url = url.replace(/127\.0\.0\.1/g, PLAYER_CONFIG.SERVER_IP);
        url = url.replace(/localhost/g, PLAYER_CONFIG.SERVER_IP);

        console.log("Original URL:", originalUrl);
        console.log("Fixed URL:", url);

        if (typeof DebugHelper !== 'undefined') {
            DebugHelper.log("⚠️ Localhost URL fixed", "127.0.0.1 → " + PLAYER_CONFIG.SERVER_IP);
        }
    }

    return url;
}


window.onload = function () {
    console.log("=== Player Initialized ===");

    // Initialize Debug Helper if available
    if (typeof DebugHelper !== 'undefined') {
        DebugHelper.createDebugOverlay();
        DebugHelper.log("Player page loaded");

        // Check environment
        var env = DebugHelper.checkEnvironment();

        // Get device info
        var deviceInfo = DebugHelper.getDeviceInfo();

        // Test API connection
        DebugHelper.testAPIConnection(function (error, data) {
            if (error) {
                DebugHelper.log("API Connection Test FAILED", error.message);
                alert("API Connection Error: " + error.message + "\n\nPlease check your network connection.");
            } else {
                DebugHelper.log("API Connection Test SUCCESS");
            }
        });
    }

    // Initialize AVPlayer
    if (typeof AVPlayer !== 'undefined') {
        AVPlayer.init({
            callbacks: {
                onBufferingStart: () => {
                    console.log("Buffering...");
                    if (typeof DebugHelper !== 'undefined') DebugHelper.log("Buffering started");
                },
                onBufferingComplete: () => {
                    console.log("Buffering Done");
                    if (typeof DebugHelper !== 'undefined') DebugHelper.log("Buffering complete");
                },
                onError: (e) => {
                    console.error("Player Error:", e);
                    if (typeof DebugHelper !== 'undefined') DebugHelper.log("Player Error", e);
                    alert("Playback Error: " + e + "\n\nPlease check the stream URL or try another channel.");
                },
                onStreamCompleted: () => {
                    console.log("Playback Finished");
                    if (typeof DebugHelper !== 'undefined') DebugHelper.log("Stream completed");
                }
            }
        });
    } else {
        console.error("AVPlayer Module not loaded!");
        if (typeof DebugHelper !== 'undefined') DebugHelper.log("AVPlayer NOT FOUND - Critical Error");
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

    // Register Keys
    try {
        const keys = ["MediaPlay", "MediaPause", "MediaStop", "MediaFastForward", "MediaRewind", "Return", "Enter", "10009", "ChannelUp", "ChannelDown"];
        tizen.tvinputdevice.registerKeyBatch(keys);
    } catch (e) { }

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
        if (response && response.body && Array.isArray(response.body)) {
            response = response.body;
        }
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
    if (typeof DebugHelper !== 'undefined') {
        DebugHelper.log("Setting up player", channel.chtitle || channel.channel_name);
    }

    // Populate UI Elements
    const uiName = document.getElementById("ui-channel-name");
    const uiLogo = document.getElementById("ui-channel-logo");
    const uiTitle = document.getElementById("ui-program-title");
    const uiNum = document.querySelector(".channel-number");

    // Standardize Name
    const chName = channel.channel_name || channel.chtitle || "Unknown Channel";
    if (uiName) uiName.innerText = chName;

    // Standardize Number (Using 'urno', 'chno', 'ch_no', or 'id')
    if (uiNum) {
        uiNum.innerText = channel.urno || channel.chno || channel.ch_no || channel.id || "000";
    }

    // Standardize Logo
    const logo = channel.logo_url || channel.chlogo;
    if (uiLogo) {
        if (logo) {
            uiLogo.src = logo;
        } else {
            uiLogo.src = ""; // Clear or set placeholder
        }
    }

    // For now, we mock the Program Title since API doesn't provide real-time EPG yet for this specific channel object
    if (uiTitle) uiTitle.innerText = "Live Stream: " + chName;

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

    if (typeof DebugHelper !== 'undefined') {
        DebugHelper.log("Stream URL (raw)", streamUrl ? streamUrl.substring(0, 80) : "NULL");
    }

    if (!streamUrl) {
        const errorMsg = "No Stream URL found for channel: " + chName;
        console.warn(errorMsg);
        if (typeof DebugHelper !== 'undefined') {
            DebugHelper.log("ERROR: No stream URL", channel);
        }
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

    if (typeof DebugHelper !== 'undefined') {
        DebugHelper.log("Stream URL (fixed)", fixedStreamUrl.substring(0, 80));
    }

    // Validate stream URL format (using fixed URL)
    if (!fixedStreamUrl.startsWith('http://') && !fixedStreamUrl.startsWith('https://')) {
        const errorMsg = "Invalid stream URL format: " + streamUrl;
        console.error(errorMsg);
        if (typeof DebugHelper !== 'undefined') {
            DebugHelper.log("ERROR: Invalid URL format", streamUrl);
        }
        alert("Invalid stream URL format.\n\nURL: " + streamUrl);
        return;
    }

    if (typeof AVPlayer !== 'undefined' && AVPlayer.isTizen()) {
        console.log("Using AVPlayer (Tizen mode)");
        if (typeof DebugHelper !== 'undefined') {
            DebugHelper.log("Using AVPlayer", "Tizen mode");
        }

        try {
            // Use the FIXED stream URL (with localhost replaced)
            AVPlayer.changeStream(fixedStreamUrl);
            console.log("AVPlayer.changeStream called successfully with URL:", fixedStreamUrl);
            if (typeof DebugHelper !== 'undefined') {
                DebugHelper.log("AVPlayer.changeStream called", fixedStreamUrl.substring(0, 80));
            }
        } catch (error) {
            console.error("Error calling AVPlayer.changeStream:", error);
            if (typeof DebugHelper !== 'undefined') {
                DebugHelper.log("ERROR in changeStream", error.message);
            }
            alert("Error starting playback: " + error.message + "\n\nURL: " + fixedStreamUrl.substring(0, 100));
        }
    } else {
        // Fallback or Test Mode
        console.warn("Non-Tizen Environment: Using Fallback HTML5 Video");
        if (typeof DebugHelper !== 'undefined') {
            DebugHelper.log("Using HTML5 fallback", "Not Tizen");
        }

        const v = document.getElementById("video-player");
        if (v) {
            // Use the FIXED stream URL
            v.src = fixedStreamUrl;
            v.play().catch(function (error) {
                console.error("HTML5 video play error:", error);
                if (typeof DebugHelper !== 'undefined') {
                    DebugHelper.log("HTML5 play error", error.message);
                }
            });
        }
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
    if (typeof AVPlayer !== 'undefined') {
        AVPlayer.destroy();
    }
}

function handleKeydown(e) {
    const code = e.keyCode;
    console.log("Player Key:", code);

    if (code === 10009 || code === 27) { // Back / ESC
        closePlayer();
        // Use history.back() for natural navigation flow
        window.history.back();
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
}
