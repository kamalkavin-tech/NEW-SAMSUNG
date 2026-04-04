/* ================================
   BBNL IPTV – CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;
var otpRequestInProgress = false; // Flag to prevent duplicate OTP requests
var otpVerifyInProgress = false; // Flag to prevent duplicate OTP verification
var lastOtpRequestTime = 0; // Timestamp of last OTP request (prevents double-fire from TV remote quirks)

function focusLoginPhoneInput() {
    var phoneInput = document.getElementById("phoneInput");
    if (!phoneInput) return false;
    phoneInput.readOnly = false;
    phoneInput.focus();
    var phoneIdx = Array.from(focusables).indexOf(phoneInput);
    if (phoneIdx >= 0) currentFocus = phoneIdx;
    return true;
}

// Check authentication on page load - redirect logged in users away from auth pages
(function checkAuthRedirect() {
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    var authPages = ['index.html', 'login.html', 'verify.html', ''];
    var isAuthPage = authPages.indexOf(currentPage) !== -1;

    // If user has logged in before AND has valid session data, skip login pages and go to home
    if (isAuthPage) {
        try {
            function normalizeStoredUser(obj) {
                if (!obj || typeof obj !== 'object') return null;
                var uid = obj.userid != null && String(obj.userid).trim() !== '' ? String(obj.userid).trim()
                    : (obj.userId != null && String(obj.userId).trim() !== '' ? String(obj.userId).trim() : '');
                if (!uid) return null;
                if (!obj.userid) obj.userid = uid;
                return obj;
            }
            var primaryRaw = localStorage.getItem("bbnl_user");
            var backupRaw = localStorage.getItem("bbnl_user_backup");
            var primaryUser = null;
            var backupUser = null;

            if (primaryRaw) {
                try {
                    primaryUser = normalizeStoredUser(JSON.parse(primaryRaw));
                } catch (e1) {}
            }

            if (backupRaw) {
                try {
                    backupUser = normalizeStoredUser(JSON.parse(backupRaw));
                } catch (e2) {}
            }

            var resolvedUser = primaryUser || backupUser;
            if (resolvedUser) {
                var resolvedJson = JSON.stringify(resolvedUser);
                if (primaryRaw !== resolvedJson) localStorage.setItem("bbnl_user", resolvedJson);
                if (backupRaw !== resolvedJson) localStorage.setItem("bbnl_user_backup", resolvedJson);
                if (localStorage.getItem("hasLoggedInOnce") !== "true") {
                    localStorage.setItem("hasLoggedInOnce", "true");
                }
                window.__BBNL_NAVIGATING = true;
                window.location.replace("home.html");
                return;
            }
        } catch (e) {}
    }
})();

/* INIT */
window.onload = function () {

    // 1. Select Focusables
    focusables = document.querySelectorAll(".focusable");

    // 2. Set Initial Focus (login page should always start on phone input)
    if (!focusLoginPhoneInput() && focusables.length > 0) {
        currentFocus = 0;
        focusables[0].focus();
    }

    // 3. Show Device ID, Gateway IP, MAC & IPv6 (if on login page)
    showDeviceId();
    showMacAddress();
    showIPv6();
    showPublicIP();

    // 4a. Listen for network changes to auto-update IP
    startNetworkChangeListener();

    // 4b. Initialize Resend OTP timer (if on verify page)
    initResendOTPTimer();
    var resendBtn = document.getElementById('resendOtpBtn');
    if (resendBtn) {
        resendBtn.addEventListener('click', handleResendOTP);
    }

    // 4. Add MOUSE Click Support for all focusable elements
    focusables.forEach(function (el, index) {

        // Track focus on hover to sync with remote state
        el.addEventListener("mouseenter", function () {
            currentFocus = index;
            el.focus();
        });

        // Handle mouse clicks
        el.addEventListener("click", function (e) {
            if (el.classList && el.classList.contains('otp-input')) {
                currentFocus = index;
                activateOTPInput(el);
                return;
            }
            if (el.id === 'phoneInput') {
                currentFocus = index;
                el.readOnly = false;
                el.focus();
                return;
            }
            e.preventDefault();
            handleOK();
        });
    });

    // 5. Initialize Error Modal (if on login page)
    initErrorModal();

    // 6. Register All Remote Keys (supports all Samsung remote types)
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            var keys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
                "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
                "Enter", "Return"];
            tizen.tvinputdevice.registerKeyBatch(keys);
        } catch (e) {
        }
    }

    // 7. Add Number-Only Validation for Phone and OTP inputs
    setupNumberOnlyInputs();

    // 8. Initialize phone input (clear any residual values)
    initializePhoneInput();

    // Re-assert focus after initial paint to avoid focus loss on TV render/poll timing.
    requestAnimationFrame(function () {
        focusLoginPhoneInput();
    });
};

