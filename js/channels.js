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

// Check authentication - redirect to login if not logged in
(function checkAuth() {
    var userData = localStorage.getItem("bbnl_user");
    if (!userData) {
        console.log("[Auth] User not logged in, redirecting to login...");
        window.location.replace("login.html");
        return;
    }
})();

var focusables = [];
var currentFocus = 0;
var allChannels = [];
var currentCategory = "All";
var currentLanguage = "All";
var allLanguages = [];
var searchTimeout = null;

// Navigation zones: 'topControls' (back, search), 'tabs' (category pills), 'cards' (channel cards)
var currentZone = 'tabs';
var lastTopControlElement = null; // Track last focused top control for UP navigation

window.onload = function () {
    console.log("=== BBNL Channels Page Initialized ===");

    // Initialize Dark Mode from localStorage
    initDarkMode();

    // Initialize UI
    initPage();

    // Initialize category pills
    initCategoryPills();

    // Initialize language dropdown
    initLanguageDropdown();

    // Initialize search functionality
    initSearchFunctionality();

    // Add zone tracking listeners
    addZoneTrackingListeners();

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
    // Top controls (back button, search input)
    var topControls = document.querySelectorAll('.back-btn, .search-input');
    topControls.forEach(function(el) {
        el.addEventListener('focus', function() {
            currentZone = 'topControls';
            lastTopControlElement = el; // Remember which top control was focused
            console.log('[Channels Navigation] Zone: Top Controls');
        });
    });

    // Category pills
    var pills = document.querySelectorAll('.category-pill');
    pills.forEach(function(pill) {
        pill.addEventListener('focus', function() {
            currentZone = 'tabs';
            console.log('[Channels Navigation] Zone: Tabs');
        });
    });

    // Channel cards - use event delegation since cards load dynamically
    document.addEventListener('focus', function(e) {
        if (e.target.classList.contains('channel-card')) {
            currentZone = 'cards';
            console.log('[Channels Navigation] Zone: Cards');
        }
    }, true);
}

