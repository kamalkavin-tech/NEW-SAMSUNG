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

    // Check for data-route attribute first (highest priority)
    var route = element.getAttribute('data-route');
    if (route) {
        console.log("Navigating to route:", route);
        window.location.href = route;
        return;
    }

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

// ==========================================
// ADS INTEGRATION (ASYNC)
// ==========================================

/**
 * Load and display homepage ads asynchronously
 * Fails silently if API returns no data or encounters errors
 */
function loadHomeAds() {
    console.log("[HOME] Loading ads asynchronously...");

    // Get ads without blocking page load
    AdsAPI.getHomeAds()
        .then(function (ads) {
            console.log("[HOME] Ads fetched:", ads);

            // Only proceed if we have valid ads
            if (ads && Array.isArray(ads) && ads.length > 0) {
                console.log("[HOME] ✓ Displaying", ads.length, "ads");
                renderAdsInHeroBanner(ads);
            } else {
                console.log("[HOME] No ads to display - keeping clean UI");
            }
        })
        .catch(function (error) {
            // Fail silently - don't show errors to user
            console.error("[HOME] Failed to load ads:", error);
            console.log("[HOME] UI remains clean without ads");
        });
}

/**
 * Render ads in hero banner with slider
 * @param {Array} ads - Array of ad objects with adpath property
 */
function renderAdsInHeroBanner(ads) {
    var container = document.getElementById('hero-banner-container');

    if (!container) {
        console.warn("[HOME] Hero banner container not found");
        return;
    }

    console.log("[HOME] Rendering", ads.length, "ads in hero banner");

    // Clear any existing content
    container.innerHTML = '';

    // Create slider container
    var sliderContainer = document.createElement('div');
    sliderContainer.className = 'ad-slider';
    sliderContainer.style.width = '100%';
    sliderContainer.style.height = '100%';
    sliderContainer.style.position = 'relative';

    // Create slides
    ads.forEach(function (ad, index) {
        var slide = document.createElement('div');
        slide.className = 'ad-slide';
        slide.style.position = 'absolute';
        slide.style.top = '0';
        slide.style.left = '0';
        slide.style.width = '100%';
        slide.style.height = '100%';
        slide.style.display = index === 0 ? 'block' : 'none';

        var img = document.createElement('img');
        img.src = ad.adpath;
        img.alt = 'Advertisement';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';

        // Handle image load errors gracefully
        img.onerror = function () {
            console.error("[HOME] Failed to load ad image:", ad.adpath);
            slide.style.display = 'none';
        };

        slide.appendChild(img);
        sliderContainer.appendChild(slide);
    });

    container.appendChild(sliderContainer);

    // Start auto-rotation if multiple ads (5 seconds)
    if (ads.length > 1) {
        var currentIndex = 0;
        var slides = sliderContainer.querySelectorAll('.ad-slide');

        setInterval(function () {
            slides[currentIndex].style.display = 'none';
            currentIndex = (currentIndex + 1) % slides.length;
            slides[currentIndex].style.display = 'block';
        }, 5000);
    }

    console.log("[HOME] ✓ Ad slider initialized successfully");
}

// ==========================================
// CHANNELS INTEGRATION (ASYNC)
// ==========================================

/**
 * Load and display first 4 channels on homepage asynchronously
 * Fails silently if API returns no data or encounters errors
 */
function loadHomeChannels() {
    console.log("[HOME] Loading channels asynchronously...");

    // Get channels without blocking page load
    BBNL_API.getChannelList()
        .then(function (channels) {
            console.log("[HOME] Channels fetched:", channels ? channels.length : 0);

            // Only proceed if we have valid channels
            if (channels && Array.isArray(channels) && channels.length > 0) {
                // Take first 4 channels
                var firstFourChannels = channels.slice(0, 4);
                console.log("[HOME] ✓ Displaying first", firstFourChannels.length, "channels");
                renderChannelsInHomeGrid(firstFourChannels);
            } else {
                console.log("[HOME] No channels to display");
                renderEmptyChannelsState();
            }
        })
        .catch(function (error) {
            // Fail silently - don't show errors to user
            console.error("[HOME] Failed to load channels:", error);
            console.log("[HOME] Rendering empty state");
            renderEmptyChannelsState();
        });
}

/**
 * Render channels in home page grid
 * @param {Array} channels - Array of channel objects (first 4)
 */
