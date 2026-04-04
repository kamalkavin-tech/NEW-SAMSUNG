/* ================================
   BBNL IPTV - CHANNELS PAGE CONTROLLER

   Navigation Flow:
   1. Initial: First category pill (Subscribed Channels)
   2. RIGHT/LEFT in tabs: Move through category pills
   3. DOWN from tabs: Move to channel cards
   4. RIGHT/LEFT in cards: Move horizontally
   5. UP from cards: Move to category tabs
   6. UP from tabs: Move to Back button
   7. RIGHT from Back: Move to Search
   8. DOWN from Back/Search: Move to tabs
   ================================ */

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
            } catch (e1) {}
        }

        if (backupRaw) {
            try {
                var parsedBackup = JSON.parse(backupRaw);
                if (parsedBackup && parsedBackup.userid) backupUser = parsedBackup;
            } catch (e2) {}
        }

        var resolvedUser = primaryUser || backupUser;
        if (!resolvedUser) {
            window.location.replace("login.html");
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
        window.location.replace("login.html");
    }
})();

var focusables = [];
var currentFocus = 0;
var masterChannelList = []; // MASTER LIST - ALL channels, NEVER filtered, used for LCN search
var allChannels = []; // Currently loaded channels (may be filtered)
var currentDisplayedChannels = []; // Track currently filtered/displayed channels
var allCategories = []; // Store categories globally
var currentCategory = "All";
var currentLanguage = "All";
var allLanguages = [];
var searchTimeout = null;
var selectedLanguageIndex = 0; // Index for language selector (0 = All Languages)
var masterListLoaded = false; // Flag to track if master list is loaded
var channelLogoCache = {}; // Reuse loaded logos across category switches
var channelLogoSourceMap = {}; // Normalized logo key -> last successful ORIGINAL HTTP src (NOT blob URLs)

// Restore instantly from sessionStorage for fast re-entries
try {
    var rawLogoStr = sessionStorage.getItem('bbnl_logo_cache_map');
    if (rawLogoStr) {
        var parsed = JSON.parse(rawLogoStr);
        for (var k in parsed) {
            var val = parsed[k];
            // CRITICAL: Skip blob URLs — they're dead after page navigation
            if (typeof val === 'string' && val.indexOf('blob:') === 0) continue;
            channelLogoSourceMap[k] = val;
            channelLogoCache[k] = true;
        }
    }
} catch(e) {}

// NOTE: Using 'pagehide' instead of 'beforeunload' to allow BFCache.
window.addEventListener('pagehide', function() {
    try {
        var cleanMap = {};
        for (var k in channelLogoSourceMap) {
            var val = channelLogoSourceMap[k];
            // CRITICAL: Never persist blob URLs — they die on page navigation
            if (typeof val === 'string' && val.indexOf('blob:') === 0) continue;
            cleanMap[k] = val;
        }
        if (Object.keys(cleanMap).length > 0) {
            sessionStorage.setItem('bbnl_logo_cache_map', JSON.stringify(cleanMap));
        }
    } catch(e) {}
});
var channelsSearchActivated = false; // Only activate keypad after explicit user action
var _channelLogoPrefetchInFlight = {}; // Prevent duplicate prefetches during rapid category switches
var channelsResultCache = {}; // Reuse channel API responses per filter/category
var CHANNELS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes — reduces API calls on page navigation
var channelsPageExiting = false;
var _allChannelsObjectIndexMap = null;

function rebuildAllChannelsObjectIndexMap() {
    _allChannelsObjectIndexMap = null;
    if (typeof Map === 'undefined' || !Array.isArray(allChannels) || allChannels.length === 0) return;
    var map = new Map();
    for (var i = 0; i < allChannels.length; i++) {
        map.set(allChannels[i], i);
    }
    _allChannelsObjectIndexMap = map;
}

function exitChannelsToHome() {
    channelsPageExiting = true;
    if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
    }
    try { hideErrorPopups(); } catch (e) {}
    setChannelsLoadingState(false);

    window.__BBNL_NAVIGATING = true;
    sessionStorage.removeItem('selectedLanguageId');
    sessionStorage.removeItem('selectedLanguageName');
    sessionStorage.setItem('returningFromChannels', 'true');
    window.location.replace("home.html");
}

function normalizeChannelLogoKey(url) {
    if (!url) return '';
    var resolved = String(url).trim();
    if (!resolved) return '';
    try {
        var u = new URL(resolved, window.location.href);
        return u.origin + u.pathname;
    } catch (e) {
        return resolved.split('?')[0].split('#')[0];
    }
}

function resolveChannelAssetUrl(rawUrl) {
    if (rawUrl === null || rawUrl === undefined) return '';
    var value = String(rawUrl).trim();
    if (!value) return '';

    var apiBase = (typeof BBNL_API !== 'undefined' && BBNL_API.BASE_URL)
        ? String(BBNL_API.BASE_URL).trim()
        : '';
    var appOrigin = (window.location && window.location.origin && window.location.origin !== 'null')
        ? window.location.origin
        : '';

    var preferredOrigin = '';
    try {
        if (apiBase) {
            preferredOrigin = new URL(apiBase, window.location.href).origin;
        }
    } catch (e) {}
    if (!preferredOrigin) preferredOrigin = appOrigin;

    // Replace localhost image hosts with reachable app/api origin.
    if (preferredOrigin) {
        value = value.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i, preferredOrigin);
    }

    if (/^https?:\/\//i.test(value)) return value;
    if (value.indexOf('//') === 0) return (window.location.protocol || 'https:') + value;

    try {
        if (value.charAt(0) === '/' && preferredOrigin) {
            return preferredOrigin + value;
        }
        if (apiBase) {
            return new URL(value, apiBase + '/').href;
        }
    } catch (e2) {}

    return value;
}

// NOTE: Using 'pagehide' instead of 'beforeunload' to allow BFCache.
window.addEventListener('pagehide', function () {
    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.savePageState) {
        AppPerformanceCache.savePageState('channels', {
            focusIndex: currentFocus,
            searchText: '',
            currentCategory: currentCategory,
            currentLanguage: currentLanguage,
            scrollTop: window.scrollY || 0
        });
    }
});

// BFCache restoration: skip heavy re-initialization when page is restored from cache.
var _channelsPageInitialized = false;
window.addEventListener('pageshow', function (event) {
    if (event.persisted && _channelsPageInitialized) {
        // Page restored from BFCache — DOM, JS state, images all intact!
        // Just re-register remote keys.
        if (typeof RemoteKeys !== 'undefined') {
            RemoteKeys.registerAllKeys();
        }
        return; // Skip window.onload entirely
    }
});

// Navigation zones: 'sidebar', 'topControls' (back, search), 'tabs' (category pills), 'cards' (channel cards)
var currentZone = 'sidebar';
var lastTopControlElement = null; // Track last focused top control for UP navigation
var sidebarCategoryIndex = 0; // Track focused category in sidebar

window.onload = function () {

    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.primeAfterLogin) {
        AppPerformanceCache.primeAfterLogin(false);
    }

    // Initialize Dark Mode from localStorage
    initDarkMode();

    // Initialize UI
    initPage();

    // Language pills are initialized dynamically in renderLanguagePills()

    // Initialize search functionality
    initSearchFunctionality();

    // Restore lightweight UI state for smoother return navigation.
    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.getPageState) {
        var cachedState = AppPerformanceCache.getPageState('channels', 60 * 60 * 1000);
        if (cachedState) {
            var searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.value = '';
            }
            if (typeof cachedState.focusIndex === 'number') {
                currentFocus = cachedState.focusIndex;
            }
            if (typeof cachedState.scrollTop === 'number') {
                setTimeout(function () { window.scrollTo(0, cachedState.scrollTop); }, 0);
            }
        }
    }

    // Add zone tracking listeners
    addZoneTrackingListeners();
    
    // Initial focus will be set by setInitialFocus() called from initPage()
    // (Sidebar is hidden on this page, so we don't focus sidebar elements)

    // Register All Remote Keys (supports all Samsung remote types)
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
            tizen.tvinputdevice.registerKeyBatch(keys);
        } catch (e) { }
    }
};

// Add listeners to track which zone is focused
function addZoneTrackingListeners() {
    // Sidebar elements
    var sidebarElements = document.querySelectorAll('.channels-sidebar .focusable');
    sidebarElements.forEach(function(el) {
        el.addEventListener('focus', function() {
            currentZone = 'sidebar';
            // [Channels Navigation] Zone: Sidebar');
        });
    });
    
    // Top controls (back button, search input)
    var topControls = document.querySelectorAll('.back-btn, .search-input');
    topControls.forEach(function (el) {
        el.addEventListener('focus', function () {
            currentZone = 'topControls';
            lastTopControlElement = el; // Remember which top control was focused
            // [Channels Navigation] Zone: Top Controls');
        });
    });

    // Category pills
    var pills = document.querySelectorAll('.category-pill');
    pills.forEach(function (pill) {
        pill.addEventListener('focus', function () {
            currentZone = 'tabs';
            // [Channels Navigation] Zone: Tabs');
        });
    });

    // Channel cards - use event delegation since cards load dynamically
    document.addEventListener('focus', function (e) {
        if (e.target.classList.contains('channel-card')) {
            currentZone = 'cards';
            // [Channels Navigation] Zone: Cards');
        }
    }, true);
}