window.addEventListener('pageshow', function () {
    focusLoginPhoneInput();
});

/* DEVICE ID */
function showDeviceId() {
    var deviceIdText = document.getElementById("deviceIdText");
    if (!deviceIdText) return; // Not on login page

    try {
        // Always use the single shared resolver — works on real TV, emulator, and browser
        deviceIdText.innerText = DeviceInfo.getDeviceIdLabel();
    } catch (e) {
        deviceIdText.innerText = "Not available";
    }
}

function showNetworkIP() {
    var ipText = document.getElementById("ipAddressText");
    if (!ipText) return;

    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            var networkType = webapis.network.getActiveConnectionType();
            // networkType: 0 (DISCONNECTED), 1 (WIFI), 2 (CELLULAR), 3 (ETHERNET)

            if (networkType === 0) {
                ipText.innerText = "Disconnected";
                return;
            }

            var ip = webapis.network.getIp(networkType);
            if (ip) {
                ipText.innerText = ip;
            } else {
                ipText.innerText = "Not valid";
            }
        } else {
            // Fallback for Emulator/Browser
            ipText.innerText = "Web/Emulator";
        }
    } catch (e) {
        console.error("IP Fetch Error:", e);
        // Show actual error info for debugging on TV
        ipText.innerText = e.name;
    }
}


function showMacAddress() {
    var macText = document.getElementById("macAddressText");
    if (!macText) return;

    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            var mac = webapis.network.getMac();
            if (mac) {
                macText.innerText = mac;
            } else {
                macText.innerText = "Not Available";
            }
        } else {
            macText.innerText = "Web/Emulator";
        }
    } catch (e) {
        console.error("MAC Fetch Error:", e);
        macText.innerText = e.name;
    }
}

function showIPv6() {
    var ipv6Text = document.getElementById("ipv6Text");
    if (!ipv6Text) return;
    // Force fresh probe each time login info panel renders.
    DEVICE_INFO.ipv6 = "";
    DeviceInfo.detectIPv6().then(function (addr) {
        ipv6Text.innerText = addr || "Not Available";
    });
}

/**
 * Fetch and display Public IP Address
 */
function showPublicIP() {
    var publicIpText = document.getElementById("publicIpText");
    if (!publicIpText) return;

    publicIpText.innerText = "Fetching...";

    function isValidGatewayValue(ip) {
        if (!ip || typeof ip !== 'string') return false;
        var v = ip.trim();

        // Reject obvious placeholders/loopback/invalid values seen on emulators.
        if (v === '::1' || v === '0.0.0.0' || v === '0.0.0.1' || v === '127.0.0.1') return false;
        if (v.indexOf('---') !== -1) return false;

        // Accept IPv4 format only for gateway display in this screen.
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(v);
    }

    // Prefer native Samsung gateway API (real gateway value for login screen)
    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            var networkType = webapis.network.getActiveConnectionType();
            if (networkType > 0 && typeof webapis.network.getGateway === 'function') {
                var gatewayIp = webapis.network.getGateway(networkType);
                if (isValidGatewayValue(gatewayIp)) {
                    publicIpText.innerText = gatewayIp;
                    return;
                }
            }
        }
    } catch (e) {
    }

    // Try multiple public IP services
    var ipServices = [
        'https://api.ipify.org?format=json',
        'https://api64.ipify.org?format=json',
        'https://ipapi.co/json/',
        'https://api.my-ip.io/ip.json'
    ];

    function fetchWithTimeout(url, timeoutMs) {
        var timeoutPromise = new Promise(function(_, reject) {
            setTimeout(function() { reject(new Error('Timeout')); }, timeoutMs);
        });
        return Promise.race([fetch(url), timeoutPromise]);
    }

    function tryNextService(index) {
        if (index >= ipServices.length) {
            publicIpText.innerText = "N/A";
            return;
        }

        var service = ipServices[index];

        // FIXED: Increased timeout from 5s to 15s for Samsung TV network reliability
        fetchWithTimeout(service, 15000)
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .then(function (data) {
                var publicIp = data.ip || data.IPv4 || data.IP || null;
                if (publicIp) {
                    publicIpText.innerText = publicIp;
                } else {
                    throw new Error('No IP in response');
                }
            })
            .catch(function (error) {
                console.error("[PublicIP] Service failed:", service, error);
                tryNextService(index + 1);
            });
    }

    tryNextService(0);
}

