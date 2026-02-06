/* ================================
   BBNL notifications CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;

window.onload = function () {
    console.log("=== BBNL Notifications Page Initialized ===");
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
        window.location.href = "home.html";
        return;
    }

    if (code === 38) moveFocus(-1);
    if (code === 40) moveFocus(1);

    if (code === 13) {
        if (focusables[currentFocus].classList.contains('back-btn')) {
            window.location.href = "home.html";
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
