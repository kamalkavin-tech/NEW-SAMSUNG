# Player Screen Auto-Hide Timer Implementation

## ✅ Complete Android TV-Like Behavior Implemented

---

## Overview

Implemented professional DTH-grade auto-hide timer system for both Info Bar and Sidebar with proper inactivity detection, focus management, and Android TV-like behavior.

---

## Auto-Hide Timer Configuration

```javascript
const OVERLAY_HIDE_DELAY = 5000;  // Info Bar: 5 seconds
const SIDEBAR_HIDE_DELAY = 5000;  // Sidebar: 5 seconds

var overlayTimeout = null;         // Info Bar timer
var sidebarInactivityTimer = null; // Sidebar timer
```

---

## 1. INFO BAR BEHAVIOR ✅

### Auto-Hide Logic

**When channel changes:**
```javascript
// In setupPlayer() or channel change function
showOverlay(); // Shows info bar
// Timer starts automatically (5 seconds)
// Auto-hides after 5 seconds
```

**When user presses OK button:**
```javascript
handleOKButton() {
    if (overlay is hidden) {
        showOverlay(); // Show again
        // Start 5-second timer
    } else if (overlay is visible) {
        // Reset 5-second timer
        clearTimeout(overlayTimeout);
        overlayTimeout = setTimeout(hideOverlay, 5000);
    }
}
```

**When user presses any remote key:**
```javascript
document.addEventListener('keydown', function(e) {
    if (!sidebarState.isOpen) {
        showOverlay(); // Resets timer automatically
    }
});
```

### Implementation Details

```javascript
function showOverlay() {
    // Don't show if sidebar is open
    if (sidebarState.isOpen) {
        return;
    }
    
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
    
    // Clear existing timeout
    if (overlayTimeout) {
        clearTimeout(overlayTimeout);
    }
    
    // Set new 5-second timer
    overlayTimeout = setTimeout(function() {
        hideOverlay();
    }, OVERLAY_HIDE_DELAY);
    
    console.log('[InfoBar] Shown, auto-hide timer reset');
}
```

### Key Features

✅ **Auto-hide after 5 seconds**
✅ **Reset timer on any key press**
✅ **OK button shows if hidden**
✅ **OK button resets timer if visible**
✅ **Hidden when sidebar is open**
✅ **Shows on channel change**

---

## 2. SIDEBAR BEHAVIOR ✅

### Auto-Hide Logic

**Sidebar opens:**
```javascript
function openSidebar() {
    sidebarState.isOpen = true;
    sidebar.classList.add('open');
    
    // Focus first category
    focusCategoryItem(0);
    
    // Start 5-second inactivity timer
    resetSidebarInactivityTimer();
    
    console.log("[Sidebar] Opened - auto-hide timer started");
}
```

**User navigates (any key press):**
```javascript
function handleSidebarKeydown(e) {
    if (!sidebarState.isOpen) return false;
    
    // Reset timer on EVERY key press
    resetSidebarInactivityTimer();
    
    // Handle navigation...
}
```

**No key press for 5 seconds:**
```javascript
function resetSidebarInactivityTimer() {
    clearSidebarInactivityTimer();
    
    if (!sidebarState.isOpen) return;
    
    // Start new 5-second timer
    sidebarInactivityTimer = setTimeout(function() {
        console.log("[Sidebar] Inactivity timeout - auto-closing");
        closeSidebar();
    }, SIDEBAR_HIDE_DELAY);
}
```

### Implementation Details

```javascript
function resetSidebarInactivityTimer() {
    // Clear existing timer
    clearSidebarInactivityTimer();
    
    // Only start timer if sidebar is open
    if (!sidebarState.isOpen) return;
    
    // Start new timer
    sidebarInactivityTimer = setTimeout(function() {
        console.log("[Sidebar] Inactivity timeout - auto-closing");
        closeSidebar();
    }, SIDEBAR_HIDE_DELAY);
    
    console.log("[Sidebar] Inactivity timer reset (5 seconds)");
}

function clearSidebarInactivityTimer() {
    if (sidebarInactivityTimer) {
        clearTimeout(sidebarInactivityTimer);
        sidebarInactivityTimer = null;
    }
}
```

### Key Features

✅ **Auto-hide after 5 seconds of NO interaction**
✅ **Stay open while user is navigating**
✅ **Reset timer on every key press**
✅ **Clear timer when manually closed**
✅ **Proper focus management**

