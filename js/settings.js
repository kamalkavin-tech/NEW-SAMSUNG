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

// ✅ NEW: Recover failed images from persistent cache on app load
(function initImageRecovery() {
    if (typeof BBNL_API !== 'undefined' && BBNL_API.retryFailedImages) {
        BBNL_API.retryFailedImages();
    }
})();

// Check authentication — post-HOME relaunch: wait for localStorage (api.js)
(function checkAuth() {
    if (typeof BBNL_gateAuthenticatedPage === 'function') {
        BBNL_gateAuthenticatedPage();
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
    }
})();

// ==========================================
// CUSTOM CONFIRM POPUP - Replaces native confirm()
// Header shows: "Fo-Fi TV - Settings"
// ==========================================
function showConfirmPopup(message, onYes) {
    var overlay = document.getElementById('settings-popup-overlay');
    var msgEl = document.getElementById('settings-popup-msg');
    var yesBtn = document.getElementById('settings-popup-yes');
    var noBtn = document.getElementById('settings-popup-no');
    if (!overlay || !msgEl || !yesBtn || !noBtn) {
        // Fallback
        if (confirm(message) && onYes) onYes();
        return;
    }
    settingsPopupOpen = true;
    disableSettingsBackgroundFocusables();
    msgEl.textContent = message;
    overlay.style.display = 'flex';
    yesBtn.focus();

    function closePopup(confirmed) {
        overlay.style.display = 'none';
        settingsPopupOpen = false;
        restoreSettingsBackgroundFocusables();
        yesBtn.removeEventListener('click', onYesClick);
        noBtn.removeEventListener('click', onNoClick);
        document.removeEventListener('keydown', onPopupKey);
        if (confirmed && onYes) onYes();
    }

    function onYesClick() { closePopup(true); }
    function onNoClick() { closePopup(false); }

    function onPopupKey(e) {
        // Fully isolate popup interaction from background page.
        e.preventDefault();
        e.stopPropagation();
        if (e.keyCode === 13 || e.keyCode === 65376) {
            // Let the focused button handle Enter via click
            var focused = document.activeElement;
            if (focused === yesBtn) closePopup(true);
            else closePopup(false);
        } else if (e.keyCode === 10009 || e.keyCode === 461) { // Back key
            closePopup(false);
        } else if (e.keyCode === 37) { // Left → focus Yes
            yesBtn.focus();
        } else if (e.keyCode === 39) { // Right → focus No
            noBtn.focus();
        }
    }

    yesBtn.addEventListener('click', onYesClick);
    noBtn.addEventListener('click', onNoClick);
    document.addEventListener('keydown', onPopupKey);
}

// When the confirmation popup is open, background controls must stay disabled.
var settingsPopupOpen = false;

function disableSettingsBackgroundFocusables() {
    var focusables = document.querySelectorAll('.focusable');
    focusables.forEach(function (el) {
        if (el.id === 'settings-popup-yes' || el.id === 'settings-popup-no') return;
        if (!el.hasAttribute('data-prev-tabindex')) {
            var prev = el.getAttribute('tabindex');
            el.setAttribute('data-prev-tabindex', prev !== null ? prev : 'none');
        }
        el.tabIndex = -1;
    });
}

function restoreSettingsBackgroundFocusables() {
    var focusables = document.querySelectorAll('.focusable');
    focusables.forEach(function (el) {
        if (el.id === 'settings-popup-yes' || el.id === 'settings-popup-no') return;
        var prev = el.getAttribute('data-prev-tabindex');
        if (prev === null) return;
        if (prev === 'none') {
            el.removeAttribute('tabindex');
        } else {
            el.setAttribute('tabindex', prev);
        }
        el.removeAttribute('data-prev-tabindex');
    });
}

// Navigation state
var settingsNav = {
    zone: 'sidebar',           // 'sidebar' or 'content'
    sidebarIndex: 0,           // Current sidebar item index
    contentIndex: 0            // Current content focusable index
};
var settingsNetworkRefreshTimer = null;
var settingsNetworkListenerRegistered = false;
var settingsLastKnownDns = '';
var settingsLastKnownGateway = '';
var settingsGatewayFetchInFlight = false;
var settingsGatewayLastResolvedAt = 0;

// ==========================================
// INITIALIZATION
// ==========================================

