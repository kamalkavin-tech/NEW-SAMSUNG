/* ================================
   BBNL SETTINGS PAGE CONTROLLER
   Zone-based Remote Navigation

   Flow:
   ┌──────────────────────────────────────────────┐
   │ [← Back]   (UP from sidebar/content)         │
   ├────────────┬─────────────────────────────────┤
   │ SIDEBAR    │  CONTENT (active panel)          │
   │ [About App]──RIGHT──► [Check Update btn]      │
   │ [Device]   │  ◄LEFT── content items           │
   │            │                                  │
   │ [Logout]   │                                  │
   └────────────┴─────────────────────────────────┘

   BACK BTN: DOWN/RIGHT = sidebar, ENTER = home
   SIDEBAR:  UP = back btn (from first), DOWN = next, RIGHT = content, LEFT = back btn
             ENTER on About/Device = switch + enter content
             ENTER on Logout = logout
   CONTENT:  UP/DOWN = navigate items, LEFT = back to sidebar
   BACK KEY: always go to home.html
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

// Navigation state
var settingsNav = {
    zone: 'sidebar',           // 'sidebar' or 'content'
    sidebarIndex: 0,           // Current sidebar item index
    contentIndex: 0            // Current content focusable index
};

// ==========================================
// INITIALIZATION
// ==========================================

window.onload = function () {
    console.log("=== BBNL Settings Page Initialized ===");

    // Initialize Dark Mode
    initDarkMode();

    // Initialize sidebar click handlers
    initializeSidebar();

    // Load data
    loadAboutAppInfo();
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

    // Set initial focus on "About App" sidebar item
    var sidebarItems = getSidebarItems();
    if (sidebarItems.length > 0) {
        sidebarItems[0].focus();
        settingsNav.zone = 'sidebar';
        settingsNav.sidebarIndex = 0;
        console.log("[NAV] Initial focus: About App");
    }

    // Register remote keys
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
            tizen.tvinputdevice.registerKeyBatch(keys);
        } catch (e) {
            console.log("Not on Tizen");
        }
    }
};

// ==========================================
// HELPERS - Get elements
// ==========================================

function getSidebarItems() {
    return Array.from(document.querySelectorAll('.sidebar-item'));
}

function getContentFocusables() {
    // Get focusable elements ONLY inside the active content panel
    var activePanel = document.querySelector('.content-panel.active');
    if (!activePanel) return [];
    return Array.from(activePanel.querySelectorAll('.focusable'));
}

// Focus sidebar item and update state
function focusSidebarItem(index) {
    var items = getSidebarItems();
    if (index < 0) index = 0;
    if (index >= items.length) index = items.length - 1;
    if (items[index]) {
        items[index].focus();
        settingsNav.zone = 'sidebar';
        settingsNav.sidebarIndex = index;

        // Auto-switch panel when navigating sidebar (only for section items)
        var section = items[index].getAttribute('data-section');
        if (section) {
            switchSection(section);
        }

        console.log('[NAV] Sidebar focused:', index);
        return true;
    }
    return false;
}

// Focus content item and update state
function focusContentItem(index) {
    var items = getContentFocusables();
    if (items.length === 0) return false;
    if (index < 0) index = 0;
    if (index >= items.length) index = items.length - 1;
    if (items[index]) {
        items[index].focus();
        settingsNav.zone = 'content';
        settingsNav.contentIndex = index;
        items[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
        console.log('[NAV] Content focused:', index);
        return true;
    }
    return false;
}

// Focus back button and update state
function focusBackButton() {
    var backBtn = document.querySelector('.settings-back-header .back-btn');
    if (backBtn) {
        backBtn.focus();
        settingsNav.zone = 'back';
        console.log('[NAV] Back button focused');
    }
}

// ==========================================
// KEY HANDLER
// ==========================================

document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    e.preventDefault();

    console.log("[Settings] Key:", code, "Zone:", settingsNav.zone);

    // BACK key - always go home
    if (code === 10009) {
        window.location.href = 'home.html';
        return;
    }

    switch (code) {
        case 38: // UP
            handleUp();
            break;
        case 40: // DOWN
            handleDown();
            break;
        case 37: // LEFT
            handleLeft();
            break;
        case 39: // RIGHT
            handleRight();
            break;
        case 13: // ENTER
            handleEnter();
            break;
    }
});

// ==========================================
// NAVIGATION - UP
// ==========================================

function handleUp() {
    if (settingsNav.zone === 'back') {
        // Already at back button, stay
        return;
    }
    if (settingsNav.zone === 'sidebar') {
        // UP in sidebar: previous item, or go to back button from first item
        if (settingsNav.sidebarIndex > 0) {
            focusSidebarItem(settingsNav.sidebarIndex - 1);
        } else {
            // At first sidebar item: go to back button
            focusBackButton();
        }
    }
    else if (settingsNav.zone === 'content') {
        // UP in content: previous focusable, or back to sidebar from first item
        if (settingsNav.contentIndex > 0) {
            focusContentItem(settingsNav.contentIndex - 1);
        } else {
            focusSidebarItem(settingsNav.sidebarIndex);
        }
    }
}

// ==========================================
// NAVIGATION - DOWN
// ==========================================

function handleDown() {
    if (settingsNav.zone === 'back') {
        // DOWN from back button: go to first sidebar item
        focusSidebarItem(0);
        return;
    }
    if (settingsNav.zone === 'sidebar') {
        // DOWN in sidebar: next item
        var items = getSidebarItems();
        if (settingsNav.sidebarIndex < items.length - 1) {
            focusSidebarItem(settingsNav.sidebarIndex + 1);
        }
    }
    else if (settingsNav.zone === 'content') {
        // DOWN in content: next focusable
        var contentItems = getContentFocusables();
        if (settingsNav.contentIndex < contentItems.length - 1) {
            focusContentItem(settingsNav.contentIndex + 1);
        }
    }
}

// ==========================================
// NAVIGATION - LEFT
// ==========================================

function handleLeft() {
    if (settingsNav.zone === 'back') {
        // Already at back button, do nothing
        return;
    }
    if (settingsNav.zone === 'sidebar') {
        // LEFT from sidebar: go to back button
        focusBackButton();
    }
    else if (settingsNav.zone === 'content') {
        // LEFT from content: go back to sidebar
        console.log('[LEFT] Content → Sidebar');
        focusSidebarItem(settingsNav.sidebarIndex);
    }
}

// ==========================================
// NAVIGATION - RIGHT
// ==========================================

function handleRight() {
    if (settingsNav.zone === 'back') {
        // RIGHT from back button: go to first sidebar item
        focusSidebarItem(0);
        return;
    }
    if (settingsNav.zone === 'sidebar') {
        // RIGHT from sidebar: enter content area
        var contentItems = getContentFocusables();
        if (contentItems.length > 0) {
            console.log('[RIGHT] Sidebar → Content');
            focusContentItem(0);
        } else {
            console.log('[RIGHT] No focusable content in this panel');
        }
    }
    else if (settingsNav.zone === 'content') {
        // Already in content, do nothing
        console.log('[RIGHT] Already in content');
    }
}

// ==========================================
// NAVIGATION - ENTER
// ==========================================

function handleEnter() {
    var active = document.activeElement;
    if (!active) return;

    console.log('[ENTER] Element:', active.className, active.id);

    // Back button
    if (active.classList.contains('back-btn')) {
        window.location.href = 'home.html';
        return;
    }

    // Logout button
    if (active.id === 'logoutBtn' || active.classList.contains('logout-btn')) {
        handleLogout();
        return;
    }

    // Sidebar item with data-section: switch section and enter content
    if (active.classList.contains('sidebar-item')) {
        var section = active.getAttribute('data-section');
        if (section) {
            switchSection(section);
            // After switching, enter the content area
            setTimeout(function () {
                var contentItems = getContentFocusables();
                if (contentItems.length > 0) {
                    focusContentItem(0);
                }
            }, 50);
        }
        return;
    }

    // Check for data-route
    var route = active.getAttribute('data-route');
    if (route) {
        window.location.href = route;
        return;
    }

    // Default: click the element
    active.click();
}

// ==========================================
// SIDEBAR SECTION SWITCHING
// ==========================================

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
}

// ==========================================
// LOGOUT
// ==========================================

async function handleLogout() {
    var confirmLogout = confirm('Are you sure you want to logout?');
    if (confirmLogout) {
        console.log("[Settings] User confirmed logout - clearing session data");

        // Clear session-related data but KEEP hasLoggedInOnce and MAC
        // This ensures app relaunch goes directly to Home, not Login
        var keysToKeep = ['hasLoggedInOnce', 'macAddress', 'deviceId'];
        var keysToRemove = [];
        
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (keysToKeep.indexOf(key) === -1) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(function(key) {
            localStorage.removeItem(key);
            console.log("[Settings] Removed localStorage key:", key);
        });
        
        console.log("[Settings] Kept localStorage keys:", keysToKeep);

        // Clear all sessionStorage
        sessionStorage.clear();

        // Call API logout if available
        if (typeof BBNL_API !== 'undefined' && BBNL_API.logout) {
            try {
                await BBNL_API.logout();
            } catch (e) {
                console.error("[Settings] API logout error:", e);
            }
        } else if (typeof AuthAPI !== 'undefined' && AuthAPI.logout) {
            try {
                await AuthAPI.logout();
            } catch (e) {
                console.error("[Settings] AuthAPI logout error:", e);
            }
        }

        console.log("[Settings] Logout complete - exiting application");

        // Exit the Tizen application completely (NOT redirect to login)
        try {
            if (typeof tizen !== 'undefined' && tizen.application) {
                console.log("[Settings] Exiting Tizen application");
                tizen.application.getCurrentApplication().exit();
            } else {
                // For browser testing - just close the window or show message
                console.log("[Settings] Not on Tizen - closing window");
                alert("Logout successful. App will close.");
                window.close();
            }
        } catch (e) {
            console.log("[Settings] Exit failed:", e);
            // Fallback: close window or just show message
            alert("Logout successful. Please close the app.");
        }
    }
}

// ==========================================
// ABOUT APP - Version Info
// ==========================================

function loadAboutAppInfo() {
    console.log("[Settings] Loading About App info...");

    BBNL_API.getAppVersion()
        .then(function (response) {
            console.log("[Settings] App Version Response:", response);

            if (response && response.status && response.status.err_code === 0) {
                if (response.body) {
                    var versionData = response.body;

                    var versionEl = document.getElementById('software-version');
                    if (versionEl) {
                        versionEl.innerText = versionData.appversion || "Unknown";
                    }

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

function setAboutAppError() {
    var versionEl = document.getElementById('software-version');
    if (versionEl) versionEl.innerText = "Error loading";

    var messageEl = document.getElementById('version-message');
    if (messageEl) messageEl.innerText = "Error loading";
}

function checkForUpdates() {
    console.log("[Settings] Checking for updates...");

    var updateStatus = document.getElementById('update-status');
    if (updateStatus) {
        updateStatus.innerText = "Checking for updates...";
    }

    setTimeout(function () {
        if (updateStatus) {
            updateStatus.innerText = "Your App software is up to date";
        }
    }, 1500);
}

// ==========================================
// DEVICE INFO PANEL
// ==========================================

function loadDeviceInfoPanel() {
    console.log("[Settings] Loading device info panel...");

    var deviceInfo = typeof DeviceInfo !== 'undefined' ? DeviceInfo.getDeviceInfo() : null;
    var isTizen = (typeof webapis !== 'undefined');

    loadUserId();
    loadModelInfo(isTizen);
    loadDeviceId(deviceInfo, isTizen);
    loadAppVersion();
    loadNetworkInfo(deviceInfo, isTizen);
    loadScreenResolution();
    loadTizenVersion(isTizen);
}

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
        deviceIdEl.innerText = 'N/A';
    }
}

function loadAppVersion() {
    var appVersionEl = document.getElementById('device-app-version');
    if (!appVersionEl) return;

    try {
        // Try to get version from config.xml or tizen API
        if (typeof tizen !== 'undefined' && tizen.application) {
            tizen.application.getAppInfo(null, function(appInfo) {
                appVersionEl.innerText = appInfo.version || '1.0.0';
            }, function() {
                appVersionEl.innerText = '1.0.0';
            });
        } else {
            // Fallback: Try to read from a global constant or default
            appVersionEl.innerText = window.APP_VERSION || '1.0.0';
        }
    } catch (e) {
        console.error("[Settings] App version error:", e);
        appVersionEl.innerText = '1.0.0';
    }
}

function loadNetworkInfo(deviceInfo, isTizen) {
    try {
        if (isTizen && webapis.network) {
            var networkType = webapis.network.getActiveConnectionType();

            setElementText('device-connection-type', getConnectionTypeName(networkType));
            
            // Update connection status in card header
            var connectionStatus = document.getElementById('device-connection-status');
            if (connectionStatus) {
                connectionStatus.innerText = networkType > 0 ? 'Connected' : 'Disconnected';
            }

            if (networkType > 0) {
                setElementText('device-ipv4', safeCall(function () {
                    return webapis.network.getIp(networkType);
                }, 'N/A'));
                
                // Load IPv6 Address - use tizen.systeminfo first (more reliable)
                loadIPv6Address(networkType);
            } else {
                setElementText('device-ipv4', 'Disconnected');
                setElementText('device-ipv6', 'N/A');
            }

            setElementText('device-gateway', safeCall(function () {
                return webapis.network.getGateway(networkType);
            }, 'N/A'));

            setElementText('device-dns', safeCall(function () {
                return webapis.network.getDns(networkType);
            }, 'N/A'));

            setElementText('device-wifi-mac', formatMacAddress(safeCall(function () {
                return webapis.network.getMac(1);
            }, null)) || 'N/A');

        } else {
            setElementText('device-connection-type', 'Browser/Emulator');
            setElementText('device-ipv4', 'N/A');
            setElementText('device-ipv6', 'N/A');
            setElementText('device-gateway', 'N/A');
            setElementText('device-dns', 'N/A');
            setElementText('device-wifi-mac', 'N/A');
            
            var connectionStatus = document.getElementById('device-connection-status');
            if (connectionStatus) {
                connectionStatus.innerText = 'Emulator Mode';
            }
        }
    } catch (e) {
        console.error("[Settings] Network info error:", e);
        setElementText('device-connection-type', 'Error');
        setElementText('device-ipv4', 'N/A');
        setElementText('device-ipv6', 'N/A');
        setElementText('device-gateway', 'N/A');
        setElementText('device-dns', 'N/A');
        setElementText('device-wifi-mac', 'N/A');
        
        var connectionStatus = document.getElementById('device-connection-status');
        if (connectionStatus) {
            connectionStatus.innerText = 'Error';
        }
    }
}

function loadScreenResolution() {
    var resEl = document.getElementById('device-resolution');
    if (!resEl) return;
    try {
        resEl.innerText = screen.width + ' x ' + screen.height;
    } catch (e) {
        resEl.innerText = 'N/A';
    }
}

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
// HELPERS
// ==========================================

function getConnectionTypeName(type) {
    var types = { 0: "Disconnected", 1: "WiFi", 2: "Cellular", 3: "Ethernet" };
    return types[type] || "Unknown (" + type + ")";
}

function safeCall(fn, fallback) {
    try {
        var result = fn();
        return result || fallback;
    } catch (e) {
        return fallback;
    }
}

function setElementText(id, text) {
    var el = document.getElementById(id);
    if (el) el.innerText = text;
}

function formatMacAddress(mac) {
    if (!mac) return null;
    var cleaned = mac.replace(/[:-]/g, '').toUpperCase();
    if (cleaned.length !== 12) return mac;
    return cleaned.match(/.{1,2}/g).join(':');
}

function initDarkMode() {
    var isDarkMode = localStorage.getItem('darkMode') !== 'false';
    if (isDarkMode) {
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.add('light-mode');
    }
}
/**
 * Load IPv6 Address using tizen.systeminfo first, then fallback to webapis.network
 * Implements reliable detection for Tizen 5.0+
 * @param {number} networkType - The active network type
 */
