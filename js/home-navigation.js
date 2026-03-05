/* ================================
   BBNL IPTV - TV REMOTE NAVIGATION SYSTEM
   Optimized for Samsung Tizen TV Remote Control

   Navigation Flow:
   ┌─────────┬──────────────────────────────────┐
   │ SIDEBAR │  HEADER: [Search]     [Settings] │
   │ [Home]──┼──RIGHT──►              │          │
   │   ▼     │                     DOWN          │
   │ [Chan]  │  [L1] [L2] [L3] [L4]  ▼          │
   │   ▼     │   ▼                               │
   │ [OTT]   │  [L5] [L6] [L7] [→All]           │
   │   ▼     │   ▲                               │
   │ [Feed]──┼──DOWN──► Cards                    │
   └─────────┴──────────────────────────────────┘

   SIDEBAR:  UP/DOWN = icons, RIGHT = header
             DOWN from last icon = cards
   CARDS:    UP/DOWN = rows, LEFT/RIGHT = columns
             LEFT from col 1 = sidebar
             UP from row 1 = header
   HEADER:   LEFT/RIGHT = search ↔ settings
             DOWN = cards, LEFT from search = sidebar
   ================================ */

// Grid columns for the language cards — must match CSS: repeat(4, 1fr)
var GRID_COLS = 4;

// Navigation State
var navState = {
    zone: 'sidebar',        // 'sidebar', 'header', 'cards'
    lastSidebarIndex: 0,    // Remember sidebar position
    lastCardIndex: 0        // Remember card position when leaving cards
};

// ==========================================
// INITIALIZATION
// ==========================================

function initTVNavigation() {
    console.log('[NAV] Initializing TV Navigation...');

    // Set initial focus on Home icon in sidebar
    var homeIcon = document.querySelector('.sidebar-icon-btn[data-route="home.html"]');
    if (homeIcon) {
        homeIcon.focus();
        navState.zone = 'sidebar';
        navState.lastSidebarIndex = 0;
        console.log('[NAV] Initial focus: Home icon');
    }
}

// ==========================================
// HELPERS - Get elements
// ==========================================

function getSidebarBtns() {
    return Array.from(document.querySelectorAll('.sidebar-icon-btn'));
}

function getHeaderElements() {
    return Array.from(document.querySelectorAll('.search-input, .header-icon-btn'));
}

function getCards() {
    var container = document.getElementById('home-languages-container');
    if (!container) return [];
    // Support both channel-card and language-item (home page uses language-item)
    var cards = Array.from(container.querySelectorAll('.channel-card, .language-item'));
    return cards;
}

function getSidebarIndex(el) {
    return getSidebarBtns().indexOf(el);
}

function getHeaderIndex(el) {
    return getHeaderElements().indexOf(el);
}

function getCardIndex(el) {
    return getCards().indexOf(el);
}

// Get row and column from card index
function getCardRow(index) {
    return Math.floor(index / GRID_COLS);
}

function getCardCol(index) {
    return index % GRID_COLS;
}

function getCardByRowCol(row, col) {
    var cards = getCards();
    var index = row * GRID_COLS + col;
    if (index >= 0 && index < cards.length) {
        return { card: cards[index], index: index };
    }
    return null;
}

function getTotalRows() {
    var cards = getCards();
    if (cards.length === 0) return 0;
    return Math.ceil(cards.length / GRID_COLS);
}

// Scroll element into view within the main content container with padding for focus effect
function scrollToElement(el) {
    if (!el) return;

    var container = document.querySelector('.main-content');
    if (!container) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        return;
    }

    var containerRect = container.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();

    // Extra space for the focus transform (scale + translateY + shadow)
    var focusPadding = 30;

    // Check if element is above visible area
    if (elRect.top - focusPadding < containerRect.top) {
        var scrollOffset = elRect.top - containerRect.top - focusPadding;
        container.scrollTop += scrollOffset;
    }
    // Check if element is below visible area
    else if (elRect.bottom + focusPadding > containerRect.bottom) {
        var scrollOffset = elRect.bottom - containerRect.bottom + focusPadding;
        container.scrollTop += scrollOffset;
    }
}

// Focus a card and update state
function focusCard(index) {
    var cards = getCards();
    if (index >= 0 && index < cards.length) {
        cards[index].focus();
        navState.zone = 'cards';
        navState.lastCardIndex = index;
        scrollToElement(cards[index]);
        console.log('[NAV] Card focused:', index, '(row:', getCardRow(index), 'col:', getCardCol(index), ')');
        return true;
    }
    return false;
}

// Focus a sidebar button and update state
function focusSidebar(index) {
    var btns = getSidebarBtns();
    if (index < 0) index = 0;
    if (index >= btns.length) index = btns.length - 1;
    if (btns[index]) {
        btns[index].focus();
        navState.zone = 'sidebar';
        navState.lastSidebarIndex = index;
        console.log('[NAV] Sidebar focused:', index);
        return true;
    }
    return false;
}

// Focus a header element and update state
function focusHeader(index) {
    var els = getHeaderElements();
    if (index < 0) index = 0;
    if (index >= els.length) index = els.length - 1;
    if (els[index]) {
        els[index].focus();
        navState.zone = 'header';
        // Scroll to top to show banner
        var mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.scrollTop = 0;
        console.log('[NAV] Header focused:', index);
        return true;
    }
    return false;
}

// ==========================================
// DOWN KEY
// ==========================================

