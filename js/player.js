/**
 * BBNL Player Controller - Uses AVPlayer Module
 */

// ✅ NEW: Recover failed images from persistent cache on app load
// This ensures images that disappeared after app restart are retried
(function initImageRecovery() {
    if (typeof BBNL_API !== 'undefined' && BBNL_API.retryFailedImages) {
        BBNL_API.retryFailedImages();
    }
})();

// Check authentication — post-HOME relaunch: wait for localStorage (api.js)
(function checkAuth() {
    if (typeof BBNL_gateAuthenticatedPage === 'function') {
        BBNL_gateAuthenticatedPage();
        return;
    }
    try {
        var primaryRaw = localStorage.getItem("bbnl_user");
        var backupRaw = localStorage.getItem("bbnl_user_backup");
        var primaryUser = null;
        var backupUser = null;

        if (primaryRaw) {
            try {
                var parsedPrimary = JSON.parse(primaryRaw);
                if (parsedPrimary && parsedPrimary.userid) primaryUser = parsedPrimary;
            } catch (e1) { }
        }

        if (backupRaw) {
            try {
                var parsedBackup = JSON.parse(backupRaw);
                if (parsedBackup && parsedBackup.userid) backupUser = parsedBackup;
            } catch (e2) { }
        }

        var resolvedUser = primaryUser || backupUser;
        if (!resolvedUser) {
            window.location.replace("index.html");
            return;
        }

        var resolvedJson = JSON.stringify(resolvedUser);
        if (primaryRaw !== resolvedJson) localStorage.setItem("bbnl_user", resolvedJson);
        if (backupRaw !== resolvedJson) localStorage.setItem("bbnl_user_backup", resolvedJson);
        if (localStorage.getItem("hasLoggedInOnce") !== "true") {
            localStorage.setItem("hasLoggedInOnce", "true");
        }
    } catch (e) {
        console.error("[Auth] Corrupted session data - redirecting to login:", e);
        window.location.replace("index.html");
    }
})();

// ==========================================
// CONFIGURATION
// ==========================================
var playerDateTimeInterval = null; // Interval for date/time updates

// Clean up ALL background timers when leaving page (prevents memory leaks on Samsung TV)
window.addEventListener('pagehide', function (event) {
    if (event && event.persisted) {
        // BFCache transition: keep current state; don't tear down player/UI.
        return;
    }
    if (playerDateTimeInterval) { clearInterval(playerDateTimeInterval); playerDateTimeInterval = null; }
    if (playerNetworkWatchInterval) { clearInterval(playerNetworkWatchInterval); playerNetworkWatchInterval = null; }
    if (typeof streamAdTimer !== 'undefined' && streamAdTimer) { clearTimeout(streamAdTimer); }
    if (typeof streamAdRotateTimer !== 'undefined' && streamAdRotateTimer) { clearInterval(streamAdRotateTimer); }
    if (typeof overlayTimeout !== 'undefined' && overlayTimeout) { clearTimeout(overlayTimeout); }
    if (typeof clearPlayerChromeIdleTimer === 'function') clearPlayerChromeIdleTimer();
    if (typeof channelInputTimeout !== 'undefined' && channelInputTimeout) { clearTimeout(channelInputTimeout); channelInputTimeout = null; }
    if (typeof playerChannelSearchTimeout !== 'undefined' && playerChannelSearchTimeout) { clearTimeout(playerChannelSearchTimeout); playerChannelSearchTimeout = null; }
    // Release AVPlayer resources
    try { if (typeof AVPlayer !== 'undefined') AVPlayer.destroy(); } catch (e) { }
});

window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        // Page restored from BFCache (e.g. from Home or Channels)
        // DOM/state are already preserved; avoid forcing player re-setup.
        // Re-register keys
        if (typeof RemoteKeys !== 'undefined') {
            RemoteKeys.registerAllKeys();
        }
    }
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

        // Replace localhost with server IP
        url = url.replace(/127\.0\.0\.1/g, PLAYER_CONFIG.SERVER_IP);
        url = url.replace(/localhost/g, PLAYER_CONFIG.SERVER_IP);

    }

    // Transform old stream servers to new Samsung HTTP/1.1 compatible server
    // livestream.bbnl.in and livestream2.bbnl.in -> livestream3.bbnl.in
    // ✅ FIXED: Rewrite ALL streams including fmp4 (fmp4 streams DO exist on livestream3)
    if (url.includes('livestream.bbnl.in') || url.includes('livestream2.bbnl.in')) {
        wasOldServer = true;

        // Replace old servers with new Samsung-compatible HTTP/1.1 server
        url = url.replace(/livestream2\.bbnl\.in/g, 'livestream3.bbnl.in');
        url = url.replace(/livestream\.bbnl\.in/g, 'livestream3.bbnl.in');

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
var PLAYER_STREAM_START_TIMEOUT_MS = 10000; // 10s — IPTV streams on Samsung TV can take 5-8s to buffer
var playerNetworkWatchInterval = null;
var playerNetworkDisconnectSince = 0;
var PLAYER_NETWORK_WATCH_INTERVAL_MS = 5000;
var PLAYER_NETWORK_POPUP_DELAY_MS = 2500;
var playerLastErrorCategory = '';
var playerAutoResumeInProgress = false;
var _lastPlaybackFailureFingerprint = '';
var _lastPlaybackFailureTs = 0;

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

function hasRecentApiNetworkFailure(maxAgeMs) {
    var root = (typeof window !== 'undefined') ? window : globalThis;
    var failure = root && root.__bbnlLastApiFailure;
    if (!failure || !failure.networkLike) return false;
    var age = Date.now() - Number(failure.ts || 0);
    return age >= 0 && age <= (maxAgeMs || 30000);
}

function isChannelMarkedSubscribed(channel) {
    if (!channel) return false;
    var value = channel.subscribed;
    return value === 'yes' || value === '1' || value === 'true' || value === true || value === 1;
}

function getChannelDebugId(channel) {
    if (!channel) return '';
    return String(channel.channelno || channel.urno || channel.chid || channel.chno || channel.ch_no || channel.id || '').trim();
}

function getChannelDisplayName(channel) {
    if (!channel) return 'Unknown Channel';
    return channel.channel_name || channel.chtitle || 'Unknown Channel';
}

function findLatestKnownChannel(channel) {
    var chId = getChannelDebugId(channel);
    if (!chId) return channel || null;

    var pools = [
        Array.isArray(_allChannelsUnfiltered) ? _allChannelsUnfiltered : [],
        Array.isArray(allChannels) ? allChannels : [],
        (typeof sidebarState !== 'undefined' && sidebarState && Array.isArray(sidebarState.allChannelsCache)) ? sidebarState.allChannelsCache : []
    ];

    for (var i = 0; i < pools.length; i++) {
        var list = pools[i];
        if (!list || list.length === 0) continue;
        var matched = list.find(function (ch) {
            return getChannelDebugId(ch) === chId;
        });
        if (matched) return matched;
    }

    return channel || null;
}

function analyzeStreamUrl(rawUrl) {
    var raw = String(rawUrl || '').trim();
    var isDvb = raw.toLowerCase().indexOf('dvb://') === 0;
    var normalized = raw;

    if (raw && !isDvb) {
        normalized = fixLocalhostUrl(raw);
    }

    var hasUrl = raw.length > 0;
    var isHttp = normalized.toLowerCase().indexOf('http://') === 0 || normalized.toLowerCase().indexOf('https://') === 0;

    return {
        raw: raw,
        normalized: normalized,
        hasUrl: hasUrl,
        isDvb: isDvb,
        isHttp: isHttp
    };
}

function shouldSuppressDuplicatePlaybackFailure(fingerprint) {
    var now = Date.now();
    if (fingerprint && _lastPlaybackFailureFingerprint === fingerprint && (now - _lastPlaybackFailureTs) < 1500) {
        return true;
    }
    _lastPlaybackFailureFingerprint = fingerprint;
    _lastPlaybackFailureTs = now;
    return false;
}

function hidePageLoadingOverlay() {
    var pl = document.getElementById('page-loading');
    if (!pl) return;
    pl.style.display = 'none';
}

function resolveChannelEntitlement(channel) {
    return new Promise(function (resolve) {
        var localChannel = findLatestKnownChannel(channel) || channel || null;
        var localSubscribed = isChannelMarkedSubscribed(localChannel);
        var chId = getChannelDebugId(localChannel || channel);

        var finalized = false;
        function done(result) {
            if (finalized) return;
            finalized = true;
            resolve(result);
        }

        var fallbackTimer = setTimeout(function () {
            done({
                channel: localChannel,
                subscribed: localSubscribed,
                source: 'local-timeout'
            });
        }, 1200);

        if (!chId || typeof ChannelsAPI === 'undefined' || !ChannelsAPI.getChannelData) {
            clearTimeout(fallbackTimer);
            done({
                channel: localChannel,
                subscribed: localSubscribed,
                source: 'local-only'
            });
            return;
        }

        ChannelsAPI.getChannelData().then(function (channels) {
            clearTimeout(fallbackTimer);
            if (!Array.isArray(channels) || channels.length === 0) {
                done({
                    channel: localChannel,
                    subscribed: localSubscribed,
                    source: 'api-empty'
                });
                return;
            }

            var apiChannel = channels.find(function (ch) {
                return getChannelDebugId(ch) === chId;
            }) || localChannel;

            done({
                channel: apiChannel,
                subscribed: isChannelMarkedSubscribed(apiChannel),
                source: 'api'
            });
        }).catch(function () {
            clearTimeout(fallbackTimer);
            done({
                channel: localChannel,
                subscribed: localSubscribed,
                source: 'api-error'
            });
        });
    });
}

function reportPlaybackFailure(reasonCode, options) {
    var opts = options || {};
    var channel = opts.channel || null;
    var chName = getChannelDisplayName(channel);
    var chId = getChannelDebugId(channel);
    var entitlement = opts.entitlement || {};
    var stream = opts.stream || analyzeStreamUrl(channel ? (channel.streamlink || channel.channel_url) : '');
    var detail = opts.detail || '';

    var title = 'Playback Error';
    var message = 'Unable to play this channel. Please try again or switch to another channel.';

    if (reasonCode === 'network') {
        title = 'Playback Error';
        message = 'Network disconnected. Please check your connection and try again.';
    } else if (reasonCode === 'subscription') {
        title = 'Subscription Not Available';
        message = 'Please subscribe to watch this channel.';
    } else if (reasonCode === 'no_stream') {
        title = 'No Stream Available';
        message = 'Stream URL not available for ' + chName + '. Please try another channel.';
    } else if (reasonCode === 'invalid_stream') {
        title = 'Invalid Stream';
        message = 'Invalid stream URL format. Please contact support if this continues.';
    } else if (reasonCode === 'stream_timeout') {
        title = 'Stream Unavailable';
        message = 'Stream did not start in time. Please try again or switch to another channel.';
    } else if (reasonCode === 'drm_or_codec') {
        title = 'Playback Restricted';
        message = 'This stream could not be decoded on this device. Please try another channel.';
    } else if (reasonCode === 'startup_error') {
        title = 'Playback Error';
        message = 'Error starting playback. Please try another channel.';
    }

    console.error('[PlaybackDiag]', {
        reason: reasonCode,
        source: opts.source || 'unknown',
        channelId: chId,
        channelName: chName,
        streamUrlRaw: stream.raw,
        streamUrlNormalized: stream.normalized,
        streamHasUrl: stream.hasUrl,
        streamIsHttp: stream.isHttp,
        streamIsDvb: stream.isDvb,
        subscribedLocal: isChannelMarkedSubscribed(channel),
        entitlementSource: entitlement.source || 'n/a',
        subscribedResolved: typeof entitlement.subscribed === 'boolean' ? entitlement.subscribed : null,
        detail: detail,
        apiFailure: hasRecentApiNetworkFailure(),
        online: !isNetworkDisconnected(),
        ts: new Date().toISOString()
    });

    showPlayerErrorPopup(title, message);
}

function handlePlaybackFailure(options) {
    var opts = options || {};
    var channel = opts.channel || _lastAttemptedChannel || ((currentIndex >= 0 && allChannels[currentIndex]) ? allChannels[currentIndex] : null);
    var stream = analyzeStreamUrl(opts.streamUrl !== undefined ? opts.streamUrl : (channel ? (channel.streamlink || channel.channel_url) : ''));
    var source = opts.source || 'unknown';
    var detail = opts.detail || '';
    var fingerprint = [source, getChannelDebugId(channel), detail].join('|');

    if (shouldSuppressDuplicatePlaybackFailure(fingerprint)) return;

    hideBufferingIndicator();
    hidePageLoadingOverlay();
    hasHiddenLoadingIndicator = true;

    if (isNetworkDisconnected() || hasRecentApiNetworkFailure()) {
        reportPlaybackFailure('network', {
            source: source,
            channel: channel,
            stream: stream,
            detail: detail
        });
        return;
    }

    if (!stream.hasUrl) {
        reportPlaybackFailure('no_stream', {
            source: source,
            channel: channel,
            stream: stream,
            detail: detail
        });
        return;
    }

    if (!stream.isDvb && !stream.isHttp) {
        reportPlaybackFailure('invalid_stream', {
            source: source,
            channel: channel,
            stream: stream,
            detail: detail
        });
        return;
    }

    resolveChannelEntitlement(channel).then(function (entitlement) {
        if (entitlement && entitlement.channel) {
            channel = entitlement.channel;
            stream = analyzeStreamUrl(channel.streamlink || channel.channel_url);
        }

        if (entitlement && entitlement.subscribed === false) {
            reportPlaybackFailure('subscription', {
                source: source,
                channel: channel,
                stream: stream,
                detail: detail,
                entitlement: entitlement
            });
            return;
        }

        var detailLower = String(detail || '').toLowerCase();
        var looksLikeDrmOrCodec = detailLower.indexOf('drm') !== -1 || detailLower.indexOf('codec') !== -1 || detailLower.indexOf('not supported') !== -1 || detailLower.indexOf('format') !== -1;
        var reason = (source === 'stream-timeout') ? 'stream_timeout' : (looksLikeDrmOrCodec ? 'drm_or_codec' : 'startup_error');

        reportPlaybackFailure(reason, {
            source: source,
            channel: channel,
            stream: stream,
            detail: detail,
            entitlement: entitlement
        });
    });
}

function currentChannelNeedsInternet() {
    var ch = (currentIndex >= 0 && allChannels[currentIndex]) ? allChannels[currentIndex] : null;
    if (!ch) return false;
    var raw = String(ch.streamlink || ch.channel_url || '').trim().toLowerCase();
    if (!raw) return false;
    return raw.indexOf('dvb://') !== 0;
}

function startPlayerNetworkWatchdog() {
    if (playerNetworkWatchInterval) clearInterval(playerNetworkWatchInterval);
    playerNetworkDisconnectSince = 0;

    playerNetworkWatchInterval = setInterval(function () {
        if (!currentChannelNeedsInternet()) {
            playerNetworkDisconnectSince = 0;
            playerAutoResumeInProgress = false;
            return;
        }

        var disconnected = isNetworkDisconnected() || hasRecentApiNetworkFailure(20000);
        if (!disconnected) {
            if (playerErrorPopupOpen && playerLastErrorCategory === 'network' && !playerAutoResumeInProgress) {
                playerAutoResumeInProgress = true;
                hidePlayerErrorPopup();
                retryLastAttemptedChannel();
            }
            playerNetworkDisconnectSince = 0;
            return;
        }

        playerAutoResumeInProgress = false;

        if (!playerNetworkDisconnectSince) {
            playerNetworkDisconnectSince = Date.now();
            return;
        }

        if (!playerErrorPopupOpen && (Date.now() - playerNetworkDisconnectSince) >= PLAYER_NETWORK_POPUP_DELAY_MS) {
            hideBufferingIndicator();
            showPlayerErrorPopup('Playback Error', 'Network disconnected. Please check your connection and try again.');
            playerNetworkDisconnectSince = 0;
        }
    }, PLAYER_NETWORK_WATCH_INTERVAL_MS);
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

    // Subscription popup should remain visible until explicit user action.
    if (playerLastErrorCategory === 'subscription') return;

    var sidebar = document.getElementById('playerSidebar');

    playerErrorUiTimeout = setTimeout(function () {
        // Only hide the info bar/overlay if the sidebar is NOT open
        if (sidebar && !sidebarState.isOpen) {
            if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
            if (_overlayEl) {
                _overlayEl.classList.remove('visible');
                _overlayEl.classList.add('hidden');
            }
            if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
            if (_infoBarEl) {
                _infoBarEl.classList.add('info-bar-hidden');
                _infoBarEl.classList.remove('sidebar-active');
            }
        }
        
        if (overlayTimeout) {
            clearTimeout(overlayTimeout);
            overlayTimeout = null;
        }
    }, 10000); // 10 seconds of inactivity during popup
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
        playerLastErrorCategory = 'playback';
        var isSubscriptionPopup = titleLower.indexOf('subscription not available') !== -1 ||
            msgLower.indexOf('please subscribe to watch this channel') !== -1;
        if (isSubscriptionPopup) {
            playerLastErrorCategory = 'subscription';
        } else if (titleLower.indexOf('network') !== -1 || msgLower.indexOf('network') !== -1 || msgLower.indexOf('internet') !== -1 || msgLower.indexOf('offline') !== -1) {
            playerLastErrorCategory = 'network';
        }
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
            } else if ((title && title.toLowerCase().includes('network')) || (message && message.toLowerCase().includes('network'))) {
                key = 'NO_INTERNET_CONNECTION';
            }
            var imgUrl = ErrorImagesAPI.getImageUrl(key);
            if (!imgUrl && key === 'PLAYBACK_ERROR') {
                imgUrl = ErrorImagesAPI.getImageUrl('SIGNAL_UNAVAILABLE') || ErrorImagesAPI.getImageUrl('NO_CHANNELS_AVAILABLE') || ErrorImagesAPI.getImageUrl('NO_INTERNET_CONNECTION');
            }
            if (imgUrl) {
                img.onload = function () {
                    img.style.display = '';
                };
                img.onerror = function () {
                    img.style.display = 'none';
                };
                if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                    BBNL_API.setImageSource(img, imgUrl);
                } else {
                    img.src = imgUrl;
                }
            } else {
                img.style.display = 'none';
            }
        }

        // Hide loading overlays — don't show behind popup
        hideBufferingIndicator();
        hidePageLoadingOverlay();
        hasHiddenLoadingIndicator = true;

        // Keep info bar visible while error popup is shown.
        showInfoBarForced();

        popup.style.display = 'flex';
        playerErrorPopupOpen = true;
        clearPlayerChromeIdleTimer();
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
        playerAutoResumeInProgress = false;
        clearPlayerErrorUiTimer();

        // CRITICAL: Clear any pending overlay timeout so it doesn't hide the info bar after popup closes
        if (overlayTimeout) {
            clearTimeout(overlayTimeout);
            overlayTimeout = null;
        }

        _keepInfoBarVisible = false;
            _keepChromeAfterErrorBack = false;
        if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
        if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
        showInfoBarForced();
        requestAnimationFrame(function () {
            showInfoBarForced();
        });
    }
}