function renderChannelsInHomeGrid(channels) {
    var container = document.getElementById('home-channels-container');

    if (!container) {
        console.warn("[HOME] Channels container not found");
        return;
    }

    console.log("[HOME] Rendering", channels.length, "channels in home grid");

    // Clear any existing content
    container.innerHTML = '';

    // Create channel cards
    channels.forEach(function (channel) {
        var channelName = channel.chtitle || channel.channel_name || "Channel";
        var channelLogo = channel.chlogo || channel.logo_url || "";
        var channelNo = channel.channelno || channel.channel_no || "";
        var streamLink = channel.streamlink || channel.channel_url || "";

        // Create channel card
        var card = document.createElement('div');
        card.className = 'channel-card focusable';
        card.tabIndex = 0;
        card.setAttribute('data-channel', channelName);

        // Store full channel data for playback
        card.dataset.streamlink = streamLink;
        card.dataset.logo = channelLogo;
        card.dataset.channelno = channelNo;

        // Channel icon container
        var iconDiv = document.createElement('div');
        iconDiv.className = 'channel-icon';
        iconDiv.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        iconDiv.style.display = 'flex';
        iconDiv.style.flexDirection = 'column';
        iconDiv.style.alignItems = 'center';
        iconDiv.style.justifyContent = 'center';
        iconDiv.style.padding = '20px';
        iconDiv.style.borderRadius = '12px';

        // Display logo if available
        if (channelLogo && !channelLogo.includes('chnlnoimage')) {
            var img = document.createElement('img');
            img.src = channelLogo;
            img.alt = channelName;
            img.style.maxWidth = '80%';
            img.style.maxHeight = '80%';
            img.style.objectFit = 'contain';

            // Fallback to text if image fails to load
            img.onerror = function () {
                iconDiv.innerHTML = '<span class="channel-name" style="color: white; font-weight: bold; font-size: 16px;">' +
                                    channelName.substring(0, 10) + '</span>';
            };

            iconDiv.appendChild(img);
        } else {
            // Text fallback
            var nameSpan = document.createElement('span');
            nameSpan.className = 'channel-name';
            nameSpan.style.color = 'white';
            nameSpan.style.fontWeight = 'bold';
            nameSpan.style.fontSize = '16px';
            nameSpan.style.textAlign = 'center';
            nameSpan.innerText = channelName.substring(0, 15);
            iconDiv.appendChild(nameSpan);
        }

        card.appendChild(iconDiv);

        // Channel label
        var label = document.createElement('p');
        label.className = 'channel-label';
        label.innerHTML = channelName + '<br>live Channels';
        card.appendChild(label);

        // Click handler - navigate to player
        card.addEventListener('click', function () {
            handleChannelCardClick(channel);
        });

        container.appendChild(card);
    });

    // Add "View All" button
    var viewAllCard = document.createElement('div');
    viewAllCard.className = 'channel-card view-all focusable';
    viewAllCard.tabIndex = 0;
    viewAllCard.innerHTML = `
        <div class="channel-icon view-all-icon">
            <span class="arrow">→</span>
        </div>
        <p class="channel-label">View All<br>Channels<br>Live Channels</p>
    `;
    viewAllCard.addEventListener('click', function () {
        window.location.href = 'channels.html';
    });
    container.appendChild(viewAllCard);

    console.log("[HOME] ✓ Channels grid rendered successfully");

    // Refresh focusable elements
    focusables = document.querySelectorAll('.focusable');
}

/**
 * Handle channel card click - navigate to player
 */
function handleChannelCardClick(channel) {
    console.log("[HOME] Channel clicked:", channel.chtitle || channel.channel_name);

    // Use BBNL_API.playChannel to navigate to player
    BBNL_API.playChannel(channel);
}

/**
 * Render empty state when no channels available
 */
function renderEmptyChannelsState() {
    var container = document.getElementById('home-channels-container');
    if (!container) return;

    container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #888; grid-column: 1 / -1;">
            <p style="font-size: 18px;">No channels available</p>
            <p style="font-size: 14px; margin-top: 10px;">Please check back later</p>
        </div>
    `;
}

// Load ads and channels after page is ready (non-blocking)
window.addEventListener('load', function () {
    // Use setTimeout to ensure they load after critical content
    setTimeout(loadHomeAds, 100);
    setTimeout(loadHomeChannels, 200); // Load channels slightly after ads
});