async function initPage() {
    // Determine language filter early — needed for instant render AND channel loading
    var urlParams = new URLSearchParams(window.location.search);
    var urlLCN = urlParams.get('lcn');
    var urlLang = urlParams.get('lang');
    var selectedLangId = sessionStorage.getItem('selectedLanguageId') || '';
    var selectedLangName = sessionStorage.getItem('selectedLanguageName') || '';
    var normalizedLangId = String(selectedLangId || '').trim().toLowerCase();

    // Build channel load options from language filter (never send langid=all to API — use unfiltered fetch)
    var channelOptions = {};
    if (selectedLangId === 'subs' || (selectedLangName && selectedLangName.toLowerCase().indexOf('subscribed') !== -1)) {
        channelOptions = { subscribed: 'yes' };
    } else if (normalizedLangId === 'all' || normalizedLangId === 'all channels') {
        channelOptions = {};
    } else if (selectedLangId && selectedLangId !== '') {
        channelOptions = { langid: selectedLangId };
    } else if (urlLang) {
        channelOptions = { langid: urlLang };
    }

    // INSTANT RENDER: Show cached channels immediately (no black screen)
    try {
        var cached = getCachedChannels(channelOptions);
        // Fallback: try CacheManager (localStorage) if sessionStorage empty
        if (!cached && typeof CacheManager !== 'undefined') {
            cached = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true);
        }
        if (cached && cached.length > 0) {
            allChannels = cached;
            renderAllChannels(allChannels);
            setChannelsLoadingState(false);
        }
    } catch (e) {}

    // Render language pills from CacheManager instantly (cached from home page visit)
    try {
        if (typeof CacheManager !== 'undefined') {
            var cachedLangs = CacheManager.get(CacheManager.KEYS.LANGUAGES) || CacheManager.get(CacheManager.KEYS.LANGUAGES, true);
            if (cachedLangs && cachedLangs.length > 0) {
                renderLanguagePills(cachedLangs);
            }
        }
    } catch (e) {}

    // Check if LCN was passed via URL (from home page search)
    if (urlLCN && /^\d+$/.test(urlLCN)) {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = urlLCN;
        playChannelByLCN(parseInt(urlLCN, 10));
        return;
    }

    try {
        // Master list first so loadChannels can filter in-memory reliably (avoids empty grid races).
        await loadMasterChannelList();
        var [languageResponse, channelsResult] = await Promise.all([
            BBNL_API.getLanguageList(),
            loadChannels(channelOptions)
        ]);

        // Update pills if API returned newer data
        if (Array.isArray(languageResponse) && languageResponse.length > 0) {
            renderLanguagePills(languageResponse);
        }
    } catch (e) {
        console.error("Init Exception:", e);
        if (isNetworkDisconnected() || hasRecentApiNetworkFailure()) {
            showErrorPopup('internet');
        }
    }

    refreshFocusables();
    setInitialFocus();
    
    // Mark as initialized for BFCache pageshow support
    _channelsPageInitialized = true;
}

/**
 * Load the MASTER channel list - ALL channels without any filters
 * This list is used ONLY for LCN search and is NEVER modified by filters
 */
async function loadMasterChannelList() {
    if (masterListLoaded && masterChannelList.length > 0) {
        return;
    }

    // Check sessionStorage cache first to avoid API call on page reload (e.g. returning from player)
    try {
        var raw = sessionStorage.getItem('master_channel_list_cache');
        if (raw) {
            var parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.data) && parsed.ts && (Date.now() - Number(parsed.ts)) < CHANNELS_CACHE_TTL_MS) {
                masterChannelList = parsed.data;
                masterListLoaded = true;
                return;
            }
        }
    } catch (e) {}

    try {
        const response = await BBNL_API.getChannelList({}); // No filters = ALL channels

        if (Array.isArray(response) && response.length > 0) {
            masterChannelList = response;
            masterListLoaded = true;
            try {
                sessionStorage.setItem('master_channel_list_cache', JSON.stringify({ ts: Date.now(), data: response }));
            } catch (e) {}
        } else {
        }
    } catch (e) {
        console.error("[Channels] Error loading master channel list:", e);
    }
}

function setInitialFocus() {
    // Focus active language pill (or first pill)
    var activePill = document.querySelector('.lang-pill.active');
    if (activePill) {
        activePill.focus();
        currentZone = 'tabs';
        return;
    }

    var firstPill = document.querySelector('.lang-pill.focusable');
    if (firstPill) {
        firstPill.focus();
        currentZone = 'tabs';
    }
}

// ==========================================
// CATEGORY PILLS FUNCTIONALITY
// ==========================================

function renderLanguagePills(languages) {
    allLanguages = languages;
    _pillsCache = null;
    if (_pillDebounce) {
        clearTimeout(_pillDebounce);
        _pillDebounce = null;
    }

    var container = document.getElementById('languagePillsRow');
    if (!container) return;

    container.innerHTML = '';

    // Sort: "All Channels" first, "Subscribed" second, then alphabetical
    var sorted = languages.slice().sort(function (a, b) {
        var nameA = (a.langtitle || '').toLowerCase();
        var nameB = (b.langtitle || '').toLowerCase();
        if (nameA === 'all channels' || nameA === 'all') return -1;
        if (nameB === 'all channels' || nameB === 'all') return 1;
        if (nameA.indexOf('subscribed') !== -1) return -1;
        if (nameB.indexOf('subscribed') !== -1) return 1;
        return nameA.localeCompare(nameB);
    });

    // Determine which pill should be active
    var activeLangId = sessionStorage.getItem('selectedLanguageId') || '';
    var activeLangName = sessionStorage.getItem('selectedLanguageName') || '';
    var normalizedActiveLangId = String(activeLangId || '').trim().toLowerCase();

    var fragment = document.createDocumentFragment();

    sorted.forEach(function (lang, index) {
        var langName = lang.langtitle || 'Language';
        var langId = lang.langid || '';
        var langLogo = lang.langlogo || lang.chnllanglogo || lang.logo_url || lang.logo || '';

        var pill = document.createElement('button');
        pill.className = 'category-pill lang-pill focusable';
        pill.tabIndex = 0;
        pill.dataset.langid = langId;
        pill.dataset.langname = langName;

        // Text only — no logo images in pills (faster rendering on TV)
        var span = document.createElement('span');
        span.textContent = langName;
        pill.appendChild(span);

        // Mark active pill
        var isAllChannels = langName.toLowerCase() === 'all channels' || langName.toLowerCase() === 'all' || langId === '';
        if (activeLangId) {
            if (activeLangId === langId) pill.classList.add('active');
            else if (activeLangId === 'subs' && langName.toLowerCase().indexOf('subscribed') !== -1) pill.classList.add('active');
            else if ((normalizedActiveLangId === 'all' || normalizedActiveLangId === 'all channels') && isAllChannels) pill.classList.add('active');
        } else if (!activeLangName && index === 0) {
            pill.classList.add('active');
        }

        // Click handler — filter channels by language
        pill.addEventListener('click', function () {
            // Remove active from all pills
            var allPills = container.querySelectorAll('.lang-pill');
            allPills.forEach(function (p) { p.classList.remove('active'); });
            pill.classList.add('active');

            if (!langId || langId === '' || isAllChannels) {
                sessionStorage.setItem('selectedLanguageId', 'all');
                sessionStorage.setItem('selectedLanguageName', 'All Channels');
            } else {
                sessionStorage.setItem('selectedLanguageId', langId);
                sessionStorage.setItem('selectedLanguageName', langName);
            }

            // Load channels with language filter
            if (!langId || langId === '' || isAllChannels) {
                loadChannels();
            } else if (langId === 'subs' || langName.toLowerCase().indexOf('subscribed') !== -1) {
                loadChannels({ subscribed: 'yes' });
            } else {
                loadChannels({ langid: langId });
            }
        });

        // Zone tracking
        pill.addEventListener('focus', function () { currentZone = 'tabs'; });

        fragment.appendChild(pill);
    });

    container.appendChild(fragment);
}

// ==========================================
// SIDEBAR CATEGORIES FUNCTIONALITY
// ==========================================

