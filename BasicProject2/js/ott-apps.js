/* ================================
   BBNL IPTV - OTT APPS CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;

window.onload = function () {
    console.log("=== BBNL OTT Apps Page Initialized ===");

    // 1. Select Focusables
    focusables = document.querySelectorAll(".focusable");
    console.log("Found focusable elements:", focusables.length);

    // 2. Set Initial Focus to first app if available
    if (focusables.length > 0) {
        // Skip header items if possible and focus first app? 
        // Logic: Header buttons are focusable. Usually focus starts top-left.
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
            handleEnter();
        });
    });

    // 4. Register Tizen Keys
    try {
        var keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Return"];
        tizen.tvinputdevice.registerKeyBatch(keys);
    } catch (e) {
        console.log("Not running on Tizen or key registration failed");
    }
};

document.addEventListener("keydown", function (e) {
    var code = e.keyCode;

    // Tizen Back Key
    if (code === 10009) {
        window.history.back();
        return;
    }

    // Directional
    if (code === 37) moveFocus(-1); // Left
    if (code === 38) moveFocus(-5); // Up (Grid 5)
    if (code === 39) moveFocus(1);  // Right
    if (code === 40) moveFocus(5);  // Down

    // Enter
    if (code === 13) handleEnter();
});

function moveFocus(step) {
    if (focusables.length === 0) return;

    var next = currentFocus + step;

    // Boundary Checks (Simple List)
    if (next < 0) next = 0;
    if (next >= focusables.length) next = focusables.length - 1;

    // In a grid, simply clamping might not be ideal navigation logic (e.g. going up from top row shouldn't go to previous item),
    // but for this simple implementation it suffices. 
    // To Improve: Detect if moving up from top row -> go to header.

    if (next !== currentFocus) {
        currentFocus = next;
        focusables[currentFocus].focus();
    }
}

function handleEnter() {
    var active = document.activeElement;
    console.log("Enter pressed on:", active);

    if (active.id === 'homeBtn') {
        window.location.href = 'home.html';
        return;
    }

    if (active.classList.contains('app-card')) {
        alert("Opening App...");
    }
}
