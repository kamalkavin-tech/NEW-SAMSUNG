    /* ================================
   BBNL IPTV - HOME PAGE SCRIPT
   ================================ */

var focusables = [];
var currentFocus = 0;

// Initialize on page load
window.onload = function () {
    console.log("=== BBNL IPTV Home Page Initialized ===");

    // Get all focusable elements
    focusables = document.querySelectorAll('.focusable');
    console.log("Found focusable elements:", focusables.length);

    // Set initial focus
    if (focusables.length > 0) {
        currentFocus = 0;
        focusables[0].focus();
    }

    // Add mouse support
    focusables.forEach(function (el, index) {
        el.addEventListener('mouseenter', function () {
            currentFocus = index;
            el.focus();
        });

        el.addEventListener('click', function () {
            handleClick(el);
        });
    });

    // Side Menu Backdrop Click
    var backdrop = document.getElementById('menuBackdrop');
    if (backdrop) {
        backdrop.addEventListener('click', function () {
            document.getElementById('sideMenu').classList.remove('open');
            // Return focus to menu btn?
            var menuBtn = document.querySelector('.menu-btn');
            if (menuBtn) menuBtn.focus();
        });
    }

    // Register Tizen keys
    try {
        var keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Return'];
        tizen.tvinputdevice.registerKeyBatch(keys);
        console.log("Tizen keys registered");
    } catch (e) {
        console.log("Not on Tizen");
    }
};

// Keyboard navigation
document.addEventListener('keydown', function (e) {
    console.log("Key pressed - Code:", e.keyCode, "Key:", e.key);

    switch (e.keyCode) {
        case 37: // LEFT
            e.preventDefault();
            moveFocusHorizontal(-1);
            break;
        case 39: // RIGHT
            e.preventDefault();
            moveFocusHorizontal(1);
            break;
        case 38: // UP
            e.preventDefault();
            moveFocusVertical(-1);
            break;
        case 40: // DOWN
            e.preventDefault();
            moveFocusVertical(1);
            break;
        case 13: // ENTER
            e.preventDefault();
            handleEnter();
            break;
        case 10009: // BACK
            e.preventDefault();

            // 1. Close Side Menu if Open
            var sideMenu = document.getElementById('sideMenu');
            if (sideMenu && sideMenu.classList.contains('open')) {
                console.log("Closing Side Menu");
                sideMenu.classList.remove('open');
                var menuBtn = document.querySelector('.menu-btn');
                if (menuBtn) menuBtn.focus();
                return;
            }

            // 2. Navigate Back
            console.log("Back Pressed - Navigating History");
            window.history.back();
            break;
    }
});

function moveFocusHorizontal(direction) {
    if (focusables.length === 0) return;

    var next = currentFocus + direction;

    // Clamp to valid range
    if (next < 0) next = 0;
    if (next >= focusables.length) next = focusables.length - 1;

    if (next !== currentFocus) {
        currentFocus = next;
        focusables[currentFocus].focus();
        console.log("Focus moved to:", currentFocus);
    }
}

function moveFocusVertical(direction) {
    // For grid layouts, move by 5 (number of columns)
    var columnsPerRow = 5;
    var next = currentFocus + (direction * columnsPerRow);

    if (next < 0) next = 0;
    if (next >= focusables.length) next = focusables.length - 1;

    if (next !== currentFocus) {
        currentFocus = next;
        focusables[currentFocus].focus();
        console.log("Focus moved to:", currentFocus);
    }
}

function handleEnter() {
    if (focusables.length === 0) return;
    var activeElement = focusables[currentFocus];
    handleClick(activeElement);
}

function handleClick(element) {
    console.log("Element clicked/activated");

    // Check if it's an app card
    var appType = element.getAttribute('data-app');
    if (appType) {
        console.log("Opening app:", appType);
        // Add your app opening logic here
        alert("Opening " + appType);
        return;
    }

    // Check if it's a channel card
    var channelType = element.getAttribute('data-channel');
    if (channelType) {
        console.log("Opening channel:", channelType);
        // Add your channel opening logic here
        alert("Opening " + channelType + " channel");
        return;
    }

    // Check if it's a button
    if (element.classList.contains('btn-watch')) {
        console.log("Watch Now clicked");
        // Add your watch logic here
        alert("Starting playback...");
        return;
    }

    if (element.classList.contains('btn-add')) {
        console.log("Add to list clicked");
        alert("Added to your list");
        return;
    }

    if (element.classList.contains('settings-btn')) {
        console.log("Settings clicked");
        alert("Opening settings...");
        return;
    }

    if (element.classList.contains('menu-btn')) {
        console.log("Menu clicked");
        var sideMenu = document.getElementById('sideMenu');
        if (sideMenu) {
            sideMenu.classList.add('open');
            // Focus first item in menu
            var firstMenuItem = sideMenu.querySelector('.menu-item.focusable');
            if (firstMenuItem) firstMenuItem.focus();
        }
        return;
    }

    // Menu Items Navigation Logic (for Remote 'Enter' key)
    if (element.classList.contains('menu-item')) {
        if (element.innerText.includes('Home')) {
            window.location.href = 'home.html';
            return;
        }
        if (element.innerText.includes('Live Channels') || element.innerText.includes('TV Channels')) {
            window.location.href = 'channels.html';
            return;
        }
        if (element.innerText.includes('Subscription')) {
            window.location.href = 'subscription.html';
            return;
        }
        if (element.innerText.includes('Favorites')) {
            window.location.href = 'favorites.html';
            return;
        }
        if (element.innerText.includes('Notification')) {
            window.location.href = 'notifications.html';
            return;
        }
        if (element.innerText.includes('Get Complaint')) {
            window.location.href = 'help-desk.html';
            return;
        }
        if (element.innerText.includes('Get Feedback')) {
            window.location.href = 'feedback.html';
            return;
        }
    }

    // Close Menu if Backdrop Clicked (this needs separate event listener, but for now specific check)
    if (element.id === 'menuBackdrop') {
        document.getElementById('sideMenu').classList.remove('open');
        return;
    }


    // Toggle Dark Mode
    if (element.classList.contains('toggle-switch') || element.id === 'darkModeModeToggle') {
        console.log("Toggle Dark Mode clicked");
        document.body.classList.toggle('light-mode');
        return;
    }


    // View all cards
    if (element.classList.contains('view-all')) {
        console.log("View all clicked");
        // Check which section we are in
        var parentSection = element.closest('.content-section');
        if (parentSection && parentSection.querySelector('h2').innerText.includes('OTT')) {
            window.location.href = "ott-apps.html";
        } else {
            window.location.href = "channels.html";
        }
        return;
    }
}