function renderSidebarCategories(categories) {
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) return;

    invalidateSidebarCache(); // clear cached category elements
    categoryList.innerHTML = '';
    
    // Check if language filter is active
    const hasLanguageFilter = sessionStorage.getItem('selectedLanguageId') || sessionStorage.getItem('selectedLanguageName');
    
    var frag = document.createDocumentFragment();
    categories.forEach((cat, index) => {
        const item = document.createElement('div');
        item.className = 'category-item focusable';
        item.tabIndex = 0;
        item.dataset.category = (cat.grtitle || '').toLowerCase();
        item.dataset.grid = cat.grid || '';
        item.dataset.index = index;

        // Create category name span
        const nameSpan = document.createElement('span');
        nameSpan.className = 'category-name';
        nameSpan.textContent = cat.grtitle || 'Unknown';

        // Create category count span (will be updated when channels load)
        const countSpan = document.createElement('span');
        countSpan.className = 'category-count';
        countSpan.textContent = '(...)';
        countSpan.id = 'count-' + (cat.grid || index);

        item.appendChild(nameSpan);
        item.appendChild(countSpan);

        // Mark first as active if no language filter
        if (index === 0 && !hasLanguageFilter) {
            item.classList.add('active');
        }

        // Focus listener
        item.addEventListener('focus', function() {
            currentZone = 'sidebar';
            sidebarCategoryIndex = index;
        });

        // Click/Enter handler
        item.addEventListener('click', function() {
            handleSidebarCategorySelect(item);
        });

        frag.appendChild(item);
    });
    categoryList.appendChild(frag);
    
    // Update channel counts after channels are loaded
    setTimeout(updateCategoryCounts, 500);
}

function updateCategoryCounts() {
    if (allChannels.length === 0) {
        // Try again after delay if channels not loaded yet
        setTimeout(updateCategoryCounts, 500);
        return;
    }
    
    const categoryItems = document.querySelectorAll('.category-item');
    categoryItems.forEach(item => {
        const categoryName = item.dataset.category;
        const grid = item.dataset.grid;
        
        // Count channels matching this category
        let count = 0;
        if (categoryName === 'all' || grid === '') {
            count = allChannels.length;
        } else {
            count = allChannels.filter(ch => {
                const chCategory = (ch.grtitle || '').toLowerCase();
                return chCategory === categoryName;
            }).length;
        }
        
        const countSpan = item.querySelector('.category-count');
        if (countSpan) {
            countSpan.textContent = '(' + count + ')';
        }
    });
}

function handleSidebarCategorySelect(item) {
    // Remove active from all sidebar categories (use cached list)
    getCachedSidebarCategories().forEach(function(el) {
        el.classList.remove('active');
    });
    
    // Add active to selected
    item.classList.add('active');
    
    // Keep language pill / sessionStorage (e.g. English) — only filter by sidebar category.
    var savedLangName = sessionStorage.getItem('selectedLanguageName') || '';
    if (savedLangName && allLanguages.length > 0) {
        var matchIdx = allLanguages.findIndex(function (lang) {
            return String(lang.langtitle || lang.lalng || lang.name || '').toLowerCase() === savedLangName.toLowerCase();
        });
        if (matchIdx >= 0) {
            selectedLanguageIndex = matchIdx + 1;
        }
    }
    updateLanguageSelectorDisplay();
    updateHeaderWithLanguage(savedLangName || null);
    
    // Filter channels by this category
    const categoryName = item.dataset.category;
    const grid = item.dataset.grid;
    
    filterChannelsByCategory(categoryName, grid);
}

function filterChannelsByCategory(categoryName, grid) {
    let filteredChannels;
    
    if (categoryName === 'all' || grid === '' || !categoryName) {
        filteredChannels = allChannels;
    } else {
        filteredChannels = allChannels.filter(ch => {
            const chCategory = (ch.grtitle || '').toLowerCase();
            return chCategory === categoryName;
        });
    }
    
    renderAllChannels(filteredChannels);
}

// Language selector functions
function initLanguageSelector() {
    const leftArrow = document.getElementById('langArrowLeft');
    const rightArrow = document.getElementById('langArrowRight');
    const langText = document.getElementById('selectedLanguageText');
    
    if (leftArrow) {
        leftArrow.addEventListener('click', function() {
            changeLanguageSelection(-1);
        });
        leftArrow.addEventListener('focus', function() {
            currentZone = 'sidebar';
        });
    }
    
    if (rightArrow) {
        rightArrow.addEventListener('click', function() {
            changeLanguageSelection(1);
        });
        rightArrow.addEventListener('focus', function() {
            currentZone = 'sidebar';
        });
    }
    
    if (langText) {
        langText.addEventListener('focus', function() {
            currentZone = 'sidebar';
        });
    }
    
    // Check if there was a previously selected language
    const savedLangName = sessionStorage.getItem('selectedLanguageName');
    if (savedLangName && allLanguages.length > 0) {
        const idx = allLanguages.findIndex(lang => 
            (lang.name || lang.lalng || '').toLowerCase() === savedLangName.toLowerCase()
        );
        if (idx >= 0) {
            selectedLanguageIndex = idx + 1; // +1 because 0 is "All Languages"
        }
    }
    
    updateLanguageSelectorDisplay();
}

function changeLanguageSelection(direction) {
    const totalOptions = allLanguages.length + 1; // +1 for "All Languages"
    selectedLanguageIndex += direction;
    
    // Wrap around
    if (selectedLanguageIndex < 0) {
        selectedLanguageIndex = totalOptions - 1;
    } else if (selectedLanguageIndex >= totalOptions) {
        selectedLanguageIndex = 0;
    }
    
    updateLanguageSelectorDisplay();
    applyLanguageFilter();
}

function updateLanguageSelectorDisplay() {
    const langText = document.getElementById('selectedLanguageText');
    if (!langText) return;
    
    if (selectedLanguageIndex === 0) {
        langText.textContent = 'All Languages';
    } else {
        const lang = allLanguages[selectedLanguageIndex - 1];
        langText.textContent = lang ? (lang.name || lang.lalng || 'Unknown') : 'Unknown';
    }
}

function applyLanguageFilter() {
    if (selectedLanguageIndex === 0) {
        sessionStorage.setItem('selectedLanguageId', 'all');
        sessionStorage.setItem('selectedLanguageName', 'All Channels');
        updateHeaderWithLanguage(null);
        
        // Show all channels
        renderAllChannels(allChannels);
    } else {
        const lang = allLanguages[selectedLanguageIndex - 1];
        if (lang) {
            const langName = lang.name || lang.lalng || '';
            const langId = lang.id || lang.value || '';
            
            sessionStorage.setItem('selectedLanguageId', langId);
            sessionStorage.setItem('selectedLanguageName', langName);
            updateHeaderWithLanguage(langName);
            
            // Filter channels by language
            const filteredChannels = allChannels.filter(ch => {
                const chLang = (ch.lalng || ch.language || '').toLowerCase();
                return chLang === langName.toLowerCase();
            });
            
            renderAllChannels(filteredChannels);
        }
    }
    
    // Clear category selection when language changes (use cached list)
    getCachedSidebarCategories().forEach(function(el) {
        el.classList.remove('active');
    });
}

function initCategoryPills() {
    const pills = document.querySelectorAll('.category-pill[data-category]');

    pills.forEach(pill => {
        pill.addEventListener('click', function () {
            if (pill.id === 'languagePill') return;

            // Remove active from ALL pills including language pill
            pills.forEach(p => {
                p.classList.remove('active');
            });
            var languagePill = document.getElementById('languagePill');
            if (languagePill) {
                languagePill.classList.remove('active');
            }
            
            // Clear language filter when category is selected
            sessionStorage.removeItem('selectedLanguageId');
            sessionStorage.removeItem('selectedLanguageName');
            
            // Reset language pill text
            if (languagePill) {
                var textSpan = languagePill.querySelector('span');
                if (textSpan) {
                    textSpan.textContent = 'Language';
                }
            }
            
            // Update header title
            updateHeaderWithLanguage(null);

            pill.classList.add('active');

            const category = pill.dataset.category;
            const gridId = pill.dataset.grid;
            handleCategoryFilter(category, gridId);
        });
    });
}

function handleCategoryFilter(category, gridId) {

    currentCategory = category;

    var options = {};
    if (gridId === '' || !gridId) {
        options = {};
    } else if (gridId === 'subs') {
        options = { subscribed: 'yes' };
    } else {
        options = { grid: gridId };
    }

    // Pre-warm logo cache from cached channel data for this category so images
    // appear instantly when the grid renders instead of lazy-loading from blank.
    var previewChannels = getCachedChannels(options);
    if (previewChannels && previewChannels.length > 0) {
        primeChannelLogoCache(previewChannels, previewChannels.length);
    }

    loadChannels(options);
}

// ==========================================
// HEADER LANGUAGE DISPLAY
// ==========================================

/**
 * Update the header title and language pill based on selected language
 */
function updateHeaderWithLanguage(languageName) {
    // Update page title
    const titleLanguage = document.getElementById('titleLanguage');
    if (titleLanguage) {
        if (languageName && languageName !== 'All' && languageName !== 'All Languages') {
            titleLanguage.textContent = ' - ' + languageName;
        } else {
            titleLanguage.textContent = '';
        }
    }

    // Update language pill
    const languagePill = document.getElementById('languagePill');
    if (languagePill) {
        const textSpan = languagePill.querySelector('span');
        if (textSpan) {
            if (languageName && languageName !== 'All' && languageName !== 'All Languages') {
                textSpan.textContent = 'Language - ' + languageName;
            } else {
                textSpan.textContent = 'Language';
            }
        }
    }
}

// ==========================================
// LANGUAGE DROPDOWN FUNCTIONALITY
// ==========================================

function initLanguageDropdown() {
    const languagePill = document.getElementById('languagePill');

    if (languagePill) {
        languagePill.addEventListener('click', function (e) {
            e.stopPropagation();
            window.location.href = 'language-select.html';
        });
    }
}

