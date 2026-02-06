/* ================================
   BBNL SETTINGS PAGE CONTROLLER
   About App & Device Info
   ================================ */

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

    // Default click
    el.click();
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
// DEVICE INFO PANEL
// ==========================================

/**
 * Load device information for the Device Info panel
 */
function loadDeviceInfoPanel() {
    console.log("[Settings] Loading device info panel...");

    try {
        // Get device info from DeviceInfo utility (api.js)
        var deviceInfo = typeof DeviceInfo !== 'undefined' ? DeviceInfo.getDeviceInfo() : null;

        // Update Model Name
        var modelNameEl = document.getElementById('device-model-name');
        if (modelNameEl) {
            try {
                if (typeof webapis !== 'undefined' && webapis.productinfo) {
                    modelNameEl.innerText = webapis.productinfo.getModelCode() || "Samsung Tizen";
                } else {
                    modelNameEl.innerText = "Samsung Tizen";
                }
            } catch (e) {
                modelNameEl.innerText = "Samsung Tizen";
            }
        }

        // Load Network Information (IPv4, IPv6, Connection Type, MACs)
        loadNetworkInfo(deviceInfo);

        // Load Device ID
        loadDeviceId(deviceInfo);

    } catch (error) {
        console.error("[Settings] Error loading device info panel:", error);
    }
}

/**
 * Load network information
 */
function loadNetworkInfo(deviceInfo) {
    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            var networkType = webapis.network.getActiveConnectionType();

            // Connection Type
            var connTypeEl = document.getElementById('device-connection-type');
            if (connTypeEl) {
                var types = {
                    0: "Disconnected",
                    1: "WiFi",
                    2: "Cellular",
                    3: "Ethernet"
                };
                connTypeEl.innerText = types[networkType] || "Unknown";
            }

            // Public IPv4 Address
            var ipv4El = document.getElementById('device-ipv4');
            if (ipv4El) {
                if (networkType > 0) {
                    var ipv4 = webapis.network.getIp(networkType);
                    ipv4El.innerText = ipv4 || "Not Available";
                } else {
                    ipv4El.innerText = "Disconnected";
                }
            }

            // Public IPv6 Address
            var ipv6El = document.getElementById('device-ipv6');
            if (ipv6El) {
                try {
                    if (networkType > 0 && webapis.network.getIpv6) {
                        var ipv6 = webapis.network.getIpv6(networkType);
                        ipv6El.innerText = ipv6 || "Not Available";
                    } else {
                        ipv6El.innerText = "Not Available";
                    }
                } catch (e) {
                    ipv6El.innerText = "Not Available";
                }
            }

            // Wired MAC Address (Ethernet)
            var wiredMacEl = document.getElementById('device-wired-mac');
            if (wiredMacEl) {
                try {
                    var wiredMac = webapis.network.getMac ? webapis.network.getMac(3) : null;
                    if (!wiredMac && deviceInfo) {
                        wiredMac = deviceInfo.mac_address || deviceInfo.macaddress;
                    }
                    wiredMacEl.innerText = formatMacAddress(wiredMac) || "Not Available";
                } catch (e) {
                    wiredMacEl.innerText = "Not Available";
                }
            }

            // WiFi MAC Address
            var wifiMacEl = document.getElementById('device-wifi-mac');
            if (wifiMacEl) {
                try {
                    var wifiMac = webapis.network.getMac ? webapis.network.getMac(1) : null;
                    wifiMacEl.innerText = formatMacAddress(wifiMac) || "Not Available";
                } catch (e) {
                    wifiMacEl.innerText = "Not Available";
                }
            }

        } else {
            setEmulatorNetworkInfo();
        }
    } catch (e) {
        console.error("[Settings] Network info error:", e);
        setEmulatorNetworkInfo();
    }
}

/**
 * Load Device ID
 */
function loadDeviceId(deviceInfo) {
    var deviceIdEl = document.getElementById('device-id');
    if (deviceIdEl) {
        try {
            if (typeof webapis !== 'undefined' && webapis.productinfo && webapis.productinfo.getDuid) {
                var duid = webapis.productinfo.getDuid();
                deviceIdEl.innerText = duid || "Not Available";
            } else if (deviceInfo && deviceInfo.devslno) {
                deviceIdEl.innerText = deviceInfo.devslno;
            } else if (deviceInfo && deviceInfo.serial) {
                deviceIdEl.innerText = deviceInfo.serial;
            } else {
                deviceIdEl.innerText = "Not Available";
            }
        } catch (e) {
            console.error("[Settings] Device ID error:", e);
            deviceIdEl.innerText = "Not Available";
        }
    }
}

/**
 * Set fallback network info for emulator
 */
function setEmulatorNetworkInfo() {
    var connTypeEl = document.getElementById('device-connection-type');
    if (connTypeEl) connTypeEl.innerText = "Web/Emulator";

    var ipv4El = document.getElementById('device-ipv4');
    if (ipv4El) ipv4El.innerText = "127.0.0.1";

    var ipv6El = document.getElementById('device-ipv6');
    if (ipv6El) ipv6El.innerText = "::1";

    var deviceIdEl = document.getElementById('device-id');
    if (deviceIdEl) deviceIdEl.innerText = "EMULATOR-001";

    var wiredMacEl = document.getElementById('device-wired-mac');
    if (wiredMacEl) wiredMacEl.innerText = "00:00:00:00:00:00";

    var wifiMacEl = document.getElementById('device-wifi-mac');
    if (wifiMacEl) wifiMacEl.innerText = "00:00:00:00:00:00";
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
