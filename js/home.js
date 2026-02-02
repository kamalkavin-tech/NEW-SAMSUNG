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
    if (focusables.length === 0) return;

    var current = focusables[currentFocus];
    var currentRect = current.getBoundingClientRect();
    var currentCenterX = currentRect.left + currentRect.width / 2;
    var currentCenterY = currentRect.top + currentRect.height / 2;

    // Find elements in the target direction
    var candidates = [];

    for (var i = 0; i < focusables.length; i++) {
        if (i === currentFocus) continue;

        var el = focusables[i];
        var rect = el.getBoundingClientRect();
        var centerY = rect.top + rect.height / 2;

        // Check if element is in the correct direction
        if (direction < 0 && centerY < currentCenterY - 20) {
            // Moving UP - element should be above
            candidates.push({
                index: i,
                element: el,
                rect: rect,
                centerX: rect.left + rect.width / 2,
                centerY: centerY,
                distance: currentCenterY - centerY
            });
        } else if (direction > 0 && centerY > currentCenterY + 20) {
            // Moving DOWN - element should be below
            candidates.push({
                index: i,
                element: el,
                rect: rect,
                centerX: rect.left + rect.width / 2,
                centerY: centerY,
                distance: centerY - currentCenterY
            });
        }
    }

    if (candidates.length === 0) {
        console.log("No elements found in direction:", direction);
        return;
    }

    // Sort by vertical distance first, then by horizontal alignment
    candidates.sort(function(a, b) {
        // Prioritize elements on the same row (closest vertically)
        var rowDiff = Math.abs(a.distance - b.distance);
        if (rowDiff < 50) {
            // Same row - prefer horizontally aligned
            var aHorizontalDist = Math.abs(a.centerX - currentCenterX);
            var bHorizontalDist = Math.abs(b.centerX - currentCenterX);
            return aHorizontalDist - bHorizontalDist;
        }
        // Different rows - prefer closest row
        return a.distance - b.distance;
    });

    // Move to the best candidate
    var best = candidates[0];
    currentFocus = best.index;
    focusables[currentFocus].focus();

    // Scroll element into view smoothly
    focusables[currentFocus].scrollIntoView({ behavior: 'smooth', block: 'center' });

    console.log("Focus moved to:", currentFocus, focusables[currentFocus].className);
}

function handleEnter() {
    if (focusables.length === 0) return;
    var activeElement = focusables[currentFocus];
    handleClick(activeElement);
}

