/* ================================
   BBNL IPTV - SUBSCRIPTION CONTROLLER
   ================================ */

var focusables = [];
var currentFocus = 0;

window.onload = function () {
    console.log("=== BBNL Subscription Page Initialized ===");

    // 1. Select Focusables
    focusables = document.querySelectorAll(".focusable");

    // 2. Set Initial Focus (Likely 'Make Payment' in sidebar or Back button)
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
            // Handle other clicks if needed
            handleClick(el);
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
        window.location.href = "home.html";
        return;
    }

    // Simple Grid/List Navigation
    // This page is a complex mix of lists and grids. 
    // A simple index-based approach might be jumpy.
    // For now, index based.

    if (code === 37) moveFocus(-1); // Left
    if (code === 38) moveFocus(-2); // Up - approximate
    if (code === 39) moveFocus(1);  // Right
    if (code === 40) moveFocus(2);  // Down - approximate

    if (code === 13) handleEnter(document.activeElement);
});

function moveFocus(step) {
    if (focusables.length === 0) return;

    var next = currentFocus + step;

    // Simple clamp
    if (next < 0) next = 0;
    if (next >= focusables.length) next = focusables.length - 1;

    if (next !== currentFocus) {
        currentFocus = next;

        // Scroll into view if needed
        focusables[currentFocus].scrollIntoView({ behavior: 'smooth', block: 'center' });
        focusables[currentFocus].focus();
    }
}

function handleClick(el) {
    if (el.classList.contains('sidebar-item')) {
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        // In a real app, this would switch the Main Content view.
        return;
    }

    if (el.classList.contains('pay-btn')) {
        alert("Proceeding to Payment Gateway...");
        return;
    }

    if (el.classList.contains('action-btn')) {
        var action = el.innerText;
        alert(action + " initiated for channel.");
        return;
    }
}

function handleEnter(el) {
    if (!el) el = document.activeElement;

    if (el.classList.contains('back-btn')) {
        window.location.href = "home.html";
        return;
    }

    handleClick(el);
}