// ==========================================
// SEARCH FUNCTIONALITY
// ==========================================

function initSearchFunctionality() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.setAttribute('type', 'tel');
        searchInput.setAttribute('inputmode', 'numeric'); // Samsung native numeric keypad (same as login page)
        searchInput.setAttribute('pattern', '[0-9]*');
        searchInput.setAttribute('autocomplete', 'off');
        searchInput.readOnly = false; // Allow Samsung native keypad to open on focus/OK
        searchInput.value = '';

        // Re-ensure readOnly=false on focus (same pattern as login page phone input)
        searchInput.addEventListener('focus', function () {
            searchInput.readOnly = false;
        });

        // Prevent wheel/trackpad value scroll behavior while focused.
        searchInput.addEventListener('wheel', function (e) {
            e.preventDefault();
        }, { passive: false });

        searchInput.addEventListener('click', function () {
            channelsSearchActivated = true;
            searchInput.focus();
        });

        searchInput.addEventListener('blur', function () {
            channelsSearchActivated = false;
        });

        searchInput.addEventListener('input', function () {
            searchInput.value = String(searchInput.value || '').replace(/\D/g, '').slice(0, 4);
            clearTimeout(searchTimeout);
            if (searchInput.value.length > 0) {
                searchTimeout = setTimeout(function () {
                    var lcn = parseInt(searchInput.value, 10);
                    playChannelByLCN(lcn);
                }, 3000);
            }
        });

        searchInput.addEventListener('keydown', function (e) {
            if (e.keyCode === 13 && searchInput.value.replace(/[^0-9]/g, '').trim().length > 0) {
                e.preventDefault();
                clearTimeout(searchTimeout);
                playChannelByLCN(parseInt(searchInput.value, 10));
            }
        });
    }
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
        console.error("[Channels] Network check error:", e);
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

function setChannelsLoadingState(isLoading) {
    var container = document.getElementById('channel-grid-container');
    if (!container) return;
    if (isLoading) {
        container.classList.add('channels-loading');
    } else {
        container.classList.remove('channels-loading');
    }
}

function buildChannelsCacheKey(options) {
    var o = options || {};
    return [
        o.grid || '',
        o.langid || '',
        o.search || '',
        o.subscribed || ''
    ].join('|');
}

function getCachedChannels(options) {
    var key = buildChannelsCacheKey(options);
    var cached = channelsResultCache[key];
    if (Array.isArray(cached)) return cached;

    try {
        var persistKey = 'channels_cache_' + key;
        var raw = sessionStorage.getItem(persistKey);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.data) || !parsed.ts) return null;
        if ((Date.now() - Number(parsed.ts)) > CHANNELS_CACHE_TTL_MS) {
            sessionStorage.removeItem(persistKey);
            return null;
        }
        channelsResultCache[key] = parsed.data.slice();
        return parsed.data;
    } catch (e) {
        return null;
    }
}

function setCachedChannels(options, channels) {
    if (!Array.isArray(channels)) return;
    var key = buildChannelsCacheKey(options);
    // Keep an immutable snapshot to avoid accidental mutations.
    channelsResultCache[key] = channels.slice();
    try {
        var persistKey = 'channels_cache_' + key;
        sessionStorage.setItem(persistKey, JSON.stringify({ ts: Date.now(), data: channels.slice() }));
    } catch (e) {}
}

function clearChannelsResultCache() {
    channelsResultCache = {};
}

function primeChannelLogoCache(channels, maxCount) {
    if (!Array.isArray(channels) || channels.length === 0) return;
    var limit = Math.min(maxCount || 36, channels.length);

    // Build a queue of URLs to prefetch (skip already cached)
    var queue = [];
    for (var i = 0; i < limit; i++) {
        var ch = channels[i] || {};
        var logoUrl = getChannelCardLogo(ch);
        if (typeof BBNL_API !== 'undefined' && BBNL_API.getValidatedImageUrl) {
            logoUrl = BBNL_API.getValidatedImageUrl(logoUrl);
        }
        var logoKey = normalizeChannelLogoKey(logoUrl);
        if (!logoUrl || !logoKey) continue;
        var globalCached = typeof BBNL_API !== 'undefined' && BBNL_API.isImageCached && BBNL_API.isImageCached(logoUrl);
        if (channelLogoCache[logoKey] || _channelLogoPrefetchInFlight[logoKey] || globalCached) {
            if (globalCached) channelLogoCache[logoKey] = true;
            continue;
        }
        queue.push({ key: logoKey, url: logoUrl });
    }

    // Throttled loader: max 4 concurrent image loads (prevents TV bandwidth/memory flood)
    var MAX_CONCURRENT = 4;
    var active = 0;
    var idx = 0;

    function loadNext() {
        while (active < MAX_CONCURRENT && idx < queue.length) {
            var item = queue[idx++];
            active++;
            _channelLogoPrefetchInFlight[item.key] = true;
            (function (urlKey, srcUrl) {
                var img = new Image();
                img.onload = function () {
                    channelLogoCache[urlKey] = true;
                    channelLogoCache[srcUrl] = true;
                    // Store original HTTP URL, NOT this.src (which may be blob: on Tizen)
                    channelLogoSourceMap[urlKey] = srcUrl;
                    delete _channelLogoPrefetchInFlight[urlKey];
                    if (typeof BBNL_API !== 'undefined' && BBNL_API.markImageCached) BBNL_API.markImageCached(srcUrl);
                    active--;
                    loadNext();
                };
                img.onerror = function () {
                    // Try alternative image paths before giving up
                    var alts = (typeof _generateAlternativeImagePaths === 'function')
                        ? _generateAlternativeImagePaths(srcUrl)
                        : [];
                    if (alts.length > 0) {
                        var altI = 0;
                        var prefImg = this;
                        function tryAlt() {
                            if (altI >= alts.length) {
                                delete _channelLogoPrefetchInFlight[urlKey];
                                active--;
                                loadNext();
                                return;
                            }
                            var altUrl = alts[altI++];
                            prefImg.onload = function() {
                                channelLogoCache[urlKey] = true;
                                channelLogoCache[altUrl] = true;
                                // Store HTTP URL, not blob URL
                                channelLogoSourceMap[urlKey] = altUrl;
                                delete _channelLogoPrefetchInFlight[urlKey];
                                if (typeof BBNL_API !== 'undefined' && BBNL_API.markImageCached) BBNL_API.markImageCached(altUrl);
                                active--;
                                loadNext();
                            };
                            prefImg.onerror = function() { tryAlt(); };
                            prefImg.src = altUrl;
                        }
                        tryAlt();
                    } else {
                        delete _channelLogoPrefetchInFlight[urlKey];
                        active--;
                        loadNext();
                    }
                };
                img.src = srcUrl;
            })(item.key, item.url);
        }
    }
    loadNext();
}

function getChannelCardLogo(ch) {
    if (!ch || typeof ch !== 'object') return '';
    var candidates = [
        ch.chlogo,
        ch.chnllogo,
        ch.logo_url,
        ch.channel_logo,
        ch.channellogo,
        ch.logo,
        ch.logo_path,
        ch.default_logo,
        ch.defaultimage,
        ch.image
    ];

    for (var i = 0; i < candidates.length; i++) {
        var value = candidates[i];
        if (value === null || value === undefined) continue;
        var str = String(value).trim();
        if (str) return resolveChannelAssetUrl(str);
    }
    return '';
}

// ==========================================
// ERROR POPUP FUNCTIONALITY
// ==========================================

function showErrorPopup(type) {
    if (channelsPageExiting) return;

    // Set error images from API
    if (typeof ErrorImagesAPI !== 'undefined') {
        if (type === 'channels') {
            var img = document.getElementById('errorImg_noChannels');
            if (img && typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, ErrorImagesAPI.getImageUrl('NO_CHANNELS_AVAILABLE'));
            } else if (img) {
                img.src = ErrorImagesAPI.getImageUrl('NO_CHANNELS_AVAILABLE');
            }
        } else if (type === 'internet') {
            var img = document.getElementById('errorImg_noInternet');
            if (img && typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, ErrorImagesAPI.getImageUrl('NO_INTERNET_CONNECTION'));
            } else if (img) {
                img.src = ErrorImagesAPI.getImageUrl('NO_INTERNET_CONNECTION');
            }
        }
    }

    if (type === 'channels') {
        document.getElementById('noChannelsPopup').style.display = 'flex';
        document.getElementById('noInternetPopup').style.display = 'none';
    } else if (type === 'internet') {
        document.getElementById('noInternetPopup').style.display = 'flex';
        document.getElementById('noChannelsPopup').style.display = 'none';
    }

    setTimeout(() => {
        const retryBtn = document.querySelector('.error-popup-overlay[style*="flex"] .error-popup-btn');
        if (retryBtn) retryBtn.focus();
    }, 100);
}

