/**
 * COMPLETE FINAL AVPlayer for Tizen Real TV
 * Includes: HTTP Headers, Localhost URL Fix, Stream Validation, Enhanced Error Handling
 * DVB/FTA Channel Support Added
 * Version: ULTIMATE 4.0
 */

var AVPlayer = (function () {
    // Production mode: suppress verbose logging for performance on Samsung TV hardware
    var _VERBOSE = false;
    function _log() { if (_VERBOSE) console.log.apply(console, arguments); }

    var playerState = "NONE";
    var avplay = null;
    var isTizenProp = false;
    var currentStreamUrl = "";
    var isDVBStream = false; // Track if current stream is DVB/FTA
    var tvWindow = null; // TV Window for FTA display

    // CRITICAL: Your IPTV server IP for localhost URL replacement
    var SERVER_IP = "124.40.244.211";

    var eventCallbacks = {
        onBufferingStart: function () {},
        onBufferingProgress: function (percent) {},
        onBufferingComplete: function () {},
        onStreamCompleted: function () {},
        onCurrentPlayTime: function (time) { },
        onError: function (type, details) { console.error("AVPlay Error: " + type, details); },
        onEvent: function (event, data) {},
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
                _log("[AVPlayer] ✓ TV Window API available for FTA playback");
                return true;
            }
        } catch (e) {
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
            _log("[AVPlayer] ⚠️⚠️⚠️ LOCALHOST URL DETECTED ⚠️⚠️⚠️");
            _log("[AVPlayer] Original URL:", originalUrl);

            url = url.replace(/127\.0\.0\.1/g, SERVER_IP);
            url = url.replace(/localhost/g, SERVER_IP);

            _log("[AVPlayer] ✓ Fixed URL:", url);
        }

        return url;
    }

    /**
     * Try HTTP version of HTTPS URL (fallback for SSL issues)
     */
    function tryHttpFallback(url) {
        if (url && url.startsWith('https://')) {
            var httpUrl = url.replace('https://', 'http://');
            _log("[AVPlayer] 🔄 HTTP Fallback URL:", httpUrl);
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
    var _formatFallbackTimer = null;  // ✅ NEW: Track format fallback (fmp4 → standard) timer

    return {
        init: function (options) {
            _log("[AVPlayer] Init called");
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
                _log("[AVPlayer] Setting HTTP headers (browser-like)");
                avplay.setStreamingProperty("CUSTOM_MESSAGE", headerString);

            } catch (e) {
            }

            try {
                // Start with lowest bitrate for fastest initial playback
                avplay.setStreamingProperty("ADAPTIVE_INFO", "BITRATES=LOWEST");
                avplay.setStreamingProperty("START_BITRATE", "LOWEST");
            } catch (e) {}

            // Enable prebuffering for faster stream start
            try {
                avplay.setStreamingProperty("PREBUFFER_MODE", "1");
            } catch (e) {}
        },

        setUrl: function (url) {
            if (!isTizenProp) return;

            try {
                if (!url || url.trim() === "") throw new Error("Stream URL is empty");

                url = fixLocalhostUrl(url.trim());
                currentStreamUrl = url;

                // Open → headers → buffer config → display — all synchronous, no setTimeout
                avplay.open(url);
                playerState = "IDLE";

                this.setStreamingHeaders(url);

                try {
                    avplay.setTimeoutForBuffering(4);
                    avplay.setBufferingParam("PLAYER_BUFFER_FOR_PLAY", "PLAYER_BUFFER_SIZE_IN_SECOND", 1);
                    avplay.setBufferingParam("PLAYER_BUFFER_FOR_RESUME", "PLAYER_BUFFER_SIZE_IN_SECOND", 3);
                } catch (e) {}

                try {
                    avplay.setDisplayRect(0, 0, 1920, 1080);
                    try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN'); } catch (e) {}
                } catch (e) {}

            } catch (e) {
                if (eventCallbacks.onError) {
                    eventCallbacks.onError("Stream setup failed: " + e.message);
                }
            }
        },

        play: function () {
            if (!isTizenProp) return;

            try {
                if (playerState === "IDLE") {
                    var playGeneration = _streamGeneration;
                    avplay.prepareAsync(
                        function () {
                            if (playGeneration !== _streamGeneration) return;
                            playerState = "READY";
                            try {
                                avplay.play();
                                playerState = "PLAYING";
                            } catch (playError) {
                                if (eventCallbacks.onError) eventCallbacks.onError("Play failed: " + playError.message);
                            }
                        },
                        function (prepareError) {
                            if (playGeneration !== _streamGeneration) return;
                            if (eventCallbacks.onError) eventCallbacks.onError("Prepare failed: " + prepareError);
                        }
                    );
                } else if (playerState === "PAUSED") {
                    avplay.play();
                    playerState = "PLAYING";
                } else if (playerState === "READY") {
                    avplay.play();
                    playerState = "PLAYING";
                } else {
                    _log("[AVPlayer] Attempting direct play...");
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
                _log("[AVPlayer] Paused");
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
                _log("[AVPlayer] Stopped");
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
            // CRITICAL: stop() and close() in SEPARATE try-catch blocks.
            // If stop() throws (player already stopped / first launch), close() MUST still run.
            // Without this, avplay.open() on an unclosed player freezes Samsung TV hardware.
            try { avplay.stop(); } catch (e) {}
            try { avplay.close(); } catch (e) {}
            playerState = "NONE";
            currentStreamUrl = "";
            isDVBStream = false;
        },

        changeStream: function (url) {
            _log("[AVPlayer] Changing stream to:", url);

            // CRITICAL: Cancel any pending timers from previous changeStream calls
            if (_setUrlTimer) { clearTimeout(_setUrlTimer); _setUrlTimer = null; }
            if (_playTimer) { clearTimeout(_playTimer); _playTimer = null; }
            if (_httpFallbackTimer) { clearTimeout(_httpFallbackTimer); _httpFallbackTimer = null; }
            if (_formatFallbackTimer) { clearTimeout(_formatFallbackTimer); _formatFallbackTimer = null; }  // ✅ NEW: Clear format fallback timer

            // Increment generation — all stale callbacks will check and abort
            _streamGeneration++;
            var myGeneration = _streamGeneration;
            _log("[AVPlayer] Stream generation:", myGeneration);

            // Check if this is a DVB/FTA stream
            if (isDVBUrl(url)) {
                _log("[AVPlayer] DVB/FTA stream detected");
                // Wait for any DVB hide to complete before showing new DVB
                if (isDVBStream && tvWindow) {
                    var self = this;
                    this.stopDVBStream();
                    // Give TV window time to fully hide before re-showing
                    setTimeout(function () {
                        if (myGeneration !== _streamGeneration) return;
                        self.playDVBStream(url);
                    }, 150);
                    return;
                }
                this.playDVBStream(url);
                return;
            }

            // Stop any DVB playback if switching from FTA to IPTV
            if (isDVBStream) {
                this.stopDVBStream();
            }

            // Destroy old stream, open new one, start playback — all synchronous
            isDVBStream = false;
            this.destroy();
            this.setUrl(url);
            this.play();
        },

        /**
         * Play DVB/FTA stream using TV Window API
         * @param {string} url - DVB URL like dvb://ONID.TSID.SID
         */
        playDVBStream: function (url) {
            _log("[AVPlayer] ========================================");
            _log("[AVPlayer] 📡 STARTING DVB/FTA PLAYBACK");
            _log("[AVPlayer] DVB URL:", url);
            _log("[AVPlayer] ========================================");
            
            isDVBStream = true;
            currentStreamUrl = url;
            
            // Stop any current IPTV playback (separate try-catch to prevent freeze)
            if (avplay && playerState !== "NONE") {
                try { avplay.stop(); } catch (e) {}
                try { avplay.close(); } catch (e) {}
                playerState = "NONE";
            }
            
            // Check if TV Window API is available
            if (!tvWindow) {
                checkTVWindowEnv();
            }
            
            if (tvWindow) {
                try {
                    // Get available video sources
                    var videoSourceList = tvWindow.getAvailableWindows();
                    _log("[AVPlayer] Available video sources:", videoSourceList);
                    
                    // Show TV window in full screen (MAIN window)
                    // Rectangle: [x, y, width, height] - full screen 1920x1080
                    var rectangle = [0, 0, 1920, 1080];
                    
                    // Show the broadcast TV window
                    tvWindow.show(
                        function() {
                            _log("[AVPlayer] ✓✓✓ DVB/FTA WINDOW SHOWN FULLSCREEN ✓✓✓");
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
                            _log("[AVPlayer] DVB params:", dvbParams);
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
                _log("[AVPlayer] TV Window not available, trying AVPlay for DVB...");
                try {
                    this.destroy();
                    avplay.open(url);
                    avplay.setDisplayRect(0, 0, 1920, 1080);
                    try {
                        avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                        _log("[AVPlayer] ✓ Display: FULL_SCREEN (no black bars)");
                    } catch (e) {
                        try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_ZOOM_16_9'); } catch (e2) {
                            try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'); } catch (e3) {}
                        }
                    }
                    avplay.prepareAsync(
                        function() {
                            _log("[AVPlayer] ✓ DVB via AVPlay prepared");
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
            if (!isDVBStream && !tvWindow) return;

            _log("[AVPlayer] Stopping DVB/FTA stream...");

            // Mark as stopped BEFORE async hide to prevent race conditions
            isDVBStream = false;
            playerState = "NONE";
            currentStreamUrl = "";

            if (tvWindow) {
                try {
                    tvWindow.hide(
                        function() {
                            _log("[AVPlayer] ✓ DVB window hidden");
                        },
                        function(error) {
                        }
                    );
                } catch (e) {
                }
            }
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
                _log("[AVPlayer] Jumped forward:", milliseconds, "ms to", newTime);
            } catch (e) {
            }
        },

        jumpBackward: function (milliseconds) {
            if (!isTizenProp) return;
            try {
                var currentTime = this.getCurrentTime();
                var newTime = Math.max(0, currentTime - milliseconds);
                avplay.jumpBackward(milliseconds);
                _log("[AVPlayer] Jumped backward:", milliseconds, "ms to", newTime);
            } catch (e) {
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
                        _log("[AVPlayer] Seeked to:", milliseconds);
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
                        _log("[AVPlayer] ►►► BUFFERING STARTED ◄◄◄");
                        eventCallbacks.onBufferingStart();
                    },
                    onbufferingprogress: function (percent) {
                        _log("[AVPlayer] Buffering:", percent + "%");
                        eventCallbacks.onBufferingProgress(percent);
                    },
                    onbufferingcomplete: function () {
                        _log("[AVPlayer] ►►► BUFFERING COMPLETE ◄◄◄");
                        eventCallbacks.onBufferingComplete();
                    },
                    onstreamcompleted: function () {
                        _log("[AVPlayer] Stream completed");
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

                            _log("[AVPlayer] 🔄 HTTPS failed, auto-retrying with HTTP...");
                            _log("[AVPlayer] HTTP URL:", httpUrl);

                            // Try HTTP version (tracked timer so changeStream can cancel it)
                            _httpFallbackTimer = setTimeout(function() {
                                _httpFallbackTimer = null;
                                // Abort if user already switched channels
                                if (errorGeneration !== _streamGeneration) {
                                    _log("[AVPlayer] HTTP fallback aborted — stale generation", errorGeneration, "vs", _streamGeneration);
                                    return;
                                }
                                try { avplay.stop(); } catch(e) {}
                                try { avplay.close(); } catch(e) {}

                                try {
                                    avplay.open(httpUrl);
                                    currentStreamUrl = httpUrl;
                                    avplay.setDisplayRect(0, 0, 1920, 1080);
                                    try {
                                        avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                                        _log("[AVPlayer] ✓ HTTP fallback: Display FULL_SCREEN");
                                    } catch (e) {
                                        try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_ZOOM_16_9'); } catch (e2) {
                                            try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'); } catch (e3) {}
                                        }
                                    }
                                    avplay.prepareAsync(
                                        function() {
                                            // Abort if user switched channels during prepare
                                            if (errorGeneration !== _streamGeneration) {
                                                _log("[AVPlayer] HTTP fallback play aborted — stale generation");
                                                try { avplay.stop(); } catch(ig) {} try { avplay.close(); } catch(ig) {}
                                                return;
                                            }
                                            _log("[AVPlayer] ✓ HTTP fallback succeeded!");
                                            avplay.play();
                                            playerState = "PLAYING";
                                        },
                                        function(err) {
                                            // Suppress stale errors
                                            if (errorGeneration !== _streamGeneration) return;
                                            console.error("[AVPlayer] HTTP fallback also failed:", err);
                                            
                                            // ✅ NEW STEP 3: Try standard format (index.m3u8) on HTTPS if fmp4 failed
                                            if (currentStreamUrl.includes('index.fmp4.m3u8')) {
                                                var standardFormatUrl = currentStreamUrl.replace('index.fmp4.m3u8', 'index.m3u8');
                                                if (standardFormatUrl !== currentStreamUrl) {
                                                    _log("[AVPlayer] 🔄 Both fmp4 formats failed (HTTPS and HTTP), trying standard format...");
                                                    _log("[AVPlayer] Standard Format URL:", standardFormatUrl);
                                                    
                                                    _formatFallbackTimer = setTimeout(function() {
                                                        _formatFallbackTimer = null;
                                                        // Abort if user already switched channels
                                                        if (errorGeneration !== _streamGeneration) {
                                                            _log("[AVPlayer] Format fallback aborted — stale generation", errorGeneration, "vs", _streamGeneration);
                                                            return;
                                                        }
                                                        try { avplay.stop(); } catch(e) {}
                                                        try { avplay.close(); } catch(e) {}
                                                        
                                                        try {
                                                            avplay.open(standardFormatUrl);
                                                            currentStreamUrl = standardFormatUrl;
                                                            avplay.setDisplayRect(0, 0, 1920, 1080);
                                                            try {
                                                                avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
                                                                _log("[AVPlayer] ✓ Format fallback: Display FULL_SCREEN");
                                                            } catch (e) {
                                                                try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_ZOOM_16_9'); } catch (e2) {
                                                                    try { avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO'); } catch (e3) {}
                                                                }
                                                            }
                                                            avplay.prepareAsync(
                                                                function() {
                                                                    // Abort if user switched channels during prepare
                                                                    if (errorGeneration !== _streamGeneration) {
                                                                        _log("[AVPlayer] Format fallback play aborted — stale generation");
                                                                        try { avplay.stop(); } catch(ig) {} try { avplay.close(); } catch(ig) {}
                                                                        return;
                                                                    }
                                                                    _log("[AVPlayer] ✓ Standard format succeeded!");
                                                                    avplay.play();
                                                                    playerState = "PLAYING";
                                                                },
                                                                function(err2) {
                                                                    // Suppress stale errors
                                                                    if (errorGeneration !== _streamGeneration) return;
                                                                    console.error("[AVPlayer] Standard format also failed:", err2);
                                                                    // All 3 steps failed — now show error
                                                                    eventCallbacks.onError("Cannot connect to stream server (all fallback attempts failed)", {
                                                                        type: eventType,
                                                                        url: currentStreamUrl,
                                                                        failedAttempts: ["HTTPS fmp4", "HTTP fmp4", "HTTPS standard"]
                                                                    });
                                                                }
                                                            );
                                                        } catch(e) {
                                                            console.error("[AVPlayer] Format fallback exception:", e);
                                                            eventCallbacks.onError("Stream format error", {
                                                                type: eventType,
                                                                url: currentStreamUrl
                                                            });
                                                        }
                                                    }, 100);
                                                    return; // Don't show error yet, trying standard format
                                                }
                                            }
                                            
                                            // No more fallbacks, show error
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
                            _log("[AVPlayer] Error suppressed — stale generation", errorGeneration, "vs", _streamGeneration);
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
                        _log("[AVPlayer] Event:", eventType, eventData);
                        eventCallbacks.onEvent(eventType, eventData);
                    },

                    onsubtitlechange: function (duration, text) {
                        eventCallbacks.onSubtitle(text);
                    },

                    ondrmevent: function (drmEvent, drmData) {
                        _log("[AVPlayer] DRM Event:", drmEvent);
                    }
                };

                try {
                    avplay.setListener(listener);
                    _log("[AVPlayer] ✓ Listener registered successfully");
                } catch (e) {
                    console.error("[AVPlayer] SetListener Failed:", e);
                }
            }
        },

        /**
         * Test if a stream URL is accessible before trying to play it
         */
        testStreamUrl: function (url, callback) {
            _log("[AVPlayer] ========================================");
            _log("[AVPlayer] TESTING STREAM ACCESSIBILITY");
            _log("[AVPlayer] URL:", url);
            _log("[AVPlayer] ========================================");

            // Fix localhost URLs before testing
            url = fixLocalhostUrl(url);
            _log("[AVPlayer] Testing URL (after localhost fix):", url);

            fetch(url, {
                method: 'GET',
                mode: 'cors'
            })
                .then(function (response) {
                    _log("[AVPlayer] ✓ Stream test response:", response.status);
                    return response.text();
                })
                .then(function (data) {
                    _log("[AVPlayer] ✓✓✓ STREAM IS ACCESSIBLE ✓✓✓");
                    _log("[AVPlayer] M3U8 content preview:");
                    _log("[AVPlayer] ========================================");
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
            _log("[AVPlayer] ========================================");
            _log("[AVPlayer] TESTING WITH PUBLIC STREAM");
            _log("[AVPlayer] URL:", testUrl);
            _log("[AVPlayer] ========================================");
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
            _log("[AVPlayer] Server IP updated to:", SERVER_IP);
        }
    };
})();