function handleDownNavigation() {
    var active = document.activeElement;
    console.log('[DOWN] Zone:', navState.zone);

    if (navState.zone === 'sidebar') {
        // DOWN in sidebar: move to next icon, at last icon jump to cards
        var btns = getSidebarBtns();
        var idx = btns.indexOf(active);
        if (idx >= 0 && idx < btns.length - 1) {
            focusSidebar(idx + 1);
        } else if (idx === btns.length - 1) {
            // At last sidebar icon: DOWN goes to first language card
            var cards = getCards();
            if (cards.length > 0) {
                console.log('[DOWN] Last sidebar icon → First Language Card');
                focusCard(0);
            } else {
                console.log('[DOWN] No cards loaded yet');
            }
        }
    }
    else if (navState.zone === 'header') {
        // DOWN from header: go to first card (row 0, col 0)
        console.log('[DOWN] Header → Cards');
        focusCard(0);
    }
    else if (navState.zone === 'cards') {
        // DOWN in cards: move to same column in next row
        var idx = getCardIndex(active);
        if (idx < 0) return;

        var row = getCardRow(idx);
        var col = getCardCol(idx);
        var nextRow = row + 1;
        var totalRows = getTotalRows();

        if (nextRow < totalRows) {
            var target = getCardByRowCol(nextRow, col);
            if (target) {
                focusCard(target.index);
            } else {
                // Column doesn't exist in next row (e.g., last row has fewer cards)
                // Focus last card in next row
                var cards = getCards();
                var lastInNextRow = Math.min((nextRow + 1) * GRID_COLS - 1, cards.length - 1);
                focusCard(lastInNextRow);
            }
        }
        // At last row: stop
    }
}

// ==========================================
// UP KEY
// ==========================================

function handleUpNavigation() {
    var active = document.activeElement;
    console.log('[UP] Zone:', navState.zone);

    if (navState.zone === 'sidebar') {
        // UP in sidebar: move to previous icon, stop at first
        var btns = getSidebarBtns();
        var idx = btns.indexOf(active);
        if (idx > 0) {
            focusSidebar(idx - 1);
        }
        // At first icon: stop
    }
    else if (navState.zone === 'header') {
        // UP from header: nowhere to go, stop
        console.log('[UP] Already at top (header)');
    }
    else if (navState.zone === 'cards') {
        // UP in cards: move to same column in previous row
        var idx = getCardIndex(active);
        if (idx < 0) return;

        var row = getCardRow(idx);
        var col = getCardCol(idx);

        if (row > 0) {
            // Move to previous row, same column
            var target = getCardByRowCol(row - 1, col);
            if (target) {
                focusCard(target.index);
            }
        } else {
            // At row 0: UP goes to sidebar (last icon) - NOT header
            console.log('[UP] Cards row 0 → Sidebar (last icon)');
            var btns = getSidebarBtns();
            focusSidebar(btns.length - 1);
        }
    }
}

// ==========================================
// LEFT KEY
// ==========================================

function handleLeftNavigation() {
    var active = document.activeElement;
    console.log('[LEFT] Zone:', navState.zone);

    if (navState.zone === 'sidebar') {
        // Already at leftmost, do nothing
        console.log('[LEFT] Already in sidebar');
    }
    else if (navState.zone === 'header') {
        // LEFT in header: move between elements, then to sidebar
        var els = getHeaderElements();
        var idx = els.indexOf(active);

        if (idx > 0) {
            // Move to previous header element (Settings → Search)
            focusHeader(idx - 1);
        } else {
            // At Search (leftmost): go to sidebar
            console.log('[LEFT] Header → Sidebar');
            focusSidebar(navState.lastSidebarIndex);
        }
    }
    else if (navState.zone === 'cards') {
        // LEFT in cards: move to previous card in row
        var idx = getCardIndex(active);
        if (idx < 0) return;

        var col = getCardCol(idx);

        if (col > 0) {
            // Move left within row
            focusCard(idx - 1);
        } else {
            // At column 0: go to sidebar
            console.log('[LEFT] Cards col 0 → Sidebar');
            focusSidebar(navState.lastSidebarIndex);
        }
    }
}

// ==========================================
// RIGHT KEY
// ==========================================

function handleRightNavigation() {
    var active = document.activeElement;
    console.log('[RIGHT] Zone:', navState.zone);

    if (navState.zone === 'sidebar') {
        // RIGHT from sidebar: go to header (Search)
        console.log('[RIGHT] Sidebar → Header');
        focusHeader(0);
    }
    else if (navState.zone === 'header') {
        // RIGHT in header: move between elements (Search → Settings)
        var els = getHeaderElements();
        var idx = els.indexOf(active);

        if (idx >= 0 && idx < els.length - 1) {
            focusHeader(idx + 1);
        }
        // At last element (Settings): stop
    }
    else if (navState.zone === 'cards') {
        // RIGHT in cards: move to next card in row
        var idx = getCardIndex(active);
        if (idx < 0) return;

        var col = getCardCol(idx);
        var row = getCardRow(idx);

        // Check if next card exists in same row
        var nextIdx = idx + 1;
        var nextCol = col + 1;

        if (nextCol < GRID_COLS && nextIdx < getCards().length) {
            focusCard(nextIdx);
        }
        // At last column or last card: stop
    }
}

// ==========================================
// EXPORT
// ==========================================

window.TVNavigation = {
    init: initTVNavigation,
    handleDown: handleDownNavigation,
    handleUp: handleUpNavigation,
    handleLeft: handleLeftNavigation,
    handleRight: handleRightNavigation
};