window.onload = function () {

    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.primeAfterLogin) {
        AppPerformanceCache.primeAfterLogin(false);
    }

    // Initialize Dark Mode
    initDarkMode();

    // Initialize sidebar click handlers
    initializeSidebar();

    // Load data
    loadAboutAppInfo();
    loadDeviceInfoPanel();
    startSettingsNetworkRefresh();

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
    }

    // Register remote keys
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
            tizen.tvinputdevice.registerKeyBatch(keys);
        } catch (e) {
        }
    }

    // Restore previous Settings navigation state for faster return UX.
    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.getPageState) {
        var cachedState = AppPerformanceCache.getPageState('settings', 60 * 60 * 1000);
        if (cachedState) {
            if (typeof cachedState.zone === 'string') settingsNav.zone = cachedState.zone;
            if (typeof cachedState.sidebarIndex === 'number') settingsNav.sidebarIndex = cachedState.sidebarIndex;
            if (typeof cachedState.contentIndex === 'number') settingsNav.contentIndex = cachedState.contentIndex;

            setTimeout(function () {
                try {
                    if (settingsNav.zone === 'sidebar') {
                        var items = getSidebarItems();
                        if (items[settingsNav.sidebarIndex]) items[settingsNav.sidebarIndex].focus();
                    } else {
                        refreshContentFocusables();
                        if (settingsNav.contentFocusables[settingsNav.contentIndex]) {
                            settingsNav.contentFocusables[settingsNav.contentIndex].focus();
                        }
                    }
                } catch (e) {}
            }, 0);
        }
    }
};

window.addEventListener('pagehide', function () {
    if (settingsNetworkRefreshTimer) {
        clearInterval(settingsNetworkRefreshTimer);
        settingsNetworkRefreshTimer = null;
    }

    if (typeof AppPerformanceCache !== 'undefined' && AppPerformanceCache.savePageState) {
        AppPerformanceCache.savePageState('settings', {
            zone: settingsNav.zone,
            sidebarIndex: settingsNav.sidebarIndex,
            contentIndex: settingsNav.contentIndex,
            scrollTop: window.scrollY || 0
        });
    }
});

window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
        // Page restored from BFCache — everything is still intact!
        // Just re-register remote keys
        if (typeof RemoteKeys !== 'undefined') {
            RemoteKeys.registerAllKeys();
        }
    }
});

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
        items[index].scrollIntoView({ behavior: 'auto', block: 'center' });
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
    }
}

// ==========================================
// KEY HANDLER
// ==========================================

document.addEventListener("keydown", function (e) {
    // While logout popup is open, only popup key handler should process keys.
    if (settingsPopupOpen) {
        return;
    }

    var code = e.keyCode;
    e.preventDefault();


    // BACK key - always go home
    if (code === 10009) {
        window.__BBNL_NAVIGATING = true;
        window.location.replace('home.html');
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
            focusContentItem(0);
        } else {
        }
    }
    else if (settingsNav.zone === 'content') {
        // Already in content, do nothing
    }
}

// ==========================================
// NAVIGATION - ENTER
// ==========================================