/* NETWORK CHANGE LISTENER */
function startNetworkChangeListener() {
    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            webapis.network.addNetworkStateChangeListener(function (networkState) {
                // networkState: 1=LAN_CABLE_ATTACHED, 2=LAN_CABLE_DETACHED,
                //               3=LAN_CABLE_STATE_CHANGED, 4=WIFI_MODULE_STATE_CHANGED,
                //               5=GATEWAY_CONNECTED, 6=GATEWAY_DISCONNECTED

                // Small delay to let the new connection fully establish
                setTimeout(function () {
                    // Clear cached IPv6 so detectIPv6 re-detects
                    DEVICE_INFO.ipv6 = "";
                    showMacAddress();
                    showIPv6();
                    showPublicIP();
                }, 2000);
            });
        }
    } catch (e) {
    }
}

/* ERROR MODAL */
function initErrorModal() {
    var errorModal = document.getElementById("errorModal");
    if (!errorModal) return; // Not on login page

    var tryAgainBtn = document.getElementById("errorTryAgainBtn");
    var supportLink = document.getElementById("errorSupportLink");

    // Try Again button - close modal and focus on phone input
    if (tryAgainBtn) {
        tryAgainBtn.addEventListener("click", function (e) {
            e.preventDefault();
            hideErrorModal();
            initializePhoneInput();
            var phoneInput = document.getElementById("phoneInput");
            if (phoneInput) {
                phoneInput.focus();
                var phoneIdx = Array.from(focusables).indexOf(phoneInput);
                if (phoneIdx >= 0) currentFocus = phoneIdx;
            }
        });
    }

    // Contact Support link
    if (supportLink) {
        supportLink.addEventListener("click", function (e) {
            e.preventDefault();
            hideErrorModal();
            // You can add navigation to support page here
        });
    }

    // Click outside modal to close
    errorModal.addEventListener("click", function (e) {
        if (e.target === errorModal) {
            hideErrorModal();
            var phoneInput = document.getElementById("phoneInput");
            if (phoneInput) phoneInput.focus();
        }
    });
}

function showLoginError(title) {
    var titleEl = document.querySelector('#errorModal .error-title');
    if (titleEl) titleEl.textContent = title;
    showErrorModal();
}

function showErrorModal() {
    var errorModal = document.getElementById("errorModal");
    if (errorModal) {
        errorModal.classList.add("show");

        // Update focusables to include modal button
        focusables = document.querySelectorAll(".focusable");

        // Focus on Try Again button
        var tryAgainBtn = document.getElementById("errorTryAgainBtn");
        if (tryAgainBtn) {
            var index = Array.from(focusables).indexOf(tryAgainBtn);
            if (index >= 0) {
                currentFocus = index;
                tryAgainBtn.focus();
            }
        }
    }
}

function hideErrorModal() {
    var errorModal = document.getElementById("errorModal");
    if (errorModal) {
        errorModal.classList.remove("show");

        // Refresh focusables
        focusables = document.querySelectorAll(".focusable");
    }
}

/* INITIALIZE PHONE INPUT - FIX MAXLENGTH BUG */
function initializePhoneInput() {
    var phoneInput = document.getElementById("phoneInput");
    if (phoneInput) {
        // Explicitly clear the value
        phoneInput.value = "";

        // Clear any localStorage remnants
        localStorage.removeItem("temp_phone");

        // Debug log

        // Force re-render by triggering input event
        var event = new Event('input', { bubbles: true });
        phoneInput.dispatchEvent(event);
    }
}

