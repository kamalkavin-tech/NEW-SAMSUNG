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
                window.history.back();
                return;
            }
            if (el.classList.contains('submit-btn')) {
                alert("Feedback Submitted!");
                window.location.href = 'help-desk.html';
                return;
            }
            if (el.classList.contains('star-rating')) {
                // Cycle stars or handle via specific key logic if granular
                toggleStars();
            }
        });
    });

    try {
        var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
        tizen.tvinputdevice.registerKeyBatch(keys);
    } catch (e) { }
};

document.addEventListener("keydown", function (e) {
    var code = e.keyCode;
    if (code === 10009) { // Back
        window.history.back();
        return;
    }

    // Linear navigation
    if (code === 38) moveFocus(-1);
    if (code === 40) moveFocus(1);

    if (code === 13) {
        var el = focusables[currentFocus];
        if (el.classList.contains('submit-btn')) {
            alert("Feedback Submitted!");
            window.location.href = 'help-desk.html';
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
