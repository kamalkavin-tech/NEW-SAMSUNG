# Player Sidebar 3-Level Implementation - Complete JavaScript

## STATUS: Implementation in Progress

This document contains the complete JavaScript code for the 3-level Android TV sidebar navigation.

## Complete handleSidebarKeydown Function

```javascript
/**
 * Handle sidebar keydown navigation - 3 LEVEL ANDROID TV DESIGN
 * Returns true if keydown was handled by sidebar
 */
function handleSidebarKeydown(e) {
    if (!sidebarState.isOpen) return false;

    var code = e.keyCode;
    var handled = false;

    // Reset inactivity timer on EVERY key press (only activates at channel level)
    resetSidebarInactivityTimer();

    // ==========================================
    // LEVEL 1: LANGUAGE SELECTOR
    // ==========================================
    if (sidebarState.currentLevel === 'language') {
        switch (code) {
            case 37: // LEFT
                changeLanguage(-1);
                e.preventDefault();
                handled = true;
                console.log("[Sidebar] LEFT - previous language");
                break;

            case 39: // RIGHT
                changeLanguage(1);
                e.preventDefault();
                handled = true;
                console.log("[Sidebar] RIGHT - next language");
                break;

            case 38: // UP
                // Stay in language level
                e.preventDefault();
                handled = true;
                console.log("[Sidebar] UP in language - staying");
                break;

            case 40: // DOWN
                // Move to categories (Level 2)
                sidebarState.currentLevel = 'categories';
                sidebarState.categoryIndex = 0;
                focusCategoryItem(0);
                e.preventDefault();
                handled = true;
                console.log("[Sidebar] DOWN - moved to categories");
                break;

            case 10009: // RETURN
                closeSidebar();
                e.preventDefault();
                handled = true;
                console.log("[Sidebar] RETURN - closed sidebar");
                break;
        }
    }
    // ==========================================
    // LEVEL 2: CATEGORIES
    // ==========================================
    else if (sidebarState.currentLevel === 'categories') {
        switch (code) {
            case 37: // LEFT
            case 39: // RIGHT
                // Stay in categories
                e.preventDefault();
                handled = true;
                console.log("[Sidebar] LEFT/RIGHT in categories - staying");
                break;

            case 38: // UP
                if (sidebarState.categoryIndex > 0) {
                    // Move to previous category
                    sidebarState.categoryIndex--;
                    changeCategoryTo(sidebarState.categoryIndex);
                    e.preventDefault();
                    handled = true;
                    console.log("[Sidebar] UP - previous category");
                } else {
                    // At first category, move back to language (Level 1)
                    sidebarState.currentLevel = 'language';
                    e.preventDefault();
                    handled = true;
                    console.log("[Sidebar] UP at top - moved to language");
                }
                break;

            case 40: // DOWN
                if (sidebarState.categoryIndex < sidebarState.categories.length - 1) {
                    // Move to next category
                    sidebarState.categoryIndex++;
                    changeCategoryTo(sidebarState.categoryIndex);
                    e.preventDefault();
                    handled = true;
                    console.log("[Sidebar] DOWN - next category");
                } else {
                    // At last category, move to channels (Level 3)
                    sidebarState.currentLevel = 'channels';
                    sidebarState.channelIndex = 0;
                    focusChannelItem(0);
                    // Start auto-hide timer (only at channel level)
                    resetSidebarInactivityTimer();
                    e.preventDefault();
                    handled = true;
                    console.log("[Sidebar] DOWN at bottom - moved to channels");
                }
                break;

            case 10009: // RETURN
                closeSidebar();
                e.preventDefault();
                handled = true;
                console.log("[Sidebar] RETURN - closed sidebar");
                break;
        }
    }
    // ==========================================
    // LEVEL 3: CHANNELS
    // ==========================================
    else if (sidebarState.currentLevel === 'channels') {
        switch (code) {
            case 37: // LEFT
                // Close sidebar (Android TV behavior)
                closeSidebar();
                e.preventDefault();
                handled = true;
                console.log("[Sidebar] LEFT in channels - closed sidebar");
                break;

            case 39: // RIGHT
                // Stay in channels
                e.preventDefault();
                handled = true;
                console.log("[Sidebar] RIGHT in channels - staying");
                break;

            case 38: // UP
                if (sidebarState.channelIndex > 0) {
                    // Move to previous channel
                    sidebarState.channelIndex--;
                    focusChannelItem(sidebarState.channelIndex);
                    e.preventDefault();
                    handled = true;
                    console.log("[Sidebar] UP - previous channel");
                } else {
                    // At first channel, move back to categories (Level 2)
                    sidebarState.currentLevel = 'categories';
                    focusCategoryItem(sidebarState.categoryIndex);
                    // Clear auto-hide timer (not active at category level)
                    clearSidebarInactivityTimer();
                    e.preventDefault();
                    handled = true;
                    console.log("[Sidebar] UP at top - moved to categories");
                }
                break;

            case 40: // DOWN
                if (sidebarState.channelIndex < sidebarState.channels.length - 1) {
                    // Move to next channel
                    sidebarState.channelIndex++;
                    focusChannelItem(sidebarState.channelIndex);
                    e.preventDefault();
                    handled = true;
                    console.log("[Sidebar] DOWN - next channel");
                } else {
                    // At last channel, stay here
                    e.preventDefault();
                    handled = true;
                    console.log("[Sidebar] DOWN at bottom - staying");
                }
                break;

            case 13: // ENTER
                // Play selected channel
                if (sidebarState.channels.length > sidebarState.channelIndex) {
                    var channel = sidebarState.channels[sidebarState.channelIndex];
                    playChannelFromSidebar(channel);
                    e.preventDefault();
                    handled = true;
                    console.log("[Sidebar] ENTER - playing channel");
                }
                break;

            case 10009: // RETURN
                closeSidebar();
                e.preventDefault();
                handled = true;
                console.log("[Sidebar] RETURN - closed sidebar");
                break;
        }
    }

    return handled;
}

/**
 * Focus on a specific category item
 */
function focusCategoryItem(index) {
    if (index < 0 || index >= sidebarState.categories.length) return;

    sidebarState.categoryIndex = index;

    var items = document.querySelectorAll('.category-item');
    items.forEach(function(item, i) {
        if (i === index) {
            item.classList.add('active');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });

    console.log("[Sidebar] Category focused:", sidebarState.categories[index]);
}

/**
 * Focus on a specific channel item
 */
function focusChannelItem(index) {
    if (index < 0 || index >= sidebarState.channels.length) return;

    sidebarState.channelIndex = index;

    var items = document.querySelectorAll('.channel-item');
    items.forEach(function(item, i) {
        if (i === index) {
            item.classList.add('active');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });

    console.log("[Sidebar] Channel focused:", index);
}
```

## Navigation Flow Summary

### Level 1: Language
- **LEFT/RIGHT**: Change language
- **UP**: Stay
- **DOWN**: Go to categories
- **RETURN**: Close sidebar

### Level 2: Categories
- **UP**: Previous category OR back to language
- **DOWN**: Next category OR go to channels
- **LEFT/RIGHT**: Stay
- **RETURN**: Close sidebar

### Level 3: Channels
- **UP**: Previous channel OR back to categories
- **DOWN**: Next channel
- **LEFT**: Close sidebar
- **RIGHT**: Stay
- **ENTER**: Play channel
- **RETURN**: Close sidebar

## Auto-Hide Timer Rules

- **Language Level**: NO auto-hide
- **Category Level**: NO auto-hide
- **Channel Level**: Auto-hide after 5 seconds of inactivity

## Data Flow

1. **Language Change** → Reset category & channel indices → Reload data
2. **Category Change** → Reset channel index → Filter channels
3. **Channel Selection** → Play channel → Close sidebar

---

**Next Steps:**
1. Replace handleSidebarKeydown in player.js
2. Replace focusCategoryItem and focusChannelItem functions
3. Add IPv6 display to login and settings pages
4. Test complete flow
