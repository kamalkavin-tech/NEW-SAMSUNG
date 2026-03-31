/* ================================
   BBNL Feedback CONTROLLER
   ================================ */

// Check authentication - redirect to login if never logged in
// NOTE: Never remove hasLoggedInOnce — it must persist across HOME relaunch.
(function checkAuth() {
    var hasLoggedInOnce = localStorage.getItem("hasLoggedInOnce");
    if (hasLoggedInOnce !== "true") {
        window.location.replace("login.html");
        return;
    }
    try {
        var ud = localStorage.getItem("bbnl_user");
        if (!ud || !JSON.parse(ud).userid) {
            window.location.replace("login.html");
            return;
        }
    } catch (e) {
        console.error("[Auth] Corrupted session data - redirecting to login:", e);
        window.location.replace("login.html");
        return;
    }
})();

var focusables = [];
var currentFocus = 0;

function isElementVisible(el) {
    if (!el) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
}

function refreshFocusableList() {
    var all = Array.from(document.querySelectorAll('.focusable'));
    focusables = all.filter(isElementVisible);
}

// ==========================================
// CUSTOM POPUP - Replaces native browser popup
// Header shows: "Fo-Fi TV Feedback"
// ==========================================
function showPopup(message, callback) {
    var overlay = document.getElementById('fb-popup-overlay');
    var msgEl = document.getElementById('fb-popup-msg');
    var okBtn = document.getElementById('fb-popup-ok');
    if (!overlay || !msgEl || !okBtn) {
        // Fallback if DOM not ready
        if (callback) callback();
        return;
    }
    msgEl.textContent = message;
    overlay.style.display = 'flex';
    okBtn.focus();

    function closePopup() {
        overlay.style.display = 'none';
        okBtn.removeEventListener('click', closePopup);
        document.removeEventListener('keydown', onPopupKey);
        if (callback) callback();
    }

    function onPopupKey(e) {
        if (e.keyCode === 13 || e.keyCode === 65376) { // Enter / OK
            e.preventDefault();
            closePopup();
        }
    }

    okBtn.addEventListener('click', closePopup);
    document.addEventListener('keydown', onPopupKey);
}

window.onload = function () {

    // Auto-populate User ID field from session
    var userIdField = document.getElementById('userIdField');
    if (userIdField) {
        var userData = AuthAPI.getUserData();
        if (userData) {
            var userId = userData.userid || userData.userId || userData.id || userData.username || "";
            userIdField.value = userId;
        }
    }

    refreshFocusableList();

    if (focusables.length > 0) {
        currentFocus = 0;
        focusables[0].focus();
    }

    focusables.forEach(function (el, index) {
        el.addEventListener("mouseenter", function () {
            currentFocus = index;
            el.focus();
        });

        el.addEventListener("click", function () {
            if (el.classList.contains('back-btn') || el.classList.contains('back-link')) {
                window.location.href = 'home.html';
                return;
            }
            if (el.classList.contains('submit-btn')) {
                submitFeedback();
                return;
            }
            if (el.classList.contains('star-rating')) {
                // Cycle stars or handle via specific key logic if granular
                toggleStars();
            }
        });
    });

    // Register All Remote Keys (supports all Samsung remote types)
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
            tizen.tvinputdevice.registerKeyBatch(keys);
        } catch (e) { }
    }
};