function loadIPv6Address(networkType) {
    var ipv6El = document.getElementById('device-ipv6');
    if (!ipv6El) return;

    try {
        // First try tizen.systeminfo API (more reliable for IPv6 on Tizen 5.0+)
        if (typeof tizen !== 'undefined' && tizen.systeminfo) {
            tizen.systeminfo.getPropertyValue(
                "NETWORK",
                function (network) {
                    // Log full network object for debugging
                    console.log("[Settings] Network Info:", JSON.stringify(network));
                    console.log("[Settings] IPv6 from systeminfo:", network.ipv6Address);
                    
                    var ipv6Address = null;
                    
                    // Check IPv6 array/string first
                    if (network.ipv6Address && network.ipv6Address.length > 0) {
                        // May be array or string depending on firmware
                        if (Array.isArray(network.ipv6Address)) {
                            ipv6Address = network.ipv6Address[0] || null;
                        } else {
                            ipv6Address = network.ipv6Address;
                        }
                    }
                    // Fallback: check if ipAddress contains ":" (IPv6 format)
                    else if (network.ipAddress && network.ipAddress.includes(":")) {
                        ipv6Address = network.ipAddress;
                    }
                    
                    if (ipv6Address) {
                        ipv6El.innerText = ipv6Address;
                        console.log("[Settings] IPv6 found:", ipv6Address);
                    } else {
                        // Fallback to webapis
                        loadIPv6FromWebapis(networkType, ipv6El);
                    }
                },
                function (error) {
                    console.log("[Settings] systeminfo IPv6 error:", error);
                    // Fallback to webapis
                    loadIPv6FromWebapis(networkType, ipv6El);
                }
            );
            return;
        }

        // Direct fallback to webapis
        loadIPv6FromWebapis(networkType, ipv6El);
        
    } catch (e) {
        console.error("[Settings] IPv6 fetch error:", e);
        ipv6El.innerText = 'N/A';
    }
}

