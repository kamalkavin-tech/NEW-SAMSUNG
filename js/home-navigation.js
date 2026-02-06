/* ================================
   BBNL IPTV - TV REMOTE NAVIGATION SYSTEM
   Optimized for Samsung Tizen TV Remote Control

   Navigation Flow:
   1. Initial: Home icon in sidebar
   2. DOWN in sidebar: Home → Channels → OTT → Notify → Feedback
   3. RIGHT from sidebar: Move to Header (Search → Settings)
   4. DOWN from last sidebar item (Feedback): Move to OTT Apps content
   5. RIGHT from last sidebar item (Feedback): Move to OTT Apps content
   6. RIGHT in content: Horizontal card navigation
   7. DOWN from OTT Apps: Move to Live TV Channels
   8. UP from content: Return to last visited sidebar item
   9. LEFT from content/header: Back to Sidebar
   ================================ */

// Navigation State
var navigationState = {
    currentZone: 'sidebar',  // 'sidebar', 'header', 'ott', 'channels'
    currentSection: null,
    previousZone: null,
    lastSidebarIndex: 0,      // Track last visited sidebar item for UP navigation
    sidebarCompleted: false   // Track if user has navigated to bottom of sidebar
};

// Initialize navigation on page load
function initTVNavigation() {
    console.log('[TV Navigation] Initializing...');

    // Set initial focus on Home icon in sidebar
    var homeIcon = document.querySelector('.sidebar-icon-btn[data-route="home.html"]');
    if (homeIcon) {
        homeIcon.focus();
        navigationState.currentZone = 'sidebar';
        console.log('[TV Navigation] Initial focus set to Home icon');
    }

    // Add focus event listeners to track zone changes
    addZoneTrackingListeners();
}

// Add listeners to track which zone is focused
function addZoneTrackingListeners() {
    // Sidebar elements - track index for returning from content
    var sidebarBtns = document.querySelectorAll('.sidebar-icon-btn');
    sidebarBtns.forEach(function(btn, index) {
        btn.addEventListener('focus', function() {
            navigationState.currentZone = 'sidebar';
            navigationState.lastSidebarIndex = index;
            // Check if at last sidebar item (sidebar completed)
            navigationState.sidebarCompleted = (index === sidebarBtns.length - 1);
            console.log('[TV Navigation] Zone: Sidebar, Index:', index, 'Completed:', navigationState.sidebarCompleted);
        });
    });

    // Header elements (search input and settings button)
    var headerElements = document.querySelectorAll('.search-input, .header-icon-btn');
    headerElements.forEach(function(el) {
        el.addEventListener('focus', function() {
            navigationState.currentZone = 'header';
            console.log('[TV Navigation] Zone: Header');
        });
    });

    // Language cards and Channel cards - use event delegation
    document.addEventListener('focus', function(e) {
        var target = e.target;

        // Check if it's a language card in Languages section
        if (target.classList.contains('channel-card')) {
            var section = target.closest('.content-section');
            if (section) {
                var title = section.querySelector('.section-title');
                if (title && title.textContent.includes('Language')) {
                    navigationState.currentZone = 'languages';
                    console.log('[TV Navigation] Zone: Languages');
                    return;
                }
            }
        }

        // Check if it's a channel card in Channels section
        if (target.classList.contains('channel-card')) {
            var section = target.closest('.content-section');
            if (section) {
                var title = section.querySelector('.section-title');
                if (title && (title.textContent.includes('Channel') || title.textContent.includes('Live'))) {
                    navigationState.currentZone = 'channels';
                    console.log('[TV Navigation] Zone: Channels');
                }
            }
        }
    }, true);
}

