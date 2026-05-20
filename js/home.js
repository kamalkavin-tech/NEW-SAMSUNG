/* ================================
BBNL IPTV - HOME PAGE SCRIPT
================================ */

var focusables = [];
var currentFocus = 0;
var exitPopupOpen = false; // Track if exit/logout popup is open
var homeSearchTimeout = null; // Timer for auto-play channel by number
var HOME_CHANNEL_INPUT_GRACE_MS = 6000; // Give enough time to finish entering LCN via TV keypad
var homeAdInterval = null; // Interval for ad rotation
var homeNetworkInterval = null; // Interval for network status updates
var homeSearchActivated = false; // Only activate keypad/editing on explicit action
var homeLanguageLogoCache = {}; // URL -> true
var homeLanguageLogoPrefetchInFlight = {}; // URL -> true
var homeAdImageCache = {}; // URL -> true
var _homeChannelsRenderSignature = '';

// CI-08: data-URI cache for language logos so home revisits paint instantly
// without a network fetch. Persists across page navigations via sessionStorage.
// Keyed on the original (post-normalised) image URL.
var _LANG_LOGO_DATAURL_KEY = 'bbnl_lang_logo_dataurl_v1';
var _langLogoDataUrlCache = (function () {
    try {
        var raw = sessionStorage.getItem(_LANG_LOGO_DATAURL_KEY);
        if (raw) {
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') return parsed;
        }
    } catch (e) {}
    return {};
})();
var _langLogoDataUrlInFlight = {};

function _getLangLogoDataUrl(originalUrl) {
    if (!originalUrl) return '';
    return _langLogoDataUrlCache[originalUrl] || '';
}

function _saveLangLogoDataUrl(originalUrl, dataUrl) {
    if (!originalUrl || !dataUrl) return;
    _langLogoDataUrlCache[originalUrl] = dataUrl;
    try {
        sessionStorage.setItem(_LANG_LOGO_DATAURL_KEY, JSON.stringify(_langLogoDataUrlCache));
    } catch (e) {
        // sessionStorage quota exceeded — drop oldest entry and retry once.
        try {
            var keys = Object.keys(_langLogoDataUrlCache);
            if (keys.length > 0) {
                delete _langLogoDataUrlCache[keys[0]];
                sessionStorage.setItem(_LANG_LOGO_DATAURL_KEY, JSON.stringify(_langLogoDataUrlCache));
            }
        } catch (e2) {}
    }
}

function _fetchAndCacheLangLogoDataUrl(originalUrl) {
    if (!originalUrl) return;
    if (_langLogoDataUrlCache[originalUrl]) return;
    if (_langLogoDataUrlInFlight[originalUrl]) return;
    if (typeof fetch !== 'function' || typeof FileReader !== 'function') return;
    _langLogoDataUrlInFlight[originalUrl] = true;
    fetch(originalUrl, { mode: 'cors', credentials: 'omit', cache: 'force-cache' })
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
        })
        .then(function (blob) {
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(reader.result); };
                reader.onerror = function () { reject(new Error('FileReader failed')); };
                reader.readAsDataURL(blob);
            });
        })
        .then(function (dataUrl) {
            _saveLangLogoDataUrl(originalUrl, dataUrl);
            delete _langLogoDataUrlInFlight[originalUrl];
        })
        .catch(function () {
            delete _langLogoDataUrlInFlight[originalUrl];
        });
}

function primeHomeAds(ads, maxCount) {
    if (!Array.isArray(ads) || ads.length === 0) return;
    var limit = Math.min(maxCount || 5, ads.length);
    for (var i = 0; i < limit; i++) {
        var ad = ads[i] || {};
        var url = normalizeHomeAssetUrl(ad.adpath || '');
        var globalAdCached = typeof BBNL_API !== 'undefined' && BBNL_API.isImageCached && BBNL_API.isImageCached(url);
        if (!url || homeAdImageCache[url] || globalAdCached) continue;
        var img = new Image();
        img.onload = function () {
            homeAdImageCache[this.src] = true;
            if (typeof BBNL_API !== 'undefined' && BBNL_API.markImageCached) BBNL_API.markImageCached(this.src);
        };
        img.onerror = function () {
            this.removeAttribute('src');
            this.style.display = 'none';
        };
        if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
            BBNL_API.setImageSource(img, url);
        } else {
            img.src = url;
        }
    }
}

function getHomeLanguageLogoUrl(lang) {
    if (!lang || typeof lang !== 'object') return '';
    var candidates = [
        lang.langlogo,
        lang.chnllanglogo,
        lang.logo_url,
        lang.logo,
        lang.image,
        lang.img
    ];
    for (var i = 0; i < candidates.length; i++) {
        var value = candidates[i];
        if (value === null || value === undefined) continue;
        var str = String(value).trim();
        if (str) {
            if (typeof BBNL_API !== 'undefined' && BBNL_API.getValidatedImageUrl) {
                return BBNL_API.getValidatedImageUrl(str);
            }
            return normalizeHomeAssetUrl(str);
        }
    }
    return '';
}

function normalizeHomeAssetUrl(rawUrl) {
    if (rawUrl === null || rawUrl === undefined) return '';
    var value = String(rawUrl).trim();
    if (!value) return '';

    if (typeof BBNL_API !== 'undefined' && BBNL_API.resolveAssetUrl) {
        return BBNL_API.resolveAssetUrl(value);
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
    } catch (e) {}
    if (!preferredOrigin) preferredOrigin = appOrigin;

    // Fix API responses that still point to localhost on TV deployments.
    if (preferredOrigin) {
        value = value.replace(/^https?:\/\/(localhost|127\.0\.0\.1|124\.40\.244\.211|0\.0\.0\.0)(:\d+)?/i, preferredOrigin);
    }

    // Absolute URL
    if (/^https?:\/\//i.test(value)) {
        return value;
    }

    // Protocol-relative URL
    if (value.indexOf('//') === 0) {
        return window.location.protocol + value;
    }

    // Resolve root-relative and relative paths against API origin when possible.
    var baseUrl = apiBase || appOrigin;

    try {
        if (value.charAt(0) === '/' && preferredOrigin) {
            var baseOrigin = new URL(baseUrl, window.location.href).origin;
            return baseOrigin + value;
        }
        if (baseUrl) {
            return new URL(value, baseUrl + '/').href;
        }
    } catch (e) {
        // Fall through to raw string.
    }

    return value;
}

function extractFoFiLogoPath(response) {
    if (!response) {
        BBNLLogger.warn("[HOME] extractFoFiLogoPath: response is null/undefined");
        return '';
    }

    if (response.body && typeof response.body === 'object' && !Array.isArray(response.body)) {
        var bodyPath = response.body.logo_path || response.body.logo || response.body.logopath || response.body.path || '';
        if (bodyPath) {
            return String(bodyPath).trim();
        }
    }

    if (response.body && Array.isArray(response.body) && response.body.length > 0) {
        var first = response.body[0] || {};
        var listPath = first.logo_path || first.logo || first.logopath || first.path || '';
        if (listPath) return String(listPath).trim();
    }

    var directPath = response.logo_path || response.logo || response.logopath || response.path || '';
    if (directPath) return String(directPath).trim();
    
    BBNLLogger.warn("[HOME] extractFoFiLogoPath: no valid logo path found in API response");
    return '';
}

function showFoFiLogo(logoUrl, skipNormalize) {
    var logoImg = document.getElementById('fofitv-logo');
    var fallbackText = document.getElementById('brand-text-fallback');
    if (!logoImg) return false;

    // CRITICAL: Only normalize once. Cache stores raw API path, not normalized URL
    var resolved = skipNormalize ? logoUrl : normalizeHomeAssetUrl(logoUrl);
    if (!resolved) {
        BBNLLogger.debug("[HOME] Logo normalization returned empty path");
        return false;
    }

    var useCachedLogo = !!skipNormalize;

    // Validate URL structure before attempting to load
    if (!/^https?:\/\//.test(resolved)) {
        BBNLLogger.warn("[HOME] Logo URL is not a valid HTTP(S) URL: " + resolved.substring(0, 50));
        return false;
    }

    // Clear any existing retry attempts on this element
    try { logoImg.removeAttribute('data-img-retry-attempt'); } catch (e) {}
    logoImg.style.display = 'block';
    logoImg.style.visibility = 'hidden';
    logoImg.style.opacity = '0';

    var loadSucceeded = false;
    var timeoutId = null;

    // onerror: keep the logo hidden instead of flashing text fallback.
    logoImg.onerror = function () {
        loadSucceeded = false;
        if (timeoutId) clearTimeout(timeoutId);
        try { this.removeAttribute('src'); } catch (e) {}
        this.style.visibility = 'hidden';
        this.style.opacity = '0';
        if (fallbackText) fallbackText.style.display = 'none';
        BBNLLogger.debug("[HOME] Logo failed to load, leaving placeholder hidden");
    };

    // onload: mark cached and show image
    logoImg.onload = function () {
        loadSucceeded = true;
        if (timeoutId) clearTimeout(timeoutId);
        try {
            if (typeof BBNL_API !== 'undefined' && BBNL_API.markImageCached) BBNL_API.markImageCached(this.src);
        } catch (e) {}
        this.style.display = 'block';
        this.style.visibility = 'visible';
        this.style.opacity = '1';
        if (fallbackText) fallbackText.style.display = 'none';
        BBNLLogger.debug("[HOME] Logo loaded successfully: " + this.src.substring(0, 50));
    };

    // Set image source (prefer BBNL_API helper when available)
    if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
        BBNL_API.setImageSource(logoImg, resolved, { priority: true });
    } else {
        logoImg.src = resolved;
    }

    // If image hasn't loaded within timeout, show fallback (reduced to 2.5s for TV networks)
    timeoutId = setTimeout(function () {
        if (!loadSucceeded) {
            try { logoImg.removeAttribute('src'); } catch (e) {}
            logoImg.style.visibility = 'hidden';
            logoImg.style.opacity = '0';
            if (fallbackText) fallbackText.style.display = 'none';
            BBNLLogger.warn("[HOME] Logo load timeout after 2500ms, leaving placeholder hidden");
        }
    }, 2500);

    return true;
}

// Clean up background intervals when leaving page
// NOTE: Using 'pagehide' instead of 'beforeunload' to allow BFCache.
// 'beforeunload' actively blocks the browser's Back-Forward Cache,
// forcing full page rebuilds on every back-navigation.
// Clean up background intervals when leaving page
// NOTE: Using 'pagehide' instead of 'beforeunload' to allow BFCache.
window.addEventListener('pagehide', function () {
    // Persist basic UI state so returning to Home feels instant.
    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.savePageState) {
        AppPerformanceCache.savePageState('home', {
            focusIndex: currentFocus,
            searchText: '',
            scrollTop: window.scrollY || 0
        });
    }
});

// BFCache restoration: When user presses Back to return here,
// the browser may restore this page from memory (BFCache).
// In that case, skip all heavy initialization — page is already complete.
var _homePageInitialized = false;
window.addEventListener('pageshow', function (event) {
    if (event.persisted && _homePageInitialized) {
        // Page restored from BFCache — everything is still intact (DOM, JS variables, etc.)
        // No need to clear/restart intervals as browser manages them during BFCache.
        
        // Re-register remote keys (some TV models lose them on BFCache restore)
        if (typeof RemoteKeys !== 'undefined') {
            RemoteKeys.registerAllKeys();
        }
        return; 
    }
});

// ==========================================
// FOFI AUTO-PLAY FLAG
// FoFi should play every time the app is launched/resumed from TV
// Uses sessionStorage for internal navigation detection
// Uses visibilitychange for app resume from background (HOME button)
// ==========================================
var fofiShouldAutoPlay = false;

(function detectFreshLaunch() {
    var fofiPlayed = sessionStorage.getItem('fofi_autoplay_done');
    if (!fofiPlayed) {
        fofiShouldAutoPlay = true;
    } else {
        fofiShouldAutoPlay = false;
    }
})();
// Runtime guard to prevent duplicate auto-play attempts within one JS session
// (runtime guard removed — autoplay controlled by sessionStorage only)

// HOME button now exits the app completely (handled globally in api.js).
// On re-launch, sessionStorage is empty → detectFreshLaunch() sets fofiShouldAutoPlay = true.
// No visibilitychange handler needed here.

