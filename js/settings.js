/* ================================
   BBNL SETTINGS PAGE CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;

window.onload = function () {
    console.log("=== BBNL Settings Page Initialized ===");

    // Initialize Dark Mode from localStorage
    initDarkMode();

    // Initialize sidebar navigation
    initializeSidebar();

    // Load API data for About App section
    loadAppInfo();

    // Get all focusable elements
    focusables = document.querySelectorAll(".focusable");
    console.log("Found focusable elements:", focusables.length);

    if (focusables.length > 0) {
        currentFocus = 0;
        focusables[0].focus();
    }

    // Add mouse support
    focusables.forEach(function (el, index) {
        el.addEventListener("mouseenter", function () {
            currentFocus = index;
            el.focus();
        });
    });

    // Register Tizen keys
    try {
        var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
        tizen.tvinputdevice.registerKeyBatch(keys);
        console.log("Tizen keys registered");
    } catch (e) {
        console.log("Not on Tizen");
    }
};

// Keyboard navigation
document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    e.preventDefault();

    console.log("Settings Key pressed:", code);

    if (code === 10009) { // Back
        window.location.href = 'home.html';
        return;
    }

    switch(code) {
        case 37: // Left
            moveFocusHorizontal(-1);
            break;
        case 39: // Right
            moveFocusHorizontal(1);
            break;
        case 38: // UP
            moveFocusVertical(-1);
            break;
        case 40: // DOWN
            moveFocusVertical(1);
            break;
        case 13: // Enter
            handleEnter();
            break;
    }
});

function handleEnter() {
    var el = focusables[currentFocus];
    if (!el) return;

    // Check for data-route
    var route = el.getAttribute('data-route');
    if (route) {
        window.location.href = route;
        return;
    }

    // Check for back button
    if (el.classList.contains('back-btn')) {
        window.location.href = 'home.html';
        return;
    }

    // Default click
    el.click();
}

function moveFocusHorizontal(step) {
    if (focusables.length === 0) return;
    var next = currentFocus + step;
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

function moveFocus(step) {
    moveFocusVertical(step > 0 ? 1 : -1);
}

/**
 * Initialize sidebar navigation
 */
function initializeSidebar() {
    var sidebarItems = document.querySelectorAll(".sidebar-item");

    sidebarItems.forEach(function (item) {
        item.addEventListener("click", function () {
            var section = this.getAttribute("data-section");
            switchSection(section);
        });
    });
}

/**
 * Switch between settings sections
 */
function switchSection(section) {
    console.log("[Settings] Switching to section:", section);

    // Update sidebar active state
    var sidebarItems = document.querySelectorAll(".sidebar-item");
    sidebarItems.forEach(function (item) {
        item.classList.remove("active");
        if (item.getAttribute("data-section") === section) {
            item.classList.add("active");
        }
    });

    // Update content panels
    var panels = document.querySelectorAll(".content-panel");
    panels.forEach(function (panel) {
        panel.classList.remove("active");
    });

    var targetPanel = document.getElementById("panel-" + section);
    if (targetPanel) {
        targetPanel.classList.add("active");
    }

    // Refresh focusables after switching
    setTimeout(function () {
        focusables = document.querySelectorAll(".focusable");
        // Focus first item in sidebar after switch
        var activeSidebar = document.querySelector(".sidebar-item.active");
        if (activeSidebar) {
            var index = Array.from(focusables).indexOf(activeSidebar);
            if (index >= 0) {
                currentFocus = index;
                focusables[currentFocus].focus();
            }
        }
    }, 100);
}

/**
 * Load app information from APIs
 */
function loadAppInfo() {
    console.log("[Settings] Loading app information...");

    // Load App Version
    loadAppVersion();

    // Load Device Info
    loadDeviceInfo();
}

/**
 * Load app version from API
 */
