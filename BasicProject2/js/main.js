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

    // 6. Register Tizen Keys
    try {
        var keys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
            "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
            "Enter", "Return"];
        tizen.tvinputdevice.registerKeyBatch(keys);
        console.log("Tizen keys registered");
    } catch (e) {
        console.log("Not running on Tizen or key registration failed");
    }
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
                // We will handle this manually below to ensure focus moves instantly
                // e.preventDefault() is implied if we don't return here? 
                // No, we must NOT return here, so it falls through to our manual handler.
            } else if (e.keyCode === 8) {
                // Allow backspace to propagate (handled in initOTPPage for nav)
                return;
            } else if (e.keyCode === 13) {
                // Allow Enter
                return;
            } else {
                // Ignore other keys?
                return;
            }
        } else {
            // Standard Inputs (Phone): Let System Handle Everything
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
            if (isInput) {
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

                    // Trigger input event manually if needed, or just move focus
                    // Move Focus Logic
                    var currentId = active.id; // otp1
                    var idx = parseInt(currentId.replace('otp', ''));
                    if (idx < 6) {
                        var next = document.getElementById('otp' + (idx + 1));
                        if (next) next.focus();
                    } else {
                        var verifyBtn = document.getElementById('verifyBtn');
                        if (verifyBtn) verifyBtn.focus();
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
            console.log("Navigating to verify.html");
            window.location.href = "verify.html";
        } else {
            alert("Please enter 10 digits");
        }
        return;
    }


    // VERIFY PAGE: Verify Button (if exists)
    if (active.id === "verifyBtn") {
        var fullOTP = "";
        for (var i = 1; i <= 6; i++) {
            var val = document.getElementById('otp' + i).value;
            if (val) fullOTP += val;
        }

        console.log("Verify button clicked - OTP:", fullOTP);

        if (fullOTP.length === 6) {
            console.log("Verifying OTP:", fullOTP);
            window.location.href = "home.html";
        } else {
            console.log("Incomplete OTP");
            alert("Please enter full 6-digit OTP");
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

            // Auto-advance for OTP
            if (active.classList.contains('otp-input') && active.value.length === 1) {
                var currentId = active.id;
                var idx = parseInt(currentId.replace('otp', ''));
                if (idx < 6) {
                    var next = document.getElementById('otp' + (idx + 1));
                    if (next) next.focus();
                } else {
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

var otpCode = ["", "", "", "", "", ""];
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
    // Clear current OTP
    otpCode = ["", "", "", "", "", ""];
    for (var i = 1; i <= 6; i++) { // Changed 0 to 1 based on IDs otp1..otp6
        var digitEl = document.getElementById('otp' + i);
        if (digitEl) {
            digitEl.value = '';
        }
    }
    currentOtpIndex = 0;
    if (focusables.length > 0) focusables[0].focus();

    // Restart timer
    startCountdown();

    console.log("OTP resent successfully!");
}

