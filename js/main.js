/* ================================
   BBNL IPTV – CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;
var otpRequestInProgress = false; // Flag to prevent duplicate OTP requests
var otpVerifyInProgress = false; // Flag to prevent duplicate OTP verification
var lastOtpRequestTime = 0; // Timestamp of last OTP request (prevents double-fire from TV remote quirks)

// Check authentication on page load - redirect logged in users away from auth pages
(function checkAuthRedirect() {
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    var authPages = ['index.html', 'login.html', 'verify.html', ''];
    var isAuthPage = authPages.indexOf(currentPage) !== -1;

    // If user has logged in before, skip login pages and go to home
    if (isAuthPage) {
        var hasLoggedInOnce = localStorage.getItem("hasLoggedInOnce");
        if (hasLoggedInOnce === "true") {
            console.log("[Auth] User has logged in before, redirecting to home...");
            window.location.replace("home.html");
            return;
        }
    }
})();

/* INIT */
window.onload = function () {
    console.log("=== BBNL IPTV Initialized ===");

    // 1. Select Focusables
    focusables = document.querySelectorAll(".focusable");
    console.log("Found focusable elements:", focusables.length);

    // 2. Set Initial Focus
    if (focusables.length > 0) {
        currentFocus = 0;
        focusables[0].focus();
        console.log("Initial focus set to:", focusables[0].id || focusables[0].className);
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
        console.log("Adding listeners to:", el.id || el.className);

        // Track focus on hover to sync with remote state
        el.addEventListener("mouseenter", function () {
            currentFocus = index;
            el.focus();
        });

        // Handle mouse clicks
        el.addEventListener("click", function (e) {
            console.log("Click detected on:", el.id || el.className);
            e.preventDefault();
            handleOK();
        });
    });

    // 5. Add Number Pad Button Handlers
    var numButtons = document.querySelectorAll('.num-btn');
    numButtons.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            var value = btn.getAttribute('data-value');
            handleNumberPadInput(value);
        });
    });

    // 6. Initialize Error Modal (if on login page)
    initErrorModal();

    // 7. Register All Remote Keys (supports all Samsung remote types)
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            var keys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
                "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
                "Enter", "Return"];
            tizen.tvinputdevice.registerKeyBatch(keys);
            console.log("Tizen keys registered (fallback)");
        } catch (e) {
            console.log("Not running on Tizen or key registration failed");
        }
    }

    // 8. Add Number-Only Validation for Phone and OTP inputs
    setupNumberOnlyInputs();

    // 9. Initialize phone input (clear any residual values)
    initializePhoneInput();
};

