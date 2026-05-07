# Critical Issues Solution Plan

Date: 2026-05-04
Project: NEW-SAMSUNG (Tizen TV Web App)
Scope: User-reported critical issues requiring immediate fixes
Constraint: **DO NOT change app flow or format** - only fix logic/state issues

---

## Issue Summary

Based on user testing and codebase analysis, 3 critical issues identified:

1. **Auto-Resume Not Working** - Internet restoration doesn't resume playback
2. **Menu Focus Issues** - Language categories don't show proper focus
3. **Subcategory Expansion History** - Previous expansions not cleared on menu reopen

---

## Issue 1 - Auto-Resume Not Working

### Symptom
- Internet disconnect → Playback error popup appears immediately ✅
- Internet reconnect → Stream does NOT auto-resume ❌
- User must manually press "Try Again" to resume

### Root Cause Analysis
**File:** `js/player.js` lines ~1339, 1182-1185

The network watchdog has overly restrictive conditions for auto-resume:

```javascript
// Current problematic logic (line 1339)
if ((playerErrorPopupOpen || hasRecentNetworkError || playerLastErrorCategory === 'network') && 
    networkRecoveryReady && !playerAutoResumeInProgress) {
    var retried = attemptPlayerAutoResumeRetry('watchdog-online');
```

**Problems:**
1. `playerNetworkReconnectSince` may not be set during quick disconnect/reconnect cycles
2. `_pausedByNetwork` flag logic is complex and may not trigger correctly
3. Network state detection relies on Tizen API which reports "connected" even without internet

### Solution (Minimal Impact)

**Changes in `js/player.js`:**

1. **Simplify network recovery detection** (line 1339 area):
```javascript
// Replace existing condition with simpler logic
if (playerErrorPopupOpen && playerLastErrorCategory === 'network' && 
    !playerAutoResumeInProgress && _pausedByNetwork) {
    var retried = attemptPlayerAutoResumeRetry('watchdog-online');
```

2. **Ensure `_pausedByNetwork` flag is set correctly** in `handlePlaybackFailure()`:
```javascript
// Add to network failure path
if (category === 'network') {
    _pausedByNetwork = true;
    playerNetworkDisconnectSince = Date.now();
}
```

3. **Add fallback recovery check** in network watchdog:
```javascript
// Additional check every 3 seconds
if (_pausedByNetwork && !playerAutoResumeInProgress) {
    var isOnline = (webapis.network.getActiveConnectionType() !== 0);
    if (isOnline && _lastNetworkOnline === false) {
        attemptPlayerAutoResumeRetry('fallback-recovery');
        _lastNetworkOnline = true;
    }
}
```

### Files to Modify
- `js/player.js` (lines ~1339, ~481, ~1185)

### Testing Criteria
- Disconnect internet → Error popup in 5-10s ✅
- Reconnect internet → Auto-resume within 10-15s ✅
- No false auto-resume during normal channel switching ✅

---

## Issue 2 - Menu Focus Issues for Language Categories

### Symptom
- "Subscribed Channels" and "All Channels" focus works properly ✅
- Language-specific categories (Hindi, Tamil, etc.) don't show focus ❌
- Focus jumps to wrong subcategory when reopening menu

### Root Cause Analysis
**File:** `js/player.js` lines ~4334, 4355, 4212

The `getCurrentPlayingCategoryIndex()` function works for grouped categories but fails for language-specific filtering:

```javascript
// Current logic (line 4212)
function getCurrentPlayingCategoryIndex() {
    var current = getCurrentPlayingChannelObject();
    if (!current || !Array.isArray(sidebarState.categories) || sidebarState.categories.length === 0) {
        return -1;
    }
    // Only checks grouped categories, ignores language filters
    return sidebarState.categories.findIndex(cat => cat.name === current.category);
}
```

**Problems:**
1. Language filtering uses different data structure than grouped categories
2. Focus alignment logic falls back to generic channel search
3. No proper mapping between current channel and language category

### Solution (Minimal Impact)

**Changes in `js/player.js`:**

1. **Enhance `getCurrentPlayingCategoryIndex()`** to handle language categories:
```javascript
function getCurrentPlayingCategoryIndex() {
    var current = getCurrentPlayingChannelObject();
    if (!current) return -1;
    
    // Check grouped categories first (existing logic)
    if (Array.isArray(sidebarState.categories) && sidebarState.categories.length > 0) {
        var groupedIdx = sidebarState.categories.findIndex(cat => cat.name === current.category);
        if (groupedIdx >= 0) return groupedIdx;
    }
    
    // Check language categories (new logic)
    if (current.language && sidebarState.languages && sidebarState.languages.length > 0) {
        var langIdx = sidebarState.languages.findIndex(lang => 
            lang.name === current.language || lang.code === current.language
        );
        return langIdx >= 0 ? langIdx : -1;
    }
    
    return -1;
}
```

