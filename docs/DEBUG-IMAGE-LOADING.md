# Image Loading Debug Guide

## Check if Images Load from Cache vs API

Added comprehensive logging to track:
1. **What source** images come from (localStorage cache vs API vs direct)
2. **What URLs** are being resolved
3. **Success/failure** of image loads

---

## How to Monitor in Browser Emulator

### **Method 1: Browser Developer Console**

1. Open **browser DevTools** (F12 or Ctrl+Shift+I)
2. Go to **Console** tab
3. Look for `[resolveAssetUrl]`, `[ErrorImagesAPI]`, `[Channels]`, `[HOME]` logs

#### Example Output:

```
[resolveAssetUrl] localhost→origin: http://localhost:3000/logo.png → http://192.168.1.100:8000/logo.png
[Channels] Logo from cache: ch=Sony SAB url=http://192.168.1.100:8000/images/logos/sony-sab.png
[Channels] Logo loaded successfully: ch=Sony SAB final-url=http://192.168.1.100:8000/images/logos/sony-sab.png
[ErrorImagesAPI.getImageUrl] key=NO_INTERNET_CONNECTION source=localStorage-cache url=http://192.168.1.100:8000/error-no-internet.png
[HOME] Found cached FoFi logo: http://192.168.1.100:8000/images/fofitv-logo.png
[HOME] FoFi logo loaded successfully: http://192.168.1.100:8000/images/fofitv-logo.png
```

**Key Indicators:**
- ✅ **"from cache"** → Image loaded from localStorage (instant, works offline)
- ✅ **"loaded successfully"** → Image `img.onload` fired (visible on screen)
- ❌ **"failed to load"** → Image `img.onerror` fired (broken image)
- ❌ **No log after setting src** → Image stuck in loading state

---

### **Method 2: Network Tab (HTTP Requests)**

1. Open **DevTools** → **Network** tab
2. Filter by **Img** or **Media**
3. Reload page and look for:

#### Should See:
```
GET http://192.168.1.100:8000/images/logos/sony-sab.png     200 OK
GET http://192.168.1.100:8000/images/logos/star-plus.png    200 OK
GET http://192.168.1.100:8000/error-images/no-internet.png  200 OK
```

#### Bad Signs:
```
GET http://localhost:3000/images/logos/sony-sab.png          Failed (ERR_CONNECTION_REFUSED)
GET http://127.0.0.1:3000/images/fofitv-logo.png            Failed (ERR_CONNECTION_REFUSED)
```

---

### **Method 3: Check localStorage Cache Directly**

1. Open **DevTools** → **Application/Storage** tab
2. Click **localStorage** in left panel
3. Look for keys like:
   - `bbnl_error_images` → Error image URLs cached
   - `home_fofi_logo_url` → FoFi logo URL cached
   - `CHANNEL_LOGO_SOURCE_MAP` → Channel logo URLs cached

#### Example Cache Content:
```json
{
  "bbnl_error_images": {
    "NO_INTERNET_CONNECTION": "http://192.168.1.100:8000/images/error-no-internet.png",
    "COMING_SOON": "http://192.168.1.100:8000/images/coming-soon.png"
  },
  "home_fofi_logo_url": "http://192.168.1.100:8000/images/fofitv-logo.png"
}
```

---

## Diagnostic Workflow

### **Step 1: Test in Browser Emulator**

```bash
# 1. Run your development server (if using localhost)
npm start  # or your server command

# 2. Open app in browser: http://localhost:8000 (or your dev URL)

# 3. Open Console (F12) and scroll through pages:
# - Home page → check FoFi logo cache logs
# - Channels page → scroll through channels, check logo loading logs
# - Language Select → check logo logs
# - OTT Apps (if accessing) → check icon logs

# 4. Check Network tab:
# - Do you see 200 OK responses for image URLs?
# - Are images served from correct origin (not localhost:3000)?
```

### **Step 2: Compare Against Samsung TV Device**

When testing on actual TV:

