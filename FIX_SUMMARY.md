# API Connection & AVPlay Fix Summary

## Problem
Channels play in the emulator but show an empty screen on real Samsung TV devices.

## Root Causes

### 1. API Connection Issues
- **Problem**: Code had localhost fallback logic using `10.127.234.19` (PC's local IP)
- **Impact**: Real TV couldn't reach this IP address, causing API failures
- **Location**: `js/api.js` lines 10-17, 54-66

### 2. AVPlay Display Not Set
- **Problem**: Display rectangle not set immediately after opening stream
- **Impact**: Video plays but is invisible (rendered outside visible area)
- **Location**: `js/avplayer.js` setUrl() and setFullScreen() methods

### 3. Poor Error Handling
- **Problem**: Silent failures with no user feedback
- **Impact**: Difficult to diagnose issues on real TV
- **Location**: Multiple files

## Fixes Applied

### ✅ Fixed: js/api.js
**Changes:**
1. Removed `getBaseUrl()` function with localhost fallback
2. Hardcoded production API URL: `http://124.40.244.211/netmon/cabletvapis`
3. Removed localhost-specific GET fallback in `apiCall()`
4. Improved error messages with status text

**Before:**
```javascript
const getBaseUrl = () => {
    const hostname = window.location.hostname || "10.127.234.19";
    return `http://${hostname === 'localhost' ? '10.127.234.19' : hostname}:3000`;
};
```

**After:**
```javascript
const API_CONFIG = {
    BASE_URL: "http://124.40.244.211/netmon/cabletvapis",
    ADS_BASE_URL: "http://124.40.244.211/netmon/cabletvapis",
    // ... rest of config
};
```

### ✅ Fixed: js/avplayer.js
**Changes:**
1. Added `setDisplayRect(0, 0, 1920, 1080)` immediately after `avplay.open()`
2. Added `setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN')` with error handling
3. Enhanced logging at every step
4. Improved error callbacks

**Before:**
```javascript
setUrl: function (url) {
    avplay.open(url);
    playerState = "IDLE";
}
```

**After:**
```javascript
setUrl: function (url) {
    console.log("[AVPlayer] Opening URL:", url);
    avplay.open(url);
    playerState = "IDLE";
    
    // CRITICAL: Set display rect immediately
    avplay.setDisplayRect(0, 0, 1920, 1080);
    console.log("[AVPlayer] Display rect set to fullscreen");
    
    // Set display method
    avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
    console.log("[AVPlayer] Display method set to fullscreen");
}
```

### ✅ Enhanced: js/player.js
**Changes:**
1. Added DebugHelper integration
2. Added API connection test on page load
3. Added stream URL validation
4. Enhanced error messages with user alerts
5. Improved logging throughout

**Key Additions:**
- Environment check on load
- Device info retrieval
- API connection test with user feedback
- Stream URL format validation
- Try-catch blocks with user-friendly error messages

### ✅ New: js/debug-helper.js
**Features:**
- On-screen debug overlay (top-right corner)
- Environment detection (Tizen, WebAPIs, AVPlay)
- API connection testing
- Device info display (model, firmware, IP, MAC)
- AVPlay testing with public streams
- Log history (last 100 entries)

**Usage:**
```javascript
DebugHelper.log("Message", data);
DebugHelper.checkEnvironment();
DebugHelper.testAPIConnection(callback);
DebugHelper.testAVPlay(streamUrl);
```

### ✅ New: diagnostics.html
**Purpose:** Comprehensive diagnostic tool for testing on real TV

**Features:**
- Environment information display
- Device information (model, firmware, IP, MAC)
- API connection tests with live results
- AVPlay initialization tests
- Public stream playback test
- Real-time logging with color-coded messages

**How to Use:**
1. Navigate to `diagnostics.html` on TV
2. Click "Test API Connection" to verify network
3. Click "Test Channel Data API" to verify channel data
4. Click "Test AVPlay Init" to verify AVPlay availability
5. Click "Test Public Stream" to verify video playback
6. Check logs for detailed information

### ✅ Updated: player.html
**Changes:**
- Added `<script src="js/debug-helper.js"></script>` before other scripts

### ✅ New: TROUBLESHOOTING.md
**Contents:**
- Detailed explanation of all issues and fixes
- Step-by-step diagnostic procedures
- Common error messages and solutions
- Stream URL format requirements
- AVPlay compatibility information
- Quick diagnostic checklist

## Testing Instructions

