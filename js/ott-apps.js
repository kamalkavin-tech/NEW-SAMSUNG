/* ================================
   BBNL IPTV - OTT APPS CONTROLLER
   No Sidebar - Back Button Header Layout
   Navigation: Header ↔ Apps Grid
   ================================ */

// ✅ NEW: Recover failed images from persistent cache on app load
(function initImageRecovery() {
    if (typeof BBNL_API !== 'undefined' && BBNL_API.retryFailedImages) {
        BBNL_API.retryFailedImages();
    }
})();

// Check authentication — post-HOME relaunch: wait for localStorage (api.js)
(function checkAuth() {
    if (typeof BBNL_gateAuthenticatedPage === 'function') {
        BBNL_gateAuthenticatedPage({ useNavigatingFlag: true });
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
            window.__BBNL_NAVIGATING = true;
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
        window.__BBNL_NAVIGATING = true;
        window.location.replace("login.html");
    }
})();

var focusables = [];
var currentFocus = 0;
var currentZone = 'apps'; // 'header' or 'apps'
var ottComingSoonPopupOpen = false;

function navigateToHomeFromOtt() {
    window.__BBNL_NAVIGATING = true;
    window.location.replace('home.html');
}

var _ottAppsPageInitialized = false;
window.addEventListener('pageshow', function (event) {
    if (event.persisted && _ottAppsPageInitialized) {
        // Page restored from BFCache — restore remote keys
        if (typeof RemoteKeys !== 'undefined') {
            RemoteKeys.registerAllKeys();
        }
        return; 
    }
});

window.onload = function () {
    _ottAppsPageInitialized = true;

    // Initialize Dark Mode from localStorage
    initDarkMode();

    // Show Coming Soon popup immediately (same as favorites page)
    showComingSoonPopup();

    // Get all focusable elements and add click handlers
    focusables = document.querySelectorAll('.focusable');

    focusables.forEach(function (el, index) {
        el.addEventListener('mouseenter', function () {
            currentFocus = index;
            el.focus();
        });

        el.addEventListener('click', function () {
            handleClick(el);
        });
    });

    // Set initial focus on Go Back button in popup
    var retryBtn = document.getElementById('retryAppsBtn');
    if (retryBtn) {
        retryBtn.focus();
        retryBtn.addEventListener('click', function() {
            navigateToHomeFromOtt();
        });
    }

    // Add zone tracking listeners
    addZoneTrackingListeners();

    // Register All Remote Keys (supports all Samsung remote types)
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
            tizen.tvinputdevice.registerKeyBatch(keys);
        } catch (e) {
        }
    }
};

// Add listeners to track which zone is focused
function addZoneTrackingListeners() {
    // Header elements (back button and search input)
    var headerElements = document.querySelectorAll('.back-btn, .search-input');
    headerElements.forEach(function(el) {
        el.addEventListener('focus', function() {
            currentZone = 'header';
        });
    });

    // App cards - use event delegation since cards are loaded dynamically
    document.addEventListener('focus', function(e) {
        if (e.target.classList.contains('app-card')) {
            currentZone = 'apps';
        }
    }, true);
}

// Keyboard navigation
document.addEventListener('keydown', function (e) {

    // While coming-soon popup is open, lock navigation to popup action only.
    if (ottComingSoonPopupOpen) {
        e.preventDefault();
        if (e.keyCode === 13 || e.keyCode === 10009) {
            navigateToHomeFromOtt();
        }
        return;
    }

    var code = e.keyCode;

    // Number keys (0-9 standard + numpad): append to search input without opening keyboard
    if ((code >= 48 && code <= 57) || (code >= 96 && code <= 105)) {
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            if (searchInput.value.length < 4) {
                var digit = code >= 96 ? code - 96 : code - 48;
                searchInput.value += digit.toString();
                searchInput.focus();
            }
        }
        return;
    }

    // Backspace: clear last digit in search
    if (code === 8) {
        var searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.length > 0) {
            searchInput.value = searchInput.value.slice(0, -1);
        }
        return;
    }

    switch (code) {
        case 37: // LEFT
            e.preventDefault();
            handleLeftNavigation();
            break;
        case 39: // RIGHT
            e.preventDefault();
            handleRightNavigation();
            break;
        case 38: // UP
            e.preventDefault();
            handleUpNavigation();
            break;
        case 40: // DOWN
            e.preventDefault();
            handleDownNavigation();
            break;
        case 13: // ENTER
            e.preventDefault();
            handleEnter();
            break;
        case 10009: // BACK
            e.preventDefault();
            navigateToHomeFromOtt();
            break;
    }
});

