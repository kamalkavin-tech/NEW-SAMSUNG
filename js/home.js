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

    // Load Homepage Ads
    loadHomeAds();
};

function loadHomeAds() {
    console.log("Loading Home Ads...");
    AdsAPI.getHomeAds().then(function (ads) {
        console.log("Ads Fetched:", ads);
        if (ads && ads.length > 0) {
            updateHeroBanner(ads);
        } else {
            console.log("No ads found, keeping default banner.");
        }
    }).catch(function (err) {
        console.error("Failed to load ads:", err);
    });
}

function updateHeroBanner(ads) {
    var heroBanner = document.querySelector('.hero-banner');
    if (!heroBanner) return;

    // Clear existing static content
    heroBanner.innerHTML = '';

    // Create Slider Container
    var sliderContainer = document.createElement('div');
    sliderContainer.className = 'hero-slider';
    sliderContainer.style.width = '100%';
    sliderContainer.style.height = '100%';
    sliderContainer.style.position = 'relative'; // Ensure positioning context
    heroBanner.appendChild(sliderContainer);

    // Render Ads
    ads.forEach(function (ad, index) {
        var slide = document.createElement('div');
        slide.className = 'hero-slide';
        // Base styles for slides
        slide.style.display = index === 0 ? 'block' : 'none';
        slide.style.width = '100%';
        slide.style.height = '100%';
        slide.style.position = 'absolute';
        slide.style.top = '0';
        slide.style.left = '0';

        // Image
        var img = document.createElement('img');
        img.src = ad.adpath; // Assuming 'adpath' is the key from API
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        slide.appendChild(img);

        // Optional: Add Buttons/Overlay if needed for ad interaction
        // For now, just the image as per standard ad display

        sliderContainer.appendChild(slide);
    });

    // Start Rotation if multiple ads
    if (ads.length > 1) {
        var currentIndex = 0;
        var slides = sliderContainer.querySelectorAll('.hero-slide');
        setInterval(function () {
            slides[currentIndex].style.display = 'none';
            currentIndex = (currentIndex + 1) % slides.length;
            slides[currentIndex].style.display = 'block';
        }, 5000); // 5 seconds interval
    }
}

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
        console.log("Opening channel from Home:", channelType);
        // Navigate to player, let player.js find the details
        // We pass 'channel_name' as query param.
        // Note: The data-channel attribute might be short code (e.g. 'udaya'), so we might need a better mapping 
        // OR we rely on player.js fuzzy search.
        // Let's pass it as a special "name" look up
        window.location.href = "player.html?name=" + encodeURIComponent(channelType);
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