// Check authentication - redirect to login if never logged in
(function checkAuth() {
    var attempts = 0;
    var relaunchPending = false;
    var hadSessionBefore = false;
    try {
        relaunchPending = localStorage.getItem('bbnl_relaunch_pending') === '1';
        hadSessionBefore = localStorage.getItem('hasLoggedInOnce') === 'true';
    } catch (e0) { }
    var maxAttempts = (relaunchPending || hadSessionBefore) ? 250 : 12;
    var pollDelayMs = 120;

    function normalizeStoredUser(obj) {
        if (!obj || typeof obj !== 'object') return null;
        var uid = obj.userid != null && String(obj.userid).trim() !== '' ? String(obj.userid).trim()
            : (obj.userId != null && String(obj.userId).trim() !== '' ? String(obj.userId).trim() : '');
        if (!uid) return null;
        if (!obj.userid) obj.userid = uid;
        return obj;
    }

    function authDebug(message, details) {
        try {
            if (!(window.__BBNL_DEBUG || localStorage.getItem('__bbnl_auth_debug') === '1')) return;
            if (typeof details !== 'undefined') console.log('[HomeAuth]', message, details);
            else console.log('[HomeAuth]', message);
        } catch (e) {}
    }

    function readResolvedUser() {
        var primaryRaw = localStorage.getItem("bbnl_user");
        var backupRaw = localStorage.getItem("bbnl_user_backup");
        var primaryUser = null;
        var backupUser = null;

        authDebug('Reading session keys', {
            hasPrimary: !!primaryRaw,
            hasBackup: !!backupRaw,
            hasLoggedInOnce: localStorage.getItem('hasLoggedInOnce'),
            relaunchPending: localStorage.getItem('bbnl_relaunch_pending')
        });

        if (primaryRaw) {
            try {
                var pP = JSON.parse(primaryRaw);
                primaryUser = normalizeStoredUser(pP);
                if (!primaryUser) authDebug('Primary parsed but missing userid', pP);
            } catch (e1) {}
        }

        if (backupRaw) {
            try {
                var pB = JSON.parse(backupRaw);
                backupUser = normalizeStoredUser(pB);
                if (!backupUser) authDebug('Backup parsed but missing userid', pB);
            } catch (e2) {}
        }

        var resolvedUser = primaryUser || backupUser;
        if (!resolvedUser) return null;

        var resolvedJson = JSON.stringify(resolvedUser);
        if (primaryRaw !== resolvedJson) localStorage.setItem("bbnl_user", resolvedJson);
        if (backupRaw !== resolvedJson) localStorage.setItem("bbnl_user_backup", resolvedJson);
        if (localStorage.getItem("hasLoggedInOnce") !== "true") {
            localStorage.setItem("hasLoggedInOnce", "true");
            authDebug('Repaired hasLoggedInOnce flag');
        }
        authDebug('Resolved valid session user', resolvedUser);
        return resolvedUser;
    }

    function redirectLogin() {
        try { localStorage.removeItem('bbnl_relaunch_pending'); } catch (eL) { }
        window.location.replace("index.html");
    }

    try {
        var resolvedUser = readResolvedUser();
        if (resolvedUser) {
            try { localStorage.removeItem('bbnl_relaunch_pending'); } catch (eC) { }
            authDebug('Session valid, staying on home', resolvedUser);
            // Clear browser history to prevent back navigation to login pages
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', window.location.href);
            }
            return;
        }

        var authPollInterval = setInterval(function () {
            attempts++;
            var retryUser = readResolvedUser();
            if (retryUser) {
                clearInterval(authPollInterval);
                try { localStorage.removeItem('bbnl_relaunch_pending'); } catch (eC2) { }
                authDebug('Session appeared during polling, staying on home', retryUser);
                if (window.history && window.history.replaceState) {
                    window.history.replaceState(null, '', window.location.href);
                }
                return;
            }

            var isReturningUser = hadSessionBefore || relaunchPending;
            if (!isReturningUser && attempts >= maxAttempts) {
                clearInterval(authPollInterval);
                authDebug('No session after polling, redirecting to login');
                redirectLogin();
            }
        }, pollDelayMs);
    } catch (e) {
        console.error("[Auth] Error validating session - redirecting to login:", e);
        authDebug('Auth check threw exception', String(e && e.message || e));
        if (!hadSessionBefore) {
            redirectLogin();
        }
        return;
    }
})();

// ✅ FIX ISSUE #1: Handle post-payment subscription refresh
function handlePostPaymentSubscriptionRefresh() {
    return Promise.resolve().then(function() {
        if (typeof BBNLSubscriptionSync !== 'undefined' && BBNLSubscriptionSync.clearChannelDerivedCaches) {
            BBNLSubscriptionSync.clearChannelDerivedCaches();
        } else {
            if (typeof CacheManager !== 'undefined' && CacheManager.remove) {
                CacheManager.remove(CacheManager.KEYS.CHANNEL_LIST);
                CacheManager.remove(CacheManager.KEYS.CATEGORIES);
                CacheManager.remove(CacheManager.KEYS.LANGUAGES);
                CacheManager.remove(CacheManager.KEYS.EXPIRING_CHANNELS);
            }
            try {
                sessionStorage.removeItem('master_channel_list_cache');
                sessionStorage.removeItem('home_languages_cache');
                sessionStorage.removeItem('home_channels_cache');
            } catch (e) {}
        }
        
        // Force fresh subscription/channel data from API
        if (typeof BBNL_API !== 'undefined' && BBNL_API.getChannelList) {
            return BBNL_API.getChannelList(true); // Force refresh
        }
        return Promise.resolve();
    }).then(function() {
        // Re-render home UI with fresh data
        if (typeof loadHomeLanguages === 'function') {
            loadHomeLanguages();
        }
        if (typeof loadHomeAds === 'function') {
            loadHomeAds();
        }
        console.log('[Home] Post-payment subscription refresh completed');
    }).catch(function(err) {
        console.warn('[Home] Post-payment refresh error:', err);
    });
}

// Initialize on page load
window.onload = function () {
    // ✅ FIX ISSUE #1: Check if user just returned from payment
    var checkPaymentFlag = false;
    try {
        var justPaid = sessionStorage.getItem('paymentJustCompleted');
        if (justPaid === 'true') {
            sessionStorage.removeItem('paymentJustCompleted');
            checkPaymentFlag = true;
        }
        // Non-consuming check (isRecent): leave the BBNLSubscriptionSync flag
        // intact so channels.js and player.js can also detect the recent
        // subscription change within the 10-minute window. The flag
        // expires naturally after 10 minutes — no manual cleanup needed.
        if (!checkPaymentFlag && typeof BBNLSubscriptionSync !== 'undefined' && BBNLSubscriptionSync.isRecent && BBNLSubscriptionSync.isRecent()) {
            checkPaymentFlag = true;
        }
    } catch (e) {}
    
    // If returning from payment, refresh subscriptions before normal init
    if (checkPaymentFlag) {
        handlePostPaymentSubscriptionRefresh().then(function() {
            runInitializeHomePage();
        });
        return;
    }
    
    // Normal initialization (not from payment)
    runInitializeHomePage();
}

function runInitializeHomePage() {

    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.primeAfterLogin) {
        AppPerformanceCache.primeAfterLogin(false);
    }

    // Start background subscription refresh (5-minute interval)
    if (typeof ChannelsAPI !== 'undefined' && ChannelsAPI.startBackgroundRefresh) {
        ChannelsAPI.startBackgroundRefresh();
    }
    // Also trigger one immediate safe refresh on app launch so relaunch picks up
    // subscription/category updates without waiting for the interval tick.
    // After fresh data lands, invalidate the derived sessionStorage caches
    // and re-render the home channel grid + language tiles so the new
    // subscription state is visible without needing another relaunch.
    if (typeof ChannelsAPI !== 'undefined' && ChannelsAPI.forceSubscriptionRefresh) {
        ChannelsAPI.forceSubscriptionRefresh().then(function () {
            try {
                if (typeof BBNLSubscriptionSync !== 'undefined' && BBNLSubscriptionSync.clearChannelDerivedCaches) {
                    BBNLSubscriptionSync.clearChannelDerivedCaches();
                } else {
                    sessionStorage.removeItem('home_channels_cache');
                    sessionStorage.removeItem('home_languages_cache');
                }
            } catch (eClr) {}
            if (typeof loadHomeChannels === 'function') {
                try { loadHomeChannels(); } catch (eLh) {}
            }
            if (typeof loadHomeLanguages === 'function') {
                try { loadHomeLanguages(); } catch (eLl) {}
            }
        }).catch(function () {});
    }

    // Get all focusable elements
    focusables = document.querySelectorAll('.focusable');

    // Set initial focus
    if (focusables.length > 0) {
        currentFocus = 0;
        focusables[0].focus();
    }

    // Restore cached UI state from same login session.
    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.getPageState) {
        var cachedState = AppPerformanceCache.getPageState('home', 60 * 60 * 1000);
        if (cachedState) {
            if (typeof cachedState.focusIndex === 'number' && cachedState.focusIndex >= 0 && cachedState.focusIndex < focusables.length) {
                currentFocus = cachedState.focusIndex;
                setTimeout(function () {
                    try { focusables[currentFocus].focus(); } catch (e) {}
                }, 0);
            }
            if (typeof cachedState.scrollTop === 'number') {
                setTimeout(function () { window.scrollTo(0, cachedState.scrollTop); }, 0);
            }
        }
    }

    // Add mouse support
    focusables.forEach(function (el, index) {
        el.addEventListener('mouseenter', function () {
            currentFocus = index;
            el.focus();
        });

        el.addEventListener('click', function () {
            handleClick(el);
        });
    });

    // Initialize sidebar icon buttons - Set active state based on current page ONLY
    var sidebarBtns = document.querySelectorAll('.sidebar-icon-btn');
    var currentPage = window.location.pathname.split('/').pop() || 'home.html';

    // Remove all active classes first, then set only for current page
    // Also add explicit click handlers for navigation
    sidebarBtns.forEach(function (btn) {
        btn.classList.remove('active');
        var route = btn.getAttribute('data-route');
        if (route === currentPage) {
            btn.classList.add('active');
        }

        // Add explicit click handler for sidebar navigation
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var targetRoute = btn.getAttribute('data-route');
            if (targetRoute) {
                // [Navigation Optimization] Do not reload page if already on it
                if (targetRoute === currentPage || (targetRoute === 'home.html' && currentPage === '')) {
                   console.log("[Home] Navigation skipped: already on " + targetRoute);
                   return;
                }
                
                // [Critical] Mark interior navigation to prevent exit on visibilitychange.
                window.__BBNL_NAVIGATING = true;
                window.location.href = targetRoute;
            }
        });
    });

    // Register All Remote Keys (supports all Samsung remote types)
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            var keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Return'];
            tizen.tvinputdevice.registerKeyBatch(keys);
        } catch (e) {
        }
    }

    // Initialize TV Navigation System
    // This will set initial focus on Home icon in sidebar
    setTimeout(function () {
        if (typeof TVNavigation !== 'undefined') {
            TVNavigation.init();
        }
    }, 100);

    // Initialize numeric-only search input
    var searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.setAttribute('type', 'number');
        searchInput.setAttribute('inputmode', 'numeric');
        searchInput.setAttribute('pattern', '[0-9]*');
        searchInput.setAttribute('autocomplete', 'off');

        // Read-only by default so D-pad focus does NOT auto-open Samsung keypad.
        // Flipped to writable only when user explicitly presses OK / clicks the input.
        searchInput.readOnly = true;

        searchInput.addEventListener('click', function () {
            homeSearchActivated = true;
            // Explicit OK press → open keypad.
            searchInput.readOnly = false;
            searchInput.focus();
        });

        searchInput.addEventListener('blur', function () {
            homeSearchActivated = false;
            // Re-lock so subsequent focus via D-pad does not auto-open keypad.
            searchInput.readOnly = true;
        });

        searchInput.addEventListener('input', function () {
            searchInput.value = String(searchInput.value || '').replace(/\D/g, '').slice(0, 4);
            clearTimeout(homeSearchTimeout);
            if (searchInput.value.length > 0) {
                homeSearchTimeout = setTimeout(function () {
                    var lcn = parseInt(searchInput.value, 10);
                    playChannelByLCNFromHome(lcn);
                }, HOME_CHANNEL_INPUT_GRACE_MS);
            }
        });

        searchInput.addEventListener('keydown', function (e) {
            if (e.keyCode === 13) {
                var digits = searchInput.value.replace(/[^0-9]/g, '').trim();
                if (digits.length > 0) {
                    // DONE / OK with digits → search immediately.
                    e.preventDefault();
                    clearTimeout(homeSearchTimeout);
                    searchInput.readOnly = true;
                    playChannelByLCNFromHome(parseInt(digits, 10));
                } else {
                    // OK on empty input → open Samsung keypad on demand.
                    e.preventDefault();
                    searchInput.readOnly = false;
                    searchInput.focus();
                }
            }
        });
        // Samsung native keypad DONE may fire 'change' instead of keydown 13.
        searchInput.addEventListener('change', function () {
            var digits = String(searchInput.value || '').replace(/\D/g, '').slice(0, 4);
            if (digits.length === 0) return;
            clearTimeout(homeSearchTimeout);
            searchInput.readOnly = true;
            playChannelByLCNFromHome(parseInt(digits, 10));
        });
    }

    // Load FoFi TV logo from API - REMOVED (already loaded at DOMContentLoaded)
    // loadFoFiLogo();  // <-- SKIP: Logo already displayed instantly at DOMContentLoaded
    
    startNetworkAccessLockWatcher();

    // Auto-play FoFi channel immediately — API call already started by DOMContentLoaded
    if (fofiShouldAutoPlay) {
        // Auto-play based on sessionStorage flag only. playFoFiChannel() will mark the flag.
        playFoFiChannel();
    }

    // Preload channels and languages in background to speed up channels page
    // Skip background prefetch when returning from internal navigation or
    // when the home caches are already seeded to avoid duplicate network requests
    setTimeout(function() {
        try {
            var returningFromChannels = sessionStorage.getItem('returningFromChannels');
            // If returning from channels (internal navigation), skip prefetch
            if (returningFromChannels === 'true') return;

            if (typeof BBNL_API !== 'undefined') {
                // Only prefetch if we don't already have cached data
                try {
                    var hasHomeChannels = !!sessionStorage.getItem('home_channels_cache');
                    var hasHomeLangs = !!sessionStorage.getItem('home_languages_cache');
                } catch (eHas) { var hasHomeChannels = false; var hasHomeLangs = false; }

                if (BBNL_API.getChannelList && !hasHomeChannels) BBNL_API.getChannelList({}).catch(function(){});
                if (BBNL_API.getLanguageList && !hasHomeLangs) BBNL_API.getLanguageList().catch(function(){});
            }
        } catch (e) {}
    }, 1500); // 1.5 seconds after home page loads

    _homePageInitialized = true;
};

