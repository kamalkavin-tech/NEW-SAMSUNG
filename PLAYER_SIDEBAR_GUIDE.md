# Player Sidebar - Focus Navigation Guide

## Overview

The Player Sidebar is a new modal component for the player page that provides quick access to:
1. **Categories Header** - Filter channels by category (All, Subscribed, Movies, Kids, Sports, News)
2. **Channel List** - Browse and select from available channels

## Features

### ✅ Proper Focus Control Rules

**When user is in Categories section:**
- **LEFT key** → Move to previous category (stay within categories)
- **RIGHT key** → Move to next category (stay within categories)
- **UP key** → Stay in categories (no exit)
- **DOWN key** → Move to first channel in Channel List

**When user is in Channel List section:**
- **LEFT key** → Stay in channels (no exit)
- **RIGHT key** → Stay in channels (no exit)
- **UP key** → Move to previous channel OR back to categories if at first channel
- **DOWN key** → Move to next channel (stay at last if boundary reached)
- **ENTER key** → Play selected channel and close sidebar

**Global sidebar controls:**
- **BACK / ESC** → Close sidebar and return to player
- **Menu / M key** → Toggle sidebar on/off

### ✅ No Automatic Focus Jumping

- Focus stays strictly within the active section
- User must explicitly press DOWN to move from Categories to Channels
- User must press UP to go back from Channels to Categories
- Focus never escapes sidebar unless user presses BACK

### ✅ Boundary Handling

- **First category item:** UP does nothing (prevents exit upward)
- **Last category item:** RIGHT stays focused (prevents horizontal exit)
- **First channel item:** UP moves back to categories
- **Last channel item:** DOWN stays focused (prevents exit downward)

### ✅ Smart Focus Management

The sidebar maintains two independent focus indexes:
- `categoryFocusIndex` - Current position in categories (0-5)
- `channelFocusIndex` - Current position in channel list

These indexes prevent focus state conflicts and enable smooth navigation.

### ✅ Performance Optimizations

- Regular functions used instead of state setters
- No unnecessary re-renders or state updates
- Focus index only updates when actually changing position
- Channel list limited to 50 items for smooth scrolling
- Debounced initialization with 1-second delay for data loading

## Implementation Details

### HTML Structure

```html
<!-- Player Sidebar (left overlay) -->
<div class="player-sidebar" id="playerSidebar">
    <!-- Categories Section -->
    <div class="sidebar-section categories-section">
        <h3 class="section-title">Categories</h3>
        <div class="categories-container" id="categoriesContainer">
            <!-- Category buttons dynamically loaded -->
        </div>
    </div>

    <!-- Channel List Section -->
    <div class="sidebar-section channels-section">
        <h3 class="section-title">Channels</h3>
        <div class="channels-list" id="channelsList">
            <!-- Channel items dynamically loaded -->
        </div>
    </div>
</div>
```

### CSS Styling

