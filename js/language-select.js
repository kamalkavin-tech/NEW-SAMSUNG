/* ================================
   BBNL IPTV - LANGUAGE SELECT PAGE CONTROLLER
   ================================ */

// ✅ NEW: Recover failed images from persistent cache on app load
(function initImageRecovery() {
    if (typeof BBNL_API !== 'undefined' && BBNL_API.retryFailedImages) {
        BBNL_API.retryFailedImages();
    }
})();

// Check authentication - redirect to login if never logged in
// NOTE: Never remove hasLoggedInOnce — it must persist across HOME relaunch.
(function checkAuth() {
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
        return;
    }
})();

var focusables = [];
var currentFocus = 0;
var allLanguages = [];
var languageLogoCache = {};
var languageLogoPrefetchInFlight = {};

function sanitizeLanguageText(value) {
    var str = String(value || '');
    // Strip simple HTML tags returned by API payloads.
    str = str.replace(/<[^>]*>/g, ' ');
    return str.replace(/\s+/g, ' ').trim();
}

function getLanguageLogoUrl(lang) {
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
            return (typeof BBNL_API !== 'undefined' && BBNL_API.getValidatedImageUrl)
                ? BBNL_API.getValidatedImageUrl(str)
                : ((typeof BBNL_API !== 'undefined' && BBNL_API.resolveAssetUrl)
                    ? BBNL_API.resolveAssetUrl(str)
                    : str);
        }
    }
    return '';
}

window.onload = function () {

    // Initialize Dark Mode from localStorage
    initDarkMode();

    // Load languages from API
    initPage();

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

async function initPage() {
    try {
        // Fetch Languages
        const langResponse = await BBNL_API.getLanguageList();

        if (Array.isArray(langResponse) && langResponse.length > 0) {
            // Sort languages alphabetically by title
            langResponse.sort(function(a, b) {
                var nameA = sanitizeLanguageText(a.langtitle || '').toLowerCase();
                var nameB = sanitizeLanguageText(b.langtitle || '').toLowerCase();
                // Keep "All" or "Subscribed" at the top
                if (nameA.includes('all') || nameA.includes('subscribed')) return -1;
                if (nameB.includes('all') || nameB.includes('subscribed')) return 1;
                return nameA.localeCompare(nameB);
            });
            allLanguages = langResponse;
            primeLanguageLogos(langResponse, 18);
            renderLanguages(langResponse);
        } else {
            showError();
        }
    } catch (e) {
        console.error("Init Exception:", e);
        showError();
    }

    // Refresh Focusables
    refreshFocusables();
}

// ==========================================
// RENDER LANGUAGE CARDS
// ==========================================

function renderLanguages(languages) {
    const container = document.getElementById('languageGrid');
    if (!container) return;

    container.innerHTML = '';

    languages.forEach(lang => {
        const langName = sanitizeLanguageText(lang.langtitle || '') || 'Unknown';
        const langId = lang.langid || '';
        const langDetails = sanitizeLanguageText(lang.langdetails || '');
        const langLogo = getLanguageLogoUrl(lang);

        // Create language card
        const card = document.createElement('div');
        card.className = 'language-card focusable';
        card.tabIndex = 0;
        card.dataset.langid = langId;
        card.dataset.langname = langName;

        // Language Icon
        const iconDiv = document.createElement('div');
        iconDiv.className = 'language-icon';

        if (langLogo && !langLogo.includes('noimage')) {
            const img = document.createElement('img');
            img.className = 'language-logo';
            img.alt = langName;
            // Load immediately (no lazy loading)
            if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, langLogo);
            } else {
                img.src = langLogo;
            }
            img.onload = function () {
                languageLogoCache[langLogo] = true;
            };
            img.onerror = function () {
                img.style.display = 'none';
                var fallback = document.createElement('div');
                fallback.className = 'language-icon-text';
                fallback.textContent = getLanguageInitial(langName);
                iconDiv.appendChild(fallback);
            };
            iconDiv.appendChild(img);
        } else {
            // Fallback to text icon
            const textIcon = document.createElement('div');
            textIcon.className = 'language-icon-text';
            textIcon.textContent = getLanguageInitial(langName);
            iconDiv.appendChild(textIcon);
        }

        card.appendChild(iconDiv);

        // Language Info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'language-card-info';

        const title = document.createElement('div');
        title.className = 'language-card-title';
        title.textContent = langName;
        infoDiv.appendChild(title);

        // Subtitle intentionally hidden to avoid duplicate/garbled secondary labels.

        card.appendChild(infoDiv);

        // Click Event
        card.addEventListener('click', () => handleLanguageSelect(langId, langName));

        // Mouse Hover Event
        card.addEventListener('mouseenter', () => {
            const idx = Array.from(focusables).indexOf(card);
            if (idx >= 0) {
                currentFocus = idx;
                card.focus();
            }
        });

        container.appendChild(card);
    });

    refreshFocusables();
    // All language logos load immediately (no lazy loading)
}