// Keyboard navigation
document.addEventListener('keydown', function (e) {

    // Check if app lock screen is active - handle BACK key to retry
    if (appLockActive) {
        e.preventDefault();
        if (e.keyCode === 10009 || e.keyCode === 13) {
            // BACK or ENTER - retry lock check
            retryAppLockCheck();
        }
        return;
    }

    // Check if error popup is open - handle BACK to close, ENTER to retry
    if (homeErrorPopupOpen) {
        e.preventDefault();
        if (e.keyCode === 10009) {
            hideHomeErrorPopups();
        } else if (e.keyCode === 13) {
            var activeBtn = document.activeElement;
            if (activeBtn && activeBtn.classList.contains('error-popup-btn')) {
                activeBtn.click();
            }
        }
        return;
    }

    // Check if update popup is open - ENTER/BACK to dismiss
    var updatePopup = document.getElementById('appUpdatePopup');
    if (updatePopup && updatePopup.style.display === 'flex') {
        e.preventDefault();
        if (e.keyCode === 13 || e.keyCode === 10009) {
            updatePopup.style.display = 'none';
        }
        return;
    }

    // Check if exit popup is open - handle navigation within popup only
    if (exitPopupOpen) {
        e.preventDefault();
        handleExitPopupNavigation(e.keyCode);
        return;
    }

    // Allow typing in search input - only intercept navigation keys
    var isSearchFocused = document.activeElement && document.activeElement.id === 'searchInput';
    if (isSearchFocused) {
        if (e.keyCode === 13) { // ENTER - play channel by number
            var query = document.activeElement.value.replace(/[^0-9]/g, '').trim();
            if (query.length > 0) {
                e.preventDefault();
                clearTimeout(homeSearchTimeout); // Cancel auto-play timer
                playChannelByLCNFromHome(parseInt(query, 10));
            }
            return;
        }
        if (e.keyCode === 39) { // RIGHT - go to Settings button
            e.preventDefault();
            document.activeElement.readOnly = false;
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleRight();
            }
            return;
        }
        if (e.keyCode === 37) { // LEFT - go to sidebar
            e.preventDefault();
            document.activeElement.readOnly = false;
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleLeft();
            }
            return;
        }
        if (e.keyCode === 38) { // UP - stay (already at top)
            e.preventDefault();
            return;
        }
        if (e.keyCode === 40) { // DOWN - leave search, go to cards
            e.preventDefault();
            document.activeElement.readOnly = false;
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleDown();
            }
            return;
        }
        if (e.keyCode === 10009) { // BACK - clear search or navigate back
            e.preventDefault();
            clearTimeout(homeSearchTimeout);
            if (document.activeElement.value.trim() !== '') {
                document.activeElement.value = '';
            } else {
                if (typeof BBNL_exitAppPreservingAuth === 'function') {
                    BBNL_exitAppPreservingAuth();
                } else {
                    confirmExit();
                }
            }
            return;
        }
        // Let all other keys (typing, backspace, etc.) work naturally
        return;
    }

    // NUMBER KEYS (0-9): Auto-focus search input and type the number
    // This allows users to search LCN from any zone (sidebar, cards, etc.)
    var code = e.keyCode;
    if ((code >= 48 && code <= 57) || (code >= 96 && code <= 105)) {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            // Enforce max 4 digits
            if (searchInput.value.length >= 4) return;

            // Get the typed number
            var num = (code >= 96) ? (code - 96) : (code - 48);

            // Focus search input and append number
            searchInput.focus();
            searchInput.value += num.toString();
            
            // Trigger input event to start LCN auto-play timer
            var inputEvent = new Event('input', { bubbles: true });
            searchInput.dispatchEvent(inputEvent);
            
        }
        return;
    }

    switch (e.keyCode) {
        case 37: // LEFT
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleLeft();
            }
            break;
        case 39: // RIGHT
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleRight();
            }
            break;
        case 38: // UP
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleUp();
            }
            break;
        case 40: // DOWN
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleDown();
            }
            break;
        case 13: // ENTER
            e.preventDefault();
            handleEnter();
            break;
        case 10009: // BACK
            e.preventDefault();
            if (document.activeElement && document.activeElement.id === 'searchInput' && document.activeElement.value.trim() !== '') {
                clearTimeout(homeSearchTimeout);
                document.activeElement.value = '';
            } else if (typeof BBNL_exitAppPreservingAuth === 'function') {
                BBNL_exitAppPreservingAuth();
            } else {
                confirmExit();
            }
            break;
        case 447: // VolumeUp
        case 448: // VolumeDown
        case 449: // VolumeMute
            // Handle volume keys
            handleVolumeKeys(e.keyCode);
            break;
    }
});

// ==========================================
// VOLUME CONTROL (for Home page)
// ==========================================
var homeCurrentVolume = 50;
var homeIsMuted = false;

function handleVolumeKeys(keyCode) {
    try {
        if (typeof tizen !== 'undefined' && tizen.tvaudiocontrol) {
            switch (keyCode) {
                case 447: // VolumeUp
                    tizen.tvaudiocontrol.setVolumeUp();
                    homeCurrentVolume = tizen.tvaudiocontrol.getVolume();
                    showVolumeIndicator(homeCurrentVolume);
                    break;
                case 448: // VolumeDown
                    tizen.tvaudiocontrol.setVolumeDown();
                    homeCurrentVolume = tizen.tvaudiocontrol.getVolume();
                    showVolumeIndicator(homeCurrentVolume);
                    break;
                case 449: // VolumeMute
                    homeIsMuted = !homeIsMuted;
                    tizen.tvaudiocontrol.setMute(homeIsMuted);
                    showVolumeIndicator(homeIsMuted ? 0 : homeCurrentVolume, homeIsMuted);
                    break;
            }
        }
    } catch (e) {
        console.error("Volume control error:", e);
    }
}

function showVolumeIndicator(volume, muted) {
    var indicator = document.getElementById('volume-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'volume-indicator';
        indicator.style.cssText = 'position:fixed;top:50px;right:50px;background:rgba(0,0,0,0.8);color:#fff;padding:15px 25px;border-radius:10px;font-size:18px;z-index:9999;display:flex;align-items:center;gap:15px;';
        document.body.appendChild(indicator);
    }

    var icon = muted ? '\ud83d\udd07' : (volume > 50 ? '\ud83d\udd0a' : (volume > 0 ? '\ud83d\udd09' : '\ud83d\udd08'));
    indicator.innerHTML = '<span style=\"font-size:24px;\">' + icon + '</span><span>' + (muted ? 'Muted' : volume + '%') + '</span>';
    indicator.style.display = 'flex';

    clearTimeout(indicator.hideTimeout);
    indicator.hideTimeout = setTimeout(function () {
        indicator.style.display = 'none';
    }, 2000);
}

/**
 * Handle navigation within exit popup
 */
function handleExitPopupNavigation(keyCode) {
    var noBtn = document.getElementById('exitNoBtn');
    var yesBtn = document.getElementById('exitYesBtn');
    var active = document.activeElement;

    switch (keyCode) {
        case 37: // LEFT
        case 39: // RIGHT
            // Toggle between No and Yes buttons
            if (active === noBtn) {
                yesBtn.focus();
            } else if (active === yesBtn) {
                noBtn.focus();
            } else {
                // Focus on No button by default
                noBtn.focus();
            }
            break;
        case 38: // UP
        case 40: // DOWN
            // Toggle between buttons (same as left/right)
            if (active === noBtn) {
                yesBtn.focus();
            } else if (active === yesBtn) {
                noBtn.focus();
            } else {
                noBtn.focus();
            }
            break;
        case 13: // ENTER
            // Trigger click on focused button
            if (active === noBtn) {
                cancelExit();
            } else if (active === yesBtn) {
                confirmExit();
            }
            break;
        case 10009: // BACK
            // Close popup
            cancelExit();
            break;
    }
}

// Smart back navigation handler
function handleBackNavigation() {
    if (typeof BBNL_exitAppPreservingAuth === 'function') {
        BBNL_exitAppPreservingAuth();
    } else {
        confirmExit();
    }
}

function moveFocusHorizontal(direction) {
    if (focusables.length === 0) return;

    var next = currentFocus + direction;

    // Clamp to valid range
    if (next < 0) next = 0;
    if (next >= focusables.length) next = focusables.length - 1;

    if (next !== currentFocus) {
        currentFocus = next;
        focusables[currentFocus].focus();
    }
}

function moveFocusVertical(direction) {
    if (focusables.length === 0) return;

    var current = focusables[currentFocus];
    var currentRect = current.getBoundingClientRect();
    var currentCenterX = currentRect.left + currentRect.width / 2;
    var currentCenterY = currentRect.top + currentRect.height / 2;

    // Find elements in the target direction
    var candidates = [];

    for (var i = 0; i < focusables.length; i++) {
        if (i === currentFocus) continue;

        var el = focusables[i];
        var rect = el.getBoundingClientRect();
        var centerY = rect.top + rect.height / 2;

        // Check if element is in the correct direction
        if (direction < 0 && centerY < currentCenterY - 20) {
            // Moving UP - element should be above
            candidates.push({
                index: i,
                element: el,
                rect: rect,
                centerX: rect.left + rect.width / 2,
                centerY: centerY,
                distance: currentCenterY - centerY
            });
        } else if (direction > 0 && centerY > currentCenterY + 20) {
            // Moving DOWN - element should be below
            candidates.push({
                index: i,
                element: el,
                rect: rect,
                centerX: rect.left + rect.width / 2,
                centerY: centerY,
                distance: centerY - currentCenterY
            });
        }
    }

    if (candidates.length === 0) {
        return;
    }

    // Sort by vertical distance first, then by horizontal alignment
    candidates.sort(function (a, b) {
        // Prioritize elements on the same row (closest vertically)
        var rowDiff = Math.abs(a.distance - b.distance);
        if (rowDiff < 50) {
            // Same row - prefer horizontally aligned
            var aHorizontalDist = Math.abs(a.centerX - currentCenterX);
            var bHorizontalDist = Math.abs(b.centerX - currentCenterX);
            return aHorizontalDist - bHorizontalDist;
        }
        // Different rows - prefer closest row
        return a.distance - b.distance;
    });

    // Move to the best candidate
    var best = candidates[0];
    currentFocus = best.index;
    focusables[currentFocus].focus();

    // Scroll element into view smoothly
    focusables[currentFocus].scrollIntoView({ behavior: 'auto', block: 'center' });

}

function handleEnter() {
    // Use document.activeElement to get the actually focused element
    // This works correctly with TV Navigation system
    var activeElement = document.activeElement;
    if (activeElement) {
        handleClick(activeElement);
    }
}