### On Emulator:
1. Build project
2. Run in emulator
3. Check console for detailed logs
4. Verify channels play correctly

### On Real TV:
1. Build `.wgt` package
2. Install on TV via Tizen Studio
3. Launch app and login
4. **Option A - Use Diagnostics Page:**
   - Navigate to `diagnostics.html`
   - Run all tests
   - Check results

5. **Option B - Test Normal Flow:**
   - Navigate to channels
   - Select a channel
   - Watch for on-screen debug messages (top-right)
   - If empty screen, check console via Remote Inspector

### Using Tizen Studio Remote Inspector:
1. Connect TV to same network as PC
2. In Tizen Studio: Tools → Device Manager
3. Right-click TV → Inspect
4. Open Console tab
5. Look for log messages starting with `[DEBUG]`, `[API]`, `[AVPlayer]`

## Expected Console Output (Success)

```
=== Player Initialized ===
[DEBUG] Player page loaded
[DEBUG] Environment Check: {isTizen: true, hasAVPlay: true, ...}
[DEBUG] Device Info: {model: "...", ip: "...", mac: "..."}
[DEBUG] API Connection Test SUCCESS
[AVPlayer] Opening URL: http://...
[AVPlayer] Display rect set to fullscreen
[AVPlayer] Display method set to fullscreen
[AVPlayer] Preparing stream...
[AVPlayer] Prepared successfully. Starting playback...
[AVPlayer] Playback started successfully
```

## Common Error Messages & Solutions

### "API Connection Error"
**Cause:** Network issue or API server down
**Solution:** 
- Check TV internet connection
- Verify API server is accessible: `http://124.40.244.211`
- Test with diagnostics page

### "No Stream URL found"
**Cause:** Channel data missing `streamlink` or `channel_url`
**Solution:**
- Check API response format
- Verify channel data includes stream URL
- Test with "Test Channel Data API" in diagnostics

### "Invalid stream URL format"
**Cause:** Stream URL doesn't start with http:// or https://
**Solution:**
- Check API response
- Ensure stream URLs are properly formatted
- Example valid URL: `http://server.com/stream.m3u8`

### "AVPlay Prepare Failed"
**Cause:** Stream format not supported or URL unreachable
**Solution:**
- Test stream URL in VLC player
- Check stream format (HLS .m3u8 recommended)
- Verify stream is accessible from TV's network
- Test with public stream in diagnostics page

### Empty Screen with Audio
**Cause:** Display rect not set (should be fixed now)
**Solution:** Already fixed in `avplayer.js`

### Empty Screen, No Audio
**Cause:** Stream URL issue or network problem
**Solution:**
- Check console logs
- Verify stream URL
- Test network connectivity
- Use diagnostics page

## Files Changed

1. ✅ `js/api.js` - Fixed API connection logic
2. ✅ `js/avplayer.js` - Fixed display rect and enhanced logging
3. ✅ `js/player.js` - Added diagnostics and error handling
4. ✅ `player.html` - Added debug-helper script
5. ✅ `js/debug-helper.js` - NEW diagnostic tool
6. ✅ `diagnostics.html` - NEW diagnostic page
7. ✅ `TROUBLESHOOTING.md` - NEW documentation

## Next Steps

1. **Rebuild the app:**
   - Right-click project in Tizen Studio
   - Select "Build Package"

2. **Install on TV:**
   - Right-click `.wgt` file
   - Select "Run As → Tizen Web Application"
   - Select your TV from device list

3. **Test:**
   - Launch app on TV
   - Login with credentials
   - Navigate to diagnostics page first
   - Run all tests
   - Then test normal channel playback

4. **If issues persist:**
   - Share console logs from Remote Inspector
   - Share diagnostics page results
   - Share API response showing channel data
   - Share stream URL being used

## Critical Points

⚠️ **The main fixes are:**
1. API always uses production URL (no localhost fallback)
2. Display rect set immediately after opening stream
3. Display method set to fullscreen
4. Comprehensive error handling and user feedback

✅ **These changes ensure:**
- API works on real TV (not just emulator)
- Video is visible when playing (not off-screen)
- Errors are reported to user (not silent failures)
- Easy diagnosis with debug tools

## Support

If you still experience issues after applying these fixes:
1. Run diagnostics.html on the TV
2. Capture console logs from Remote Inspector
3. Note the exact error messages
4. Check if test stream works (rules out AVPlay issues)
5. Verify API returns valid stream URLs

The fixes address the core issues that cause empty screens on real TVs while working in emulators.
