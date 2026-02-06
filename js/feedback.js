/* ================================
   BBNL Feedback CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;

window.onload = function () {
    console.log("=== BBNL Feedback Page Initialized ===");
    focusables = document.querySelectorAll(".focusable");

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
            if (el.classList.contains('back-btn')) {
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
        window.location.href = 'home.html';
        return;
    }

    // Linear navigation
    if (code === 38) moveFocus(-1);
    if (code === 40) moveFocus(1);

    // Custom: Right from submit-btn moves to cancel-btn
    var el = focusables[currentFocus];
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
    console.log("[Feedback] Submitting feedback...");

    // Get user data from session
    var userData = AuthAPI.getUserData();

    if (!userData) {
        console.error("[Feedback] No user data found in session");
        alert("Please login first");
        // Go to home page
        window.location.href = 'home.html';
        return;
    }

    // Get feedback text from textarea
    var textarea = document.querySelector('.textarea-field');
    var feedbackText = textarea ? textarea.value.trim() : '';

    // Validate feedback text
    if (!feedbackText) {
        alert("Please enter your feedback");
        textarea.focus();
        return;
    }

    // Validate rating
    if (currentRating === 0) {
        alert("Please select a rating");
        return;
    }

    // Prepare feedback data with robust field detection
    // Try multiple field name variants for userid and mobile
    var userid = userData.userid || userData.userId || userData.id || userData.username || "testiser1";  // ✅ Fixed: use "testiser1" not "testuser1"
    var mobile = userData.mobile || userData.phone || userData.mobilenumber || "7800000001";

    var feedbackData = {
        userid: userid,
        mobile: mobile,
        feedback: feedbackText,
        rating: currentRating
    };

    console.log("[Feedback] User data:", userData);
    console.log("[Feedback] Extracted userid:", userid);
    console.log("[Feedback] Extracted mobile:", mobile);
    console.log("[Feedback] Submitting data:", feedbackData);

    // Show loading state
    var submitBtn = document.querySelector('.submit-btn');
    var originalText = submitBtn.innerText;
    submitBtn.innerText = 'Submitting...';
    submitBtn.disabled = true;

    // Call API
    BBNL_API.submitFeedback(feedbackData)
        .then(function(response) {
            console.log("[Feedback] ===== API RESPONSE =====");
            console.log("[Feedback] Full response:", JSON.stringify(response, null, 2));
            console.log("[Feedback] Response.status:", response ? response.status : "null");
            console.log("[Feedback] Response.error:", response ? response.error : "null");
            console.log("[Feedback] ========================");

            // Reset button state
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;

            // Check response - API can return either 'status' or 'error' object
            var statusObj = response.status || response.error;
            var errCode = statusObj ? statusObj.err_code : -1;
            var errMsg = statusObj ? statusObj.err_msg : "Unknown error";

            console.log("[Feedback] Parsed error code:", errCode);
            console.log("[Feedback] Parsed error message:", errMsg);

            if (errCode === 0) {
                console.log("[Feedback] ✅ Success:", errMsg);
                alert("Thank you for your feedback!");
                window.location.href = 'home.html';
            } else {
                console.error("[Feedback] ❌ Error code:", errCode);
                console.error("[Feedback] ❌ Error message:", errMsg);
                console.error("[Feedback] Full error response:", response);
                alert("Error: " + errMsg + "\n\nThe API says some required fields are missing. Please contact support.");
            }
        })
        .catch(function(error) {
            console.error("[Feedback] ⚠️ Exception caught:", error);
            console.error("[Feedback] Error message:", error.message);
            console.error("[Feedback] Error stack:", error.stack);

            // Reset button state
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;

            alert("Failed to submit feedback. Please try again.\nError: " + error.message);
        });
}