function handleClick(element) {

    // Settings button - explicit handler
    if (element.classList.contains('settings-btn')) {
        window.__BBNL_NAVIGATING = true;
        window.location.href = "settings.html";
        return;
    }

    // Check for data-route attribute first (highest priority)
    var route = element.getAttribute('data-route');
    if (route) {
        if (window.location && window.location.pathname && window.location.pathname.indexOf(route) !== -1) {
            return;
        }
        window.__BBNL_NAVIGATING = true;
        window.location.href = route;
        return;
    }

    // Check if it's an app card
    var appType = element.getAttribute('data-app');
    if (appType) {
        // [Safety Check] Mark navigation in case the app opening logic triggers a URL change later
        window.__BBNL_NAVIGATING = true;
        return;
    }

    // Check if it's a channel card
    var channelType = element.getAttribute('data-channel');
    if (channelType) {
        // Fast path: build a channel object from card dataset and hand off via BBNL_API.playChannel.
        // This avoids slow player-side lookup by name on low-power TVs.
        var streamLink = element.dataset ? (element.dataset.streamlink || '') : '';
        var channelNo = element.dataset ? (element.dataset.channelno || '') : '';
        var channelLogo = element.dataset ? (element.dataset.logo || '') : '';

        if (streamLink && typeof BBNL_API !== 'undefined' && BBNL_API.playChannel) {
            BBNL_API.playChannel({
                chtitle: channelType,
                channel_name: channelType,
                streamlink: streamLink,
                channelno: channelNo,
                chlogo: channelLogo
            }, 'subs');
            return;
        }

        // Fallback: preserve older behavior if dataset is incomplete.
        window.__BBNL_NAVIGATING = true;
        window.location.href = "player.html?name=" + encodeURIComponent(channelType);
        return;
    }

    // Check if it's a button
    if (element.classList.contains('btn-watch')) {
        // Add your watch logic here
        return;
    }

    if (element.classList.contains('btn-add')) {
        return;
    }

    // Sidebar icon navigation
    if (element.classList.contains('sidebar-icon-btn')) {
        // Route navigation is already handled by data-route check above
        return;
    }

    // Header icon buttons
    if (element.classList.contains('header-icon-btn')) {
        // Route navigation handled by data-route or specific handlers below
        return;
    }

    // Search button
    if (element.id === 'searchBtn') {
        // TODO: Implement search modal
        return;
    }

    // Toggle Network Popup
    if (element.id === 'networkBtn' || element.classList.contains('network-btn')) {
        toggleNetworkPopup();
        return;
    }

    // Close Network Popup when clicking network options
    if (element.classList.contains('network-option')) {
        closeNetworkPopup();
        return;
    }

    // View all cards
    if (element.classList.contains('view-all')) {
        // Check which section we are in
        var parentSection = element.closest('.content-section');
        window.__BBNL_NAVIGATING = true;
        if (parentSection && parentSection.querySelector('h2').innerText.includes('OTT')) {
            window.location.href = "ott-apps.html";
        } else {
            window.location.href = "channels.html";
        }
        return;
    }

    // Language item - navigate to channels with language filter
    if (element.classList.contains('language-item')) {
        var langId = element.getAttribute('data-langid') || '';
        var langName = element.getAttribute('data-langname') || '';
        
        // Store selected language in sessionStorage for channels page
        sessionStorage.setItem('selectedLanguageId', langId);
        sessionStorage.setItem('selectedLanguageName', langName);
        
        // Store focused language index for state preservation when returning
        var languageItems = Array.from(document.querySelectorAll('#home-languages-container .language-item'));
        var focusedIndex = languageItems.indexOf(element);
        if (focusedIndex >= 0) {
            sessionStorage.setItem('homeFocusedLanguageIndex', focusedIndex.toString());
        }
        
        // Navigate to channels page with language filter
        window.__BBNL_NAVIGATING = true;
        window.location.href = 'channels.html?lang=' + encodeURIComponent(langId);
        return;
    }
}

// ==========================================
// ADS INTEGRATION (ASYNC)
// ==========================================

/**
 * Load and display homepage ads asynchronously
 * Fails silently if API returns no data or encounters errors
 */
function loadHomeAds() {
    var renderedFromCache = false;
    var returningFromChannels = false;
    try { returningFromChannels = sessionStorage.getItem('returningFromChannels') === 'true'; } catch (e) { returningFromChannels = false; }

    // Check sessionStorage cache first
    try {
        var cachedAds = sessionStorage.getItem('home_ads_cache');
        if (cachedAds) {
            var ads = JSON.parse(cachedAds);
            if (ads && Array.isArray(ads) && ads.length > 0) {
                primeHomeAds(ads, 5);
                renderAdsInHeroBanner(ads);
                renderedFromCache = true;
                // If cache has fewer than expected banners, continue to API refresh.
                if (ads.length >= 5) return;
            }
        }
    } catch (e) {}

    // Fallback cache for fresh app relaunch where sessionStorage is empty.
    try {
        var persistentAds = localStorage.getItem('home_ads_cache_persistent');
        if (persistentAds) {
            var persistedList = JSON.parse(persistentAds);
            if (persistedList && Array.isArray(persistedList) && persistedList.length > 0) {
                try { sessionStorage.setItem('home_ads_cache', JSON.stringify(persistedList)); } catch (cacheErr) {}
                primeHomeAds(persistedList, 5);
                renderAdsInHeroBanner(persistedList);
                renderedFromCache = true;
                if (persistedList.length >= 5) return;
            }
        }
    } catch (e) {}

    // Get ads from API (skip network when returning from other pages)
    if (!returningFromChannels) {
        AdsAPI.getHomeAds()
        .then(function (ads) {

            // Only proceed if we have valid ads
            if (ads && Array.isArray(ads) && ads.length > 0) {
                // Cache in sessionStorage
                try { sessionStorage.setItem('home_ads_cache', JSON.stringify(ads)); } catch (e) {}
                try { localStorage.setItem('home_ads_cache_persistent', JSON.stringify(ads)); } catch (e) {}
                primeHomeAds(ads, 5);
                renderAdsInHeroBanner(ads);
            } else if (!renderedFromCache) {
            }
        })
        .catch(function (error) {
            // Fail silently - don't show errors to user
            console.error("[HOME] Failed to load ads:", error);
        });
    } else {
        // When returning from other pages, avoid network calls; if not rendered from cache above,
        // leave hero banner blank to prevent duplicate image/network requests.
        if (!renderedFromCache) {
            // No-op: keep existing banner state (empty)
        }
    }
}

/**
 * Render ads in hero banner with slider
 * @param {Array} ads - Array of ad objects with adpath property
 */
function renderAdsInHeroBanner(ads) {
    var container = document.getElementById('hero-banner-container');

    if (!container) {
        return;
    }


    if (homeAdInterval) {
        clearInterval(homeAdInterval);
        homeAdInterval = null;
    }

    var renderAds = Array.isArray(ads) ? ads.slice(0, 5) : [];

    // Clear any existing content
    container.innerHTML = '';

    // Create slider container
    var sliderContainer = document.createElement('div');
    sliderContainer.className = 'ad-slider';

    // Build all slides in a fragment first (single DOM insert = single reflow)
    var hasAdjustedBannerHeight = false;
    function adjustHeroBannerFromImage(imgEl) {
        if (hasAdjustedBannerHeight || !imgEl) return;
        var naturalW = Number(imgEl.naturalWidth || 0);
        var naturalH = Number(imgEl.naturalHeight || 0);
        if (naturalW <= 0 || naturalH <= 0) return;
        var ratio = naturalW / naturalH;
        if (!isFinite(ratio) || ratio <= 0) return;

        var containerWidth = Number(container.clientWidth || 0);
        if (containerWidth <= 0) return;

        // Keep banner in a safe TV-friendly height range while matching ad ratio.
        var targetHeight = Math.round(containerWidth / ratio);
        if (targetHeight < 420) targetHeight = 420;
        if (targetHeight > 760) targetHeight = 760;

        container.style.height = targetHeight + 'px';
        hasAdjustedBannerHeight = true;
    }

    var fragment = document.createDocumentFragment();
    renderAds.forEach(function (ad, index) {
        var slide = document.createElement('div');
        slide.className = 'ad-slide';
        slide.style.cssText = index === 0 ? 'opacity:1;z-index:1' : 'opacity:0;z-index:0';

        var img = document.createElement('img');
        var adUrl = normalizeHomeAssetUrl(ad.adpath || '');
        if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
            BBNL_API.setImageSource(img, adUrl);
        } else {
            img.src = adUrl;
        }
        img.alt = 'Advertisement ' + (index + 1);

        img.onload = function () {
            if (index === 0) {
                adjustHeroBannerFromImage(this);
            }
        };

        // Handle image load errors gracefully
        img.onerror = function () {
            console.error("[HOME] Failed to load ad image:", ad.adpath);
            slide.style.display = 'none';
        };

        slide.appendChild(img);
        fragment.appendChild(slide);
    });
    sliderContainer.appendChild(fragment);
    container.appendChild(sliderContainer);

    // Add navigation dots if multiple ads
    if (renderAds.length > 1) {
        var dotsContainer = document.createElement('div');
        dotsContainer.className = 'ad-dots';

        renderAds.forEach(function (ad, index) {
            var dot = document.createElement('div');
            dot.className = 'ad-dot' + (index === 0 ? ' active' : '');
            dot.setAttribute('data-index', index);
            dotsContainer.appendChild(dot);
        });

        container.appendChild(dotsContainer);
    }

    // Start auto-rotation if multiple ads (6 seconds interval)
    if (renderAds.length > 1) {
        var currentIndex = 0;
        var slides = sliderContainer.querySelectorAll('.ad-slide');
        var dots = container.querySelectorAll('.ad-dot');

        // Rotation function
        function rotateAds() {
            // Fade out current slide
            slides[currentIndex].style.opacity = '0';
            slides[currentIndex].style.zIndex = '0';
            dots[currentIndex].classList.remove('active');

            // Move to next slide
            currentIndex = (currentIndex + 1) % slides.length;

            // Fade in next slide
            slides[currentIndex].style.opacity = '1';
            slides[currentIndex].style.zIndex = '1';
            dots[currentIndex].classList.add('active');
        }

        // Auto-rotate every 6 seconds
        homeAdInterval = setInterval(rotateAds, 6000);

        // Manual dot navigation
        dots.forEach(function (dot, index) {
            dot.addEventListener('click', function () {
                if (index !== currentIndex) {
                    // Fade out current
                    slides[currentIndex].style.opacity = '0';
                    slides[currentIndex].style.zIndex = '0';
                    dots[currentIndex].classList.remove('active');

                    // Update index
                    currentIndex = index;

                    // Fade in selected
                    slides[currentIndex].style.opacity = '1';
                    slides[currentIndex].style.zIndex = '1';
                    dots[currentIndex].classList.add('active');
                }
            });
        });
    }

}

// ==========================================
// CHANNELS INTEGRATION (ASYNC)
// ==========================================

/**
 * Load and display first 4 channels on homepage asynchronously
 * Fails silently if API returns no data or encounters errors
 */
function loadHomeChannels() {

    // FIXED: Clear cache if user just completed subscription
    if (sessionStorage.getItem('subscription_completed') === 'true') {
        if (typeof CacheManager !== 'undefined') {
            CacheManager.remove(CacheManager.KEYS.CHANNEL_LIST);
        }
        try { sessionStorage.removeItem('home_channels_cache'); } catch (e) {}
        sessionStorage.removeItem('subscription_completed');
    }

    // Check sessionStorage cache first
    try {
        var cachedChannels = sessionStorage.getItem('home_channels_cache');
        if (cachedChannels) {
            var channels = JSON.parse(cachedChannels);
            if (channels && Array.isArray(channels) && channels.length > 0) {
                var firstThreeChannels = channels.slice(0, 3);
                renderChannelsInHomeGrid(firstThreeChannels);
                return;
            }
        }
    } catch (e) {}

    // Get channels from API
    BBNL_API.getChannelList()
        .then(function (channels) {

            // Only proceed if we have valid channels
            if (channels && Array.isArray(channels) && channels.length > 0) {
                // Cache in sessionStorage
                try { sessionStorage.setItem('home_channels_cache', JSON.stringify(channels)); } catch (e) {}
                // Take first 3 channels (+ View All = 4 cards total)
                var firstThreeChannels = channels.slice(0, 3);
                renderChannelsInHomeGrid(firstThreeChannels);
            } else {
                renderEmptyChannelsState();
            }
        })
        .catch(function (error) {
            console.error("[HOME] Failed to load channels:", error);
            var container = document.getElementById('home-channels-container');
            if (container) container.innerHTML = '';
            if (isNetworkDisconnected() || hasRecentApiNetworkFailure()) {
                showHomeErrorPopup('failedLoad');
            }
        });
}

/**
 * Render channels in home page grid
 * @param {Array} channels - Array of channel objects (first 4)
 */
