# Channel Logo Loading Issue - Root Cause Analysis & Fix

## Problem Reported by Client
**"None of the channel logo images are loading"** — Channels page displays no logo images for any channel.

---

## Root Cause Identified

### **Issue #1: Logo URLs Not Being Normalized**

The `getChannelCardLogo()` function returns the raw `ch.chlogo` field from the API response. However, these URLs were **not being normalized** through the central `resolveAssetUrl()` function before being set as the image source.

**Example API Response:**
```json
{
  "chlogo": "http://localhost:3000/images/logos/sony-sab.png",
  "name": "Sony SAB"
}
```

**What Was Happening (BROKEN):**
```javascript
const img = document.createElement("img");
img.src = chLogo;  // ❌ Sets directly: "http://localhost:3000/images/logos/sony-sab.png"
// On real TV with file:// origin: Cannot reach localhost:3000 → 404 ERROR
```

**What Should Happen (FIXED):**
```javascript
const img = document.createElement("img");
var normalizedLogo = BBNL_API.resolveAssetUrl(chLogo);  
// ✅ Transforms: "http://localhost:3000/images/logos/sony-sab.png"
//             → "http://ACTUAL_TV_IP:8000/images/logos/sony-sab.png"
img.src = normalizedLogo;  // Now works on real TV
```

---

## Code Changes Made

### **File: [js/channels.js](js/channels.js)**

#### Change 1: Normalize Logo URLs Before Setting src (Line 1250-1300)

**BEFORE:**
```javascript
if (chLogo) {
    const img = document.createElement("img");
    var resolvedLogo = chLogo;  // ❌ Not normalized through API resolver
    
    // ...set img.src = cachedSrc || chLogo  // Raw URL
}
```

**AFTER:**
```javascript
if (chLogo) {
    const img = document.createElement("img");
    // CRITICAL: Normalize the logo URL FIRST (localhost→origin, relative→absolute, etc.)
    var normalizedLogo = BBNL_API.resolveAssetUrl(chLogo);  // ✅ Full normalization
    
    // ...set img.src = cachedSrc || normalizedLogo  // Normalized URL
    
    img.dataset.src = normalizedLogo;  // Also set normalized URL for lazy-load
}
```

**What This Does:**
- Calls `BBNL_API.resolveAssetUrl()` on every logo URL from API
- Converts `localhost:3000` → actual TV IP/origin
- Converts relative paths `/images/xyz` → absolute URLs with correct origin
- Handles protocol-relative URLs `//cdn.example.com`
- Result: Images now reachable on real TV

#### Change 2: Enhanced Logging for Debugging (Line 1267-1271)

Added console.log statements to track:
- Whether logo came from cache
- What normalized URL is being used
- Success/failure of image loading

```javascript
console.log("[Channels] Logo lazy-load queued: ch=" + chName + " normalized-url=" + normalizedLogo);
console.log("[Channels] Logo failed to load: ch=" + chName + " url=" + this.src + " — showing channel name instead");
```

#### Change 3: Updated Lazy-Loader Logging (Line 1170-1210)

Enhanced IntersectionObserver callback to log which normalized URLs are being loaded.

---

## Expected Behavior After Fix

### **In Emulator:**
```
[resolveAssetUrl] localhost→origin: http://localhost:3000/images/logos/sony-sab.png 
                → http://192.168.1.100:8000/images/logos/sony-sab.png

[Channels] Logo lazy-load queued: ch=Sony SAB 
           normalized-url=http://192.168.1.100:8000/images/logos/sony-sab.png

[Channels] Logo loaded successfully: ch=Sony SAB 
           final-url=http://192.168.1.100:8000/images/logos/sony-sab.png
```

### **On Real TV:**
- FoFi app loads Channels page
- Console shows normalized URLs (not localhost:3000 anymore)
- As user scrolls, channel logos appear (lazy-loaded with correct origin)
- If logo fails to load: channel name displayed as fallback

---

## What Happens If Image Still Doesn't Load

### **Scenario 1: URL Normalization Worked, But Image 404s**
```
[Channels] Logo failed to load: ch=Sony SAB 
           url=http://192.168.1.100:8000/images/logos/sony-sab.png — showing channel name instead
```
**Diagnosis:** Normalized URL is correct origin, but the path doesn't exist on API server
**Action:** Check if API is returning wrong paths; verify images exist at those paths

### **Scenario 2: Origin Detection Failed on TV**
```
[resolveAssetUrl] passthrough: http://localhost:3000/images/logos/sony-sab.png
```
**Diagnosis:** `BBNL_API.BASE_URL` couldn't be resolved to correct origin on TV
**Action:** In browser DevTools on TV, log `window.location.origin` and `API_CONFIG.BASE_URL`

### **Scenario 3: No Logs At All**
**Diagnosis:** Images loaded successfully (no errors, no logs)
**Action:** Check Network tab to confirm images returned 200 OK

---

## Validation

✅ **No Syntax Errors:** File passes linting (checked with get_errors)

✅ **Logic Verified:** 
- Logo URL normalization happens before any use
- Cache fallback still works
- Lazy-loader uses pre-normalized URLs
- Error handler shows channel name if image fails

✅ **Backward Compatible:**
- Code still works if API returns fully-qualified absolute URLs
- Cache keys unchanged
- Lazy-load mechanism unchanged

---

## Testing Checklist

### **In Browser Emulator:**
- [ ] Open Channels page
- [ ] Open DevTools Console (F12)
- [ ] Scroll through channels
- [ ] Look for `[Channels] Logo` logs
- [ ] Confirm logs show NORMALIZED URLs (not localhost:3000)
- [ ] Check Network tab: All logo images return 200 OK

### **On Samsung TV:**
- [ ] Load Channels page
- [ ] Do channel logos appear as you scroll?
- [ ] Do logos stay visible (not disappear)?
- [ ] Are channel names visible if logo fails?

---

## Files Modified
1. **[js/channels.js](js/channels.js)** — Added URL normalization + enhanced logging

## API Contract
- **New Dependency:** `BBNL_API.resolveAssetUrl()` (already added to api.js, now being used by channels.js)
- **Breaking Changes:** None
- **Backward Compatibility:** Full

---

## Summary

**Before:** Channel logo URLs from API used directly without normalization → `localhost:3000` unreachable on TV → All logos failed to load

**After:** All logo URLs normalized via `BBNL_API.resolveAssetUrl()` before use → Correct origin on TV → Logos load successfully

**Impact:** Client-reported "none of the channel logos loading" should now be resolved on real TV deployment.