function hideErrorPopups() {
    document.getElementById('noChannelsPopup').style.display = 'none';
    document.getElementById('noInternetPopup').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function () {
    const retryChannelsBtn = document.getElementById('retryChannelsBtn');
    const retryInternetBtn = document.getElementById('retryInternetBtn');

    if (retryChannelsBtn) {
        retryChannelsBtn.addEventListener('click', async function () {
            hideErrorPopups();
            await loadChannels();
        });
    }

    if (retryInternetBtn) {
        retryInternetBtn.addEventListener('click', async function () {
            hideErrorPopups();
            await initPage();
        });
    }
});

async function loadChannels(options = {}) {
    if (channelsPageExiting) return;

    const container = document.getElementById("channel-grid-container");
    if (!container) return;

    const apiOptions = {
        grid: options.grid || "",
        langid: options.langid || "",
        search: options.search || "",
        subscribed: options.subscribed || ""
    };

    // Guard: never send synthetic "all" as lang filter (backend treats it as a real langid and returns empty).
    var normalizedApiLangId = String(apiOptions.langid || '').trim().toLowerCase();
    if (normalizedApiLangId === 'all' || normalizedApiLangId === 'all channels') {
        apiOptions.langid = '';
    }

    // Fast path: render from in-memory cache when user switches back to an already loaded category.
    var cachedChannels = getCachedChannels(apiOptions);
    if (cachedChannels && cachedChannels.length > 0) {
        allChannels = cachedChannels.slice();
        renderAllChannels(allChannels);
        setChannelsLoadingState(false);
        return;
    }

    // Keep existing cards visible during filter changes to avoid abrupt flash/reload effect.
    if (!container.querySelector('.channels-grid')) {
        container.innerHTML = '<div class="loading-spinner">Loading Channels...</div>';
    }
    setChannelsLoadingState(true);

    hideErrorPopups();

    try {
        // Clear channel cache if user just completed subscription
        if (sessionStorage.getItem('subscription_completed') === 'true') {
            if (typeof CacheManager !== 'undefined') {
                CacheManager.remove(CacheManager.KEYS.CHANNEL_LIST);
                CacheManager.remove(CacheManager.KEYS.CATEGORIES);
            }
            clearChannelsResultCache();
            masterChannelList = [];
            masterListLoaded = false;
            sessionStorage.removeItem('subscription_completed');
        }

        let response = [];

        // PERFORMANCE: Filter master list in-memory instead of calling API if possible
        if (masterListLoaded && masterChannelList.length > 0 && !apiOptions.search) {
            let filtered = masterChannelList;
            
            // Apply Subscribed filter
            if (apiOptions.subscribed) {
                filtered = filtered.filter(ch => ch.subscribed === "yes" || ch.subscribed === "1" || ch.subscribed === true || ch.subscribed === 1);
            }
            
            // Apply Grid (Category) filter - careful with missing grids
            if (apiOptions.grid) {
                filtered = filtered.filter(ch => {
                    const gridStr = String(ch.grid || '');
                    const catStr = (ch.grtitle || '').toLowerCase();
                    return gridStr === String(apiOptions.grid) || 
                           catStr === String(apiOptions.grid).toLowerCase() ||
                           catStr === String(currentCategory).toLowerCase();
                });
            }
            
            // Apply Language filter
            if (apiOptions.langid) {
                const targetLangName = (sessionStorage.getItem('selectedLanguageName') || '').toLowerCase();
                filtered = filtered.filter(ch => {
                    const chLangId = String(ch.langid || '');
                    const chLangName = (ch.lalng || ch.language || '').toLowerCase();
                    return chLangId === String(apiOptions.langid) || 
                           (targetLangName && chLangName === targetLangName);
                });
            }
            
            response = filtered;
        } else {
            // Fallback: Real network request
            response = await BBNL_API.getChannelList(apiOptions);

            // Retry once if response is empty
            if ((!Array.isArray(response) || response.length === 0) && !isNetworkDisconnected()) {
                await new Promise(function (r) { setTimeout(r, 200); });
                response = await BBNL_API.getChannelList(apiOptions);
            }
        }

        if (Array.isArray(response)) {
            allChannels = response;
            setCachedChannels(apiOptions, allChannels);

            if (allChannels.length === 0) {
                container.innerHTML = '<div class="loading-spinner">No channels found</div>';
                setChannelsLoadingState(false);
                if (isNetworkDisconnected() || hasRecentApiNetworkFailure()) {
                    showErrorPopup('channels');
                }
                return;
            }

            renderAllChannels(allChannels);
            setChannelsLoadingState(false);
        } else {
            container.innerHTML = '';
            console.error("Channel Load Failed", response);
            setChannelsLoadingState(false);
            if (isNetworkDisconnected() || hasRecentApiNetworkFailure()) {
                showErrorPopup('channels');
            }
        }
    } catch (e) {
        console.error("[Channels Page] Exception:", e);
        container.innerHTML = '';
        setChannelsLoadingState(false);
        if (isNetworkDisconnected() || hasRecentApiNetworkFailure()) {
            showErrorPopup('internet');
        }
    }
}

function renderAllChannels(channels) {
    if (channelsPageExiting) return;

    var container = document.getElementById("channel-grid-container");

    // Store currently displayed channels for LCN search
    currentDisplayedChannels = channels;
    rebuildAllChannelsObjectIndexMap();

    if (channels.length === 0) {
        container.innerHTML = '<div class="loading-spinner">No channels found</div>';
        _cachedFocusables = null;
        return;
    }

    // PERFORMANCE: Properly remove old grid to free event listeners + DOM nodes.
    while (container.firstChild) { container.removeChild(container.firstChild); }

    var grid = document.createElement("div");
    grid.className = "channels-grid channels-grid-smooth";
    container.appendChild(grid); // Append grid early so first chunk is visible immediately

    // PERFORMANCE: Chunk rendering to prevent main thread blocking when rendering thousands of items
    var len = channels.length;
    var CHUNK_SIZE = 40; // Render 40 cards per frame
    var IMMEDIATE_LOAD_COUNT = 15;
    var currentIndex = 0;

    // Clear any previous ongoing chunk rendering
    if (window._renderChunkTimeout) {
        clearTimeout(window._renderChunkTimeout);
    }

    function renderChunk() {
        var frag = document.createDocumentFragment();
        var end = Math.min(currentIndex + CHUNK_SIZE, len);
        
        for (var i = currentIndex; i < end; i++) {
            var ch = channels[i];
            var channelIdx = -1;
            if (_allChannelsObjectIndexMap && _allChannelsObjectIndexMap.has(ch)) {
                channelIdx = _allChannelsObjectIndexMap.get(ch);
            }
            frag.appendChild(createChannelCard(ch, i < IMMEDIATE_LOAD_COUNT, channelIdx));
        }
        
        grid.appendChild(frag);
        currentIndex = end;
        
        if (currentIndex < len) {
            window._renderChunkTimeout = setTimeout(renderChunk, 5); // Yield to main thread
        } else {
            _cachedFocusables = null; // Invalidate cache so next keypress rebuilds it
            if (typeof invalidateCardsCache === 'function') invalidateCardsCache();
            _setupLazyImageLoading(container);
        }
    }

    renderChunk();
}

// ==========================================
// LAZY IMAGE LOADING
// Only first 15 cards load images immediately.
// Remaining cards load when scrolled into view (1 row buffer).
// ==========================================
var _lazyObserver = null;

function _setupLazyImageLoading(scrollContainer) {
    // Clean up old observer
    if (_lazyObserver) { _lazyObserver.disconnect(); _lazyObserver = null; }

    var lazyImages = scrollContainer.querySelectorAll('img[data-lazy-src]');
    if (lazyImages.length === 0) return;

    // Use IntersectionObserver if available (most Tizen 6+ TVs have it)
    if (typeof IntersectionObserver !== 'undefined') {
        _lazyObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    var img = entry.target;
                    var lazySrc = img.getAttribute('data-lazy-src');
                    if (lazySrc) {
                        img.removeAttribute('data-lazy-src');
                        if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                            BBNL_API.setImageSource(img, lazySrc);
                        } else {
                            img.src = lazySrc;
                        }
                    }
                    _lazyObserver.unobserve(img);
                }
            });
        }, { root: scrollContainer, rootMargin: '200px 0px' }); // 200px buffer

        lazyImages.forEach(function (img) { _lazyObserver.observe(img); });
    } else {
        // Fallback: load all deferred images after 500ms (old Tizen)
        setTimeout(function () {
            lazyImages.forEach(function (img) {
                var lazySrc = img.getAttribute('data-lazy-src');
                if (lazySrc) {
                    img.removeAttribute('data-lazy-src');
                    if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                        BBNL_API.setImageSource(img, lazySrc);
                    } else {
                        img.src = lazySrc;
                    }
                }
            });
        }, 500);
    }
}

// ==========================================
// ALL IMAGES LOADED IMMEDIATELY
// Images are loaded when channel cards are rendered (no lazy loading)
// ==========================================