function loadAppVersion() {
    console.log("[Settings] Loading app version...");

    BBNL_API.getAppVersion()
        .then(function (response) {
            console.log("[Settings] App Version Response:", response);

            // Check if response is successful
            if (response && response.status && response.status.err_code === 0) {
                // Extract version data from response.body (it's an OBJECT, not an array!)
                if (response.body) {
                    var versionData = response.body;

                    // Update software version
                    var versionElement = document.getElementById('software-version');
                    if (versionElement) {
                        var version = versionData.appversion || "Unknown";
                        versionElement.innerText = "v" + version + " - Release";
                    }

                    console.log("[Settings] App version loaded successfully:", versionData.appversion);
                } else {
                    console.warn("[Settings] No version data in response body");
                    setVersionError();
                }
            } else {
                var errorMsg = response && response.status ? response.status.err_msg : "Unknown error";
                console.error("[Settings] API Error:", errorMsg);
                setVersionError();
            }
        })
        .catch(function (error) {
            console.error("[Settings] Failed to load app version:", error);
            setVersionError();
        });
}

/**
 * Set version error message
 */
function setVersionError() {
    var versionElement = document.getElementById('software-version');
    if (versionElement) {
        versionElement.innerText = "Error loading version";
    }
}

/**
 * Load device information
 */
function loadDeviceInfo() {
    console.log("[Settings] Loading device info...");

    try {
        // Use DeviceInfo from api.js
        var deviceInfo = typeof DeviceInfo !== 'undefined' ? DeviceInfo.getDeviceInfo() : null;

        if (!deviceInfo) {
            console.warn("[Settings] DeviceInfo not available");
            setDeviceInfoError();
            return;
        }

        console.log("[Settings] Device Info:", deviceInfo);

        // Update Serial Number
        var serialElement = document.getElementById('serial-number');
        var serial = deviceInfo.devslno || deviceInfo.serial || "FOFI20191129000336";
        if (serialElement) {
            serialElement.innerText = serial;
        }

        // Update IP Address - Use same method as login page
        var ipElement = document.getElementById('ip-address');
        var ip = getActualIPAddress();
        if (ipElement) {
            ipElement.innerText = ip;
        }

        // Update MAC Address
        var macElement = document.getElementById('mac-address');
        var mac = deviceInfo.mac_address || deviceInfo.macaddress || "26:F2:AE:D8:3F:99";
        if (macElement) {
            macElement.innerText = mac;
        }

        console.log("[Settings] Device info loaded successfully");
    } catch (error) {
        console.error("[Settings] Failed to load device info:", error);
        setDeviceInfoError();
    }
}

/**
 * Get actual IP address from device (same method as login page)
 */
function getActualIPAddress() {
    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            var networkType = webapis.network.getActiveConnectionType();
            console.log("[Settings] Network Type:", networkType);

            if (networkType === 0) {
                return "Disconnected";
            }

            var ip = webapis.network.getIp(networkType);
            if (ip) {
                console.log("[Settings] Device IP:", ip);
                return ip;
            } else {
                return "Not Available";
            }
        } else {
            // Fallback for Emulator/Browser
            return "Web/Emulator";
        }
    } catch (e) {
        console.error("[Settings] IP Fetch Error:", e);
        return "Error: " + e.name;
    }
}

/**
 * Set device info error message
 */
function setDeviceInfoError() {
    var serialElement = document.getElementById('serial-number');
    if (serialElement) serialElement.innerText = "Error";

    var ipElement = document.getElementById('ip-address');
    if (ipElement) ipElement.innerText = "Error";

    var macElement = document.getElementById('mac-address');
    if (macElement) macElement.innerText = "Error";
}

/**
 * Check for software updates
 */
function checkForUpdates() {
    console.log("[Settings] Checking for updates...");

    var updateStatus = document.getElementById('update-status');
    if (updateStatus) {
        updateStatus.innerText = "Checking for updates...";
    }

    // Simulate update check (you can integrate with actual API)
    setTimeout(function () {
        if (updateStatus) {
            updateStatus.innerText = "Your App software is up to date";
        }
        alert("Your app is up to date!");
    }, 1500);
}

// ==========================================
// DARK MODE FUNCTIONALITY
// ==========================================

/**
 * Initialize dark mode from localStorage
 */
function initDarkMode() {
    console.log("[Settings] Initializing dark mode...");
    var isDarkMode = localStorage.getItem('darkMode') !== 'false'; // Default to dark mode

    if (isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }

    console.log("[Settings] Dark mode:", isDarkMode ? "ON" : "OFF");
}
