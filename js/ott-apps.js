/* ================================
   BBNL IPTV - OTT APPS CONTROLLER
   No Sidebar - Back Button Header Layout
   Navigation: Header ↔ Apps Grid
   ================================ */

// Check authentication - redirect to login only if never logged in before
(function checkAuth() {
    var hasLoggedInOnce = localStorage.getItem("hasLoggedInOnce");
    if (hasLoggedInOnce !== "true") {
        console.log("[Auth] User has never logged in, redirecting to login...");
        window.location.replace("login.html");
        return;
    }
})();

var focusables = [];
var currentFocus = 0;
var currentZone = 'apps'; // 'header' or 'apps'

window.onload = function () {
    console.log("=== BBNL OTT Apps Page Initialized ===");

    // Initialize Dark Mode from localStorage
    initDarkMode();

    // Load OTT Apps from API
    loadOTTApps();

    // Get all focusable elements and add click handlers
    focusables = document.querySelectorAll('.focusable');
    console.log("Found focusable elements:", focusables.length);

    focusables.forEach(function (el, index) {
        el.addEventListener('mouseenter', function () {
            currentFocus = index;
            el.focus();
        });

        el.addEventListener('click', function () {
            handleClick(el);
        });
    });

    // Set initial focus on back button
    var backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.focus();
        currentZone = 'header';
    }

    // Setup retry button
    var retryBtn = document.getElementById('retryAppsBtn');
    if (retryBtn) {
        retryBtn.addEventListener('click', function() {
            hideError();
            loadOTTApps();
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
            console.log("Not running on Tizen or key registration failed");
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
            console.log('[OTT Navigation] Zone: Header');
        });
    });

    // App cards - use event delegation since cards are loaded dynamically
    document.addEventListener('focus', function(e) {
        if (e.target.classList.contains('app-card')) {
            currentZone = 'apps';
            console.log('[OTT Navigation] Zone: Apps');
        }
    }, true);
}

// Keyboard navigation
document.addEventListener('keydown', function (e) {
    console.log("Key pressed - Code:", e.keyCode, "Key:", e.key, "Zone:", currentZone);

    switch (e.keyCode) {
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
            window.location.href = 'home.html';
            break;
    }
});

// Handle DOWN navigation
function handleDownNavigation() {
    console.log('[DOWN] Current zone:', currentZone);

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
    console.log('[UP] Current zone:', currentZone);

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
    console.log('[LEFT] Current zone:', currentZone);

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
    console.log('[RIGHT] Current zone:', currentZone);

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
            behavior: 'smooth',
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

    console.log("Click handler called for:", element.className);

    // Check for data-route attribute first (highest priority for navigation)
    var route = element.getAttribute('data-route');
    if (route) {
        console.log("Navigating to route:", route);
        window.location.href = route;
        return;
    }

    // Back button clicked
    if (element.classList.contains('back-btn')) {
        console.log("Back button clicked - navigating to home");
        window.location.href = 'home.html';
        return;
    }

    // App card clicked
    if (element.classList.contains('app-card')) {
        var appName = element.getAttribute('data-app-name');
        var pkgId = element.getAttribute('data-pkg-id');
        console.log("[OTT Apps] Opening app:", appName, "Package:", pkgId);

        // Try to launch app on Tizen
        try {
            if (pkgId && typeof tizen !== 'undefined') {
                tizen.application.launch(pkgId);
            } else {
                alert("Opening " + appName);
            }
        } catch (e) {
            console.error("Failed to launch app:", e);
            alert("Opening " + appName);
        }
        return;
    }

    // Search input focused
    if (element.classList.contains('search-input')) {
        console.log("Search input focused");
        return;
    }
}

/**
 * Load OTT Apps from API
 */
function loadOTTApps() {
    console.log("[OTT Apps] Loading apps from API...");

    BBNL_API.getAllowedApps()
        .then(function (response) {
            console.log("[OTT Apps] API Response:", response);

            // Check if response is successful
            if (response && response.status && response.status.err_code === 0) {
                // Extract apps array from response
                if (response.apps && response.apps.length > 0) {
                    console.log("[OTT Apps] Found " + response.apps.length + " apps");
                    renderApps(response.apps);
                } else {
                    console.warn("[OTT Apps] No apps found in response");
                    showError("No OTT apps available");
                }
            } else {
                var errorMsg = response && response.status ? response.status.err_msg : "Unknown error";
                console.error("[OTT Apps] API Error:", errorMsg);
                showError(errorMsg);
            }
        })
        .catch(function (error) {
            console.error("[OTT Apps] Failed to load apps:", error);
            showError("Failed to load OTT apps");
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

        // Check if app has icon URL
        if (app.icon) {
            var img = document.createElement("img");
            img.src = app.icon;
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

    console.log("[OTT Apps] Rendered " + apps.length + " apps successfully");
}

/**
 * Show error popup
 */
function showError(message) {
    var popup = document.getElementById("noAppsPopup");
    var appsGrid = document.getElementById("appsGrid");

    if (popup) {
        popup.style.display = "flex";
        var msgEl = popup.querySelector(".error-popup-message");
        if (msgEl) {
            msgEl.innerText = message;
        }
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
    console.log("[OTT Apps] Found focusable elements:", focusables.length);

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
// DARK MODE FUNCTIONALITY
// ==========================================

/**
 * Initialize dark mode from localStorage
 */
function initDarkMode() {
    console.log("[OTT Apps] Initializing dark mode...");
    var isDarkMode = localStorage.getItem('darkMode') !== 'false'; // Default to dark mode

    if (isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }

    console.log("[OTT Apps] Dark mode:", isDarkMode ? "ON" : "OFF");
}
