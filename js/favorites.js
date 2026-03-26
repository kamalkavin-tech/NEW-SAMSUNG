/* ================================
   BBNL IPTV - FAVORITES CONTROLLER
   ================================ */

// Check authentication - redirect to login if never logged in
// NOTE: Never remove hasLoggedInOnce — it must persist across HOME relaunch.
(function checkAuth() {
    var hasLoggedInOnce = localStorage.getItem("hasLoggedInOnce");
    if (hasLoggedInOnce !== "true") {
        console.log("[Auth] User has never logged in, redirecting to login...");
        window.location.replace("login.html");
        return;
    }
    try {
        var ud = localStorage.getItem("bbnl_user");
        if (!ud || !JSON.parse(ud).userid) {
            console.log("[Auth] bbnl_user invalid - redirecting to login for re-auth");
            window.location.replace("login.html");
            return;
        }
    } catch (e) {
        console.error("[Auth] Corrupted session data - redirecting to login:", e);
        window.location.replace("login.html");
        return;
    }
})();

var focusables = [];
var currentFocus = 0;
var allChannels = [];
var comingSoonPopupOpen = false;

window.onload = function () {
    console.log("=== BBNL Favorites Page Initialized ===");

    // Show Coming Soon popup immediately
    showComingSoonPopup();

    // 1. Select Focusables
    focusables = document.querySelectorAll(".focusable");

    // 2. Set Initial Focus on Go Back button
    var goBackBtn = document.getElementById("goBackBtn");
    if (goBackBtn) {
        goBackBtn.focus();
    } else if (focusables.length > 0) {
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
            if (el.classList.contains('back-btn') || el.id === 'goBackBtn') {
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

/**
 * Show Coming Soon popup
 */
function showComingSoonPopup() {
    var popup = document.getElementById("comingSoonPopup");
    if (popup) {
        // Load error image if available
        var img = document.getElementById("errorImg_comingSoonFav");
        if (img && typeof ErrorImagesAPI !== 'undefined') {
            if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, ErrorImagesAPI.getImageUrl('COMING_SOON_OTT'));
            } else {
                img.src = ErrorImagesAPI.getImageUrl('COMING_SOON_OTT');
            }
        }
        popup.style.display = "flex";
        comingSoonPopupOpen = true;

        // Focus the Go Back button
        var goBackBtn = document.getElementById("goBackBtn");
        if (goBackBtn) {
            goBackBtn.focus();
            focusables = [goBackBtn];
            currentFocus = 0;
        }
    }
}

/**
 * Load channels from API for favorites page
 */
function loadFavoriteChannels() {
    console.log("[Favorites] Loading channels from API...");

    var grid = document.getElementById('favoritesGrid');
    if (grid) {
        grid.innerHTML = '<div class="loading-spinner" style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(255,255,255,0.5);">Loading channels...</div>';
    }

    BBNL_API.getChannelList()
        .then(function (channels) {
            console.log("[Favorites] Channels fetched:", channels ? channels.length : 0);

            if (channels && Array.isArray(channels) && channels.length > 0) {
                allChannels = channels;
                renderFavoriteChannels(channels);
            } else {
                renderEmptyState();
            }
        })
        .catch(function (error) {
            console.error("[Favorites] Failed to load channels:", error);
            renderEmptyState();
        });
}

/**
 * Render channels in the favorites grid
 */
function renderFavoriteChannels(channels) {
    var grid = document.getElementById('favoritesGrid');
    if (!grid) return;

    grid.innerHTML = '';

    channels.forEach(function (channel) {
        var channelName = channel.chtitle || channel.channel_name || "Channel";
        var channelLogo = channel.chlogo || channel.chnllogo || channel.logo_url || channel.channel_logo || channel.logo || "";
        if (typeof BBNL_API !== 'undefined' && BBNL_API.getValidatedImageUrl) {
            channelLogo = BBNL_API.getValidatedImageUrl(channelLogo);
        } else if (typeof BBNL_API !== 'undefined' && BBNL_API.resolveAssetUrl) {
            channelLogo = BBNL_API.resolveAssetUrl(channelLogo);
        }
        var streamLink = channel.streamlink || channel.channel_url || "";
        var channelNo = channel.channelno || channel.channel_no || "";

        var group = document.createElement('div');
        group.className = 'channel-group';

        var card = document.createElement('div');
        card.className = 'channel-card focusable';
        card.tabIndex = 0;
        card.setAttribute('data-channel', channelName);
        card.dataset.streamlink = streamLink;
        card.dataset.logo = channelLogo;
        card.dataset.channelno = channelNo;

        var iconDiv = document.createElement('div');
        iconDiv.className = 'channel-icon';

        if (channelLogo && !channelLogo.includes('chnlnoimage')) {
            var img = document.createElement('img');
            if (typeof BBNL_API !== 'undefined' && BBNL_API.setImageSource) {
                BBNL_API.setImageSource(img, channelLogo);
            } else {
                img.src = channelLogo;
            }
            img.alt = channelName;
            img.onerror = function () {
                var span = document.createElement('span');
                span.style.cssText = 'color: white; font-weight: bold; font-size: 16px;';
                span.textContent = channelName.substring(0, 10);
                iconDiv.innerHTML = '';
                iconDiv.appendChild(span);
            };
            iconDiv.appendChild(img);
        } else {
            var nameSpan = document.createElement('span');
            nameSpan.style.color = 'white';
            nameSpan.style.fontWeight = 'bold';
            nameSpan.style.fontSize = '16px';
            nameSpan.style.textAlign = 'center';
            nameSpan.innerText = channelName.substring(0, 15);
            iconDiv.appendChild(nameSpan);
        }

        card.appendChild(iconDiv);
        group.appendChild(card);

        var title = document.createElement('div');
        title.className = 'card-title-bottom';
        title.innerText = channelName;
        group.appendChild(title);

        var subtitle = document.createElement('div');
        subtitle.className = 'card-subtitle-bottom';
        subtitle.innerText = 'Live Channels';
        group.appendChild(subtitle);

        grid.appendChild(group);
    });

    // Refresh focusables after rendering
    refreshFocusables();
    console.log("[Favorites] Rendered " + channels.length + " channels");
}

/**
 * Render empty state when no channels available
 */
function renderEmptyState() {
    var grid = document.getElementById('favoritesGrid');
    if (!grid) return;

    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: rgba(255,255,255,0.5);"><p style="font-size: 18px;">No channels available</p><p style="font-size: 14px; margin-top: 10px;">Please check back later</p></div>';
}

/**
 * Refresh focusable elements after dynamic content load
 */
function refreshFocusables() {
    focusables = document.querySelectorAll(".focusable");

    focusables.forEach(function (el, index) {
        el.addEventListener("mouseenter", function () {
            currentFocus = index;
            el.focus();
        });

        el.addEventListener("click", function () {
            handleEnter(el);
        });
    });

    // Focus first channel card if available
    var firstCard = document.querySelector('#favoritesGrid .channel-card.focusable');
    if (firstCard) {
        var idx = Array.from(focusables).indexOf(firstCard);
        if (idx >= 0) {
            currentFocus = idx;
            firstCard.focus();
        }
    }
}

document.addEventListener("keydown", function (e) {
    var code = e.keyCode;

    // Lock remote navigation to popup controls only.
    if (comingSoonPopupOpen) {
        e.preventDefault();
        if (code === 13 || code === 10009) {
            window.location.href = "home.html";
        }
        return;
    }

    if (code === 10009) { // Back
        e.preventDefault();
        window.location.href = "home.html";
        return;
    }

    // Prevent default for navigation keys
    if ([37, 38, 39, 40, 13].indexOf(code) !== -1) {
        e.preventDefault();
    }

    // Compute grid columns dynamically from CSS
    var columnsPerRow = 5;
    var grid = document.querySelector('#favoritesGrid');
    if (grid) {
        var computedStyle = window.getComputedStyle(grid);
        var columns = computedStyle.gridTemplateColumns.split(' ').length;
        if (columns > 0) columnsPerRow = columns;
    }

    if (code === 37) moveFocus(-1);           // LEFT
    if (code === 38) moveFocus(-columnsPerRow); // UP - dynamic grid step
    if (code === 39) moveFocus(1);             // RIGHT
    if (code === 40) moveFocus(columnsPerRow);  // DOWN - dynamic grid step

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

    if (el.classList.contains('back-btn') || el.id === 'goBackBtn') {
        window.location.href = "home.html";
        return;
    }

    if (el.classList.contains('filter-chip')) {
        document.querySelectorAll('.filter-chip').forEach(function (f) { f.classList.remove('active'); });
        el.classList.add('active');
        return;
    }

    if (el.classList.contains('channel-card')) {
        var streamlink = el.dataset.streamlink;
        var channelName = el.getAttribute('data-channel');
        var logo = el.dataset.logo;
        var channelno = el.dataset.channelno;

        if (streamlink) {
            // Navigate to player with channel data
            BBNL_API.playChannel({
                chtitle: channelName,
                streamlink: streamlink,
                chlogo: logo,
                channelno: channelno
            });
        }
        return;
    }
}
