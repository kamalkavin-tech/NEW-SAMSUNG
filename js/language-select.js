/* ================================
   BBNL IPTV - LANGUAGE SELECT PAGE CONTROLLER
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
        var ud = localStorage.getItem("bbnl_user");
        if (!ud || !JSON.parse(ud).userid) {
            console.log("[Auth] bbnl_user invalid - redirecting to login for re-auth");
            window.location.replace("login.html");
            return;
        }
    } catch (e) {}
})();

var focusables = [];
var currentFocus = 0;
var allLanguages = [];

window.onload = function () {
    console.log("=== BBNL Language Select Page Initialized ===");

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
        console.log("Languages Fetched:", langResponse);

        if (Array.isArray(langResponse) && langResponse.length > 0) {
            // Sort languages alphabetically by title
            langResponse.sort(function(a, b) {
                var nameA = (a.langtitle || '').toLowerCase();
                var nameB = (b.langtitle || '').toLowerCase();
                // Keep "All" or "Subscribed" at the top
                if (nameA.includes('all') || nameA.includes('subscribed')) return -1;
                if (nameB.includes('all') || nameB.includes('subscribed')) return 1;
                return nameA.localeCompare(nameB);
            });
            allLanguages = langResponse;
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
        const langName = lang.langtitle || 'Unknown';
        const langId = lang.langid || '';
        const langDetails = lang.langdetails || '';
        const langLogo = lang.langlogo || '';

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
            img.src = langLogo;
            img.alt = langName;
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

        if (langDetails && langDetails !== langName) {
            const subtitle = document.createElement('div');
            subtitle.className = 'language-card-subtitle';
            subtitle.textContent = langDetails;
            infoDiv.appendChild(subtitle);
        }

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
}

// ==========================================
// LANGUAGE SELECTION HANDLER
// ==========================================

function handleLanguageSelect(langId, langName) {
    console.log('Language selected:', langName, 'ID:', langId);

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

    // Special cases
    if (langName.toLowerCase().includes('subscribed')) return '📺';
    if (langName.toLowerCase().includes('all')) return '🌐';

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
        target.scrollIntoView({ block: "center", behavior: "smooth" });
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
    console.log("[Language Select] Initializing dark mode...");
    var isDarkMode = localStorage.getItem('darkMode') !== 'false'; // Default to dark mode

    if (isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }

    console.log("[Language Select] Dark mode:", isDarkMode ? "ON" : "OFF");
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