/**
 * Fallback IPv6 loader using webapis.network
 * Tries multiple methods for compatibility with different TV models
 */
function loadIPv6FromWebapis(networkType, ipv6El) {
    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            // Try getIpv6() first
            var ipv6 = null;
            try {
                ipv6 = webapis.network.getIpv6(networkType);
            } catch (e) {
                console.log("[Settings] getIpv6 not available:", e);
            }
            
            if (ipv6 && ipv6.length > 0) {
                ipv6El.innerText = ipv6;
                console.log("[Settings] IPv6 from getIpv6:", ipv6);
                return;
            }
            
            // Alternative: check if getIp returns IPv6 (some models)
            try {
                var ip = webapis.network.getIp(networkType);
                if (ip && ip.includes(":")) {
                    ipv6El.innerText = ip;
                    console.log("[Settings] IPv6 from getIp:", ip);
                    return;
                }
            } catch (e) {
                console.log("[Settings] getIp fallback failed:", e);
            }
            
            // IPv6 not available from Tizen - try external API
            loadIPv6FromExternalAPI(ipv6El);
        } else {
            // No Tizen API - try external API
            loadIPv6FromExternalAPI(ipv6El);
        }
    } catch (e) {
        console.error("[Settings] webapis IPv6 error:", e);
        loadIPv6FromExternalAPI(ipv6El);
    }
}

