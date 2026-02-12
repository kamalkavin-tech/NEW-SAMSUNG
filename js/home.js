/* ================================
BBNL IPTV - HOME PAGE SCRIPT
================================ */

var focusables = [];
var currentFocus = 0;
var exitPopupOpen = false; // Track if exit/logout popup is open
var homeSearchTimeout = null; // Timer for auto-play channel by number

// Check authentication - redirect to login if not logged in
(function checkAuth() {
    var userData = localStorage.getItem("bbnl_user");
    if (!userData) {
        console.log("[Auth] User not logged in, redirecting to login...");
        window.location.replace("login.html");
        return;
    }
    
    // Clear browser history to prevent back navigation to login pages
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.href);
    }
})();

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

    // Initialize sidebar icon buttons - Set active state based on current page ONLY
    var sidebarBtns = document.querySelectorAll('.sidebar-icon-btn');
    var currentPage = window.location.pathname.split('/').pop() || 'home.html';

    // Remove all active classes first, then set only for current page
    // Also add explicit click handlers for navigation
    sidebarBtns.forEach(function(btn) {
        btn.classList.remove('active');
        var route = btn.getAttribute('data-route');
        if (route === currentPage) {
            btn.classList.add('active');
            console.log("Active sidebar icon set to:", route);
        }

        // Add explicit click handler for sidebar navigation
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var targetRoute = btn.getAttribute('data-route');
            if (targetRoute) {
                console.log("[Sidebar] Navigating to:", targetRoute);
                window.location.href = targetRoute;
            }
        });
    });

    // Register All Remote Keys (supports all Samsung remote types)
    if (typeof RemoteKeys !== 'undefined') {
        RemoteKeys.registerAllKeys();
    } else {
        try {
            var keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Return'];
            tizen.tvinputdevice.registerKeyBatch(keys);
            console.log("Tizen keys registered (fallback)");
        } catch (e) {
            console.log("Not on Tizen");
        }
    }

    // Initialize TV Navigation System
    // This will set initial focus on Home icon in sidebar
    setTimeout(function() {
        if (typeof TVNavigation !== 'undefined') {
            TVNavigation.init();
        }
    }, 100);

    // Initialize numeric-only search input
    var searchInput = document.getElementById('searchInput');
    if (searchInput) {
        // Filter out non-numeric characters on input
        searchInput.addEventListener('input', function() {
            var cleaned = searchInput.value.replace(/[^0-9]/g, '');
            if (cleaned !== searchInput.value) {
                searchInput.value = cleaned;
            }

            clearTimeout(homeSearchTimeout);

            if (cleaned.length > 0) {
                // Auto-play channel after 2 seconds of no input
                homeSearchTimeout = setTimeout(function() {
                    var lcn = parseInt(cleaned, 10);
                    console.log("[HOME] Auto-playing LCN:", lcn);
                    playChannelByLCNFromHome(lcn);
                }, 2000);
            }
        });

        // Block non-numeric key presses
        searchInput.addEventListener('keypress', function(e) {
            var char = String.fromCharCode(e.which || e.keyCode);
            if (!/[0-9]/.test(char) && e.keyCode !== 13 && e.keyCode !== 8) {
                e.preventDefault();
            }
        });
    }
};