function createChannelCard(ch, loadImmediate, channelIdx) {
    const chName = String(ch.chtitle || ch.channel_name || ch.chname || "").trim();
    const chLogo = getChannelCardLogo(ch);
    const streamLink = ch.streamlink || ch.channel_url || "";
    const chNo = String(ch.channelno || ch.urno || ch.chno || ch.ch_no || "").trim();
    const chPrice = String(ch.chprice || ch.price || ch.channel_price || "").trim();
    const isSubscribed = ch.subscribed === "yes" || ch.subscribed === "1" || ch.subscribed === true || ch.subscribed === 1;

    const card = document.createElement("div");
    card.className = "channel-card focusable";
    card.tabIndex = 0;
    card.dataset.url = streamLink;
    card.dataset.name = chName;
    card.dataset.logo = chLogo;
    card.dataset.channelno = chNo;
    // Store channel index for player navigation using precomputed object index map.
    if (typeof channelIdx === 'number' && channelIdx >= 0) {
        card.dataset.channelIdx = String(channelIdx);
    } else {
        card.dataset.channelIdx = '';
    }

    // LCN Badge - Top Left
    const lcnBadge = document.createElement("div");
    lcnBadge.className = "card-lcn-badge";
    if (chNo) {
        lcnBadge.textContent = chNo;
    } else {
        lcnBadge.style.display = 'none';
    }
    card.appendChild(lcnBadge);

    // Price Badge - Top Right
    const priceBadge = document.createElement("div");
    priceBadge.className = "card-price-badge";
    if (chPrice) {
        priceBadge.textContent = chPrice.indexOf('₹') === -1 ? ("₹" + chPrice) : chPrice;
    } else {
        priceBadge.style.display = 'none';
    }
    card.appendChild(priceBadge);

    // Logo Container - Center
    const logoDiv = document.createElement("div");
    logoDiv.className = "channel-logo-container";

    if (chLogo) {
        const img = document.createElement("img");
        // Always prefer fresh validated API URL; do not use stale cached src values.
        var normalizedLogo = '';
        if (typeof BBNL_API !== 'undefined') {
            if (BBNL_API.getValidatedImageUrl) {
                normalizedLogo = BBNL_API.getValidatedImageUrl(chLogo);
            } else if (BBNL_API.resolveAssetUrl) {
                normalizedLogo = BBNL_API.resolveAssetUrl(chLogo);
            } else {
                normalizedLogo = chLogo;
            }
        } else {
            normalizedLogo = chLogo;
        }

        var logoKey = normalizeChannelLogoKey(chLogo);

        // Check if we have previously loaded this exact logo successfully
        var alreadyCached = channelLogoCache[chLogo] || channelLogoCache[normalizedLogo] || channelLogoCache[logoKey];

        img.alt = chName;
        img.className = "channel-logo-img";

        // ✅ FIX: Don't use blob URL cache - use original URLs directly
        // Blob URLs are temporary and become invalid after re-renders
        if (alreadyCached && loadImmediate) {
            // Visible card returned from another page - load immediately
            var cachedHttpUrl = channelLogoSourceMap[logoKey] || normalizedLogo;
            if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, cachedHttpUrl);
            } else {
                img.src = cachedHttpUrl;
            }
        } else if (loadImmediate) {
            // Visible card — load now
            if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, normalizedLogo);
            } else {
                img.src = normalizedLogo;
            }
        } else {
            // Deferred card — load when scrolled into view
            img.setAttribute('data-lazy-src', normalizedLogo);
        }

        img.onload = function () {
            channelLogoCache[chLogo] = true;
            channelLogoCache[normalizedLogo] = true;
            if (logoKey) {
                channelLogoCache[logoKey] = true;
                // CRITICAL: Store original HTTP URL, NOT this.src (which may be blob:)
                // Blob URLs die on page navigation; HTTP URLs survive via browser cache
                channelLogoSourceMap[logoKey] = normalizedLogo;
            }
            // Persist to global cross-page cache
            if (typeof BBNL_API !== 'undefined' && BBNL_API.markImageCached) {
                BBNL_API.markImageCached(normalizedLogo);
            }
            var placeholder = logoDiv.querySelector('.channel-logo-placeholder');
            if (placeholder) placeholder.style.display = 'none';
        };
        
        img.onerror = function () {
            var self = this;
            // Try alternative image paths before giving up
            var alts = (typeof _generateAlternativeImagePaths === 'function')
                ? _generateAlternativeImagePaths(normalizedLogo)
                : [];
            
            if (alts.length > 0) {
                var altIdx = 0;
                function tryNextAlt() {
                    if (altIdx >= alts.length) {
                        // All alternatives exhausted — show placeholder
                        var placeholder = logoDiv.querySelector('.channel-logo-placeholder');
                        if (!placeholder) {
                            placeholder = document.createElement("div");
                            placeholder.className = "channel-logo-placeholder";
                            placeholder.innerHTML = '<span>' + (chName ? chName.substring(0, 2).toUpperCase() : '?') + '</span>';
                            logoDiv.appendChild(placeholder);
                        }
                        placeholder.style.display = 'flex';
                        self.style.display = 'none';
                        return;
                    }
                    var altUrl = alts[altIdx++];
                    self.onerror = function() { tryNextAlt(); };
                    self.style.display = '';
                    if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                        BBNL_API.setImageSource(self, altUrl);
                    } else {
                        self.src = altUrl;
                    }
                }
                tryNextAlt();
            } else {
                // No alternatives available — show placeholder immediately
                var placeholder = logoDiv.querySelector('.channel-logo-placeholder');
                if (!placeholder) {
                    placeholder = document.createElement("div");
                    placeholder.className = "channel-logo-placeholder";
                    placeholder.innerHTML = '<span>' + (chName ? chName.substring(0, 2).toUpperCase() : '?') + '</span>';
                    logoDiv.appendChild(placeholder);
                }
                placeholder.style.display = 'flex';
                this.style.display = 'none';
            }
        };
        
        logoDiv.appendChild(img);
    } else {
        // No logo URL provided — show placeholder with channel name initials
        var placeholder = document.createElement("div");
        placeholder.className = "channel-logo-placeholder";
        placeholder.innerHTML = '<span>' + (chName ? chName.substring(0, 2).toUpperCase() : '?') + '</span>';
        logoDiv.appendChild(placeholder);
    }
    card.appendChild(logoDiv);

    // Channel Name - Bottom
    const nameDiv = document.createElement("div");
    nameDiv.className = "card-channel-name";
    if (chName) {
        nameDiv.textContent = chName;
    } else {
        nameDiv.style.display = 'none';
    }
    card.appendChild(nameDiv);

    card.addEventListener("click", () => handleEnter(card));

    card.addEventListener("mouseenter", () => {
        card.focus();
    });

    // Add zone tracking
    card.addEventListener("focus", () => {
        currentZone = 'cards';
    });

    return card;
}

// Cached focusables list — avoids expensive querySelectorAll on every keypress
var _cachedFocusables = null;

function refreshFocusables() {
    _cachedFocusables = null; // invalidate cache
    focusables = document.querySelectorAll(".focusable");
    addZoneTrackingListeners();
}

function getFocusables() {
    if (!_cachedFocusables) {
        _cachedFocusables = document.querySelectorAll(".focusable");
        focusables = _cachedFocusables;
    }
    return _cachedFocusables;
}

// ==========================================
// KEYBOARD NAVIGATION
// ==========================================

var _chLastKeyTime = 0;
var _CH_KEY_THROTTLE_MS = 40; // reduced from 120ms — real TV remotes already have 50-100ms RF lag

document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    getFocusables(); // use cached list (rebuilds only when invalidated)

    // Throttle navigation keys to prevent Samsung TV remote flooding
    var isNav = (code >= 37 && code <= 40) || code === 13;
    if (isNav) {
        var now = Date.now();
        if (now - _chLastKeyTime < _CH_KEY_THROTTLE_MS) { e.preventDefault(); return; }
        _chLastKeyTime = now;
    }

    // BACK key
    if (code === 10009) {
        e.preventDefault();
        // If search input is focused, clear it and return to pills
        var searchInput = document.getElementById('searchInput');
        if (document.activeElement === searchInput && searchInput.value.trim() !== '') {
            searchInput.value = '';
            loadChannels();
            var firstPill = document.querySelector('.lang-pill.focusable');
            if (firstPill) firstPill.focus();
            return;
        }
        exitChannelsToHome();
        return;
    }

    // Allow typing in search input - only intercept navigation keys
    var isSearchFocused = document.activeElement && document.activeElement.id === 'searchInput';
    if (isSearchFocused) {
        // ENTER - play the channel number immediately (keep field read-only)
        if (code === 13) {
            var query = document.activeElement.value.replace(/[^0-9]/g, '').trim();
            if (query.length > 0) {
                e.preventDefault();
                clearTimeout(searchTimeout); // Cancel auto-play timer
                playChannelByLCN(parseInt(query, 10));
            }
            return;
        }
        // DOWN - leave search input, go to category pills
        if (code === 40) {
            e.preventDefault();
            moveToFirstCategoryPill();
            return;
        }
        // LEFT - leave search input, go to back button
        if (code === 37) {
            e.preventDefault();
            moveToBackButton();
            return;
        }
        // RIGHT - stay in search (prevent TV spatial navigation from moving to back button)
        if (code === 39) {
            e.preventDefault();
            return;
        }
        // UP - stay in search (already at top)
        if (code === 38) {
            e.preventDefault();
            return;
        }
        // Let all other keys (typing, backspace, etc.) work naturally
        return;
    }

    // NUMBER KEYS (0-9): Auto-focus search input and type the number
    // This allows users to search LCN from any zone (tabs, cards, etc.)
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

    e.preventDefault();

    switch (code) {
        case 37: // LEFT
            handleLeftNavigation();
            break;
        case 38: // UP
            handleUpNavigation();
            break;
        case 39: // RIGHT
            handleRightNavigation();
            break;
        case 40: // DOWN
            handleDownNavigation();
            break;
        case 13: // ENTER
            handleEnter(document.activeElement);
            break;
    }
});