1. **Open URL on TV with Dev Tools** (if TV has browser debug):
   - Samsung Tizen TV: May need `tizen-studio` debugger or web inspector
   - Approach: Connect TV via USB, use `tizen debug` or similar

2. **Manually check if images appear:**
   - Home page: Does FoFi logo appear instantly and stay visible?
   - Channels: Do channel logos appear as you scroll?
   - Language Select: Do language card logos load?
   - OTT/Favorites: Do error images show in popups?

3. **Compare console logs** (if available):
   - If TV shows `"localhost:3000"` URLs in logs → **Origin detection failed on TV**
   - If TV shows `"failed to load"` logs → **URL resolution worked but image fetch failed**
   - If TV shows **no logs at all** → Images loaded but URL resolution fine

---

## Expected Behavior by Scenario

### **Scenario A: Emulator Shows Images, TV Does Not**

**Diagnosis:**
- Emulator has network access to API (localhost:3000 or dev server)
- TV cannot reach API server (firewall, wrong IP, offline)

**Fix:**
- Check if TV is on same network as API server
- Verify API server IP is correct in API_CONFIG.BASE_URL
- Test API endpoint directly from TV's browser

### **Scenario B: Both Emulator & TV Show Images**

**Result:** ✅ **Fix is working correctly!**
- Image URL resolution is correct
- Cache invalidation is working
- localStorage is accessible on both devices

### **Scenario C: Emulator Shows "localhost:3000" URLs in Logs**

**Diagnosis:** `resolveAssetUrl()` function is not finding correct origin

**Check:**
```javascript
// In Console, run:
console.log("API Base:", BBNL_API.API_BASE_URL);
console.log("Window Origin:", window.location.origin);
// If window.origin is 'file://' on TV → this explains failure
```

---

## What Each Log Message Means

| Log | Meaning | Good/Bad |
|-----|---------|----------|
| `[resolveAssetUrl] localhost→origin: ... → ...` | URL was transformed (localhost → correct origin) | ✅ Good |
| `[resolveAssetUrl] root-relative: ... → ...` | URL was root-relative, now absolute | ✅ Good |
| `[Channels] Logo from cache: ...` | Image loaded instantly from localStorage | ✅ Good (fast) |
| `[Channels] Logo lazy-load queued: ...` | Image queued for lazy-load | ✅ Good |
| `[Channels] Logo loaded successfully: ...` | Image appeared on screen | ✅ Good |
| `[Channels] Logo failed to load: ...` | Image broken or 404 | ❌ Bad |
| `[ErrorImagesAPI.getImageUrl] source=localStorage-cache` | Error image from cache | ✅ Good |
| `[ErrorImagesAPI.getImageUrl] source=empty` | No error image available | ⚠️ Caution |
| `[HOME] Found cached FoFi logo: ...` | FoFi logo loaded from cache (instant) | ✅ Good |
| `[HOME] API returned new logo: ...` | Fresh logo from API (will cache for next launch) | ✅ Good |
| `[HOME] FoFi logo failed to load: ...` | Logo broken (will fall back to cached version) | ⚠️ Handled |

---

## Disable Logging (Production)

When ready for production, comment out console.log lines:

```javascript
// In js/api.js, resolveAssetUrl():
// console.log("[resolveAssetUrl] localhost→origin: " + originalValue + " → " + value);

// In js/channels.js:
// console.log("[Channels] Logo from cache: ..."); 
```

Or use a debug flag:

```javascript
var DEBUG_IMAGE_LOADING = false; // Set to false in production

if (DEBUG_IMAGE_LOADING) {
    console.log("[Channels] Logo loaded: ...");
}
```

---

## Summary

| Device | What to Check | Tool | Expected Result |
|--------|---------------|------|-----------------|
| **Browser Emulator** | Console logs + Network tab | DevTools F12 | Logs show correct origin, Network shows 200 OK |
| **Samsung TV** | Visual appearance + (optional) Tizen debugger | TV itself or Studio | Images appear without flashing/disappearing |

**If emulator works but TV doesn't:** The fix is correct code-level, but TV environment (network, origin, API reachability) is the limiting factor.