function renderChannelsInHomeGrid(channels) {
    var container = document.getElementById('home-channels-container');

    if (!container) {
        return;
    }

    // Skip duplicate render to avoid visible refresh/flicker on repeated init calls.
    var signature = '';
    try {
        signature = (channels || []).map(function (ch) {
            return String(ch.channelno || ch.urno || ch.chid || ch.ch_no || ch.chtitle || ch.channel_name || '');
        }).join('|');
    } catch (eSig) {}
    if (signature && signature === _homeChannelsRenderSignature && container.childElementCount > 0) {
        return;
    }
    _homeChannelsRenderSignature = signature;


    // Build all cards in a DocumentFragment (single DOM insert = single reflow)
    // This is critical on Samsung TV where each appendChild triggers expensive layout
    container.innerHTML = '';
    var fragment = document.createDocumentFragment();

    channels.forEach(function (channel) {
        var channelNameRaw = channel.chtitle || channel.channel_name || "Channel";
        var channelName = (typeof decodeHtmlEntities === 'function') ? decodeHtmlEntities(channelNameRaw) : channelNameRaw;
        var rawLogo = (typeof BBNL_API !== 'undefined' && typeof BBNL_API.extractChannelLogoUrl === 'function')
            ? BBNL_API.extractChannelLogoUrl(channel)
            : (channel.chlogo || channel.chnllogo || channel.logo_url || channel.channel_logo || channel.channellogo || channel.logo || channel.logo_path || channel.default_logo || channel.defaultimage || channel.image || channel.img || "");
        var channelLogo = normalizeHomeAssetUrl(rawLogo);
        var channelNo = channel.channelno || channel.channel_no || "";
        var streamLink = channel.streamlink || channel.channel_url || "";

        var card = document.createElement('div');
        card.className = 'channel-card focusable';
        card.tabIndex = 0;
        card.setAttribute('data-channel', channelName);
        card.dataset.streamlink = streamLink;
        card.dataset.logo = channelLogo;
        card.dataset.channelno = channelNo;

        // Channel icon - use cssText for single style update instead of many
        var iconDiv = document.createElement('div');
        iconDiv.className = 'channel-icon';
        iconDiv.style.cssText = 'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;border-radius:12px';

        if (channelLogo && !channelLogo.includes('chnlnoimage')) {
            var img = document.createElement('img');
            if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, channelLogo);
            } else {
                img.src = channelLogo;
            }
            img.alt = channelName;
            img.style.cssText = 'max-width:80%;max-height:80%;object-fit:contain';
            img.onerror = function () {
                var span = document.createElement('span');
                span.className = 'channel-name';
                span.style.cssText = 'color:white;font-weight:bold;font-size:16px';
                span.textContent = channelName.substring(0, 10);
                iconDiv.innerHTML = '';
                iconDiv.appendChild(span);
            };
            iconDiv.appendChild(img);
        } else {
            var span = document.createElement('span');
            span.className = 'channel-name';
            span.style.cssText = 'color:white;font-weight:bold;font-size:16px;text-align:center';
            span.textContent = channelName.substring(0, 15);
            iconDiv.appendChild(span);
        }

        card.appendChild(iconDiv);

        // Card info label
        var labelDiv = document.createElement('div');
        labelDiv.className = 'card-info';
        labelDiv.style.cssText = 'padding:12px 16px';
        var titleDiv = document.createElement('div');
        titleDiv.className = 'card-title-bottom';
        titleDiv.textContent = channelName;
        var subtitleDiv = document.createElement('div');
        subtitleDiv.className = 'card-subtitle-bottom';
        subtitleDiv.textContent = 'Live Channels';
        labelDiv.appendChild(titleDiv);
        labelDiv.appendChild(subtitleDiv);
        card.appendChild(labelDiv);

        card.addEventListener('click', function () {
            handleChannelCardClick(channel);
        });

        fragment.appendChild(card);
    });

    // Add "View All" button
    var viewAllCard = document.createElement('div');
    viewAllCard.className = 'channel-card view-all focusable';
    viewAllCard.tabIndex = 0;
    viewAllCard.innerHTML = '<div class="channel-icon view-all-icon" style="background:linear-gradient(135deg,#1a1a2e 0%,#0f0f1e 100%)"><span class="arrow" style="font-size:48px;color:#3b5cff">\u2192</span></div><div class="card-info" style="padding:12px 16px"><div class="card-title-bottom">View All</div><div class="card-subtitle-bottom">Channels</div></div>';
    viewAllCard.addEventListener('click', function () {
        window.location.href = 'channels.html';
    });
    fragment.appendChild(viewAllCard);

    // Single DOM insert - triggers only ONE reflow
    container.appendChild(fragment);


    // Refresh focusable elements
    focusables = document.querySelectorAll('.focusable');
}

/**
 * Handle channel card click - navigate to player
 */
function handleChannelCardClick(channel) {

    // Use BBNL_API.playChannel to navigate to player
    // Pass 'subs' as category so CH+/CH- zapping only cycles subscribed channels
    BBNL_API.playChannel(channel, 'subs');
}

/**
 * Render empty state when no channels available
 */
function renderEmptyChannelsState() {
    var container = document.getElementById('home-channels-container');
    if (container) container.innerHTML = '';
    if (isNetworkDisconnected() || hasRecentApiNetworkFailure()) {
        showHomeErrorPopup('noChannels');
    }
}

// ==========================================
// OTT APPS INTEGRATION (ASYNC)
// ==========================================

/**
 * Load and display languages on homepage asynchronously
 * Fails silently if API returns no data or encounters errors
 */
function loadHomeLanguages() {

    // Check sessionStorage cache first
    try {
        var cachedLangs = sessionStorage.getItem('home_languages_cache');
        if (cachedLangs) {
            var languages = JSON.parse(cachedLangs);
            if (languages && Array.isArray(languages) && languages.length > 0) {
                renderLanguagesInHomeGrid(languages);
                return;
            }
        }
    } catch (e) {}

    // Get languages from API
    BBNL_API.getLanguageList()
        .then(function (languages) {

            // Check if response is an array with languages
            if (languages && Array.isArray(languages) && languages.length > 0) {
                // Cache in sessionStorage
                try { sessionStorage.setItem('home_languages_cache', JSON.stringify(languages)); } catch (e) {}
                renderLanguagesInHomeGrid(languages);
            } else {
                renderEmptyLanguagesState();
            }
        })
        .catch(function (error) {
            console.error("[HOME] Failed to load languages:", error);
            var container = document.getElementById('home-languages-container');
            if (container) container.innerHTML = '';
            if (isNetworkDisconnected() || hasRecentApiNetworkFailure()) {
                showHomeErrorPopup('failedLoad');
            }
        });
}

/**
 * Render languages in home page grid - MINIMAL LOGO ONLY DESIGN
 * @param {Array} languages - Array of language objects
 */
function prefetchHomeLanguageLogos(languages, maxCount) {
    if (!Array.isArray(languages) || languages.length === 0) return;
    var limit = Math.min(maxCount || 13, languages.length);

    for (var i = 0; i < limit; i++) {
        var lang = languages[i] || {};
        var logoUrl = getHomeLanguageLogoUrl(lang);
        if (!logoUrl || logoUrl.indexOf('noimage') !== -1) continue;

        // CI-08: kick off data-URI cache fetch so subsequent home revisits paint
        // instantly from sessionStorage (no network).
        _fetchAndCacheLangLogoDataUrl(logoUrl);

        var globalLangCached = typeof BBNL_API !== 'undefined' && BBNL_API.isImageCached && BBNL_API.isImageCached(logoUrl);
        if (homeLanguageLogoCache[logoUrl] || homeLanguageLogoPrefetchInFlight[logoUrl] || globalLangCached) continue;

        homeLanguageLogoPrefetchInFlight[logoUrl] = true;
        var pre = new Image();
        pre.onload = function () {
            homeLanguageLogoCache[this.src] = true;
            delete homeLanguageLogoPrefetchInFlight[this.src];
            if (typeof BBNL_API !== 'undefined' && BBNL_API.markImageCached) BBNL_API.markImageCached(this.src);
        };
        pre.onerror = function () {
            var failedSrc = this.src;
            delete homeLanguageLogoPrefetchInFlight[failedSrc];
        };
        if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
            BBNL_API.setImageSource(pre, logoUrl);
        } else {
            pre.src = logoUrl;
        }
    }
}

function renderLanguagesInHomeGrid(languages) {
    var container = document.getElementById('home-languages-container');

    if (!container) {
        return;
    }

    // ✅ RENDERING FIX: Ensure container is visible before rendering
    container.style.display = 'grid';
    container.style.opacity = '1';
    container.style.visibility = 'visible';

    // Sort languages alphabetically (keep special entries at top)
    languages.sort(function (a, b) {
        var nameA = (a.langtitle || '').toLowerCase();
        var nameB = (b.langtitle || '').toLowerCase();
        if (nameA.includes('all') || nameA.includes('subscribed')) return -1;
        if (nameB.includes('all') || nameB.includes('subscribed')) return 1;
        return nameA.localeCompare(nameB);
    });

    // Build all items in a DocumentFragment (single DOM insert = single reflow)
    // Critical on Samsung TV where each appendChild triggers expensive layout
    container.innerHTML = '';
    var fragment = document.createDocumentFragment();

    // Take first 13 languages (+ View All = 14 items = 2 rows of 7)
    var displayLanguages = languages.slice(0, 13);

    // Prefetch first two rows so category logos appear quickly on Home.
    prefetchHomeLanguageLogos(displayLanguages, 14);

    displayLanguages.forEach(function (lang, index) {
        var langName = lang.langtitle || "Language";
        var langId = lang.langid || "";
        var langLogo = getHomeLanguageLogoUrl(lang);
        var item = document.createElement('div');
        item.className = 'language-item focusable';
        item.tabIndex = 0;
        item.setAttribute('data-langid', langId);
        item.setAttribute('data-langname', langName);
        item.setAttribute('data-index', index.toString());
        // ✅ RENDERING FIX: Ensure item is visible
        item.style.display = 'flex';
        item.style.opacity = '1';
        item.style.visibility = 'visible';

        if (langLogo && !langLogo.includes('noimage')) {
            var logoContainer = document.createElement('div');
            logoContainer.className = 'language-logo-container';
            logoContainer.style.display = 'flex';
            logoContainer.style.opacity = '1';
            logoContainer.style.visibility = 'visible';

            var img = document.createElement('img');
            img.className = 'language-logo';
            img.decoding = 'async';
            img.alt = langName;
            img.onload = function () {
                homeLanguageLogoCache[langLogo] = true;
                if (typeof BBNL_API !== 'undefined' && BBNL_API.markImageCached) {
                    BBNL_API.markImageCached(langLogo);
                }
                // CI-08: ensure the data-URI cache has this logo so the next
                // home revisit can paint synchronously from sessionStorage.
                if (!_langLogoDataUrlCache[langLogo]) {
                    _fetchAndCacheLangLogoDataUrl(langLogo);
                }
            };
            // CI-08: prefer instant render from sessionStorage data-URI cache.
            // On Tizen file:// the browser HTTP cache is unreliable for cross-origin
            // images, so a remote URL src can still trigger a visible reload even when
            // marked "cached". A data-URI src paints in the same frame with zero network.
            var cachedLangDataUrl = _getLangLogoDataUrl(langLogo);
            if (cachedLangDataUrl) {
                img.src = cachedLangDataUrl;
            } else {
                var langLogoCached = (homeLanguageLogoCache[langLogo] === true)
                    || (typeof BBNL_API !== 'undefined' && BBNL_API.isImageCached && BBNL_API.isImageCached(langLogo));
                if (langLogoCached) {
                    img.src = langLogo;
                } else if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                    BBNL_API.setImageSource(img, langLogo);
                } else {
                    img.src = langLogo;
                }
            }
            img.onerror = function () {
                var fallback = document.createElement('div');
                fallback.className = 'language-logo-fallback';
                fallback.innerText = langName.substring(0, 2).toUpperCase();
                fallback.style.display = 'flex';
                fallback.style.opacity = '1';
                item.insertBefore(fallback, item.firstChild);
                logoContainer.remove();
            };
            logoContainer.appendChild(img);
            item.appendChild(logoContainer);
        } else {
            var fallback = document.createElement('div');
            fallback.className = 'language-logo-fallback';
            fallback.innerText = langName.substring(0, 2).toUpperCase();
            fallback.style.display = 'flex';
            fallback.style.opacity = '1';
            item.appendChild(fallback);
        }

        var nameLabel = document.createElement('div');
        nameLabel.className = 'language-name';
        nameLabel.innerText = langName;
        nameLabel.style.display = 'block';
        nameLabel.style.opacity = '1';
        nameLabel.style.visibility = 'visible';
        item.appendChild(nameLabel);

        item.addEventListener('click', function () {
            sessionStorage.setItem('selectedLanguageId', langId);
            sessionStorage.setItem('selectedLanguageName', langName);
            sessionStorage.setItem('homeFocusedLanguageIndex', index.toString());
            window.location.href = 'channels.html?lang=' + encodeURIComponent(langId);
        });

        fragment.appendChild(item);
    });

    // Add "View All" button
    var viewAllItem = document.createElement('div');
    viewAllItem.className = 'language-item view-all focusable';
    viewAllItem.tabIndex = 0;
    viewAllItem.innerHTML = '<div class="language-logo-fallback">\u2192</div><div class="language-name">View All</div>';
    viewAllItem.style.display = 'flex';
    viewAllItem.style.opacity = '1';
    viewAllItem.style.visibility = 'visible';
    viewAllItem.addEventListener('click', function () {
        window.location.href = 'language-select.html';
    });
    fragment.appendChild(viewAllItem);

    // Single DOM insert - triggers only ONE reflow
    container.appendChild(fragment);

    // Refresh focusable elements and navigation cache
    focusables = document.querySelectorAll('.focusable');
    if (typeof invalidateHomeNavCache === 'function') invalidateHomeNavCache();

    // Restore focus to previously selected language card if returning from channels/player
    restoreLanguageFocusIfNeeded();
}

/**
 * Restore focus to the previously selected language card when returning from channels/player
 */
function restoreLanguageFocusIfNeeded() {
    var savedIndex = sessionStorage.getItem('homeFocusedLanguageIndex');
    var returningFromChannels = sessionStorage.getItem('returningFromChannels');

    // Only restore focus if we're returning from channels page
    if (savedIndex !== null && returningFromChannels === 'true') {
        var index = parseInt(savedIndex, 10);
        var container = document.getElementById('home-languages-container');
        if (container) {
            var languageItems = container.querySelectorAll('.language-item');
            if (index >= 0 && index < languageItems.length) {
                setTimeout(function() {
                    languageItems[index].focus();
                    languageItems[index].scrollIntoView({ behavior: 'auto', block: 'center' });
                    // Update nav state to reflect cards zone
                    if (typeof navState !== 'undefined') {
                        navState.zone = 'cards';
                    }
                }, 200);
            }
        }
        // Clear the flag after restoring
        sessionStorage.removeItem('returningFromChannels');
    }
}

