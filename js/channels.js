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

// Check authentication - redirect to login if never logged in
// NOTE: Never remove hasLoggedInOnce — it must persist across HOME relaunch.
(function checkAuth() {
    var hasLoggedInOnce = localStorage.getItem("hasLoggedInOnce");
    if (hasLoggedInOnce !== "true") {
        console.log("[Auth] User has never logged in, redirecting to login...");
        window.location.replace("login.html");
        return;
    }
    try {
        var userData = localStorage.getItem("bbnl_user");
        if (!userData || !JSON.parse(userData).userid) {
            console.log("[Auth] bbnl_user invalid - redirecting to login for re-auth");
            window.location.replace("login.html");
            return;
        }
    } catch (e) {
        console.error("[Auth] Corrupted session data - redirecting to login:", e);
        window.location.replace("login.html");
        return;
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
var channelsSearchActivated = false; // Only activate keypad after explicit user action
var _channelLogoPrefetchInFlight = {}; // Prevent duplicate prefetches during rapid category switches
var channelsResultCache = {}; // Reuse channel API responses per filter/category

window.addEventListener('beforeunload', function () {
    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.savePageState) {
        var searchEl = document.getElementById('searchInput');
        AppPerformanceCache.savePageState('channels', {
            focusIndex: currentFocus,
            searchText: searchEl ? searchEl.value : '',
            currentCategory: currentCategory,
            currentLanguage: currentLanguage,
            scrollTop: window.scrollY || 0
        });
    }
});

// Navigation zones: 'sidebar', 'topControls' (back, search), 'tabs' (category pills), 'cards' (channel cards)
var currentZone = 'sidebar';
var lastTopControlElement = null; // Track last focused top control for UP navigation
var sidebarCategoryIndex = 0; // Track focused category in sidebar

window.onload = function () {
    console.log("=== BBNL Channels Page Initialized ===");

    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.primeAfterLogin) {
        AppPerformanceCache.primeAfterLogin(false);
    }

    // Initialize Dark Mode from localStorage
    initDarkMode();

    // Initialize UI
    initPage();

    // Initialize category pills
    initCategoryPills();

    // Initialize language dropdown
    initLanguageDropdown();
    
    // Initialize sidebar language selector
    initLanguageSelector();

    // Initialize search functionality
    initSearchFunctionality();

    // Restore lightweight UI state for smoother return navigation.
    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.getPageState) {
        var cachedState = AppPerformanceCache.getPageState('channels', 60 * 60 * 1000);
        if (cachedState) {
            var searchInput = document.getElementById('searchInput');
            if (searchInput && cachedState.searchText) {
                searchInput.value = String(cachedState.searchText);
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
            console.log('[Channels Navigation] Zone: Sidebar');
        });
    });
    
    // Top controls (back button, search input)
    var topControls = document.querySelectorAll('.back-btn, .search-input');
    topControls.forEach(function (el) {
        el.addEventListener('focus', function () {
            currentZone = 'topControls';
            lastTopControlElement = el; // Remember which top control was focused
            console.log('[Channels Navigation] Zone: Top Controls');
        });
    });

    // Category pills
    var pills = document.querySelectorAll('.category-pill');
    pills.forEach(function (pill) {
        pill.addEventListener('focus', function () {
            currentZone = 'tabs';
            console.log('[Channels Navigation] Zone: Tabs');
        });
    });

    // Channel cards - use event delegation since cards load dynamically
    document.addEventListener('focus', function (e) {
        if (e.target.classList.contains('channel-card')) {
            currentZone = 'cards';
            console.log('[Channels Navigation] Zone: Cards');
        }
    }, true);
}