/* NUMBER-ONLY INPUT VALIDATION */
function setupNumberOnlyInputs() {
    // Phone Input - use native Samsung numeric keypad and sanitize to digits.
    var phoneInput = document.getElementById("phoneInput");
    var getOtpBtn = document.getElementById("getOtpBtn");
    
    if (phoneInput) {
        phoneInput.setAttribute('type', 'tel');
        phoneInput.setAttribute('inputmode', 'numeric');
        phoneInput.setAttribute('pattern', '[0-9]*');
        phoneInput.setAttribute('autocomplete', 'off');

        // Keep input editable so native keypad can open on OK/Enter.
        phoneInput.readOnly = false;

        phoneInput.addEventListener('focus', function () {
            phoneInput.readOnly = false;
        });

        // Keep only digits and hard-limit to 10 characters.
        phoneInput.addEventListener("input", function () {
            this.value = String(this.value || '').replace(/\D/g, '').slice(0, 10);
            updateOtpButton();
        });

        // Helper to update OTP button state
        function updateOtpButton() {
            if (getOtpBtn) {
                var value = phoneInput.value.replace(/\D/g, '');
                if (value.length === 10) {
                    getOtpBtn.disabled = false;
                    getOtpBtn.classList.add('enabled');
                } else {
                    getOtpBtn.disabled = true;
                    getOtpBtn.classList.remove('enabled');
                }
            }
        }

        // Initial state - disable button if not 10 digits
        updateOtpButton();

    }

    // OTP Inputs - native Samsung numeric keypad + auto-advance
    var otpInputs = document.querySelectorAll(".otp-input");
    otpInputs.forEach(function (input, idx) {
        input.setAttribute('type', 'tel');
        input.setAttribute('inputmode', 'numeric');
        input.setAttribute('pattern', '[0-9]');
        input.setAttribute('autocomplete', 'off');

        // Keep editable so native Samsung numeric keypad can open on OK.
        input.readOnly = false;
        input.removeAttribute('maxlength');

        // Ensure field remains editable when focused.
        input.addEventListener('focus', function () {
            input.readOnly = false;
        });

        // Keep only one numeric digit and auto-advance.
        input.addEventListener('input', function () {
            input.value = String(input.value || '').replace(/[^0-9]/g, '').slice(0, 1);
            if (input.value.length === 1 && idx < 3) {
                var next = document.querySelectorAll('.otp-input')[idx + 1];
                if (next) {
                    next.focus();
                    var focusIndex = Array.from(focusables).indexOf(next);
                    if (focusIndex >= 0) currentFocus = focusIndex;
                }
            }
        });

        // Handle backspace navigation only when current input is empty.
        input.addEventListener("keydown", function (e) {
            if (e.keyCode === 8 && this.value.length === 0) {
                e.preventDefault();
                if (idx > 0) {
                    var prev = document.querySelectorAll(".otp-input")[idx - 1];
                    if (prev) {
                        prev.focus();
                        currentFocus = Array.from(focusables).indexOf(prev);
                        if (currentFocus < 0) currentFocus = idx - 1;
                    }
                }
            }
        });

    });
}

function deactivateOTPInputEditing() {
    var otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach(function (input) {
        input.readOnly = false;
    });
}

function activateOTPInput(input) {
    if (!input) return;
    deactivateOTPInputEditing();
    // Keep editable so native Samsung keypad can open.
    input.readOnly = false;
    input.focus();
}