/**
 * Render empty state when no languages are available
 */
function renderEmptyLanguagesState() {
    var container = document.getElementById('home-languages-container');
    if (container) container.innerHTML = '';
    if (isNetworkDisconnected() || hasRecentApiNetworkFailure()) {
        showHomeErrorPopup('noChannels');
    }
}

/**
 * Render OTT apps in home page grid
 * @param {Array} apps - Array of app objects (first 4)
 */
function renderAppsInHomeGrid(apps) {
    var container = document.getElementById('home-apps-container');

    if (!container) {
        return;
    }


    // Clear any existing content
    container.innerHTML = '';

    // Create app cards
    apps.forEach(function (app) {
        var appName = app.appname || "App";
        var appIcon = app.icon || "";
        var appPkgId = app.pkgid || "";

        // Create app card
        var card = document.createElement('div');
        card.className = 'app-card focusable';
        card.tabIndex = 0;
        card.setAttribute('data-app-name', appName);
        card.setAttribute('data-pkg-id', appPkgId);

        // App icon container
        var iconDiv = document.createElement('div');
        iconDiv.className = 'app-icon';
        iconDiv.style.display = 'flex';
        iconDiv.style.alignItems = 'center';
        iconDiv.style.justifyContent = 'center';
        iconDiv.style.padding = '20px';
        iconDiv.style.borderRadius = '12px';
        iconDiv.style.background = '#1a1a2e';

        // Display icon if available
        if (appIcon) {
            var img = document.createElement('img');
            if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, appIcon);
            } else {
                img.src = appIcon;
            }
            img.alt = appName;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';

            // Fallback to text if image fails to load
            img.onerror = function () {
                var span = document.createElement('span');
                span.className = 'app-name';
                span.style.cssText = 'color: white; font-weight: bold; font-size: 16px;';
                span.textContent = appName;
                iconDiv.innerHTML = '';
                iconDiv.appendChild(span);
            };

            iconDiv.appendChild(img);
        } else {
            // Text fallback
            var nameSpan = document.createElement('span');
            nameSpan.className = 'app-name';
            nameSpan.style.color = 'white';
            nameSpan.style.fontWeight = 'bold';
            nameSpan.style.fontSize = '16px';
            nameSpan.innerText = appName;
            iconDiv.appendChild(nameSpan);
        }

        card.appendChild(iconDiv);

        // App label
        var label = document.createElement('div');
        label.className = 'card-subtitle-bottom';
        label.style.padding = '10px 16px';
        label.style.textAlign = 'center';
        label.innerText = 'Streaming Services';
        card.appendChild(label);

        // Click handler - can add app launch logic later
        card.addEventListener('click', function () {
        });

        container.appendChild(card);
    });

    // Add "View All" button
    var viewAllCard = document.createElement('div');
    viewAllCard.className = 'app-card view-all focusable';
    viewAllCard.tabIndex = 0;
    viewAllCard.innerHTML = `
        <div class="app-icon view-all-icon" style="background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%); display: flex; align-items: center; justify-content: center; padding: 20px; border-radius: 12px; aspect-ratio: 1;">
            <span class="arrow" style="font-size: 48px; color: #3b5cff;">→</span>
        </div>
        <div class="card-subtitle-bottom" style="padding: 10px 16px; text-align: center;">View All OTT</div>
    `;
    viewAllCard.addEventListener('click', function () {
        window.location.href = 'ott-apps.html';
    });
    container.appendChild(viewAllCard);


    // Refresh focusable elements
    focusables = document.querySelectorAll('.focusable');
}

/**
 * Render empty state when no apps available
 */