// Handle DOWN navigation
function handleDownNavigation() {

    if (currentZone === 'header') {
        // DOWN from header: Move to first app card
        moveToFirstAppCard();
    } else if (currentZone === 'apps') {
        // DOWN in apps: Move within grid (next row)
        moveWithinAppsGrid(0, 1);
    }
}

// Handle UP navigation
function handleUpNavigation() {

    if (currentZone === 'header') {
        // UP in header: Move between back button and search
        var headerElements = Array.from(document.querySelectorAll('.back-btn, .search-input'));
        var currentIndex = headerElements.indexOf(document.activeElement);

        if (currentIndex > 0) {
            headerElements[currentIndex - 1].focus();
        }
    } else if (currentZone === 'apps') {
        // UP in apps: Try to move within grid, or go to header
        var moved = moveWithinAppsGrid(0, -1);
        if (!moved) {
            // At top of apps, move to header (search input)
            moveToHeader();
        }
    }
}

// Handle LEFT navigation
function handleLeftNavigation() {

    if (currentZone === 'header') {
        // LEFT in header: Move between search and back button
        var headerElements = Array.from(document.querySelectorAll('.back-btn, .search-input'));
        var currentIndex = headerElements.indexOf(document.activeElement);

        if (currentIndex > 0) {
            headerElements[currentIndex - 1].focus();
        }
    } else if (currentZone === 'apps') {
        // LEFT in apps: Move within row
        moveWithinAppsGrid(-1, 0);
    }
}

// Handle RIGHT navigation
function handleRightNavigation() {

    if (currentZone === 'header') {
        // RIGHT in header: Move between back button and search
        var headerElements = Array.from(document.querySelectorAll('.back-btn, .search-input'));
        var currentIndex = headerElements.indexOf(document.activeElement);

        if (currentIndex < headerElements.length - 1) {
            headerElements[currentIndex + 1].focus();
        }
    } else if (currentZone === 'apps') {
        // RIGHT in apps: Move within row
        moveWithinAppsGrid(1, 0);
    }
}

// Helper: Move to first app card
function moveToFirstAppCard() {
    var firstCard = document.querySelector('.app-card.focusable');
    if (firstCard) {
        firstCard.focus();
        scrollIntoViewSmooth(firstCard);
        currentZone = 'apps';
    }
}

// Helper: Move to header (search input)
function moveToHeader() {
    var searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.focus();
        currentZone = 'header';
    } else {
        var backBtn = document.querySelector('.back-btn');
        if (backBtn) {
            backBtn.focus();
            currentZone = 'header';
        }
    }
}

// Helper: Move within apps grid
function moveWithinAppsGrid(deltaX, deltaY) {
    var activeElement = document.activeElement;
    var appsGrid = document.getElementById('appsGrid');

    if (!appsGrid) return false;

    var cards = Array.from(appsGrid.querySelectorAll('.app-card.focusable'));
    var currentIndex = cards.indexOf(activeElement);

    if (currentIndex < 0) return false;

    // Determine grid columns (default 5)
    var columnsPerRow = 5;
    var computedStyle = window.getComputedStyle(appsGrid);
    var columns = computedStyle.gridTemplateColumns.split(' ').length;
    if (columns > 0) columnsPerRow = columns;

    // Calculate new position
    var currentRow = Math.floor(currentIndex / columnsPerRow);
    var currentCol = currentIndex % columnsPerRow;

    var newRow = currentRow + deltaY;
    var newCol = currentCol + deltaX;

    // Check bounds
    if (newCol < 0 || newCol >= columnsPerRow) return false;
    if (newRow < 0) return false;

    var newIndex = newRow * columnsPerRow + newCol;

    // Check if new index is valid
    if (newIndex >= 0 && newIndex < cards.length) {
        cards[newIndex].focus();
        scrollIntoViewSmooth(cards[newIndex]);
        return true;
    }

    return false;
}

// Helper: Smooth scroll
function scrollIntoViewSmooth(element) {
    if (element) {
        element.scrollIntoView({
            behavior: 'auto',
            block: 'center',
            inline: 'nearest'
        });
    }
}

// Handle ENTER key press
function handleEnter() {
    var activeElement = document.activeElement;
    if (activeElement) {
        handleClick(activeElement);
    }
}

