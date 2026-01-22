/* ================================
   BBNL IPTV - CHANNELS PAGE CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;

window.onload = function () {
    console.log("=== BBNL Channels Page Initialized ===");

    // 1. Select Focusables
    focusables = document.querySelectorAll(".focusable");

    // 2. Set Initial Focus
    if (focusables.length > 0) {
        currentFocus = 0; // Usually Back Button
        focusables[0].focus();
    }

    // 3. Mouse Support
    focusables.forEach(function (el, index) {
        el.addEventListener("mouseenter", function () {
            currentFocus = index;
            el.focus();
        });

        el.addEventListener("click", function (e) {
            handleEnter(el); // Pass element explicitly for mouse clicks
        });
    });

    // 4. Register Keyboard
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

    if (code === 37) moveFocus(-1);
    // Grid vs List Mix: 
    // Header & Filters are effectively lists. 
    // Channels are grids.
    // Simple +/- index movement works but jumping lines needs logic.
    // Assuming flat list order for valid focusables.
    if (code === 38) moveFocus(-5); // Up (rough guess for grid)
    if (code === 39) moveFocus(1);
    if (code === 40) moveFocus(5);  // Down

    if (code === 13) handleEnter(document.activeElement);
});

function moveFocus(step) {
    if (focusables.length === 0) return;

    // Improved Logic: Check what we are currently focused on
    var active = focusables[currentFocus];
    var isFilter = active.classList.contains('filter-chip');
    var isChannel = active.classList.contains('channel-card');

    // If Filter Bar (Horizontal): Up/Down should jump to Header/Grid
    // If Grid (Matrix): Up/Down +/- 5. Left/Right +/- 1.

    var next = currentFocus + step;

    // Very Basic Navigation fallback
    if (next < 0) next = 0;
    if (next >= focusables.length) next = focusables.length - 1;

    if (next !== currentFocus) {
        currentFocus = next;
        focusables[currentFocus].focus();
    }
}

function handleEnter(el) {
    if (!el) el = document.activeElement;

    console.log("Clicked:", el);

    if (el.classList.contains('back-btn')) {
        window.history.back();
        return;
    }

    if (el.classList.contains('filter-chip')) {
        // Toggle Active State
        document.querySelectorAll('.filter-chip').forEach(f => f.classList.remove('active'));
        el.classList.add('active');
        console.log("Filter selected:", el.innerText);
        return;
    }

    if (el.classList.contains('channel-card')) {
        alert("Playing Channel...");
        return;
    }
}