function handleEnter() {
    var active = document.activeElement;
    if (!active) return;


    // Back button
    if (active.classList.contains('back-btn')) {
        if(window.history.length > 1) { window.history.back(); } else { window.location.href = 'home.html'; }
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
    showConfirmPopup('Are you sure you want to logout?', async function () {

        // 1. Save device-level data BEFORE API logout (these survive logout — device identity)
        var savedMac = localStorage.getItem('macAddress');
        var savedDeviceId = localStorage.getItem('deviceId');

        // 2. Stop all background timers/intervals on this page
        var highestTimerId = setTimeout(function () {}, 0);
        for (var i = 0; i < highestTimerId; i++) {
            clearTimeout(i);
            clearInterval(i);
        }

        // 3. Call API logout (server-side session cleanup)
        if (typeof BBNL_API !== 'undefined' && BBNL_API.logout) {
            try {
                await BBNL_API.logout();
            } catch (e) {
                console.error("[Settings] API logout error:", e);
            }
        }

        // 4. CLEAR ALL localStorage — this is an EXPLICIT logout
        // Remove hasLoggedInOnce and bbnl_user so login page shows on next launch
        localStorage.clear();

        // 5. Restore device-level data only (not user session data)
        if (savedMac) localStorage.setItem('macAddress', savedMac);
        if (savedDeviceId) localStorage.setItem('deviceId', savedDeviceId);

        // 6. Clear all sessionStorage
        sessionStorage.clear();


        // 7. Exit the Tizen application completely
        // On relaunch: hasLoggedInOnce is GONE → login page shows (correct for explicit logout)
        try {
            if (typeof tizen !== 'undefined' && tizen.application) {
                tizen.application.getCurrentApplication().exit();
            } else {
                // For browser testing - redirect to login
                window.location.href = "login.html";
            }
        } catch (e) {
            window.location.href = "login.html";
        }
    }); // end showConfirmPopup callback
}

// ==========================================
// ABOUT APP - Version Info
// ==========================================

function loadAboutAppInfo() {

    BBNL_API.getAppVersion()
        .then(function (response) {

            if (response && response.status && Number(response.status.err_code) === 0) {
                if (response.body) {
                    var versionData = response.body;

                    var versionEl = document.getElementById('software-version');
                    if (versionEl) {
                        versionEl.innerText = versionData.appversion || "Unknown";
                    }

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
}

function checkForUpdates() {

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

    var deviceInfo = typeof DeviceInfo !== 'undefined' ? DeviceInfo.getDeviceInfo() : null;
    var isTizen = (typeof webapis !== 'undefined');

    loadUserId();
    loadModelInfo(isTizen);
    loadDeviceId(deviceInfo, isTizen);
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
        deviceIdEl.innerText = DeviceInfo.getDeviceIdLabel();
    } catch (e) {
        deviceIdEl.innerText = 'Not available';
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

function isIPv4(value) {
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(value || '').trim());
}

function isPrivateIPv4(value) {
    var ip = String(value || '').trim();
    if (!isIPv4(ip)) return false;
    if (ip.indexOf('10.') === 0) return true;
    if (ip.indexOf('192.168.') === 0) return true;
    if (ip.indexOf('169.254.') === 0) return true;
    var m = ip.match(/^172\.(\d{1,3})\./);
    if (!m) return false;
    var second = parseInt(m[1], 10);
    return second >= 16 && second <= 31;
}

function getLocalIPv4Score(ip) {
    var value = String(ip || '').trim();
    if (!isPrivateIPv4(value)) return -1;

    // Prefer commonly active LAN/WiFi ranges.
    if (value.indexOf('10.') === 0) return 400;
    if (value.indexOf('192.168.') === 0) return 350;
    if (value.indexOf('172.') === 0) return 250;
    if (value.indexOf('169.254.') === 0) return 100;
    return 50;
}

function pickBestLocalIPv4(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return '';

    var best = '';
    var bestScore = -1;
    var seen = {};

    for (var i = 0; i < candidates.length; i++) {
        var raw = candidates[i];
        if (raw === null || raw === undefined) continue;

        var ip = String(raw).trim();
        if (!ip || seen[ip]) continue;
        seen[ip] = true;

        var score = getLocalIPv4Score(ip);
        if (score > bestScore) {
            best = ip;
            bestScore = score;
        }
    }

    return bestScore >= 0 ? best : '';
}

function isLikelyDnsValue(value) {
    var v = String(value || '').trim();
    if (!v) return false;

    // IPv4 DNS
    if (isIPv4(v)) return true;

    // Hostname DNS (e.g., dns.example.net)
    if (/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(v) && v.indexOf('.') !== -1) return true;

    return false;
}

function resolveDynamicDns(deviceInfo, networkType, hasWebapis) {
    return new Promise(function (resolve) {
        var candidates = [];

        function finalize() {
            for (var i = 0; i < candidates.length; i++) {
                var c = String(candidates[i] || '').trim();
                if (!isLikelyDnsValue(c)) continue;
                settingsLastKnownDns = c;
                resolve(c);
                return;
            }

            if (settingsLastKnownDns) {
                resolve(settingsLastKnownDns);
                return;
            }

            resolve('');
        }

        try {
            if (hasWebapis && networkType > 0 && typeof webapis !== 'undefined' && webapis.network && typeof webapis.network.getDns === 'function') {
                var dnsApi = webapis.network.getDns(networkType);
                if (isLikelyDnsValue(dnsApi)) {
                    candidates.push(dnsApi);
                }
            }
        } catch (e) {
        }

        // Best fallback in emulator/browser runtimes
        try {
            if (typeof tizen !== 'undefined' && tizen.systeminfo && typeof tizen.systeminfo.getPropertyValue === 'function') {
                tizen.systeminfo.getPropertyValue('NETWORK', function (network) {
                    var netDns = network && (network.dns || network.dnsServer || network.dnsAddress || '');
                    if (isLikelyDnsValue(netDns)) {
                        candidates.push(netDns);
                    }

                    var cachedDns = deviceInfo && (deviceInfo.dns || deviceInfo.dns_server || '');
                    if (isLikelyDnsValue(cachedDns)) {
                        candidates.push(cachedDns);
                    }

                    finalize();
                }, function () {
                    var cachedDns = deviceInfo && (deviceInfo.dns || deviceInfo.dns_server || '');
                    if (isLikelyDnsValue(cachedDns)) {
                        candidates.push(cachedDns);
                    }
                    finalize();
                });
                return;
            }
        } catch (e2) {
        }

        var fallbackDns = deviceInfo && (deviceInfo.dns || deviceInfo.dns_server || '');
        if (isLikelyDnsValue(fallbackDns)) {
            candidates.push(fallbackDns);
        }

        finalize();
    });
}

function getLocalIPv4Dynamic(deviceInfo, networkType, hasWebapis) {
    return new Promise(function (resolve) {
        function done(ip) {
            resolve(isPrivateIPv4(ip) ? String(ip).trim() : '');
        }

        // Priority 1: Live network API on Samsung TV
        try {
            if (hasWebapis && networkType > 0) {
                var ip1 = webapis.network.getIp(networkType);
                if (isPrivateIPv4(ip1)) {
                    done(ip1);
                    return;
                }

                if (typeof webapis.network.getIpv4 === 'function') {
                    var ip2 = webapis.network.getIpv4(networkType);
                    if (isPrivateIPv4(ip2)) {
                        done(ip2);
                        return;
                    }
                }
            }
        } catch (e) {
        }

        // Priority 2: Tizen systeminfo fallback
        try {
            if (typeof tizen !== 'undefined' && tizen.systeminfo && typeof tizen.systeminfo.getPropertyValue === 'function') {
                tizen.systeminfo.getPropertyValue('NETWORK', function (network) {
                    var candidates = [];
                    var netIp = network && (network.ipAddress || network.ipv4Address || network.ipv4 || '');
                    if (isPrivateIPv4(netIp)) {
                        candidates.push(netIp);
                    }

                    // Priority 3: DeviceInfo cached local ip (validated)
                    var cachedIp = (deviceInfo && (deviceInfo.local_ip || deviceInfo.ip_address)) || '';
                    if (isPrivateIPv4(cachedIp)) {
                        candidates.push(cachedIp);
                    }

                    // Priority 4: Browser WebRTC probe and choose best candidate.
                    detectBrowserLocalIPv4(3000).then(function (browserIp) {
                        if (isPrivateIPv4(browserIp)) {
                            candidates.push(browserIp);
                        }
                        var best = pickBestLocalIPv4(candidates);
                        if (best) {
                        }
                        done(best);
                    });
                }, function () {
                    var candidates = [];
                    var cachedIp = (deviceInfo && (deviceInfo.local_ip || deviceInfo.ip_address)) || '';
                    if (isPrivateIPv4(cachedIp)) {
                        candidates.push(cachedIp);
                    }

                    detectBrowserLocalIPv4(3000).then(function (browserIp) {
                        if (isPrivateIPv4(browserIp)) {
                            candidates.push(browserIp);
                        }
                        done(pickBestLocalIPv4(candidates));
                    });
                });
                return;
            }
        } catch (sysErr) {
        }

        // Priority 3/4 direct fallback path if no tizen.systeminfo
        var fallbackIp = (deviceInfo && (deviceInfo.local_ip || deviceInfo.ip_address)) || '';
        detectBrowserLocalIPv4(3000).then(function (browserIp) {
            done(pickBestLocalIPv4([fallbackIp, browserIp]));
        });
    });
}

function startSettingsNetworkRefresh() {
    if (settingsNetworkRefreshTimer) {
        clearInterval(settingsNetworkRefreshTimer);
    }

    // Periodic refresh keeps IP/DNS/connection fields dynamic on settings page.
    settingsNetworkRefreshTimer = setInterval(function () {
        try {
            var deviceInfo = typeof DeviceInfo !== 'undefined' ? DeviceInfo.getDeviceInfo() : null;
            loadNetworkInfo(deviceInfo, (typeof webapis !== 'undefined'));
        } catch (e) {
        }
    }, 15000);

    // Event-driven refresh for immediate updates when cable/wifi state changes.
    if (!settingsNetworkListenerRegistered) {
        try {
            if (typeof webapis !== 'undefined' && webapis.network && typeof webapis.network.addNetworkStateChangeListener === 'function') {
                webapis.network.addNetworkStateChangeListener(function (state) {
                    setTimeout(function () {
                        var deviceInfo = typeof DeviceInfo !== 'undefined' ? DeviceInfo.getDeviceInfo() : null;
                        loadNetworkInfo(deviceInfo, (typeof webapis !== 'undefined'));
                    }, 1000);
                });
                settingsNetworkListenerRegistered = true;
            }
        } catch (e2) {
        }
    }
}

function loadNetworkInfo(deviceInfo, isTizen) {
    // Re-check webapis availability directly (might not be available at page load)
    var hasWebapis = (typeof webapis !== 'undefined') && webapis && webapis.network;
    
    try {
        if (hasWebapis) {
            var networkType = webapis.network.getActiveConnectionType();

            setElementText('device-connection-type', getConnectionTypeName(networkType));
            
            // Update connection status in card header
            var connectionStatus = document.getElementById('device-connection-status');
            if (connectionStatus) {
                connectionStatus.innerText = networkType > 0 ? 'Connected' : 'Disconnected';
            }

            if (networkType > 0) {
                setElementText('device-ipv4', 'Resolving...');
                getLocalIPv4Dynamic(deviceInfo, networkType, hasWebapis).then(function (localIp) {
                    setElementText('device-ipv4', localIp || 'Unavailable');
                });

                setElementText('device-dns', 'Resolving...');
                resolveDynamicDns(deviceInfo, networkType, hasWebapis).then(function (dnsValue) {
                    setElementText('device-dns', dnsValue || 'Unavailable');
                });

                // Load Public IP and show it in Gateway IP field
                loadPublicIPForGateway(deviceInfo, networkType, hasWebapis);

                // Load IPv6 Address - uses centralized detection from api.js
                loadIPv6Display();
            } else {
                setElementText('device-ipv4', 'Disconnected');
                setElementText('device-gateway', 'Disconnected');
                setElementText('device-dns', 'Disconnected');
                setElementText('device-ipv6', 'N/A');
            }

            try {
                var macValue = webapis.network.getMac(1);
                var formattedMac = formatMacAddress(macValue);
                setElementText('device-wifi-mac', formattedMac || 'N/A');
            } catch (macError) {
                console.error("[Settings] Error getting MAC:", macError);
                setElementText('device-wifi-mac', 'N/A');
            }

        } else {
            // Browser/Emulator mode - no native webapis.network available
            if (typeof webapis !== 'undefined') {
            }

            setElementText('device-connection-type', 'Browser/Emulator');
            setElementText('device-ipv4', 'Resolving...');
            setElementText('device-dns', 'Resolving...');
            setElementText('device-wifi-mac', 'N/A');

            var connectionStatus = document.getElementById('device-connection-status');
            if (connectionStatus) {
                connectionStatus.innerText = 'Emulator Mode';
            }

            getLocalIPv4Dynamic(deviceInfo, 0, false).then(function (localIp) {
                if (localIp) {
                    setElementText('device-ipv4', localIp);
                    return;
                }
                setElementText('device-ipv4', 'Unavailable');
            });

            resolveDynamicDns(deviceInfo, 0, false).then(function (dnsValue) {
                setElementText('device-dns', dnsValue || 'Unavailable');
            });

            // Only load gateway (public IP) - local IP not available in browser
            loadPublicIPForGateway(deviceInfo, 0, false);
            loadIPv6Display();
        }
    } catch (e) {
        console.error("[Settings] Network info error:", e);
        setElementText('device-connection-type', 'Error');
        setElementText('device-ipv4', 'Unavailable');
        setElementText('device-ipv6', 'N/A');
        setElementText('device-gateway', settingsLastKnownGateway || 'Unavailable');
        setElementText('device-dns', settingsLastKnownDns || 'Unavailable');
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

// Browser-only fallback for local IPv4 (best effort via ICE candidates).
// Some environments hide local IP and return mDNS hostnames instead.
function detectBrowserLocalIPv4(timeoutMs) {
    return new Promise(function (resolve) {
        try {
            var RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
            if (!RTCPeer) {
                resolve('');
                return;
            }

            var done = false;
            var candidates = [];
            var regex = /(\d{1,3}(?:\.\d{1,3}){3})/;
            var pc = new RTCPeer({ iceServers: [] });

            function isPrivate(ip) {
                if (!ip) return false;
                if (ip.indexOf('10.') === 0) return true;
                if (ip.indexOf('192.168.') === 0) return true;
                var m = ip.match(/^172\.(\d{1,3})\./);
                if (!m) return false;
                var second = parseInt(m[1], 10);
                return second >= 16 && second <= 31;
            }

            function finish(ip) {
                if (done) return;
                done = true;
                try { pc.close(); } catch (e) {}
                resolve(ip || '');
            }

            pc.createDataChannel('bbnl-ip-probe');
            pc.onicecandidate = function (evt) {
                if (!evt || !evt.candidate || !evt.candidate.candidate) return;
                var candidate = evt.candidate.candidate;
                var match = candidate.match(regex);
                if (!match) return;
                var ip = match[1];
                if (isPrivate(ip)) {
                    candidates.push(ip);
                }
            };

            pc.createOffer()
                .then(function (offer) { return pc.setLocalDescription(offer); })
                .catch(function () { finish(''); });

            setTimeout(function () {
                finish(pickBestLocalIPv4(candidates));
            }, timeoutMs || 3000);
        } catch (e) {
            resolve('');
        }
    });
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
 * Load gateway IP for Settings page.
 * Mirrors login page behavior: native gateway first, then external fallback.
 */
function loadPublicIPForGateway(deviceInfo, networkType, hasWebapis) {
    var gatewayEl = document.getElementById('device-gateway');
    if (!gatewayEl) return;

    var now = Date.now();

    // Reuse a recently resolved gateway to avoid visual churn and unnecessary network calls.
    if (settingsLastKnownGateway && (now - settingsGatewayLastResolvedAt) < 45000) {
        gatewayEl.innerText = settingsLastKnownGateway;
        return;
    }

    // Check persistent cache (localStorage) — survives page reloads & app relaunches.
    // Gateway IPs rarely change; 10-minute TTL avoids redundant external API calls.
    try {
        var persistedGw = localStorage.getItem('bbnl_gateway_cache');
        if (persistedGw) {
            var gwCache = JSON.parse(persistedGw);
            if (gwCache && gwCache.ip && (now - Number(gwCache.ts)) < 600000) { // 10 min
                settingsLastKnownGateway = gwCache.ip;
                settingsGatewayLastResolvedAt = now;
                gatewayEl.innerText = gwCache.ip;
                return;
            }
        }
    } catch (e) {}

    // If a previous fetch is still in progress, do not start another one.
    if (settingsGatewayFetchInFlight) {
        if (settingsLastKnownGateway) gatewayEl.innerText = settingsLastKnownGateway;
        return;
    }

    settingsGatewayFetchInFlight = true;
    gatewayEl.innerText = settingsLastKnownGateway || 'Fetching...';

    function isValidGatewayValue(ip) {
        if (!ip || typeof ip !== 'string') return false;
        var v = ip.trim();
        if (v === '::1' || v === '0.0.0.0' || v === '0.0.0.1' || v === '127.0.0.1') return false;
        if (v.indexOf('---') !== -1) return false;
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(v);
    }

    function commitGateway(value) {
        var v = String(value || '').trim();
        if (isValidGatewayValue(v)) {
            settingsLastKnownGateway = v;
            settingsGatewayLastResolvedAt = Date.now();
            settingsGatewayFetchInFlight = false;
            gatewayEl.innerText = v;
            // Persist to localStorage so page reloads don't re-fetch
            try { localStorage.setItem('bbnl_gateway_cache', JSON.stringify({ ip: v, ts: Date.now() })); } catch (e) {}
            return true;
        }
        return false;
    }

    var hasNativeWebapis = typeof hasWebapis === 'boolean'
        ? hasWebapis
        : ((typeof webapis !== 'undefined') && webapis && webapis.network);
    var activeType = typeof networkType === 'number'
        ? networkType
        : safeCall(function () { return webapis.network.getActiveConnectionType(); }, 0);

    // Priority 1: Active interface gateway from webapis
    try {
        if (hasNativeWebapis && activeType > 0 && typeof webapis.network.getGateway === 'function') {
            var gatewayIp = webapis.network.getGateway(activeType);
            if (commitGateway(gatewayIp)) {
                    return;
            }
        }
    } catch (e) {
    }

    // Priority 2: Tizen systeminfo network snapshot
    try {
        if (typeof tizen !== 'undefined' && tizen.systeminfo && typeof tizen.systeminfo.getPropertyValue === 'function') {
            tizen.systeminfo.getPropertyValue('NETWORK', function (network) {
                var sysGateway = network && (network.gateway || network.gatewayIp || network.defaultGateway || network.router || '');
                if (commitGateway(sysGateway)) {
                    return;
                }

                var cachedGateway = (deviceInfo && (deviceInfo.gateway || deviceInfo.gateway_ip || deviceInfo.default_gateway)) || '';
                if (commitGateway(cachedGateway)) {
                    return;
                }

                tryExternalServices();
            }, function () {
                var cachedGateway = (deviceInfo && (deviceInfo.gateway || deviceInfo.gateway_ip || deviceInfo.default_gateway)) || '';
                if (commitGateway(cachedGateway)) {
                    return;
                }
                tryExternalServices();
            });
            return;
        }
    } catch (e2) {
    }

    // Priority 3: Cached gateway value from device info if available
    var cachedGateway = (deviceInfo && (deviceInfo.gateway || deviceInfo.gateway_ip || deviceInfo.default_gateway)) || '';
    if (commitGateway(cachedGateway)) {
        return;
    }

    // Priority 4: Same external fallback used on login page.
    tryExternalServices();

    function fetchWithTimeout(url, timeoutMs) {
        var timeoutPromise = new Promise(function (_, reject) {
            setTimeout(function () { reject(new Error('Timeout')); }, timeoutMs);
        });
        return Promise.race([fetch(url), timeoutPromise]);
    }

    function tryExternalServices() {
        var ipServices = [
            'https://api.ipify.org?format=json',
            'https://api64.ipify.org?format=json',
            'https://ipapi.co/json/',
            'https://api.my-ip.io/ip.json'
        ];

        function tryNextService(index) {
            if (index >= ipServices.length) {
                settingsGatewayFetchInFlight = false;
                gatewayEl.innerText = settingsLastKnownGateway || 'Unavailable';
                return;
            }

            var service = ipServices[index];
            fetchWithTimeout(service, 5000)
                .then(function (response) {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.json();
                })
                .then(function (data) {
                    var externalIp = data.ip || data.IPv4 || data.IP || null;
                    if (commitGateway(externalIp)) {
                        return;
                    }
                    throw new Error('No valid gateway IP in response');
                })
                .catch(function () {
                    tryNextService(index + 1);
                });
        }

        tryNextService(0);
    }
}

/**
 * Load IPv6 Address using centralized DeviceInfo.detectIPv6() from api.js
 */
function loadIPv6Display() {
    var ipv6El = document.getElementById('device-ipv6');
    if (!ipv6El) return;

    // Show cached IPv6 immediately if available (avoid slow re-detection on every page load)
    if (DEVICE_INFO.ipv6) {
        ipv6El.innerText = DEVICE_INFO.ipv6;
        return;
    }

    // Check persistent cache (5-minute TTL)
    try {
        var cached = localStorage.getItem('bbnl_ipv6_cache');
        if (cached) {
            var parsed = JSON.parse(cached);
            if (parsed && parsed.addr && (Date.now() - Number(parsed.ts)) < 300000) {
                DEVICE_INFO.ipv6 = parsed.addr;
                ipv6El.innerText = parsed.addr;
                return;
            }
        }
    } catch (e) {}

    // Detect fresh only when no cache available
    DeviceInfo.detectIPv6().then(function (addr) {
        ipv6El.innerText = addr || "Not Available";
        if (addr) {
            try { localStorage.setItem('bbnl_ipv6_cache', JSON.stringify({ addr: addr, ts: Date.now() })); } catch (e) {}
        }
    });
}