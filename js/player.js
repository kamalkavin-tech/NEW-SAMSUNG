/**
 * BBNL Player Controller - Uses AVPlayer Module
 */

window.onload = function () {
    console.log("=== Player Initialized ===");

    // Initialize AVPlayer
    if (typeof AVPlayer !== 'undefined') {
        AVPlayer.init({
            callbacks: {
                onBufferingStart: () => console.log("Buffering..."),
                onBufferingComplete: () => console.log("Buffering Done"),
                onError: (e) => console.error("Player Error:", e),
                onStreamCompleted: () => {
                    console.log("Playback Finished");
                }
            }
        });
    } else {
        console.error("AVPlayer Module not loaded!");
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
    console.log("Stream URL:", streamUrl);

    if (!streamUrl) {
        console.warn("No Stream URL found for channel:", channel);
        alert("Stream not available. Please login or check subscription.");
        return;
    }

    if (typeof AVPlayer !== 'undefined' && AVPlayer.isTizen()) {
        AVPlayer.changeStream(streamUrl);
    } else {
        // Fallback or Test Mode
        console.warn("Non-Tizen Environment: Using Fallback");
        const v = document.getElementById("video-player");
        if (v) {
            v.src = streamUrl;
            v.play();
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