/* REMOTE CONTROL KEYS */
/* REMOTE CONTROL KEYS */
document.addEventListener("keydown", function (e) {
    var active = document.activeElement;
    var isInput = active.tagName === 'INPUT';

    // ALLOW DEFAULT BEHAVIOR FOR INPUTS
    if (isInput) {
        // OTP Input: allow native Samsung keypad and handle navigation keys only.
        if (active.classList.contains('otp-input')) {
            if ((e.keyCode >= 48 && e.keyCode <= 57) || (e.keyCode >= 96 && e.keyCode <= 105)) {
                return;
            } else if (e.keyCode === 8) {
                // Let native backspace work; setupNumberOnlyInputs handles previous-field hop when empty.
                return;
            } else if (e.keyCode === 13) {
                // Enter/OK should open native numeric keypad.
                active.readOnly = false;
                return;
            } else if (e.keyCode === 37) {
                // LEFT arrow - move to previous OTP input
                e.preventDefault();
                var currentId = active.id;
                var idx = parseInt(currentId.replace('otp', ''));
                if (idx > 1) {
                    var prev = document.getElementById('otp' + (idx - 1));
                    if (prev) {
                        activateOTPInput(prev);
                        var focusIndex = Array.from(focusables).indexOf(prev);
                        if (focusIndex >= 0) currentFocus = focusIndex;
                    }
                }
                return;
            } else if (e.keyCode === 39) {
                // RIGHT arrow - move to next OTP input or verify button
                e.preventDefault();
                var currentId = active.id;
                var idx = parseInt(currentId.replace('otp', ''));
                if (idx < 4) {
                    var next = document.getElementById('otp' + (idx + 1));
                    if (next) {
                        activateOTPInput(next);
                        var focusIndex = Array.from(focusables).indexOf(next);
                        if (focusIndex >= 0) currentFocus = focusIndex;
                    }
                } else {
                    deactivateOTPInputEditing();
                    var verifyBtn = document.getElementById('verifyBtn');
                    if (verifyBtn) {
                        verifyBtn.focus();
                        var focusIndex = Array.from(focusables).indexOf(verifyBtn);
                        if (focusIndex >= 0) currentFocus = focusIndex;
                    }
                }
                return;
            } else if (e.keyCode === 40) {
                // DOWN arrow - move downward to Verify button
                e.preventDefault();
                deactivateOTPInputEditing();
                // Explicitly blur OTP input so TV keypad does not remain active.
                if (typeof active.blur === 'function') active.blur();
                var verifyBtnDown = document.getElementById('verifyBtn');
                if (verifyBtnDown) {
                    verifyBtnDown.focus();
                    var verifyIndex = Array.from(focusables).indexOf(verifyBtnDown);
                    if (verifyIndex >= 0) currentFocus = verifyIndex;
                }
                return;
            } else if (e.keyCode === 38) {
                // UP arrow - keep focus in OTP area.
                e.preventDefault();
                return;
            } else {
                // Let system handle other keys.
                return;
            }
        } else if (active.id === 'phoneInput') {
            // Enter/OK on phone input should open Samsung native numeric keypad.
            if (e.keyCode === 13) {
                active.readOnly = false;
                return;
            }

            // Arrow keys: navigate to other focusable elements
            if (e.keyCode === 38 || e.keyCode === 40 || e.keyCode === 37 || e.keyCode === 39) {
                e.preventDefault();
                if (e.keyCode === 40 || e.keyCode === 39) {
                    // DOWN or RIGHT - move to next focusable element
                    moveFocus(1);
                } else {
                    // UP or LEFT - move to previous focusable element
                    moveFocus(-1);
                }
                return;
            }

            // Allow native input handling for digits/backspace/delete.
            if ((e.keyCode >= 48 && e.keyCode <= 57) ||
                (e.keyCode >= 96 && e.keyCode <= 105) ||
                e.keyCode === 8 || e.keyCode === 46) {
                return;
            }
        } else {
            // Other Inputs: Let System Handle Everything
            if ((e.keyCode >= 48 && e.keyCode <= 57) ||
                (e.keyCode >= 96 && e.keyCode <= 105) ||
                e.keyCode === 8 || e.keyCode === 13) {
                return;
            }
        }
    }

    switch (e.keyCode) {
        case 38: // UP Arrow
            e.preventDefault();
            moveFocus(-1);
            break;
        case 40: // DOWN Arrow
            e.preventDefault();
            moveFocus(1);
            break;
        case 37: // LEFT Arrow
            e.preventDefault();
            moveFocus(-1);
            break;
        case 39: // RIGHT Arrow
            e.preventDefault();
            moveFocus(1);
            break;
        case 13: // ENTER / OK
            e.preventDefault();
            handleOK();
            break;
        case 10009: // BACK (Tizen specific)
            // Check if error modal is open
            var errorModal = document.getElementById("errorModal");
            if (errorModal && errorModal.classList.contains("show")) {
                e.preventDefault();
                hideErrorModal();
                initializePhoneInput();
                var phoneInput = document.getElementById("phoneInput");
                if (phoneInput) {
                    phoneInput.focus();
                    var phoneIdx = Array.from(focusables).indexOf(phoneInput);
                    if (phoneIdx >= 0) currentFocus = phoneIdx;
                }
            } else if (isInput) {
                active.blur(); // Hide keyboard if open
                e.preventDefault(); // Prevent app exit if keyboard was just open
            } else {
                e.preventDefault();
                window.history.back();
            }
            break;
        default:
            break;
    }
});

function moveFocus(step) {
    if (focusables.length === 0) return;

    var next = currentFocus + step;

    // Wrap around or clamp
    if (next < 0) next = 0;
    if (next >= focusables.length) next = focusables.length - 1;

    if (next !== currentFocus) {
        currentFocus = next;
        focusables[currentFocus].focus();
    }
}

