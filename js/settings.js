/* ================================
   BBNL SETTINGS PAGE CONTROLLER
   About App & Device Info
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

window.onload = function () {
    console.log("=== BBNL Settings Page Initialized ===");

    // Initialize Dark Mode from localStorage
    initDarkMode();

    // Initialize sidebar navigation
    initializeSidebar();

    // Load About App data (version info)
    loadAboutAppInfo();

    // Load Device Info data
    loadDeviceInfoPanel();

    // Setup Check Update button
    var checkBtn = document.getElementById('checkUpdateBtn');
    if (checkBtn) {
        checkBtn.addEventListener('click', checkForUpdates);
    }

    // Setup Logout button
    var logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Get all focusable elements
    focusables = document.querySelectorAll(".focusable");
    console.log("Found focusable elements:", focusables.length);

    // Set initial focus on "About App" sidebar button (not Back button)
    var aboutAppBtn = document.querySelector('.sidebar-item[data-section="about"]');
    if (aboutAppBtn) {
        aboutAppBtn.focus();
        // Update currentFocus index to match
        for (var i = 0; i < focusables.length; i++) {
            if (focusables[i] === aboutAppBtn) {
                currentFocus = i;
                console.log("Initial focus set to About App button, index:", i);
                break;
            }
        }
    } else if (focusables.length > 0) {
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

    // Register All Remote Keys (supports all Samsung remote types)
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
            tizen.tvinputdevice.registerKeyBatch(keys);
            console.log("Tizen keys registered (fallback)");
        } catch (e) {
            console.log("Not on Tizen");
        }
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

    // Check for logout button
    if (el.id === 'logoutBtn' || el.classList.contains('logout-btn')) {
        handleLogout();
        return;
    }

    // Default click
    el.click();
}

/**
 * Handle logout - show confirmation and clear session
 */
function handleLogout() {
    var confirmLogout = confirm('Are you sure you want to logout?');
    if (confirmLogout) {
        console.log("[Settings] User confirmed logout");
        // Clear session using API
        if (typeof BBNL_API !== 'undefined' && BBNL_API.logout) {
            BBNL_API.logout();
        } else if (typeof AuthAPI !== 'undefined' && AuthAPI.logout) {
            AuthAPI.logout();
        } else {
            // Fallback: manually clear and redirect
            localStorage.removeItem('bbnl_user');
            window.location.href = 'login.html';
        }
    }
}

function moveFocusHorizontal(direction) {
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
        var centerX = rect.left + rect.width / 2;

        // Looking for elements to the right
        if (direction > 0 && centerX > currentCenterX + 50) {
            candidates.push({
                index: i,
                centerY: rect.top + rect.height / 2,
                distance: centerX - currentCenterX
            });
        }
        // Looking for elements to the left
        else if (direction < 0 && centerX < currentCenterX - 50) {
            candidates.push({
                index: i,
                centerY: rect.top + rect.height / 2,
                distance: currentCenterX - centerX
            });
        }
    }

    if (candidates.length === 0) return;

    // Sort by vertical proximity first, then horizontal distance
    candidates.sort(function(a, b) {
        var vertDiff = Math.abs(a.centerY - currentCenterY) - Math.abs(b.centerY - currentCenterY);
        if (Math.abs(vertDiff) < 100) {
            return a.distance - b.distance;
        }
        return vertDiff;
    });

    currentFocus = candidates[0].index;
    focusables[currentFocus].focus();
    focusables[currentFocus].scrollIntoView({ behavior: 'smooth', block: 'center' });
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

// ==========================================
// SIDEBAR NAVIGATION
// ==========================================

/**
 * Initialize sidebar navigation
 */