function retryLastAttemptedChannel() {
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
                _allChannelsUnfiltered = allChannels.slice(); // Keep sidebar cache isolated from player-list mutations
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

    // Initialize AVPlayer
    if (typeof AVPlayer !== 'undefined') {
        AVPlayer.init({
            callbacks: {
                onBufferingStart: () => {
                    // Remove page-level loading screen (from player.html)
                    var pl = document.getElementById('page-loading');
                    if (pl) pl.remove();
                    showBufferingIndicator();
                    hasHiddenLoadingIndicator = false;
                },
                onBufferingComplete: () => {
                    hideBufferingIndicator();
                    hasHiddenLoadingIndicator = true;
                    if (window._streamTimeoutTimer) {
                        clearTimeout(window._streamTimeoutTimer);
                        window._streamTimeoutTimer = null;
                    }
                    // Stream is playing — NOW start the info bar auto-hide timer
                    showOverlay();
                    // Load stream ads on successful playback
                    var ch = (currentIndex >= 0 && allChannels[currentIndex]) ? allChannels[currentIndex] : null;
                    if (ch) {
                        var adChid = ch.chid || ch.channelno || ch.urno || "";
                        if (adChid) loadStreamAds(String(adChid));
                    }
                },
                onError: (e) => {
                    console.error("Player Error:", e);
                    // Clear stream timeout to prevent double error popup
                    if (window._streamTimeoutTimer) {
                        clearTimeout(window._streamTimeoutTimer);
                        window._streamTimeoutTimer = null;
                    }
                    handlePlaybackFailure({
                        source: 'avplayer-onerror',
                        channel: _lastAttemptedChannel,
                        detail: (e && (e.message || e.name || e.code || String(e))) || ''
                    });
                },
                onStreamCompleted: () => {
                },
                onCurrentPlayTime: (time) => {
                    // Update timeline with current playback position (in milliseconds)
                    updateTimeline(time);

                    // CRITICAL: Hide loading indicator once playback starts
                    if (!hasHiddenLoadingIndicator && time > 0) {
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

    startPlayerNetworkWatchdog();

    // ✅ Make player container focusable so sidebar focus can be moved to it
    // This is critical for proper focus management when closing sidebar
    var playerContainer = document.getElementById('player-container');
    var playerOverlay = document.getElementById('player-overlay');
    var playerBody = document.querySelector('.player-page');

    if (playerContainer && !playerContainer.getAttribute('tabindex')) {
        playerContainer.setAttribute('tabindex', '-1');
    }
    if (playerOverlay && !playerOverlay.getAttribute('tabindex')) {
        playerOverlay.setAttribute('tabindex', '-1');
    }
    if (playerBody && !playerBody.getAttribute('tabindex')) {
        playerBody.setAttribute('tabindex', '-1');
    }

    // Set device ID and user info immediately — these are available right away
    // (don't wait for setupPlayer's requestAnimationFrame)
    try {
        var devId = document.getElementById('ui-device-id');
        if (devId) devId.innerText = DeviceInfo.getDeviceIdLabel();
    } catch (e) { }
    try {
        var usr = document.getElementById('ui-user');
        if (usr) {
            var ud = AuthAPI.getUserData();
            usr.innerText = (ud && (ud.userid || ud.userId || ud.username)) || 'guest';
        }
    } catch (e) { }

    // Parse URL params
    const urlParams = new URLSearchParams(window.location.search);
    const channelDataStr = urlParams.get('data');
    const channelNameParam = urlParams.get('name');
    const resumeFromPayment = urlParams.get('resume') === 'paynow';
    var launchedWithDirectChannel = false;

    // Preferred fast handoff from channels/home page.
    if (!resumeFromPayment) {
        try {
            var fastChannelData = sessionStorage.getItem('bbnl_player_channel');
            if (fastChannelData) {
                sessionStorage.removeItem('bbnl_player_channel');
                setupPlayer(JSON.parse(fastChannelData));
                launchedWithDirectChannel = true;
            }
        } catch (eFastRead) {
        }
    }

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

        // Clear stale in-memory channel lists before refresh so new subscription state wins.
        try {
            allChannels = [];
            _allChannelsUnfiltered = [];
            if (sidebarState) {
                sidebarState.allChannelsCache = [];
            }
        } catch (e) {}

        // Force immediate subscription refresh after payment return
        // (user may have just subscribed to new channels)
        if (typeof ChannelsAPI !== 'undefined' && ChannelsAPI.forceSubscriptionRefresh) {
            ChannelsAPI.forceSubscriptionRefresh().then(function () {
                // Re-sync player lists/sidebar from latest channel cache after subscription change.
                return loadChannelList(channelNameParam);
            }).then(function () {
                if (sidebarState) {
                    sidebarState.allChannelsCache = (_allChannelsUnfiltered && _allChannelsUnfiltered.length > 0)
                        ? _allChannelsUnfiltered.slice()
                        : [];
                    // Clear cached categories since channel data changed
                    sidebarState.languageCategoriesCache = {};
                    buildCategoriesForLanguage();
                    syncSidebarWithCurrentPlayback(true);
                }
            }).catch(function (e) {
                // Silent fail - subscription refresh is non-critical to playback
            });
        }
    } else if (!launchedWithDirectChannel && channelDataStr) {
        try {
            const channel = JSON.parse(decodeURIComponent(channelDataStr));
            setupPlayer(channel);
            launchedWithDirectChannel = true;
        } catch (e) {
            console.error("Failed to parse channel data", e);
        }
    } else if (channelNameParam) {
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

    // Fetch Channel Context for Zapping (and Lookup), then init sidebar.
    // Start sidebar hydration immediately so menu/category state is ready on first open.
    var hydrateDelayMs = 0;
    setTimeout(function () {
        loadChannelList(channelNameParam).then(function () {
            initializeSidebar();
        });
    }, hydrateDelayMs);

    // Keep player labels in sync if DeviceInfo resolves/changes asynchronously.
    window.addEventListener('bbnl:device-id-updated', function () {
        try {
            var idLabel = DeviceInfo.getDeviceIdLabel();
            var uiDeviceId = document.getElementById('ui-device-id');
            var uiTvId = document.getElementById('ui-tvid');
            var popupDeviceId = document.getElementById('popupDeviceId');
            if (uiDeviceId) uiDeviceId.innerText = idLabel;
            if (uiTvId) uiTvId.innerText = idLabel;
            if (popupDeviceId && playerErrorPopupOpen) popupDeviceId.textContent = idLabel;
        } catch (e) { }
    });

    // Events
    document.addEventListener("keydown", handleKeydown);

    // Channel number input: sync Samsung native keypad input → channelNumberBuffer
    var _chNumField = document.getElementById('channel-number-field');
    if (_chNumField) {
        _chNumField.readOnly = false;
        _chNumField.addEventListener('focus', function () { this.readOnly = false; });
        _chNumField.addEventListener('input', function () {
            var digits = this.value.replace(/\D/g, '').slice(0, 4);
            this.value = digits;
            channelNumberBuffer = digits;
            if (digits.length >= 4) {
                if (channelInputTimeout) { clearTimeout(channelInputTimeout); channelInputTimeout = null; }
                navigateToChannelNumber(digits);
                return;
            }
            resetChannelInputTimer();
        });
        _chNumField.addEventListener('keydown', function (e) {
            var code = e.keyCode;
            // BACK key closes the pad
            if (code === 10009 || code === 27) {
                e.preventDefault();
                e.stopPropagation();
                channelNumberBuffer = '';
                hideChannelNumberInput();
                return;
            }
            // Enter/OK: if digits entered, search immediately; otherwise let Samsung open keypad
            if (code === 13) {
                if (channelNumberBuffer.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    // Clear all timers and search immediately (no grace period for explicit Enter)
                    if (channelInputTimeout) { clearTimeout(channelInputTimeout); channelInputTimeout = null; }
                    if (playerChannelSearchTimeout) { clearTimeout(playerChannelSearchTimeout); playerChannelSearchTimeout = null; }
                    playChannelByLCNFromPlayer(parseInt(channelNumberBuffer, 10));
                    return;
                }
                // No digits yet: allow default → Samsung native keypad opens
                this.readOnly = false;
                return;
            }
        });
    }

    var backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            closePlayer();
            window.__BBNL_NAVIGATING = true;
            window.history.back();
        });
    }

    // Player error popup retry button - retry the SAME current channel or show "Subscription Not Available"
    var playerRetryBtn = document.getElementById('playerRetryBtn');
    if (playerRetryBtn) {
        playerRetryBtn.addEventListener('click', function () {
            if (playerErrorActionMode === 'paynow') {
                // Persist the exact channel context so payment page can return user here.
                try {
                    var channelForReturn = _lastAttemptedChannel || (currentIndex >= 0 && allChannels[currentIndex] ? allChannels[currentIndex] : null);
                    if (channelForReturn) {
                        localStorage.setItem('paymentReturnChannel', JSON.stringify(channelForReturn));
                    } else {
                        localStorage.removeItem('paymentReturnChannel');
                    }
                } catch (e) {
                    console.error('[Player] Failed to persist payment return channel:', e);
                }

                hidePlayerErrorPopup();
                window.__BBNL_NAVIGATING = true;
                window.location.href = 'payment.html?title=Subscription&message=Coming%20soon';
                return;
            }

            hidePlayerErrorPopup();
            retryLastAttemptedChannel();
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
        // Cache-first hydration: when returning to the player, reuse the existing
        // channel list immediately instead of re-fetching and re-rendering it.
        var allResponse = [];

        if (Array.isArray(_allChannelsUnfiltered) && _allChannelsUnfiltered.length > 0) {
            allResponse = _allChannelsUnfiltered.slice();
        } else if (typeof CacheManager !== 'undefined') {
            var cachedAll = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true) || CacheManager.get(CacheManager.KEYS.CHANNEL_LIST);
            if (Array.isArray(cachedAll) && cachedAll.length > 0) {
                allResponse = cachedAll.slice();
                _allChannelsUnfiltered = cachedAll.slice();
                if (sidebarState) {
                    sidebarState.allChannelsCache = cachedAll.slice();
                }
            }
        }

        // Network fallback only when no usable cache exists.
        if (!Array.isArray(allResponse) || allResponse.length === 0) {
            allResponse = await BBNL_API.getChannelList();
        }

        // Fallback hydration: when API returns empty transiently, recover from cached channel list.
        if ((!Array.isArray(allResponse) || allResponse.length === 0) && typeof CacheManager !== 'undefined') {
            var cachedAllFallback = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true) || CacheManager.get(CacheManager.KEYS.CHANNEL_LIST);
            if (Array.isArray(cachedAllFallback) && cachedAllFallback.length > 0) {
                allResponse = cachedAllFallback;
            }
        }

        if (Array.isArray(allResponse) && allResponse.length > 0) {
            var sortedAll = allResponse.slice().sort(function (a, b) {
                var aNo = parseInt(a.channelno || a.urno || a.chno || a.ch_no || 0, 10);
                var bNo = parseInt(b.channelno || b.urno || b.chno || b.ch_no || 0, 10);
                // FoFi (LCN 999) always first
                if (aNo === 999) return -1;
                if (bNo === 999) return 1;
                return aNo - bNo;
            });
            _allChannelsUnfiltered = sortedAll;
            if (sidebarState) {
                sidebarState.allChannelsCache = sortedAll.slice();
            }

            // Apply language filter for CH+/CH- navigation — only cycle through
            // the same channels that were visible on the channels page
            var langId = sessionStorage.getItem('selectedLanguageId') || '';
            var langName = sessionStorage.getItem('selectedLanguageName') || '';

            if (langId === 'subs' || (langName && langName.toLowerCase().indexOf('subscribed') !== -1)) {
                // Subscribed filter
                allChannels = sortedAll.filter(function (ch) {
                    return isChannelSubscribed(ch);
                });
            } else if (langId === 'all' || String(langId).toLowerCase() === 'all channels' ||
                (langName && String(langName).trim().toLowerCase() === 'all channels')) {
                // Explicit "All Channels" — full list for zapping (distinct from empty session = home default)
                allChannels = sortedAll.slice();
            } else if (langId && langId !== '' && langId !== 'all') {
                // Language filter
                var filterLangId = String(langId).trim();
                var filterLangName = String(langName || '').trim().toLowerCase();
                allChannels = sortedAll.filter(function (ch) {
                    var chLangId = String(ch.langid || ch.lang_id || '').trim();
                    if (chLangId && chLangId === filterLangId) return true;
                    if (filterLangName) {
                        var chLang = String(ch.lalng || ch.langtitle || ch.langname || ch.language || ch.lang || '').trim().toLowerCase();
                        if (chLang === filterLangName || chLang === filterLangId.toLowerCase()) return true;
                    }
                    return false;
                });
            } else {
                // No filter in session (e.g. home launch) — default to subscribed channels only
                allChannels = sortedAll.filter(function (ch) {
                    return isChannelSubscribed(ch);
                });
            }
            if (allChannels.length === 0) allChannels = sortedAll;


            // IF lookupName is provided, find it and play
            if (lookupName) {
                const found = allChannels.find(ch => {
                    const cName = (ch.chtitle || ch.channel_name || "").toLowerCase();
                    return cName.includes(lookupName.toLowerCase()); // Fuzzy match
                });

                if (found) {
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
                        if (freshData && freshData.length > 0) {
                            // Update sidebar with ALL channels
                            var freshAllChannels = freshData.slice().sort(function (a, b) {
                                var aNo = parseInt(a.channelno || a.urno || a.chno || a.ch_no || 0, 10);
                                var bNo = parseInt(b.channelno || b.urno || b.chno || b.ch_no || 0, 10);
                                return aNo - bNo;
                            });
                            _allChannelsUnfiltered = freshAllChannels;
                            if (sidebarState) {
                                sidebarState.allChannelsCache = freshAllChannels.slice();
                            }

                            // CRITICAL: Re-apply current filter to the fresh data
                            var currentLangId = sessionStorage.getItem('selectedLanguageId') || '';
                            var currentLangName = sessionStorage.getItem('selectedLanguageName') || '';
                            var refreshedChannels = [];
                            var sortedFresh = freshData.slice().sort(function (a, b) {
                                var aNo = parseInt(a.channelno || a.urno || a.chno || a.ch_no || 0, 10);
                                var bNo = parseInt(b.channelno || b.urno || b.chno || b.ch_no || 0, 10);
                                if (aNo === 999) return -1;
                                if (bNo === 999) return 1;
                                return aNo - bNo;
                            });

                            if (currentLangId === 'subs' || (currentLangName && currentLangName.toLowerCase().indexOf('subscribed') !== -1)) {
                                refreshedChannels = sortedFresh.filter(function (ch) {
                                    return isChannelSubscribed(ch);
                                });
                            } else if (currentLangId === 'all' || String(currentLangId).toLowerCase() === 'all channels' ||
                                (currentLangName && String(currentLangName).trim().toLowerCase() === 'all channels')) {
                                refreshedChannels = sortedFresh.slice();
                            } else if (currentLangId && currentLangId !== '' && currentLangId !== 'all') {
                                var fLangId = String(currentLangId).trim();
                                var fLangName = String(currentLangName || '').trim().toLowerCase();
                                refreshedChannels = sortedFresh.filter(function (ch) {
                                    var chLangId = String(ch.langid || ch.lang_id || '').trim();
                                    if (chLangId && chLangId === fLangId) return true;
                                    if (fLangName) {
                                        var chL = String(ch.lalng || ch.langtitle || ch.langname || ch.language || ch.lang || '').trim().toLowerCase();
                                        if (chL === fLangName || chL === fLangId.toLowerCase()) return true;
                                    }
                                    return false;
                                });
                            } else {
                                refreshedChannels = sortedFresh.filter(function (ch) {
                                    return isChannelSubscribed(ch);
                                });
                            }
                            if (refreshedChannels.length === 0) refreshedChannels = sortedFresh;

                            // Update active zapping list
                            allChannels = refreshedChannels;

                            // Update current channel reference from the new list (ensures freshest subscription status)
                            if (currentIndex >= 0 && allChannels[currentIndex]) {
                                updateExpiryDisplay(allChannels[currentIndex]);
                            }
                        }
                    } catch (e) {
                    }
                }, 3000);
            }
        }
    } catch (e) {
        // ✅ FIX: Silently ignore AbortErrors (request was canceled)
        if (!e || e.name !== 'AbortError') {
            console.error("Failed to load channel list in player", e);
        }

        // Last-resort fallback for first-open sidebar reliability.
        try {
            if ((!Array.isArray(_allChannelsUnfiltered) || _allChannelsUnfiltered.length === 0) && typeof CacheManager !== 'undefined') {
                var cachedFallback = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true) || CacheManager.get(CacheManager.KEYS.CHANNEL_LIST);
                if (Array.isArray(cachedFallback) && cachedFallback.length > 0) {
                    _allChannelsUnfiltered = cachedFallback.slice().sort(function (a, b) {
                        var aNo = parseInt(a.channelno || a.urno || a.chno || a.ch_no || 0, 10);
                        var bNo = parseInt(b.channelno || b.urno || b.chno || b.ch_no || 0, 10);
                        if (aNo === 999) return -1;
                        if (bNo === 999) return 1;
                        return aNo - bNo;
                    });
                    allChannels = _allChannelsUnfiltered.slice();
                    if (sidebarState) {
                        sidebarState.allChannelsCache = _allChannelsUnfiltered.slice();
                    }
                }
            }
        } catch (ignore) { }
    }
}

function getChannelLogoUrl(channel) {
    if (!channel) return "";
    // Mirror Channels page field order so Player resolves logos exactly the same way.
    var candidates = [
        channel.chlogo,
        channel.chnllogo,
        channel.logo_url,
        channel.channel_logo,
        channel.channellogo,
        channel.logo,
        channel.logo_path,
        channel.default_logo,
        channel.defaultimage,
        channel.image,
        channel.img
    ];

    for (var i = 0; i < candidates.length; i++) {
        var value = candidates[i];
        if (value === null || value === undefined) continue;
        var str = String(value).trim();
        if (str) return str;
    }

    return "";
}