// Handle click on any element
function handleClick(element) {
    if (!element) return;


    // Check for data-route attribute first (highest priority for navigation)
    var route = element.getAttribute('data-route');
    if (route) {
        window.location.href = route;
        return;
    }

    // Back button or Go Back button clicked
    if (element.classList.contains('back-btn') || element.id === 'retryAppsBtn') {
        navigateToHomeFromOtt();
        return;
    }

    // App card clicked
    if (element.classList.contains('app-card')) {
        var appName = element.getAttribute('data-app-name');
        var pkgId = element.getAttribute('data-pkg-id');

        // Try to launch app on Tizen
        try {
            if (pkgId && typeof tizen !== 'undefined') {
                tizen.application.launch(pkgId);
            } else {
            }
        } catch (e) {
            console.error("Failed to launch app:", e);
        }
        return;
    }

    // Search input focused
    if (element.classList.contains('search-input')) {
        return;
    }
}

/**
 * Load OTT Apps from API
 */
function loadOTTApps() {

    BBNL_API.getAllowedApps()
        .then(function (response) {

            // Check if response is successful
            if (response && response.status && Number(response.status.err_code) === 0) {
                // Extract apps array from response
                if (response.apps && response.apps.length > 0) {
                    renderApps(response.apps);
                } else {
                    showError("No OTT apps available at the moment.", 'no_apps');
                }
            } else {
                var errorMsg = response && response.status ? response.status.err_msg : "Unknown error";
                console.error("[OTT Apps] API Error:", errorMsg);
                showError(errorMsg, 'coming_soon');
            }
        })
        .catch(function (error) {
            console.error("[OTT Apps] Failed to load apps:", error);
            if (isNetworkDisconnected()) {
                showError("Please check your network and try again.", 'network');
            } else {
                showError("Failed to load OTT apps. Please try again later.", 'network');
            }
        });
}

/**
 * Render apps to the grid
 */
function renderApps(apps) {
    var appsGrid = document.getElementById("appsGrid");
    appsGrid.innerHTML = ""; // Clear existing content

    apps.forEach(function (app, index) {
        var appGroup = document.createElement("div");
        appGroup.className = "app-group";

        var appCard = document.createElement("div");
        appCard.className = "app-card focusable";
        appCard.setAttribute("tabindex", "0");
        appCard.setAttribute("data-app-name", app.appname);
        appCard.setAttribute("data-pkg-id", app.pkgid);

        var appIcon = document.createElement("div");
        appIcon.className = "app-icon";

        var iconUrl = app.icon || app.appicon || app.logo || '';
        if (typeof BBNL_API !== 'undefined' && BBNL_API.getValidatedImageUrl) {
            iconUrl = BBNL_API.getValidatedImageUrl(iconUrl);
        } else if (typeof BBNL_API !== 'undefined' && BBNL_API.resolveAssetUrl) {
            iconUrl = BBNL_API.resolveAssetUrl(iconUrl);
        }

        // Check if app has icon URL
        if (iconUrl) {
            var img = document.createElement("img");
            if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, iconUrl);
            } else {
                img.src = iconUrl;
            }
            img.alt = app.appname;
            img.style.width = "100%";
            img.style.height = "100%";
            img.style.objectFit = "contain";
            appIcon.appendChild(img);
        } else {
            // Fallback text if no icon
            var appText = document.createElement("span");
            appText.className = "app-name";
            appText.innerText = app.appname;
            appIcon.appendChild(appText);
        }

        appCard.appendChild(appIcon);
        appGroup.appendChild(appCard);

        var cardTitle = document.createElement("div");
        cardTitle.className = "card-title-bottom";
        cardTitle.innerText = app.appname;
        appGroup.appendChild(cardTitle);

        var cardSubtitle = document.createElement("div");
        cardSubtitle.className = "card-subtitle-bottom";
        cardSubtitle.innerText = "Streaming Services";
        appGroup.appendChild(cardSubtitle);

        appsGrid.appendChild(appGroup);
    });

    // Re-initialize focusables after rendering
    initializeFocusables();

}

/**
 * Show error popup with proper title and image based on error type
 * @param {string} message - Error message to display
 * @param {string} [type] - Error type: 'network', 'no_apps', or 'coming_soon' (default)
 */