// Handle DOWN key navigation
function handleDownNavigation() {
    var activeElement = document.activeElement;
    console.log('[DOWN] Current zone:', navigationState.currentZone);

    if (navigationState.currentZone === 'sidebar') {
        // DOWN in sidebar: Move through all sidebar icons first
        var sidebarBtns = Array.from(document.querySelectorAll('.sidebar-icon-btn:not([style*="display: none"])'));
        var currentIndex = sidebarBtns.indexOf(activeElement);

        if (currentIndex < sidebarBtns.length - 1) {
            // Move to next sidebar icon
            sidebarBtns[currentIndex + 1].focus();
            console.log('[DOWN] Moving to next sidebar icon:', currentIndex + 1);
        } else {
            // At last sidebar icon (Feedback), move to Languages content
            console.log('[DOWN] At last sidebar icon, moving to Languages content');
            moveToFirstLanguagePill();
        }
    } else if (navigationState.currentZone === 'header') {
        // DOWN from header: Move to first language pill
        console.log('[DOWN] From header, moving to Languages content');
        moveToFirstLanguagePill();
    } else if (navigationState.currentZone === 'languages') {
        // DOWN in Languages: Move to first channel card
        console.log('[DOWN] From Languages, moving to Channels');
        moveToFirstChannelCard();
    } else if (navigationState.currentZone === 'channels') {
        // DOWN in channels: Move within channel grid
        moveWithinChannelGrid(0, 1);
    }
}

// Handle UP key navigation
function handleUpNavigation() {
    var activeElement = document.activeElement;
    console.log('[UP] Current zone:', navigationState.currentZone);

    if (navigationState.currentZone === 'sidebar') {
        // UP in sidebar: Move to previous sidebar icon
        var sidebarBtns = Array.from(document.querySelectorAll('.sidebar-icon-btn:not([style*="display: none"])'));
        var currentIndex = sidebarBtns.indexOf(activeElement);

        if (currentIndex > 0) {
            sidebarBtns[currentIndex - 1].focus();
            console.log('[UP] Moving to previous sidebar icon:', currentIndex - 1);
        }
    } else if (navigationState.currentZone === 'header') {
        // UP in header: Stay in header, do nothing (already at top)
        console.log('[UP] Already at header top');
    } else if (navigationState.currentZone === 'languages') {
        // UP in Languages: Return to last visited sidebar item
        console.log('[UP] At Languages, returning to Sidebar (last index:', navigationState.lastSidebarIndex, ')');
        moveToSidebarByIndex(navigationState.lastSidebarIndex);
    } else if (navigationState.currentZone === 'channels') {
        // UP in channels: Try to move within channel grid, or go to Languages
        var moved = moveWithinChannelGrid(0, -1);
        if (!moved) {
            // At top of channels section, move to Languages section
            console.log('[UP] At top of Channels, moving to Languages');
            moveToFirstLanguagePill();
        }
    }
}

// Handle LEFT key navigation
function handleLeftNavigation() {
    var activeElement = document.activeElement;
    console.log('[LEFT] Current zone:', navigationState.currentZone);

    if (navigationState.currentZone === 'sidebar') {
        // Already in sidebar, do nothing
        console.log('[LEFT] Already in sidebar');
        return;
    } else if (navigationState.currentZone === 'header') {
        // LEFT in header: Move between settings and search, then to sidebar
        var headerElements = Array.from(document.querySelectorAll('.search-input, .header-icon-btn'));
        var currentIndex = headerElements.indexOf(activeElement);

        if (currentIndex > 0) {
            headerElements[currentIndex - 1].focus();
        } else {
            // At leftmost header item (search), move to sidebar at last visited index
            console.log('[LEFT] At leftmost header, moving to Sidebar (last index:', navigationState.lastSidebarIndex, ')');
            moveToSidebarByIndex(navigationState.lastSidebarIndex);
        }
    } else if (navigationState.currentZone === 'languages') {
        // LEFT in Languages: Move within row, or go to sidebar
        var moved = moveWithinLanguages(-1);
        if (!moved) {
            // At leftmost language pill, move to sidebar at last visited index
            console.log('[LEFT] At leftmost language pill, moving to Sidebar (last index:', navigationState.lastSidebarIndex, ')');
            moveToSidebarByIndex(navigationState.lastSidebarIndex);
        }
    } else if (navigationState.currentZone === 'channels') {
        // LEFT in channels: Move within row, or go to sidebar
        var moved = moveWithinChannelGrid(-1, 0);
        if (!moved) {
            // At leftmost channel card, move to sidebar at last visited index
            console.log('[LEFT] At leftmost channel card, moving to Sidebar (last index:', navigationState.lastSidebarIndex, ')');
            moveToSidebarByIndex(navigationState.lastSidebarIndex);
        }
    }
}