// Handle DOWN navigation
function handleDownNavigation() {
    // [DOWN] Zone:', currentZone);

    if (currentZone === 'sidebar') {
        // DOWN in sidebar: Navigate through sidebar elements
        handleSidebarDownNavigation();
    } else if (currentZone === 'topControls') {
        // DOWN from Back/Search: Move to first category pill
        moveToFirstCategoryPill();
    } else if (currentZone === 'tabs') {
        // DOWN from tabs: Move to first channel card
        moveToFirstChannelCard();
    } else if (currentZone === 'cards') {
        // DOWN in cards: Move to next row
        moveWithinCardsGrid(0, 1);
    }
}

// Handle UP navigation
function handleUpNavigation() {
    // [UP] Zone:', currentZone);

    if (currentZone === 'sidebar') {
        // UP in sidebar: Navigate through sidebar elements
        handleSidebarUpNavigation();
    } else if (currentZone === 'topControls') {
        // Already at top, do nothing
        // [UP] Already at top controls');
    } else if (currentZone === 'tabs') {
        // UP from tabs: Move to back button (top controls)
        var backBtn = document.querySelector('.back-btn');
        if (backBtn) {
            backBtn.focus();
            currentZone = 'topControls';
            // [UP] Moved from tabs to back button');
        }
    } else if (currentZone === 'cards') {
        // UP in cards: Try to move up in grid, or go to tabs
        var moved = moveWithinCardsGrid(0, -1);
        if (!moved) {
            // At top row, move to category pills (tabs)
            moveToFirstCategoryPill();
        }
    }
}

// Handle LEFT navigation
function handleLeftNavigation() {
    // [LEFT] Zone:', currentZone);

    if (currentZone === 'topControls') {
        // LEFT in top controls: Move between Search and Back
        var topControls = Array.from(document.querySelectorAll('.back-btn, .search-input'));
        var currentIndex = topControls.indexOf(document.activeElement);

        if (currentIndex > 0) {
            topControls[currentIndex - 1].focus();
        }
        // At back button - stay there (no sidebar on this page)
    } else if (currentZone === 'tabs') {
        // LEFT in tabs: Move to previous pill
        moveWithinTabs(-1);
        // If at first pill, stay there (no sidebar on this page)
    } else if (currentZone === 'cards') {
        // LEFT in cards: Move left in grid
        moveWithinCardsGrid(-1, 0);
        // If at first column, stay there (no sidebar on this page)
    }
}

// Handle RIGHT navigation
function handleRightNavigation() {
    // [RIGHT] Zone:', currentZone);

    if (currentZone === 'sidebar') {
        // RIGHT from sidebar: Move to main content
        handleSidebarRightNavigation();
    } else if (currentZone === 'topControls') {
        // RIGHT in top controls: Move between Back and Search
        var topControls = Array.from(document.querySelectorAll('.back-btn, .search-input'));
        var currentIndex = topControls.indexOf(document.activeElement);

        if (currentIndex < topControls.length - 1) {
            topControls[currentIndex + 1].focus();
        }
    } else if (currentZone === 'tabs') {
        // RIGHT in tabs: Move to next pill
        moveWithinTabs(1);
    } else if (currentZone === 'cards') {
        // RIGHT in cards: Move right in grid
        moveWithinCardsGrid(1, 0);
    }
}

// Cached sidebar categories — avoids querySelectorAll on every UP/DOWN keypress
var _cachedSidebarCategories = null;

function getCachedSidebarCategories() {
    if (!_cachedSidebarCategories) {
        _cachedSidebarCategories = Array.from(document.querySelectorAll('.category-item.focusable'));
    }
    return _cachedSidebarCategories;
}

function invalidateSidebarCache() {
    _cachedSidebarCategories = null;
}

// Sidebar navigation helpers
function handleSidebarDownNavigation() {
    var active = document.activeElement;

    // If on language arrows or text, move to first category
    if (active.id === 'langArrowLeft' || active.id === 'langArrowRight' || active.id === 'selectedLanguageText') {
        var categories = getCachedSidebarCategories();
        if (categories.length > 0) {
            categories[0].focus();
            sidebarCategoryIndex = 0;
        }
        return;
    }

    // If on category item, move to next
    if (active.classList.contains('category-item')) {
        var categories = getCachedSidebarCategories();
        var idx = categories.indexOf(active);
        if (idx < categories.length - 1) {
            categories[idx + 1].focus();
            sidebarCategoryIndex = idx + 1;
        }
    }
}

function handleSidebarUpNavigation() {
    var active = document.activeElement;

    // If on language arrows or text, stay there (already at top)
    if (active.id === 'langArrowLeft' || active.id === 'langArrowRight' || active.id === 'selectedLanguageText') {
        return;
    }

    // If on first category, move to language selector
    if (active.classList.contains('category-item')) {
        var categories = getCachedSidebarCategories();
        var idx = categories.indexOf(active);
        if (idx === 0) {
            // Move to language text
            var langText = document.getElementById('selectedLanguageText');
            if (langText) {
                langText.focus();
            }
        } else if (idx > 0) {
            categories[idx - 1].focus();
            sidebarCategoryIndex = idx - 1;
        }
    }
}

function handleSidebarLeftNavigation() {
    var active = document.activeElement;
    
    // If on language text or right arrow, move to left arrow
    if (active.id === 'selectedLanguageText' || active.id === 'langArrowRight') {
        // Trigger language change
        changeLanguageSelection(-1);
        return;
    }
    
    // If on left arrow, trigger language change
    if (active.id === 'langArrowLeft') {
        changeLanguageSelection(-1);
        return;
    }
}

function handleSidebarRightNavigation() {
    var active = document.activeElement;
    
    // If on language elements, change selection or move right
    if (active.id === 'langArrowLeft' || active.id === 'selectedLanguageText') {
        changeLanguageSelection(1);
        return;
    }
    
    if (active.id === 'langArrowRight') {
        changeLanguageSelection(1);
        return;
    }
    
    // If on category item, move to main content (first card)
    if (active.classList.contains('category-item')) {
        var firstCard = document.querySelector('.channel-card.focusable');
        if (firstCard) {
            firstCard.focus();
            currentZone = 'cards';
        } else {
            // No cards, try back button
            moveToBackButton();
        }
    }
}

function focusSidebarLanguage() {
    var langText = document.getElementById('selectedLanguageText');
    if (langText) {
        langText.focus();
        currentZone = 'sidebar';
    }
}

// Helper: Move to Back button
function moveToBackButton() {
    var backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.focus();
        currentZone = 'topControls';
    }
}

// Helper: Move to first category pill
function moveToFirstCategoryPill() {
    var firstPill = document.querySelector('.category-pill.focusable');
    if (firstPill) {
        firstPill.focus();
        firstPill.scrollIntoView({ inline: "start", behavior: "auto", block: "nearest" });
        currentZone = 'tabs';
    }
}

// Helper: Move to first channel card
function moveToFirstChannelCard() {
    var firstCard = document.querySelector('.channel-card.focusable');
    if (firstCard) {
        firstCard.focus();
        scrollCardIntoView(firstCard);
        currentZone = 'cards';
    }
}