/**
 * Load IPv6 from external API services (for browser/emulator)
 */
function loadIPv6FromExternalAPI(ipv6El) {
    console.log("[Settings] Trying external IPv6 API services...");
    
    var ipv6Services = [
        'https://api64.ipify.org?format=json',
        'https://v6.ident.me/.json',
        'https://ipv6.icanhazip.com'
    ];
    
    function tryService(index) {
        if (index >= ipv6Services.length) {
            ipv6El.innerText = 'N/A';
            console.log("[Settings] All external IPv6 services failed or no IPv6 available");
            return;
        }
        
        var service = ipv6Services[index];
        console.log("[Settings] Trying IPv6 service:", service);
        
        fetch(service, { timeout: 3000 })
            .then(function(response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                var contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return response.json();
                } else {
                    return response.text();
                }
            })
            .then(function(data) {
                var ip = null;
                if (typeof data === 'string') {
                    ip = data.trim();
                } else {
                    ip = data.ip || data.IP || data.address || null;
                }
                
                // Check if it's actually an IPv6 address (contains :)
                if (ip && ip.includes(":")) {
                    ipv6El.innerText = ip;
                    console.log("[Settings] IPv6 found via external API:", ip);
                } else {
                    // Not IPv6, try next service
                    console.log("[Settings] Response was IPv4, trying next...");
                    tryService(index + 1);
                }
            })
            .catch(function(error) {
                console.log("[Settings] IPv6 service failed:", service, error);
                tryService(index + 1);
            });
    }
    
    tryService(0);
}