/* DEVICE ID */
function showDeviceId() {
    var deviceIdText = document.getElementById("deviceIdText");
    if (!deviceIdText) return; // Not on login page

    try {
        if (typeof webapis !== 'undefined' && webapis.productinfo) {
            var duid = webapis.productinfo.getDuid();
            deviceIdText.innerText = duid;
        } else {
            deviceIdText.innerText = "Emulator / Web";
        }
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
            console.log("Network Type:", networkType);

            if (networkType === 0) {
                ipText.innerText = "Disconnected";
                return;
            }

            var ip = webapis.network.getIp(networkType);
            if (ip) {
                ipText.innerText = ip;
                console.log("Device IP:", ip);
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
                console.log("Device MAC:", mac);
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
            console.log("[PublicIP] All services failed");
            return;
        }

        var service = ipServices[index];
        console.log("[PublicIP] Trying service:", service);

        fetchWithTimeout(service, 5000)
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .then(function (data) {
                var publicIp = data.ip || data.IPv4 || data.IP || null;
                if (publicIp) {
                    publicIpText.innerText = publicIp;
                    console.log("[PublicIP] Success:", publicIp);
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
                console.log("[Network] State changed:", networkState);

                // Small delay to let the new connection fully establish
                setTimeout(function () {
                    // Clear cached IPv6 so detectIPv6 re-detects
                    DEVICE_INFO.ipv6 = "";
                    showMacAddress();
                    showIPv6();
                    showPublicIP();
                    console.log("[Network] MAC, IPv6, and Public IP refreshed after network change");
                }, 2000);
            });
            console.log("[Network] Network change listener registered");
        }
    } catch (e) {
        console.warn("[Network] Could not register network listener:", e.message);
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
            var phoneInput = document.getElementById("phoneInput");
            if (phoneInput) {
                phoneInput.value = "";
                phoneInput.focus();
            }
        });
    }

    // Contact Support link
    if (supportLink) {
        supportLink.addEventListener("click", function (e) {
            e.preventDefault();
            hideErrorModal();
            // You can add navigation to support page here
            alert("Please contact support at: support@bbnl.co.in");
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
        console.log("[PhoneInput] Initialized - Length:", phoneInput.value.length);
        console.log("[PhoneInput] Value:", phoneInput.value);

        // Force re-render by triggering input event
        var event = new Event('input', { bubbles: true });
        phoneInput.dispatchEvent(event);
    }
}

/* NUMBER-ONLY INPUT VALIDATION */
function setupNumberOnlyInputs() {
    // Phone Input - only allow numbers
    var phoneInput = document.getElementById("phoneInput");
    var getOtpBtn = document.getElementById("getOtpBtn");
    
    if (phoneInput) {
        // Block non-numeric keypress
        phoneInput.addEventListener("keypress", function (e) {
            var charCode = e.which || e.keyCode;
            // Allow only 0-9 (charCode 48-57)
            if (charCode < 48 || charCode > 57) {
                e.preventDefault();
                return false;
            }
        });

        // Filter on input (for paste/auto-fill) + validate 10 digits for OTP button
        phoneInput.addEventListener("input", function (e) {
            this.value = this.value.replace(/[^0-9]/g, '');
            
            // Enable/disable Get OTP button based on 10 digit validation
            if (getOtpBtn) {
                var value = this.value.replace(/\D/g, '');
                if (value.length === 10) {
                    getOtpBtn.disabled = false;
                    getOtpBtn.classList.add('enabled');
                } else {
                    getOtpBtn.disabled = true;
                    getOtpBtn.classList.remove('enabled');
                }
            }
        });
        
        // Initial state - disable button if not 10 digits
        if (getOtpBtn) {
            var initialValue = phoneInput.value.replace(/\D/g, '');
            if (initialValue.length !== 10) {
                getOtpBtn.disabled = true;
                getOtpBtn.classList.remove('enabled');
            } else {
                getOtpBtn.disabled = false;
                getOtpBtn.classList.add('enabled');
            }
        }

        console.log("Phone input: number-only validation + 10-digit OTP validation enabled");
    }

    // OTP Inputs - only allow numbers + auto-advance
    var otpInputs = document.querySelectorAll(".otp-input");
    otpInputs.forEach(function (input, idx) {
        // Block non-numeric keypress
        input.addEventListener("keypress", function (e) {
            var charCode = e.which || e.keyCode;
            // Allow only 0-9 (charCode 48-57)
            if (charCode < 48 || charCode > 57) {
                e.preventDefault();
                return false;
            }
        });

        // Filter and auto-advance on input
        input.addEventListener("input", function (e) {
            // Remove non-numeric characters
            this.value = this.value.replace(/[^0-9]/g, '');

            // If digit entered, auto-advance to next input
            if (this.value.length === 1) {
                var currentId = this.id;
                var currentIdx = parseInt(currentId.replace('otp', ''));

                if (currentIdx < 4) {
                    var next = document.getElementById('otp' + (currentIdx + 1));
                    if (next) {
                        next.focus();
                        // Update currentFocus to keep in sync
                        var focusIndex = Array.from(focusables).indexOf(next);
                        if (focusIndex >= 0) currentFocus = focusIndex;
                    }
                } else {
                    // After 4th digit, focus verify button
                    var verifyBtn = document.getElementById('verifyBtn');
                    if (verifyBtn) {
                        verifyBtn.focus();
                        var focusIndex = Array.from(focusables).indexOf(verifyBtn);
                        if (focusIndex >= 0) currentFocus = focusIndex;
                    }
                }
            }
        });

        console.log("OTP input " + (idx + 1) + ": number-only validation + auto-advance enabled");
    });
}

/* REMOTE CONTROL KEYS */
/* REMOTE CONTROL KEYS */
document.addEventListener("keydown", function (e) {
    var active = document.activeElement;
    var isInput = active.tagName === 'INPUT';

    console.log("Key pressed - Code:", e.keyCode, "Active:", active.id);

    // ALLOW DEFAULT BEHAVIOR FOR INPUTS
    if (isInput) {
        // Special Handling for OTP Inputs: Allow continuous remote entry
        if (active.classList.contains('otp-input')) {
            if ((e.keyCode >= 48 && e.keyCode <= 57) || (e.keyCode >= 96 && e.keyCode <= 105)) {
                // Digit keys - falls through to default case for manual handling
            } else if (e.keyCode === 8) {
                // Backspace - allow with navigation
                e.preventDefault();
                var currentId = active.id;
                var idx = parseInt(currentId.replace('otp', ''));
                if (active.value.length === 0 && idx > 1) {
                    var prev = document.getElementById('otp' + (idx - 1));
                    if (prev) {
                        prev.focus();
                        var focusIndex = Array.from(focusables).indexOf(prev);
                        if (focusIndex >= 0) currentFocus = focusIndex;
                    }
                } else {
                    active.value = '';
                }
                return;
            } else if (e.keyCode === 13) {
                // Enter on OTP input - prevent form submit and trigger verification
                e.preventDefault();
                e.stopImmediatePropagation();
                // Check if all 4 OTP digits are filled, then auto-verify
                var allFilled = true;
                var fullOTP = "";
                for (var oi = 1; oi <= 4; oi++) {
                    var otpVal = document.getElementById('otp' + oi);
                    if (otpVal && otpVal.value) {
                        fullOTP += otpVal.value;
                    } else {
                        allFilled = false;
                    }
                }
                if (allFilled && fullOTP.length === 4) {
                    // Focus verify button and trigger verification
                    var vBtn = document.getElementById('verifyBtn');
                    if (vBtn) {
                        vBtn.focus();
                        var vIdx = Array.from(focusables).indexOf(vBtn);
                        if (vIdx >= 0) currentFocus = vIdx;
                        handleOK();
                    }
                }
                return;
            } else if (e.keyCode === 37) {
                // LEFT arrow - move to previous OTP input
                e.preventDefault();
                var currentId = active.id;
                var idx = parseInt(currentId.replace('otp', ''));
                if (idx > 1) {
                    var prev = document.getElementById('otp' + (idx - 1));
                    if (prev) {
                        prev.focus();
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
                        next.focus();
                        var focusIndex = Array.from(focusables).indexOf(next);
                        if (focusIndex >= 0) currentFocus = focusIndex;
                    }
                } else {
                    var verifyBtn = document.getElementById('verifyBtn');
                    if (verifyBtn) {
                        verifyBtn.focus();
                        var focusIndex = Array.from(focusables).indexOf(verifyBtn);
                        if (focusIndex >= 0) currentFocus = focusIndex;
                    }
                }
                return;
            } else if (e.keyCode === 38 || e.keyCode === 40) {
                // UP/DOWN arrows - allow to navigate out of OTP row
                // Falls through to switch statement
            } else {
                // Ignore other keys
                return;
            }
        } else if (active.id === 'phoneInput') {
            // Phone Input: Handle remote number keys manually
            var digit = -1;

            // Standard number keys (0-9)
            if (e.keyCode >= 48 && e.keyCode <= 57) digit = e.keyCode - 48;
            // Numpad keys
            if (e.keyCode >= 96 && e.keyCode <= 105) digit = e.keyCode - 96;
            // Samsung TV Remote number keys (varies by remote model)
            // BN59-01180A and similar remotes use these codes
            if (e.key >= '0' && e.key <= '9') digit = parseInt(e.key);

            if (digit !== -1) {
                e.preventDefault();
                console.log("Remote number key pressed:", digit);
                // Append digit to phone input (max 10 digits)
                if (active.value.length < 10) {
                    active.value += digit;
                    // Trigger input event for listeners
                    var inputEvent = new Event('input', { bubbles: true });
                    active.dispatchEvent(inputEvent);
                }
                return;
            }

            // Backspace - clear last digit
            if (e.keyCode === 8) {
                return; // Let default handle it
            }

            // Enter - submit OTP request (only if 10 digits and not already in progress)
            if (e.keyCode === 13) {
                e.preventDefault();
                e.stopImmediatePropagation();
                var getOtpBtn = document.getElementById('getOtpBtn');
                var cooldownOk = (Date.now() - lastOtpRequestTime) >= 10000;
                if (getOtpBtn && !getOtpBtn.disabled && !otpRequestInProgress && cooldownOk && active.value.length === 10) {
                    console.log("[Login] Enter pressed on phone input - triggering OTP request");
                    // Disable button immediately to prevent any race condition
                    getOtpBtn.disabled = true;
                    currentFocus = Array.from(focusables).indexOf(getOtpBtn);
                    getOtpBtn.focus();
                    handleOK();
                }
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
            console.log("ENTER pressed - calling handleOK()");
            handleOK();
            break;
        case 10009: // BACK (Tizen specific)
            // Check if error modal is open
            var errorModal = document.getElementById("errorModal");
            if (errorModal && errorModal.classList.contains("show")) {
                e.preventDefault();
                hideErrorModal();
                var phoneInput = document.getElementById("phoneInput");
                if (phoneInput) phoneInput.focus();
            } else if (isInput) {
                active.blur(); // Hide keyboard if open
                e.preventDefault(); // Prevent app exit if keyboard was just open
            } else {
                e.preventDefault();
                console.log("Back Pressed - Navigating History");
                window.history.back();
            }
            break;
        default:
            // MANUAL OTP NUMBER HANDLER
            if (isInput && active.classList.contains('otp-input')) {
                var digit = -1;
                if (e.keyCode >= 48 && e.keyCode <= 57) digit = e.keyCode - 48;
                if (e.keyCode >= 96 && e.keyCode <= 105) digit = e.keyCode - 96;

                if (digit !== -1) {
                    e.preventDefault();
                    console.log("Manual OTP Entry:", digit);
                    active.value = digit;

                    // Trigger input event for listeners
                    var inputEvent = new Event('input', { bubbles: true });
                    active.dispatchEvent(inputEvent);

                    // Move Focus Logic - OTP has 4 digits
                    var currentId = active.id; // otp1
                    var idx = parseInt(currentId.replace('otp', ''));
                    if (idx < 4) {
                        var next = document.getElementById('otp' + (idx + 1));
                        if (next) {
                            next.focus();
                            // Update currentFocus to keep in sync
                            var focusIndex = Array.from(focusables).indexOf(next);
                            if (focusIndex >= 0) currentFocus = focusIndex;
                        }
                    } else {
                        // After 4th digit, focus verify button
                        var verifyBtn = document.getElementById('verifyBtn');
                        if (verifyBtn) {
                            verifyBtn.focus();
                            var focusIndex = Array.from(focusables).indexOf(verifyBtn);
                            if (focusIndex >= 0) currentFocus = focusIndex;
                        }
                    }
                }
            }
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
        console.log("Focus moved to:", focusables[currentFocus].id || focusables[currentFocus].className);
    }
}

function handleOK() {
    var active = document.activeElement;
    console.log("handleOK called - Active element:", active.id || active.className);

    // Check if it's a number pad button
    if (active.classList && active.classList.contains('num-btn')) {
        var value = active.getAttribute('data-value');
        console.log("Number pad button pressed:", value);
        handleNumberPadInput(value);
        return;
    }

    // ERROR MODAL: Try Again Button
    if (active.id === "errorTryAgainBtn") {
        hideErrorModal();

        // Properly clear and reinitialize phone input
        initializePhoneInput();

        // Set focus
        var phoneInput = document.getElementById("phoneInput");
        if (phoneInput) {
            phoneInput.focus();
        }

        console.log("[ErrorModal] Try Again - Phone input cleared and reinitialized");
        return;
    }

    // LANDING PAGE: Start Watching Button
    if (active.id === "proceedBtn") {
        console.log("Navigating to login.html");
        window.location.href = "login.html";
        return;
    }

    // LOGIN PAGE: Get OTP Button
    if (active.id === "getOtpBtn") {
        // Prevent duplicate OTP requests
        if (otpRequestInProgress) {
            console.log("[Login] ⚠️ OTP request already in progress, ignoring duplicate click");
            return;
        }

        // Timestamp-based cooldown (10s) - prevents double-fire from TV remote quirks
        var now = Date.now();
        if (now - lastOtpRequestTime < 10000) {
            console.log("[Login] ⚠️ OTP request blocked - cooldown active (" + Math.round((10000 - (now - lastOtpRequestTime)) / 1000) + "s remaining)");
            return;
        }

        var phoneInput = document.getElementById("phoneInput");
        var val = phoneInput ? phoneInput.value : "";
        console.log("[Login] Get OTP clicked - Phone number:", val, "| Length:", val.length);

        if (val.length === 10) {
            console.log("[Login] ✅ Starting OTP request for mobile:", val);
            console.log("[Login] ⏱️ OTP API call timestamp:", new Date().toISOString());

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
            console.log("[Login] Calling AuthAPI.requestOTP()");
            AuthAPI.requestOTP(val)
                .then(function (response) {
                    console.log("[Login] OTP API Response received:", response);

                    // Check response
                    if (response && response.status && Number(response.status.err_code) === 0) {
                        console.log("[Login] OTP sent successfully via /login");
                        // Keep button disabled and flag set - we're navigating away

                        // Store full user session from /login response
                        // This sets bbnl_user in localStorage (required by home page auth check)
                        AuthAPI.setSession(response);

                        console.log("[Login] Mobile:", val);

                        // Navigate to verify page with mobile only
                        window.location.href = "verify.html?mobile=" + val;
                    } else {
                        // Reset flag and button on error only
                        otpRequestInProgress = false;
                        btn.innerText = originalText;
                        btn.disabled = false;

                        console.error("[Login] OTP request failed:", response);
                        var errorMsg = response.status ? response.status.err_msg : "Failed to send OTP";

                        // Handle "already registered with another device" - register this device first
                        if (errorMsg.toLowerCase().includes("another device") || errorMsg.toLowerCase().includes("already registered")) {
                            console.log("[Login] Device not registered - calling addMacAddress to register this TV...");
                            btn.innerText = "Registering Device...";

                            AuthAPI.addMacAddress(val)
                                .then(function (addResponse) {
                                    console.log("[Login] addMacAddress response:", addResponse);

                                    if (addResponse && addResponse.status && Number(addResponse.status.err_code) === 0) {
                                        console.log("[Login] Device registered successfully");
                                        // Navigate to verify - server already sent OTP with the first requestOTP call
                                        // No need to call requestOTP again (prevents duplicate OTP)
                                        window.location.href = "verify.html?mobile=" + val;
                                    } else {
                                        var addErr = addResponse.status ? addResponse.status.err_msg : "Device registration failed";
                                        throw new Error(addErr);
                                    }
                                })
                                .catch(function (addError) {
                                    console.error("[Login] ❌ Device registration failed:", addError);
                                    otpRequestInProgress = false;
                                    btn.innerText = originalText;
                                    btn.disabled = false;
                                    alert("Error: " + addError.message);
                                });
                            return;
                        }

                        // Check if error is related to invalid mobile number
                        if (errorMsg.toLowerCase().includes("mobile") ||
                            errorMsg.toLowerCase().includes("phone") ||
                            errorMsg.toLowerCase().includes("number")) {
                            showErrorModal();
                        } else {
                            alert("Error: " + errorMsg);
                        }
                    }
                })
                .catch(function (error) {
                    console.error("[Login] ❌ OTP request error:", error);
                    // Reset flag and restore button
                    otpRequestInProgress = false;
                    btn.innerText = originalText;
                    btn.disabled = false;
                    alert("Network error. Please check your connection.");
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
            console.log("[Verify] Already in progress, ignoring duplicate");
            return;
        }

        var fullOTP = "";
        for (var i = 1; i <= 4; i++) {
            var val = document.getElementById('otp' + i).value;
            if (val) fullOTP += val;
        }

        console.log("[Verify] Verify button clicked - OTP:", fullOTP, "| Length:", fullOTP.length);

        if (fullOTP.length === 4) {
            otpVerifyInProgress = true;

            // Get mobile from URL
            var urlParams = new URLSearchParams(window.location.search);
            var mobile = urlParams.get('mobile') || "";

            // If mobile is missing, redirect back to login
            if (!mobile) {
                console.error("[Verify] Missing mobile in URL params - redirecting to login");
                window.location.replace("login.html");
                return;
            }

            // Show loading state
            var btn = document.getElementById("verifyBtn");
            btn.innerText = "Verifying...";
            btn.disabled = true;

            console.log("[Verify] OTP entered:", fullOTP);

            // NO API call — store login state and redirect to home
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('mobile', mobile);
            localStorage.setItem('loginTime', new Date().toISOString());

            // CRITICAL: Set hasLoggedInOnce - this should NEVER be removed even on logout
            localStorage.setItem('hasLoggedInOnce', 'true');
            console.log("[Verify] hasLoggedInOnce flag set - future app launches will skip login");

            // Navigate to home page directly
            window.location.replace("home.html");
        } else {
            console.log("Incomplete OTP");
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

/* NUMERIC INPUT */
/* Handle On-Screen Number Pad Input */
function handleNumberPadInput(value) {
    console.log("Number Pad Input:", value);
    var active = document.activeElement;

    if (active.tagName === 'INPUT') {
        if (value === 'clear') {
            active.value = '';
        } else if (value === 'backspace') {
            active.value = active.value.slice(0, -1);
        } else {
            // Append value (if maxlength allow)
            if (active.maxLength > 0 && active.value.length >= active.maxLength) {
                // Determine if we should move to next input (for OTP)
                if (active.classList.contains('otp-input')) {
                    // If filled, try to move next? 
                    // Usually remote keys handle separate focus, but valid point.
                }
                return;
            }
            active.value += value;

            // Auto-advance for OTP - Updated for 4 digits
            if (active.classList.contains('otp-input') && active.value.length === 1) {
                var currentId = active.id;
                var idx = parseInt(currentId.replace('otp', ''));
                if (idx < 4) {  // Changed from 6 to 4
                    var next = document.getElementById('otp' + (idx + 1));
                    if (next) next.focus();
                } else {
                    // After 4th digit, auto-focus verify button
                    document.getElementById('verifyBtn').focus();
                }
            }
        }

        // Trigger input event manually if needed
        var event = new Event('input', { bubbles: true });
        active.dispatchEvent(event);
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
        console.log("OTP page detected - initializing");
        initOTPPage();
    }
});

function initOTPPage() {
    // Initialize popup handlers
    initPopupHandlers();

    // Add input handlers to OTP inputs for auto-advance
    var otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach(function (input, index) {
        // Handle native keyboard input (and remote keys that trigger input)
        input.addEventListener('input', function () {
            if (input.value.length === 1) {
                if (index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                } else {
                    document.getElementById('verifyBtn').focus();
                }
            }
        });

        // Handle Backspace for navigation
        input.addEventListener('keydown', function (e) {
            if (e.keyCode === 8) { // Backspace
                if (input.value.length === 0 && index > 0) {
                    e.preventDefault();
                    otpInputs[index - 1].focus();
                }
            }
        });

        // Click to focus
        input.addEventListener('click', function () {
            currentOtpIndex = index;
            input.focus();
        });
    });

}



// Clear all OTP inputs and reset focus to first input
function clearOTPInputs() {
    console.log("[OTP] Clearing all OTP inputs");
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
            firstInput.focus();
            console.log("[OTP] Focus reset to first input");
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

    var urlParams = new URLSearchParams(window.location.search);
    var mobile = urlParams.get('mobile') || "";
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
                console.log("[Verify] OTP resent successfully via /loginOtp");
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
                console.log("[Popup] Focus locked on error popup OK button");
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

    console.log("[Focus] Background focusables disabled");
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

    console.log("[Focus] Background focusables re-enabled");
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

    console.log("[Popup] Handlers initialized");
}