function handleOK() {
    var active = document.activeElement;

    // Login page guard: if nothing meaningful is focused, OK should focus phone input.
    if (document.getElementById('phoneInput')) {
        if (!active || active === document.body || active === document.documentElement) {
            if (focusLoginPhoneInput()) return;
        }
    }

    // ERROR MODAL: Try Again Button
    if (active.id === "errorTryAgainBtn") {
        hideErrorModal();

        // Properly clear and reinitialize phone input
        initializePhoneInput();

        // Set focus and sync currentFocus
        var phoneInput = document.getElementById("phoneInput");
        if (phoneInput) {
            phoneInput.focus();
            var phoneIdx = Array.from(focusables).indexOf(phoneInput);
            if (phoneIdx >= 0) currentFocus = phoneIdx;
        }

        return;
    }

    // LANDING PAGE: Start Watching Button
    if (active.id === "proceedBtn") {
        window.__BBNL_NAVIGATING = true;
        window.location.href = "login.html";
        return;
    }

    // LOGIN PAGE: Get OTP Button
    if (active.id === "getOtpBtn") {
        // Prevent duplicate OTP requests
        if (otpRequestInProgress) {
            return;
        }

        // Timestamp-based cooldown (10s) - prevents double-fire from TV remote quirks
        var now = Date.now();
        if (now - lastOtpRequestTime < 10000) {
            return;
        }

        var phoneInput = document.getElementById("phoneInput");
        var val = phoneInput ? phoneInput.value : "";

        if (val.length === 10) {

            // Set flag and timestamp to prevent duplicate requests
            otpRequestInProgress = true;
            lastOtpRequestTime = now;

            // Show loading state and disable button
            var btn = document.getElementById("getOtpBtn");
            var originalText = btn.innerText;
            btn.innerText = "Sending OTP...";
            btn.disabled = true;
            btn.classList.remove('enabled');

            // Call actual API - SINGLE CALL ONLY
            // User enters mobile number; real userid comes from API response
            // Ensure public IP is ready before login API call
            var ipWait = (typeof DeviceInfo !== 'undefined' && DeviceInfo.ensurePublicIP)
                ? DeviceInfo.ensurePublicIP(3000)
                : Promise.resolve();

            ipWait.then(function () { return AuthAPI.requestOTP(val); })
                .then(function (response) {

                    // Check response
                    if (response && response.status && Number(response.status.err_code) === 0) {
                        // Keep button disabled and flag set - we're navigating away

                        // Store full response for setSession after OTP verification
                        // Do NOT call setSession here — it sets bbnl_user which triggers early auth redirect
                        sessionStorage.setItem('_pendingSession', JSON.stringify(response));

                        // Store OTP for client-side verification on verify page
                        var serverOTP = "";
                        if (response.body && response.body.length > 0 && response.body[0].otpcode) {
                            serverOTP = String(response.body[0].otpcode);
                        }
                        sessionStorage.setItem('_pendingOTP', serverOTP);
                        sessionStorage.setItem('_pendingMobile', val);

                        // Navigate to verify page (mobile passed via sessionStorage, not URL)
                        window.__BBNL_NAVIGATING = true;
                        window.location.href = "verify.html";
                    } else {
                        // Reset flag and button on error
                        otpRequestInProgress = false;
                        btn.innerText = originalText;
                        btn.disabled = false;
                        btn.classList.add('enabled');

                        console.error("[Login] OTP request failed:", response);
                        var errTitle = "Invalid User ID";
                        if (response && response.status && response.status.err_msg) {
                            var apiMsg = String(response.status.err_msg).trim();
                            if (apiMsg) errTitle = apiMsg;
                        }
                        showLoginError(errTitle);
                    }
                })
                .catch(function (error) {
                    console.error("[Login] ❌ OTP request error:", error);
                    otpRequestInProgress = false;
                    btn.innerText = originalText;
                    btn.disabled = false;
                    btn.classList.add('enabled');
                    showLoginError("Connection Error");
                });
        } else {
            // Show error modal for invalid phone number length
            showErrorModal();
        }
        return;
    }



    // VERIFY PAGE: Verify Button (if exists)
    if (active.id === "verifyBtn") {
        // Prevent duplicate clicks
        if (otpVerifyInProgress) {
            return;
        }

        var fullOTP = "";
        for (var i = 1; i <= 4; i++) {
            var val = document.getElementById('otp' + i).value;
            if (val) fullOTP += val;
        }


        if (fullOTP.length === 4) {
            otpVerifyInProgress = true;

            // Get mobile from sessionStorage (not URL, for security)
            var mobile = sessionStorage.getItem('_pendingMobile') || "";

            // If mobile is missing, redirect back to login
            if (!mobile) {
                console.error("[Verify] Missing mobile - redirecting to login");
                window.__BBNL_NAVIGATING = true;
                window.location.replace("login.html");
                return;
            }

            // Show loading state
            var btn = document.getElementById("verifyBtn");
            btn.innerText = "Verifying...";
            btn.disabled = true;

            // CLIENT-SIDE OTP VERIFICATION (no second API call)
            var storedOTP = sessionStorage.getItem('_pendingOTP') || "";

            if (storedOTP && fullOTP === storedOTP) {
                // OTP matches — now save session (only after OTP verified)
                var pendingSession = sessionStorage.getItem('_pendingSession');
                if (pendingSession) {
                    try { AuthAPI.setSession(JSON.parse(pendingSession)); } catch (e) {}
                }
                localStorage.setItem('_pendingOTP', ''); // Clear pending OTP safely
                localStorage.setItem('hasLoggedInOnce', 'true');
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('mobile', mobile);
                localStorage.setItem('loginTime', new Date().toISOString());
                
                // Ensure backup is also set immediately via setSession logic
                // No manual backup needed here as AuthAPI.setSession already manages it properly
                window.__BBNL_NAVIGATING = true;
                window.location.replace("home.html");
            } else {
                otpVerifyInProgress = false;
                btn.innerText = "Verify";
                btn.disabled = false;
                showErrorPopup("Invalid OTP");
                for (var j = 1; j <= 4; j++) {
                    document.getElementById('otp' + j).value = '';
                }
                var otp1 = document.getElementById('otp1');
                if (otp1) otp1.focus();
            }
        } else {
            showErrorPopup("Please enter full 4-digit OTP");
        }
        return;
    }

    // VERIFY PAGE: Resend OTP Button
    if (active.id === "resendOtpBtn") {
        handleResendOTP();
        return;
    }

}