function handleClick(element) {
    console.log("Element clicked/activated:", element.className, element.id);

    // Settings button - explicit handler
    if (element.classList.contains('settings-btn')) {
        console.log("Settings button clicked - navigating to settings.html");
        window.location.href = "settings.html";
        return;
    }

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
    if (element.id === 'darkModeToggle' || element.classList.contains('darkmode-toggle')) {
        console.log("Toggle Dark Mode clicked");
        toggleDarkMode();
        return;
    }

    // Toggle Network Popup
    if (element.id === 'networkBtn' || element.classList.contains('network-btn')) {
        console.log("Network button clicked");
        toggleNetworkPopup();
        return;
    }

    // Close Network Popup when clicking network options
    if (element.classList.contains('network-option')) {
        console.log("Network option selected");
        closeNetworkPopup();
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

    // Create slides
    ads.forEach(function (ad, index) {
        var slide = document.createElement('div');
        slide.className = 'ad-slide';
        slide.style.opacity = index === 0 ? '1' : '0';
        slide.style.zIndex = index === 0 ? '1' : '0';

        var img = document.createElement('img');
        img.src = ad.adpath;
        img.alt = 'Advertisement ' + (index + 1);

        // Handle image load success
        img.onload = function () {
            console.log("[HOME] Ad image loaded successfully:", ad.adpath);
        };

        // Handle image load errors gracefully
        img.onerror = function () {
            console.error("[HOME] Failed to load ad image:", ad.adpath);
            slide.style.display = 'none';
        };

        slide.appendChild(img);
        sliderContainer.appendChild(slide);
    });

    container.appendChild(sliderContainer);

    // Add navigation dots if multiple ads
    if (ads.length > 1) {
        var dotsContainer = document.createElement('div');
        dotsContainer.className = 'ad-dots';

        ads.forEach(function (ad, index) {
            var dot = document.createElement('div');
            dot.className = 'ad-dot' + (index === 0 ? ' active' : '');
            dot.setAttribute('data-index', index);
            dotsContainer.appendChild(dot);
        });

        container.appendChild(dotsContainer);
    }

    // Start auto-rotation if multiple ads (6 seconds interval)
    if (ads.length > 1) {
        var currentIndex = 0;
        var slides = sliderContainer.querySelectorAll('.ad-slide');
        var dots = container.querySelectorAll('.ad-dot');

        // Rotation function
        function rotateAds() {
            // Fade out current slide
            slides[currentIndex].style.opacity = '0';
            slides[currentIndex].style.zIndex = '0';
            dots[currentIndex].classList.remove('active');

            // Move to next slide
            currentIndex = (currentIndex + 1) % slides.length;

            // Fade in next slide
            slides[currentIndex].style.opacity = '1';
            slides[currentIndex].style.zIndex = '1';
            dots[currentIndex].classList.add('active');
        }

        // Auto-rotate every 6 seconds
        setInterval(rotateAds, 6000);

        // Manual dot navigation
        dots.forEach(function (dot, index) {
            dot.addEventListener('click', function () {
                if (index !== currentIndex) {
                    // Fade out current
                    slides[currentIndex].style.opacity = '0';
                    slides[currentIndex].style.zIndex = '0';
                    dots[currentIndex].classList.remove('active');

                    // Update index
                    currentIndex = index;

                    // Fade in selected
                    slides[currentIndex].style.opacity = '1';
                    slides[currentIndex].style.zIndex = '1';
                    dots[currentIndex].classList.add('active');
                }
            });
        });
    }

    console.log("[HOME] ✓ Ad slider initialized with", ads.length, "ad(s)");
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

        // Channel label container
        var labelContainer = document.createElement('div');
        labelContainer.className = 'card-info';
        labelContainer.style.padding = '12px 16px';

        // Channel name
        var titleEl = document.createElement('div');
        titleEl.className = 'card-title-bottom';
        titleEl.innerText = channelName;
        labelContainer.appendChild(titleEl);

        // Subtitle
        var subtitleEl = document.createElement('div');
        subtitleEl.className = 'card-subtitle-bottom';
        subtitleEl.innerText = 'Live Channels';
        labelContainer.appendChild(subtitleEl);

        card.appendChild(labelContainer);

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
        <div class="channel-icon view-all-icon" style="background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%);">
            <span class="arrow" style="font-size: 48px; color: #3b5cff;">→</span>
        </div>
        <div class="card-info" style="padding: 12px 16px;">
            <div class="card-title-bottom">View All</div>
            <div class="card-subtitle-bottom">Channels</div>
        </div>
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

// ==========================================
// OTT APPS INTEGRATION (ASYNC)
// ==========================================

/**
 * Load and display first 4 OTT apps on homepage asynchronously
 * Fails silently if API returns no data or encounters errors
 */
function loadHomeApps() {
    console.log("[HOME] Loading OTT apps asynchronously...");

    // Get apps without blocking page load
    BBNL_API.getAllowedApps()
        .then(function (response) {
            console.log("[HOME] Apps response:", response);

            // Check if response is successful
            if (response && response.status && response.status.err_code === 0) {
                if (response.apps && Array.isArray(response.apps) && response.apps.length > 0) {
                    // Take first 4 apps
                    var firstFourApps = response.apps.slice(0, 4);
                    console.log("[HOME] ✓ Displaying first", firstFourApps.length, "apps");
                    renderAppsInHomeGrid(firstFourApps);
                } else {
                    console.log("[HOME] No apps to display");
                    renderEmptyAppsState();
                }
            } else {
                console.log("[HOME] No apps available");
                renderEmptyAppsState();
            }
        })
        .catch(function (error) {
            // Fail silently - don't show errors to user
            console.error("[HOME] Failed to load apps:", error);
            console.log("[HOME] Rendering empty state");
            renderEmptyAppsState();
        });
}

/**
 * Render OTT apps in home page grid
 * @param {Array} apps - Array of app objects (first 4)
 */
function renderAppsInHomeGrid(apps) {
    var container = document.getElementById('home-apps-container');

    if (!container) {
        console.warn("[HOME] Apps container not found");
        return;
    }

    console.log("[HOME] Rendering", apps.length, "apps in home grid");

    // Clear any existing content
    container.innerHTML = '';

    // Create app cards
    apps.forEach(function (app) {
        var appName = app.appname || "App";
        var appIcon = app.icon || "";
        var appPkgId = app.pkgid || "";

        // Create app card
        var card = document.createElement('div');
        card.className = 'app-card focusable';
        card.tabIndex = 0;
        card.setAttribute('data-app-name', appName);
        card.setAttribute('data-pkg-id', appPkgId);

        // App icon container
        var iconDiv = document.createElement('div');
        iconDiv.className = 'app-icon';
        iconDiv.style.display = 'flex';
        iconDiv.style.alignItems = 'center';
        iconDiv.style.justifyContent = 'center';
        iconDiv.style.padding = '20px';
        iconDiv.style.borderRadius = '12px';
        iconDiv.style.background = '#1a1a2e';

        // Display icon if available
        if (appIcon) {
            var img = document.createElement('img');
            img.src = appIcon;
            img.alt = appName;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';

            // Fallback to text if image fails to load
            img.onerror = function () {
                iconDiv.innerHTML = '<span class="app-name" style="color: white; font-weight: bold; font-size: 16px;">' +
                                    appName + '</span>';
            };

            iconDiv.appendChild(img);
        } else {
            // Text fallback
            var nameSpan = document.createElement('span');
            nameSpan.className = 'app-name';
            nameSpan.style.color = 'white';
            nameSpan.style.fontWeight = 'bold';
            nameSpan.style.fontSize = '16px';
            nameSpan.innerText = appName;
            iconDiv.appendChild(nameSpan);
        }

        card.appendChild(iconDiv);

        // App label
        var label = document.createElement('div');
        label.className = 'card-subtitle-bottom';
        label.style.padding = '10px 16px';
        label.style.textAlign = 'center';
        label.innerText = 'Streaming Services';
        card.appendChild(label);

        // Click handler - can add app launch logic later
        card.addEventListener('click', function () {
            console.log("[HOME] App clicked:", appName);
            alert("Opening " + appName);
        });

        container.appendChild(card);
    });

    // Add "View All" button
    var viewAllCard = document.createElement('div');
    viewAllCard.className = 'app-card view-all focusable';
    viewAllCard.tabIndex = 0;
    viewAllCard.innerHTML = `
        <div class="app-icon view-all-icon" style="background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%); display: flex; align-items: center; justify-content: center; padding: 20px; border-radius: 12px; aspect-ratio: 1;">
            <span class="arrow" style="font-size: 48px; color: #3b5cff;">→</span>
        </div>
        <div class="card-subtitle-bottom" style="padding: 10px 16px; text-align: center;">View All OTT</div>
    `;
    viewAllCard.addEventListener('click', function () {
        window.location.href = 'ott-apps.html';
    });
    container.appendChild(viewAllCard);

    console.log("[HOME] ✓ Apps grid rendered successfully");

    // Refresh focusable elements
    focusables = document.querySelectorAll('.focusable');
}

/**
 * Render empty state when no apps available
 */
function renderEmptyAppsState() {
    var container = document.getElementById('home-apps-container');
    if (!container) return;

    container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #888; grid-column: 1 / -1;">
            <p style="font-size: 18px;">No OTT apps available</p>
            <p style="font-size: 14px; margin-top: 10px;">Please check back later</p>
        </div>
    `;
}

// ==========================================
// DARK MODE FUNCTIONALITY
// ==========================================

/**
 * Initialize dark mode from localStorage
 */
function initDarkMode() {
    console.log("[HOME] Initializing dark mode...");
    var isDarkMode = localStorage.getItem('darkMode') !== 'false'; // Default to dark mode
    var toggle = document.getElementById('darkModeToggle');

    if (isDarkMode) {
        document.body.classList.remove('light-mode');
        if (toggle) toggle.classList.add('active');
    } else {
        document.body.classList.add('light-mode');
        if (toggle) toggle.classList.remove('active');
    }

    console.log("[HOME] Dark mode initialized:", isDarkMode ? "ON" : "OFF");
}

/**
 * Toggle dark/light mode
 */
function toggleDarkMode() {
    var toggle = document.getElementById('darkModeToggle');
    var isCurrentlyDark = !document.body.classList.contains('light-mode');

    if (isCurrentlyDark) {
        // Switch to light mode
        document.body.classList.add('light-mode');
        if (toggle) toggle.classList.remove('active');
        localStorage.setItem('darkMode', 'false');
        console.log("[HOME] Switched to Light Mode");
    } else {
        // Switch to dark mode
        document.body.classList.remove('light-mode');
        if (toggle) toggle.classList.add('active');
        localStorage.setItem('darkMode', 'true');
        console.log("[HOME] Switched to Dark Mode");
    }
}

// ==========================================
// NETWORK STATUS FUNCTIONALITY
// ==========================================

var networkPopupOpen = false;

/**
 * Initialize and update network status dynamically
 */
function initNetworkStatus() {
    console.log("[HOME] Initializing network status...");
    updateNetworkStatus();

    // Update network status every 5 seconds
    setInterval(updateNetworkStatus, 5000);

    // Close popup when clicking outside
    document.addEventListener('click', function(e) {
        var popup = document.getElementById('networkPopup');
        var btn = document.getElementById('networkBtn');
        if (popup && btn && !popup.contains(e.target) && !btn.contains(e.target)) {
            closeNetworkPopup();
        }
    });
}

/**
 * Toggle network popup
 */
function toggleNetworkPopup() {
    var popup = document.getElementById('networkPopup');
    if (!popup) return;

    if (networkPopupOpen) {
        closeNetworkPopup();
    } else {
        openNetworkPopup();
    }
}

/**
 * Open network popup
 */
function openNetworkPopup() {
    var popup = document.getElementById('networkPopup');
    if (popup) {
        popup.classList.add('show');
        networkPopupOpen = true;
        // Focus first option in popup
        var firstOption = popup.querySelector('.network-option');
        if (firstOption) firstOption.focus();
    }
}

/**
 * Close network popup
 */
function closeNetworkPopup() {
    var popup = document.getElementById('networkPopup');
    if (popup) {
        popup.classList.remove('show');
        networkPopupOpen = false;
    }
}

/**
 * Update network status indicator
 */
function updateNetworkStatus() {
    var btnElement = document.getElementById('networkBtn');
    var labelElement = document.getElementById('networkLabel');
    var wifiOption = document.getElementById('wifiOption');
    var wifiSubtitle = document.getElementById('wifiSubtitle');
    var wifiStatus = document.getElementById('wifiStatus');
    var ethernetOption = document.getElementById('ethernetOption');
    var ethernetSubtitle = document.getElementById('ethernetSubtitle');
    var ethernetStatus = document.getElementById('ethernetStatus');

    if (!btnElement || !labelElement) return;

    // Helper function to set active network option
    function setActiveNetwork(type) {
        // type: 'wifi', 'ethernet', 'none'
        if (wifiOption) {
            if (type === 'wifi') {
                wifiOption.classList.add('active');
            } else {
                wifiOption.classList.remove('active');
            }
        }
        if (ethernetOption) {
            if (type === 'ethernet') {
                ethernetOption.classList.add('active');
            } else {
                ethernetOption.classList.remove('active');
            }
        }
    }

    try {
        // Check if webapis is available (Tizen)
        if (typeof webapis !== 'undefined' && webapis.network) {
            var networkType = webapis.network.getActiveConnectionType();
            console.log("[HOME] Network Type:", networkType);

            if (networkType === 0) {
                // Disconnected
                btnElement.classList.add('disconnected');
                labelElement.innerText = "Disconnected";
                setActiveNetwork('none');
                if (wifiSubtitle) wifiSubtitle.innerText = "Not Connected";
                if (wifiStatus) wifiStatus.style.display = "none";
                if (ethernetSubtitle) ethernetSubtitle.innerText = "Not Connected";
                if (ethernetStatus) ethernetStatus.style.display = "none";
            } else if (networkType === 1) {
                // WiFi Connected
                btnElement.classList.remove('disconnected');
                setActiveNetwork('wifi');

                // Try to get WiFi SSID
                var ssid = "";
                try {
                    ssid = webapis.network.getWiFiSsid() || "";
                } catch(e) {
                    console.log("[HOME] Could not get WiFi SSID:", e);
                }

                if (ssid) {
                    labelElement.innerText = ssid;
                    if (wifiSubtitle) wifiSubtitle.innerText = "Connected to " + ssid;
                } else {
                    labelElement.innerText = "WiFi";
                    if (wifiSubtitle) wifiSubtitle.innerText = "Connected";
                }
                if (wifiStatus) wifiStatus.style.display = "block";
                if (ethernetSubtitle) ethernetSubtitle.innerText = "Available";
                if (ethernetStatus) ethernetStatus.style.display = "none";
            } else if (networkType === 2) {
                // Ethernet/LAN Connected
                btnElement.classList.remove('disconnected');
                labelElement.innerText = "Ethernet";
                setActiveNetwork('ethernet');
                if (wifiSubtitle) wifiSubtitle.innerText = "Available";
                if (wifiStatus) wifiStatus.style.display = "none";
                if (ethernetSubtitle) ethernetSubtitle.innerText = "Connected";
                if (ethernetStatus) ethernetStatus.style.display = "block";
            } else {
                // Other connected (type 3 = cellular, etc.)
                btnElement.classList.remove('disconnected');
                labelElement.innerText = "Connected";
                setActiveNetwork('none');
            }
        } else {
            // Fallback for browser/emulator - simulate WiFi connection
            if (navigator.onLine) {
                btnElement.classList.remove('disconnected');
                labelElement.innerText = "WiFi";
                setActiveNetwork('wifi');
                if (wifiSubtitle) wifiSubtitle.innerText = "Connected (Browser)";
                if (wifiStatus) wifiStatus.style.display = "block";
                if (ethernetSubtitle) ethernetSubtitle.innerText = "Available";
                if (ethernetStatus) ethernetStatus.style.display = "none";
            } else {
                btnElement.classList.add('disconnected');
                labelElement.innerText = "Offline";
                setActiveNetwork('none');
                if (wifiSubtitle) wifiSubtitle.innerText = "Not Connected";
                if (wifiStatus) wifiStatus.style.display = "none";
                if (ethernetSubtitle) ethernetSubtitle.innerText = "Not Connected";
                if (ethernetStatus) ethernetStatus.style.display = "none";
            }
        }
    } catch (e) {
        console.error("[HOME] Network status error:", e);
        btnElement.classList.remove('disconnected');
        labelElement.innerText = "Network";
    }
}

// ==========================================
// PAGE LOAD - INITIALIZE ALL FEATURES
// ==========================================

// Load ads, apps, and channels after page is ready (non-blocking)
window.addEventListener('load', function () {
    // Initialize dark mode
    initDarkMode();

    // Initialize network status
    initNetworkStatus();

    // Use setTimeout to ensure they load after critical content
    setTimeout(loadHomeAds, 100);
    setTimeout(loadHomeApps, 150); // Load apps
    setTimeout(loadHomeChannels, 200); // Load channels slightly after ads
});