---

## 3. FOCUS MANAGEMENT ✅

### Sidebar State

```javascript
var sidebarState = {
    isOpen: false,
    currentMode: 'categories', // 'categories' or 'channels'
    languageIndex: 0,
    categoryFocusIndex: 0,
    channelFocusIndex: 0,
    categories: [],
    channels: [],
    languages: ['All', 'English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada']
};
```

### Focus Lock

**When sidebar is open:**
```javascript
function handleKeydown(e) {
    // Handle sidebar navigation FIRST if sidebar is open
    if (sidebarState.isOpen && handleSidebarKeydown(e)) {
        showOverlay(); // Don't show overlay (prevented in showOverlay)
        return; // Prevent player navigation
    }
    
    // Player navigation only if sidebar is closed
    // ...
}
```

**When sidebar closes:**
```javascript
function closeSidebar() {
    sidebar.classList.add('close');
    
    setTimeout(function() {
        sidebar.classList.remove('open', 'close');
        sidebarState.isOpen = false;
    }, 300);
    
    // Clear timer
    clearSidebarInactivityTimer();
    
    // Focus returns to player automatically
}
```

### Separate Focus States

✅ **languageIndex** - Language selection focus
✅ **categoryFocusIndex** - Category pills focus
✅ **channelFocusIndex** - Channel list focus

**No auto-jump between levels:**
- Move between levels only using UP/DOWN
- LEFT/RIGHT navigate within current level
- Focus state preserved when switching levels

---

## 4. RETURN BUTTON BEHAVIOR ✅

### Android TV-Like Behavior

```javascript
if (code === 10009 || code === 27) { // RETURN / ESC
    e.preventDefault();
    
    // If sidebar is OPEN, close it first
    if (sidebarState.isOpen) {
        closeSidebar();
        console.log('[Player] RETURN pressed - closing sidebar');
        return;
    }
    
    // If sidebar is CLOSED, exit player
    closePlayer();
    console.log('[Player] Navigating back to channels page');
    window.location.href = 'channels.html';
    return;
}
```

### Behavior Summary

✅ **Sidebar OPEN** → RETURN closes sidebar only
✅ **Sidebar CLOSED** → RETURN exits player

---

## 5. NAVIGATION FLOW

### Sidebar Navigation

**Categories Mode:**
- **LEFT/RIGHT**: Navigate between categories
- **UP**: Stay in categories
- **DOWN**: Move to channel list
- **RETURN**: Close sidebar

**Channels Mode:**
- **UP**: Navigate to previous channel (or back to categories if at top)
- **DOWN**: Navigate to next channel
- **LEFT/RIGHT**: Stay in channels
- **ENTER**: Play selected channel
- **RETURN**: Close sidebar

### Timer Behavior During Navigation

```
User opens sidebar
  ↓
Timer starts (5 seconds)
  ↓
User presses LEFT (navigate category)
  ↓
Timer resets (5 seconds)
  ↓
User presses DOWN (move to channels)
  ↓
Timer resets (5 seconds)
  ↓
User presses UP (navigate channels)
  ↓
Timer resets (5 seconds)
  ↓
No key press for 5 seconds
  ↓
Sidebar auto-closes
```

---

## 6. INFO BAR + SIDEBAR INTERACTION

### Mutual Exclusivity

**When sidebar opens:**
```javascript
function showOverlay() {
    // Don't show info bar if sidebar is open
    if (sidebarState.isOpen) {
        return;
    }
    // ... show overlay
}
```

**When sidebar is open:**
```javascript
document.addEventListener('keydown', function(e) {
    // Don't show overlay if sidebar is open
    if (!sidebarState.isOpen) {
        showOverlay();
    }
});
```

### Behavior

✅ **Sidebar open** → Info bar hidden
✅ **Sidebar closed** → Info bar can show
✅ **No conflict** between timers
✅ **Clean visual experience**

---

## 7. IMPLEMENTATION SUMMARY

### Files Modified

**js/player.js:**
- Added `OVERLAY_HIDE_DELAY` and `SIDEBAR_HIDE_DELAY` constants
- Added `overlayTimeout` and `sidebarInactivityTimer` variables
- Added `languageIndex` to `sidebarState`
- Updated `openSidebar()` to start inactivity timer
- Updated `closeSidebar()` to clear inactivity timer
- Added `resetSidebarInactivityTimer()` function
- Added `clearSidebarInactivityTimer()` function
- Updated `handleSidebarKeydown()` to reset timer on every key press
- Updated `handleKeydown()` RETURN button behavior
- Updated `showOverlay()` to not show when sidebar is open
- Updated keydown event listener to check sidebar state