document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    if (code === 10009) { // Back
        e.preventDefault();
        window.location.href = 'home.html';
        return;
    }

    // Prevent default for navigation keys
    if ([37, 38, 39, 40, 13].indexOf(code) !== -1) {
        e.preventDefault();
    }

    // Linear navigation
    if (code === 38) moveFocus(-1);
    if (code === 40) moveFocus(1);

    // Custom: Right from submit-btn moves to cancel-btn
    refreshFocusableList();
    var el = focusables[currentFocus];
    if (!el) return;
    if (code === 39 && el.classList.contains('submit-btn')) {
        // Find the next focusable that is cancel-btn
        for (let i = currentFocus + 1; i < focusables.length; i++) {
            if (focusables[i].classList.contains('cancel-btn')) {
                currentFocus = i;
                focusables[currentFocus].focus();
                break;
            }
        }
        return;
    }
    // Custom: Left from cancel-btn moves to submit-btn
    if (code === 37 && el.classList.contains('cancel-btn')) {
        for (let i = currentFocus - 1; i >= 0; i--) {
            if (focusables[i].classList.contains('submit-btn')) {
                currentFocus = i;
                focusables[currentFocus].focus();
                break;
            }
        }
        return;
    }

    if (code === 13) {
        if (el.classList.contains('submit-btn')) {
            submitFeedback();
        } else if (el.classList.contains('star-rating')) {
            toggleStars();
        } else {
            el.click();
        }
    }

    // Left/Right for star rating if focused
    var active = document.activeElement;
    if (active.classList.contains('star-rating')) {
        if (code === 37 || code === 39) {
            toggleStars(code === 39); // true for right (increase)
        }
    }
});

function moveFocus(step) {
    refreshFocusableList();
    if (focusables.length === 0) return;
    var next = currentFocus + step;
    if (next < 0) next = 0;
    if (next >= focusables.length) next = focusables.length - 1;

    if (next !== currentFocus) {
        currentFocus = next;
        focusables[currentFocus].focus();
    }
}

var currentRating = 0;
function toggleStars(increase = true) {
    var stars = document.querySelectorAll('.star');
    if (increase) {
        currentRating++;
        if (currentRating > 5) currentRating = 1;
    } else {
        // Just cycle or simple toggle
        currentRating++;
        if (currentRating > 5) currentRating = 0;
    }

    stars.forEach((s, i) => {
        if (i < currentRating) s.innerHTML = '★'; // Filled
        else s.innerHTML = '☆'; // Empty
    });
}

/**
 * Submit feedback to BBNL API
 */
function submitFeedback() {

    // Get user data from session
    var userData = AuthAPI.getUserData();

    if (!userData) {
        console.error("[Feedback] No user data found in session");
        showPopup("Please login first", function () {
            window.location.href = 'home.html';
        });
        return;
    }

    // Get feedback text from textarea
    var textarea = document.querySelector('.textarea-field');
    var feedbackText = textarea ? textarea.value.trim() : '';

    // Validate feedback text
    if (!feedbackText) {
        showPopup("Please enter your feedback", function () { textarea.focus(); });
        return;
    }

    // Validate rating
    if (currentRating === 0) {
        showPopup("Please select a rating");
        return;
    }

    // Prepare feedback data with robust field detection
    // Try multiple field name variants for userid and mobile
    var userid = userData.userid || userData.userId || userData.id || userData.username || "";
    var mobile = userData.mobile || userData.phone || userData.mobilenumber || "";

    var feedbackData = {
        userid: userid,
        mobile: mobile,
        feedback: feedbackText,
        rating: currentRating
    };


    // Show loading state
    var submitBtn = document.querySelector('.submit-btn');
    var originalText = submitBtn.innerText;
    submitBtn.innerText = 'Submitting...';
    submitBtn.disabled = true;

    // Call API
    BBNL_API.submitFeedback(feedbackData)
        .then(function(response) {
            // response logging removed for TV performance

            // Reset button state
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;

            // Check response - API can return either 'status' or 'error' object
            var statusObj = response.status || response.error;
            var errCode = statusObj ? statusObj.err_code : -1;
            var errMsg = statusObj ? statusObj.err_msg : "Unknown error";


            if (errCode === 0) {
                showPopup("Thank you for your feedback!", function () {
                    window.location.href = 'home.html';
                });
            } else {
                console.error("[Feedback] ❌ Error code:", errCode);
                console.error("[Feedback] ❌ Error message:", errMsg);
                console.error("[Feedback] Full error response:", response);
                showPopup("Error: " + errMsg + "\n\nPlease contact support.");
            }
        })
        .catch(function(error) {
            console.error("[Feedback] ⚠️ Exception caught:", error);
            console.error("[Feedback] Error message:", error.message);
            console.error("[Feedback] Error stack:", error.stack);

            // Reset button state
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;

            showPopup("Failed to submit feedback. Please try again.");
        });
}
