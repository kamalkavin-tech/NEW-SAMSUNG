/**
 * COMPLETE FINAL AVPlayer for Tizen Real TV
 * Includes: HTTP Headers, Localhost URL Fix, Stream Validation, Enhanced Error Handling
 * DVB/FTA Channel Support Added
 * Version: ULTIMATE 4.0
 */

var AVPlayer = (function () {
    var playerState = "NONE";
    var avplay = null;
    var isTizenProp = false;
    var currentStreamUrl = "";
    var isDVBStream = false; // Track if current stream is DVB/FTA
    var tvWindow = null; // TV Window for FTA display

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
     * Check if TV Window API is available for FTA/DVB playback
     */
    function checkTVWindowEnv() {
        try {
            if (typeof tizen !== 'undefined' && tizen.tvwindow) {
                tvWindow = tizen.tvwindow;
                console.log("[AVPlayer] ✓ TV Window API available for FTA playback");
                return true;
            }
        } catch (e) {
            console.warn("[AVPlayer] TV Window API not available:", e);
        }
        return false;
    }

    /**
     * Check if URL is a DVB/FTA stream
     * DVB URLs format: dvb://ONID.TSID.SID or dvb://frequency.programNumber
     */
    function isDVBUrl(url) {
        if (!url) return false;
        return url.toLowerCase().startsWith('dvb://');
    }

    /**
     * Parse DVB URL to extract tuning parameters
     * @param {string} url - DVB URL like dvb://ONID.TSID.SID
     * @returns {object} Tuning parameters
     */
    function parseDVBUrl(url) {
        if (!url) return null;
        
        try {
            // Remove dvb:// prefix
            var dvbPath = url.replace(/^dvb:\/\//i, '');
            var parts = dvbPath.split('.');
            
            if (parts.length >= 3) {
                return {
                    originalNetworkId: parseInt(parts[0], 10),
                    transportStreamId: parseInt(parts[1], 10),
                    serviceId: parseInt(parts[2], 10)
                };
            } else if (parts.length === 2) {
                // Alternate format: frequency.programNumber
                return {
                    frequency: parseInt(parts[0], 10),
                    programNumber: parseInt(parts[1], 10)
                };
            }
        } catch (e) {
            console.error("[AVPlayer] Failed to parse DVB URL:", e);
        }
        return null;
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

    /**
     * Try HTTP version of HTTPS URL (fallback for SSL issues)
     */
    function tryHttpFallback(url) {
        if (url && url.startsWith('https://')) {
            var httpUrl = url.replace('https://', 'http://');
            console.log("[AVPlayer] 🔄 HTTP Fallback URL:", httpUrl);
            return httpUrl;
        }
        return url;
    }

    // Track if we should try HTTP fallback
    var httpsFailedUrls = {};

    // Timeout IDs for cancellation on new changeStream calls
    var _setUrlTimer = null;
    var _playTimer = null;
    // Generation counter — increments on each changeStream call
    // Stale callbacks check this to avoid acting on old streams
    var _streamGeneration = 0;
    var _httpFallbackTimer = null;

    return {
        init: function (options) {
            console.log("[AVPlayer] Init called");
            checkEnv();
            checkTVWindowEnv(); // Check for FTA/DVB support
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
                // Using browser-like User-Agent to avoid server blocking
                var httpHeaders = [
                    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept: */*",
                    "Accept-Encoding: gzip, deflate, br",
                    "Accept-Language: en-US,en;q=0.9",
                    "Connection: keep-alive",
                    "Origin: https://bbnl.in",
                    "Referer: https://bbnl.in/"
                ];

                var headerString = httpHeaders.join("|");
                console.log("[AVPlayer] Setting HTTP headers (browser-like)");
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

            // Try to set SSL verification (for self-signed certs)
            try {
                avplay.setStreamingProperty("SET_MODE_4K", "FALSE");
                console.log("[AVPlayer] 4K mode disabled for compatibility");
            } catch (e) {
                // Ignore if not supported
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
                var myGeneration = _streamGeneration;
                _setUrlTimer = setTimeout(function () {
                    _setUrlTimer = null;
                    // Abort if a newer changeStream call has been made
                    if (myGeneration !== _streamGeneration) {
                        console.log("[AVPlayer] setUrl aborted — stale generation", myGeneration, "vs", _streamGeneration);
                        return;
                    }
                    try {
                        // STEP 2: Open stream FIRST (required before setting properties)
                        console.log("[AVPlayer] Opening stream...");
                        avplay.open(url);
                        playerState = "IDLE";
                        console.log("[AVPlayer] ✓ Stream opened");

                        // STEP 3: Set HTTP headers AFTER opening (Samsung TV requirement)
                        console.log("[AVPlayer] Setting streaming headers...");
                        self.setStreamingHeaders(url);
                        console.log("[AVPlayer] ✓ Headers set");

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

                        // STEP 5: Set display rectangle and method for FULL SCREEN
                        try {
                            console.log("[AVPlayer] Setting FULL SCREEN display (1920x1080)...");
                            
                            // CRITICAL: Set display area to full screen dimensions (1920x1080)
                            // x=0, y=0, width=1920, height=1080
                            avplay.setDisplayRect(0, 0, 1920, 1080);
                            console.log("[AVPlayer] ✓ Display rect set: 0, 0, 1920, 1080");

                            // Try multiple display modes for TRUE FULL SCREEN (no black bars)
                            var displayModeSet = false;
                            
                            // Option 1: FULL_SCREEN - Stretches to fill entire screen (no black bars)
                            // Best for filling 100% of TV screen without any borders
                            try {
                                avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                                console.log("[AVPlayer] ✓ Display method: FULL_SCREEN (fills entire screen, no black bars)");
                                displayModeSet = true;
                            } catch (e1) {
                                console.log("[AVPlayer] FULL_SCREEN not available, trying ZOOM_16_9...");
                            }
                            
                            // Option 2: ZOOM_16_9 - Zooms to 16:9 ratio, fills screen
                            if (!displayModeSet) {
                                try {
                                    avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_ZOOM_16_9');
                                    console.log("[AVPlayer] ✓ Display method: ZOOM_16_9 (fills 16:9 screen)");
                                    displayModeSet = true;
                                } catch (e2) {
                                    console.log("[AVPlayer] ZOOM_16_9 not available, trying ZOOM...");
                                }
                            }
                            
                            // Option 3: ZOOM - Zooms to fill screen
                            if (!displayModeSet) {
                                try {
                                    avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_ZOOM');
                                    console.log("[AVPlayer] ✓ Display method: ZOOM (zooms to fill)");
                                    displayModeSet = true;
                                } catch (e3) {
                                    console.log("[AVPlayer] ZOOM not available, trying AUTO_ASPECT_RATIO...");
                                }
                            }
                            
                            // Option 4: AUTO_ASPECT_RATIO - Auto adjusts
                            if (!displayModeSet) {
                                try {
                                    avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO');
                                    console.log("[AVPlayer] ✓ Display method: AUTO_ASPECT_RATIO");
                                    displayModeSet = true;
                                } catch (e4) {
                                    console.warn("[AVPlayer] No display method could be set, using default");
                                }
                            }

                            console.log("[AVPlayer] ✓ FULL SCREEN display configured");
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
                    // SAMSUNG TV REQUIREMENT: Always use prepareAsync before play
                    // Direct play without prepare causes InvalidAccessError on real TV
                    console.log("[AVPlayer] Preparing stream (prepareAsync required for Samsung TV)...");

                    var playGeneration = _streamGeneration;
                    avplay.prepareAsync(
                        function () {
                            if (playGeneration !== _streamGeneration) {
                                console.log("[AVPlayer] prepareAsync success aborted — stale generation", playGeneration, "vs", _streamGeneration);
                                return;
                            }
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
                            if (playGeneration !== _streamGeneration) {
                                console.log("[AVPlayer] prepareAsync error ignored — stale generation", playGeneration, "vs", _streamGeneration);
                                return;
                            }
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
            // Stop DVB stream if playing
            if (isDVBStream) {
                this.stopDVBStream();
                return;
            }
            
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
            // Stop DVB stream if playing
            if (isDVBStream) {
                this.stopDVBStream();
            }
            
            if (!isTizenProp) return;
            try {
                console.log("[AVPlayer] Destroying player...");
                avplay.stop();
                avplay.close();
                playerState = "NONE";
                currentStreamUrl = "";
                isDVBStream = false;
                console.log("[AVPlayer] ✓ Destroyed");
            } catch (e) {
                console.log("[AVPlayer] Destroy cleanup:", e);
            }
        },

        changeStream: function (url) {
            console.log("[AVPlayer] Changing stream to:", url);

            // CRITICAL: Cancel any pending timers from previous changeStream calls
            if (_setUrlTimer) { clearTimeout(_setUrlTimer); _setUrlTimer = null; }
            if (_playTimer) { clearTimeout(_playTimer); _playTimer = null; }
            if (_httpFallbackTimer) { clearTimeout(_httpFallbackTimer); _httpFallbackTimer = null; }

            // Increment generation — all stale callbacks will check and abort
            _streamGeneration++;
            var myGeneration = _streamGeneration;
            console.log("[AVPlayer] Stream generation:", myGeneration);

            // Check if this is a DVB/FTA stream
            if (isDVBUrl(url)) {
                console.log("[AVPlayer] DVB/FTA stream detected");
                this.playDVBStream(url);
                return;
            }

            // Stop any DVB playback if switching from FTA to IPTV
            if (isDVBStream) {
                this.stopDVBStream();
            }

            isDVBStream = false;
            this.destroy();
            this.setUrl(url);
            var self = this;
            _playTimer = setTimeout(function () {
                _playTimer = null;
                // Abort if a newer changeStream call has been made
                if (myGeneration !== _streamGeneration) {
                    console.log("[AVPlayer] play() aborted — stale generation", myGeneration, "vs", _streamGeneration);
                    return;
                }
                self.play();
            }, 50);
        },

        /**
         * Play DVB/FTA stream using TV Window API
         * @param {string} url - DVB URL like dvb://ONID.TSID.SID
         */
        playDVBStream: function (url) {
            console.log("[AVPlayer] ========================================");
            console.log("[AVPlayer] 📡 STARTING DVB/FTA PLAYBACK");
            console.log("[AVPlayer] DVB URL:", url);
            console.log("[AVPlayer] ========================================");
            
            isDVBStream = true;
            currentStreamUrl = url;
            
            // Stop any current IPTV playback
            try {
                if (avplay && playerState !== "NONE") {
                    avplay.stop();
                    avplay.close();
                    playerState = "NONE";
                }
            } catch (e) {
                console.log("[AVPlayer] Cleanup before DVB:", e);
            }
            
            // Check if TV Window API is available
            if (!tvWindow) {
                checkTVWindowEnv();
            }
            
            if (tvWindow) {
                try {
                    // Get available video sources
                    var videoSourceList = tvWindow.getAvailableWindows();
                    console.log("[AVPlayer] Available video sources:", videoSourceList);
                    
                    // Show TV window in full screen (MAIN window)
                    // Rectangle: [x, y, width, height] - full screen 1920x1080
                    var rectangle = [0, 0, 1920, 1080];
                    
                    // Show the broadcast TV window
                    tvWindow.show(
                        function() {
                            console.log("[AVPlayer] ✓✓✓ DVB/FTA WINDOW SHOWN FULLSCREEN ✓✓✓");
                            playerState = "PLAYING";
                            
                            // Notify buffering complete
                            if (eventCallbacks.onBufferingComplete) {
                                eventCallbacks.onBufferingComplete();
                            }
                        },
                        function(error) {
                            console.error("[AVPlayer] ✗✗✗ DVB SHOW FAILED ✗✗✗:", error);
                            if (eventCallbacks.onError) {
                                eventCallbacks.onError("FTA channel failed: " + error.message);
                            }
                        },
                        rectangle,
                        "MAIN", // Window type
                        0 // Z-index (behind HTML overlay)
                    );
                    
                    // Parse DVB URL and tune to channel if tvchannel API available
                    if (typeof tizen !== 'undefined' && tizen.tvchannel) {
                        var dvbParams = parseDVBUrl(url);
                        if (dvbParams) {
                            console.log("[AVPlayer] DVB params:", dvbParams);
                            // The tuning would happen via tizen.tvchannel.tune() if needed
                            // For now, tvwindow.show displays the current broadcast
                        }
                    }
                    
                } catch (e) {
                    console.error("[AVPlayer] DVB playback error:", e);
                    if (eventCallbacks.onError) {
                        eventCallbacks.onError("FTA playback error: " + e.message);
                    }
                }
            } else {
                // Fallback: Try using AVPlay with DVB URL (some Samsung TVs support this)
                console.log("[AVPlayer] TV Window not available, trying AVPlay for DVB...");
                try {
                    this.destroy();
                    avplay.open(url);
                    avplay.setDisplayRect(0, 0, 1920, 1080);
                    try {
                        avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                        console.log("[AVPlayer] ✓ Display: FULL_SCREEN (no black bars)");
                    } catch (e) {
                        try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_ZOOM_16_9'); } catch (e2) {
                            try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'); } catch (e3) {}
                        }
                    }
                    avplay.prepareAsync(
                        function() {
                            console.log("[AVPlayer] ✓ DVB via AVPlay prepared");
                            avplay.play();
                            playerState = "PLAYING";
                        },
                        function(err) {
                            console.error("[AVPlayer] DVB via AVPlay failed:", err);
                            if (eventCallbacks.onError) {
                                eventCallbacks.onError("FTA channel not available on this TV");
                            }
                        }
                    );
                } catch (e) {
                    console.error("[AVPlayer] DVB AVPlay fallback failed:", e);
                    if (eventCallbacks.onError) {
                        eventCallbacks.onError("FTA channels not supported on this TV");
                    }
                }
            }
        },

        /**
         * Stop DVB/FTA stream and hide TV window
         */
        stopDVBStream: function () {
            if (!isDVBStream) return;
            
            console.log("[AVPlayer] Stopping DVB/FTA stream...");
            
            if (tvWindow) {
                try {
                    tvWindow.hide(
                        function() {
                            console.log("[AVPlayer] ✓ DVB window hidden");
                        },
                        function(error) {
                            console.warn("[AVPlayer] DVB hide error:", error);
                        }
                    );
                } catch (e) {
                    console.warn("[AVPlayer] Error hiding DVB window:", e);
                }
            }
            
            isDVBStream = false;
            playerState = "NONE";
        },

        /**
         * Check if currently playing DVB/FTA stream
         */
        isDVBPlaying: function () {
            return isDVBStream;
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
        getGeneration: function () { return _streamGeneration; },
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
                        // Capture generation to detect stale callbacks after channel switch
                        var errorGeneration = _streamGeneration;
                        console.error("[AVPlayer] ========================================");
                        console.error("[AVPlayer] ✗✗✗ ERROR EVENT ✗✗✗");
                        console.error("[AVPlayer] Error Type:", eventType);
                        console.error("[AVPlayer] Stream URL:", currentStreamUrl);
                        console.error("[AVPlayer] Player State:", playerState);
                        console.error("[AVPlayer] ========================================");

                        // AUTO-RETRY: Try HTTP if HTTPS failed (SSL certificate issues)
                        if (eventType === "PLAYER_ERROR_CONNECTION_FAILED" &&
                            currentStreamUrl &&
                            currentStreamUrl.startsWith('https://') &&
                            !httpsFailedUrls[currentStreamUrl]) {

                            httpsFailedUrls[currentStreamUrl] = true;
                            var httpUrl = tryHttpFallback(currentStreamUrl);

                            console.log("[AVPlayer] 🔄 HTTPS failed, auto-retrying with HTTP...");
                            console.log("[AVPlayer] HTTP URL:", httpUrl);

                            // Try HTTP version (tracked timer so changeStream can cancel it)
                            _httpFallbackTimer = setTimeout(function() {
                                _httpFallbackTimer = null;
                                // Abort if user already switched channels
                                if (errorGeneration !== _streamGeneration) {
                                    console.log("[AVPlayer] HTTP fallback aborted — stale generation", errorGeneration, "vs", _streamGeneration);
                                    return;
                                }
                                try {
                                    avplay.stop();
                                    avplay.close();
                                } catch(e) {}

                                try {
                                    avplay.open(httpUrl);
                                    currentStreamUrl = httpUrl;
                                    avplay.setDisplayRect(0, 0, 1920, 1080);
                                    try {
                                        avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                                        console.log("[AVPlayer] ✓ HTTP fallback: Display FULL_SCREEN");
                                    } catch (e) {
                                        try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_ZOOM_16_9'); } catch (e2) {
                                            try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'); } catch (e3) {}
                                        }
                                    }
                                    avplay.prepareAsync(
                                        function() {
                                            // Abort if user switched channels during prepare
                                            if (errorGeneration !== _streamGeneration) {
                                                console.log("[AVPlayer] HTTP fallback play aborted — stale generation");
                                                try { avplay.stop(); avplay.close(); } catch(ig) {}
                                                return;
                                            }
                                            console.log("[AVPlayer] ✓ HTTP fallback succeeded!");
                                            avplay.play();
                                            playerState = "PLAYING";
                                        },
                                        function(err) {
                                            // Suppress stale errors
                                            if (errorGeneration !== _streamGeneration) return;
                                            console.error("[AVPlayer] HTTP fallback also failed:", err);
                                            eventCallbacks.onError("Cannot connect to stream server (both HTTPS and HTTP failed)", {
                                                type: eventType,
                                                url: currentStreamUrl
                                            });
                                        }
                                    );
                                } catch(e) {
                                    console.error("[AVPlayer] HTTP fallback exception:", e);
                                }
                            }, 100);
                            return; // Don't show error yet, trying HTTP
                        }

                        // Suppress stale errors from previous channel
                        if (errorGeneration !== _streamGeneration) {
                            console.log("[AVPlayer] Error suppressed — stale generation", errorGeneration, "vs", _streamGeneration);
                            return;
                        }

                        var errorDetails = {
                            type: eventType,
                            timestamp: new Date().toISOString(),
                            url: currentStreamUrl,
                            state: playerState
                        };

                        var userMessage = "Playback error";

                        switch (eventType) {
                            case "PLAYER_ERROR_CONNECTION_FAILED":
                                userMessage = "Cannot connect to stream server.\n\nPossible causes:\n• Stream URL is incorrect or expired\n• Server SSL certificate not trusted by TV\n• Server is blocking TV requests\n• Network connection issue";
                                errorDetails.suggestion = "Try refreshing the channel list or check network";
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