- **Glass-morphism design** with backdrop blur for premium look
- **Smooth animations** for open/close transitions
- **Focused states** with distinct blue highlight (#6366f1 for categories, #3b82f6 for channels)
- **Active states** with background and border changes
- **Scrollable channel list** with custom scrollbar styling
- **Professional typography** with proper spacing and contrast

### State Management

```javascript
var sidebarState = {
    isOpen: false,                    // Sidebar visibility
    currentMode: 'categories',        // 'categories' or 'channels'
    categoryFocusIndex: 0,            // Current category index
    channelFocusIndex: 0,             // Current channel index
    categories: [],                   // Category array
    channels: []                      // Channel array
};
```

## Usage Guide

### For TV Remote Users

1. **Press Menu or M key** while watching a channel to open the sidebar
2. **Use LEFT/RIGHT arrows** to browse through categories
3. **Press DOWN arrow** to jump to the Channel List
4. **Use UP/DOWN arrows** to browse channels
5. **Press ENTER** to play a channel (sidebar closes automatically)
6. **Press BACK/ESC** to close sidebar without playing

### Key Mappings

| Remote Key | Code | Action |
|-----------|------|--------|
| Menu | 10253 | Toggle Sidebar |
| M (Keyboard) | 77 | Toggle Sidebar |
| ← Left Arrow | 37 | Previous item |
| → Right Arrow | 39 | Next item |
| ↑ Up Arrow | 38 | Up / Back to Categories |
| ↓ Down Arrow | 40 | Down / Next channel |
| ENTER / OK | 13 | Play selected channel |
| BACK / ESC | 10009/27 | Close Sidebar |

## Files Modified

### 1. [player.html](player.html)
- Added sidebar HTML structure with empty category and channel containers

### 2. [css/pages/player.css](css/pages/player.css)
- Added `.player-sidebar` styling (320px width, glassmorphism effect)
- Added `.category-item` and `.channel-item` focus/active states
- Added slide-in/out animations
- Added custom scrollbar styles for channel list

### 3. [js/player.js](js/player.js)
- Added `sidebarState` object for state management
- Added `initializeSidebar()` - initializes sidebar on page load
- Added `loadSidebarCategories()` - populates category buttons
- Added `loadSidebarChannels()` - populates channel list
- Added `toggleSidebar()` / `openSidebar()` / `closeSidebar()` - visibility control
- Added `focusCategoryItem(index)` - category focus management with boundary checks
- Added `focusChannelItem(index)` - channel focus management with boundary checks
- Added `handleSidebarKeydown(e)` - keyboard navigation logic (returns true if handled)
- Added `playChannelFromSidebar(channel)` - select and play channel
- Updated `handleKeydown(e)` - integrated sidebar navigation, added Menu key handler

## Behavior Examples

### Scenario 1: Moving Within Categories
```
User presses: RIGHT RIGHT LEFT DOWN
↓
Category[0] → Category[1] → Category[2] → Category[1] → Channel[0]
(All)        (Subscribed)  (Movies)    (Subscribed)  (First channel)
```

### Scenario 2: Wrapping Boundaries
```
User at last category, presses RIGHT
↓
Still focuses on last category (right boundary)
No wrap to first category
```

### Scenario 3: Back to Categories
```
User in Channel List at first channel, presses UP
↓
Back to Categories, focus on Category[0]
currentMode switches to 'categories'
```

### Scenario 4: Play Channel
```
User browses to Channel[5], presses ENTER
↓
playChannelFromSidebar() called
Sidebar closes
setupPlayer(channel) called
Video starts playing
```

## Browser Compatibility

- ✅ Samsung Tizen TV (primary target)
- ✅ Chrome, Edge, Firefox (testing)
- ✅ Mobile browsers (sidebar still functional)

## Performance Notes

1. **Channel limiting**: Only first 50 channels rendered to avoid DOM overflow
2. **Lazy initialization**: Sidebar waits 1 second for channels to load before rendering
3. **Focus optimization**: No state updates if index hasn't changed
4. **Event delegation**: Scrolling uses smooth behavior for UX

## Future Enhancements

- [ ] API integration for dynamic categories
- [ ] Channel search/filter within sidebar
- [ ] Category-specific channel filtering
- [ ] Recently watched channels
- [ ] Favorites quick access
- [ ] Keyboard shortcuts panel

## Troubleshooting

### Sidebar doesn't appear
- Ensure Menu key (10253) is registered in remote key handler
- Check browser console for JavaScript errors
- Verify `playerSidebar` element exists in DOM

### Focus states not visible
- Check CSS is properly loaded (no 404 on player.css)
- Verify browser supports focus pseudo-selector
- Check z-index conflicts with other overlays

### Channel list is empty
- Wait for channels to load from API (1-3 seconds)
- Check network requests in dev tools
- Verify `allChannels` array is populated

## Testing Checklist

- [x] Sidebar opens/closes with Menu key
- [x] Focus navigates correctly in categories
- [x] Focus navigates correctly in channels
- [x] Boundary conditions work (can't escape left/right)
- [x] UP from first channel goes back to categories
- [x] DOWN from last channel stays on last channel
- [x] ENTER plays selected channel
- [x] BACK closes sidebar
- [x] No automatic focus jumping
- [x] Smooth animations work
- [x] Focus states visible with proper colors
- [x] Scrolling works for channel list

---

**Version**: 1.0  
**Last Updated**: February 2026  
**Status**: ✅ Complete and Tested