/* ================================
   OTP VERIFICATION PAGE
   ================================ */

var otpCode = ["", "", "", ""];  // Changed from 6 to 4
var currentOtpIndex = 0;

// Initialize OTP page if we're on verify.html
window.addEventListener('load', function () {
    var otpContainer = document.querySelector('.otp-container'); // Changed from getElementById to querySelector to match verify.html class
    // actually verify.html has <div class="otp-container"> but no ID.
    // The previous code checked for element with ID 'otpContainer'. 
    // Let's check if verifyBtn exists which is safer for verify page detection
    if (document.getElementById('verifyBtn')) {
        initOTPPage();
    }
});

function initOTPPage() {
    // Initialize popup handlers
    initPopupHandlers();

    // Add input handlers to OTP inputs for auto-advance
    var otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach(function (input, index) {
        input.readOnly = false;
        input.removeAttribute('maxlength');

        // Handle native keyboard input (and remote keys that trigger input)
        input.addEventListener('input', function () {
            input.value = String(input.value || '').replace(/[^0-9]/g, '').slice(0, 1);
            if (input.value.length === 1) {
                if (index < otpInputs.length - 1) {
                    activateOTPInput(otpInputs[index + 1]);
                }
            }
        });

        // Handle Backspace for navigation
        input.addEventListener('keydown', function (e) {
            if (e.keyCode === 8) { // Backspace
                if (input.value.length === 0 && index > 0) {
                    e.preventDefault();
                    activateOTPInput(otpInputs[index - 1]);
                }
            }
        });

        // Click to focus
        input.addEventListener('click', function () {
            currentOtpIndex = index;
            activateOTPInput(input);
        });
    });

    var firstOtpInput = document.getElementById('otp1');
    if (firstOtpInput) {
        setTimeout(function () {
            firstOtpInput.focus();
            var firstIdx = Array.from(focusables).indexOf(firstOtpInput);
            if (firstIdx >= 0) currentFocus = firstIdx;
        }, 60);
    }

}



// Clear all OTP inputs and reset focus to first input
function clearOTPInputs() {
    for (var i = 1; i <= 4; i++) {
        var input = document.getElementById('otp' + i);
        if (input) {
            input.value = '';
        }
    }

    // Reset focus to first OTP input
    var firstInput = document.getElementById('otp1');
    if (firstInput) {
        setTimeout(function () {
            deactivateOTPInputEditing();
            firstInput.focus();
        }, 100);
    }
}

// ==========================================
// RESEND OTP - 30s countdown timer + button
// ==========================================
var resendTimerInterval = null;
var resendInProgress = false;

function initResendOTPTimer() {
    var timerEl = document.getElementById('resendTimer');
    var countdownEl = document.getElementById('resendCountdown');
    var resendBtn = document.getElementById('resendOtpBtn');

    if (!timerEl || !resendBtn) return; // Not on verify page

    var seconds = 30;
    countdownEl.innerText = seconds;
    timerEl.style.display = '';
    resendBtn.style.display = 'none';

    if (resendTimerInterval) clearInterval(resendTimerInterval);

    resendTimerInterval = setInterval(function () {
        seconds--;
        countdownEl.innerText = seconds;
        if (seconds <= 0) {
            clearInterval(resendTimerInterval);
            resendTimerInterval = null;
            timerEl.style.display = 'none';
            resendBtn.style.display = '';
        }
    }, 1000);
}