function getChannelInitials(channel) {
    var name = '';
    if (channel) name = String(channel.chtitle || channel.channel_name || '').trim();
    if (!name) return '?';

    var parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function ensureSidebarLogoPlaceholder(logoDiv, channel) {
    if (!logoDiv) return;
    var existing = logoDiv.querySelector('.logo-placeholder');
    if (existing) return;

    var placeholder = document.createElement('div');
    placeholder.className = 'logo-placeholder';
    placeholder.textContent = getChannelInitials(channel);
    logoDiv.appendChild(placeholder);
}

var _logoBoxEl = null;
function setInfoBarLogoPlaceholder(channel) {
    if (!_logoBoxEl) _logoBoxEl = document.querySelector('.info-bar-premium .channel-logo-box');
    if (!_logoBoxEl) return;

    var existing = _logoBoxEl.querySelector('.channel-logo-fallback');
    if (!existing) {
        existing = document.createElement('div');
        existing.className = 'channel-logo-fallback';
        _logoBoxEl.appendChild(existing);
    }
    existing.textContent = getChannelInitials(channel);
    existing.style.display = 'flex';
}

function clearInfoBarLogoPlaceholder() {
    if (!_logoBoxEl) _logoBoxEl = document.querySelector('.info-bar-premium .channel-logo-box');
    if (!_logoBoxEl) return;
    var existing = _logoBoxEl.querySelector('.channel-logo-fallback');
    if (existing) existing.style.display = 'none';
}

function normalizeLogoCacheUrl(url) {
    var raw = String(url || '').trim();
    if (!raw) return '';

    // Delegate precisely to the unified core API cache validator
    // This ensures URLs are strictly identical to the main channels page
    if (typeof BBNL_API !== 'undefined' && BBNL_API.getValidatedImageUrl) {
        return BBNL_API.getValidatedImageUrl(raw);
    }

    if (typeof BBNL_API !== 'undefined' && BBNL_API.resolveAssetUrl) {
        raw = BBNL_API.resolveAssetUrl(raw);
    }

    var apiBase = (typeof BBNL_API !== 'undefined' && BBNL_API.BASE_URL)
        ? String(BBNL_API.BASE_URL).trim()
        : '';
    var appOrigin = (window.location && window.location.origin && window.location.origin !== 'null')
        ? window.location.origin
        : '';
    var preferredOrigin = '';
    try {
        if (apiBase) preferredOrigin = new URL(apiBase, window.location.href).origin;
    } catch (e) { }
    if (!preferredOrigin) preferredOrigin = appOrigin;

    if (preferredOrigin) {
        raw = raw.replace(/^https?:\/\/(localhost|127\.0\.0\.1|124\.40\.244\.211|0\.0\.0\.0)(:\d+)?/i, preferredOrigin);
    }

    if (raw.indexOf('//') === 0) {
        raw = (window.location.protocol || 'https:') + raw;
    } else if (!/^https?:\/\//i.test(raw)) {
        try {
            if (raw.charAt(0) === '/' && preferredOrigin) {
                raw = preferredOrigin + raw;
            } else if (apiBase) {
                raw = new URL(raw, apiBase + '/').href;
            }
        } catch (e2) { }
    }

    return raw;
}

var _playerImageFailureCount = 0;  // Track consecutive image failures in player
var _playerImageFailureTimer = null;

/**
 * Handle image loading failures in player
 * If multiple images fail, trigger channel list refresh to get fresh URLs
 */
function _recordPlayerImageFailure(logoUrl) {
    _playerImageFailureCount++;

    // If multiple images fail in succession, refresh channel list (may have stale URLs)
    if (_playerImageFailureCount >= 3) {
        console.warn('[Player] Multiple image failures detected (' + _playerImageFailureCount + '), refreshing channel list...');
        _playerImageFailureCount = 0;

        // Refresh channel data to get fresh image URLs
        if (typeof BBNL_API !== 'undefined' && BBNL_API.getChannelData) {
            BBNL_API.getChannelData()
                .then(function (channelData) {
                    if (channelData && channelData.channels) {
                        // Reload sidebar and UI with fresh data
                        setupPlayer(channelData);
                        console.log('[Player] Channel list refreshed with fresh data');
                    }
                })
                .catch(function (err) {
                    console.error('[Player] Failed to refresh channel data:', err);
                });
        }
    }

    // Reset failure count after 5 seconds of no failures
    clearTimeout(_playerImageFailureTimer);
    _playerImageFailureTimer = setTimeout(function () {
        _playerImageFailureCount = 0;
    }, 5000);
}

function updatePlayerChannelLogo(channel) {
    // Get the logo container box
    if (!_logoBoxEl) _logoBoxEl = document.querySelector('.info-bar-premium .channel-logo-box');
    if (!_logoBoxEl) return;

    var logoUrl = normalizeLogoCacheUrl(getChannelLogoUrl(channel));

    // Remove old img and placeholder completely — prevents stale logo from previous channel
    var oldImg = _logoBoxEl.querySelector('#ui-channel-logo');
    if (oldImg) oldImg.remove();
    var oldFb = _logoBoxEl.querySelector('.channel-logo-fallback');
    if (oldFb) oldFb.remove();

    // Show placeholder instantly while image is loading.
    setInfoBarLogoPlaceholder(channel);

    if (!logoUrl) return;

    // Create NEW img element each time — same approach as sidebar (which works correctly)
    var newImg = document.createElement('img');
    newImg.id = 'ui-channel-logo';
    newImg.alt = channel.chtitle || channel.channel_name || '';
    newImg.crossOrigin = 'anonymous';
    newImg.addEventListener('error', function () {
        this.style.display = 'none';
        setInfoBarLogoPlaceholder(channel);
        // Track failure for potential channel list refresh
        _recordPlayerImageFailure(logoUrl);
    }, { once: true });
    newImg.addEventListener('load', function () {
        _logoCache[logoUrl] = true;
        _logoSourceCache[logoUrl] = this.src || logoUrl;
        clearInfoBarLogoPlaceholder();
        _playerImageFailureCount = 0;  // Reset on success
        if (typeof BBNL_API !== 'undefined' && BBNL_API.markImageCached) {
            BBNL_API.markImageCached(logoUrl);
        }
    }, { once: true });
    _logoBoxEl.appendChild(newImg);

    // Fast path for known cached logos.
    var globallyCached = (typeof BBNL_API !== 'undefined' && BBNL_API.isImageCached && BBNL_API.isImageCached(logoUrl));
    if (_logoCache[logoUrl] || globallyCached) {
        if (!_logoCache[logoUrl]) _logoCache[logoUrl] = true;
        newImg.src = _logoSourceCache[logoUrl] || logoUrl;
    } else if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
        // ✅ Player logo changes frequently on channel change — skip blob cache to avoid revoked URLs
        // Use browser HTTP cache instead (faster, more reliable)
        BBNL_API.setImageSource(newImg, logoUrl, { priority: true, skipBlobCache: true });
    } else {
        newImg.src = logoUrl;
    }
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
    } else {
        uiExpiry.innerText = "N/A";
        uiExpiry.classList.add('expiry-free');
    }
}

