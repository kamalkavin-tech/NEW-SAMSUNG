/* ================================
   BBNL SETTINGS PAGE CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;

window.onload = function () {
    console.log("=== BBNL Settings Page Initialized ===");

    // Get all focusable elements
    focusables = document.querySelectorAll(".focusable");

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

    // Load settings data
    loadAppVersion();
    loadDeviceInfo();
    loadUserInfo();
};

// Keyboard navigation
document.addEventListener("keydown", function (e) {
    var code = e.keyCode;

    if (code === 10009) { // Back
        e.preventDefault();
        window.history.back();
        return;
    }

    // Vertical navigation
    if (code === 38) { // UP
        e.preventDefault();
        moveFocus(-1);
    }
    if (code === 40) { // DOWN
        e.preventDefault();
        moveFocus(1);
    }

    if (code === 13) { // Enter
        e.preventDefault();
        var el = focusables[currentFocus];
        if (el) el.click();
    }
});

function moveFocus(step) {
    if (focusables.length === 0) return;
    var next = currentFocus + step;
    if (next < 0) next = 0;
    if (next >= focusables.length) next = focusables.length - 1;

    if (next !== currentFocus) {
        currentFocus = next;
        focusables[currentFocus].focus();
    }
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
                // Extract version data from response.body
                if (response.body && response.body.length > 0) {
                    var versionData = response.body[0];

                    // Update app name
                    var appNameElement = document.getElementById('app-name');
                    if (appNameElement) {
                        appNameElement.innerText = versionData.appname || versionData.app_name || "BBNL IPTV";
                    }

                    // Update version display
                    var versionElement = document.getElementById('app-version');
                    if (versionElement) {
                        versionElement.innerText = versionData.appversion || versionData.version || "Unknown";
                    }

                    // Update build date if available
                    var buildDateElement = document.getElementById('build-date');
                    if (buildDateElement) {
                        buildDateElement.innerText = versionData.builddate || versionData.build_date || "N/A";
                    }

                    console.log("[Settings] App version loaded successfully");
                } else {
                    console.warn("[Settings] No version data in response body");
                    setVersionError("No version data");
                }
            } else {
                var errorMsg = response && response.status ? response.status.err_msg : "Unknown error";
                console.error("[Settings] API Error:", errorMsg);
                setVersionError(errorMsg);
            }
        })
        .catch(function (error) {
            console.error("[Settings] Failed to load app version:", error);
            setVersionError("Failed to load");
        });
}

/**
 * Set version error message
 */
function setVersionError(message) {
    var appNameElement = document.getElementById('app-name');
    if (appNameElement) {
        appNameElement.innerText = "BBNL IPTV";
    }

    var versionElement = document.getElementById('app-version');
    if (versionElement) {
        versionElement.innerText = message || "Error";
    }

    var buildDateElement = document.getElementById('build-date');
    if (buildDateElement) {
        buildDateElement.innerText = "N/A";
    }
}

/**
 * Load device information
 */
function loadDeviceInfo() {
    console.log("[Settings] Loading device info...");

    try {
        // Use DeviceInfo from api.js
        var deviceInfo = typeof DeviceInfo !== 'undefined' ? DeviceInfo : null;

        if (!deviceInfo) {
            console.warn("[Settings] DeviceInfo not available");
            setDeviceInfoError();
            return;
        }

        console.log("[Settings] Device Info:", deviceInfo);

        // Update device type
        var deviceTypeElement = document.getElementById('device-type');
        if (deviceTypeElement) {
            deviceTypeElement.innerText = deviceInfo.device_type || deviceInfo.devtype || "Unknown";
        }

        // Update device name
        var deviceNameElement = document.getElementById('device-name');
        if (deviceNameElement) {
            deviceNameElement.innerText = deviceInfo.device_name || deviceInfo.devname || "Unknown";
        }

        // Update MAC address
        var macElement = document.getElementById('mac-address');
        if (macElement) {
            macElement.innerText = deviceInfo.mac_address || deviceInfo.macaddress || "Unknown";
        }

        // Update IP address
        var ipElement = document.getElementById('ip-address');
        if (ipElement) {
            ipElement.innerText = deviceInfo.ip_address || deviceInfo.ipaddress || "Unknown";
        }

        // Update serial number
        var serialElement = document.getElementById('serial-number');
        if (serialElement) {
            serialElement.innerText = deviceInfo.devslno || deviceInfo.serial || "Unknown";
        }

        console.log("[Settings] Device info loaded successfully");
    } catch (error) {
        console.error("[Settings] Failed to load device info:", error);
        setDeviceInfoError();
    }
}

/**
 * Set device info error message
 */
function setDeviceInfoError() {
    document.getElementById('device-type').innerText = "Error";
    document.getElementById('device-name').innerText = "Error";
    document.getElementById('mac-address').innerText = "Error";
    document.getElementById('ip-address').innerText = "Error";
    document.getElementById('serial-number').innerText = "Error";
}

/**
 * Load user information from session
 */
function loadUserInfo() {
    console.log("[Settings] Loading user info...");

    try {
        var userData = AuthAPI.getUserData();

        if (userData) {
            console.log("[Settings] User Data:", userData);

            // Update user ID - try multiple field name variants
            var userIdElement = document.getElementById('user-id');
            if (userIdElement) {
                var userId = userData.userid || userData.userId || userData.id || userData.username || "Unknown";
                userIdElement.innerText = userId;
            }

            // Update mobile - try multiple field name variants
            var mobileElement = document.getElementById('user-mobile');
            if (mobileElement) {
                var mobile = userData.mobile || userData.phone || userData.mobilenumber || "Unknown";
                mobileElement.innerText = mobile;
            }

            console.log("[Settings] User info loaded successfully");
        } else {
            console.log("[Settings] No user logged in");
            document.getElementById('user-id').innerText = "Not logged in";
            document.getElementById('user-mobile').innerText = "Not logged in";
        }
    } catch (error) {
        console.error("[Settings] Failed to load user info:", error);
        document.getElementById('user-id').innerText = "Error";
        document.getElementById('user-mobile').innerText = "Error";
    }
}