// Keyboard navigation
document.addEventListener('keydown', function (e) {
    console.log("Key pressed - Code:", e.keyCode, "Key:", e.key);

    // Check if app lock screen is active - handle BACK key to retry
    if (appLockActive) {
        e.preventDefault();
        if (e.keyCode === 10009 || e.keyCode === 13) {
            // BACK or ENTER - retry lock check
            retryAppLockCheck();
        }
        return;
    }

    // Check if error popup is open - handle BACK to close, ENTER to retry
    if (homeErrorPopupOpen) {
        e.preventDefault();
        if (e.keyCode === 10009) {
            hideHomeErrorPopups();
        } else if (e.keyCode === 13) {
            var activeBtn = document.activeElement;
            if (activeBtn && activeBtn.classList.contains('error-popup-btn')) {
                activeBtn.click();
            }
        }
        return;
    }

    // Check if exit popup is open - handle navigation within popup only
    if (exitPopupOpen) {
        e.preventDefault();
        handleExitPopupNavigation(e.keyCode);
        return;
    }

    // Allow typing in search input - only intercept navigation keys
    var isSearchFocused = document.activeElement && document.activeElement.id === 'searchInput';
    if (isSearchFocused) {
        if (e.keyCode === 13) { // ENTER - play channel by number
            e.preventDefault();
            clearTimeout(homeSearchTimeout); // Cancel auto-play timer
            var query = document.activeElement.value.replace(/[^0-9]/g, '').trim();
            if (query.length > 0) {
                console.log("[HOME] Playing LCN:", query);
                playChannelByLCNFromHome(parseInt(query, 10));
            }
            return;
        }
        if (e.keyCode === 39) { // RIGHT - go to Settings button
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleRight();
            }
            return;
        }
        if (e.keyCode === 37) { // LEFT - go to sidebar
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleLeft();
            }
            return;
        }
        if (e.keyCode === 38) { // UP - stay (already at top)
            e.preventDefault();
            return;
        }
        if (e.keyCode === 40) { // DOWN - leave search, go to cards
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleDown();
            }
            return;
        }
        if (e.keyCode === 10009) { // BACK - clear search or navigate back
            e.preventDefault();
            clearTimeout(homeSearchTimeout);
            if (document.activeElement.value.trim() !== '') {
                document.activeElement.value = '';
            } else {
                handleBackNavigation();
            }
            return;
        }
        // Let all other keys (typing, backspace, etc.) work naturally
        return;
    }

    switch (e.keyCode) {
        case 37: // LEFT
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleLeft();
            }
            break;
        case 39: // RIGHT
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleRight();
            }
            break;
        case 38: // UP
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleUp();
            }
            break;
        case 40: // DOWN
            e.preventDefault();
            if (typeof TVNavigation !== 'undefined') {
                TVNavigation.handleDown();
            }
            break;
        case 13: // ENTER
            e.preventDefault();
            handleEnter();
            break;
        case 10009: // BACK
            e.preventDefault();
            // Smart back navigation:
            // If in content area -> go back to sidebar
            // If in sidebar at home icon -> show exit confirmation
            // If in sidebar at other icon -> go to home icon
            console.log("Back Pressed on Home");
            handleBackNavigation();
            break;
        case 447: // VolumeUp
        case 448: // VolumeDown
        case 449: // VolumeMute
            // Handle volume keys
            handleVolumeKeys(e.keyCode);
            break;
    }
});

// ==========================================
// VOLUME CONTROL (for Home page)
// ==========================================
var homeCurrentVolume = 50;
var homeIsMuted = false;

function handleVolumeKeys(keyCode) {
    try {
        if (typeof tizen !== 'undefined' && tizen.tvaudiocontrol) {
            switch (keyCode) {
                case 447: // VolumeUp
                    tizen.tvaudiocontrol.setVolumeUp();
                    homeCurrentVolume = tizen.tvaudiocontrol.getVolume();
                    showVolumeIndicator(homeCurrentVolume);
                    console.log("Volume Up:", homeCurrentVolume);
                    break;
                case 448: // VolumeDown
                    tizen.tvaudiocontrol.setVolumeDown();
                    homeCurrentVolume = tizen.tvaudiocontrol.getVolume();
                    showVolumeIndicator(homeCurrentVolume);
                    console.log("Volume Down:", homeCurrentVolume);
                    break;
                case 449: // VolumeMute
                    homeIsMuted = !homeIsMuted;
                    tizen.tvaudiocontrol.setMute(homeIsMuted);
                    showVolumeIndicator(homeIsMuted ? 0 : homeCurrentVolume, homeIsMuted);
                    console.log("Mute:", homeIsMuted);
                    break;
            }
        }
    } catch (e) {
        console.error("Volume control error:", e);
    }
}

function showVolumeIndicator(volume, muted) {
    var indicator = document.getElementById('volume-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'volume-indicator';
        indicator.style.cssText = 'position:fixed;top:50px;right:50px;background:rgba(0,0,0,0.8);color:#fff;padding:15px 25px;border-radius:10px;font-size:18px;z-index:9999;display:flex;align-items:center;gap:15px;';
        document.body.appendChild(indicator);
    }
    
    var icon = muted ? '\ud83d\udd07' : (volume > 50 ? '\ud83d\udd0a' : (volume > 0 ? '\ud83d\udd09' : '\ud83d\udd08'));
    indicator.innerHTML = '<span style=\"font-size:24px;\">' + icon + '</span><span>' + (muted ? 'Muted' : volume + '%') + '</span>';
    indicator.style.display = 'flex';
    
    clearTimeout(indicator.hideTimeout);
    indicator.hideTimeout = setTimeout(function() {
        indicator.style.display = 'none';
    }, 2000);
}

