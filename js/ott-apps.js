/* ================================
   BBNL IPTV - OTT APPS CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;

window.onload = function () {
    console.log("=== BBNL OTT Apps Page Initialized ===");

    // Initialize Dark Mode from localStorage
    initDarkMode();

    // Load OTT Apps from API
    loadOTTApps();

    // Register Tizen Keys
    try {
        var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
        tizen.tvinputdevice.registerKeyBatch(keys);
    } catch (e) {
        console.log("Not running on Tizen or key registration failed");
    }
};

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
 * Show error message
 */
function showError(message) {
    var appsGrid = document.getElementById("appsGrid");
    appsGrid.innerHTML = '<div class="error-message" style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ff6b6b; font-size: 18px;">' + message + '</div>';
}

/**
 * Initialize focusable elements
 */
function initializeFocusables() {
    // Select all focusables
    focusables = document.querySelectorAll(".focusable");
    console.log("[OTT Apps] Found focusable elements:", focusables.length);

    // Set initial focus
    if (focusables.length > 0) {
        currentFocus = 0;
        focusables[0].focus();
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
}

document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    e.preventDefault();

    console.log("Key pressed:", code);

    // Tizen Back Key
    if (code === 10009) {
        window.location.href = 'home.html';
        return;
    }

    // Directional Navigation
    switch(code) {
        case 37: // Left
            moveFocusHorizontal(-1);
            break;
        case 39: // Right
            moveFocusHorizontal(1);
            break;
        case 38: // Up
            moveFocusVertical(-1);
            break;
        case 40: // Down
            moveFocusVertical(1);
            break;
        case 13: // Enter
            handleEnter();
            break;
    }
});

function moveFocusHorizontal(direction) {
    if (focusables.length === 0) return;

    var next = currentFocus + direction;

    if (next < 0) next = 0;
    if (next >= focusables.length) next = focusables.length - 1;

    if (next !== currentFocus) {
        currentFocus = next;
        focusables[currentFocus].focus();
        focusables[currentFocus].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function moveFocusVertical(direction) {
    if (focusables.length === 0) return;

    var current = focusables[currentFocus];
    var currentRect = current.getBoundingClientRect();
    var currentCenterX = currentRect.left + currentRect.width / 2;
    var currentCenterY = currentRect.top + currentRect.height / 2;

    var candidates = [];

    for (var i = 0; i < focusables.length; i++) {
        if (i === currentFocus) continue;

        var el = focusables[i];
        var rect = el.getBoundingClientRect();
        var centerY = rect.top + rect.height / 2;

        if (direction < 0 && centerY < currentCenterY - 20) {
            candidates.push({
                index: i,
                centerX: rect.left + rect.width / 2,
                distance: currentCenterY - centerY
            });
        } else if (direction > 0 && centerY > currentCenterY + 20) {
            candidates.push({
                index: i,
                centerX: rect.left + rect.width / 2,
                distance: centerY - currentCenterY
            });
        }
    }

    if (candidates.length === 0) return;

    candidates.sort(function(a, b) {
        var rowDiff = Math.abs(a.distance - b.distance);
        if (rowDiff < 50) {
            return Math.abs(a.centerX - currentCenterX) - Math.abs(b.centerX - currentCenterX);
        }
        return a.distance - b.distance;
    });

    currentFocus = candidates[0].index;
    focusables[currentFocus].focus();
    focusables[currentFocus].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Keep old moveFocus for compatibility
function moveFocus(step) {
    moveFocusHorizontal(step);
}

function handleEnter() {
    var active = document.activeElement;
    console.log("Enter pressed on:", active);

    // Check for data-route (back button, etc)
    var route = active.getAttribute('data-route');
    if (route) {
        window.location.href = route;
        return;
    }

    // Back button
    if (active.classList.contains('back-btn')) {
        window.location.href = 'home.html';
        return;
    }

    if (active.classList.contains('app-card')) {
        var appName = active.getAttribute('data-app-name') || 'App';
        var pkgId = active.getAttribute('data-pkg-id');
        console.log("Opening App:", appName, pkgId);

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
    }
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
