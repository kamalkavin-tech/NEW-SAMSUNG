/**
 * Tizen AVPlay Player Module 
 * Implements the AVPlayer interface requested by the user.
 */

var AVPlayer = (function () {
    // Internal State
    var playerState = "NONE"; // NONE, IDLE, READY, PLAYING, PAUSED
    var avplay = null;
    var isTizenProp = false;
    var currentTime = 0;
    var totalDuration = 0;

    // Callbacks
    var eventCallbacks = {
        onBufferingStart: function () { console.log("Buffering Start"); },
        onBufferingProgress: function (percent) { console.log("Buffering: " + percent + "%"); },
        onBufferingComplete: function () { console.log("Buffering Complete"); },
        onStreamCompleted: function () { console.log("Stream Ended"); },
        onCurrentPlayTime: function (time) { currentTime = time; },
        onError: function (type) { console.error("AVPlay Error: " + type); },
        onEvent: function (event, data) { console.log("AVPlay Event: " + event, data); },
        onSubtitle: function (subtitle) { }
    };

    /**
     * Check Environment
     */
    function checkEnv() {
        if (typeof webapis !== 'undefined' && webapis.avplay) {
            avplay = webapis.avplay;
            isTizenProp = true;
            return true;
        }
        return false;
    }

    // Public API
    return {
        init: function (options) {
            console.log("[AVPlayer] Init called");
            checkEnv();
            if (options && options.callbacks) {
                this.setCallbacks(options.callbacks);
            }
        },

        setUrl: function (url) {
            if (!isTizenProp) {
                console.warn("[AVPlayer] Not Tizen - setUrl mocked");
                return;
            }
            try {
                avplay.open(url);
                playerState = "IDLE";
                console.log("[AVPlayer] URL Set:", url);
            } catch (e) {
                console.error("[AVPlayer] setUrl Exception:", e);
                if (eventCallbacks.onError) eventCallbacks.onError(e.message);
            }
        },

        play: function () {
            if (!isTizenProp) return;

            try {
                if (playerState === "IDLE") {
                    avplay.prepareAsync(function () {
                        playerState = "READY";
                        console.log("[AVPlayer] Prepared. Starting Playback...");
                        avplay.play();
                        playerState = "PLAYING";
                    }, function (e) {
                        console.error("[AVPlayer] Prepare Failed:", e);
                    });
                } else if (playerState === "PAUSED") {
                    avplay.play();
                    playerState = "PLAYING";
                } else {
                    // Direct play call logic if needed
                    avplay.play();
                }
            } catch (e) {
                console.error("[AVPlayer] Play Exception:", e);
            }
        },

        pause: function () {
            if (!isTizenProp) return;
            try {
                avplay.pause();
                playerState = "PAUSED";
            } catch (e) {
                console.error("[AVPlayer] Pause Error", e);
            }
        },

        stop: function () {
            if (!isTizenProp) return;
            try {
                avplay.stop();
                playerState = "IDLE"; // or NONE depending on logic
            } catch (e) { console.error("[AVPlayer] Stop Error", e); }
        },

        seekTo: function (positionMs) {
            if (!isTizenProp) return;
            try {
                // Success callback, Error callback required for jumpTo?
                // Tizen 2.3 used jumpForward/Backward, newer uses seekTo
                avplay.seekTo(positionMs, function () {
                    console.log("Seek Success");
                }, function (e) {
                    console.error("Seek Failed", e);
                });
            } catch (e) { console.error("[AVPlayer] Seek Error", e); }
        },

        jumpForward: function (ms) {
            if (!isTizenProp) return;
            try {
                avplay.jumpForward(ms);
            } catch (e) { console.error("Jump Fwd Error", e); }
        },

        jumpBackward: function (ms) {
            if (!isTizenProp) return;
            try {
                avplay.jumpBackward(ms);
            } catch (e) { console.error("Jump Bwd Error", e); }
        },

        setVolume: function (level) {
            // 0-100 logic handled by Tizen usually via tizen.tvaudiocontrol
            // AVPlay doesn't manage global volume usually, but specific API might exist?
            // Assuming user wants standard AVPlay wrapper behavior:
            console.warn("Volume control via AVPlay usually external (tvaudiocontrol)");
        },

        getVolume: function () { return 0; },

        setMute: function (mute) { },
        toggleMute: function () { },

        getCurrentTime: function () {
            if (!isTizenProp) return 0;
            try {
                return avplay.getCurrentTime();
            } catch (e) { return 0; }
        },

        getDuration: function () {
            if (!isTizenProp) return 0;
            try {
                return avplay.getDuration();
            } catch (e) { return 0; }
        },

        getState: function () { return playerState; },

        isTizen: function () { return isTizenProp; },
        isEmulator: function () { return false; }, // basic mock
        isAVPlaySupported: function () { return isTizenProp; },
        getEnvironment: function () { return isTizenProp ? "Tizen" : "Web"; },

        testWithPublicStream: function () {
            this.setUrl("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"); // Common Public HLS
            this.prepareAndPlay(); // Helper if needed, or simply play()
        },

        setCallbacks: function (callbacks) {
            // Merge callbacks
            eventCallbacks = Object.assign(eventCallbacks, callbacks);

            if (isTizenProp) {
                var listener = {
                    onbufferingstart: function () { eventCallbacks.onBufferingStart(); },
                    onbufferingprogress: function (percent) { eventCallbacks.onBufferingProgress(percent); },
                    onbufferingcomplete: function () { eventCallbacks.onBufferingComplete(); },
                    onstreamcompleted: function () { eventCallbacks.onStreamCompleted(); },
                    oncurrentplaytime: function (time) { eventCallbacks.onCurrentPlayTime(time); },
                    onerror: function (type) { eventCallbacks.onError(type); },
                    onevent: function (eventType, eventData) { eventCallbacks.onEvent(eventType, eventData); },
                    onsubtitlechange: function (duration, text, data3, data4) { eventCallbacks.onSubtitle(text); },
                    ondrmevent: function (drmEvent, drmData) { console.log("DRM Event:", drmEvent); }
                };
                try {
                    avplay.setListener(listener);
                } catch (e) { console.error("SetListener Failed", e); }
            }
        },

        destroy: function () {
            if (!isTizenProp) return;
            try {
                avplay.stop();
                avplay.close();
                playerState = "NONE";
            } catch (e) { }
        },

        changeStream: function (url) {
            this.stop();
            // avplay.close()? usually reset needed?
            // Safer to close and reopen
            try { avplay.close(); } catch (e) { }
            this.setUrl(url);
            this.setFullScreen(); // re-apply rect
            this.play();
        },

        setFullScreen: function () {
            if (!isTizenProp) return;
            try {
                // Try standard resizing
                avplay.setDisplayRect(0, 0, 1920, 1080);

                // Try setting display mode to full screen explicitly
                // This helps on some models where setDisplayRect alone leaves it hidden/windowed
                try {
                    avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                } catch (e2) {
                    // checking deprecated or alternative constants usually not needed if rect is set, but helpful safety
                }
            } catch (e) { }
        }
    };
})();