### Code Changes Summary

```javascript
// Timer configuration (top of file)
const OVERLAY_HIDE_DELAY = 5000;
const SIDEBAR_HIDE_DELAY = 5000;
var overlayTimeout = null;
var sidebarInactivityTimer = null;

// Sidebar state (added languageIndex)
var sidebarState = {
    isOpen: false,
    currentMode: 'categories',
    languageIndex: 0,
    categoryFocusIndex: 0,
    channelFocusIndex: 0,
    categories: [],
    channels: [],
    languages: ['All', 'English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada']
};

// New functions
resetSidebarInactivityTimer()
clearSidebarInactivityTimer()

// Updated functions
openSidebar() - starts timer
closeSidebar() - clears timer
handleSidebarKeydown() - resets timer on every key
handleKeydown() - RETURN closes sidebar first
showOverlay() - checks sidebar state
```

---

## 8. TESTING CHECKLIST

### Info Bar
- [x] Auto-hides after 5 seconds
- [x] Shows on channel change
- [x] OK button shows if hidden
- [x] OK button resets timer if visible
- [x] Resets timer on any key press
- [x] Hidden when sidebar is open

### Sidebar
- [x] Auto-hides after 5 seconds of inactivity
- [x] Stays open while navigating
- [x] Resets timer on every key press
- [x] Clears timer when manually closed
- [x] Proper focus lock when open
- [x] Focus returns to player when closed

### RETURN Button
- [x] Closes sidebar if open
- [x] Exits player if sidebar closed
- [x] No double-press needed

### Navigation
- [x] Categories: LEFT/RIGHT navigation
- [x] Categories to Channels: DOWN
- [x] Channels: UP/DOWN navigation
- [x] Channels to Categories: UP at top
- [x] ENTER plays channel
- [x] Smooth focus transitions

---

## 9. EXPECTED BEHAVIOR

### Scenario 1: User Opens Sidebar
```
1. User presses MENU
2. Sidebar slides in from left
3. Focus on first category
4. Timer starts (5 seconds)
5. User navigates categories (LEFT/RIGHT)
6. Timer resets on each key press
7. User presses DOWN
8. Focus moves to channel list
9. Timer resets
10. User waits 5 seconds (no key press)
11. Sidebar auto-closes
```

### Scenario 2: User Navigates Channels
```
1. Sidebar is open
2. User is in channel list
3. User presses UP/DOWN rapidly
4. Timer resets on each key press
5. Sidebar stays open
6. User selects channel (ENTER)
7. Sidebar closes
8. Channel plays
9. Info bar shows
10. Info bar auto-hides after 5 seconds
```

### Scenario 3: RETURN Button
```
1. Sidebar is open
2. User presses RETURN
3. Sidebar closes (player still running)
4. User presses RETURN again
5. Player exits to channels page
```

### Scenario 4: Info Bar
```
1. Channel is playing
2. Info bar is hidden
3. User presses OK
4. Info bar shows
5. Timer starts (5 seconds)
6. User presses UP/DOWN (any key)
7. Timer resets
8. User waits 5 seconds
9. Info bar auto-hides
```

---

## 10. PERFORMANCE NOTES

### Timer Management

✅ **Proper cleanup** - Timers cleared on close
✅ **No memory leaks** - Timers reset correctly
✅ **No conflicts** - Separate timers for info bar and sidebar
✅ **Efficient** - Only one timer active at a time per component

### Focus Management

✅ **Locked focus** - Sidebar blocks player navigation
✅ **Clean transitions** - Smooth focus movement
✅ **State preservation** - Focus indices maintained
✅ **No glitches** - Proper event handling

---

## STATUS: ✅ PRODUCTION READY

**All requirements implemented:**
- ✅ Info Bar auto-hide (5 seconds)
- ✅ Sidebar auto-hide on inactivity (5 seconds)
- ✅ Sidebar stays open while navigating
- ✅ Timer resets on every key press
- ✅ Proper focus management
- ✅ RETURN button Android TV behavior
- ✅ Clean mutual exclusivity
- ✅ Professional DTH-grade quality
- ✅ Demo-ready

**Android TV-like behavior achieved!** 🎉