async function initPage() {
    try {
        // Fetch Categories
        const categoryResponse = await BBNL_API.getCategoryList();
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
    const fofiPlayedThisSession = sessionStorage.getItem('fofiPlayedThisSession');

    // Determine if user has any language filter active (either from URL or session)
    const hasLanguageFilter = selectedLangName || urlLang;

    if (selectedLangName) {
        const languagePill = document.getElementById('languagePill');
        if (languagePill) {
            const textSpan = languagePill.querySelector('span');
            if (textSpan) {
                textSpan.textContent = selectedLangName;
            }
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
        await loadChannels();
    }

    refreshFocusables();

    // Auto-play Fofi channel (LCN 999) on FIRST visit to channels page after login
    // This only happens once per login session
    if (!fofiPlayedThisSession && !hasLanguageFilter) {
        console.log('[Channels] First login visit - Auto-playing Fofi channel (LCN 999)');
        sessionStorage.setItem('fofiPlayedThisSession', 'true');
        playChannelByLCN(999);
        return;
    }

    // Set initial focus on first category pill
    setInitialFocus();
}

function setInitialFocus() {
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
    const categoryPillsContainer = document.getElementById('categoryPills');
    if (!categoryPillsContainer) return;

    const languagePill = document.getElementById('languagePill');
    categoryPillsContainer.innerHTML = '';

    categories.forEach((cat, index) => {
        const pill = document.createElement('button');
        pill.className = 'category-pill focusable';
        pill.tabIndex = 0;
        pill.dataset.category = (cat.grtitle || '').toLowerCase();
        pill.dataset.grid = cat.grid || '';
        pill.textContent = cat.grtitle || 'Unknown';

        if (index === 0) {
            pill.classList.add('active');
        }

        // Add focus listener for zone tracking
        pill.addEventListener('focus', function() {
            currentZone = 'tabs';
        });

        categoryPillsContainer.appendChild(pill);
    });

    if (languagePill) {
        categoryPillsContainer.appendChild(languagePill);
    }

    initCategoryPills();
}

function initCategoryPills() {
    const pills = document.querySelectorAll('.category-pill[data-category]');

    pills.forEach(pill => {
        pill.addEventListener('click', function () {
            if (pill.id === 'languagePill') return;

            pills.forEach(p => {
                if (p.id !== 'languagePill') {
                    p.classList.remove('active');
                }
            });

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

    if (gridId === '' || !gridId) {
        loadChannels();
    } else if (gridId === 'subs') {
        loadChannels({ subscribed: 'yes' });
    } else {
        loadChannels({ grid: gridId });
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
        // Filter out non-numeric characters on input
        searchInput.addEventListener('input', function() {
            // Strip any non-digit characters
            var cleaned = searchInput.value.replace(/[^0-9]/g, '');
            if (cleaned !== searchInput.value) {
                searchInput.value = cleaned;
            }

            clearTimeout(searchTimeout);

            if (cleaned.length > 0) {
                // Auto-play the channel after 2 seconds of no input
                searchTimeout = setTimeout(function() {
                    var lcn = parseInt(cleaned, 10);
                    console.log("[Channels] Auto-playing LCN:", lcn);
                    playChannelByLCN(lcn);
                }, 2000);
            }
        });

        // Block non-numeric key presses (extra safety for TV keyboard)
        searchInput.addEventListener('keypress', function(e) {
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

// ==========================================
// ERROR POPUP FUNCTIONALITY
// ==========================================

function showErrorPopup(type) {
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
    container.innerHTML = '<div class="loading-spinner">Loading Channels...</div>';

    hideErrorPopups();

    try {
        const apiOptions = {
            grid: options.grid || "",
            langid: options.langid || "",
            search: options.search || ""
        };

        let response = await BBNL_API.getChannelList(apiOptions);

        if (Array.isArray(response)) {
            console.log(`[Channels Page] Loaded ${response.length} channels`);

            allChannels = response;

            if (allChannels.length === 0) {
                container.innerHTML = '<div class="loading-spinner">No channels found</div>';
                if (isNetworkDisconnected()) {
                    showErrorPopup('channels');
                }
                return;
            }

            renderAllChannels(allChannels);
        } else {
            container.innerHTML = '';
            console.error("Channel Load Failed", response);
            if (isNetworkDisconnected()) {
                showErrorPopup('channels');
            }
        }
    } catch (e) {
        console.error("[Channels Page] Exception:", e);
        container.innerHTML = '';
        if (isNetworkDisconnected()) {
            showErrorPopup('internet');
        }
    }
}

function renderAllChannels(channels) {
    const container = document.getElementById("channel-grid-container");
    container.innerHTML = "";

    if (channels.length === 0) {
        container.innerHTML = '<div class="loading-spinner">No channels found</div>';
        refreshFocusables();
        return;
    }

    const grid = document.createElement("div");
    grid.className = "channels-grid";

    channels.forEach(ch => {
        const card = createChannelCard(ch);
        grid.appendChild(card);
    });

    container.appendChild(grid);
    refreshFocusables();
}

function createChannelCard(ch) {
    const chName = ch.chtitle || ch.channel_name || "Channel";
    const chLogo = ch.chlogo || ch.logo_url || "";
    const streamLink = ch.streamlink || ch.channel_url || "";
    const chNo = ch.channelno || ch.urno || ch.chno || ch.ch_no || "";

    let isLive = true;

    const card = document.createElement("div");
    card.className = "channel-card focusable";
    card.tabIndex = 0;
    card.dataset.url = streamLink;
    card.dataset.name = chName;
    card.dataset.logo = chLogo;
    card.dataset.channelno = chNo;
    // Store full channel data for player navigation
    card.dataset.channelData = JSON.stringify(ch);

    const iconDiv = document.createElement("div");
    iconDiv.className = "channel-icon";

    if (isLive) {
        const badge = document.createElement("div");
        badge.className = "live-badge";
        badge.innerHTML = '<div class="live-dot"></div> LIVE';
        iconDiv.appendChild(badge);
    }

    if (chLogo && !chLogo.includes("chnlnoimage")) {
        const img = document.createElement("img");
        img.src = chLogo;
        img.alt = chName;
        iconDiv.appendChild(img);
    } else {
        const fallback = document.createElement("div");
        fallback.className = "no-image-placeholder";
        fallback.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><div style="margin-top: 8px; color: #333;">No Image</div>';
        iconDiv.appendChild(fallback);
    }
    card.appendChild(iconDiv);

    const cardInfo = document.createElement("div");
    cardInfo.className = "card-info";

    const title = document.createElement("div");
    title.className = "card-title-bottom";
    title.innerText = chNo ? chNo + " - " + chName : chName;
    cardInfo.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "card-subtitle-bottom";
    sub.innerText = chNo ? "LCN " + chNo : "Live Channel";
    cardInfo.appendChild(sub);

    card.appendChild(cardInfo);

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
        // Check if we came from language filter
        var selectedLang = sessionStorage.getItem('selectedLanguageId');
        if (selectedLang && selectedLang !== '') {
            console.log('[Channels] Navigating back to language-select (filtered view)');
            // Clear the filter and go to language-select
            sessionStorage.removeItem('selectedLanguageId');
            sessionStorage.removeItem('selectedLanguageName');
            window.location.href = "language-select.html";
        } else {
            window.location.href = "home.html";
        }
        return;
    }

    // Allow typing in search input - only intercept navigation keys
    var isSearchFocused = document.activeElement && document.activeElement.id === 'searchInput';
    if (isSearchFocused) {
        // ENTER - play the channel number immediately
        if (code === 13) {
            e.preventDefault();
            clearTimeout(searchTimeout); // Cancel auto-play timer
            var query = document.activeElement.value.replace(/[^0-9]/g, '').trim();
            if (query.length > 0) {
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

    if (currentZone === 'topControls') {
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

    if (currentZone === 'topControls') {
        // Already at top, do nothing
        console.log('[UP] Already at top controls');
    } else if (currentZone === 'tabs') {
        // UP from tabs: Move to last focused top control (Back or Search)
        if (lastTopControlElement) {
            lastTopControlElement.focus();
            currentZone = 'topControls';
        } else {
            moveToBackButton();
        }
    } else if (currentZone === 'cards') {
        // UP in cards: Try to move up in grid, or go to tabs
        var moved = moveWithinCardsGrid(0, -1);
        if (!moved) {
            // At top row, move to category tabs
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
    } else if (currentZone === 'tabs') {
        // LEFT in tabs: Move to previous pill
        moveWithinTabs(-1);
    } else if (currentZone === 'cards') {
        // LEFT in cards: Move left in grid
        moveWithinCardsGrid(-1, 0);
    }
}

// Handle RIGHT navigation
function handleRightNavigation() {
    console.log('[RIGHT] Zone:', currentZone);

    if (currentZone === 'topControls') {
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

// Helper: Move within tabs (category pills)
function moveWithinTabs(direction) {
    var pills = Array.from(document.querySelectorAll('.category-pill.focusable'));
    var currentIndex = pills.indexOf(document.activeElement);

    if (currentIndex < 0) return;

    var newIndex = currentIndex + direction;

    if (newIndex >= 0 && newIndex < pills.length) {
        pills[newIndex].focus();
        pills[newIndex].scrollIntoView({ inline: "center", behavior: "smooth", block: "nearest" });
    }
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
            alert("Stream not available for this channel");
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
 * Searches allChannels array for matching channelno and plays immediately
 * @param {Number} lcn - The LCN number to play
 */
function playChannelByLCN(lcn) {
    console.log("[Channels] Playing channel by LCN:", lcn);

    if (allChannels.length === 0) {
        console.warn("[Channels] No channels loaded, fetching...");
        BBNL_API.getChannelList().then(function(channels) {
            if (channels && Array.isArray(channels)) {
                allChannels = channels;
                findAndPlayLCN(lcn);
            }
        });
        return;
    }

    findAndPlayLCN(lcn);
}

function findAndPlayLCN(lcn) {
    var channel = allChannels.find(function(ch) {
        var chNo = parseInt(ch.channelno || ch.urno || ch.chno || ch.ch_no || 0, 10);
        return chNo === lcn;
    });

    if (channel) {
        console.log("[Channels] Found LCN", lcn, ":", channel.chtitle || channel.channel_name);
        BBNL_API.playChannel(channel);
    } else {
        console.warn("[Channels] LCN", lcn, "not found");
        alert("Channel " + lcn + " not found");
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