function setupPlayer(channel) {
    // Fallback to last attempted channel if none provided (e.g. BFCache restore)
    if (!channel) channel = _lastAttemptedChannel;
    if (!channel) return;

    try {
        var enrichSrc = (_allChannelsUnfiltered && _allChannelsUnfiltered.length > 0)
            ? _allChannelsUnfiltered
            : (sidebarState && sidebarState.allChannelsCache && sidebarState.allChannelsCache.length > 0)
                ? sidebarState.allChannelsCache
                : null;
        if (enrichSrc) {
            var eid = String(channel.channelno || channel.urno || channel.chid || '').trim();
            if (eid) {
                var found = enrichSrc.find(function (c) {
                    return String(c.channelno || c.urno || c.chid || '').trim() === eid;
                });
                if (found && typeof found.subscribed !== 'undefined') {
                    // Keep current object/flow intact; refresh only entitlement flag from latest local snapshot.
                    channel.subscribed = found.subscribed;
                }
            }
        }
    } catch (enrichErr) { }

    _playerStreamGen++;
    var myGen = _playerStreamGen;

    clearPlayerChromeIdleTimer();

    // Show loading feedback immediately while channel setup starts.
    showBufferingIndicator();
    hidePageLoadingOverlay();

    // Normal playback: allow info bar auto-hide after idle timeout.
    _keepInfoBarVisible = false;

    // Avoid hard stop on Tizen before changeStream to keep channel zapping fast.
    var isTizenPlayback = false;
    try {
        isTizenPlayback = (typeof AVPlayer !== 'undefined' && AVPlayer.isTizen && AVPlayer.isTizen());
    } catch (e) { }
    if (!isTizenPlayback) {
        try { if (typeof AVPlayer !== 'undefined') AVPlayer.stop(); } catch (e2) { }
    }

    if (window._streamTimeoutTimer) {
        clearTimeout(window._streamTimeoutTimer);
        window._streamTimeoutTimer = null;
    }

    hasHiddenLoadingIndicator = false;
    _lastAttemptedChannel = channel;
    _keepChromeAfterErrorBack = false;

    var chName = channel.channel_name || channel.chtitle || "Unknown Channel";
    var channelNum = channel.channelno || channel.urno || channel.chno || channel.ch_no || channel.id || "000";

    // Cached UI elements — no getElementById on every channel switch
    if (!_uiChName) _uiChName = document.getElementById("ui-channel-name");
    if (!_uiChNum) _uiChNum = document.getElementById("ui-channel-number");
    if (_uiChName) _uiChName.innerText = chName;
    if (_uiChNum) _uiChNum.innerText = channelNum;

    // Draw logo immediately so sidebar/info bar feel responsive during stream setup.
    updatePlayerChannelLogo(channel);

    // Update info bar SYNCHRONOUSLY on first load so channel metadata is visible immediately
    // This ensures the info bar is not empty when the player page loads.
    updateExpiryDisplay(channel);
    
    // Show overlay immediately so info bar is visible from the start
    showOverlay();

    // ==========================================
    // DEFERRED UI UPDATES — run early to ensure UI updates even if stream is blocked
    // Uses requestAnimationFrame so these don't delay playback
    // ==========================================
    var capturedChannel = channel;
    var capturedChName = chName;
    requestAnimationFrame(function () {
        // Remaining UI updates deferred to keep playback setup smooth.
        // Note: updateExpiryDisplay and showOverlay already called above synchronously
        var uiTitle = document.getElementById("ui-program-title");
        if (uiTitle) uiTitle.innerText = "Live Stream: " + capturedChName;
        var uiProgramTime = document.getElementById("ui-program-time");
        if (uiProgramTime) uiProgramTime.innerHTML = '<span style="color: #ef4444;">●</span> LIVE';
        var uiNext = document.getElementById("ui-next");
        if (uiNext) uiNext.innerText = "--";

        // Footer status bar
        var isSubscribed = capturedChannel.subscribed === "yes" || capturedChannel.subscribed === "1" ||
            capturedChannel.subscribed === true || capturedChannel.subscribed === 1;
        var price = capturedChannel.chprice || capturedChannel.chPrice || capturedChannel.price || "0.00";

        var uiEpg = document.getElementById("ui-epg");
        if (uiEpg) uiEpg.innerText = capturedChannel.chid || capturedChannel.provider || capturedChName.substring(0, 10).toUpperCase();

        var uiStatus = document.getElementById("ui-status");
        if (uiStatus) {
            if (isSubscribed) {
                uiStatus.innerText = parseFloat(price) > 0 ? "Pay($" + price + "/mo)" : "Subscribed (Free)";
                uiStatus.style.color = "#10b981";
            } else {
                uiStatus.innerText = "Not Subscribed";
                uiStatus.style.color = "#ef4444";
            }
        }

        var uiPrice = document.getElementById("ui-price");
        if (uiPrice) {
            uiPrice.classList.remove('price-paid');
            var priceVal = parseFloat(price) || 0;
            uiPrice.innerText = priceVal > 0 ? "₹" + priceVal.toFixed(2) : "₹0.00";
            if (priceVal > 0) uiPrice.classList.add('price-paid');
        }

        var uiDeviceId = document.getElementById("ui-device-id");
        if (uiDeviceId) {
            try { uiDeviceId.innerText = DeviceInfo.getDeviceIdLabel(); } catch (e) { uiDeviceId.innerText = "Not available"; }
        }

        var uiUser = document.getElementById("ui-user");
        if (uiUser) {
            var userData = AuthAPI.getUserData();
            uiUser.innerText = (userData && (userData.userid || userData.userId || userData.username)) || "guest";
        }

        var uiUserInfo = document.getElementById("ui-user-info");
        if (uiUserInfo) {
            var userData2 = AuthAPI.getUserData();
            if (userData2) {
                uiUserInfo.innerText = "User: " + (userData2.mobile || userData2.userid || userData2.userId || "User");
            } else {
                uiUserInfo.innerText = "User: Guest";
            }
        }

        var uiTvId = document.getElementById("ui-tvid");
        if (uiTvId) {
            try { uiTvId.innerText = DeviceInfo.getDeviceIdLabel(); } catch (e) { uiTvId.innerText = "Not available"; }
        }

        updateDateTime();
        if (!playerDateTimeInterval) {
            playerDateTimeInterval = setInterval(updateDateTime, 5000);
        }

        // Update channel index
        if (allChannels.length > 0) {
            var chId = capturedChannel.channelno || capturedChannel.urno || capturedChannel.chid || "";
            if (chId) {
                var foundIdx = allChannels.findIndex(function (ch) {
                    return (ch.channelno || ch.urno || ch.chid || "") === chId;
                });
                if (foundIdx >= 0) currentIndex = foundIdx;
            } else {
                var nameIdx = allChannels.findIndex(function (ch) {
                    return (ch.channel_name || ch.chtitle || "") === capturedChName;
                });
                if (nameIdx >= 0) currentIndex = nameIdx;
            }
        }
    });

    // ==========================================
    // VALIDATION & STREAM START
    // ==========================================

    const streamUrl = channel.streamlink || channel.channel_url;
    const isDVBChannel = streamUrl && streamUrl.toLowerCase().startsWith('dvb://');

    // Check stream URL exists
    if (!streamUrl) {
        try { if (typeof AVPlayer !== 'undefined') AVPlayer.stop(); } catch (e) { }
        handlePlaybackFailure({
            source: 'setup-precheck',
            channel: channel,
            streamUrl: streamUrl,
            detail: 'missing stream URL'
        });
        return;
    }

    // Fix and validate stream URL
    var fixedStreamUrl = streamUrl;
    if (!isDVBChannel) {
        fixedStreamUrl = fixLocalhostUrl(streamUrl);

        if (!fixedStreamUrl.startsWith('http://') && !fixedStreamUrl.startsWith('https://')) {
            try { if (typeof AVPlayer !== 'undefined') AVPlayer.stop(); } catch (e) { }
            handlePlaybackFailure({
                source: 'setup-precheck',
                channel: channel,
                streamUrl: fixedStreamUrl,
                detail: 'invalid stream URL format'
            });
            return;
        }
    }

    // PRE-PLAY subscription check — use freshest local snapshot to avoid missing popup outside channels redirect flow.
    var latestKnownChannel = findLatestKnownChannel(channel) || channel;
    var latestSubscribed = latestKnownChannel ? latestKnownChannel.subscribed : channel.subscribed;
    if (latestSubscribed === "no" || latestSubscribed === "No" || latestSubscribed === "NO" ||
        latestSubscribed === false || latestSubscribed === 0 || latestSubscribed === "0") {
        try { if (typeof AVPlayer !== 'undefined') AVPlayer.stop(); } catch (e) { }
        reportPlaybackFailure('subscription', {
            source: 'setup-precheck-local',
            channel: latestKnownChannel || channel,
            stream: analyzeStreamUrl(fixedStreamUrl),
            detail: 'channel flagged unsubscribed before playback (local)'
        });
        return;
    }

    // Safety-net verification: ensure subscription popup is enforced even when entering
    // Player from non-Channels flows that may carry stale entitlement data.
    (function verifyEntitlementAcrossFlows(currentChannel, streamUrlForCheck, generation) {
        resolveChannelEntitlement(currentChannel).then(function (entitlement) {
            if (generation !== _playerStreamGen) return;
            if (!entitlement || entitlement.subscribed !== false) return;

            try { if (typeof AVPlayer !== 'undefined') AVPlayer.stop(); } catch (eStop) { }
            reportPlaybackFailure('subscription', {
                source: 'setup-postcheck-entitlement',
                channel: entitlement.channel || currentChannel,
                stream: analyzeStreamUrl(streamUrlForCheck),
                detail: 'channel flagged unsubscribed after entitlement verification'
            });
        }).catch(function () {
            // Keep existing playback flow if entitlement verification fails unexpectedly.
        });
    })(latestKnownChannel || channel, fixedStreamUrl, myGen);

    _lastPlayingChannel = channel;

    // ==========================================
    // START PLAYBACK IMMEDIATELY — UI updates happen after
    // ==========================================

    if (typeof AVPlayer !== 'undefined' && AVPlayer.isTizen()) {
        // Buffering indicator already shown at top of setupPlayer

        if (window._streamTimeoutTimer) clearTimeout(window._streamTimeoutTimer);
        window._streamTimeoutTimer = setTimeout(function () {
            if (myGen !== _playerStreamGen) return;
            if (!hasHiddenLoadingIndicator) {
                handlePlaybackFailure({
                    source: 'stream-timeout',
                    channel: _lastAttemptedChannel,
                    streamUrl: fixedStreamUrl,
                    detail: 'stream did not reach onCurrentPlayTime before timeout'
                });
            }
        }, PLAYER_STREAM_START_TIMEOUT_MS);

        try {
            AVPlayer.changeStream(fixedStreamUrl);
        } catch (error) {
            console.error("Error calling AVPlayer.changeStream:", error);
            if (window._streamTimeoutTimer) clearTimeout(window._streamTimeoutTimer);
            handlePlaybackFailure({
                source: 'change-stream-exception',
                channel: channel,
                streamUrl: fixedStreamUrl,
                detail: (error && (error.message || error.name || String(error))) || 'changeStream failed'
            });
        }
    } else {
        if (isDVBChannel) {
            showPlayerErrorPopup('FTA Not Available', 'FTA channels require Samsung TV with antenna connection.');
            return;
        }
        const v = document.getElementById("video-player");
        if (v) {
            v.src = fixedStreamUrl;
            v.play().then(function () {
                var plh = document.getElementById('page-loading');
                if (plh) plh.style.display = 'none';
            }).catch(function (error) {
                console.error("HTML5 video play error:", error);
                handlePlaybackFailure({
                    source: 'html5-play-error',
                    channel: channel,
                    streamUrl: fixedStreamUrl,
                    detail: (error && (error.message || error.name || String(error))) || 'html5 play failed'
                });
            });
        }
    }

    // UI Updates have been moved to the top of setupPlayer() so they fire before early returns

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
        streamAdCurrentIndex = 0;
        showStreamAd();
        return;
    }

    // Clear any existing timers
    clearStreamAdTimers();

    _streamAdLastChid = chid || "";

    AdsAPI.getStreamAds(chid)
        .then(function (ads) {
            if (ads && ads.length > 0) {
                streamAdAds = ads;
                streamAdCurrentIndex = 0;
                showStreamAd();
            } else {
                streamAdAds = [];
                hideStreamAd();
            }
        })
        .catch(function (err) {
            // ✅ FIX: Silently handle errors (especially AbortError)
            // Don't reset state, just hide ads if they can't load
            if (err && err.name !== 'AbortError') {
                console.error("[StreamAd] Failed to load:", err);
            }
            // Silently hide ads on any error (no UI reset)
            streamAdAds = [];
            hideStreamAd();
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
        hideStreamAd();
        return;
    }

    if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
        BBNL_API.setImageSource(img, adUrl, { priority: true });
    } else {
        img.src = adUrl;
    }
    img.onerror = function () {
        hideStreamAd();
    };

    panel.style.display = 'flex';
    panel.style.animation = 'streamAdSlideIn 0.5s ease-out';

    // Auto-rotate if multiple ads (every 8 seconds)
    if (streamAdAds.length > 1) {
        streamAdRotateTimer = setInterval(function () {
            streamAdCurrentIndex = (streamAdCurrentIndex + 1) % streamAdAds.length;
            var nextAd = streamAdAds[streamAdCurrentIndex];
            var nextUrl = nextAd.adpath || nextAd.adimage || nextAd.image || '';
            if (nextUrl && img) {
                if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                    BBNL_API.setImageSource(img, nextUrl, { priority: true });
                } else {
                    img.src = nextUrl;
                }
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
    setupPlayer(nextCh);

    // Keep menu state in sync with remote zapping
    syncSidebarWithCurrentPlayback(true);
    requestAnimationFrame(function () {
        syncSidebarWithCurrentPlayback(false);
    });
    // Info bar already shown by setupPlayer — no duplicate call needed
}

function syncSidebarWithCurrentPlayback(ensureCache) {
    if (!sidebarState) return;
    // Skip all work if sidebar is closed — no need to sync invisible UI
    if (!sidebarState.isOpen && !ensureCache) return;

    if (ensureCache) {
        ensureSidebarAllChannelsCache();
    }

    if (!Array.isArray(sidebarState.languages) || sidebarState.languages.length === 0) return;

    if (sidebarState.isOpen) {
        alignSidebarToCurrentPlayback();
        if (getSortedExpandedCategoryIndices().length > 0 && sidebarState.channels.length > 0) {
            sidebarState.currentLevel = 'channels';
            sidebarState.channelIndex = Math.max(0, Math.min(sidebarState.channelIndex, sidebarState.channels.length - 1));
            var cIxSync = Math.max(0, Math.min(sidebarState.categoryIndex, sidebarState.categories.length - 1));
            focusChannelItem(sidebarState.channelIndex, cIxSync);
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
var _logoSourceCache = {}; // URL -> resolved image src used for fast rebind

function prefetchSidebarChannelLogos(channels, maxCount) {
    if (!Array.isArray(channels) || channels.length === 0) return;
    var limit = Math.min(maxCount || channels.length, channels.length);

    for (var i = 0; i < limit; i++) {
        var ch = channels[i] || {};
        var logoUrl = normalizeLogoCacheUrl(getChannelLogoUrl(ch));
        if (!logoUrl) continue;
        if (_logoCache[logoUrl]) continue;
        if (typeof BBNL_API !== 'undefined' && BBNL_API.isImageCached && BBNL_API.isImageCached(logoUrl)) {
            _logoCache[logoUrl] = true;
            _logoSourceCache[logoUrl] = logoUrl;
            continue;
        }

        var pre = new Image();
        (function (cacheKey) {
            pre.onload = function () {
                _logoCache[cacheKey] = true;
                _logoSourceCache[cacheKey] = this.src || cacheKey;
            };
        })(logoUrl);
        pre.onerror = function () {
            // Ignore preload failures; no local placeholder should be injected.
        };
        if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
            BBNL_API.setImageSource(pre, logoUrl);
        } else {
            pre.src = logoUrl;
        }
    }
}

// All sidebar images now load immediately (no lazy loading)

// ==========================================
// PLAYER SIDEBAR - 2-LEVEL DYNAMIC DESIGN
// ==========================================

// Auto-hide: menu + info chrome after ~8.5s idle (user requested 8–9s)
const OVERLAY_HIDE_DELAY = 8500;
const PLAYER_CHROME_IDLE_MS = 8500;
const INFO_BAR_PERSISTENT = false; // Auto-hide info bar during normal playback (8-9s)

// Timers
var overlayTimeout = null;
var sidebarInactivityTimer = null;
var playerChromeIdleTimer = null;

// Sidebar state - 2-Level Navigation (Language → Categories → Channels)
var sidebarState = {
    isOpen: false,
    currentLevel: 'categories', // 'language', 'categories', or 'channels'
    languageIndex: 0,
    categoryIndex: 0,
    channelIndex: 0,
    channelSortOrder: 'asc', // 'asc' (low->high channel number) or 'desc' (high->low)
    expandedCategories: {}, // { "0": true, "2": true } — multiple category rows can stay open
    languages: [
        { name: 'All Channels', code: 'all' },
        { name: 'Subscribed Channels', code: 'subscribed' }
        // More languages loaded dynamically from API
    ],
    categories: [],
    channels: [],
    allChannelsCache: [], // Cache all channels for filtering
    allChannelsCacheVersion: 0,
    apiCategories: [],
    languageUiState: {},
    categoryChannelIndexMap: {}
};

// ◄► language row is browse-only until user OK-plays a channel from the sidebar.
// CH+/- and sessionStorage follow the last "committed" context, not the preview tab.
var _sidebarLanguageIndexAtOpen = 0;
var _committedNavigationFromSidebarOpen = false;

var _sidebarChannelsHydrationPromise = null;
var _sidebarFilteredChannelsCache = {};
var _sidebarBuiltCategoriesCache = {};

function invalidateSidebarDerivedCaches() {
    _sidebarFilteredChannelsCache = {};
    _sidebarBuiltCategoriesCache = {};
}

function _sidebarExpandKey(catIdx) {
    return String(catIdx);
}

function isSidebarCategoryExpanded(catIdx) {
    return !!(sidebarState.expandedCategories && sidebarState.expandedCategories[_sidebarExpandKey(catIdx)]);
}

function setSidebarCategoryExpanded(catIdx, on) {
    if (!sidebarState.expandedCategories) sidebarState.expandedCategories = {};
    var k = _sidebarExpandKey(catIdx);
    if (on) sidebarState.expandedCategories[k] = true;
    else delete sidebarState.expandedCategories[k];
}

function clearSidebarExpandedCategories() {
    sidebarState.expandedCategories = {};
}

function getSortedExpandedCategoryIndices() {
    var o = sidebarState.expandedCategories || {};
    return Object.keys(o).map(function (x) { return parseInt(x, 10); })
        .filter(function (n) { return !isNaN(n) && n >= 0; })
        .sort(function (a, b) { return a - b; });
}

function snapshotSidebarCommitBaseline() {
    _sidebarLanguageIndexAtOpen = sidebarState.languageIndex;
    _committedNavigationFromSidebarOpen = false;
}

/**
 * Apply the current sidebar language tab to CH+/- list + sessionStorage.
 * Call only when the user commits (e.g. OK on a channel in the menu), not when ◄► browsing.
 */
function applySidebarLanguageToZapListAndSession(playedChannel) {
    var filteredForNav = getFilteredChannelsByLanguage();
    if (filteredForNav && filteredForNav.length > 0) {
        allChannels = filteredForNav.slice();
        var ch = playedChannel || _lastAttemptedChannel || _lastPlayingChannel;
        if (ch) {
            var chId = String(ch.channelno || ch.urno || ch.chid || '');
            var foundIdx = allChannels.findIndex(function (c) {
                return String(c.channelno || c.urno || c.chid || '') === chId;
            });
            if (foundIdx >= 0) currentIndex = foundIdx;
        }
    }
    var selectedLang = sidebarState.languages[sidebarState.languageIndex];
    if (selectedLang) {
        if (selectedLang.code === 'all') {
            try {
                sessionStorage.setItem('selectedLanguageId', 'all');
                sessionStorage.setItem('selectedLanguageName', 'All Channels');
            } catch (e) {}
        } else if (selectedLang.code === 'subscribed') {
            try {
                sessionStorage.setItem('selectedLanguageId', 'subs');
                sessionStorage.setItem('selectedLanguageName', 'Subscribed Channels');
            } catch (e2) {}
        } else {
            try {
                sessionStorage.setItem('selectedLanguageId', String(selectedLang.langid || selectedLang.code || ''));
                sessionStorage.setItem('selectedLanguageName', selectedLang.name || '');
            } catch (e3) {}
        }
    }
}

function getCurrentLanguageStateKey() {
    var currentLang = sidebarState.languages[sidebarState.languageIndex] || {};
    var idPart = String(currentLang.langid || currentLang.code || '').trim().toLowerCase();
    var namePart = String(currentLang.name || '').trim().toLowerCase();
    return idPart || namePart || 'unknown';
}

function getSidebarCategoryStateKey(index) {
    if (!Array.isArray(sidebarState.categories) || index < 0 || index >= sidebarState.categories.length) return '';
    var cat = sidebarState.categories[index] || {};
    var grid = String(cat.grid || '').trim().toLowerCase();
    var name = String(cat.name || '').trim().toLowerCase();
    return grid || name || ('cat-' + index);
}

function rememberCategoryChannelIndex(categoryIndex, channelIndex) {
    var key = getSidebarCategoryStateKey(categoryIndex);
    if (!key) return;
    if (!sidebarState.categoryChannelIndexMap) sidebarState.categoryChannelIndexMap = {};
    sidebarState.categoryChannelIndexMap[key] = Math.max(0, channelIndex || 0);
}

function getRememberedCategoryChannelIndex(categoryIndex) {
    var key = getSidebarCategoryStateKey(categoryIndex);
    if (!key || !sidebarState.categoryChannelIndexMap) return -1;
    var value = sidebarState.categoryChannelIndexMap[key];
    return (typeof value === 'number' && value >= 0) ? value : -1;
}

function saveCurrentLanguageUiState() {
    var key = getCurrentLanguageStateKey();
    if (!key) return;

    var expandedNames = [];
    getSortedExpandedCategoryIndices().forEach(function (ii) {
        var c = sidebarState.categories[ii];
        if (c) expandedNames.push(String(c.name || ''));
    });
    var expandedName = expandedNames.length ? expandedNames[0] : '';

    sidebarState.languageUiState[key] = {
        expandedCategoryNames: expandedNames.slice(),
        expandedCategoryName: expandedName,
        categoryIndex: sidebarState.categoryIndex,
        channelIndex: sidebarState.channelIndex,
        currentLevel: sidebarState.currentLevel,
        categoryChannelIndexMap: sidebarState.categoryChannelIndexMap
    };
}

function restoreCurrentLanguageUiState() {
    var key = getCurrentLanguageStateKey();
    var saved = sidebarState.languageUiState[key];
    if (!saved) return;

    if (typeof saved.categoryIndex === 'number') {
        sidebarState.categoryIndex = Math.max(0, Math.min(saved.categoryIndex, Math.max(0, sidebarState.categories.length - 1)));
    }

    var namesToRestore = saved.expandedCategoryNames;
    if (!namesToRestore || !namesToRestore.length) {
        if (saved.expandedCategoryName) namesToRestore = [saved.expandedCategoryName];
    }
    if (Array.isArray(namesToRestore) && namesToRestore.length > 0 && Array.isArray(sidebarState.categories) && sidebarState.categories.length > 0) {
        clearSidebarExpandedCategories();
        var any = false;
        namesToRestore.forEach(function (nm) {
            var idx = sidebarState.categories.findIndex(function (cat) {
                return String(cat && cat.name || '') === String(nm);
            });
            if (idx >= 0) {
                setSidebarCategoryExpanded(idx, true);
                any = true;
            }
        });
        if (any) {
            if (typeof saved.categoryIndex === 'number') {
                sidebarState.categoryIndex = Math.max(0, Math.min(saved.categoryIndex, sidebarState.categories.length - 1));
            }
            filterChannelsByCategory();
            if (typeof saved.channelIndex === 'number' && sidebarState.channels.length > 0) {
                sidebarState.channelIndex = Math.max(0, Math.min(saved.channelIndex, sidebarState.channels.length - 1));
            } else {
                sidebarState.channelIndex = 0;
            }
            sidebarState.currentLevel = (saved.currentLevel === 'channels' && sidebarState.channels.length > 0) ? 'channels' : 'categories';
            if (saved.categoryChannelIndexMap && typeof saved.categoryChannelIndexMap === 'object') {
                sidebarState.categoryChannelIndexMap = saved.categoryChannelIndexMap;
            }
            return;
        }
    }

    clearSidebarExpandedCategories();
    sidebarState.channels = [];
    sidebarState.channelIndex = 0;
    sidebarState.currentLevel = 'categories';
}

function applyPreferredSidebarLanguage() {
    if (!Array.isArray(sidebarState.languages) || sidebarState.languages.length === 0) return;

    var preferredLangId = '';
    var preferredLangName = '';
    try {
        preferredLangId = String(sessionStorage.getItem('selectedLanguageId') || '').trim();
        preferredLangName = String(sessionStorage.getItem('selectedLanguageName') || '').trim().toLowerCase();
    } catch (e) { }

    if (!preferredLangId && !preferredLangName) {
        // No language selected (home page launch) — default to Subscribed Channels
        sidebarState.languageIndex = 1; // index 1 = "Subscribed Channels"
        updateLanguageDisplay();
        return;
    }

    var matchedIndex = -1;

    // Try ALL matching strategies in one pass
    var pLidLower = preferredLangId.toLowerCase();
    for (var i = 0; i < sidebarState.languages.length; i++) {
        var lang = sidebarState.languages[i];
        // Convert all possible ID/code/name fields to lowercase strings for comparison
        var lid = (lang.langid !== undefined && lang.langid !== null) ? String(lang.langid).trim().toLowerCase() : '';
        var lcode = (lang.code !== undefined && lang.code !== null) ? String(lang.code).trim().toLowerCase() : '';
        var lname = String(lang.name || '').trim().toLowerCase();

        // Match by ID
        if (pLidLower && (lid === pLidLower || lcode === pLidLower)) { matchedIndex = i; break; }
        // Match by name
        if (preferredLangName && lname === preferredLangName) { matchedIndex = i; break; }
    }

    // Fallback: match by the playing channel's own language field
    if (matchedIndex < 0) {
        var ch = _lastPlayingChannel || _lastAttemptedChannel;
        if (ch) {
            var chLangId = (ch.langid !== undefined && ch.langid !== null) ? String(ch.langid).trim().toLowerCase() : '';
            var chLang = String(ch.lalng || ch.langtitle || ch.langname || ch.language || ch.lang || '').trim().toLowerCase();
            for (var k = 0; k < sidebarState.languages.length; k++) {
                var sl = sidebarState.languages[k];
                var slid = (sl.langid !== undefined && sl.langid !== null) ? String(sl.langid).trim().toLowerCase() : '';
                var slcode = (sl.code !== undefined && sl.code !== null) ? String(sl.code).trim().toLowerCase() : '';
                var slname = String(sl.name || '').trim().toLowerCase();
                if (chLangId && (slid === chLangId || slcode === chLangId)) { matchedIndex = k; break; }
                if (chLang && slname === chLang) { matchedIndex = k; break; }
            }
        }
    }

    // Last-resort fallback: when preferred language is known but language API list is delayed,
    // synthesize a temporary language entry from preferred/session/current-channel data.
    // This prevents transient "All Channels" rendering before real language metadata arrives.
    if (matchedIndex < 0 && (preferredLangId || preferredLangName)) {
        var fallbackLangId = preferredLangId;
        var fallbackLangName = preferredLangName;

        var currentCh = _lastPlayingChannel || _lastAttemptedChannel;
        if (currentCh) {
            var chLangId2 = (currentCh.langid !== undefined && currentCh.langid !== null) ? String(currentCh.langid).trim() : '';
            var chLangName2 = String(currentCh.lalng || currentCh.langtitle || currentCh.langname || currentCh.language || currentCh.lang || '').trim();

            if (!fallbackLangId && chLangId2) fallbackLangId = chLangId2;
            if (!fallbackLangName && chLangName2) fallbackLangName = chLangName2;

            if (preferredLangId && chLangId2 && String(preferredLangId).toLowerCase() === String(chLangId2).toLowerCase()) {
                fallbackLangName = chLangName2 || fallbackLangName;
            }
        }

        var fallbackCodeLower = String(fallbackLangId || '').trim().toLowerCase();
        var fallbackNameLower = String(fallbackLangName || '').trim().toLowerCase();
        var isStickyFallback = (fallbackCodeLower === 'all' || fallbackCodeLower === 'subscribed' || fallbackCodeLower === 'subs' ||
            fallbackNameLower === 'all channels' || fallbackNameLower === 'all' || fallbackNameLower.indexOf('subscribed') !== -1);

        if (!isStickyFallback && (fallbackLangId || fallbackLangName)) {
            var existingIdx = sidebarState.languages.findIndex(function (lng) {
                var lid2 = String((lng && (lng.langid || lng.code)) || '').trim().toLowerCase();
                var lname2 = String((lng && lng.name) || '').trim().toLowerCase();
                return (fallbackCodeLower && lid2 === fallbackCodeLower) || (fallbackNameLower && lname2 === fallbackNameLower);
            });

            if (existingIdx >= 0) {
                matchedIndex = existingIdx;
            } else {
                sidebarState.languages.push({
                    name: String(fallbackLangName || fallbackLangId || 'Language').trim(),
                    code: String(fallbackLangId || fallbackLangName || '').trim(),
                    langid: String(fallbackLangId || '').trim()
                });
                matchedIndex = sidebarState.languages.length - 1;
            }
        }
    }

    if (matchedIndex >= 0) {
        sidebarState.languageIndex = matchedIndex;
        updateLanguageDisplay();
    }
}

// Initialize sidebar with dynamic languages and categories
async function initializeSidebar() {
    var sidebar = document.getElementById('playerSidebar');
    if (!sidebar) return;

    // Load languages dynamically from channel data
    await loadLanguagesFromChannels();

    // Load category metadata from API (chnl_categlist) for accurate sidebar categories.
    await loadSidebarCategoriesFromApi();

    // Keep Player menu aligned with the language chosen from Home/Channels flow.
    applyPreferredSidebarLanguage();

    // Setup language arrow navigation
    setupLanguageArrowNavigation();

    // Load available channels
    loadSidebarChannels();

    // Fix Issue: Sync sidebar with current playing channel immediately on launch
    alignSidebarToCurrentPlayback();
    saveCurrentLanguageUiState();
}

async function loadSidebarCategoriesFromApi() {
    sidebarState.apiCategories = [];
    try {
        if (typeof BBNL_API !== 'undefined' && BBNL_API.getCategories) {
            var cats = await BBNL_API.getCategories();
            if (Array.isArray(cats) && cats.length > 0) {
                sidebarState.apiCategories = cats;
            }
        }
    } catch (e) { }
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

            // Add languages from API (skip duplicates of built-in entries)
            apiLanguages.forEach(function (lang) {
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

            return;
        }
    } catch (e) {
    }

    // Fallback: Extract unique languages from ALL channel data
    var languageMap = {}; // langid → name
    channelsForLangs.forEach(function (ch) {
        var lang = ch.lalng || ch.langtitle || ch.langname || ch.language || ch.lang || '';
        var lid = ch.langid || ch.lang_id || '';
        if (lang && lang.trim() !== '') {
            var key = lid ? String(lid).trim() : lang.trim().toLowerCase();
            if (!languageMap[key]) {
                languageMap[key] = { name: lang.trim(), langid: lid ? String(lid).trim() : '' };
            }
        }
    });

    var langKeys = Object.keys(languageMap);
    for (var li = 0; li < langKeys.length; li++) {
        var lEntry = languageMap[langKeys[li]];
        var lower = lEntry.name.toLowerCase();
        if (lower === 'all channels' || lower === 'all' ||
            lower === 'subscribed' || lower === 'subscribed channels' ||
            lower.indexOf('subscribed') !== -1) {
            continue;
        }
        sidebarState.languages.push({
            name: lEntry.name,
            code: lEntry.langid || lEntry.name.toLowerCase(),
            langid: lEntry.langid
        });
    }

}

/**
 * Setup language arrow navigation buttons
 */
function setupLanguageArrowNavigation() {
    var leftArrow = document.getElementById('langNavLeft');
    var rightArrow = document.getElementById('langNavRight');

    function onArrowKeydown(e) {
        if (!e || e.keyCode !== 13) return;
        e.preventDefault();
        if (e.target === leftArrow) changeLanguage(-1);
        else if (e.target === rightArrow) changeLanguage(1);
    }

    if (leftArrow) {
        leftArrow.addEventListener('click', function () {
            changeLanguage(-1);
        });
        leftArrow.addEventListener('keydown', onArrowKeydown);
    }

    if (rightArrow) {
        rightArrow.addEventListener('click', function () {
            changeLanguage(1);
        });
        rightArrow.addEventListener('keydown', onArrowKeydown);
    }

    // Update initial display
    updateLanguageDisplay();
}

/**
 * Change language by direction (-1 = prev, +1 = next)
 */
function changeLanguage(direction) {
    saveCurrentLanguageUiState();

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

    // Reset transient list state before rebuild; restoreCurrentLanguageUiState() may restore expansion
    // for the language we switched to (LEFT/RIGHT ◄ ►). Do not wipe languageUiState[destination] — that
    // broke remembering Movies/Sports/etc. when cycling All → Tamil → All.
    clearSidebarExpandedCategories();
    sidebarState.channels = [];
    sidebarState.currentLevel = 'categories';

    updateLanguageDisplay();

    // Rebuild categories/channels for browsing only. Do NOT change allChannels, currentIndex,
    // or sessionStorage here — user may be previewing English while still watching Subscribed;
    // CH+/- stays on the last committed list until they OK a channel (see playChannelFromSidebar).
    buildCategoriesForLanguage();
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

function isSubscribedSidebarContext() {
    var lang = sidebarState.languages[sidebarState.languageIndex] || {};
    return String(lang.code || '').toLowerCase() === 'subscribed';
}

function isChannelSubscribed(ch) {
    if (!ch) return false;
    var raw = (typeof ch.subscribed !== 'undefined' ? ch.subscribed : ch.is_subscribed);
    var normalized = String(raw === null || typeof raw === 'undefined' ? '' : raw).trim().toLowerCase();
    return raw === true || raw === 1 || normalized === '1' || normalized === 'yes' || normalized === 'true' || normalized === 'y';
}

function isAllSidebarContext() {
    var lang = sidebarState.languages[sidebarState.languageIndex] || {};
    return String(lang.code || '').toLowerCase() === 'all';
}

function getSidebarChannelNumber(ch) {
    var n = parseInt((ch && (ch.channelno || ch.urno || ch.chno || ch.ch_no || 0)) || 0, 10);
    if (isNaN(n)) return 0;
    return n;
}

function isFoFiChannel(ch) {
    if (!ch) return false;
    var title = String(ch.chtitle || ch.channel_name || ch.chname || '').toLowerCase();
    var lcn = getSidebarChannelNumber(ch);
    return lcn === 999 || title.indexOf('fofi') !== -1;
}

function applySidebarChannelSortToList(list) {
    if (!Array.isArray(list) || list.length <= 1) return;
    var order = sidebarState.channelSortOrder === 'desc' ? 'desc' : 'asc';
    list.sort(function (a, b) {
        var aFoFi = isFoFiChannel(a);
        var bFoFi = isFoFiChannel(b);

        if ((isSubscribedSidebarContext() || isAllSidebarContext()) && aFoFi !== bFoFi) {
            return aFoFi ? -1 : 1;
        }

        var aNo = getSidebarChannelNumber(a);
        var bNo = getSidebarChannelNumber(b);
        var cmp = aNo - bNo;
        return order === 'asc' ? cmp : -cmp;
    });
}

function applySidebarChannelSort() {
    applySidebarChannelSortToList(sidebarState.channels);
}

function getApiCategoryName(cat) {
    return String((cat && (cat.grtitle || cat.category || cat.genre || cat.name || cat.title || '')) || '').trim();
}

function getApiCategoryGrid(cat) {
    return String((cat && (cat.grid || cat.gridid || cat.gr_id || cat.id || '')) || '').trim();
}

function isApiCategoryForLanguage(cat, currentLang) {
    if (!cat || !currentLang) return true;
    if (currentLang.code === 'all' || currentLang.code === 'subscribed') return true;

    var catLangId = String((cat.langid || cat.lang_id || cat.languageid || '') || '').trim().toLowerCase();
    var catLangName = String((cat.lalng || cat.langtitle || cat.langname || cat.language || cat.lang || '') || '').trim().toLowerCase();
    var currentLangId = String((currentLang.langid || currentLang.code || '') || '').trim().toLowerCase();
    var currentLangName = String(currentLang.name || '').trim().toLowerCase();

    // If category doesn't carry language metadata, keep it (API payloads vary by backend).
    if (!catLangId && !catLangName) return true;
    if (catLangId && currentLangId && catLangId === currentLangId) return true;
    if (catLangName && currentLangName && catLangName === currentLangName) return true;
    return false;
}

/**
 * Build categories dynamically based on selected language
 */
function buildCategoriesForLanguage() {
    ensureSidebarAllChannelsCache();
    var currentLang = sidebarState.languages[sidebarState.languageIndex];
    var filteredChannels = getFilteredChannelsByLanguage();
    var langKey = getCurrentLanguageStateKey();
    var categoriesCacheKey = [
        String(sidebarState.allChannelsCacheVersion || 0),
        String(langKey || ''),
        String((sidebarState.apiCategories && sidebarState.apiCategories.length) || 0)
    ].join('|');
    var categoriesSection = document.getElementById('sidebarCategoriesSection');
    var channelsSection = document.getElementById('sidebarChannelsSection');

    if (currentLang && currentLang.code === 'all') {
        sidebarState.categories = [];
        sidebarState.categoryIndex = 0;
        clearSidebarExpandedCategories();
        sidebarState.channels = filteredChannels.slice();
        if (isAllSidebarContext()) applySidebarChannelSort();
        sidebarState.channelIndex = Math.max(0, Math.min(sidebarState.channelIndex, Math.max(0, sidebarState.channels.length - 1)));
        sidebarState.currentLevel = 'channels';

        if (categoriesSection) categoriesSection.style.display = 'none';
        if (channelsSection) channelsSection.style.display = 'block';

        renderCategoriesList();
        renderChannelsList();

        // CRITICAL: For All Channels, explicitly set focus to the first valid channel
        // This prevents focus from getting stuck or defaulting to an unresponsive element
        if (sidebarState.channels && sidebarState.channels.length > 0 && sidebarState.isOpen) {
            // Use a small delay to ensure DOM is fully rendered before focusing
            setTimeout(function () {
                if (sidebarState.isOpen) {
                    sidebarState.channelIndex = Math.max(0, Math.min(sidebarState.channelIndex, sidebarState.channels.length - 1));
                    focusChannelItem(sidebarState.channelIndex);
                }
            }, 0);
        }

        saveCurrentLanguageUiState();
        return;
    }

    // Prefer categories from API (chnl_categlist), fallback to channel-derived buckets.
    var builtCategories = _sidebarBuiltCategoriesCache[categoriesCacheKey];
    if (Array.isArray(builtCategories) && builtCategories.length > 0) {
        builtCategories = builtCategories.slice();
    } else {
        builtCategories = [];

        var countByGrid = {};
        var countByName = {};
        filteredChannels.forEach(function (ch) {
            var chGrid = String(ch.grid || ch.gridid || '').trim();
            var chCat = String(ch.grtitle || ch.category || ch.genre || 'Miscellaneous');
            if (chGrid) {
                countByGrid[chGrid] = (countByGrid[chGrid] || 0) + 1;
            }
            countByName[chCat] = (countByName[chCat] || 0) + 1;
        });

        if (Array.isArray(sidebarState.apiCategories) && sidebarState.apiCategories.length > 0) {
            var byName = {};
            sidebarState.apiCategories.forEach(function (cat) {
                if (!isApiCategoryForLanguage(cat, currentLang)) return;
                var name = getApiCategoryName(cat);
                if (!name) return;
                var lower = name.toLowerCase();
                if (lower === 'subscribed' || lower === 'all channels' || lower === 'subscribed channels') return;

                var grid = getApiCategoryGrid(cat);
                var count = grid ? (countByGrid[grid] || 0) : (countByName[name] || 0);
                if (count <= 0) return;

                if (!byName[lower]) {
                    byName[lower] = { name: name, count: count, grid: grid };
                }
            });
            builtCategories = Object.keys(byName).map(function (k) { return byName[k]; });
        }

        if (builtCategories.length === 0) {
            // Fallback: derive categories from channel list.
            builtCategories = Object.keys(countByName)
                .filter(function (catName) {
                    var lowerCat = catName.toLowerCase();
                    return lowerCat !== 'subscribed' && lowerCat !== 'all channels' && lowerCat !== 'subscribed channels';
                })
                .map(function (catName) {
                    return {
                        name: catName,
                        count: countByName[catName],
                        grid: ''
                    };
                });
        }

        _sidebarBuiltCategoriesCache[categoriesCacheKey] = builtCategories.slice();
    }

    sidebarState.categories = builtCategories;

    // Sort by fixed priority first, then by count for unknown categories.
    var categoryPriority = {
        'entertainment': 1,
        'movies': 2,
        'kids': 3,
        'sports': 4,
        'infotainment': 5,
        'music': 6,
        'news': 7,
        'devotional': 8,
        'miscellaneous': 9
    };
    sidebarState.categories.sort(function (a, b) {
        var aName = String((a && a.name) || '').trim().toLowerCase();
        var bName = String((b && b.name) || '').trim().toLowerCase();
        var aRank = categoryPriority.hasOwnProperty(aName) ? categoryPriority[aName] : 999;
        var bRank = categoryPriority.hasOwnProperty(bName) ? categoryPriority[bName] : 999;
        if (aRank !== bRank) return aRank - bRank;
        if (aRank === 999 && bRank === 999) {
            var countDiff = (Number((b && b.count) || 0) - Number((a && a.count) || 0));
            if (countDiff !== 0) return countDiff;
        }
        return b.count - a.count;
    });

    // Always keep category section visible when categories exist.
    if (categoriesSection) categoriesSection.style.display = sidebarState.categories.length > 0 ? 'block' : 'none';
    if (channelsSection) channelsSection.style.display = 'none';

    // Restore language-specific expanded category/channel state.
    restoreCurrentLanguageUiState();

    renderCategoriesList();
    renderChannelsList();

    // After rendering categories:
    // 1. If a category is expanded, visually restore the 'active' class for expanded category
    // 2. Ensure focus is set to a valid element
    if (sidebarState.isOpen) {
        if (getSortedExpandedCategoryIndices().length > 0) {
            if (sidebarState.channels && sidebarState.channels.length > 0 && sidebarState.currentLevel === 'channels') {
                setTimeout(function () {
                    if (sidebarState.isOpen) {
                        sidebarState.currentLevel = 'channels';
                        sidebarState.channelIndex = Math.max(0, Math.min(sidebarState.channelIndex, sidebarState.channels.length - 1));
                        var cIx = Math.max(0, Math.min(sidebarState.categoryIndex, sidebarState.categories.length - 1));
                        focusChannelItem(sidebarState.channelIndex, cIx);
                    }
                }, 0);
            } else if (sidebarState.categories && sidebarState.categories.length > 0) {
                setTimeout(function () {
                    if (sidebarState.isOpen) {
                        sidebarState.currentLevel = 'categories';
                        var focusIdx = Math.max(0, Math.min(sidebarState.categoryIndex, sidebarState.categories.length - 1));
                        focusCategoryItem(focusIdx);
                    }
                }, 0);
            }
        } else if (sidebarState.categories && sidebarState.categories.length > 0) {
            setTimeout(function () {
                if (sidebarState.isOpen) {
                    sidebarState.currentLevel = 'categories';
                    var focusIdx2 = Math.max(0, Math.min(sidebarState.categoryIndex, sidebarState.categories.length - 1));
                    focusCategoryItem(focusIdx2);
                }
            }, 0);
        }
    }

    saveCurrentLanguageUiState();

}

/**
 * Find index of the currently playing channel in sidebarState.channels
 * Used so the sidebar opens with focus on the current channel, not the first one.
 */
function findCurrentChannelInSidebar() {
    if (sidebarState.channels.length === 0) return -1;
    var currentChannel = getCurrentPlayingChannelObject();
    if (!currentChannel) return -1;
    var idx = sidebarState.channels.findIndex(function (ch) {
        return areSameChannel(ch, currentChannel);
    });
    return idx;
}

function getCurrentPlayingChannelObject() {
    var current = _lastAttemptedChannel || _lastPlayingChannel;
    if (!current && currentIndex >= 0 && currentIndex < allChannels.length) {
        current = allChannels[currentIndex];
    }
    return current || null;
}

function areSameChannel(a, b) {
    if (!a || !b) return false;

    var aIds = [
        a.chid, a.channelid, a.id,
        a.channelno, a.urno, a.chno, a.ch_no
    ].map(function (v) { return String(v || '').trim(); }).filter(Boolean);

    var bIds = [
        b.chid, b.channelid, b.id,
        b.channelno, b.urno, b.chno, b.ch_no
    ].map(function (v) { return String(v || '').trim(); }).filter(Boolean);

    for (var i = 0; i < aIds.length; i++) {
        if (bIds.indexOf(aIds[i]) !== -1) return true;
    }

    var aName = String(a.chtitle || a.channel_name || a.chname || '').trim().toLowerCase();
    var bName = String(b.chtitle || b.channel_name || b.chname || '').trim().toLowerCase();
    if (aName && bName && aName === bName) return true;

    var aStream = String(a.streamlink || a.channel_url || a.url || '').trim().toLowerCase();
    var bStream = String(b.streamlink || b.channel_url || b.url || '').trim().toLowerCase();
    if (aStream && bStream && aStream === bStream) return true;

    return false;
}

function normalizeCategoryName(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
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
    var current = getCurrentPlayingChannelObject();
    if (!current || !Array.isArray(sidebarState.categories) || sidebarState.categories.length === 0) {
        return -1;
    }

    var langFiltered = getFilteredChannelsByLanguage();

    // Resolve the exact channel object from the current language-filtered list.
    var matched = null;
    for (var m = 0; m < langFiltered.length; m++) {
        if (areSameChannel(langFiltered[m], current)) {
            matched = langFiltered[m];
            break;
        }
    }
    if (!matched) return -1;

    // 1) Prefer grid-based mapping (most reliable when API categories provide grid ids).
    var matchedGrid = String(matched.grid || matched.gridid || '').trim();
    if (matchedGrid) {
        for (var g = 0; g < sidebarState.categories.length; g++) {
            var catGrid = String(sidebarState.categories[g] && sidebarState.categories[g].grid || '').trim();
            if (catGrid && catGrid === matchedGrid) {
                return g;
            }
        }
    }

    // 2) Fallback to normalized category-name mapping.
    var matchedCat = normalizeCategoryName(matched.grtitle || matched.category || matched.genre || 'Miscellaneous');
    for (var i = 0; i < sidebarState.categories.length; i++) {
        var catName = sidebarState.categories[i] && sidebarState.categories[i].name;
        if (!catName) continue;
        if (normalizeCategoryName(catName) === matchedCat) return i;
    }

    return -1;
}

function languageContainsCurrentPlayingChannel(langIndex) {
    var current = getCurrentPlayingChannelObject();
    if (!current) return false;
    if (!Array.isArray(sidebarState.languages) || langIndex < 0 || langIndex >= sidebarState.languages.length) return false;

    var originalIndex = sidebarState.languageIndex;
    sidebarState.languageIndex = langIndex;
    var filtered = getFilteredChannelsByLanguage();
    sidebarState.languageIndex = originalIndex;

    return filtered.some(function (ch) {
        return areSameChannel(ch, current);
    });
}

/**
 * After opening the player from TV Channels page, expand the same sidebar category (grid/name) when possible.
 */
function applyChannelsPageCategoryFromSession() {
    try {
        var grid = String(sessionStorage.getItem('bbnl_channels_category_grid') || '').trim();
        var key = String(sessionStorage.getItem('bbnl_channels_category_key') || '').trim().toLowerCase();
        if (!grid && !key) return false;
        if (!sidebarState.categories || sidebarState.categories.length === 0) return false;
        var idx = -1;
        if (grid) {
            idx = sidebarState.categories.findIndex(function (c) {
                return String(c.grid || '').trim() === grid;
            });
        }
        if (idx < 0 && key) {
            idx = sidebarState.categories.findIndex(function (c) {
                return String(c.name || '').trim().toLowerCase() === key;
            });
        }
        if (idx < 0) return false;
        sessionStorage.removeItem('bbnl_channels_category_grid');
        sessionStorage.removeItem('bbnl_channels_category_key');
        selectCategory(idx, true);
        return true;
    } catch (e) {
        return false;
    }
}

function clearChannelsPageCategorySessionHint() {
    try {
        sessionStorage.removeItem('bbnl_channels_category_grid');
        sessionStorage.removeItem('bbnl_channels_category_key');
    } catch (e) { }
}

function alignSidebarToCurrentPlayback() {
    var currentId = String(getCurrentPlayingChannelId() || '');
    if (!currentId) return;

    // Respect user's language selection for sticky contexts (All/Subscribed).
    var selectedLang = sidebarState.languages[sidebarState.languageIndex] || {};
    var selectedLangCode = String(selectedLang.code || '').toLowerCase();
    var isStickyContext = (selectedLangCode === 'all' || selectedLangCode === 'subscribed');

    // The user's choice is already set in sidebarState.languageIndex by applyPreferredSidebarLanguage.
    if (!isStickyContext && !languageContainsCurrentPlayingChannel(sidebarState.languageIndex)) {
        var langMatch = -1;
        for (var i = 0; i < sidebarState.languages.length; i++) {
            var langCode = String((sidebarState.languages[i] && sidebarState.languages[i].code) || '').toLowerCase();
            if (langCode === 'all' || langCode === 'subscribed') continue;
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

    // FORCE ALIGNMENT TO CURRENT PLAYING CHANNEL
    // Focus priority must be: Currently playing channel (highest priority)
    var currentCatIdx = getCurrentPlayingCategoryIndex();
    if (currentCatIdx >= 0) {
        clearChannelsPageCategorySessionHint();
        // Use the same flow as explicit category selection, but force current-channel preference.
        // This keeps language/category/channel indices and rendered UI in a single consistent path.
        selectCategory(currentCatIdx, true);
    } else {
        // Fallback: If channel isn't found in current language's categories
        if (applyChannelsPageCategoryFromSession()) {
            return;
        }
        if (getSortedExpandedCategoryIndices().length > 0) {
            var prim = getSortedExpandedCategoryIndices()[0];
            if (prim >= 0 && prim < sidebarState.categories.length) {
                selectCategory(prim, true);
            }
            sidebarState.channelIndex = Math.max(0, Math.min(sidebarState.channelIndex, sidebarState.channels.length - 1));
        } else if (isStickyContext) {
            // CRITICAL: In All Channels or Subscribed mode, categories are empty/not relevant.
            // Do NOT clear sidebarState.channels - instead ensure they are populated from the language filter.
            sidebarState.channels = getFilteredChannelsByLanguage().slice();
            var idx = findCurrentChannelInSidebar();
            sidebarState.channelIndex = idx >= 0 ? idx : 0;
            renderChannelsList();
        } else {
            clearSidebarExpandedCategories();
            sidebarState.channels = [];
            sidebarState.channelIndex = 0;
            renderChannelsList();
        }
    }
}

/**
 * Get channels filtered by current language
 */
function getFilteredChannelsByLanguage() {
    var currentLang = sidebarState.languages[sidebarState.languageIndex];

    // CRITICAL: Safety fallback to prevent empty 'All Channels' bug.
    // If cache is empty but global data exists, restore it on-the-fly.
    if ((!sidebarState.allChannelsCache || sidebarState.allChannelsCache.length === 0)) {
        var source = (typeof _allChannelsUnfiltered !== 'undefined' && _allChannelsUnfiltered.length > 0) 
            ? _allChannelsUnfiltered 
            : ((typeof allChannels !== 'undefined') ? allChannels : []);
        if (source.length > 0) {
            sidebarState.allChannelsCache = source.slice();
            sidebarState.allChannelsCacheVersion = (sidebarState.allChannelsCacheVersion || 0) + 1;
            invalidateSidebarDerivedCaches();
        }
    }

    var filterCacheKey = [
        String(sidebarState.allChannelsCacheVersion || 0),
        String(getCurrentLanguageStateKey() || '')
    ].join('|');
    if (_sidebarFilteredChannelsCache[filterCacheKey]) {
        return _sidebarFilteredChannelsCache[filterCacheKey].slice();
    }

    if (currentLang.code === 'all') {
        _sidebarFilteredChannelsCache[filterCacheKey] = sidebarState.allChannelsCache.slice();
        return _sidebarFilteredChannelsCache[filterCacheKey].slice();
    }

    if (currentLang.code === 'subscribed') {
        var subscribed = sidebarState.allChannelsCache.filter(function (ch) {
            return isChannelSubscribed(ch);
        });
        _sidebarFilteredChannelsCache[filterCacheKey] = subscribed.slice();
        return subscribed;
    }

    // Filter by language - try langid first, then language name
    var filtered = sidebarState.allChannelsCache.filter(function (ch) {
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
    _sidebarFilteredChannelsCache[filterCacheKey] = filtered.slice();
    return filtered;
}

function ensureSidebarAllChannelsCache() {
    var cache = null;

    if (Array.isArray(_allChannelsUnfiltered) && _allChannelsUnfiltered.length > 0) {
        cache = _allChannelsUnfiltered.slice();
    } else if (Array.isArray(allChannels) && allChannels.length > 0) {
        cache = allChannels.slice();
    } else if (typeof CacheManager !== 'undefined') {
        try {
            var cached = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true) || CacheManager.get(CacheManager.KEYS.CHANNEL_LIST);
            if (Array.isArray(cached) && cached.length > 0) {
                cache = cached.slice();
            }
        } catch (e) { }
    }

    if (!cache || cache.length === 0) return false;

    cache.sort(function (a, b) {
        var aNo = parseInt(a.channelno || a.urno || a.chno || a.ch_no || 0, 10);
        var bNo = parseInt(b.channelno || b.urno || b.chno || b.ch_no || 0, 10);
        if (aNo === 999) return -1;
        if (bNo === 999) return 1;
        return aNo - bNo;
    });

    _allChannelsUnfiltered = cache.slice();
    if (sidebarState) {
        sidebarState.allChannelsCache = cache.slice();
        sidebarState.allChannelsCacheVersion = (sidebarState.allChannelsCacheVersion || 0) + 1;
    }
    invalidateSidebarDerivedCaches();
    return true;
}

function hydrateSidebarAllChannelsCache() {
    if (ensureSidebarAllChannelsCache()) {
        return Promise.resolve(true);
    }

    if (_sidebarChannelsHydrationPromise) {
        return _sidebarChannelsHydrationPromise;
    }

    _sidebarChannelsHydrationPromise = (function () {
        if (typeof loadChannelList !== 'function') {
            return Promise.resolve(false);
        }
        return Promise.resolve(loadChannelList()).then(function () {
            return ensureSidebarAllChannelsCache();
        }).catch(function () {
            return ensureSidebarAllChannelsCache();
        }).then(function (result) {
            _sidebarChannelsHydrationPromise = null;
            return result;
        }, function (err) {
            _sidebarChannelsHydrationPromise = null;
            throw err;
        });
    })();

    return _sidebarChannelsHydrationPromise;
}

/**
 * Render categories list
 */
function renderCategoriesList() {
    _cachedSidebarCategories = null; // invalidate cached DOM collection
    _cachedSidebarChannels = null; // invalidate inline channels collection safely when rebuilt
    var container = document.getElementById('categoriesList');
    if (!container) return;

    container.innerHTML = '';

    var frag = document.createDocumentFragment();
    sidebarState.categories.forEach(function (cat, index) {
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

        // Add 'active' class for the category that has focus
        if (index === sidebarState.categoryIndex) {
            btn.classList.add('active');
        }

        if (isSidebarCategoryExpanded(index)) {
            btn.classList.add('expanded');
        }

        btn.addEventListener('click', function () {
            selectCategory(index);
        });

        frag.appendChild(btn);

        if (isSidebarCategoryExpanded(index)) {
            var catChans = getChannelsForCategoryAtIndex(index);
            if (catChans.length > 0) {
                var inlineWrap = document.createElement('div');
                inlineWrap.className = 'inline-channels-wrap';
                catChans.forEach(function (ch, chIndex) {
                    inlineWrap.appendChild(createChannelItemButton(ch, chIndex, index));
                });
                frag.appendChild(inlineWrap);
            }
        }
    });
    container.appendChild(frag);

}

function createChannelItemButton(ch, index, sidebarCategoryIndex) {
    var btn = document.createElement('button');
    btn.className = 'channel-item focusable';
    btn.tabIndex = 0;
    btn.dataset.channelIndex = index;
    if (typeof sidebarCategoryIndex === 'number' && sidebarCategoryIndex >= 0) {
        btn.dataset.sidebarCategoryIndex = String(sidebarCategoryIndex);
    }

    var logoDiv = document.createElement('div');
    logoDiv.className = 'channel-item-logo';
    var logoUrl = normalizeLogoCacheUrl(getChannelLogoUrl(ch));
    if (logoUrl && logoUrl.trim() !== '') {
        var logoImg = document.createElement('img');
        logoImg.alt = ch.chtitle || 'Channel';
        var useEagerLogoLoad = isAllSidebarContext() && (!sidebarState.categories || sidebarState.categories.length === 0);
        logoImg.loading = useEagerLogoLoad ? 'eager' : 'lazy';
        logoImg.decoding = 'async';
        logoImg.crossOrigin = 'anonymous';
        logoImg.addEventListener('error', function () {
            this.style.display = 'none';
            ensureSidebarLogoPlaceholder(logoDiv, ch);
        }, { once: true });
        var globallyCached = (typeof BBNL_API !== 'undefined' && BBNL_API.isImageCached && BBNL_API.isImageCached(logoUrl));
        if (_logoCache[logoUrl] || globallyCached) {
            if (!_logoCache[logoUrl]) _logoCache[logoUrl] = true;
            logoImg.src = _logoSourceCache[logoUrl] || logoUrl;
        } else if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
            BBNL_API.setImageSource(logoImg, logoUrl, { priority: true });
        } else {
            logoImg.src = logoUrl;
        }
        logoImg.addEventListener('load', function () {
            _logoCache[logoUrl] = true;
            _logoSourceCache[logoUrl] = this.src || logoUrl;
            if (typeof BBNL_API !== 'undefined' && BBNL_API.markImageCached) {
                BBNL_API.markImageCached(logoUrl);
            }
        }, { once: true });
        logoDiv.appendChild(logoImg);
    } else {
        ensureSidebarLogoPlaceholder(logoDiv, ch);
    }

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

    var lcnDiv = document.createElement('div');
    lcnDiv.className = 'channel-item-lcn';
    lcnDiv.textContent = ch.channelno || ch.urno || ch.chno || '--';

    btn.appendChild(logoDiv);
    btn.appendChild(infoDiv);
    btn.appendChild(lcnDiv);

    if (typeof sidebarCategoryIndex === 'number' && sidebarCategoryIndex >= 0) {
        if (sidebarCategoryIndex === sidebarState.categoryIndex && index === sidebarState.channelIndex) {
            btn.classList.add('active');
        }
    } else if (index === sidebarState.channelIndex) {
        btn.classList.add('active');
    }

    btn.addEventListener('click', function () {
        playChannelFromSidebar(ch);
    });

    return btn;
}

/**
 * Select a category and update channels
 */
function selectCategory(index, preferCurrentChannel) {
    if (index < 0 || index >= sidebarState.categories.length) return;

    var shouldPreferCurrent = (preferCurrentChannel === true);

    if (sidebarState.categoryIndex >= 0 && isSidebarCategoryExpanded(sidebarState.categoryIndex)) {
        rememberCategoryChannelIndex(sidebarState.categoryIndex, sidebarState.channelIndex);
    }

    // Toggle: OK on same category row again closes only that category's list (others stay open).
    if (!shouldPreferCurrent && isSidebarCategoryExpanded(index)) {
        saveCurrentLanguageUiState();
        sidebarState.categoryIndex = index;
        setSidebarCategoryExpanded(index, false);
        sidebarState.channels = getChannelsForCategoryAtIndex(index);
        sidebarState.channelIndex = 0;
        sidebarState.currentLevel = 'categories';

        renderCategoriesList();
        renderChannelsList();
        focusCategoryItem(index);
        saveCurrentLanguageUiState();
        return;
    }

    // Sync / align playback: only one expansion. User browsing: keep other categories open.
    if (shouldPreferCurrent) {
        clearSidebarExpandedCategories();
    }

    sidebarState.categoryIndex = index;
    setSidebarCategoryExpanded(index, true);

    // Update active category highlight (use cached list)
    _getSidebarCategories().forEach(function (cat, i) {
        if (i === index) {
            cat.classList.add('active');
        } else {
            cat.classList.remove('active');
        }
    });

    // Filter channels by language and category
    filterChannelsByCategory();
    if (sidebarState.channels.length > 0) {
        var currentInCategory = shouldPreferCurrent ? findCurrentChannelInSidebar() : -1;
        var rememberedIndex = getRememberedCategoryChannelIndex(index);
        sidebarState.channelIndex = currentInCategory >= 0 ? currentInCategory : (rememberedIndex >= 0 ? Math.min(rememberedIndex, sidebarState.channels.length - 1) : 0);
    } else {
        sidebarState.channelIndex = 0;
    }

    // UPDATE: Prefetch logos for channels in THIS category BEFORE rendering
    // This reduces visible loading delay when switching categories
    prefetchSidebarChannelLogos(sidebarState.channels, Math.min(sidebarState.channels.length, 120));

    // Update channels section title
    updateChannelsSectionTitle();

    // Render updated channels list
    renderCategoriesList();
    renderChannelsList();

    // After explicit category selection, move focus into channels for clear UX.
    if (sidebarState.channels.length > 0) {
        sidebarState.currentLevel = 'channels';
        var nextChannelIndex = shouldPreferCurrent ? findCurrentChannelInSidebar() : -1;
        if (nextChannelIndex >= 0) {
            sidebarState.channelIndex = nextChannelIndex;
        } else {
            var rememberedIndex2 = getRememberedCategoryChannelIndex(index);
            sidebarState.channelIndex = rememberedIndex2 >= 0 ? Math.min(rememberedIndex2, sidebarState.channels.length - 1) : 0;
        }
        focusChannelItem(sidebarState.channelIndex, index);
    } else {
        sidebarState.currentLevel = 'categories';
        focusCategoryItem(index);
    }

    saveCurrentLanguageUiState();

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
        if (isSubscribedSidebarContext() || isAllSidebarContext()) applySidebarChannelSort();
        return;
    }

    sidebarState.channels = langFiltered.filter(function (ch) {
        if (selectedCat.grid) {
            var chGrid = String(ch.grid || ch.gridid || '').trim();
            return chGrid === String(selectedCat.grid);
        }
        var chCat = ch.grtitle || ch.category || ch.genre || 'Miscellaneous';
        return chCat === selectedCat.name;
    });

    if (isSubscribedSidebarContext() || isAllSidebarContext()) applySidebarChannelSort();

}

/**
 * Channel list for one category row (used when multiple categories are expanded).
 */
function getChannelsForCategoryAtIndex(catIdx) {
    if (catIdx < 0 || !Array.isArray(sidebarState.categories) || catIdx >= sidebarState.categories.length) return [];
    var langFiltered = getFilteredChannelsByLanguage();
    var selectedCat = sidebarState.categories[catIdx];
    if (!selectedCat) return [];
    var list = langFiltered.filter(function (ch) {
        if (selectedCat.grid) {
            var chGrid = String(ch.grid || ch.gridid || '').trim();
            return chGrid === String(selectedCat.grid);
        }
        var chCat = ch.grtitle || ch.category || ch.genre || 'Miscellaneous';
        return chCat === selectedCat.name;
    });
    if (isSubscribedSidebarContext() || isAllSidebarContext()) {
        list = list.slice();
        applySidebarChannelSortToList(list);
    }
    return list;
}

function syncSidebarStateFromChannelButton(el) {
    if (!el || !el.dataset) return;
    var sci = el.dataset.sidebarCategoryIndex;
    if (sci !== undefined && sci !== '') {
        var cidx = parseInt(sci, 10);
        if (!isNaN(cidx)) sidebarState.categoryIndex = cidx;
    }
    var chi = parseInt(el.dataset.channelIndex, 10);
    if (!isNaN(chi)) sidebarState.channelIndex = chi;
    if (sidebarState.categoryIndex >= 0 && sidebarState.categories.length > 0) {
        sidebarState.channels = getChannelsForCategoryAtIndex(sidebarState.categoryIndex);
    }
}

/**
 * Load channels for sidebar (uses ALL channels — subscribed + unsubscribed)
 * Sidebar displays all channels; playback is controlled by subscription check in setupPlayer.
 */
function loadSidebarChannels() {
    // Use unfiltered list for sidebar (all channels visible)
    ensureSidebarAllChannelsCache();
    var channelsForSidebar = _allChannelsUnfiltered.length > 0 ? _allChannelsUnfiltered : allChannels;
    if (!channelsForSidebar || channelsForSidebar.length === 0) {
        hydrateSidebarAllChannelsCache().then(function () {
            if (sidebarState && sidebarState.isOpen) {
                buildCategoriesForLanguage();
            }
        });
        return;
    }

    // Cache ALL channels for sidebar filtering (language/category)
    sidebarState.allChannelsCache = channelsForSidebar.slice();
    sidebarState.allChannelsCacheVersion = (sidebarState.allChannelsCacheVersion || 0) + 1;
    invalidateSidebarDerivedCaches();

    // Preload a capped set so visible rows load faster without network saturation.
    prefetchSidebarChannelLogos(channelsForSidebar, 120);

    // Build categories for current language
    buildCategoriesForLanguage();

}

/**
 * Render channels list in HTML - Logo + Name + Price + LCN layout
 */
function renderChannelsList() {
    _cachedSidebarChannels = null; // invalidate cached DOM collection
    var container = document.getElementById('channelsList');
    if (!container) return;

    var currentLang = sidebarState.languages[sidebarState.languageIndex] || {};
    if (currentLang.code !== 'all' && sidebarState.categories.length > 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = '';

    // Show message if no channels
    if (sidebarState.channels.length === 0) {
        var emptyMsg = document.createElement('div');
        emptyMsg.className = 'no-channels-message';
        emptyMsg.textContent = sidebarState.categories.length > 0
            ? 'Select a category to view channels'
            : 'No channels available';
        emptyMsg.style.cssText = 'padding: 30px 20px; text-align: center; color: rgba(255,255,255,0.5); font-size: 15px;';
        container.appendChild(emptyMsg);
        return;
    }

    var frag = document.createDocumentFragment();
    sidebarState.channels.forEach(function (ch, index) {
        frag.appendChild(createChannelItemButton(ch, index));
    });
    container.appendChild(frag); // Single DOM write — no per-item reflow
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

    var hasSidebarCache = ensureSidebarAllChannelsCache();

    if (!hasSidebarCache) {
        hydrateSidebarAllChannelsCache().then(function () {
            if (!sidebarState || !sidebarState.isOpen) return;
            if (!ensureSidebarAllChannelsCache()) return;
            applyPreferredSidebarLanguage();
            alignSidebarToCurrentPlayback();
            saveCurrentLanguageUiState();

            sidebar.classList.add('open');
            sidebar.classList.remove('close');

            if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
            var overlayHydrated = _overlayEl;
            if (overlayHydrated) {
                overlayHydrated.classList.remove('hidden');
                overlayHydrated.classList.add('visible');
            }

            if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
            var infoBarHydrated = _infoBarEl;
            if (infoBarHydrated) {
                infoBarHydrated.classList.remove('info-bar-hidden');
                infoBarHydrated.classList.add('sidebar-active');
            }

            if (overlayTimeout) {
                clearTimeout(overlayTimeout);
                overlayTimeout = null;
            }

            var hydratedCatIdx = getCurrentPlayingCategoryIndex();
            if (hydratedCatIdx >= 0 && sidebarState.categories && sidebarState.categories.length > 0) {
                var hydratedChIdx = findCurrentChannelInSidebar();
                if (hydratedChIdx >= 0 && sidebarState.channels && sidebarState.channels.length > 0) {
                    sidebarState.currentLevel = 'channels';
                    sidebarState.categoryIndex = Math.max(0, Math.min(hydratedCatIdx, sidebarState.categories.length - 1));
                    sidebarState.channelIndex = Math.max(0, Math.min(hydratedChIdx, sidebarState.channels.length - 1));
                    focusChannelItem(sidebarState.channelIndex, sidebarState.categoryIndex);
                }
            }

            resetSidebarInactivityTimer();
            snapshotSidebarCommitBaseline();
        });
    }

    sidebarState.isOpen = true;

    // Start at categories level fallback
    sidebarState.currentLevel = 'categories';

    if (!hasSidebarCache) {
        return;
    }

    // ✅ CRITICAL: Restore the language selection from sessionStorage before syncing with playback.
    // This ensures that when reopening the sidebar, we restore the previously selected language
    // (e.g., Subscribed, All Channels, or a specific language like Tamil, Hindi).
    // Without this, languageIndex defaults to 0 (All Channels) on sidebar reopen.
    applyPreferredSidebarLanguage();

    // ALWAYS sync sidebar with current playing channel on open.
    // This ensures that if the channel was changed from an external screen (like the TV Channels section),
    // the sidebar correctly highlights the actual playing channel and its correct category.
    alignSidebarToCurrentPlayback();
    saveCurrentLanguageUiState();

    // Keep focused row aligned to currently playing channel even when last-saved state was category-level.
    var syncedCatIdx = getCurrentPlayingCategoryIndex();
    if (syncedCatIdx >= 0 && sidebarState.categories && sidebarState.categories.length > 0) {
        var syncedChIdx = findCurrentChannelInSidebar();
        if (syncedChIdx >= 0) {
            sidebarState.currentLevel = 'channels';
            sidebarState.categoryIndex = Math.max(0, Math.min(syncedCatIdx, sidebarState.categories.length - 1));
            sidebarState.channelIndex = Math.max(0, Math.min(syncedChIdx, sidebarState.channels.length - 1));
        }
    }

    // Make sidebar visible only after alignment to avoid intermediate All Channels flicker.
    sidebar.classList.add('open');
    sidebar.classList.remove('close');

    if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
    var overlay = _overlayEl;
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
    }

    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
    var infoBar = _infoBarEl;
    if (infoBar) {
        infoBar.classList.remove('info-bar-hidden');
        infoBar.classList.add('sidebar-active');
    }

    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
        overlayTimeout = null;
    }

    // Handle focus based on updated state
    // CRITICAL: Respect the updated state from languageUiState, don't forcefully reset
    var categoriesSection = document.getElementById('sidebarCategoriesSection');
    var channelsSection = document.getElementById('sidebarChannelsSection');
    var categoriesHidden = categoriesSection && categoriesSection.style.display === 'none';
    var channelsVisible = channelsSection && channelsSection.style.display !== 'none';

    // Check what level was restored from state
    var hasExpandedCategory = getSortedExpandedCategoryIndices().length > 0;
    var hasChannelsInView = sidebarState.channels && sidebarState.channels.length > 0;

    // For "All Channels" (channels visible, no categories)
    if (channelsVisible && categoriesHidden && sidebarState.channels && sidebarState.channels.length > 0) {
        sidebarState.currentLevel = 'channels';
        setTimeout(function () {
            if (sidebarState.isOpen) {
                sidebarState.channelIndex = Math.max(0, Math.min(sidebarState.channelIndex, sidebarState.channels.length - 1));
                focusChannelItem(sidebarState.channelIndex);
            }
        }, 0);
    }
    // For language/category view with expanded category
    else if (hasExpandedCategory && hasChannelsInView) {
        sidebarState.currentLevel = 'channels';
        setTimeout(function () {
            if (sidebarState.isOpen) {
                sidebarState.channelIndex = Math.max(0, Math.min(sidebarState.channelIndex, sidebarState.channels.length - 1));
                var oIx2 = Math.max(0, Math.min(sidebarState.categoryIndex, sidebarState.categories.length - 1));
                focusChannelItem(sidebarState.channelIndex, oIx2);
            }
        }, 0);
    }
    // For language/category view without expanded category
    else if (!categoriesHidden && sidebarState.categories.length > 0) {
        sidebarState.currentLevel = 'categories';
        focusCategoryItem(Math.max(0, Math.min(sidebarState.categoryIndex, sidebarState.categories.length - 1)));
    }
    // No categories - focus on language navigation (for empty states)
    else {
        var leftArrow = document.getElementById('langNavLeft');
        if (leftArrow) leftArrow.focus();
    }

    // Sidebar auto-hide after 5s inactivity
    resetSidebarInactivityTimer();

    snapshotSidebarCommitBaseline();
}

/**
 * Close sidebar only - does NOT affect info bar
 * CRITICAL: Save sidebar state before closing so it can be restored on reopen
 */
function closeSidebar() {
    var sidebar = document.getElementById('playerSidebar');
    if (!sidebar) return;

    // Browsed ◄► to another language but never OK'd a channel — restore tab to what it was at open
    // so CH+/- and reopened menu match the committed viewing context (e.g. still Subscribed).
    if (!_committedNavigationFromSidebarOpen && sidebarState.languageIndex !== _sidebarLanguageIndexAtOpen) {
        sidebarState.languageIndex = _sidebarLanguageIndexAtOpen;
        updateLanguageDisplay();
        buildCategoriesForLanguage();
    }

    // ✅ CRITICAL: Persist current sidebar state before closing
    // This ensures when user reopens sidebar, they return to the exact same position
    saveCurrentLanguageUiState();

    sidebarState.isOpen = false;

    // ✅ CRITICAL: Clear focus from sidebar BEFORE closing
    // This prevents focus from remaining on sidebar elements after close
    // Must clear activeElement to ensure no sidebar element remains focused
    var activeEl = document.activeElement;
    if (activeEl && sidebar.contains(activeEl)) {
        // Active element is inside sidebar - blur it immediately
        activeEl.blur();
    }

    // ✅ Move focus to a focusable element outside the sidebar
    // Strategy: Find first non-sidebar focusable element, or focus on player container
    var focusTarget = null;

    // Try to focus on the player overlay (should have tabindex after fix)
    var playerOverlay = document.getElementById('player-overlay');
    if (playerOverlay) {
        focusTarget = playerOverlay;
    }

    // Fallback: Try player container
    if (!focusTarget) {
        focusTarget = document.getElementById('player-container');
    }

    // Fallback: Use document body
    if (!focusTarget) {
        focusTarget = document.body;
    }

    // Ensure focus is moved (use setTimeout to ensure blur happens first)
    if (focusTarget) {
        setTimeout(function () {
            if (typeof focusTarget.focus === 'function') {
                focusTarget.focus();
            }
        }, 10);
    }

    sidebar.classList.add('close');
    setTimeout(function () {
        sidebar.classList.remove('open', 'close');
    }, 300);

    clearSidebarInactivityTimer();

    // Restore full-width info bar and continue normal auto-hide timer after menu closes.
    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
    var infoBar = _infoBarEl;
    if (infoBar) {
        infoBar.classList.remove('sidebar-active');
        infoBar.classList.remove('info-bar-hidden');
    }

    if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
    var overlay = _overlayEl;
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
    }

    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
        overlayTimeout = null;
    }

    if (!INFO_BAR_PERSISTENT) {
        overlayTimeout = setTimeout(function () {
            hideOverlay();
        }, OVERLAY_HIDE_DELAY);
    }

    schedulePlayerChromeIdleHide();
}

/**
 * Clear sidebar inactivity timer (legacy id; chrome idle uses playerChromeIdleTimer)
 */
function clearSidebarInactivityTimer() {
    if (sidebarInactivityTimer) {
        clearTimeout(sidebarInactivityTimer);
        sidebarInactivityTimer = null;
    }
}

function clearPlayerChromeIdleTimer() {
    if (playerChromeIdleTimer) {
        clearTimeout(playerChromeIdleTimer);
        playerChromeIdleTimer = null;
    }
}

/**
 * After PLAYER_CHROME_IDLE_MS without a reset: close menu + hide info bar + overlay (unless error popup / sticky chrome).
 */
function autoHidePlayerChromeFromIdle() {
    playerChromeIdleTimer = null;
    if (playerErrorPopupOpen || _keepChromeAfterErrorBack) return;
    if (sidebarState.isOpen) {
        closeSidebar();
    }
    if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
    if (_overlayEl) {
        _overlayEl.classList.remove('visible');
        _overlayEl.classList.add('hidden');
    }
    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
    if (_infoBarEl) {
        _infoBarEl.classList.add('info-bar-hidden');
        _infoBarEl.classList.remove('sidebar-active');
    }
    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
        overlayTimeout = null;
    }
    if (uiTimer) {
        clearTimeout(uiTimer);
        uiTimer = null;
    }
}

function schedulePlayerChromeIdleHide() {
    if (playerErrorPopupOpen || _keepChromeAfterErrorBack) return;
    clearPlayerChromeIdleTimer();
    playerChromeIdleTimer = setTimeout(autoHidePlayerChromeFromIdle, PLAYER_CHROME_IDLE_MS);
}

/**
 * Reset idle timer — sidebar open or any sidebar key
 */
function resetSidebarInactivityTimer() {
    clearSidebarInactivityTimer();
    if (sidebarState.isOpen) {
        schedulePlayerChromeIdleHide();
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
    if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
    var overlay = _overlayEl;
    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
    var infoBar = _infoBarEl;

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
}

/**
 * Reset the shared UI timer (sidebar + info bar chrome)
 */
function resetUITimer() {
    if (uiTimer) {
        clearTimeout(uiTimer);
        uiTimer = null;
    }
    schedulePlayerChromeIdleHide();
}

/**
 * Hide both sidebar and info bar together
 */
function hidePlayerUI() {
    if (playerErrorPopupOpen) {
        return;
    }

    var sidebar = document.getElementById('playerSidebar');
    if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
    var overlay = _overlayEl;
    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
    var infoBar = _infoBarEl;

    // Hide sidebar
    if (sidebar) {
        sidebarState.isOpen = false;
        sidebar.classList.add('close');
        setTimeout(function () {
            sidebar.classList.remove('open', 'close');
        }, 300);
    }

    if (_keepChromeAfterErrorBack) {
        if (infoBar) {
            infoBar.classList.remove('info-bar-hidden');
            infoBar.classList.remove('sidebar-active');
        }
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.classList.add('visible');
        }
        if (uiTimer) {
            clearTimeout(uiTimer);
            uiTimer = null;
        }
        clearPlayerChromeIdleTimer();
        return;
    }

    if (overlay) {
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
    }

    if (infoBar && !INFO_BAR_PERSISTENT) {
        infoBar.classList.add('info-bar-hidden');
        infoBar.classList.remove('sidebar-active');
    } else if (infoBar) {
        infoBar.classList.remove('sidebar-active');
    }

    if (uiTimer) {
        clearTimeout(uiTimer);
        uiTimer = null;
    }
    clearSidebarInactivityTimer();
    clearPlayerChromeIdleTimer();
    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
        overlayTimeout = null;
    }

}

/**
 * Focus on a specific category item
 * This properly sets both DOM focus and active class
 */
function focusCategoryItem(index) {
    if (index < 0 || index >= sidebarState.categories.length) return;

    sidebarState.categoryIndex = index;

    // Keep focus visuals exclusive: clear channel active state when category gets focus.
    _getSidebarChannels().forEach(function (chItem) {
        chItem.classList.remove('active');
    });

    var items = _getSidebarCategories();
    items.forEach(function (item, i) {
        if (i === index) {
            item.classList.add('active');
            // CRITICAL: Call .focus() to update document.activeElement
            item.focus();

            // Ensure item is fully visible
            requestAnimationFrame(function () {
                item.scrollIntoView({
                    behavior: 'auto',
                    block: 'nearest',
                    inline: 'nearest'
                });
            });
        } else {
            item.classList.remove('active');
        }
    });

}

/**
 * Focus on a specific channel item
 * This properly sets both DOM focus and active class
 */
function focusChannelItem(index, optSidebarCategoryIndex) {
    var items = _getSidebarChannels();
    var target = null;

    if (typeof optSidebarCategoryIndex === 'number' && optSidebarCategoryIndex >= 0) {
        for (var t = 0; t < items.length; t++) {
            var el = items[t];
            var ds = el.dataset || {};
            if (parseInt(ds.sidebarCategoryIndex, 10) === optSidebarCategoryIndex &&
                parseInt(ds.channelIndex, 10) === index) {
                target = el;
                break;
            }
        }
    }

    if (!target && items.length > 0) {
        if (typeof optSidebarCategoryIndex !== 'number' || optSidebarCategoryIndex < 0) {
            if (index >= 0 && index < items.length) target = items[index];
        }
    }

    if (!target) return;

    sidebarState.channelIndex = index;
    if (typeof optSidebarCategoryIndex === 'number' && optSidebarCategoryIndex >= 0) {
        sidebarState.categoryIndex = optSidebarCategoryIndex;
    }
    if (isSidebarCategoryExpanded(sidebarState.categoryIndex)) {
        rememberCategoryChannelIndex(sidebarState.categoryIndex, index);
    }
    if (typeof optSidebarCategoryIndex === 'number' && optSidebarCategoryIndex >= 0) {
        sidebarState.channels = getChannelsForCategoryAtIndex(optSidebarCategoryIndex);
    } else if (!sidebarState.categories.length) {
        sidebarState.channels = getFilteredChannelsByLanguage().slice();
        if (isAllSidebarContext()) applySidebarChannelSort();
    } else {
        sidebarState.channels = getChannelsForCategoryAtIndex(sidebarState.categoryIndex);
    }

    _getSidebarCategories().forEach(function (catItem) {
        catItem.classList.remove('active');
    });

    items.forEach(function (item) {
        item.classList.remove('active');
    });

    target.classList.add('active');
    target.focus();

    // Load deferred logo when the row becomes active.
    if (target && target.dataset && target.dataset.deferredLogoUrl) {
        var logoDiv = target.querySelector('.channel-item-logo');
        if (logoDiv && !logoDiv.querySelector('img')) {
            var deferredLogoImg = document.createElement('img');
            deferredLogoImg.alt = target.dataset.deferredLogoAlt || 'Channel';
            deferredLogoImg.loading = 'lazy';
            deferredLogoImg.decoding = 'async';
            deferredLogoImg.crossOrigin = 'anonymous';
            deferredLogoImg.addEventListener('error', function () {
                this.style.display = 'none';
            }, { once: true });

            var deferredLogoUrl = target.dataset.deferredLogoUrl;
            var globallyCached = (typeof BBNL_API !== 'undefined' && BBNL_API.isImageCached && BBNL_API.isImageCached(deferredLogoUrl));
            if (_logoCache[deferredLogoUrl] || globallyCached) {
                if (!_logoCache[deferredLogoUrl]) _logoCache[deferredLogoUrl] = true;
                deferredLogoImg.src = _logoSourceCache[deferredLogoUrl] || deferredLogoUrl;
            } else if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(deferredLogoImg, deferredLogoUrl, { priority: false });
            } else {
                deferredLogoImg.src = deferredLogoUrl;
            }

            deferredLogoImg.addEventListener('load', function () {
                _logoCache[deferredLogoUrl] = true;
                _logoSourceCache[deferredLogoUrl] = this.src || deferredLogoUrl;
                var placeholder = logoDiv.querySelector('.logo-placeholder');
                if (placeholder) placeholder.style.display = 'none';
                if (typeof BBNL_API !== 'undefined' && BBNL_API.markImageCached) {
                    BBNL_API.markImageCached(deferredLogoUrl);
                }
            }, { once: true });

            logoDiv.appendChild(deferredLogoImg);
        }
    }

    requestAnimationFrame(function () {
        target.scrollIntoView({
            behavior: 'auto',
            block: 'nearest',
            inline: 'nearest'
        });
    });

}