/**
 * Handle navigation within exit popup
 */
function handleExitPopupNavigation(keyCode) {
    var noBtn = document.getElementById('exitNoBtn');
    var yesBtn = document.getElementById('exitYesBtn');
    var active = document.activeElement;
    
    switch (keyCode) {
        case 37: // LEFT
        case 39: // RIGHT
            // Toggle between No and Yes buttons
            if (active === noBtn) {
                yesBtn.focus();
            } else if (active === yesBtn) {
                noBtn.focus();
            } else {
                // Focus on No button by default
                noBtn.focus();
            }
            break;
        case 38: // UP
        case 40: // DOWN
            // Toggle between buttons (same as left/right)
            if (active === noBtn) {
                yesBtn.focus();
            } else if (active === yesBtn) {
                noBtn.focus();
            } else {
                noBtn.focus();
            }
            break;
        case 13: // ENTER
            // Trigger click on focused button
            if (active === noBtn) {
                cancelExit();
            } else if (active === yesBtn) {
                confirmExit();
            }
            break;
        case 10009: // BACK
            // Close popup
            cancelExit();
            break;
    }
}

// Smart back navigation handler
function handleBackNavigation() {
    var active = document.activeElement;
    
    // Check if we're in the exit modal
    var exitModal = document.getElementById('exitModal');
    if (exitModal && exitModal.classList.contains('show')) {
        // Close the exit modal
        hideExitConfirmation();
        return;
    }
    
    // Check if we're in sidebar
    var sidebarIcons = document.querySelectorAll('.sidebar-icon');
    var inSidebar = false;
    var atHomeIcon = false;
    
    sidebarIcons.forEach(function(icon, index) {
        if (icon === active || icon.contains(active)) {
            inSidebar = true;
            if (index === 0) {
                atHomeIcon = true;
            }
        }
    });
    
    if (inSidebar) {
        if (atHomeIcon) {
            // At home icon in sidebar - show exit confirmation
            console.log("At home icon - showing exit confirmation");
            showExitConfirmation();
        } else {
            // In sidebar but not at home - go to home icon
            console.log("In sidebar - going to home icon");
            var homeIcon = document.querySelector('.sidebar-icon');
            if (homeIcon) {
                homeIcon.focus();
            }
        }
    } else {
        // In content area - go to sidebar home icon
        console.log("In content - going to sidebar");
        var homeIcon = document.querySelector('.sidebar-icon');
        if (homeIcon) {
            homeIcon.focus();
        }
    }
}

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
    // Use document.activeElement to get the actually focused element
    // This works correctly with TV Navigation system
    var activeElement = document.activeElement;
    if (activeElement) {
        console.log("handleEnter - Active element:", activeElement.className, activeElement.getAttribute('data-route'));
        handleClick(activeElement);
    }
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

    // Sidebar icon navigation
    if (element.classList.contains('sidebar-icon-btn')) {
        console.log("Sidebar icon clicked");
        // Route navigation is already handled by data-route check above
        return;
    }

    // Header icon buttons
    if (element.classList.contains('header-icon-btn')) {
        console.log("Header icon button clicked");
        // Route navigation handled by data-route or specific handlers below
        return;
    }

    // Search button
    if (element.id === 'searchBtn') {
        console.log("Search clicked");
        // TODO: Implement search modal
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
                // Take first 3 channels (+ View All = 4 cards total)
                var firstThreeChannels = channels.slice(0, 3);
                console.log("[HOME] ✓ Displaying first", firstThreeChannels.length, "channels");
                renderChannelsInHomeGrid(firstThreeChannels);
            } else {
                console.log("[HOME] No channels to display");
                renderEmptyChannelsState();
            }
        })
        .catch(function (error) {
            console.error("[HOME] Failed to load channels:", error);
            var container = document.getElementById('home-channels-container');
            if (container) container.innerHTML = '';
            if (isNetworkDisconnected()) {
                showHomeErrorPopup('failedLoad');
            }
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
    if (container) container.innerHTML = '';
    if (isNetworkDisconnected()) {
        showHomeErrorPopup('noChannels');
    }
}

// ==========================================
// OTT APPS INTEGRATION (ASYNC)
// ==========================================

/**
 * Load and display languages on homepage asynchronously
 * Fails silently if API returns no data or encounters errors
 */
function loadHomeLanguages() {
    console.log("[HOME] Loading languages asynchronously...");

    // Get languages without blocking page load
    BBNL_API.getLanguageList()
        .then(function (languages) {
            console.log("[HOME] Languages response:", languages);

            // Check if response is an array with languages
            if (languages && Array.isArray(languages) && languages.length > 0) {
                console.log("[HOME] ✓ Displaying", languages.length, "languages");
                renderLanguagesInHomeGrid(languages);
            } else {
                console.log("[HOME] No languages to display");
                renderEmptyLanguagesState();
            }
        })
        .catch(function (error) {
            console.error("[HOME] Failed to load languages:", error);
            var container = document.getElementById('home-languages-container');
            if (container) container.innerHTML = '';
            if (isNetworkDisconnected()) {
                showHomeErrorPopup('failedLoad');
            }
        });
}

/**
 * Render languages in home page grid as cards (like channel cards)
 * @param {Array} languages - Array of language objects
 */
function renderLanguagesInHomeGrid(languages) {
    var container = document.getElementById('home-languages-container');

    if (!container) {
        console.warn("[HOME] Languages container not found");
        return;
    }

    console.log("[HOME] Rendering", languages.length, "languages in home grid");

    // Sort languages alphabetically (keep special entries at top)
    languages.sort(function(a, b) {
        var nameA = (a.langtitle || '').toLowerCase();
        var nameB = (b.langtitle || '').toLowerCase();
        if (nameA.includes('all') || nameA.includes('subscribed')) return -1;
        if (nameB.includes('all') || nameB.includes('subscribed')) return 1;
        return nameA.localeCompare(nameB);
    });

    // Clear any existing content
    container.innerHTML = '';

    // Take first 7 languages (+ View All = 8 cards = 2 rows of 4)
    var displayLanguages = languages.slice(0, 7);

    // Create language cards
    displayLanguages.forEach(function (lang) {
        var langName = lang.langtitle || "Language";
        var langId = lang.langid || "";
        var langLogo = lang.langlogo || "";

        // Create language card (similar to channel card)
        var card = document.createElement('div');
        card.className = 'channel-card focusable';
        card.tabIndex = 0;
        card.setAttribute('data-langid', langId);
        card.setAttribute('data-langname', langName);

        // Language icon container
        var iconDiv = document.createElement('div');
        iconDiv.className = 'channel-icon';
        iconDiv.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #2d2d44 100%)';
        iconDiv.style.display = 'flex';
        iconDiv.style.flexDirection = 'column';
        iconDiv.style.alignItems = 'center';
        iconDiv.style.justifyContent = 'center';
        iconDiv.style.padding = '20px';
        iconDiv.style.borderRadius = '12px';

        // Display logo if available
        if (langLogo && !langLogo.includes('noimage')) {
            var img = document.createElement('img');
            img.src = langLogo;
            img.alt = langName;
            img.style.maxWidth = '80%';
            img.style.maxHeight = '80%';
            img.style.objectFit = 'contain';

            // Fallback to text if image fails to load
            img.onerror = function () {
                iconDiv.innerHTML = '<span style="color: white; font-weight: bold; font-size: 24px;">' +
                                    langName.substring(0, 2).toUpperCase() + '</span>';
            };

            iconDiv.appendChild(img);
        } else {
            // Text fallback - show first 2 letters
            var nameSpan = document.createElement('span');
            nameSpan.style.color = 'white';
            nameSpan.style.fontWeight = 'bold';
            nameSpan.style.fontSize = '28px';
            nameSpan.style.textAlign = 'center';
            nameSpan.innerText = langName.substring(0, 2).toUpperCase();
            iconDiv.appendChild(nameSpan);
        }

        card.appendChild(iconDiv);

        // Language label container
        var labelContainer = document.createElement('div');
        labelContainer.className = 'card-info';
        labelContainer.style.padding = '12px 16px';

        // Language name
        var titleEl = document.createElement('div');
        titleEl.className = 'card-title-bottom';
        titleEl.innerText = langName;
        labelContainer.appendChild(titleEl);

        card.appendChild(labelContainer);

        // Click handler - navigate to channels with language filter
        card.addEventListener('click', function () {
            console.log("[HOME] Language clicked:", langName, "ID:", langId);
            window.location.href = 'channels.html?lang=' + encodeURIComponent(langId);
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
            <div class="card-subtitle-bottom">Languages</div>
        </div>
    `;
    viewAllCard.addEventListener('click', function () {
        window.location.href = 'language-select.html';
    });
    container.appendChild(viewAllCard);

    console.log("[HOME] ✓ Languages grid rendered successfully");

    // Refresh focusable elements
    focusables = document.querySelectorAll('.focusable');
}

/**
 * Render empty state when no languages are available
 */
function renderEmptyLanguagesState() {
    var container = document.getElementById('home-languages-container');
    if (container) container.innerHTML = '';
    if (isNetworkDisconnected()) {
        showHomeErrorPopup('noChannels');
    }
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
// EXIT CONFIRMATION FUNCTIONALITY
// ==========================================

/**
 * Show exit confirmation popup
 */
function showExitConfirmation() {
    var popup = document.getElementById('exitPopup');
    if (popup) {
        popup.style.display = 'flex';
        exitPopupOpen = true;
        // Focus on "No" button (stay in app)
        var noBtn = document.getElementById('exitNoBtn');
        if (noBtn) noBtn.focus();
    }
}

/**
 * Hide exit confirmation popup
 */
function hideExitConfirmation() {
    var popup = document.getElementById('exitPopup');
    if (popup) {
        popup.style.display = 'none';
        exitPopupOpen = false;
    }
}

/**
 * Handle exit confirmation - exit app
 */
function confirmExit() {
    console.log("[HOME] User confirmed exit");
    try {
        // Tizen app exit
        if (typeof tizen !== 'undefined' && tizen.application) {
            tizen.application.getCurrentApplication().exit();
        } else {
            // Browser fallback - close window
            window.close();
        }
    } catch (e) {
        console.error("[HOME] Exit error:", e);
        window.close();
    }
}

/**
 * Handle exit cancellation - stay in app
 */
function cancelExit() {
    console.log("[HOME] User cancelled exit");
    hideExitConfirmation();
}

// Initialize exit popup buttons
document.addEventListener('DOMContentLoaded', function() {
    var exitYesBtn = document.getElementById('exitYesBtn');
    var exitNoBtn = document.getElementById('exitNoBtn');

    if (exitYesBtn) {
        exitYesBtn.addEventListener('click', confirmExit);
    }

    if (exitNoBtn) {
        exitNoBtn.addEventListener('click', cancelExit);
    }

    // App lock retry button
    var appLockRetryBtn = document.getElementById('appLockRetryBtn');
    if (appLockRetryBtn) {
        appLockRetryBtn.addEventListener('click', retryAppLockCheck);
    }
});

// ==========================================
// APP LOCK FUNCTIONALITY
// ==========================================

var appLockActive = false;

/**
 * Check app lock status on startup
 * If locked, shows the lock overlay and prevents app usage
 */
function checkAppLockStatus() {
    console.log("[HOME] Checking app lock status...");

    if (typeof AppLockAPI === 'undefined') {
        console.warn("[HOME] AppLockAPI not available");
        return;
    }

    AppLockAPI.checkAppLock()
        .then(function(response) {
            console.log("[HOME] App lock response:", response);

            // Check if app is locked based on API response
            // Response typically has status/locked field
            var isLocked = false;

            if (response) {
                // Check common response patterns
                if (response.status === "locked" || response.locked === true || response.lock === true) {
                    isLocked = true;
                } else if (response.status === "0" || response.status === 0 || response.status === "fail" || response.status === "error") {
                    isLocked = true;
                } else if (response.message && response.message.toLowerCase().includes("lock")) {
                    isLocked = true;
                }
            }

            if (isLocked) {
                console.log("[HOME] App is LOCKED - showing lock screen");
                showAppLockScreen();
            } else {
                console.log("[HOME] App is UNLOCKED - proceeding normally");
                hideAppLockScreen();
            }
        })
        .catch(function(error) {
            console.error("[HOME] App lock check failed:", error);
            // On error, allow app to work (fail-open)
            console.log("[HOME] Allowing access on error (fail-open)");
        });
}

/**
 * Show the app lock overlay screen
 */
function showAppLockScreen() {
    var overlay = document.getElementById('appLockOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        appLockActive = true;

        // Focus on retry button
        var retryBtn = document.getElementById('appLockRetryBtn');
        if (retryBtn) retryBtn.focus();

        console.log("[HOME] Lock screen displayed");
    }
}

/**
 * Hide the app lock overlay screen
 */
function hideAppLockScreen() {
    var overlay = document.getElementById('appLockOverlay');
    if (overlay) {
        overlay.style.display = 'none';
        appLockActive = false;
        console.log("[HOME] Lock screen hidden");
    }
}

/**
 * Retry app lock check (triggered by button or BACK key)
 */
function retryAppLockCheck() {
    console.log("[HOME] Retrying app lock check...");
    checkAppLockStatus();
}

// ==========================================
// TRP DATA TRACKING
// ==========================================

/**
 * Send TRP data on page load for analytics/viewership tracking
 */
function sendTRPDataOnLoad() {
    console.log("[HOME] Sending TRP data for home page view...");

    if (typeof TRPDataAPI === 'undefined') {
        console.warn("[HOME] TRPDataAPI not available");
        return;
    }

    TRPDataAPI.sendTRPData("home_page_view")
        .then(function(response) {
            console.log("[HOME] TRP data sent successfully:", response);
        })
        .catch(function(error) {
            // Fail silently - analytics should never block the user
            console.error("[HOME] TRP data send failed:", error);
        });
}

// ==========================================
// NETWORK CHECK HELPER
// ==========================================

/**
 * Check if the network is disconnected
 * Uses Tizen webapis on real TV, falls back to navigator.onLine in browser
 * @returns {boolean} true if network is disconnected
 */
function isNetworkDisconnected() {
    try {
        if (typeof webapis !== 'undefined' && webapis.network) {
            return webapis.network.getActiveConnectionType() === 0;
        }
    } catch (e) {
        console.error("[HOME] Network check error:", e);
    }
    // Browser fallback
    return !navigator.onLine;
}

// ==========================================
// ERROR POPUP FUNCTIONALITY
// ==========================================

var homeErrorPopupOpen = false;

/**
 * Show error popup by type
 * @param {string} type - 'failedLoad', 'loginRequired', 'noChannels'
 */
function showHomeErrorPopup(type) {
    // Hide all first
    hideHomeErrorPopups();

    var popupId = '';
    if (type === 'failedLoad') {
        popupId = 'failedLoadPopup';
    } else if (type === 'loginRequired') {
        popupId = 'loginRequiredPopup';
    } else if (type === 'noChannels') {
        popupId = 'noChannelsPopup';
    }

    var popup = document.getElementById(popupId);
    if (popup) {
        popup.style.display = 'flex';
        homeErrorPopupOpen = true;
        // Focus retry button
        setTimeout(function() {
            var btn = popup.querySelector('.error-popup-btn');
            if (btn) btn.focus();
        }, 100);
        console.log('[HOME] Showing error popup:', type);
    }
}

/**
 * Hide all error popups
 */
function hideHomeErrorPopups() {
    var popups = ['failedLoadPopup', 'loginRequiredPopup', 'noChannelsPopup'];
    popups.forEach(function(id) {
        var popup = document.getElementById(id);
        if (popup) popup.style.display = 'none';
    });
    homeErrorPopupOpen = false;
}

// Initialize error popup retry buttons
document.addEventListener('DOMContentLoaded', function() {
    // Failed to Load - Retry
    var retryLoadBtn = document.getElementById('retryLoadBtn');
    if (retryLoadBtn) {
        retryLoadBtn.addEventListener('click', function() {
            hideHomeErrorPopups();
            loadHomeLanguages();
        });
    }

    // Login Required - Retry (redirect to login)
    var retryLoginBtn = document.getElementById('retryLoginBtn');
    if (retryLoginBtn) {
        retryLoginBtn.addEventListener('click', function() {
            hideHomeErrorPopups();
            window.location.href = 'login.html';
        });
    }

    // No Channels - Retry
    var retryNoChannelsBtn = document.getElementById('retryNoChannelsBtn');
    if (retryNoChannelsBtn) {
        retryNoChannelsBtn.addEventListener('click', function() {
            hideHomeErrorPopups();
            loadHomeLanguages();
        });
    }
});

// ==========================================
// LCN-BASED DIRECT PLAYBACK FROM HOME
// ==========================================

/**
 * Play a channel directly by its LCN number from the home page search
 * @param {Number} lcn - The LCN number to play
 */
function playChannelByLCNFromHome(lcn) {
    console.log("[HOME] Playing channel by LCN:", lcn);

    BBNL_API.getChannelList()
        .then(function(channels) {
            if (!channels || !Array.isArray(channels)) {
                alert("Channel " + lcn + " not found");
                return;
            }

            var channel = channels.find(function(ch) {
                var chNo = parseInt(ch.channelno || ch.urno || ch.chno || ch.ch_no || 0, 10);
                return chNo === lcn;
            });

            if (channel) {
                console.log("[HOME] Found LCN", lcn, ":", channel.chtitle || channel.channel_name);
                BBNL_API.playChannel(channel);
            } else {
                console.warn("[HOME] LCN", lcn, "not found");
                alert("Channel " + lcn + " not found");
            }
        })
        .catch(function(error) {
            console.error("[HOME] LCN lookup failed:", error);
            alert("Channel " + lcn + " not found");
        });
}

// ==========================================
// DEFAULT CHANNEL AUTO-TUNE (LCN 999)
// ==========================================

/**
 * Auto-tune to Info Channel (LCN 999) on first app launch
 * Only triggers once per session to avoid interrupting user navigation
 */
function autoTuneDefaultChannel() {
    // Only auto-tune once per session
    if (sessionStorage.getItem('autoTuneCompleted')) {
        console.log("[HOME] Auto-tune already completed this session");
        return;
    }

    console.log("[HOME] Auto-tuning to default channel (LCN 999)...");

    BBNL_API.getChannelList()
        .then(function(channels) {
            if (!channels || !Array.isArray(channels) || channels.length === 0) {
                console.log("[HOME] No channels available for auto-tune");
                return;
            }

            // Find channel with LCN 999 (Info Channel)
            var defaultChannel = channels.find(function(ch) {
                var chNo = parseInt(ch.channelno || ch.urno || ch.chno || ch.ch_no || 0, 10);
                return chNo === 999;
            });

            if (defaultChannel) {
                console.log("[HOME] Found Info Channel (LCN 999):", defaultChannel.chtitle || defaultChannel.channel_name);
                sessionStorage.setItem('autoTuneCompleted', 'true');
                BBNL_API.playChannel(defaultChannel);
            } else {
                console.log("[HOME] Info Channel (LCN 999) not found in channel list");
                sessionStorage.setItem('autoTuneCompleted', 'true');
            }
        })
        .catch(function(error) {
            console.error("[HOME] Auto-tune failed:", error);
            sessionStorage.setItem('autoTuneCompleted', 'true');
        });
}

// ==========================================
// PAGE LOAD - INITIALIZE ALL FEATURES
// ==========================================

// Load ads, languages, and channels after page is ready (non-blocking)
window.addEventListener('load', function () {
    // Initialize dark mode
    initDarkMode();

    // Initialize network status
    initNetworkStatus();

    // Check app lock status first
    setTimeout(checkAppLockStatus, 50);

    // Send TRP data for analytics
    setTimeout(sendTRPDataOnLoad, 200);

    // Use setTimeout to ensure they load after critical content
    setTimeout(loadHomeAds, 100);
    setTimeout(loadHomeLanguages, 150); // Load languages

    // NOTE: FOFI channel (LCN 999) auto-play has been MOVED to TV Channel page
    // It will play only ONCE when user first visits the TV Channel page
    // This ensures Home page loads without auto-playback interruption
    console.log("[HOME] Home page loaded - No auto-channel playback on home");

});