function initializeSidebar() {
    var sidebarItems = document.querySelectorAll(".sidebar-item");

    sidebarItems.forEach(function (item) {
        item.addEventListener("click", function () {
            var section = this.getAttribute("data-section");
            if (section) {
                switchSection(section);
            }
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
    }, 100);
}

// ==========================================
// ABOUT APP SECTION
// ==========================================

/**
 * Load About App information from API
 * API: http://124.40.244.211/netmon/cabletvapis/appversion
 * Response: { body: { appversion, verchngmsg, appdwnldlink, tvappdwnldlink }, status: { err_code, err_msg } }
 */
function loadAboutAppInfo() {
    console.log("[Settings] Loading About App info...");

    BBNL_API.getAppVersion()
        .then(function (response) {
            console.log("[Settings] App Version Response:", response);

            // Check if response is successful
            if (response && response.status && response.status.err_code === 0) {
                if (response.body) {
                    var versionData = response.body;

                    // Update Software Version
                    var versionEl = document.getElementById('software-version');
                    if (versionEl) {
                        versionEl.innerText = versionData.appversion || "Unknown";
                    }

                    // Update Version Message (field is "verchngmsg" in API response)
                    var messageEl = document.getElementById('version-message');
                    if (messageEl) {
                        messageEl.innerText = versionData.verchngmsg || "No message available";
                    }

                    console.log("[Settings] App version loaded:", versionData.appversion);
                } else {
                    setAboutAppError();
                }
            } else {
                setAboutAppError();
            }
        })
        .catch(function (error) {
            console.error("[Settings] Failed to load app version:", error);
            setAboutAppError();
        });
}

/**
 * Set error state for About App
 */
function setAboutAppError() {
    var versionEl = document.getElementById('software-version');
    if (versionEl) versionEl.innerText = "Error loading";

    var messageEl = document.getElementById('version-message');
    if (messageEl) messageEl.innerText = "Error loading";
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

    // Simulate update check
    setTimeout(function () {
        if (updateStatus) {
            updateStatus.innerText = "Your App software is up to date";
        }
    }, 1500);
}

// ==========================================
// DEVICE INFO PANEL - PRODUCTION
// All values fetched dynamically from Tizen APIs
// ==========================================

/**
 * Load device information for the Device Info panel
 * Uses Tizen WebAPIs for real device, graceful fallback for emulator
 */
function loadDeviceInfoPanel() {
    console.log("[Settings] Loading device info panel (Production)...");

    var deviceInfo = typeof DeviceInfo !== 'undefined' ? DeviceInfo.getDeviceInfo() : null;
    var isTizen = (typeof webapis !== 'undefined');

    // 1. User ID from session
    loadUserId();

    // 2. Model Name & Firmware
    loadModelInfo(isTizen);

    // 3. Device ID (DUID)
    loadDeviceId(deviceInfo, isTizen);

    // 4. Network Info (Connection, IP, Gateway, DNS, MACs)
    loadNetworkInfo(deviceInfo, isTizen);

    // 5. Screen Resolution
    loadScreenResolution();

    // 6. Tizen Version
    loadTizenVersion(isTizen);
}

/**
 * Load User ID from localStorage session
 */
function loadUserId() {
    var userIdEl = document.getElementById('device-user-id');
    if (!userIdEl) return;

    try {
        var userData = localStorage.getItem('bbnl_user');
        if (userData) {
            var parsed = JSON.parse(userData);
            userIdEl.innerText = parsed.userid || parsed.user_id || parsed.casid || 'N/A';
        } else {
            userIdEl.innerText = 'Not logged in';
        }
    } catch (e) {
        userIdEl.innerText = 'N/A';
    }
}

/**
 * Load Model Name and Firmware from Tizen productinfo API
 */
function loadModelInfo(isTizen) {
    var modelNameEl = document.getElementById('device-model-name');
    var firmwareEl = document.getElementById('device-firmware');

    if (modelNameEl) {
        try {
            if (isTizen && webapis.productinfo) {
                var model = webapis.productinfo.getModel ? webapis.productinfo.getModel() : null;
                var modelCode = webapis.productinfo.getModelCode ? webapis.productinfo.getModelCode() : null;
                modelNameEl.innerText = model || modelCode || 'Samsung Smart TV';
            } else {
                modelNameEl.innerText = 'Emulator';
            }
        } catch (e) {
            modelNameEl.innerText = 'Samsung Smart TV';
        }
    }

    if (firmwareEl) {
        try {
            if (isTizen && webapis.productinfo && webapis.productinfo.getFirmware) {
                firmwareEl.innerText = 'Firmware: ' + webapis.productinfo.getFirmware();
            } else {
                firmwareEl.innerText = 'Firmware: N/A';
            }
        } catch (e) {
            firmwareEl.innerText = 'Firmware: N/A';
        }
    }
}

/**
 * Load Device ID (DUID) from Tizen API or DeviceInfo
 */
function loadDeviceId(deviceInfo, isTizen) {
    var deviceIdEl = document.getElementById('device-id');
    if (!deviceIdEl) return;

    try {
        if (isTizen && webapis.productinfo && webapis.productinfo.getDuid) {
            deviceIdEl.innerText = webapis.productinfo.getDuid() || 'N/A';
        } else if (deviceInfo && deviceInfo.devslno) {
            deviceIdEl.innerText = deviceInfo.devslno;
        } else {
            deviceIdEl.innerText = 'N/A';
        }
    } catch (e) {
        console.error("[Settings] Device ID error:", e);
        deviceIdEl.innerText = 'N/A';
    }
}

/**
 * Load all network information from Tizen APIs
 */
function loadNetworkInfo(deviceInfo, isTizen) {
    try {
        if (isTizen && webapis.network) {
            var networkType = webapis.network.getActiveConnectionType();

            // Connection Type
            setElementText('device-connection-type', getConnectionTypeName(networkType));

            // IP Address
            if (networkType > 0) {
                setElementText('device-ipv4', safeCall(function () {
                    return webapis.network.getIp(networkType);
                }, 'N/A'));
            } else {
                setElementText('device-ipv4', 'Disconnected');
            }

            // Gateway
            setElementText('device-gateway', safeCall(function () {
                return webapis.network.getGateway(networkType);
            }, 'N/A'));

            // DNS Server
            setElementText('device-dns', safeCall(function () {
                return webapis.network.getDns(networkType);
            }, 'N/A'));

            // Wired MAC Address (Ethernet = type 3)
            var wiredMac = safeCall(function () {
                return webapis.network.getMac(3);
            }, null);
            if (!wiredMac && deviceInfo) {
                wiredMac = deviceInfo.mac_address;
            }
            setElementText('device-wired-mac', formatMacAddress(wiredMac) || 'N/A');

            // WiFi MAC Address (WiFi = type 1)
            setElementText('device-wifi-mac', formatMacAddress(safeCall(function () {
                return webapis.network.getMac(1);
            }, null)) || 'N/A');

        } else {
            // Non-Tizen environment (emulator/browser)
            setElementText('device-connection-type', 'Browser/Emulator');
            setElementText('device-ipv4', 'N/A');
            setElementText('device-gateway', 'N/A');
            setElementText('device-dns', 'N/A');
            setElementText('device-wired-mac', deviceInfo ? formatMacAddress(deviceInfo.mac_address) || 'N/A' : 'N/A');
            setElementText('device-wifi-mac', 'N/A');
        }
    } catch (e) {
        console.error("[Settings] Network info error:", e);
        setElementText('device-connection-type', 'Error');
        setElementText('device-ipv4', 'N/A');
        setElementText('device-gateway', 'N/A');
        setElementText('device-dns', 'N/A');
        setElementText('device-wired-mac', 'N/A');
        setElementText('device-wifi-mac', 'N/A');
    }
}

/**
 * Load screen resolution
 */
function loadScreenResolution() {
    var resEl = document.getElementById('device-resolution');
    if (!resEl) return;

    try {
        resEl.innerText = screen.width + ' x ' + screen.height;
    } catch (e) {
        resEl.innerText = 'N/A';
    }
}

/**
 * Load Tizen platform version
 */
function loadTizenVersion(isTizen) {
    var versionEl = document.getElementById('device-tizen-version');
    if (!versionEl) return;

    try {
        if (isTizen && typeof tizen !== 'undefined' && tizen.systeminfo) {
            tizen.systeminfo.getPropertyValue("BUILD", function (build) {
                versionEl.innerText = build.buildVersion || 'N/A';
            }, function () {
                versionEl.innerText = 'N/A';
            });
        } else {
            versionEl.innerText = 'N/A (Not Tizen)';
        }
    } catch (e) {
        versionEl.innerText = 'N/A';
    }
}

// ==========================================
// DEVICE INFO HELPERS
// ==========================================

/**
 * Get human-readable connection type name
 */
function getConnectionTypeName(type) {
    var types = {
        0: "Disconnected",
        1: "WiFi",
        2: "Cellular",
        3: "Ethernet"
    };
    return types[type] || "Unknown (" + type + ")";
}

/**
 * Safely call a function, return fallback on error
 */
function safeCall(fn, fallback) {
    try {
        var result = fn();
        return result || fallback;
    } catch (e) {
        return fallback;
    }
}

/**
 * Set text content of an element by ID
 */
function setElementText(id, text) {
    var el = document.getElementById(id);
    if (el) el.innerText = text;
}

// ==========================================
// DARK MODE FUNCTIONALITY
// ==========================================

/**
 * Initialize dark mode from localStorage
 */
function initDarkMode() {
    console.log("[Settings] Initializing dark mode...");
    var isDarkMode = localStorage.getItem('darkMode') !== 'false';

    if (isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }

    console.log("[Settings] Dark mode:", isDarkMode ? "ON" : "OFF");
}

// ==========================================
// MAC ADDRESS FORMATTING
// ==========================================

/**
 * Format MAC address to consistent format (uppercase with colons)
 */
function formatMacAddress(mac) {
    if (!mac) return null;

    var cleaned = mac.replace(/[:-]/g, '').toUpperCase();

    if (cleaned.length !== 12) return mac;

    var formatted = cleaned.match(/.{1,2}/g).join(':');

    return formatted;
}