// Handle RIGHT key navigation
function handleRightNavigation() {
    var activeElement = document.activeElement;
    console.log('[RIGHT] Current zone:', navigationState.currentZone);

    if (navigationState.currentZone === 'sidebar') {
        // Check if at the last sidebar item (Feedback)
        var sidebarBtns = Array.from(document.querySelectorAll('.sidebar-icon-btn:not([style*="display: none"])'));
        var currentIndex = sidebarBtns.indexOf(activeElement);
        var isAtLastSidebarItem = (currentIndex === sidebarBtns.length - 1);

        if (isAtLastSidebarItem) {
            // RIGHT from last sidebar item (Feedback): Move to Languages content
            console.log('[RIGHT] From last sidebar item, moving to Languages content');
            moveToFirstLanguagePill();
        } else {
            // RIGHT from sidebar (not at bottom): Move to Header
            console.log('[RIGHT] From sidebar, moving to Header');
            moveToHeader();
        }
    } else if (navigationState.currentZone === 'header') {
        // RIGHT in header: Move between search and settings
        var headerElements = Array.from(document.querySelectorAll('.search-input, .header-icon-btn'));
        var currentIndex = headerElements.indexOf(activeElement);

        if (currentIndex < headerElements.length - 1) {
            headerElements[currentIndex + 1].focus();
        }
    } else if (navigationState.currentZone === 'languages') {
        // RIGHT in Languages: Move within row (horizontal navigation)
        moveWithinLanguages(1);
    } else if (navigationState.currentZone === 'channels') {
        // RIGHT in channels: Move within row (horizontal navigation)
        moveWithinChannelGrid(1, 0);
    }
}

// Helper: Move to first language card
function moveToFirstLanguagePill() {
    // Find the Languages section
    var sections = document.querySelectorAll('.content-section');
    var langSection = null;

    sections.forEach(function(section) {
        var title = section.querySelector('.section-title');
        if (title && title.textContent.includes('Language')) {
            langSection = section;
        }
    });

    if (langSection) {
        var firstCard = langSection.querySelector('.channel-card');
        if (firstCard) {
            firstCard.focus();
            scrollIntoViewSmooth(firstCard);
            navigationState.currentZone = 'languages';
            console.log('[NAV] Moved to first language card');
            return;
        }
    }

    // Fallback: try container
    var container = document.getElementById('home-languages-container');
    if (container) {
        var card = container.querySelector('.channel-card');
        if (card) {
            card.focus();
            scrollIntoViewSmooth(card);
            navigationState.currentZone = 'languages';
        }
    }
}

// Helper: Move within languages (horizontal navigation using grid)
function moveWithinLanguages(delta) {
    var activeElement = document.activeElement;
    var container = document.getElementById('home-languages-container');
    
    if (!container) return false;

    var cards = Array.from(container.querySelectorAll('.channel-card'));
    var currentIndex = cards.indexOf(activeElement);

    if (currentIndex < 0) return false;

    var newIndex = currentIndex + delta;

    // Check bounds
    if (newIndex < 0 || newIndex >= cards.length) return false;

    cards[newIndex].focus();
    scrollIntoViewSmooth(cards[newIndex]);
    return true;
}

// Helper: Move to first channel card
function moveToFirstChannelCard() {
    // Find the Live TV Channels section
    var sections = document.querySelectorAll('.content-section');
    var channelSection = null;

    sections.forEach(function(section) {
        var title = section.querySelector('.section-title');
        if (title && (title.textContent.includes('Channel') || title.textContent.includes('Live'))) {
            channelSection = section;
        }
    });

    if (channelSection) {
        var firstCard = channelSection.querySelector('.channel-card');
        if (firstCard) {
            firstCard.focus();
            scrollIntoViewSmooth(firstCard);
            navigationState.currentZone = 'channels';
            console.log('[NAV] Moved to first channel card');
            return;
        }
    }

    // Fallback: try any channel card
    var anyChannelCard = document.querySelector('.channel-card');
    if (anyChannelCard) {
        anyChannelCard.focus();
        scrollIntoViewSmooth(anyChannelCard);
        navigationState.currentZone = 'channels';
    }
}