/**
 * Sidebar remote map (production):
 * LEFT/RIGHT — cycle language (◄ label ►), any focus row in sidebar
 * UP/DOWN    — language row ↔ categories; categories ↔ channels (inline list)
 * OK (13)    — expand category + focus channels, or play focused channel
 * BACK/ESC   — close sidebar (player BACK again exits — see handleKeydown)
 * CH±        — zap channel while menu open (sidebar state realigns after changeChannel)
 */
// Cached DOM collections for sidebar — avoids querySelectorAll on every keypress.
// Invalidated when sidebar content changes (renderSidebarCategories/renderSidebarChannels).
var _cachedSidebarCategories = null;
var _cachedSidebarChannels = null;

function _getSidebarCategories() {
    if (!_cachedSidebarCategories || _cachedSidebarCategories.length === 0) {
        _cachedSidebarCategories = Array.from(document.querySelectorAll('.category-item'));
    }
    return _cachedSidebarCategories;
}
function _getSidebarChannels() {
    if (!_cachedSidebarChannels || _cachedSidebarChannels.length === 0) {
        _cachedSidebarChannels = Array.from(document.querySelectorAll('.channel-item'));
    }
    return _cachedSidebarChannels;
}

function handleSidebarKeydown(e) {
    if (!sidebarState.isOpen) {
        // EXTRA SAFEGUARD: If sidebar is closed, ensure no sidebar element has focus
        // This handles edge cases where focus might remain on sidebar after close
        var activeEl = document.activeElement;
        var sidebar = document.getElementById('playerSidebar');
        if (activeEl && sidebar && sidebar.contains(activeEl)) {
            activeEl.blur();
        }
        return false;
    }

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

    // LEFT/RIGHT always cycle language (◄ All / Subscribed / Tamil / … ►) from any sidebar focus.
    // Focus and category/channel indices come from buildCategoriesForLanguage() + restoreCurrentLanguageUiState();
    // Do not force categoryIndex = 0 here — that overwrote restored state after language change.
    if (code === 37 || code === 39) {
        if (code === 37) {
            changeLanguage(-1);
        } else {
            changeLanguage(1);
        }
        e.preventDefault();
        return true;
    }

    // ==========================================
    // LANGUAGE NAVIGATION ARROWS
    // ==========================================
    if (isOnLanguageArrow) {
        switch (code) {
            case 38: // UP
                // Stay at language (top of sidebar)
                e.preventDefault();
                handled = true;
                break;

            case 13: // OK on ◄ / ► — same as click: change language
                if (activeEl && activeEl.id === 'langNavLeft') changeLanguage(-1);
                else if (activeEl && activeEl.id === 'langNavRight') changeLanguage(1);
                e.preventDefault();
                handled = true;
                break;

            case 40: // DOWN — enter list below (categories or flat channel list)
                {
                    var categoriesSection2 = document.getElementById('sidebarCategoriesSection');
                    var categoriesHidden2 = categoriesSection2 && categoriesSection2.style.display === 'none';

                    if (!categoriesHidden2 && sidebarState.categories.length > 0) {
                        sidebarState.currentLevel = 'categories';
                        sidebarState.categoryIndex = 0;
                        focusCategoryItem(0);
                    } else if (categoriesHidden2 && sidebarState.channels && sidebarState.channels.length > 0) {
                        sidebarState.currentLevel = 'channels';
                        sidebarState.channelIndex = Math.max(0, Math.min(sidebarState.channelIndex, sidebarState.channels.length - 1));
                        focusChannelItem(sidebarState.channelIndex);
                    } else {
                        var leftArrow2 = document.getElementById('langNavLeft');
                        if (leftArrow2) leftArrow2.focus();
                    }
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
        var categories = _getSidebarCategories();
        var currentCatIndex = categories.findIndex(function (el) { return el === activeEl; });
        if (currentCatIndex === -1) currentCatIndex = sidebarState.categoryIndex;
        var categoryCount = categories.length;
        var shouldUseSortHotkeys = isSubscribedSidebarContext() && categoryCount <= 1;

        switch (code) {
            case 38: // UP
                if (shouldUseSortHotkeys) {
                    sidebarState.channelSortOrder = 'asc';
                    filterChannelsByCategory();
                    renderCategoriesList();
                    renderChannelsList();
                    focusCategoryItem(currentCatIndex);
                    e.preventDefault();
                    handled = true;
                    break;
                }
                if (currentCatIndex > 0) {
                    var prevIdx = currentCatIndex - 1;
                    var prevChansUp = getChannelsForCategoryAtIndex(prevIdx);
                    if (isSidebarCategoryExpanded(prevIdx) && prevChansUp.length > 0) {
                        // After DOWN from last channel landed on next category row: UP must go back into
                        // the previous category's channel list (last item), not stop on its header only.
                        sidebarState.currentLevel = 'channels';
                        sidebarState.categoryIndex = prevIdx;
                        sidebarState.channels = prevChansUp;
                        var lastCh = prevChansUp.length - 1;
                        sidebarState.channelIndex = lastCh;
                        focusChannelItem(lastCh, prevIdx);
                    } else {
                        sidebarState.categoryIndex = prevIdx;
                        sidebarState.currentLevel = 'categories';
                        focusCategoryItem(prevIdx);
                    }
                } else {
                    // At first category, move to language arrow
                    var leftArrow = document.getElementById('langNavLeft');
                    if (leftArrow) leftArrow.focus();
                }
                e.preventDefault();
                handled = true;
                break;

            case 40: // DOWN
                if (shouldUseSortHotkeys) {
                    sidebarState.channelSortOrder = 'desc';
                    filterChannelsByCategory();
                    renderCategoriesList();
                    renderChannelsList();
                    focusCategoryItem(currentCatIndex);
                    e.preventDefault();
                    handled = true;
                    break;
                }

                // DOWN from category: if it's already expanded, return to its first channel (smooth re-entry)
                // If not expanded, move focus to next category
                if (isSidebarCategoryExpanded(currentCatIndex) &&
                    getChannelsForCategoryAtIndex(currentCatIndex).length > 0) {
                    sidebarState.currentLevel = 'channels';
                    sidebarState.categoryIndex = currentCatIndex;
                    sidebarState.channels = getChannelsForCategoryAtIndex(currentCatIndex);
                    sidebarState.channelIndex = 0;
                    focusChannelItem(0, currentCatIndex);
                    handled = true;
                } else {
                    if (categoryCount > 0) {
                        var downCatIdx = (currentCatIndex + 1) % categoryCount;
                        sidebarState.categoryIndex = downCatIdx;
                        sidebarState.currentLevel = 'categories';
                        focusCategoryItem(downCatIdx);
                        handled = true;
                    }
                }
                e.preventDefault();
                break;

            case 13: // ENTER
                // Select category explicitly and show its channels.
                selectCategory(currentCatIndex, false);
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
        var channels = _getSidebarChannels();
        var flatPos = channels.indexOf(activeEl);
        if (flatPos < 0) flatPos = 0;

        var ds0 = activeEl && activeEl.dataset ? activeEl.dataset : {};
        var rowCat = (ds0.sidebarCategoryIndex !== undefined && ds0.sidebarCategoryIndex !== '')
            ? parseInt(ds0.sidebarCategoryIndex, 10) : -1;
        var rowCh = parseInt(ds0.channelIndex, 10);
        if (isNaN(rowCh)) rowCh = 0;

        var categoriesSection = document.getElementById('sidebarCategoriesSection');
        var categoriesHidden = categoriesSection && categoriesSection.style.display === 'none';

        switch (code) {
            case 38: // UP — per-category: top channel → that category row (not previous category's list)
                if (rowCat >= 0) {
                    if (rowCh > 0) {
                        focusChannelItem(rowCh - 1, rowCat);
                    } else {
                        if (categoriesHidden) {
                            var leftArrow2 = document.getElementById('langNavLeft');
                            if (leftArrow2) leftArrow2.focus();
                        } else {
                            sidebarState.currentLevel = 'categories';
                            focusCategoryItem(rowCat);
                        }
                    }
                } else if (flatPos > 0) {
                    var prevEl = channels[flatPos - 1];
                    var pds = prevEl.dataset || {};
                    var pCat = (pds.sidebarCategoryIndex !== undefined && pds.sidebarCategoryIndex !== '')
                        ? parseInt(pds.sidebarCategoryIndex, 10) : -1;
                    var pCh = parseInt(pds.channelIndex, 10);
                    if (isNaN(pCh)) pCh = 0;
                    if (pCat >= 0) focusChannelItem(pCh, pCat);
                    else focusChannelItem(pCh);
                } else {
                    if (categoriesHidden) {
                        var leftArrow = document.getElementById('langNavLeft');
                        if (leftArrow) leftArrow.focus();
                    } else {
                        sidebarState.currentLevel = 'categories';
                        var upCat = rowCat >= 0 ? rowCat : sidebarState.categoryIndex;
                        focusCategoryItem(upCat >= 0 ? upCat : 0);
                    }
                }
                e.preventDefault();
                handled = true;
                break;

            case 40: // DOWN
                if (flatPos < channels.length - 1) {
                    var nextEl = channels[flatPos + 1];
                    var nds = nextEl.dataset || {};
                    var nCat = (nds.sidebarCategoryIndex !== undefined && nds.sidebarCategoryIndex !== '')
                        ? parseInt(nds.sidebarCategoryIndex, 10) : -1;
                    var nCh = parseInt(nds.channelIndex, 10);
                    if (isNaN(nCh)) nCh = 0;
                    if (nCat >= 0) focusChannelItem(nCh, nCat);
                    else focusChannelItem(nCh);
                } else if (!categoriesHidden) {
                    var fromCat = rowCat >= 0 ? rowCat : sidebarState.categoryIndex;
                    var nextCategoryIndex = fromCat + 1;
                    sidebarState.currentLevel = 'categories';
                    if (nextCategoryIndex < sidebarState.categories.length) {
                        sidebarState.categoryIndex = nextCategoryIndex;
                        focusCategoryItem(nextCategoryIndex);
                        saveCurrentLanguageUiState();
                    } else {
                        focusCategoryItem(fromCat >= 0 ? fromCat : sidebarState.categoryIndex);
                    }
                }
                e.preventDefault();
                handled = true;
                break;

            case 13: // ENTER — play (resolve row when multiple categories expanded)
                var channelToPlay = null;
                if (rowCat >= 0) {
                    var arr = getChannelsForCategoryAtIndex(rowCat);
                    channelToPlay = arr[rowCh];
                } else if (sidebarState.channels.length > rowCh && rowCh >= 0) {
                    channelToPlay = sidebarState.channels[rowCh];
                }
                if (channelToPlay) playChannelFromSidebar(channelToPlay);
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
    // FALLBACK: No specific element focused
    // Force focus to channels or categories based on current level
    // ==========================================
    if (!handled && (code === 38 || code === 40 || code === 37 || code === 39 || code === 13)) {

        var categoriesSection = document.getElementById('sidebarCategoriesSection');
        var categoriesHidden = categoriesSection && categoriesSection.style.display === 'none';

        if (sidebarState.currentLevel === 'channels' || categoriesHidden) {
            var chArr = _getSidebarChannels();
            if (chArr.length > 0) {
                if (!categoriesHidden && sidebarState.categories.length > 0) {
                    var cib = Math.max(0, Math.min(sidebarState.categoryIndex, sidebarState.categories.length - 1));
                    var mc = getChannelsForCategoryAtIndex(cib).length;
                    var idx2 = Math.max(0, Math.min(sidebarState.channelIndex, Math.max(0, mc - 1)));
                    sidebarState.channelIndex = idx2;
                    focusChannelItem(idx2, cib);
                } else {
                    var idx = Math.max(0, Math.min(sidebarState.channelIndex, chArr.length - 1));
                    sidebarState.channelIndex = idx;
                    focusChannelItem(idx);
                }
                handled = true;
            }
        } else {
            // Focus current category
            var catArr2 = _getSidebarCategories();
            if (catArr2.length > 0) {
                var idx = Math.max(0, Math.min(sidebarState.categoryIndex, catArr2.length - 1));
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
    showBufferingIndicator();
    hidePageLoadingOverlay();

    _committedNavigationFromSidebarOpen = true;
    applySidebarLanguageToZapListAndSession(channel);

    var wasAllChannelsContext = isAllSidebarContext();
    var prevLanguageIndex = sidebarState.languageIndex;
    var prevExpandedCategories = Object.assign({}, sidebarState.expandedCategories || {});
    var prevCategoryIndex = sidebarState.categoryIndex;
    var prevLevel = sidebarState.currentLevel;


    // Dismiss error popup if open before trying new channel
    if (playerErrorPopupOpen) {
        hidePlayerErrorPopup();
    }

    // Play the selected channel
    setupPlayer(channel);

    // Sync sidebar after starting playback so Enter response remains snappy.
    requestAnimationFrame(function () {
        syncSidebarWithCurrentPlayback(true);

        // Keep sidebar stable after channel selection.
        if (!sidebarState || !sidebarState.isOpen) return;

        // Preserve user-selected language/subscription context after OK playback.
        if (prevLanguageIndex >= 0 && prevLanguageIndex < sidebarState.languages.length && sidebarState.languageIndex !== prevLanguageIndex) {
            sidebarState.languageIndex = prevLanguageIndex;
            updateLanguageDisplay();
            buildCategoriesForLanguage();
        }

        if (wasAllChannelsContext) {
            // In All Channels mode, avoid rebuilding category DOM (it's hidden/empty).
            sidebarState.channels = getFilteredChannelsByLanguage().slice();
            if (isAllSidebarContext()) applySidebarChannelSort();
            renderChannelsList();

            var idxAll = findCurrentChannelInSidebar();
            sidebarState.channelIndex = idxAll >= 0 ? idxAll : Math.max(0, Math.min(sidebarState.channelIndex, Math.max(0, sidebarState.channels.length - 1)));
            sidebarState.currentLevel = 'channels';
            focusChannelItem(sidebarState.channelIndex);
            return;
        }

        sidebarState.expandedCategories = Object.assign({}, prevExpandedCategories);
        renderCategoriesList();
        renderChannelsList();

        var catPlay = getCurrentPlayingCategoryIndex();
        if (catPlay >= 0) {
            sidebarState.categoryIndex = catPlay;
            sidebarState.channels = getChannelsForCategoryAtIndex(catPlay);
            var idx = findCurrentChannelInSidebar();
            sidebarState.channelIndex = idx >= 0 ? idx : Math.max(0, Math.min(sidebarState.channelIndex, Math.max(0, sidebarState.channels.length - 1)));
            sidebarState.currentLevel = 'channels';
            focusChannelItem(sidebarState.channelIndex, catPlay);
        } else {
            sidebarState.categoryIndex = Math.max(0, Math.min(prevCategoryIndex, Math.max(0, sidebarState.categories.length - 1)));
            sidebarState.currentLevel = (prevLevel === 'channels') ? 'categories' : prevLevel;
            focusCategoryItem(sidebarState.categoryIndex);
        }
    });

    // Show BOTH sidebar + info bar together for 5 seconds
    // Sidebar is already open, now show info bar alongside it
    if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
    var overlay = _overlayEl;
    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
    var infoBar = _infoBarEl;

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

    uiTimer = setTimeout(function () {
        hidePlayerUI();
    }, PLAYER_CHROME_IDLE_MS);

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

var _lastKeyTime = 0;
var _KEY_THROTTLE_MS = 40; // reduced from 120ms — real TV remotes already have 50-100ms RF lag

function handleKeydown(e) {
    var code;
    try { code = e.keyCode; } catch (_) { return; }

    // Throttle navigation keys (arrows, OK, CH+/-) to prevent UI flood.
    // Volume, BACK, and number keys are exempt (must always respond instantly).
    var isNav = (code >= 37 && code <= 40) || code === 13 || code === 33 || code === 34 || code === 427 || code === 428;
    if (isNav) {
        var now = Date.now();
        if (now - _lastKeyTime < _KEY_THROTTLE_MS) { e.preventDefault(); return; }
        _lastKeyTime = now;
    }

    var infoBarVisible = isInfoBarVisible();

    if (playerErrorPopupOpen) {
        resetPlayerErrorUiTimer();
    }

    // When channel number input is open, let the input field handle keys.
    // Only intercept BACK (to close) and number keys (direct entry via remote).
    if (isNumpadOpen()) {
        if (code === 10009 || code === 27) {
            e.preventDefault();
            channelNumberBuffer = '';
            hideChannelNumberInput();
            return;
        }
        // Number keys on remote: feed directly into the input field
        if ((code >= 48 && code <= 57) || (code >= 96 && code <= 105)) {
            e.preventDefault();
            var d = (code >= 96) ? String(code - 96) : String(code - 48);
            handleNumberInput(d);
            return;
        }
        // Allow all other keys (arrows, OK) to pass through to the native input/keypad
        return;
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
            } else {
                hidePlayerErrorPopup();
                // Info bar stays visible (no auto-hide) — hidePlayerErrorPopup handles this
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
            hidePlayerErrorPopup();
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
            return;
        }

        // If sidebar is closed, exit player
        closePlayer();
        // Brief wait for Samsung TV hardware to release decoder before navigating
        setTimeout(function () {
            window.__BBNL_NAVIGATING = true;

            // Priority 1: Use explicit player referrer if available
            var referrer = sessionStorage.getItem('playerReferrer');
            if (referrer && (referrer.indexOf('home.html') !== -1 || referrer.indexOf('channels.html') !== -1 || referrer.indexOf('settings.html') !== -1)) {
                window.location.replace(referrer);
            }
            // Priority 2: Fallback to history
            else if (window.history.length > 1) {
                window.history.back();
            }
            // Priority 3: Default to home or channels
            else {
                window.location.replace('home.html');
            }
        }, 80);
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
            return; // navigateToChannelNumber manages buffer and overlay
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
                    break;
                case 448: // VolumeDown
                    tizen.tvaudiocontrol.setVolumeDown();
                    currentVolume = tizen.tvaudiocontrol.getVolume();
                    showVolumeIndicator(currentVolume);
                    break;
                case 449: // VolumeMute
                    isMuted = !isMuted;
                    tizen.tvaudiocontrol.setMute(isMuted);
                    showVolumeIndicator(isMuted ? 0 : currentVolume, isMuted);
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

// Create buffering indicator ONCE, reuse by show/hide
var _bufferingEl = null;

function showBufferingIndicator() {
    hasHiddenLoadingIndicator = false;
    if (playerErrorPopupOpen) return;

    if (!_bufferingEl) {
        var container = document.getElementById('player-container');
        if (!container) return;
        if (!document.getElementById('spinner-styles')) {
            var style = document.createElement('style');
            style.id = 'spinner-styles';
            style.textContent = '.spinner{border:4px solid rgba(255,255,255,0.3);border-top:4px solid #fff;border-radius:50%;width:40px;height:40px;animation:spin 0.8s linear infinite;margin:0 auto}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}';
            document.head.appendChild(style);
        }
        _bufferingEl = document.createElement('div');
        _bufferingEl.id = 'buffering-indicator';
        _bufferingEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);color:white;display:none;flex-direction:column;align-items:center;justify-content:center;z-index:9997;';
        _bufferingEl.innerHTML = '<div class="spinner"></div><div style="font-size:18px;font-weight:600;margin-top:16px;">Loading Stream...</div>';
        container.appendChild(_bufferingEl);
    }
    _bufferingEl.style.display = 'flex';
}

function hideBufferingIndicator() {
    if (_bufferingEl) _bufferingEl.style.display = 'none';
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
var CHANNEL_INPUT_DELAY = 2500; // Auto-navigate after 2.5s of inactivity (Samsung TV remote friendly)
var PLAYER_CHANNEL_INPUT_GRACE_MS = 3000; // 3-second grace period (fast response) for TV keypad input
var playerChannelSearchTimeout = null; // Grace timer for search

function resetChannelInputTimer() {
    if (channelInputTimeout) {
        clearTimeout(channelInputTimeout);
        channelInputTimeout = null;
    }
    // Auto-navigate when user stops pressing digits (no OK button needed)
    if (channelNumberBuffer.length > 0 && CHANNEL_INPUT_DELAY > 0) {
        channelInputTimeout = setTimeout(function () {
            if (channelNumberBuffer.length > 0) {
                navigateToChannelNumber(channelNumberBuffer);
            }
        }, CHANNEL_INPUT_DELAY);
    }
}

/**
 * Handle number key input (remote number keys) for direct channel navigation
 */
function handleNumberInput(digit) {
    var nextValue = String(channelNumberBuffer + digit).replace(/\D/g, '').slice(0, 4);
    // Ignore overflow digits once 4 digits are already entered.
    if (nextValue === channelNumberBuffer && channelNumberBuffer.length >= 4) {
        return;
    }
    channelNumberBuffer = nextValue;
    showChannelNumberInput(channelNumberBuffer);

    // Start search with grace period at 4 digits (same as Home page)
    // Grace period allows time for TV keypad input completion
    if (channelNumberBuffer.length >= 4) {
        if (channelInputTimeout) {
            clearTimeout(channelInputTimeout);
            channelInputTimeout = null;
        }
        navigateToChannelNumber(channelNumberBuffer);
        return;
    }

    resetChannelInputTimer();
}

/**
 * Returns true when the channel number input overlay is visible
 */
var _numpadEl = null;
function isNumpadOpen() {
    if (!_numpadEl) _numpadEl = document.getElementById('channel-number-input');
    return !!(_numpadEl && _numpadEl.style.display !== 'none');
}

/**
 * Show channel number input and focus the field to trigger Samsung native keypad.
 * Same pattern as login page: type="tel" inputmode="numeric" readOnly=false + focus().
 */
function showChannelNumberInput(number) {
    var pad = document.getElementById('channel-number-input');
    if (!pad) return;
    var field = document.getElementById('channel-number-field');
    pad.style.display = 'flex';
    if (field) {
        field.value = number || '';
        field.readOnly = false;
        field.focus();
    }
}

/**
 * Hide channel number input and close Samsung native keypad
 */
function hideChannelNumberInput() {
    var pad = document.getElementById('channel-number-input');
    if (pad) pad.style.display = 'none';
    var field = document.getElementById('channel-number-field');
    if (field) { field.blur(); field.value = ''; }
}

/**
 * Navigate to channel by number
 * Called from handleNumberInput when 4 digits reached
 * Uses HOME pattern: grace period timer, then search
 */
function navigateToChannelNumber(number) {
    // Cancel any pending timer
    if (channelInputTimeout) {
        clearTimeout(channelInputTimeout);
        channelInputTimeout = null;
    }

    // Cancel any pending search timer
    if (playerChannelSearchTimeout) {
        clearTimeout(playerChannelSearchTimeout);
        playerChannelSearchTimeout = null;
    }

    // Use same grace period as Home page (6 seconds)
    // This gives time for user to complete TV keypad input
    playerChannelSearchTimeout = setTimeout(function () {
        var lcn = parseInt(number, 10);
        playChannelByLCNFromPlayer(lcn);
    }, PLAYER_CHANNEL_INPUT_GRACE_MS);
}

/**
 * Play channel by LCN (Local Channel Number) from Player
 * Searches in FULL channel list (all channels, subscribed + unsubscribed)
 * Plays directly in Player, no page navigation
 * Fast response with 3-second grace period for TV keypad input
 */
function playChannelByLCNFromPlayer(lcn) {
    // Use unfiltered list to search ALL channels (including unsubscribed)
    var searchList = (_allChannelsUnfiltered && _allChannelsUnfiltered.length > 0) ? _allChannelsUnfiltered : allChannels;

    if (!searchList || searchList.length === 0) {
        // No channels loaded yet - show error toast
        showChannelNotFoundToast("Channel Not Found");
        return;
    }

    // Search in FULL channel list (subscribed + unsubscribed)
    var channel = searchList.find(function (ch) {
        var chNo = parseInt(ch.channelno || ch.urno || ch.chno || ch.ch_no || 0, 10);
        return chNo === lcn;
    });

    if (channel) {
        // Found in full list - play immediately in Player (no navigation)
        channelNumberBuffer = '';
        hideChannelNumberInput();
        setupPlayer(channel);
    } else {
        // Not found in any category - show error toast
        // User can try another channel number
        showChannelNotFoundToast("Channel Not Found");
    }
}

/**
 * Show channel not found toast notification (same format as Home page)
 * Auto-clears input and allows user to try another channel
 */
function showChannelNotFoundToast(msg) {
    // Clear channel input and hide numpad
    channelNumberBuffer = '';
    hideChannelNumberInput();

    // Remove existing toast if any
    var existing = document.getElementById('player-search-toast');
    if (existing) existing.remove();

    // Create toast notification (same style as Home page)
    var toast = document.createElement('div');
    toast.id = 'player-search-toast';
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);' +
        'background:rgba(18,18,18,0.98);color:#ffffff;font-size:22px;font-weight:700;' +
        'padding:16px 40px;border-radius:12px;border:2px solid #ff6b6b;z-index:9999;' +
        'white-space:nowrap;pointer-events:none;text-align:center;';
    document.body.appendChild(toast);

    // Auto-remove after 3 seconds (same as Home page)
    setTimeout(function () {
        if (toast.parentNode) toast.remove();
    }, 3000);
}

// ==========================================
// OVERLAY AUTO-HIDE/SHOW FUNCTIONALITY
// ==========================================
// Note: overlayTimeout and OVERLAY_HIDE_DELAY are declared at top with sidebar timers

function syncInfoBarSidebarState() {
    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
    var infoBar = _infoBarEl;
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
    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
    if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
    if (_infoBarEl) {
        _infoBarEl.classList.remove('info-bar-hidden');
        syncInfoBarSidebarState();
    }
    if (_overlayEl) {
        _overlayEl.classList.remove('hidden');
        _overlayEl.classList.add('visible');
    }
}

/**
 * Show info bar overlay and set auto-hide timer
 * Resets timer on each call (for OK button or channel change)
 */
// Cache overlay elements — avoid querySelector on every channel switch
var _overlayEl = null;
var _infoBarEl = null;
var _uiChName = null;
var _uiChNum = null;
var _keepInfoBarVisible = false; // Temporary flag to keep info bar visible when explicitly needed
/** After BACK on unsubscribed popup: do not hide overlay/info (black screen) until user changes channel or plays */
var _keepChromeAfterErrorBack = false;

function showOverlay() {
    if (!_lastAttemptedChannel) return;

    if (sidebarState.isOpen) {
        syncInfoBarSidebarState();
        schedulePlayerChromeIdleHide();
        return;
    }

    if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');

    if (_overlayEl) {
        _overlayEl.classList.remove('hidden');
        _overlayEl.classList.add('visible');
    }

    if (_infoBarEl) {
        _infoBarEl.classList.remove('info-bar-hidden');
        syncInfoBarSidebarState();
    }

    // Clear existing timeout
    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
        overlayTimeout = null;
    }

    if (hasHiddenLoadingIndicator && !_keepInfoBarVisible && !INFO_BAR_PERSISTENT) {
        overlayTimeout = setTimeout(function () {
            hideOverlay();
        }, OVERLAY_HIDE_DELAY);
    }

    schedulePlayerChromeIdleHide();
}

/**
 * Hide info bar overlay
 */
function hideOverlay() {
    if (playerErrorPopupOpen) return;
    if (_keepChromeAfterErrorBack) return;

    if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');

    if (_overlayEl) {
        _overlayEl.classList.remove('visible');
        _overlayEl.classList.add('hidden');
        if (overlayTimeout) {
            clearTimeout(overlayTimeout);
            overlayTimeout = null;
        }
    }

    if (_infoBarEl) {
        _infoBarEl.classList.add('info-bar-hidden');
        syncInfoBarSidebarState();
    }

}

function isInfoBarVisible() {
    if (!_infoBarEl) _infoBarEl = document.querySelector('.info-bar-premium');
    return !!(_infoBarEl && !_infoBarEl.classList.contains('info-bar-hidden'));
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
    if (!_overlayEl) _overlayEl = document.querySelector('.player-overlay');
    var overlay = _overlayEl;
    if (!overlay) return;

    if (overlay.classList.contains('visible')) {
        // Already visible - reset the auto-hide timer ONLY if not persistent
        if (overlayTimeout) {
            clearTimeout(overlayTimeout);
            overlayTimeout = null;
        }
        if (!INFO_BAR_PERSISTENT) {
            overlayTimeout = setTimeout(function () {
                hideOverlay();
            }, OVERLAY_HIDE_DELAY);
        }
    } else {
        // Hidden or initial state - show the info bar
        showOverlay();
    }
};

// Keep mouse/touch interactions refreshing info bar visibility.
document.addEventListener('mousemove', showOverlay);
document.addEventListener('click', showOverlay);
// NOTE: showOverlay() is called from inside setupPlayer() once channel info is populated

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