// Helper: Move within tabs (category pills) - AUTO LOAD ON FOCUS
var _pillsCache = null;
var _pillDebounce = null;
function moveWithinTabs(direction) {
    if (!_pillsCache) _pillsCache = Array.from(document.querySelectorAll('.lang-pill.focusable'));
    var pills = _pillsCache;
    var currentIndex = pills.indexOf(document.activeElement);

    if (currentIndex < 0) return false;

    var newIndex = currentIndex + direction;

    if (newIndex < 0 || newIndex >= pills.length) {
        return false;
    }

    var targetPill = pills[newIndex];
    targetPill.focus();
    targetPill.scrollIntoView({ inline: "center", behavior: "auto", block: "nearest" });

    // Update active state
    for (var i = 0; i < pills.length; i++) pills[i].classList.remove('active');
    targetPill.classList.add('active');

    var langId = targetPill.dataset.langid || '';
    var langName = targetPill.dataset.langname || '';
    var isAllTab = langName.toLowerCase() === 'all channels' || langName.toLowerCase() === 'all' || langId === '';

    if (isAllTab) {
        sessionStorage.setItem('selectedLanguageId', 'all');
        sessionStorage.setItem('selectedLanguageName', 'All Channels');
    } else {
        sessionStorage.setItem('selectedLanguageId', langId);
        sessionStorage.setItem('selectedLanguageName', langName);
    }

    // Debounce: filter channels 100ms after user stops moving
    clearTimeout(_pillDebounce);
    _pillDebounce = setTimeout(function () {
        // Try local filter first (instant) — use in-memory master list if available.
        var allCh = null;
        if (Array.isArray(masterChannelList) && masterChannelList.length > 0) {
            allCh = masterChannelList;
        } else if (typeof CacheManager !== 'undefined') {
            allCh = CacheManager.get(CacheManager.KEYS.CHANNEL_LIST, true);
        }

        if (allCh && allCh.length > 0) {
            // Filter locally — no API call
            var filtered;
            var isAll = isAllTab;
            if (!langId || langId === '' || isAll) {
                filtered = allCh;
            } else if (langId === 'subs' || langName.toLowerCase().indexOf('subscribed') !== -1) {
                filtered = allCh.filter(function (ch) {
                    return ch.subscribed === 'yes' || ch.subscribed === '1' || ch.subscribed === true || ch.subscribed === 1;
                });
            } else {
                var fid = String(langId).trim();
                var fname = langName.toLowerCase();
                filtered = allCh.filter(function (ch) {
                    var cid = String(ch.langid || ch.lang_id || '').trim();
                    if (cid === fid) return true;
                    var cn = String(ch.lalng || ch.langtitle || ch.langname || ch.language || ch.lang || '').trim().toLowerCase();
                    if (cn === fname) return true;
                    return false;
                });
            }
            if (filtered && filtered.length > 0) {
                allChannels = filtered;
                renderAllChannels(allChannels);
                setChannelsLoadingState(false);
                return;
            }
        }

        // Fallback: API call if no cache
        var isAllChannels = langName.toLowerCase() === 'all channels' || langName.toLowerCase() === 'all' || langId === '';
        if (!langId || langId === '' || isAllChannels) {
            loadChannels();
        } else if (langId === 'subs' || langName.toLowerCase().indexOf('subscribed') !== -1) {
            loadChannels({ subscribed: 'yes' });
        } else {
            loadChannels({ langid: langId });
        }
    }, 100);

    return true;
}

// Cached card list + grid columns — avoids querySelectorAll + getComputedStyle on every keypress
var _cachedCards = null;
var _cachedColumnsPerRow = 5;

function invalidateCardsCache() {
    _cachedCards = null;
}

function getCachedCards() {
    if (!_cachedCards) {
        _cachedCards = Array.from(document.querySelectorAll('.channel-card.focusable'));
        // Compute grid columns once per render
        var grid = document.querySelector('.channels-grid');
        if (grid) {
            var cols = window.getComputedStyle(grid).gridTemplateColumns.split(' ').length;
            if (cols > 0) _cachedColumnsPerRow = cols;
        }
    }
    return _cachedCards;
}

// Helper: Move within channel cards grid
function moveWithinCardsGrid(deltaX, deltaY) {
    var cards = getCachedCards();
    var currentIndex = cards.indexOf(document.activeElement);

    if (currentIndex < 0) return false;

    var columnsPerRow = _cachedColumnsPerRow;

    var currentRow = Math.floor(currentIndex / columnsPerRow);
    var currentCol = currentIndex % columnsPerRow;

    var newRow = currentRow + deltaY;
    var newCol = currentCol + deltaX;

    // Wrap horizontally: RIGHT at end of row → first card of next row
    if (newCol >= columnsPerRow) {
        newCol = 0;
        newRow++;
    }
    // Wrap horizontally: LEFT at start of row → last card of previous row
    if (newCol < 0) {
        newCol = columnsPerRow - 1;
        newRow--;
    }

    if (newRow < 0) return false;

    var newIndex = newRow * columnsPerRow + newCol;

    if (newIndex >= 0 && newIndex < cards.length) {
        cards[newIndex].focus();
        // Scroll the card into view within the scrollable container
        scrollCardIntoView(cards[newIndex]);
        return true;
    }

    return false;
}

// Cached DOM refs for scrollCardIntoView — avoids getElementById + querySelector per keypress
var _scrollContainer = null;
var _scrollCategorySection = null;

// Scroll a card into the visible area of the scroll container with padding for focus effect
function scrollCardIntoView(card) {
    if (!_scrollContainer) _scrollContainer = document.getElementById('channel-grid-container');
    if (!_scrollContainer) return;

    // BATCH ALL READS FIRST to avoid forced reflow (layout thrashing)
    var containerRect = _scrollContainer.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    if (!_scrollCategorySection) _scrollCategorySection = document.querySelector('.category-section');
    var categoryBottom = _scrollCategorySection ? _scrollCategorySection.getBoundingClientRect().bottom : containerRect.top;

    // All reads done — now compute and write once
    var focusPadding = 30;
    var visibleTop = Math.max(containerRect.top, categoryBottom);

    var scrollOffset = 0;
    if (cardRect.top - focusPadding < visibleTop) {
        scrollOffset = cardRect.top - visibleTop - focusPadding;
    } else if (cardRect.bottom + focusPadding > containerRect.bottom) {
        scrollOffset = cardRect.bottom - containerRect.bottom + focusPadding;
    }

    if (scrollOffset !== 0) {
        _scrollContainer.scrollTop += scrollOffset;
    }
}

function handleEnter(el) {
    if (!el) el = document.activeElement;


    if (el.classList.contains('back-btn')) {
        exitChannelsToHome();
        return;
    }

    if (el.classList.contains('search-input')) {
        // Focus is already on search, virtual keyboard will appear on TV
        return;
    }

    if (el.classList.contains('category-pill')) {
        el.click();
        return;
    }

    if (el.classList.contains('language-option')) {
        el.click();
        return;
    }

    if (el.classList.contains('channel-card')) {
        const streamUrl = el.dataset.url;
        const channelName = el.dataset.name;

        if (!streamUrl || streamUrl.trim() === "") {
            return;
        }

        // Look up channel from allChannels by index (avoids JSON.stringify/parse per card)
        var channel;
        var chIdx = parseInt(el.dataset.channelIdx, 10);
        if (!isNaN(chIdx) && chIdx >= 0 && allChannels[chIdx]) {
            channel = allChannels[chIdx];
        } else {
            channel = {
                chtitle: channelName,
                channel_name: channelName,
                streamlink: streamUrl,
                chlogo: el.dataset.logo,
                logo_url: el.dataset.logo,
                channelno: el.dataset.channelno || ""
            };
        }

        try {
            var activeCat = document.querySelector('.category-item.active');
            if (activeCat && activeCat.dataset) {
                var g = String(activeCat.dataset.grid || '').trim();
                var ck = String(activeCat.dataset.category || '').trim().toLowerCase();
                if (g) sessionStorage.setItem('bbnl_channels_category_grid', g);
                else sessionStorage.removeItem('bbnl_channels_category_grid');
                if (ck && ck !== 'all') sessionStorage.setItem('bbnl_channels_category_key', ck);
                else sessionStorage.removeItem('bbnl_channels_category_key');
            }
        } catch (eCat) {}

        BBNL_API.playChannel(channel);
        return;
    }
}

// ==========================================
// LCN-BASED DIRECT PLAYBACK
// ==========================================

/**
 * Play a channel directly by its LCN number
 * ALWAYS searches masterChannelList (ALL channels, no filters)
 * @param {Number} lcn - The LCN number to play
 */
function playChannelByLCN(lcn) {

    // Use masterChannelList for LCN search (never filtered)
    if (masterChannelList.length === 0) {
        BBNL_API.getChannelList({}).then(function (channels) {
            if (channels && Array.isArray(channels)) {
                masterChannelList = channels;
                masterListLoaded = true;
                findAndPlayLCN(lcn);
            }
        });
        return;
    }

    findAndPlayLCN(lcn);
}

function showSearchNotFound(msg) {
    // Show centered toast consistent with Home page style.
    var existing = document.getElementById('search-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'search-toast';
    toast.className = 'search-toast-notification';
    toast.textContent = msg;
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(18,18,18,0.98);color:#ffffff;font-size:23px;font-weight:700;padding:18px 50px;border-radius:12px;border:2px solid #ff6b6b;z-index:9999;white-space:nowrap;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.8);box-shadow:0 8px 24px rgba(0,0,0,0.45);';
    document.body.appendChild(toast);
    
    // Auto-remove after 3 seconds
    setTimeout(function () {
        if (toast.parentNode) toast.remove();
    }, 3000);
}

function findAndPlayLCN(lcn) {
    // ALWAYS search in MASTER channel list (ALL channels, NEVER filtered)
    // This ensures LCN search works regardless of active filter

    var channel = masterChannelList.find(function (ch) {
        var chNo = parseInt(ch.channelno || ch.urno || ch.chno || ch.ch_no || 0, 10);
        return chNo === lcn;
    });

    if (channel) {

        // Clear search input
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
        }

        // Play the channel immediately
        BBNL_API.playChannel(channel);
    } else {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
        }
        showSearchNotFound("Channel Not Found");
    }
}

// ==========================================
// DARK MODE FUNCTIONALITY
// ==========================================

function initDarkMode() {
    var isDarkMode = localStorage.getItem('darkMode') !== 'false';

    if (isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }

}