// Helper: Move to header (search input)
function moveToHeader() {
    var searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.focus();
        navigationState.currentZone = 'header';
        console.log('[NAV] Moved to header (search)');
        
        // Scroll to show ads banner when navigating to search
        var heroBanner = document.querySelector('.hero-banner');
        var mainContent = document.querySelector('.main-content');
        if (heroBanner && mainContent) {
            mainContent.scrollTop = 0;
            console.log('[NAV] Scrolled to show ads banner');
        } else if (mainContent) {
            mainContent.scrollTop = 0;
        }
    }
}

// Helper: Move to active sidebar icon
function moveToActiveSidebarIcon() {
    var activeSidebarBtn = document.querySelector('.sidebar-icon-btn.active');
    if (!activeSidebarBtn) {
        activeSidebarBtn = document.querySelector('.sidebar-icon-btn');
    }
    if (activeSidebarBtn) {
        activeSidebarBtn.focus();
        navigationState.currentZone = 'sidebar';
        console.log('[NAV] Moved to sidebar');
    }
}

// Helper: Move to sidebar by index (for returning from content)
function moveToSidebarByIndex(index) {
    var sidebarBtns = Array.from(document.querySelectorAll('.sidebar-icon-btn:not([style*="display: none"])'));

    // Ensure index is within bounds
    if (index < 0) index = 0;
    if (index >= sidebarBtns.length) index = sidebarBtns.length - 1;

    if (sidebarBtns[index]) {
        sidebarBtns[index].focus();
        navigationState.currentZone = 'sidebar';
        navigationState.lastSidebarIndex = index;
        console.log('[NAV] Moved to sidebar index:', index);
    }
}

// Helper: Move within channel grid
function moveWithinChannelGrid(deltaX, deltaY) {
    var activeElement = document.activeElement;

    // Find the Channels section
    var sections = document.querySelectorAll('.content-section');
    var channelSection = null;

    sections.forEach(function(section) {
        var title = section.querySelector('.section-title');
        if (title && (title.textContent.includes('Channel') || title.textContent.includes('Live'))) {
            channelSection = section;
        }
    });

    if (!channelSection) return false;

    var cards = Array.from(channelSection.querySelectorAll('.channel-card'));
    var currentIndex = cards.indexOf(activeElement);

    if (currentIndex < 0) return false;

    // Determine grid columns (default 5)
    var grid = channelSection.querySelector('.channels-grid');
    var columnsPerRow = 5;

    if (grid) {
        var computedStyle = window.getComputedStyle(grid);
        var columns = computedStyle.gridTemplateColumns.split(' ').length;
        if (columns > 0) columnsPerRow = columns;
    }

    // Calculate new position
    var currentRow = Math.floor(currentIndex / columnsPerRow);
    var currentCol = currentIndex % columnsPerRow;

    var newRow = currentRow + deltaY;
    var newCol = currentCol + deltaX;

    // Check bounds
    if (newCol < 0 || newCol >= columnsPerRow) return false;
    if (newRow < 0) return false;

    var newIndex = newRow * columnsPerRow + newCol;

    // Check if new index is valid
    if (newIndex >= 0 && newIndex < cards.length) {
        cards[newIndex].focus();
        scrollIntoViewSmooth(cards[newIndex]);
        return true;
    }

    return false;
}

// Helper: Smooth scroll element into view
function scrollIntoViewSmooth(element) {
    if (element) {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
        });
    }
}

// Export navigation handlers
window.TVNavigation = {
    init: initTVNavigation,
    handleDown: handleDownNavigation,
    handleUp: handleUpNavigation,
    handleLeft: handleLeftNavigation,
    handleRight: handleRightNavigation
};