function renderEmptyAppsState() {
    var container = document.getElementById('home-apps-container');
    if (!container) return;

    container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #888; grid-column: 1 / -1;">
            <p style="font-size: 18px;">No OTT apps available</p>
            <p style="font-size: 14px; margin-top: 10px;">Please check back later</p>
        </div>
    `;
}

// ==========================================
// DARK MODE FUNCTIONALITY
// ==========================================

/**
 * Initialize dark mode from localStorage
 */
function initDarkMode() {
    var isDarkMode = localStorage.getItem('darkMode') !== 'false'; // Default to dark mode
    var toggle = document.getElementById('darkModeToggle');

    if (isDarkMode) {
        document.body.classList.remove('light-mode');
        if (toggle) toggle.classList.add('active');
    } else {
        document.body.classList.add('light-mode');
        if (toggle) toggle.classList.remove('active');
    }

}

// ==========================================
// NETWORK STATUS FUNCTIONALITY
// ==========================================

var networkPopupOpen = false;

/**
 * Attempt automatic recovery of homepage when network is restored
 */
function attemptHomeAutoResume() {
    if (!homeErrorPopupOpen) return;
    var failedPopup = document.getElementById('failedLoadPopup');
    var noChannelsPopup = document.getElementById('noChannelsPopup');
    
    // Only auto-resume if the failed load or no channels popup is active
    if ((failedPopup && failedPopup.style.display === 'flex') || 
        (noChannelsPopup && noChannelsPopup.style.display === 'flex')) {
        console.log('[HOME] Network restored - automatically retrying homepage load');
        
        // Clear cached API failure so hasRecentApiNetworkFailure() doesn't block the reload
        var root = (typeof window !== 'undefined') ? window : globalThis;
        if (root) root.__bbnlLastApiFailure = null;
        
        hideHomeErrorPopups();
        if (typeof loadHomeLanguages === 'function') loadHomeLanguages();
        if (typeof loadHomeChannels === 'function') loadHomeChannels();
        if (typeof loadHomeAds === 'function') loadHomeAds();
    }
}

/**
 * Initialize and update network status dynamically
 */
function initNetworkStatus() {
    updateNetworkStatus();

    // Update network status every 5 seconds
    homeNetworkInterval = setInterval(updateNetworkStatus, 5000);

    // Add Tizen native network state change listener for instant auto-resume on cable/wifi reconnect
    try {
        if (typeof webapis !== 'undefined' && webapis.network && typeof webapis.network.addNetworkStateChangeListener === 'function') {
            webapis.network.addNetworkStateChangeListener(function () {
                setTimeout(function () {
                    updateNetworkStatus();
                }, 1000);
            });
        }
    } catch (e) {}

    // Close popup when clicking outside
    document.addEventListener('click', function (e) {
        var popup = document.getElementById('networkPopup');
        var btn = document.getElementById('networkBtn');
        if (popup && btn && !popup.contains(e.target) && !btn.contains(e.target)) {
            closeNetworkPopup();
        }
    });
}

/**
 * Toggle network popup
 */
function toggleNetworkPopup() {
    var popup = document.getElementById('networkPopup');
    if (!popup) return;

    if (networkPopupOpen) {
        closeNetworkPopup();
    } else {
        openNetworkPopup();
    }
}

/**
 * Open network popup
 */
function openNetworkPopup() {
    var popup = document.getElementById('networkPopup');
    if (popup) {
        popup.classList.add('show');
        networkPopupOpen = true;
        // Focus first option in popup
        var firstOption = popup.querySelector('.network-option');
        if (firstOption) firstOption.focus();
    }
}

/**
 * Close network popup
 */
function closeNetworkPopup() {
    var popup = document.getElementById('networkPopup');
    if (popup) {
        popup.classList.remove('show');
        networkPopupOpen = false;
    }
}

/**
 * Update network status indicator
 */
function updateNetworkStatus() {
    var btnElement = document.getElementById('networkBtn');
    var labelElement = document.getElementById('networkLabel');
    var wifiOption = document.getElementById('wifiOption');
    var wifiSubtitle = document.getElementById('wifiSubtitle');
    var wifiStatus = document.getElementById('wifiStatus');
    var ethernetOption = document.getElementById('ethernetOption');
    var ethernetSubtitle = document.getElementById('ethernetSubtitle');
    var ethernetStatus = document.getElementById('ethernetStatus');

    if (!btnElement || !labelElement) return;

    // Helper function to set active network option
    function setActiveNetwork(type) {
        // type: 'wifi', 'ethernet', 'none'
        if (wifiOption) {
            if (type === 'wifi') {
                wifiOption.classList.add('active');
            } else {
                wifiOption.classList.remove('active');
            }
        }
        if (ethernetOption) {
            if (type === 'ethernet') {
                ethernetOption.classList.add('active');
            } else {
                ethernetOption.classList.remove('active');
            }
        }
    }

    try {
        // Check if webapis is available (Tizen)
        if (typeof webapis !== 'undefined' && webapis.network) {
            var networkType = webapis.network.getActiveConnectionType();

            if (networkType === 0) {
                // Disconnected
                btnElement.classList.add('disconnected');
                labelElement.innerText = "Disconnected";
                setActiveNetwork('none');
                if (wifiSubtitle) wifiSubtitle.innerText = "Not Connected";
                if (wifiStatus) wifiStatus.style.display = "none";
                if (ethernetSubtitle) ethernetSubtitle.innerText = "Not Connected";
                if (ethernetStatus) ethernetStatus.style.display = "none";
            } else if (networkType === 1) {
                // WiFi Connected
                btnElement.classList.remove('disconnected');
                setActiveNetwork('wifi');

                // Try to get WiFi SSID
                var ssid = "";
                try {
                    ssid = webapis.network.getWiFiSsid() || "";
                } catch (e) {
                }

                if (ssid) {
                    labelElement.innerText = ssid;
                    if (wifiSubtitle) wifiSubtitle.innerText = "Connected to " + ssid;
                } else {
                    labelElement.innerText = "WiFi";
                    if (wifiSubtitle) wifiSubtitle.innerText = "Connected";
                }
                if (wifiStatus) wifiStatus.style.display = "block";
                if (ethernetSubtitle) ethernetSubtitle.innerText = "Available";
                if (ethernetStatus) ethernetStatus.style.display = "none";
            } else if (networkType === 2) {
                // Ethernet/LAN Connected
                btnElement.classList.remove('disconnected');
                labelElement.innerText = "Ethernet";
                setActiveNetwork('ethernet');
                if (wifiSubtitle) wifiSubtitle.innerText = "Available";
                if (wifiStatus) wifiStatus.style.display = "none";
                if (ethernetSubtitle) ethernetSubtitle.innerText = "Connected";
                if (ethernetStatus) ethernetStatus.style.display = "block";
            } else {
                // Other connected (type 3 = cellular, etc.)
                btnElement.classList.remove('disconnected');
                labelElement.innerText = "Connected";
                setActiveNetwork('none');
            }
        } else {
            // Fallback for browser/emulator - simulate WiFi connection
            if (navigator.onLine) {
                btnElement.classList.remove('disconnected');
                labelElement.innerText = "WiFi";
                setActiveNetwork('wifi');
                if (wifiSubtitle) wifiSubtitle.innerText = "Connected (Browser)";
                if (wifiStatus) wifiStatus.style.display = "block";
                if (ethernetSubtitle) ethernetSubtitle.innerText = "Available";
                if (ethernetStatus) ethernetStatus.style.display = "none";
            } else {
                btnElement.classList.add('disconnected');
                labelElement.innerText = "Offline";
                setActiveNetwork('none');
                if (wifiSubtitle) wifiSubtitle.innerText = "Not Connected";
                if (wifiStatus) wifiStatus.style.display = "none";
                if (ethernetSubtitle) ethernetSubtitle.innerText = "Not Connected";
                if (ethernetStatus) ethernetStatus.style.display = "none";
            }
        }
    } catch (e) {
        console.error("[HOME] Network status error:", e);
        btnElement.classList.remove('disconnected');
        labelElement.innerText = "Network";
    }

    try {
        var isNowOnline = false;
        if (typeof webapis !== 'undefined' && webapis.network) {
            isNowOnline = (webapis.network.getActiveConnectionType() !== 0);
        } else {
            isNowOnline = navigator.onLine;
        }
        if (isNowOnline) {
            attemptHomeAutoResume();
        }
    } catch (eAuto) {}
}

// ==========================================
// EXIT CONFIRMATION FUNCTIONALITY
// ==========================================

/**
 * Show exit confirmation popup
 */
function showExitConfirmation() {
    var popup = document.getElementById('exitPopup');
    if (popup) {
        popup.style.display = 'flex';
        exitPopupOpen = true;
        // Focus on "No" button (stay in app)
        var noBtn = document.getElementById('exitNoBtn');
        if (noBtn) noBtn.focus();
    }
}

/**
 * Hide exit confirmation popup
 */
function hideExitConfirmation() {
    var popup = document.getElementById('exitPopup');
    if (popup) {
        popup.style.display = 'none';
        exitPopupOpen = false;
    }
}

/**
 * Handle exit confirmation - exit app
 */
function confirmExit() {
    try {
        if (typeof BBNL_exitAppPreservingAuth === 'function') {
            BBNL_exitAppPreservingAuth();
            return;
        }
        // Browser fallback - close window
        window.close();
    } catch (e) {
        console.error("[HOME] Exit error:", e);
        window.close();
    }
}

/**
 * Handle exit cancellation - stay in app
 */
function cancelExit() {
    hideExitConfirmation();
}

// Initialize static UI elements at DOMContentLoaded
document.addEventListener('DOMContentLoaded', function () {
    // If returning from BFCache, everything below is already set up.
    if (typeof _homePageInitialized !== 'undefined' && _homePageInitialized) return;

    var exitYesBtn = document.getElementById('exitYesBtn');
    var exitNoBtn = document.getElementById('exitNoBtn');
    if (exitYesBtn) exitYesBtn.addEventListener('click', confirmExit);
    if (exitNoBtn) exitNoBtn.addEventListener('click', cancelExit);

    var appLockRetryBtn = document.getElementById('appLockRetryBtn');
    if (appLockRetryBtn) appLockRetryBtn.addEventListener('click', retryAppLockCheck);

    var appUpdateOkBtn = document.getElementById('appUpdateOkBtn');
    if (appUpdateOkBtn) {
        appUpdateOkBtn.addEventListener('click', function () {
            var popup = document.getElementById('appUpdatePopup');
            if (popup) popup.style.display = 'none';
        });
    }

    // ✅ CRITICAL FIX: Load logo NOW (DOMContentLoaded, not window.onload)
    // This ensures the sidebar logo appears INSTANTLY, not after all images load
    loadFoFiLogoEarly();
});

// ==========================================
// APP LOCK FUNCTIONALITY
// ==========================================

var appLockActive = false;

function getNetworkLockOverlayTitle() {
    return 'Network Changed';
}

function getNetworkLockOverlayMessage() {
    return 'You are connected to a different network. Please reconnect to the same network used during registration to continue using the app.';
}

function showNetworkLockScreen() {
    var overlay = document.getElementById('appLockOverlay');
    if (!overlay) return;

    var titleEl = overlay.querySelector('.applock-title');
    var messageEl = overlay.querySelector('.applock-message');
    var img = document.getElementById('errorImg_serviceLocked');

    if (titleEl) titleEl.innerText = getNetworkLockOverlayTitle();
    if (messageEl) messageEl.innerHTML = getNetworkLockOverlayMessage();
    if (img) {
        var imageUrl = 'images/error-network.png';
        if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
            BBNL_API.setImageSource(img, imageUrl);
        } else {
            img.src = imageUrl;
        }
    }

    overlay.style.display = 'flex';
    appLockActive = true;

    var retryBtn = document.getElementById('appLockRetryBtn');
    if (retryBtn) retryBtn.focus();
}

function checkNetworkAccessLockStatus(forceRefresh) {
    if (typeof BBNL_API === 'undefined' || !BBNL_API.checkNetworkAccessLock || !BBNL_API.isNetworkAccessLockEnabled || !BBNL_API.isNetworkAccessLockEnabled()) {
        return Promise.resolve(false);
    }

    return BBNL_API.checkNetworkAccessLock({ refresh: !!forceRefresh, timeoutMs: 3000 })
        .then(function (result) {
            if (result && result.locked) {
                showNetworkLockScreen();
                return true;
            }
            return false;
        })
        .catch(function () {
            return false;
        });
}

var networkAccessLockWatcherStarted = false;

function startNetworkAccessLockWatcher() {
    if (networkAccessLockWatcherStarted) return;
    if (typeof BBNL_API === 'undefined' || !BBNL_API.isNetworkAccessLockEnabled || !BBNL_API.isNetworkAccessLockEnabled()) {
        return;
    }
    try {
        if (typeof webapis !== 'undefined' && webapis.network && typeof webapis.network.addNetworkStateChangeListener === 'function') {
            webapis.network.addNetworkStateChangeListener(function () {
                setTimeout(function () {
                    checkAppLockStatus(true);
                }, 1200);
            });
            networkAccessLockWatcherStarted = true;
        }
    } catch (e) {}
}

/**
 * Check app lock status on startup
 * If locked, shows the lock overlay and prevents app usage
 */
function checkAppLockStatus(forceRefresh) {

    // 1. Check if the network lock condition is enabled
    var isLockFeatureEnabled = true;
    if (typeof NetworkAccessLockAPI !== 'undefined' && typeof NetworkAccessLockAPI.isEnabled === 'function') {
        isLockFeatureEnabled = NetworkAccessLockAPI.isEnabled();
    } else if (typeof BBNL_API !== 'undefined' && typeof BBNL_API.isNetworkAccessLockEnabled === 'function') {
        isLockFeatureEnabled = BBNL_API.isNetworkAccessLockEnabled();
    }

    // If condition is false, we allow all networks to access the app (unlocked)
    if (!isLockFeatureEnabled) {
        hideAppLockScreen();
        return Promise.resolve(false);
    }

    if (typeof AppLockAPI === 'undefined') {
        return Promise.resolve(false);
    }

    // 2. Fetch the popup response from the API itself
    AppLockAPI.checkAppLock()
        .then(function (response) {
            var apiMessage = response && (response.message || response.msg || (typeof response.status === 'string' && response.status !== '0' && response.status !== 'locked' ? response.status : null));
            var apiReturnedLock = false;

            if (response) {
                if (response.status === "locked" || response.locked === true || response.lock === true) apiReturnedLock = true;
                else if (response.status === "0" || response.status === 0 || response.status === "fail" || response.status === "error") apiReturnedLock = true;
                else if (response.message && response.message.toLowerCase().includes("lock")) apiReturnedLock = true;
            }

            // 3. Block completely if network changed OR API says locked
            if (typeof BBNL_API !== 'undefined' && BBNL_API.checkNetworkAccessLock) {
                BBNL_API.checkNetworkAccessLock({ refresh: !!forceRefresh, timeoutMs: 3000 })
                    .then(function (result) {
                        if (apiReturnedLock || (result && result.locked)) {
                            // Show the popup coming from the API itself
                            showAppLockScreen(apiMessage);
                        } else {
                            hideAppLockScreen();
                        }
                    })
                    .catch(function () {
                        if (apiReturnedLock) showAppLockScreen(apiMessage);
                        else hideAppLockScreen();
                    });
            } else {
                if (apiReturnedLock) showAppLockScreen(apiMessage);
                else hideAppLockScreen();
            }
        })
        .catch(function (error) {
            console.error("[HOME] App lock API check failed:", error);
            // Even if API fails (due to network switch), block the app if network changed locally
            if (typeof BBNL_API !== 'undefined' && BBNL_API.checkNetworkAccessLock) {
                BBNL_API.checkNetworkAccessLock({ refresh: !!forceRefresh, timeoutMs: 3000 })
                    .then(function (result) {
                        if (result && result.locked) {
                            showAppLockScreen(); // Lock it completely, uses default message if API failed
                        } else {
                            hideAppLockScreen();
                        }
                    });
            } else {
                hideAppLockScreen();
            }
        });
}

/**
 * Show the app lock overlay screen
 * @param {string} customMessage - Optional message to display from the API
 */
function showAppLockScreen(customMessage) {
    var overlay = document.getElementById('appLockOverlay');
    if (overlay) {
        // If a custom message from the API is provided (and not just a generic "locked" string), update the UI text.
        // Otherwise, preserve the default HTML message: "We request you to use BBNL network to continue enjoying your favorite content."
        if (customMessage && customMessage.toLowerCase() !== 'locked' && customMessage.toLowerCase() !== 'service locked') {
            var messageEl = overlay.querySelector('.applock-message');
            if (messageEl) {
                messageEl.innerHTML = customMessage;
            }
        }

        overlay.style.display = 'flex';
        appLockActive = true;

        // Stop any background playback since the app is locked
        try {
            if (typeof AVPlayer !== 'undefined' && typeof AVPlayer.stop === 'function') {
                AVPlayer.stop();
            }
            if (typeof stopSilentRetry === 'function') stopSilentRetry();
            if (typeof stopSimpleAutoResumeWatcher === 'function') stopSimpleAutoResumeWatcher();
            if (typeof stopPausedByNetworkResumePoller === 'function') stopPausedByNetworkResumePoller();
            if (typeof clearPlayerAutoResumeRetryTimer === 'function') clearPlayerAutoResumeRetryTimer();
            if (typeof hideBufferingIndicator === 'function') hideBufferingIndicator();
        } catch (e) {}

        // Set error image from API
        var img = document.getElementById('errorImg_serviceLocked');
        if (img && typeof ErrorImagesAPI !== 'undefined') {
            if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, ErrorImagesAPI.getImageUrl('SERVICE_LOCKED'));
            } else {
                img.src = ErrorImagesAPI.getImageUrl('SERVICE_LOCKED');
            }
        }

        // Focus on retry button
        var retryBtn = document.getElementById('appLockRetryBtn');
        if (retryBtn) retryBtn.focus();

    }
}

/**
 * Hide the app lock overlay screen
 */
function hideAppLockScreen() {
    var overlay = document.getElementById('appLockOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        appLockActive = false;
    }
}

/**
 * Retry app lock check (triggered by button or BACK key)
 */
function retryAppLockCheck() {
    checkAppLockStatus(true);
}

// ==========================================
// TRP DATA TRACKING
// ==========================================

/**
 * Send TRP data on page load for analytics/viewership tracking
 */
function sendTRPDataOnLoad() {

    if (typeof TRPDataAPI === 'undefined') {
        return;
    }

    TRPDataAPI.sendTRPData()
        .then(function (response) {
        })
        .catch(function (error) {
            // Fail silently - analytics should never block the user
            console.error("[HOME] TRP data send failed:", error);
        });
}

// ==========================================
// NETWORK CHECK HELPER
// ==========================================

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
        console.error("[HOME] Network check error:", e);
    }
    // Browser fallback
    return !navigator.onLine;
}

function hasRecentApiNetworkFailure(maxAgeMs) {
    var root = (typeof window !== 'undefined') ? window : globalThis;
    var failure = root && root.__bbnlLastApiFailure;
    if (!failure || !failure.networkLike) return false;
    var age = Date.now() - Number(failure.ts || 0);
    return age >= 0 && age <= (maxAgeMs || 8000);
}

// ==========================================
// ERROR POPUP FUNCTIONALITY
// ==========================================

var homeErrorPopupOpen = false;

/**
 * Show error popup by type
 * @param {string} type - 'failedLoad', 'loginRequired', 'noChannels'
 */
function showHomeErrorPopup(type) {
    // Hide all first
    hideHomeErrorPopups();

    var popupId = '';
    if (type === 'failedLoad') {
        popupId = 'failedLoadPopup';
    } else if (type === 'loginRequired') {
        popupId = 'loginRequiredPopup';
    } else if (type === 'noChannels') {
        popupId = 'noChannelsPopup';
    }

    var popup = document.getElementById(popupId);
    if (popup) {
        // Set error image from API
        if (typeof ErrorImagesAPI !== 'undefined') {
            if (type === 'failedLoad') {
                var img = document.getElementById('errorImg_failedLoad');
                if (img && typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                    BBNL_API.setImageSource(img, ErrorImagesAPI.getImageUrl('NO_INTERNET_CONNECTION'));
                } else if (img) {
                    img.src = ErrorImagesAPI.getImageUrl('NO_INTERNET_CONNECTION');
                }
            } else if (type === 'loginRequired') {
                var img = document.getElementById('errorImg_loginRequired');
                if (img && typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                    BBNL_API.setImageSource(img, ErrorImagesAPI.getImageUrl('LOGIN_REQUIRED'));
                } else if (img) {
                    img.src = ErrorImagesAPI.getImageUrl('LOGIN_REQUIRED');
                }
            } else if (type === 'noChannels') {
                var img = document.getElementById('errorImg_noChannels');
                if (img && typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                    BBNL_API.setImageSource(img, ErrorImagesAPI.getImageUrl('NO_CHANNELS_AVAILABLE'));
                } else if (img) {
                    img.src = ErrorImagesAPI.getImageUrl('NO_CHANNELS_AVAILABLE');
                }
            }
        }

        popup.style.display = 'flex';
        homeErrorPopupOpen = true;
        // Focus retry button
        setTimeout(function () {
            var btn = popup.querySelector('.error-popup-btn');
            if (btn) btn.focus();
        }, 100);
    }
}

/**
 * Hide all error popups
 */
function hideHomeErrorPopups() {
    var popups = ['failedLoadPopup', 'loginRequiredPopup', 'noChannelsPopup'];
    popups.forEach(function (id) {
        var popup = document.getElementById(id);
        if (popup) popup.style.display = 'none';
    });
    homeErrorPopupOpen = false;
}

// Initialize everything at DOMContentLoaded (fires BEFORE window.load)
// On Samsung TV, window.load can be delayed by seconds waiting for images/CSS.
// DOMContentLoaded fires as soon as HTML is parsed and scripts executed - much faster.
document.addEventListener('DOMContentLoaded', function () {
    if (typeof _homePageInitialized !== 'undefined' && _homePageInitialized) return;

    // Initialize UI features immediately
    initDarkMode();
    initNetworkStatus();

    // ✅ NEW: Recover failed images from previous sessions
    // If images disappeared after app restart, retry them now
    if (typeof BBNL_API !== 'undefined' && BBNL_API.retryFailedImages) {
        BBNL_API.retryFailedImages();
        console.log('[Home] Retrying failed images from persistent cache');
    }

    // Fast-path: detect return visit within same session
    // On return visits, sessionStorage cache is warm → skip IP wait and startup API calls
    var initTimestamp = sessionStorage.getItem('home_init_done');
    var isReturnVisit = false;
    if (initTimestamp) {
        var elapsed = Date.now() - Number(initTimestamp);
        // Cache valid for 30 minutes
        if (elapsed < 30 * 60 * 1000) {
            isReturnVisit = true;
        }
    }

    if (isReturnVisit) {
        // === FAST PATH: Return visit - render from cache instantly ===

        // Load data immediately from sessionStorage cache (no IP wait needed)
        loadHomeAds();
        loadHomeLanguages();
        if (!fofiShouldAutoPlay) {
            loadHomeChannels();
        } else {
            // Pre-warm channel cache for FoFi lookup
            BBNL_API.getChannelList().catch(function () {});
        }

        // Defer app lock check to background (still important for security)
        setTimeout(checkAppLockStatus, 2000);

    } else {
        // === FULL PATH: First visit - wait for IP, run all startup checks ===

        // Start API calls immediately — public IP is metadata only (auth is by device MAC/serial from Tizen hardware)
        // IP detection runs in the background; subsequent API calls will include it once detected

        (function () {
            // Check app lock status
            setTimeout(checkAppLockStatus, 50);

            // Check app version - show update popup only if server version > app version
            if (typeof BBNL_API !== 'undefined' && BBNL_API.getAppVersion) {
                BBNL_API.getAppVersion().then(function (res) {
                    if (res && res.status && Number(res.status.err_code) === 0 && res.body) {
                        var serverVersion = res.body.appversion || "";
                        var currentVersion = BBNL_API.getCurrentVersion();
                        var comparison = BBNL_API.compareVersions(serverVersion, currentVersion);

                        if (comparison > 0) {
                            // Server version is HIGHER - show update popup
                            var msg = document.getElementById('appUpdateMessage');
                            if (msg) {
                                msg.innerText = "A new version (" + serverVersion + ") is available. Please update the application.";
                            }
                            var popup = document.getElementById('appUpdatePopup');
                            if (popup) {
                                popup.style.display = 'flex';
                                var okBtn = document.getElementById('appUpdateOkBtn');
                                if (okBtn) {
                                    setTimeout(function () { okBtn.focus(); }, 100);
                                }
                            }
                        } else {
                        }
                    }
                }).catch(function (err) {
                });
            }

            // Send TRP data for analytics (non-critical, delay slightly)
            setTimeout(sendTRPDataOnLoad, 500);

            // Load ALL data in PARALLEL immediately
            // sessionStorage cache makes repeat visits instant (no API calls)
            loadHomeAds();
            loadHomeLanguages();
            if (!fofiShouldAutoPlay) {
                loadHomeChannels();
            } else {
                // Pre-warm channel cache for FoFi lookup (don't render grid, just cache data)
                BBNL_API.getChannelList().catch(function () {});
            }

            // Mark first init done - enables fast path for return visits
            try { sessionStorage.setItem('home_init_done', String(Date.now())); } catch (e) {}

        })();
    }

    // Failed to Load - Retry
    var retryLoadBtn = document.getElementById('retryLoadBtn');
    if (retryLoadBtn) {
        retryLoadBtn.addEventListener('click', function () {
            hideHomeErrorPopups();
            loadHomeLanguages();
        });
    }

    // Login Required - Retry (redirect to login)
    var retryLoginBtn = document.getElementById('retryLoginBtn');
    if (retryLoginBtn) {
        retryLoginBtn.addEventListener('click', function () {
            hideHomeErrorPopups();
            window.location.replace('index.html');
        });
    }

    // No Channels - Retry
    var retryNoChannelsBtn = document.getElementById('retryNoChannelsBtn');
    if (retryNoChannelsBtn) {
        retryNoChannelsBtn.addEventListener('click', function () {
            hideHomeErrorPopups();
            // Clear stale cache and reload everything
            if (typeof CacheManager !== 'undefined') {
                CacheManager.remove(CacheManager.KEYS.CHANNEL_LIST);
            }
            loadHomeLanguages();
            loadHomeChannels();
        });
    }
});

// ==========================================
// LCN-BASED DIRECT PLAYBACK FROM HOME
// ==========================================

/**
 * Play a channel directly by its LCN number from the home page search
 * @param {Number} lcn - The LCN number to play
 */
function showSearchNotFound(msg) {
    // Clear search input automatically
    var searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    clearTimeout(homeSearchTimeout);

    var existing = document.getElementById('search-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'search-toast';
    toast.className = 'search-toast-notification';
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(18,18,18,0.98);color:#ffffff;font-size:23px;font-weight:700;padding:18px 50px;border-radius:12px;border:2px solid #ff6b6b;z-index:9999;white-space:nowrap;pointer-events:none;';
    document.body.appendChild(toast);

    setTimeout(function () {
        if (toast.parentNode) toast.remove();
    }, 3000);
}

function playChannelByLCNFromHome(lcn) {

    BBNL_API.getChannelList()
        .then(function (channels) {
            if (!channels || !Array.isArray(channels)) {
                showSearchNotFound("Channel Not Found");
                return;
            }

            var channel = channels.find(function (ch) {
                var chNo = parseInt(ch.channelno || ch.urno || ch.chno || ch.ch_no || 0, 10);
                return chNo === lcn;
            });

            if (channel) {
                try {
                    sessionStorage.setItem('selectedLanguageId', 'all');
                    sessionStorage.setItem('selectedLanguageName', 'All Channels');
                } catch (eSet) {}
                BBNL_API.playChannel(channel);
            } else {
                showSearchNotFound("Channel Not Found");
            }
        })
        .catch(function (error) {
            console.error("[HOME] LCN lookup failed:", error);
            showSearchNotFound("Channel Not Found");
        });
}

// ==========================================
// DEFAULT CHANNEL AUTO-TUNE (LCN 999)
// ==========================================

/**
 * Auto-tune to Info Channel (LCN 999) on first app launch
 * Only triggers once per session to avoid interrupting user navigation
 */
function autoTuneDefaultChannel() {
    // Only auto-tune once per session
    if (sessionStorage.getItem('autoTuneCompleted')) {
        return;
    }


    BBNL_API.getChannelList()
        .then(function (channels) {
            if (!channels || !Array.isArray(channels) || channels.length === 0) {
                return;
            }

            // Find channel with LCN 999 (Info Channel)
            var defaultChannel = channels.find(function (ch) {
                var chNo = parseInt(ch.channelno || ch.urno || ch.chno || ch.ch_no || 0, 10);
                return chNo === 999;
            });

            if (defaultChannel) {
                sessionStorage.setItem('autoTuneCompleted', 'true');
                BBNL_API.playChannel(defaultChannel);
            } else {
                sessionStorage.setItem('autoTuneCompleted', 'true');
            }
        })
        .catch(function (error) {
            console.error("[HOME] Auto-tune failed:", error);
            sessionStorage.setItem('autoTuneCompleted', 'true');
        });
}

/**
 * Load FoFi TV logo EARLY from cache (called at DOMContentLoaded)
 * This ensures logo appears INSTANTLY before homepage data loads
 * Caches to localStorage (persists across app exits, like login credentials)
 */
function loadFoFiLogoEarly() {
    var logoImg = document.getElementById('fofitv-logo');
    var fallbackText = document.getElementById('brand-text-fallback');
    if (!logoImg) return;

    // ✅ Step 1: Try localStorage FIRST (persistent cache like login credentials)
    var cachedLogoPath = '';
    try {
        cachedLogoPath = localStorage.getItem('home_fofi_logo_raw_path') || '';
    } catch (e) {}
    
    if (cachedLogoPath) {
        BBNLLogger.debug("[HOME] Loading logo from localStorage (persistent): " + cachedLogoPath.substring(0, 50));
        showFoFiLogo(cachedLogoPath, true);  // Display cached logo INSTANTLY
        return;
    }

    // ✅ Step 2: Try sessionStorage (fast access within same session)
    try {
        cachedLogoPath = sessionStorage.getItem('home_fofi_logo_raw_path') || '';
    } catch (e) {}
    
    if (cachedLogoPath) {
        BBNLLogger.debug("[HOME] Loading logo from sessionStorage: " + cachedLogoPath.substring(0, 50));
        // Also cache to localStorage for future sessions
        try { localStorage.setItem('home_fofi_logo_raw_path', cachedLogoPath); } catch (e) {}
        showFoFiLogo(cachedLogoPath, true);  // Display cached logo INSTANTLY
        return;
    }

    // ✅ Step 3: Cache miss - fetch from API in background
    // Logo should already be fetched during login (setSession), but fetch again if needed
    if (typeof BBNL_API !== 'undefined' && typeof BBNL_API.getFoFiLogo === 'function') {
        BBNL_API.getFoFiLogo().then(function (response) {
            var logoPath = extractFoFiLogoPath(response);
            if (logoPath) {
                BBNLLogger.debug("[HOME] API returned logo path at DOMContentLoaded: " + logoPath.substring(0, 50));
                // Cache it for next load (both sessionStorage and localStorage)
                try {
                    sessionStorage.setItem('home_fofi_logo_raw_path', logoPath);
                    localStorage.setItem('home_fofi_logo_raw_path', logoPath);
                } catch (e) {}
                // Display it now
                showFoFiLogo(logoPath, true);
            }
        }).catch(function (err) {
            BBNLLogger.warn("[HOME] Failed to fetch logo at DOMContentLoaded:", err);
        });
    }
}

/**
 * Load FoFi TV logo from API and display in sidebar
 */
function loadFoFiLogo() {
    // ✅ Logo already loaded at DOMContentLoaded
    // This function is kept for compatibility but won't do anything
    // since the logo is already displayed
}

/**
 * Play FoFi Channel - Auto-play after 3 seconds on first app launch
 * Fetches FoFi channel (LCN 999) from API and plays it
 */
function playFoFiChannel() {
    console.log("[HOME] Attempting FoFi auto-play...");
    // Guard: don't start if already marked in sessionStorage
    try {
        if (sessionStorage.getItem('fofi_autoplay_done') === 'true') {
            console.log('[HOME] FoFi autoplay skipped: already done (session flag)');
            return;
        }
    } catch (eSkip) {}

    BBNL_API.getChannelList()
        .then(function (channels) {
            
            if (!channels || !Array.isArray(channels) || channels.length === 0) {
                return;
            }

            var fofiChannel = null;

            console.log("[HOME] Searching for FoFi channel...");
            // FIRST: Look for LCN 999 (FoFi Info channel)
            fofiChannel = channels.find(function (ch) {
                var chNo = parseInt(ch.channelno || ch.urno || ch.chno || ch.ch_no || 0, 10);
                return chNo === 999;
            });
            
            if (fofiChannel) {
                console.log("[HOME] FoFi channel found by LCN 999:", fofiChannel.chtitle || fofiChannel.channel_name);
            }

            // SECOND: Look for channel with "fofi" or "fo-fi" in name
            if (!fofiChannel) {
                fofiChannel = channels.find(function (ch) {
                    var title = (ch.chtitle || ch.channel_name || "").toLowerCase();
                    return title.indexOf('fofi') !== -1 || title.indexOf('fo-fi') !== -1;
                });
                if (fofiChannel) {
                    console.log("[HOME] FoFi channel found by name (fofi/fo-fi):", fofiChannel.chtitle || fofiChannel.channel_name);
                }
            }

            // THIRD: Look for "info" channel
            if (!fofiChannel) {
                fofiChannel = channels.find(function (ch) {
                    var title = (ch.chtitle || ch.channel_name || "").toLowerCase();
                    return title.indexOf('info') !== -1;
                });
                if (fofiChannel) {
                }
            }

            // NO FALLBACK: Only play FoFi channel, never fall back to other channels
            if (fofiChannel) {
                // Play FoFi channel on app launch - NO subscription restriction for FoFi
                try { sessionStorage.setItem('fofi_autoplay_done', 'true'); } catch (e) {}
                BBNL_API.playChannel(fofiChannel);
            } else {
                try { sessionStorage.setItem('fofi_autoplay_done', 'true'); } catch (e) {}
            }
        })
        .catch(function (error) {
            console.error("[HOME] ❌ FoFi auto-play failed:", error);
            sessionStorage.setItem('fofi_autoplay_done', 'true');
        });
}

// ==========================================
// PAGE LOAD - INITIALIZE ALL FEATURES
// ==========================================

// Load ads, languages, and channels after page is ready (non-blocking)
// NOTE: Actual data loading moved to DOMContentLoaded for faster start on Samsung TV.
// window.load fires AFTER all images/CSS finish, which delays data loading unnecessarily.
window.addEventListener('load', function () {
});