function handleResendOTP() {
    if (resendInProgress) return;

    var mobile = sessionStorage.getItem('_pendingMobile') || "";
    if (!mobile) return;

    var resendBtn = document.getElementById('resendOtpBtn');
    if (!resendBtn) return;

    resendInProgress = true;
    resendBtn.innerText = "Sending...";
    resendBtn.disabled = true;

    AuthAPI.resendOTP(mobile)
        .then(function (response) {
            resendInProgress = false;
            resendBtn.innerText = "Resend OTP";
            resendBtn.disabled = false;

            if (response && response.status && Number(response.status.err_code) === 0) {

                // FIXED: Store the new OTP from the response (replace old OTP)
                var newOTP = "";
                if (response.body && response.body.length > 0 && response.body[0].otpcode) {
                    newOTP = String(response.body[0].otpcode);
                }
                // Clear old OTP first, then store new one
                sessionStorage.removeItem('_pendingOTP');
                if (newOTP) {
                    sessionStorage.setItem('_pendingOTP', newOTP);
                }

                // Clear OTP inputs for fresh entry
                clearOTPInputs();
                // Restart 30s timer
                initResendOTPTimer();
            } else {
                var errorMsg = response.status ? response.status.err_msg : "Failed to resend OTP";
                showErrorPopup(errorMsg);
            }
        })
        .catch(function (error) {
            console.error("[Verify] Resend OTP error:", error);
            resendInProgress = false;
            resendBtn.innerText = "Resend OTP";
            resendBtn.disabled = false;
            showErrorPopup("Network error. Please check your connection.");
        });
}

// Show Error Popup with proper focus management
function showErrorPopup(errorMessage) {
    var popup = document.getElementById('errorPopup');
    var message = document.getElementById('errorPopupMessage');
    var title = document.getElementById('errorPopupTitle');
    var closeBtn = document.getElementById('errorPopupCloseBtn');
    var authCard = document.querySelector('.auth-card');

    if (popup && message) {
        // Set appropriate title based on error type
        if (title) {
            if (errorMessage && errorMessage.toLowerCase().indexOf('network') !== -1) {
                title.textContent = 'Network Error';
            } else if (errorMessage && errorMessage.toLowerCase().indexOf('incomplete') !== -1) {
                title.textContent = 'Incomplete OTP';
            } else {
                title.textContent = 'Invalid OTP';
            }
        }
        message.textContent = errorMessage || 'The OTP you entered is incorrect. Please try again.';
        popup.style.display = 'flex';

        // Disable background interaction
        if (authCard) {
            authCard.style.pointerEvents = 'none';
            authCard.style.opacity = '0.5';
        }

        // Lock focus on popup - disable all other focusables
        disableBackgroundFocusables();

        // Focus on close button for TV remote navigation
        if (closeBtn) {
            setTimeout(function () {
                closeBtn.focus();
            }, 150);
        }
    }
}

// Hide Error Popup with proper focus restoration
function hideErrorPopup() {
    var popup = document.getElementById('errorPopup');
    var authCard = document.querySelector('.auth-card');

    if (popup) {
        popup.style.display = 'none';

        // Re-enable background interaction
        if (authCard) {
            authCard.style.pointerEvents = 'auto';
            authCard.style.opacity = '1';
        }

        // Re-enable background focusables
        enableBackgroundFocusables();

        // Clear OTP inputs and return focus to first input
        clearOTPInputs();
    }
}

// Disable all background focusables when popup is open
function disableBackgroundFocusables() {
    var otpInputs = document.querySelectorAll('.otp-input');
    var verifyBtn = document.getElementById('verifyBtn');

    otpInputs.forEach(function (input) {
        input.setAttribute('data-was-focusable', 'true');
        input.tabIndex = -1;
        input.disabled = true;
    });

    if (verifyBtn) {
        verifyBtn.setAttribute('data-was-focusable', 'true');
        verifyBtn.tabIndex = -1;
        verifyBtn.disabled = true;
    }

}

// Re-enable all background focusables when popup closes
function enableBackgroundFocusables() {
    var otpInputs = document.querySelectorAll('.otp-input');
    var verifyBtn = document.getElementById('verifyBtn');

    otpInputs.forEach(function (input) {
        if (input.getAttribute('data-was-focusable')) {
            input.tabIndex = 0;
            input.disabled = false;
            input.removeAttribute('data-was-focusable');
        }
    });

    if (verifyBtn && verifyBtn.getAttribute('data-was-focusable')) {
        verifyBtn.tabIndex = 0;
        verifyBtn.disabled = false;
        verifyBtn.removeAttribute('data-was-focusable');
    }

}

// Initialize popup close handlers
function initPopupHandlers() {
    var errorCloseBtn = document.getElementById('errorPopupCloseBtn');

    if (errorCloseBtn) {
        errorCloseBtn.addEventListener('click', function (e) {
            e.preventDefault();
            hideErrorPopup();
        });
        errorCloseBtn.addEventListener('keydown', function (e) {
            if (e.keyCode === 13 || e.keyCode === 10009) { // Enter or Back key
                e.preventDefault();
                hideErrorPopup();
            }
        });
    }

    // Close popup on overlay click (but not on container click)
    var errorPopup = document.getElementById('errorPopup');

    if (errorPopup) {
        errorPopup.addEventListener('click', function (e) {
            if (e.target === errorPopup) {
                e.preventDefault();
                hideErrorPopup();
            }
        });
    }

}