async function initPage() {
    try {
        // Ensure public IP is ready before API calls
        if (typeof DeviceInfo !== 'undefined' && DeviceInfo.ensurePublicIP) {
            await DeviceInfo.ensurePublicIP(3000);
        }

        // Load master channel list + categories IN PARALLEL for faster loading
        var [masterResult, categoryResponse] = await Promise.all([
            loadMasterChannelList(),
            BBNL_API.getCategoryList()
        ]);

        console.log("Categories Fetched:", categoryResponse);
        if (Array.isArray(categoryResponse)) {
            renderCategories(categoryResponse);
        }

    } catch (e) {
        console.error("Init Exception:", e);
        if (isNetworkDisconnected()) {
            showErrorPopup('internet');
        }
    }

    // Check if LCN was passed via URL (from home page search)
    const urlParams = new URLSearchParams(window.location.search);
    const urlLCN = urlParams.get('lcn');
    const urlLang = urlParams.get('lang');

    if (urlLCN && /^\d+$/.test(urlLCN)) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = urlLCN;
        }
        // Play the channel directly by LCN
        playChannelByLCN(parseInt(urlLCN, 10));
        return; // Exit early since we're playing a channel
    }

    // Check if returning from language selection page OR from player
    const selectedLangId = sessionStorage.getItem('selectedLanguageId');
    const selectedLangName = sessionStorage.getItem('selectedLanguageName');

    // Check if Fofi channel has already been played this login session
    const fofiPlayedThisSession = sessionStorage.getItem('fofi_autoplay_done');

    // Determine if user has any language filter active (either from URL or session)
    const hasLanguageFilter = selectedLangName || urlLang;

    // Update header title and language pill based on selected language
    updateHeaderWithLanguage(selectedLangName || urlLang);

    if (selectedLangName) {
        const languagePill = document.getElementById('languagePill');
        if (languagePill) {
            const textSpan = languagePill.querySelector('span');
            if (textSpan) {
                textSpan.textContent = 'Language - ' + selectedLangName;
            }
            
            // Add active class to Language pill and remove from other category pills
            languagePill.classList.add('active');
            var categoryPills = document.querySelectorAll('.category-pill[data-category]');
            categoryPills.forEach(function(pill) {
                pill.classList.remove('active');
            });
        }

        if (selectedLangId === '' || !selectedLangId) {
            await loadChannels();
        } else if (selectedLangId === 'subs') {
            await loadChannels({ subscribed: 'yes' });
        } else {
            await loadChannels({ langid: selectedLangId });
        }

        // DON'T remove the filter here - keep it for back navigation from player
        // Filter will be cleared when user presses BACK from channels page
    } else if (urlLang) {
        // Handle language filter from URL (from home page language card click)
        await loadChannels({ langid: urlLang });
    } else {
        // Default: Load all channels (first category)
        await loadChannels();
    }

    refreshFocusables();

    // NO auto-play on TV Channels page
    // Playback only starts when user presses OK on a channel card
    console.log('[Channels] Page loaded - No auto-play, waiting for user selection');

    // Set initial focus on first category pill
    setInitialFocus();
}

/**
 * Load the MASTER channel list - ALL channels without any filters
 * This list is used ONLY for LCN search and is NEVER modified by filters
 */
async function loadMasterChannelList() {
    if (masterListLoaded && masterChannelList.length > 0) {
        console.log("[Channels] Master list already loaded:", masterChannelList.length, "channels");
        return;
    }
    
    try {
        console.log("[Channels] Loading MASTER channel list (all channels, no filters)...");
        const response = await BBNL_API.getChannelList({}); // No filters = ALL channels
        
        if (Array.isArray(response) && response.length > 0) {
            masterChannelList = response;
            masterListLoaded = true;
            console.log("[Channels] Master channel list loaded:", masterChannelList.length, "channels");
        } else {
            console.warn("[Channels] Failed to load master channel list");
        }
    } catch (e) {
        console.error("[Channels] Error loading master channel list:", e);
    }
}

function setInitialFocus() {
    // Check if returning from language selection - focus language pill
    var selectedLangId = sessionStorage.getItem('selectedLanguageId');
    var selectedLangName = sessionStorage.getItem('selectedLanguageName');
    
    if (selectedLangId || selectedLangName) {
        // Returning from language selection - focus the language pill
        var languagePill = document.getElementById('languagePill');
        if (languagePill) {
            languagePill.focus();
            currentZone = 'tabs';
            console.log('[Channels] Focus set to Language pill (returned from language selection)');
            return;
        }
    }
    
    // Default: focus first category pill
    var firstPill = document.querySelector('.category-pill.focusable');
    if (firstPill) {
        firstPill.focus();
        currentZone = 'tabs';
        console.log('[Channels] Initial focus set to first category pill');
    }
}

