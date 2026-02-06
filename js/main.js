/* ================================
   BBNL IPTV – CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;

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

    // 3. Show Device ID, IP & MAC (if on login page)
    showDeviceId();
    showNetworkIP();
    showMacAddress();

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
};

/* DEVICE ID */
function showDeviceId() {
    var deviceIdText = document.getElementById("deviceIdText");
    if (!deviceIdText) return; // Not on login page

    try {
        if (typeof webapis !== 'undefined' && webapis.productinfo) {
            var duid = webapis.productinfo.getDuid();
            deviceIdText.innerText = "Device ID: " + duid;
        } else {
            deviceIdText.innerText = "Device ID: Emulator / Web";
        }
    } catch (e) {
        deviceIdText.innerText = "Device ID: Not available";
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
                ipText.innerText = "IP: Disconnected";
                return;
            }

            var ip = webapis.network.getIp(networkType);
            if (ip) {
                ipText.innerText = "IP: " + ip;
                console.log("Device IP:", ip);
            } else {
                ipText.innerText = "IP: Not valid";
            }
        } else {
            // Fallback for Emulator/Browser
            ipText.innerText = "IP: Web/Emulator";
        }
    } catch (e) {
        console.error("IP Fetch Error:", e);
        // Show actual error info for debugging on TV
        ipText.innerText = "IP: " + e.name;
    }
}