2. **Fix focus alignment in `openSidebar()`** (line 5027 area):
```javascript
// Ensure language category focus works
var syncedCatIdx = getCurrentPlayingCategoryIndex();
if (syncedCatIdx >= 0) {
    // For language categories, ensure proper channel list population
    if (syncedCatIdx < sidebarState.categories.length) {
        // Grouped category logic (existing)
    } else if (sidebarState.languages && syncedCatIdx < sidebarState.languages.length) {
        // Language category logic (enhanced)
        var selectedLang = sidebarState.languages[syncedCatIdx];
        sidebarState.channels = getFilteredChannelsByLanguage(selectedLang.code);
        var chIdx = findCurrentChannelInSidebar();
        if (chIdx >= 0) sidebarState.channelIndex = chIdx;
    }
}
```

### Files to Modify
- `js/player.js` (lines ~4212, ~5027)

### Testing Criteria
- Open menu while watching Hindi channel → Focus on Hindi category ✅
- Open menu while watching Tamil channel → Focus on Tamil category ✅
- Subscribed/All channels still work properly ✅

---

## Issue 3 - Subcategory Expansion History Not Cleared

### Symptom
- User expands a subcategory (e.g., Kannada)
- Close and reopen menu → Previous expansion still visible ❌
- Multiple subcategories remain expanded simultaneously

### Root Cause Analysis
**File:** `js/player.js` lines ~3300, 4648, 5030

The `sidebarState.expandedCategories` object persists expansions but isn't cleared on menu reopen:

```javascript
// Current expansion logic (line 3300)
function setSidebarCategoryExpanded(catIdx, on) {
    if (!sidebarState.expandedCategories) sidebarState.expandedCategories = {};
    var k = _sidebarExpandKey(catIdx);
    if (on) sidebarState.expandedCategories[k] = true;
    else delete sidebarState.expandedCategories[k];
}
```

**Problems:**
1. No mechanism to clear all expansions on menu reopen
2. Multiple categories can stay expanded simultaneously
3. Focus alignment conflicts with multiple expanded categories

### Solution (Minimal Impact)

**Changes in `js/player.js`:**

1. **Add expansion clearing function**:
```javascript
function clearAllSidebarCategoryExpansions() {
    if (sidebarState.expandedCategories) {
        sidebarState.expandedCategories = {};
    }
}
```

2. **Clear expansions on menu reopen** in `openSidebar()` (line 5027 area):
```javascript
function openSidebar() {
    // ... existing code ...
    
    // Clear all expansions before setting new focus
    clearAllSidebarCategoryExpansions();
    
    // Then expand only the current channel's category
    var syncedCatIdx = getCurrentPlayingCategoryIndex();
    if (syncedCatIdx >= 0 && sidebarState.categories && sidebarState.categories.length > 0) {
        var clampedSyncedCatIdx = Math.max(0, Math.min(syncedCatIdx, sidebarState.categories.length - 1));
        setSidebarCategoryExpanded(clampedSyncedCatIdx, true);
        // ... rest of existing logic ...
    }
}
```

3. **Ensure single expansion policy** in category selection:
```javascript
function selectCategory(index, preferCurrentChannel) {
    // Clear all other expansions when selecting a category
    clearAllSidebarCategoryExpansions();
    
    // Then expand only the selected one
    setSidebarCategoryExpanded(index, true);
    // ... rest of existing logic ...
}
```

### Files to Modify
- `js/player.js` (lines ~3300, ~5027, ~4660)

### Testing Criteria
- Expand Kannada category → Close menu → Reopen → No categories expanded ✅
- Open menu while watching channel → Only that channel's category expanded ✅
- Manual category selection → Only selected category expanded ✅

---

## Implementation Order (Lowest Risk First)

1. **Issue 3 (Subcategory Expansion)** - Safest, only affects expansion state
2. **Issue 2 (Menu Focus)** - Medium risk, enhances existing focus logic
3. **Issue 1 (Auto-Resume)** - Highest risk, touches core network logic

---

## Constraints Verification

✅ **No app flow changes** - All fixes within existing functions
✅ **No format changes** - Only logic/state improvements
✅ **No UI redesign** - Existing elements and interactions preserved
✅ **No remote key changes** - Current navigation model maintained
✅ **Backward compatibility** - Existing functionality preserved

---

## Testing Plan

### Phase 1 - Unit Testing
- Test each function individually with mock data
- Verify edge cases (no channels, empty categories, etc.)

### Phase 2 - Integration Testing
- Test complete user flows
- Verify no regression in existing functionality

### Phase 3 - User Acceptance Testing
- Test on actual Samsung TV hardware
- Verify with different network conditions
- Test with various channel/language combinations

---

## Rollback Plan

Each fix can be independently rolled back:
1. **Issue 3:** Remove `clearAllSidebarCategoryExpansions()` calls
2. **Issue 2:** Revert `getCurrentPlayingCategoryIndex()` to original
3. **Issue 1:** Revert network watchdog conditions to original

---

## Success Metrics

- **Auto-Resume Success Rate:** >95% on network restoration
- **Menu Focus Accuracy:** 100% for all category types
- **Expansion State Cleanliness:** Single expansion policy maintained
- **No Regression:** All existing functionality preserved
- **Performance:** No measurable impact on menu opening speed
