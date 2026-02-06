/* ================================
   BBNL IPTV - FAVORITES CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;

window.onload = function () {
    console.log("=== BBNL Favorites Page Initialized ===");

    // 1. Select Focusables
    focusables = document.querySelectorAll(".focusable");

    // 2. Set Initial Focus
    if (focusables.length > 0) {
        currentFocus = 0;
        focusables[0].focus();
    }

    // 3. Mouse Support
    focusables.forEach(function (el, index) {
        el.addEventListener("mouseenter", function () {
            currentFocus = index;
            el.focus();
        });

        el.addEventListener("click", function (e) {
            // Handle Back Button specifically
            if (el.classList.contains('back-btn')) {
                window.location.href = 'home.html';
                return;
            }
        });
    });

    // 4. Register All Remote Keys (supports all Samsung remote types)
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

    if (code === 37) moveFocus(-1);

    // Grid logic similar to Channels
    if (code === 38) moveFocus(-5);
    if (code === 39) moveFocus(1);
    if (code === 40) moveFocus(5);

    if (code === 13) handleEnter(document.activeElement);
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

function handleEnter(el) {
    if (!el) el = document.activeElement;

    if (el.classList.contains('back-btn')) {
        window.location.href = "home.html";
        return;
    }

    if (el.classList.contains('filter-chip')) {
        document.querySelectorAll('.filter-chip').forEach(f => f.classList.remove('active'));
        el.classList.add('active');
        return;
    }

    if (el.classList.contains('channel-card')) {
        alert("Playing Channel from Favorites...");
        return;
    }
}
