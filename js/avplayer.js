/**
 * COMPLETE FINAL AVPlayer for Tizen Real TV
 * Includes: HTTP Headers, Localhost URL Fix, Stream Validation, Enhanced Error Handling
 * Version: ULTIMATE 3.0
 */

var AVPlayer = (function () {
    var playerState = "NONE";
    var avplay = null;
    var isTizenProp = false;
    var currentStreamUrl = "";

    // CRITICAL: Your IPTV server IP for localhost URL replacement
    var SERVER_IP = "124.40.244.211";

    var eventCallbacks = {
        onBufferingStart: function () { console.log("Buffering Start"); },
        onBufferingProgress: function (percent) { console.log("Buffering: " + percent + "%"); },
        onBufferingComplete: function () { console.log("Buffering Complete"); },
        onStreamCompleted: function () { console.log("Stream Ended"); },
        onCurrentPlayTime: function (time) { },
        onError: function (type, details) { console.error("AVPlay Error: " + type, details); },
        onEvent: function (event, data) { console.log("AVPlay Event: " + event, data); },
        onSubtitle: function (subtitle) { }
    };

    function checkEnv() {
        if (typeof webapis !== 'undefined' && webapis.avplay) {
            avplay = webapis.avplay;
            isTizenProp = true;
            return true;
        }
        return false;
    }

    /**
     * CRITICAL FIX #1: Replace localhost URLs with actual server IP
     */
    function fixLocalhostUrl(url) {
        if (!url) return url;

        var originalUrl = url;
        if (url.includes('127.0.0.1') || url.includes('localhost')) {
            console.log("[AVPlayer] ⚠️⚠️⚠️ LOCALHOST URL DETECTED ⚠️⚠️⚠️");
            console.log("[AVPlayer] Original URL:", originalUrl);

            url = url.replace(/127\.0\.0\.1/g, SERVER_IP);
            url = url.replace(/localhost/g, SERVER_IP);

            console.log("[AVPlayer] ✓ Fixed URL:", url);
        }

        return url;
    }

    return {
        init: function (options) {
            console.log("[AVPlayer] Init called");
            checkEnv();
            if (options && options.callbacks) {
                this.setCallbacks(options.callbacks);
            }
        },

        /**
         * CRITICAL FIX #2: Set HTTP Headers for Stream Requests
         * This is often the missing piece for real TV playback
         */
        setStreamingHeaders: function (url) {
            if (!isTizenProp) return;

            try {
                // Set custom HTTP headers for stream requests
                var httpHeaders = [
                    "User-Agent: Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.146 TV Safari/537.36",
                    "Accept: */*",
                    "Accept-Encoding: identity",
                    "Connection: keep-alive",
                    "Referer: " + window.location.href
                ];

                var headerString = httpHeaders.join("|");
                console.log("[AVPlayer] Setting HTTP headers");
                avplay.setStreamingProperty("CUSTOM_MESSAGE", headerString);

            } catch (e) {
                console.warn("[AVPlayer] Could not set custom headers:", e);
            }

            try {
                // Set adaptive streaming properties
                avplay.setStreamingProperty("ADAPTIVE_INFO", "BITRATES=LOWEST|LOW|MEDIUM");
                avplay.setStreamingProperty("START_BITRATE", "LOWEST");
                console.log("[AVPlayer] Adaptive streaming configured");

            } catch (e) {
                console.warn("[AVPlayer] Streaming properties warning:", e);
            }
        },

        setUrl: function (url) {
            if (!isTizenProp) {
                console.warn("[AVPlayer] Not Tizen - setUrl mocked");
                return;
            }

            try {
                console.log("[AVPlayer] ========================================");
                console.log("[AVPlayer] STARTING STREAM SETUP");
                console.log("[AVPlayer] Original URL:", url);
                console.log("[AVPlayer] ========================================");

                // Validate and clean URL
                if (!url || url.trim() === "") {
                    throw new Error("Stream URL is empty");
                }

                url = url.trim();

                // CRITICAL: Fix localhost URLs BEFORE anything else
                url = fixLocalhostUrl(url);

                currentStreamUrl = url;
                console.log("[AVPlayer] Final URL to use:", url);

                // STEP 1: Complete cleanup
                try {
                    console.log("[AVPlayer] Cleaning up previous instance...");
                    avplay.stop();
                    avplay.close();
                    playerState = "NONE";
                    console.log("[AVPlayer] ✓ Cleanup complete");
                } catch (cleanupError) {
                    console.log("[AVPlayer] No previous instance to clean");
                }

                // Minimal delay for cleanup to complete
                var self = this;
                setTimeout(function () {
                    try {
                        // STEP 2: Set HTTP headers BEFORE opening
                        console.log("[AVPlayer] Setting streaming headers...");
                        self.setStreamingHeaders(url);
                        console.log("[AVPlayer] ✓ Headers set");

                        // STEP 3: Open stream
                        console.log("[AVPlayer] Opening stream...");
                        avplay.open(url);
                        playerState = "IDLE";
                        console.log("[AVPlayer] ✓ Stream opened");

                        // STEP 4: Configure timeout and buffering (ULTRA-FAST START)
                        try {
                            console.log("[AVPlayer] Configuring ULTRA-FAST buffering...");

                            // AGGRESSIVE: Minimum buffering for instant start
                            avplay.setTimeoutForBuffering(2000); // 2 seconds timeout (very fast)

                            // CRITICAL: Reduce to MINIMUM buffer (1 second for play, 1 second for resume)
                            avplay.setBufferingParam("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", 1);
                            avplay.setBufferingParam("PLAYER_BUFFER_FOR_RESUME", "PLAYER_BUFFER_SIZE_IN_SECOND", 1);

                            // Try to set even more aggressive buffering if supported
                            try {
                                avplay.setBufferingParam("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_BYTE", 1024 * 100); // 100KB min
                            } catch (e) {
                                console.log("[AVPlayer] Byte-based buffering not supported");
                            }

                            console.log("[AVPlayer] ✓ ULTRA-FAST buffering configured (1s initial)");
                        } catch (bufferError) {
                            console.warn("[AVPlayer] Buffering config warning:", bufferError);
                        }

                        // STEP 5: Set display rectangle and method
                        try {
                            console.log("[AVPlayer] Setting display...");
                            // Set display area (full screen dimensions)
                            avplay.setDisplayRect(0, 0, 1920, 1080);

                            // Use AUTO_ASPECT_RATIO mode for full screen with proper aspect ratio
                            // This fills the screen while allowing HTML overlays
                            try {
                                avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO');
                                console.log("[AVPlayer] ✓ Display method set: AUTO_ASPECT_RATIO (full screen with overlay support)");
                            } catch (methodErr) {
                                console.warn("[AVPlayer] Could not set AUTO_ASPECT_RATIO mode, trying alternatives:", methodErr);
                                // Fallback: don't set display method, use default
                            }

                            console.log("[AVPlayer] ✓ Display configured");
                        } catch (displayError) {
                            console.error("[AVPlayer] Display error:", displayError);
                        }

                        console.log("[AVPlayer] ========================================");
                        console.log("[AVPlayer] ✓✓✓ STREAM SETUP COMPLETE ✓✓✓");
                        console.log("[AVPlayer] Ready to play:", currentStreamUrl);
                        console.log("[AVPlayer] ========================================");

                    } catch (setupError) {
                        console.error("[AVPlayer] ========================================");
                        console.error("[AVPlayer] ✗✗✗ SETUP FAILED ✗✗✗");
                        console.error("[AVPlayer] Error:", setupError.message);
                        console.error("[AVPlayer] Details:", setupError);
                        console.error("[AVPlayer] ========================================");

                        if (eventCallbacks.onError) {
                            eventCallbacks.onError("Stream setup failed: " + setupError.message, {
                                error: setupError,
                                url: url
                            });
                        }
                    }
                }, 10); // ULTRA-FAST: Minimal 10ms delay for instant start

            } catch (e) {
                console.error("[AVPlayer] setUrl Exception:", e);
                if (eventCallbacks.onError) {
                    eventCallbacks.onError("Failed to set URL: " + e.message);
                }
            }
        },

        play: function () {
            if (!isTizenProp) {
                console.warn("[AVPlayer] Not Tizen - play mocked");
                return;
            }

            try {
                console.log("[AVPlayer] ========================================");
                console.log("[AVPlayer] STARTING PLAYBACK");
                console.log("[AVPlayer] Current state:", playerState);
                console.log("[AVPlayer] Stream URL:", currentStreamUrl);
                console.log("[AVPlayer] ========================================");

                if (playerState === "IDLE") {
                    // ULTRA-FAST MODE: For HLS streams, try direct play without prepare
                    var isHLS = currentStreamUrl && (currentStreamUrl.includes('.m3u8') || currentStreamUrl.includes('.m3u'));

                    if (isHLS) {
                        console.log("[AVPlayer] ⚡ ULTRA-FAST MODE: HLS detected, attempting direct play...");
                        try {
                            avplay.play();
                            playerState = "PLAYING";
                            console.log("[AVPlayer] ========================================");
                            console.log("[AVPlayer] ✓✓✓ INSTANT PLAYBACK STARTED (HLS) ✓✓✓");
                            console.log("[AVPlayer] ========================================");
                            return;
                        } catch (directPlayError) {
                            console.warn("[AVPlayer] Direct play failed, falling back to prepareAsync:", directPlayError);
                            playerState = "IDLE"; // Reset state
                        }
                    }

                    // Fallback: Standard prepare for non-HLS or if direct play failed
                    console.log("[AVPlayer] Preparing stream...");

                    avplay.prepareAsync(
                        function () {
                            console.log("[AVPlayer] ✓✓✓ PREPARE SUCCESS ✓✓✓");
                            playerState = "READY";

                            try {
                                console.log("[AVPlayer] Starting playback...");
                                avplay.play();
                                playerState = "PLAYING";
                                console.log("[AVPlayer] ========================================");
                                console.log("[AVPlayer] ✓✓✓ PLAYBACK STARTED SUCCESSFULLY ✓✓✓");
                                console.log("[AVPlayer] ========================================");
                            } catch (playError) {
                                console.error("[AVPlayer] ✗✗✗ PLAY FAILED ✗✗✗");
                                console.error("[AVPlayer] Error:", playError);
                                if (eventCallbacks.onError) {
                                    eventCallbacks.onError("Play failed: " + playError.message);
                                }
                            }
                        },
                        function (prepareError) {
                            console.error("[AVPlayer] ========================================");
                            console.error("[AVPlayer] ✗✗✗ PREPARE FAILED ✗✗✗");
                            console.error("[AVPlayer] Error:", prepareError);
                            console.error("[AVPlayer] Error type:", typeof prepareError);
                            console.error("[AVPlayer] Error string:", String(prepareError));
                            console.error("[AVPlayer] Stream URL:", currentStreamUrl);
                            console.error("[AVPlayer] ========================================");

                            if (eventCallbacks.onError) {
                                eventCallbacks.onError("Prepare failed: " + prepareError, {
                                    error: prepareError,
                                    url: currentStreamUrl
                                });
                            }
                        }
                    );

                } else if (playerState === "PAUSED") {
                    console.log("[AVPlayer] Resuming from pause...");
                    avplay.play();
                    playerState = "PLAYING";
                    console.log("[AVPlayer] ✓ Resumed");
                } else if (playerState === "READY") {
                    console.log("[AVPlayer] Already prepared, playing...");
                    avplay.play();
                    playerState = "PLAYING";
                    console.log("[AVPlayer] ✓ Playing");
                } else {
                    console.log("[AVPlayer] Attempting direct play...");
                    avplay.play();
                    playerState = "PLAYING";
                }
            } catch (e) {
                console.error("[AVPlayer] Play Exception:", e);
                if (eventCallbacks.onError) {
                    eventCallbacks.onError("Playback error: " + e.message);
                }
            }
        },

        pause: function () {
            if (!isTizenProp) return;
            try {
                avplay.pause();
                playerState = "PAUSED";
                console.log("[AVPlayer] Paused");
            } catch (e) {
                console.error("[AVPlayer] Pause Error", e);
            }
        },

        stop: function () {
            if (!isTizenProp) return;
            try {
                avplay.stop();
                playerState = "IDLE";
                console.log("[AVPlayer] Stopped");
            } catch (e) {
                console.error("[AVPlayer] Stop Error", e);
            }
        },

        destroy: function () {
            if (!isTizenProp) return;
            try {
                console.log("[AVPlayer] Destroying player...");
                avplay.stop();
                avplay.close();
                playerState = "NONE";
                currentStreamUrl = "";
                console.log("[AVPlayer] ✓ Destroyed");
            } catch (e) {
                console.log("[AVPlayer] Destroy cleanup:", e);
            }
        },

        changeStream: function (url) {
            console.log("[AVPlayer] Changing stream to:", url);
            this.destroy();
            this.setUrl(url);
            var self = this;
            setTimeout(function () {
                self.play();
            }, 50); // ULTRA-FAST: 50ms delay for instant channel switching
        },

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

        jumpForward: function (milliseconds) {
            if (!isTizenProp) return;
            try {
                var currentTime = this.getCurrentTime();
                var newTime = currentTime + milliseconds;
                avplay.jumpForward(milliseconds);
                console.log("[AVPlayer] Jumped forward:", milliseconds, "ms to", newTime);
            } catch (e) {
                console.warn("[AVPlayer] Jump forward not supported:", e);
            }
        },

        jumpBackward: function (milliseconds) {
            if (!isTizenProp) return;
            try {
                var currentTime = this.getCurrentTime();
                var newTime = Math.max(0, currentTime - milliseconds);
                avplay.jumpBackward(milliseconds);
                console.log("[AVPlayer] Jumped backward:", milliseconds, "ms to", newTime);
            } catch (e) {
                console.warn("[AVPlayer] Jump backward not supported:", e);
            }
        },

        seekTo: function (milliseconds, successCallback, errorCallback) {
            if (!isTizenProp) {
                if (errorCallback) errorCallback("Not Tizen");
                return;
            }
            try {
                avplay.seekTo(milliseconds,
                    function() {
                        console.log("[AVPlayer] Seeked to:", milliseconds);
                        if (successCallback) successCallback();
                    },
                    function(err) {
                        console.error("[AVPlayer] Seek error:", err);
                        if (errorCallback) errorCallback(err);
                    }
                );
            } catch (e) {
                console.error("[AVPlayer] Seek exception:", e);
                if (errorCallback) errorCallback(e);
            }
        },

        getState: function () { return playerState; },
        isTizen: function () { return isTizenProp; },
        isAVPlaySupported: function () { return isTizenProp; },

        setCallbacks: function (callbacks) {
            eventCallbacks = Object.assign(eventCallbacks, callbacks);

            if (isTizenProp) {
                var listener = {
                    onbufferingstart: function () {
                        console.log("[AVPlayer] ►►► BUFFERING STARTED ◄◄◄");
                        eventCallbacks.onBufferingStart();
                    },
                    onbufferingprogress: function (percent) {
                        console.log("[AVPlayer] Buffering:", percent + "%");
                        eventCallbacks.onBufferingProgress(percent);
                    },
                    onbufferingcomplete: function () {
                        console.log("[AVPlayer] ►►► BUFFERING COMPLETE ◄◄◄");
                        eventCallbacks.onBufferingComplete();
                    },
                    onstreamcompleted: function () {
                        console.log("[AVPlayer] Stream completed");
                        eventCallbacks.onStreamCompleted();
                    },
                    oncurrentplaytime: function (time) {
                        eventCallbacks.onCurrentPlayTime(time);
                    },

                    onerror: function (eventType) {
                        console.error("[AVPlayer] ========================================");
                        console.error("[AVPlayer] ✗✗✗ ERROR EVENT ✗✗✗");
                        console.error("[AVPlayer] Error Type:", eventType);
                        console.error("[AVPlayer] Stream URL:", currentStreamUrl);
                        console.error("[AVPlayer] Player State:", playerState);
                        console.error("[AVPlayer] ========================================");

                        var errorDetails = {
                            type: eventType,
                            timestamp: new Date().toISOString(),
                            url: currentStreamUrl,
                            state: playerState
                        };

                        var userMessage = "Playback error";

                        switch (eventType) {
                            case "PLAYER_ERROR_CONNECTION_FAILED":
                                userMessage = "Cannot connect to stream server.\n\nPossible causes:\n• Stream URL is incorrect\n• Server is blocking TV requests\n• Network connection issue\n• CORS headers not set";
                                errorDetails.suggestion = "Check stream URL and network connectivity";
                                break;
                            case "PLAYER_ERROR_INVALID_URI":
                                userMessage = "Invalid stream URL format";
                                errorDetails.suggestion = "Verify the stream URL is correct";
                                break;
                            case "PLAYER_ERROR_INVALID_OPERATION":
                                userMessage = "Invalid player operation";
                                errorDetails.suggestion = "Player state issue - try restarting";
                                break;
                            case "PLAYER_ERROR_NOT_SUPPORTED_FORMAT":
                                userMessage = "Stream format not supported";
                                errorDetails.suggestion = "Check video codec compatibility (use HLS .m3u8)";
                                break;
                            case "PLAYER_ERROR_AUTHENTICATION_FAILED":
                                userMessage = "Stream authentication failed";
                                errorDetails.suggestion = "Check stream credentials";
                                break;
                            default:
                                userMessage = "Unknown error: " + eventType;
                        }

                        console.error("[AVPlayer] User Message:", userMessage);
                        console.error("[AVPlayer] Details:", errorDetails);
                        eventCallbacks.onError(userMessage, errorDetails);
                    },

                    onevent: function (eventType, eventData) {
                        console.log("[AVPlayer] Event:", eventType, eventData);
                        eventCallbacks.onEvent(eventType, eventData);
                    },

                    onsubtitlechange: function (duration, text) {
                        eventCallbacks.onSubtitle(text);
                    },

                    ondrmevent: function (drmEvent, drmData) {
                        console.log("[AVPlayer] DRM Event:", drmEvent);
                    }
                };

                try {
                    avplay.setListener(listener);
                    console.log("[AVPlayer] ✓ Listener registered successfully");
                } catch (e) {
                    console.error("[AVPlayer] SetListener Failed:", e);
                }
            }
        },

        /**
         * Test if a stream URL is accessible before trying to play it
         */
        testStreamUrl: function (url, callback) {
            console.log("[AVPlayer] ========================================");
            console.log("[AVPlayer] TESTING STREAM ACCESSIBILITY");
            console.log("[AVPlayer] URL:", url);
            console.log("[AVPlayer] ========================================");

            // Fix localhost URLs before testing
            url = fixLocalhostUrl(url);
            console.log("[AVPlayer] Testing URL (after localhost fix):", url);

            fetch(url, {
                method: 'GET',
                mode: 'cors'
            })
                .then(function (response) {
                    console.log("[AVPlayer] ✓ Stream test response:", response.status);
                    return response.text();
                })
                .then(function (data) {
                    console.log("[AVPlayer] ✓✓✓ STREAM IS ACCESSIBLE ✓✓✓");
                    console.log("[AVPlayer] M3U8 content preview:");
                    console.log(data.substring(0, 300));
                    console.log("[AVPlayer] ========================================");
                    if (callback) callback(true, data);
                })
                .catch(function (error) {
                    console.error("[AVPlayer] ========================================");
                    console.error("[AVPlayer] ✗✗✗ STREAM NOT ACCESSIBLE ✗✗✗");
                    console.error("[AVPlayer] Error:", error.message);
                    console.error("[AVPlayer] Error details:", error);
                    console.error("[AVPlayer] ========================================");
                    if (callback) callback(false, error);
                });
        },

        /**
         * Test with a known working public stream
         */
        testWithPublicStream: function () {
            var testUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
            console.log("[AVPlayer] ========================================");
            console.log("[AVPlayer] TESTING WITH PUBLIC STREAM");
            console.log("[AVPlayer] URL:", testUrl);
            console.log("[AVPlayer] ========================================");
            this.setUrl(testUrl);
            var self = this;
            setTimeout(function () {
                self.play();
            }, 1000);
        },

        /**
         * Update server IP for localhost URL replacement
         */
        setServerIP: function (ip) {
            SERVER_IP = ip;
            console.log("[AVPlayer] Server IP updated to:", SERVER_IP);
        }
    };
})();