// ==========================================
// CATEGORY PILLS FUNCTIONALITY
// ==========================================

function renderCategories(categories) {
    // Store categories globally for sidebar
    allCategories = categories;
    
    const categoryPillsContainer = document.getElementById('categoryPills');
    if (!categoryPillsContainer) return;

    const languagePill = document.getElementById('languagePill');
    categoryPillsContainer.innerHTML = '';
    
    // Check if language filter is active - don't mark first pill as active
    const hasLanguageFilter = sessionStorage.getItem('selectedLanguageId') || sessionStorage.getItem('selectedLanguageName');

    // Reorder categories: Put "All Channels" first to attract users
    var reorderedCategories = [];
    var subscribedCategory = null;
    var allChannelsCategory = null;
    var otherCategories = [];
    
    categories.forEach(function(cat) {
        var title = (cat.grtitle || '').toLowerCase();
        if (title === 'subscribed channels' || title === 'subscribed' || cat.grid === 'subs') {
            subscribedCategory = cat;
        } else if (title === 'all channels' || title === 'all' || cat.grid === '') {
            allChannelsCategory = cat;
        } else {
            otherCategories.push(cat);
        }
    });
    
    // Build reordered array: All Channels first, then Subscribed, then others
    if (allChannelsCategory) reorderedCategories.push(allChannelsCategory);
    if (subscribedCategory) reorderedCategories.push(subscribedCategory);
    reorderedCategories = reorderedCategories.concat(otherCategories);
    
    // If reordering didn't find expected categories, use original order
    if (reorderedCategories.length === 0) {
        reorderedCategories = categories;
    }

    reorderedCategories.forEach((cat, index) => {
        const pill = document.createElement('button');
        pill.className = 'category-pill focusable';
        pill.tabIndex = 0;
        pill.dataset.category = (cat.grtitle || '').toLowerCase();
        pill.dataset.grid = cat.grid || '';
        pill.textContent = cat.grtitle || 'Unknown';

        // Only mark first pill as active if no language filter
        if (index === 0 && !hasLanguageFilter) {
            pill.classList.add('active');
        }

        // Add focus listener for zone tracking
        pill.addEventListener('focus', function () {
            currentZone = 'tabs';
        });

        categoryPillsContainer.appendChild(pill);
    });

    if (languagePill) {
        categoryPillsContainer.appendChild(languagePill);
    }

    initCategoryPills();
    
    // Also render sidebar categories (with reordered categories)
    renderSidebarCategories(reorderedCategories);
}

// ==========================================
// SIDEBAR CATEGORIES FUNCTIONALITY
// ==========================================