function primeLanguageLogos(languages, maxCount) {
    if (!Array.isArray(languages) || languages.length === 0) return;
    var limit = Math.min(maxCount || 16, languages.length);

    for (var i = 0; i < limit; i++) {
        var lang = languages[i] || {};
        var logoUrl = String(getLanguageLogoUrl(lang) || '').trim();
        if (!logoUrl || logoUrl.indexOf('noimage') !== -1) continue;
        if (languageLogoCache[logoUrl] || languageLogoPrefetchInFlight[logoUrl]) continue;

        languageLogoPrefetchInFlight[logoUrl] = true;
        var pre = new Image();
        pre.onload = function () {
            languageLogoCache[this.src] = true;
            delete languageLogoPrefetchInFlight[this.src];
        };
        pre.onerror = function () {
            var failedSrc = this.src;
            delete languageLogoPrefetchInFlight[failedSrc];
        };
        if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
            BBNL_API.setImageSource(pre, logoUrl);
        } else {
            pre.src = logoUrl;
        }
    }
}

// ==========================================
// LANGUAGE SELECTION HANDLER
// ==========================================

function handleLanguageSelect(langId, langName) {

    // Store selected language in sessionStorage
    sessionStorage.setItem('selectedLanguageId', langId || '');
    sessionStorage.setItem('selectedLanguageName', langName || 'All Channels');

    // Navigate back to channels page
    window.location.href = 'channels.html';
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Get first letter or icon for language
 */
function getLanguageInitial(langName) {
    if (!langName) return '?';

    // Special cases - use text symbols compatible with Samsung TV
    if (langName.toLowerCase().includes('subscribed')) return 'SUB';
    if (langName.toLowerCase().includes('all')) return 'ALL';

    // Return first character
    return langName.charAt(0).toUpperCase();
}

/**
 * Show error popup
 */
function showError() {
    const container = document.getElementById('languageGrid');
    if (container) {
        container.innerHTML = '<div class="loading-spinner">Unable to load languages</div>';
    }
    document.getElementById('noInternetPopup').style.display = 'flex';
}

/**
 * Hide error popup
 */
function hideError() {
    document.getElementById('noInternetPopup').style.display = 'none';
}

// ==========================================
// NAVIGATION & FOCUS MANAGEMENT
// ==========================================

function refreshFocusables() {
    focusables = document.querySelectorAll(".focusable");
    if (focusables.length > 0) {
        let hasFocus = false;
        for (let i = 0; i < focusables.length; i++) {
            if (document.activeElement === focusables[i]) {
                currentFocus = i;
                hasFocus = true;
                break;
            }
        }

        if (!hasFocus) {
            currentFocus = 0;
            focusables[0].focus();
        }
    }
}

document.addEventListener("keydown", function (e) {
    var code = e.keyCode;

    // Back button
    if (code === 10009) {
        e.preventDefault();
        window.location.href = 'channels.html';
        return;
    }

    // Prevent default for navigation keys
    if ([37, 38, 39, 40, 13].indexOf(code) !== -1) {
        e.preventDefault();
    }

    const active = document.activeElement;

    // Compute grid columns dynamically from CSS
    var columnsPerRow = 4;
    var grid = document.getElementById('languageGrid');
    if (grid) {
        var computedStyle = window.getComputedStyle(grid);
        var columns = computedStyle.gridTemplateColumns.split(' ').length;
        if (columns > 0) columnsPerRow = columns;
    }

    if (code === 37) { // LEFT
        moveFocus(-1);
    }

    if (code === 38) { // UP
        moveFocus(-columnsPerRow); // Dynamic grid step
    }

    if (code === 39) { // RIGHT
        moveFocus(1);
    }

    if (code === 40) { // DOWN
        moveFocus(columnsPerRow); // Dynamic grid step
    }

    if (code === 13) { // ENTER
        handleEnter(active);
    }
});

function moveFocus(step) {
    const all = Array.from(document.querySelectorAll(".focusable:not([style*='display: none'])"));
    const idx = all.indexOf(document.activeElement);

    if (idx === -1 && all.length > 0) {
        all[0].focus();
        return;
    }

    let next = idx + step;
    if (next >= 0 && next < all.length) {
        const target = all[next];
        target.focus();
        target.scrollIntoView({ block: "center", behavior: "auto" });
    }
}

function handleEnter(el) {
    if (!el) el = document.activeElement;

    if (el.classList.contains('back-btn')) {
        window.location.href = 'channels.html';
        return;
    }

    if (el.classList.contains('language-card')) {
        el.click();
        return;
    }

    if (el.classList.contains('error-popup-btn')) {
        hideError();
        initPage();
        return;
    }
}

// ==========================================
// DARK MODE FUNCTIONALITY
// ==========================================

/**
 * Initialize dark mode from localStorage
 */
function initDarkMode() {
    var isDarkMode = localStorage.getItem('darkMode') !== 'false'; // Default to dark mode

    if (isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }

}

// ==========================================
// ERROR RETRY BUTTON
// ==========================================

document.addEventListener('DOMContentLoaded', function () {
    const retryBtn = document.getElementById('retryInternetBtn');
    if (retryBtn) {
        retryBtn.addEventListener('click', function () {
            hideError();
            initPage();
        });
    }
});