function showError(message, type) {
    var popup = document.getElementById("noAppsPopup");
    var appsGrid = document.getElementById("appsGrid");

    if (popup) {
        var titleEl = popup.querySelector(".error-popup-title");
        var msgEl = popup.querySelector(".error-popup-message");
        var img = document.getElementById("errorImg_comingSoonOtt");
        var btn = document.getElementById("retryAppsBtn");

        // Set title, image, and button based on error type
        if (type === 'network') {
            if (titleEl) titleEl.innerText = "Failed to Load";
            if (img && typeof ErrorImagesAPI !== 'undefined') {
                if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                    BBNL_API.setImageSource(img, ErrorImagesAPI.getImageUrl('NO_INTERNET_CONNECTION'));
                } else {
                    img.src = ErrorImagesAPI.getImageUrl('NO_INTERNET_CONNECTION');
                }
            }
            if (btn) btn.innerText = "Try Again";
        } else if (type === 'no_apps') {
            if (titleEl) titleEl.innerText = "No Apps Available";
            if (img && typeof ErrorImagesAPI !== 'undefined') {
                if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                    BBNL_API.setImageSource(img, ErrorImagesAPI.getImageUrl('COMING_SOON_OTT'));
                } else {
                    img.src = ErrorImagesAPI.getImageUrl('COMING_SOON_OTT');
                }
            }
            if (btn) btn.innerText = "Go Back";
        } else {
            if (titleEl) titleEl.innerText = "Coming Soon";
            if (img && typeof ErrorImagesAPI !== 'undefined') {
                if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                    BBNL_API.setImageSource(img, ErrorImagesAPI.getImageUrl('COMING_SOON_OTT'));
                } else {
                    img.src = ErrorImagesAPI.getImageUrl('COMING_SOON_OTT');
                }
            }
            if (btn) btn.innerText = "Go Back";
        }

        if (msgEl) {
            msgEl.innerText = message;
        }

        popup.style.display = "flex";

        // Focus the button
        setTimeout(function() {
            if (btn) btn.focus();
        }, 100);
    }

    if (appsGrid) {
        appsGrid.innerHTML = "";
    }
}

/**
 * Hide error popup
 */
function hideError() {
    var popup = document.getElementById("noAppsPopup");
    if (popup) {
        popup.style.display = "none";
    }

    var appsGrid = document.getElementById("appsGrid");
    if (appsGrid) {
        appsGrid.innerHTML = '<div class="loading-spinner">Loading Apps...</div>';
    }
}

/**
 * Initialize focusable elements
 */
function initializeFocusables() {
    // Select all focusables
    focusables = document.querySelectorAll(".focusable");

    // Set initial focus on first app card if available
    var firstAppCard = document.querySelector('.app-card.focusable');
    if (firstAppCard) {
        firstAppCard.focus();
        currentZone = 'apps';
    }

    // Mouse support
    focusables.forEach(function (el, index) {
        el.addEventListener("mouseenter", function () {
            currentFocus = index;
            el.focus();
        });

        el.addEventListener("click", function (e) {
            handleEnter();
        });
    });

    // Re-add zone tracking for dynamically loaded cards
    var appCards = document.querySelectorAll('.app-card');
    appCards.forEach(function(card) {
        card.addEventListener('focus', function() {
            currentZone = 'apps';
        });
    });
}

// ==========================================
// NETWORK CHECK HELPER
// ==========================================

function isNetworkDisconnected() {
    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            return webapis.network.getActiveConnectionType() === 0;
        }
    } catch (e) {}
    return !navigator.onLine;
}

// ==========================================
// COMING SOON POPUP (shown immediately on load)
// ==========================================

/**
 * Show Coming Soon popup immediately - same approach as favorites page
 */
function showComingSoonPopup() {
    var popup = document.getElementById("noAppsPopup");
    var appsGrid = document.getElementById("appsGrid");
    var content = document.querySelector(".ott-content");
    var header = document.querySelector(".ott-header");

    if (popup) {
        // Blur background content
        if (content) content.classList.add("blurred");
        if (header) header.classList.add("blurred");
        
        popup.style.display = "flex";
        ottComingSoonPopupOpen = true;

        var titleEl = popup.querySelector(".error-popup-title");
        var msgEl = popup.querySelector(".error-popup-message");
        var img = document.getElementById("errorImg_comingSoonOtt");
        var btn = document.getElementById("retryAppsBtn");

        // Set Coming Soon content
        if (titleEl) titleEl.innerText = "Coming Soon";
        if (msgEl) msgEl.innerText = "OTT Apps feature is coming soon. Stay tuned!";
        if (btn) btn.innerText = "Go Back";

        // Load error image if available
        if (img && typeof ErrorImagesAPI !== 'undefined') {
            var imgUrl = ErrorImagesAPI.getImageUrl('COMING_SOON_OTT');
            if (imgUrl) {
                if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                    BBNL_API.setImageSource(img, imgUrl);
                } else {
                    img.src = imgUrl;
                }
            }
        }

        popup.style.display = "flex";
        ottComingSoonPopupOpen = true;

        // Focus the Go Back button
        setTimeout(function() {
            if (btn) btn.focus();
        }, 100);
    }

    // Clear the apps grid
    if (appsGrid) {
        appsGrid.innerHTML = "";
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