function renderSidebarCategories(categories) {
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) return;
    
    categoryList.innerHTML = '';
    
    // Check if language filter is active
    const hasLanguageFilter = sessionStorage.getItem('selectedLanguageId') || sessionStorage.getItem('selectedLanguageName');
    
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
        
        categoryList.appendChild(item);
    });
    
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
    // Remove active from all sidebar categories
    document.querySelectorAll('.category-item').forEach(el => {
        el.classList.remove('active');
    });
    
    // Add active to selected
    item.classList.add('active');
    
    // Clear language filter when category is selected
    sessionStorage.removeItem('selectedLanguageId');
    sessionStorage.removeItem('selectedLanguageName');
    
    // Reset language selector to "All Languages"
    selectedLanguageIndex = 0;
    updateLanguageSelectorDisplay();
    
    // Update title
    updateHeaderWithLanguage(null);
    
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
        // All Languages - clear filter
        sessionStorage.removeItem('selectedLanguageId');
        sessionStorage.removeItem('selectedLanguageName');
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
    
    // Clear category selection when language changes
    document.querySelectorAll('.category-item').forEach(el => {
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
    console.log('Category selected:', category, 'Grid ID:', gridId);

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
        primeChannelLogoCache(previewChannels, 60);
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
        searchInput.setAttribute('inputmode', 'numeric');
        searchInput.setAttribute('pattern', '[0-9]*');
        searchInput.setAttribute('autocomplete', 'off');

        // Keep field non-editable on navigation focus; user must click/OK to activate editing.
        searchInput.readOnly = true;

        searchInput.addEventListener('click', function () {
            channelsSearchActivated = true;
            searchInput.readOnly = false;
            searchInput.focus();
            try {
                if (typeof searchInput.setSelectionRange === 'function') {
                    var end = (searchInput.value || '').length;
                    searchInput.setSelectionRange(end, end);
                }
            } catch (err) {}
        });

        searchInput.addEventListener('blur', function () {
            channelsSearchActivated = false;
            searchInput.readOnly = true;
        });

        // Filter out non-numeric characters and limit to 4 digits
        searchInput.addEventListener('input', function () {
            var cleaned = searchInput.value.replace(/[^0-9]/g, '');
            if (cleaned.length > 4) cleaned = cleaned.substring(0, 4);
            if (cleaned !== searchInput.value) {
                searchInput.value = cleaned;
            }

            clearTimeout(searchTimeout);

            if (cleaned.length > 0) {
                // Auto-play the channel after 3 seconds of no input
                searchTimeout = setTimeout(function () {
                    var lcn = parseInt(cleaned, 10);
                    console.log("[Channels] Auto-playing LCN:", lcn);
                    playChannelByLCN(lcn);
                }, 3000);
            }
        });

        // Block non-numeric key presses (extra safety for TV keyboard)
        searchInput.addEventListener('keypress', function (e) {
            var char = String.fromCharCode(e.which || e.keyCode);
            if (!/[0-9]/.test(char) && e.keyCode !== 13 && e.keyCode !== 8) {
                e.preventDefault();
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
    return Array.isArray(cached) ? cached : null;
}

function setCachedChannels(options, channels) {
    if (!Array.isArray(channels)) return;
    var key = buildChannelsCacheKey(options);
    // Keep an immutable snapshot to avoid accidental mutations.
    channelsResultCache[key] = channels.slice();
}

function clearChannelsResultCache() {
    channelsResultCache = {};
}

function primeChannelLogoCache(channels, maxCount) {
    if (!Array.isArray(channels) || channels.length === 0) return;
    var limit = Math.min(maxCount || 36, channels.length);

    for (var i = 0; i < limit; i++) {
        var ch = channels[i] || {};
        var logoUrl = getChannelCardLogo(ch);
        if (!logoUrl) continue;
        if (channelLogoCache[logoUrl] || _channelLogoPrefetchInFlight[logoUrl]) continue;

        _channelLogoPrefetchInFlight[logoUrl] = true;
        var img = new Image();
        img.onload = function () {
            channelLogoCache[this.src] = true;
            delete _channelLogoPrefetchInFlight[this.src];
        };
        img.onerror = function () {
            delete _channelLogoPrefetchInFlight[this.src];
        };
        img.src = logoUrl;
    }
}

function getChannelCardLogo(ch) {
    if (!ch || typeof ch !== 'object') return '';
    var candidates = [
        ch.chlogo,
        ch.logo_url,
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
        if (str) return str;
    }
    return '';
}

// ==========================================
// ERROR POPUP FUNCTIONALITY
// ==========================================

function showErrorPopup(type) {
    // Set error images from API
    if (typeof ErrorImagesAPI !== 'undefined') {
        if (type === 'channels') {
            var img = document.getElementById('errorImg_noChannels');
            if (img) img.src = ErrorImagesAPI.getImageUrl('NO_CHANNELS_AVAILABLE');
        } else if (type === 'internet') {
            var img = document.getElementById('errorImg_noInternet');
            if (img) img.src = ErrorImagesAPI.getImageUrl('NO_INTERNET_CONNECTION');
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
    const container = document.getElementById("channel-grid-container");
    if (!container) return;

    const apiOptions = {
        grid: options.grid || "",
        langid: options.langid || "",
        search: options.search || "",
        subscribed: options.subscribed || ""
    };

    // Fast path: render from in-memory cache when user switches back to an already loaded category.
    var cachedChannels = getCachedChannels(apiOptions);
    if (cachedChannels && cachedChannels.length > 0) {
        console.log("[Channels Page] Cache hit for", buildChannelsCacheKey(apiOptions), "-", cachedChannels.length, "channels");
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
        // FIXED: Clear channel cache if user just completed subscription
        // Check if subscription was just completed (sessionStorage flag from subscription page)
        if (sessionStorage.getItem('subscription_completed') === 'true') {
            console.log("[Channels] Subscription completed - clearing channel cache for fresh load");
            if (typeof CacheManager !== 'undefined') {
                CacheManager.remove(CacheManager.KEYS.CHANNEL_LIST);
                CacheManager.remove(CacheManager.KEYS.CATEGORIES);
            }
            clearChannelsResultCache();
            sessionStorage.removeItem('subscription_completed');
        }

        let response = await BBNL_API.getChannelList(apiOptions);

        // Retry once if response is empty (race condition with session/IP init)
        if ((!Array.isArray(response) || response.length === 0) && !isNetworkDisconnected()) {
            console.log("[Channels Page] Empty response, retrying after 1s...");
            await new Promise(function (r) { setTimeout(r, 1000); });
            response = await BBNL_API.getChannelList(apiOptions);
        }

        if (Array.isArray(response)) {
            console.log("[Channels Page] Loaded " + response.length + " channels");

            allChannels = response;
            setCachedChannels(apiOptions, allChannels);

            if (allChannels.length === 0) {
                container.innerHTML = '<div class="loading-spinner">No channels found</div>';
                setChannelsLoadingState(false);
                if (isNetworkDisconnected()) {
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
            if (isNetworkDisconnected()) {
                showErrorPopup('channels');
            }
        }
    } catch (e) {
        console.error("[Channels Page] Exception:", e);
        container.innerHTML = '';
        setChannelsLoadingState(false);
        if (isNetworkDisconnected()) {
            showErrorPopup('internet');
        }
    }
}

function renderAllChannels(channels) {
    const container = document.getElementById("channel-grid-container");

    // Store currently displayed channels for LCN search
    currentDisplayedChannels = channels;

    if (channels.length === 0) {
        container.innerHTML = '<div class="loading-spinner">No channels found</div>';
        refreshFocusables();
        return;
    }

    const grid = document.createElement("div");
    grid.className = "channels-grid channels-grid-smooth";

    // Prefetch visible logos to reduce perceived delay when switching categories.
    primeChannelLogoCache(channels, 40);

    channels.forEach(ch => {
        const card = createChannelCard(ch);
        grid.appendChild(card);
    });

    container.innerHTML = "";
    container.appendChild(grid);
    requestAnimationFrame(function () {
        grid.classList.add('is-visible');
    });
    refreshFocusables();
    initLazyLoading();
}

// ==========================================
// LAZY LOADING - Load channel logos only when visible
// Dramatically reduces initial load time for 100+ channels
// ==========================================
var _lazyObserver = null;

function initLazyLoading() {
    // Disconnect previous observer if any
    if (_lazyObserver) {
        _lazyObserver.disconnect();
    }

    var lazyImages = document.querySelectorAll('img.lazy-logo');
    if (lazyImages.length === 0) return;

    if ('IntersectionObserver' in window) {
        _lazyObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    var img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        channelLogoCache[img.dataset.src] = true;
                        img.removeAttribute('data-src');
                    }
                    _lazyObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '300px'  // Pre-load 300px before visible (2 rows ahead)
        });

        lazyImages.forEach(function (img) {
            _lazyObserver.observe(img);
        });
        console.log("[Channels] Lazy loading initialized for", lazyImages.length, "logos");
    } else {
        // Fallback for older Tizen: load all immediately
        lazyImages.forEach(function (img) {
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            }
        });
        console.log("[Channels] IntersectionObserver not available - loaded all logos immediately");
    }
}

function createChannelCard(ch) {
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
    // Store full channel data for player navigation
    card.dataset.channelData = JSON.stringify(ch);

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
        // If already loaded in this session, set src directly to avoid visible reload delay.
        if (channelLogoCache[chLogo]) {
            img.src = chLogo;
        } else {
            img.dataset.src = chLogo;  // Lazy load first time
        }
        img.alt = chName;
        img.className = "lazy-logo";
        img.onload = function () {
            channelLogoCache[chLogo] = true;
        };
        img.onerror = function() {
            this.style.display = 'none';
        };
        logoDiv.appendChild(img);
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

function refreshFocusables() {
    focusables = document.querySelectorAll(".focusable");

    // Re-add zone tracking for dynamically loaded elements
    addZoneTrackingListeners();
}

// ==========================================
// KEYBOARD NAVIGATION
// ==========================================

document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    console.log('[Channels] Key pressed:', code, 'Zone:', currentZone);

    // BACK key
    if (code === 10009) {
        e.preventDefault();
        // If search input is focused, clear it and return to tabs
        var searchInput = document.getElementById('searchInput');
        if (document.activeElement === searchInput && searchInput.value.trim() !== '') {
            searchInput.value = '';
            loadChannels();
            moveToFirstCategoryPill();
            return;
        }
        // Check if we came from language filter (either from home page or language-select)
        var selectedLang = sessionStorage.getItem('selectedLanguageId');
        var focusedLangIndex = sessionStorage.getItem('homeFocusedLanguageIndex');
        
        if (selectedLang && selectedLang !== '') {
            // Clear the language filter
            sessionStorage.removeItem('selectedLanguageId');
            sessionStorage.removeItem('selectedLanguageName');
            
            // If user came from home page language selection, go back to home with focus preserved
            if (focusedLangIndex !== null) {
                console.log('[Channels] Returning to home page (language card focus preserved)');
                sessionStorage.setItem('returningFromChannels', 'true');
                window.location.href = "home.html";
            } else {
                // User came from language-select page
                console.log('[Channels] Navigating back to language-select');
                window.location.href = "language-select.html";
            }
        } else {
            // No language filter, just go back to home
            sessionStorage.setItem('returningFromChannels', 'true');
            window.location.href = "home.html";
        }
        return;
    }

    // Allow typing in search input - only intercept navigation keys
    var isSearchFocused = document.activeElement && document.activeElement.id === 'searchInput';
    if (isSearchFocused) {
        // ENTER - play the channel number immediately
        if (code === 13) {
            if (!channelsSearchActivated || document.activeElement.readOnly) {
                e.preventDefault();
                channelsSearchActivated = true;
                document.activeElement.readOnly = false;
                document.activeElement.focus();
                try {
                    if (typeof document.activeElement.setSelectionRange === 'function') {
                        var end = (document.activeElement.value || '').length;
                        document.activeElement.setSelectionRange(end, end);
                    }
                } catch (err) {}
                return;
            }

            e.preventDefault();
            clearTimeout(searchTimeout); // Cancel auto-play timer
            var query = document.activeElement.value.replace(/[^0-9]/g, '').trim();
            if (query.length > 0) {
                playChannelByLCN(parseInt(query, 10));
            }
            return;
        }
        if ((code >= 48 && code <= 57) || (code >= 96 && code <= 105)) {
            e.preventDefault();
            var numOnSearch = (code >= 96) ? (code - 96) : (code - 48);
            if (document.activeElement.value.length < 4) {
                document.activeElement.value += numOnSearch.toString();
                var inputEvt = new Event('input', { bubbles: true });
                document.activeElement.dispatchEvent(inputEvt);
            }
            return;
        }
        if (code === 8) {
            e.preventDefault();
            document.activeElement.value = document.activeElement.value.slice(0, -1);
            var backEvt = new Event('input', { bubbles: true });
            document.activeElement.dispatchEvent(backEvt);
            return;
        }
        // DOWN - leave search input, go to category pills
        if (code === 40) {
            e.preventDefault();
            document.activeElement.readOnly = true;
            moveToFirstCategoryPill();
            return;
        }
        // LEFT - leave search input, go to back button
        if (code === 37) {
            e.preventDefault();
            document.activeElement.readOnly = true;
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
            
            console.log('[Channels] Number key pressed, focusing search:', num);
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
    console.log('[DOWN] Zone:', currentZone);

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
    console.log('[UP] Zone:', currentZone);

    if (currentZone === 'sidebar') {
        // UP in sidebar: Navigate through sidebar elements
        handleSidebarUpNavigation();
    } else if (currentZone === 'topControls') {
        // Already at top, do nothing
        console.log('[UP] Already at top controls');
    } else if (currentZone === 'tabs') {
        // UP from tabs: Move to back button (top controls)
        var backBtn = document.querySelector('.back-btn');
        if (backBtn) {
            backBtn.focus();
            currentZone = 'topControls';
            console.log('[UP] Moved from tabs to back button');
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
    console.log('[LEFT] Zone:', currentZone);

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
    console.log('[RIGHT] Zone:', currentZone);

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

// Sidebar navigation helpers
function handleSidebarDownNavigation() {
    var active = document.activeElement;
    
    // If on language arrows or text, move to first category
    if (active.id === 'langArrowLeft' || active.id === 'langArrowRight' || active.id === 'selectedLanguageText') {
        var firstCategory = document.querySelector('.category-item.focusable');
        if (firstCategory) {
            firstCategory.focus();
            sidebarCategoryIndex = 0;
        }
        return;
    }
    
    // If on category item, move to next
    if (active.classList.contains('category-item')) {
        var categories = Array.from(document.querySelectorAll('.category-item.focusable'));
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
        var categories = Array.from(document.querySelectorAll('.category-item.focusable'));
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
        console.log('[NAV] Moved to Back button');
    }
}

// Helper: Move to first category pill
function moveToFirstCategoryPill() {
    var firstPill = document.querySelector('.category-pill.focusable');
    if (firstPill) {
        firstPill.focus();
        firstPill.scrollIntoView({ inline: "start", behavior: "smooth", block: "nearest" });
        currentZone = 'tabs';
        console.log('[NAV] Moved to first category pill');
    }
}

// Helper: Move to first channel card
function moveToFirstChannelCard() {
    var firstCard = document.querySelector('.channel-card.focusable');
    if (firstCard) {
        firstCard.focus();
        scrollCardIntoView(firstCard);
        currentZone = 'cards';
        console.log('[NAV] Moved to first channel card');
    }
}

// Helper: Move within tabs (category pills) - AUTO LOAD ON FOCUS
function moveWithinTabs(direction) {
    var pills = Array.from(document.querySelectorAll('.category-pill.focusable'));
    var currentIndex = pills.indexOf(document.activeElement);

    if (currentIndex < 0) return false;

    var newIndex = currentIndex + direction;

    // Check if at boundary
    if (newIndex < 0 || newIndex >= pills.length) {
        return false; // Could not move
    }

    var targetPill = pills[newIndex];
    targetPill.focus();
    targetPill.scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
    
    // AUTO-LOAD: Trigger category load on focus (TV Channel page only)
    if (targetPill.id !== 'languagePill' && targetPill.dataset.category) {
        // Remove active from ALL pills including language pill
        pills.forEach(function(p) {
            p.classList.remove('active');
        });
        
        // Clear language filter when category is selected
        sessionStorage.removeItem('selectedLanguageId');
        sessionStorage.removeItem('selectedLanguageName');
        
        // Reset language pill text
        var languagePill = document.getElementById('languagePill');
        if (languagePill) {
            var textSpan = languagePill.querySelector('span');
            if (textSpan) {
                textSpan.textContent = 'Language';
            }
        }
        
        // Update header title
        updateHeaderWithLanguage(null);
        
        targetPill.classList.add('active');
        
        // Load channels for this category
        var category = targetPill.dataset.category;
        var gridId = targetPill.dataset.grid;
        handleCategoryFilter(category, gridId);
    }
    
    return true; // Successfully moved
}

// Helper: Move within channel cards grid
function moveWithinCardsGrid(deltaX, deltaY) {
    var cards = Array.from(document.querySelectorAll('.channel-card.focusable'));
    var currentIndex = cards.indexOf(document.activeElement);

    if (currentIndex < 0) return false;

    // Determine grid columns (default 4)
    var grid = document.querySelector('.channels-grid');
    var columnsPerRow = 4;

    if (grid) {
        var computedStyle = window.getComputedStyle(grid);
        var columns = computedStyle.gridTemplateColumns.split(' ').length;
        if (columns > 0) columnsPerRow = columns;
    }

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

// Scroll a card into the visible area of the scroll container with padding for focus effect
function scrollCardIntoView(card) {
    var container = document.getElementById('channel-grid-container');
    if (!container) return;

    var containerRect = container.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();

    // Extra space for the focus transform (scale + translateY + shadow)
    var focusPadding = 30;

    // Account for fixed header + category pills overlapping the top of container
    var categorySection = document.querySelector('.category-section');
    var visibleTop = containerRect.top;
    if (categorySection) {
        var categoryBottom = categorySection.getBoundingClientRect().bottom;
        if (categoryBottom > visibleTop) {
            visibleTop = categoryBottom;
        }
    }

    // Check if card is above visible area (behind fixed header/pills)
    if (cardRect.top - focusPadding < visibleTop) {
        var scrollOffset = cardRect.top - visibleTop - focusPadding;
        container.scrollTop += scrollOffset;
    }
    // Check if card is below visible area
    else if (cardRect.bottom + focusPadding > containerRect.bottom) {
        var scrollOffset = cardRect.bottom - containerRect.bottom + focusPadding;
        container.scrollTop += scrollOffset;
    }
}

function handleEnter(el) {
    if (!el) el = document.activeElement;

    console.log('[ENTER] Element:', el.className);

    if (el.classList.contains('back-btn')) {
        window.location.href = "home.html";
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
            console.warn("No stream URL available for:", channelName);
            console.warn("Stream not available for this channel");
            return;
        }

        // Use full channel data if available, otherwise construct from data attributes
        var channel;
        try {
            channel = JSON.parse(el.dataset.channelData);
        } catch (e) {
            channel = {
                chtitle: channelName,
                channel_name: channelName,
                streamlink: streamUrl,
                chlogo: el.dataset.logo,
                logo_url: el.dataset.logo,
                channelno: el.dataset.channelno || ""
            };
        }

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
    console.log("[Channels] Playing channel by LCN:", lcn);

    // Use masterChannelList for LCN search (never filtered)
    if (masterChannelList.length === 0) {
        console.warn("[Channels] Master channel list empty, fetching ALL channels...");
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
    console.log("[Channels] Searching LCN", lcn, "in MASTER channel list (total:", masterChannelList.length, "channels)");

    var channel = masterChannelList.find(function (ch) {
        var chNo = parseInt(ch.channelno || ch.urno || ch.chno || ch.ch_no || 0, 10);
        return chNo === lcn;
    });

    if (channel) {
        console.log("[Channels] Found LCN", lcn, ":", channel.chtitle || channel.channel_name);

        // Clear search input
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
        }

        // Play the channel immediately
        BBNL_API.playChannel(channel);
    } else {
        console.warn("[Channels] LCN", lcn, "not found in master list");
        showSearchNotFound("Channel Not Found");
    }
}

// ==========================================
// DARK MODE FUNCTIONALITY
// ==========================================

function initDarkMode() {
    console.log("[Channels] Initializing dark mode...");
    var isDarkMode = localStorage.getItem('darkMode') !== 'false';

    if (isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }

    console.log("[Channels] Dark mode:", isDarkMode ? "ON" : "OFF");
}