function showMacAddress() {
    var macText = document.getElementById("macAddressText");
    if (!macText) return;

    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            var mac = webapis.network.getMac();
            if (mac) {
                macText.innerText = "MAC: " + mac;
                console.log("Device MAC:", mac);
            } else {
                macText.innerText = "MAC: Not Available";
            }
        } else {
            macText.innerText = "MAC: Web/Emulator";
        }
    } catch (e) {
        console.error("MAC Fetch Error:", e);
        macText.innerText = "MAC: " + e.name;
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

/* NUMBER-ONLY INPUT VALIDATION */
function setupNumberOnlyInputs() {
    // Phone Input - only allow numbers
    var phoneInput = document.getElementById("phoneInput");
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

        // Filter on input (for paste/auto-fill)
        phoneInput.addEventListener("input", function (e) {
            this.value = this.value.replace(/[^0-9]/g, '');
        });

        console.log("Phone input: number-only validation enabled");
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
                // Enter - allow
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
            
            // Enter - submit
            if (e.keyCode === 13) {
                e.preventDefault();
                var getOtpBtn = document.getElementById('getOtpBtn');
                if (getOtpBtn) {
                    getOtpBtn.focus();
                    getOtpBtn.click();
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
        var phoneInput = document.getElementById("phoneInput");
        if (phoneInput) {
            phoneInput.value = "";
            phoneInput.focus();
        }
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
        var phoneInput = document.getElementById("phoneInput");
        var val = phoneInput ? phoneInput.value : "";
        console.log("Get OTP clicked - Phone number:", val);

        if (val.length === 10) {
            console.log("[Login] Requesting OTP for mobile:", val);

            // Show loading state
            var btn = document.getElementById("getOtpBtn");
            var originalText = btn.innerText;
            btn.innerText = "Sending OTP...";
            btn.disabled = true;

            // Call actual API
            const userIdToUse = "testiser1";
            AuthAPI.requestOTP(userIdToUse, val)
                .then(function (response) {
                    console.log("[Login] OTP Response:", response);

                    // Restore button
                    btn.innerText = originalText;
                    btn.disabled = false;

                    // Check response
                    if (response && response.status && response.status.err_code === 0) {
                        console.log("[Login] ✅ OTP sent successfully");

                        // Show OTP code if available (for testing)
                        if (response.body && response.body[0] && response.body[0].otpcode) {
                            console.log("[Login] OTP Code:", response.body[0].otpcode);
                            alert("OTP sent successfully!\n\nFor testing: " + response.body[0].otpcode);
                        } else {
                            alert("OTP sent successfully to " + val);
                        }

                        // Navigate to verify page
                        window.location.href = "verify.html?mobile=" + val + "&userid=" + userIdToUse;
                    } else {
                        console.error("[Login] ❌ OTP request failed:", response);
                        var errorMsg = response.status ? response.status.err_msg : "Failed to send OTP";

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
        var fullOTP = "";
        for (var i = 1; i <= 4; i++) {  // Changed from 6 to 4
            var val = document.getElementById('otp' + i).value;
            if (val) fullOTP += val;
        }

        console.log("Verify button clicked - OTP:", fullOTP);

        if (fullOTP.length === 4) {  // Changed from 6 to 4
            console.log("[Verify] Verifying OTP:", fullOTP);

            // Get user info from URL
            var urlParams = new URLSearchParams(window.location.search);
            var mobile = urlParams.get('mobile') || "7800000001";
            var userid = urlParams.get('userid') || "testiser1";

            // Show loading state
            var btn = document.getElementById("verifyBtn");
            var originalText = btn.innerText;
            btn.innerText = "Verifying...";
            btn.disabled = true;

            // Call actual API
            AuthAPI.verifyOTP(userid, mobile, fullOTP)
                .then(function (response) {
                    console.log("[Verify] OTP Verification Response:", response);

                    // Restore button
                    btn.innerText = originalText;
                    btn.disabled = false;

                    // Check response
                    if (response && response.status && response.status.err_code === 0) {
                        console.log("[Verify] ✅ OTP verified successfully");

                        // Store login state in localStorage
                        localStorage.setItem('isLoggedIn', 'true');
                        localStorage.setItem('userid', userid);
                        localStorage.setItem('mobile', mobile);
                        localStorage.setItem('loginTime', new Date().toISOString());

                        alert("Login successful!");

                        // Navigate to home page using replace to prevent back navigation to login
                        window.location.replace("home.html");
                    } else {
                        console.error("[Verify] ❌ OTP verification failed:", response);
                        var errorMsg = response.status ? response.status.err_msg : "Invalid OTP";
                        alert("Error: " + errorMsg);
                    }
                })
                .catch(function (error) {
                    console.error("[Verify] ❌ OTP verification error:", error);
                    btn.innerText = originalText;
                    btn.disabled = false;
                    alert("Network error. Please check your connection.");
                });
        } else {
            console.log("Incomplete OTP");
            alert("Please enter full 4-digit OTP");  // Changed from 6 to 4
        }
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
var countdownTimer = 59;
var timerInterval = null;

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
    // Start countdown timer
    startCountdown();

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

    // Add resend link handler
    var resendLink = document.getElementById('resendLink');
    if (resendLink) {
        resendLink.addEventListener('click', function () {
            if (!resendLink.classList.contains('disabled')) {
                resendOTP();
            }
        });
    }
}

function startCountdown() {
    countdownTimer = 59;
    var timerElement = document.getElementById('timer');
    var resendLink = document.getElementById('resendLink');

    if (resendLink) {
        resendLink.classList.add('disabled');
    }

    if (timerInterval) {
        clearInterval(timerInterval);
    }

    timerInterval = setInterval(function () {
        countdownTimer--;

        if (timerElement) {
            var minutes = Math.floor(countdownTimer / 60);
            var seconds = countdownTimer % 60;
            timerElement.innerText = '0' + minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
        }

        if (countdownTimer <= 0) {
            clearInterval(timerInterval);
            if (resendLink) {
                resendLink.classList.remove('disabled');
            }
            if (timerElement) {
                timerElement.innerText = '00:00';
            }
        }
    }, 1000);
}

function resendOTP() {
    console.log("Resending OTP...");

    // Get User Context from URL or Storage
    const urlParams = new URLSearchParams(window.location.search);
    const mobile = urlParams.get('mobile') || "7800000001";
    const userid = urlParams.get('userid') || "testiser1";
    const email = urlParams.get('email') || "sureshs@bbnl.co.in"; // Add email parameter

    const resendLink = document.getElementById('resendLink');
    if (resendLink) resendLink.innerText = "Sending...";

    // Get device info for the API call
    const device = DeviceInfo.getDeviceInfo();
    const deviceData = {
        mac_address: device.mac_address,
        device_name: device.device_name,
        ip_address: device.ip_address,
        device_type: device.device_type
    };

    console.log("[Resend OTP] Payload:", {
        userid: userid,
        mobile: mobile,
        email: email,
        ...deviceData
    });

    // Call API with all required parameters
    AuthAPI.resendOTP(userid, mobile, email, deviceData).then(response => {
        console.log("Resend Response:", response);
        if (resendLink) resendLink.innerText = "Resend OTP";

        // Check if response is successful
        if (response && response.status && response.status.err_code === 0) {
            // Restart timer on success
            startCountdown();

            // Clear Inputs
            otpCode = ["", "", "", "", "", ""];
            for (var i = 1; i <= 6; i++) {
                var digitEl = document.getElementById('otp' + i);
                if (digitEl) digitEl.value = '';
            }
            currentOtpIndex = 0;
            if (focusables.length > 0) focusables[0].focus();

            alert("OTP sent successfully to " + mobile);
        } else {
            var errorMsg = response && response.status ? response.status.err_msg : "Unknown error";
            console.error("[Resend OTP] API Error:", errorMsg);
            alert("Failed: " + errorMsg);
        }

    }).catch(e => {
        console.error("Resend Failed", e);
        if (resendLink) resendLink.innerText = "Resend OTP";
        alert("Failed to resend OTP: " + e.message);
    });
}

