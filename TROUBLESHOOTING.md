# BBNL TV App - Troubleshooting Guide

## Problem: Channel plays in emulator but shows empty screen on real TV

### Root Causes Identified and Fixed:

#### 1. **API Connection Issues** ✅ FIXED
**Problem:** The code had localhost fallback logic that interfered with production API calls
- Lines 10-17 in `api.js` tried to use `10.127.234.19` (PC's local IP)
- This IP is not accessible from a real TV device
- Fallback GET logic on line 54-66 prevented proper error handling

**Fix Applied:**
- Removed `getBaseUrl()` function
- Hardcoded production API URL: `http://124.40.244.211/netmon/cabletvapis`
- Removed localhost-specific fallback logic
- Now API always uses production server on TV

#### 2. **AVPlay Display Issues** ✅ FIXED
**Problem:** Video display rect not set properly, causing invisible playback
- `setDisplayRect()` was only called in `setFullScreen()` method
- Not called immediately after `avplay.open()`
- Display method not set to fullscreen mode

**Fix Applied:**
- Added `setDisplayRect(0, 0, 1920, 1080)` immediately after `avplay.open()` in `setUrl()`
- Added `setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN')` with error handling
- Enhanced logging to track display rect setting

#### 3. **Error Handling** ✅ IMPROVED
**Problem:** Silent failures with no user feedback
- Errors were logged but not displayed to user
- No way to diagnose issues on TV

**Fix Applied:**
- Added comprehensive error callbacks with user alerts
- Created `DebugHelper` module for on-screen diagnostics
- Added stream URL validation
- Enhanced logging at every step

---

## How to Test the Fixes

### On Emulator:
1. Build and run the app
2. Login with credentials
3. Navigate to channels
4. Select a channel to play
5. Check console for detailed logs

### On Real TV:
1. Build the `.wgt` file
2. Install on TV via Tizen Studio
3. Launch app
4. **Enable Debug Overlay:** Press the "Tools" button on remote (if implemented)
5. Watch for on-screen debug messages in top-right corner
6. Try playing a channel

---

## Debug Information to Check

### When channel shows empty screen, check:

1. **Console Logs** (via Tizen Studio Remote Inspector):
   ```
   [DEBUG] Environment Check
   [DEBUG] Device Info
   [DEBUG] API Connection Test
   [DEBUG] Stream URL: <url>
   [AVPlayer] Opening URL: <url>
   [AVPlayer] Display rect set to fullscreen
   [AVPlayer] Prepared successfully
   [AVPlayer] Playback started successfully
   ```

2. **Common Error Messages:**
   - "API Connection Error" → Network issue or API server down
   - "No Stream URL found" → Channel data missing streamlink/channel_url
   - "Invalid stream URL format" → URL doesn't start with http:// or https://
   - "AVPlayer Prepare Failed" → Stream format not supported or URL unreachable
   - "Display rect error" → AVPlay API issue (rare)

3. **Stream URL Format:**
   - Should be: `http://` or `https://` followed by domain
   - Common formats: `.m3u8` (HLS), `.mpd` (DASH), `.ts` (MPEG-TS)
   - Example: `http://example.com/stream/channel1.m3u8`

---

## Additional Checks

### 1. Verify API Response
The API should return channel data with `streamlink` or `channel_url`:
```json
{
  "body": [
    {
      "chtitle": "Channel Name",
      "streamlink": "http://server.com/stream.m3u8",
      "chlogo": "http://server.com/logo.png",
      "urno": "001"
    }
  ]
}
```

### 2. Network Connectivity
- Ensure TV is connected to internet
- Check if TV can reach `http://124.40.244.211`
- Test with browser on same network

### 3. Stream URL Accessibility
- Open stream URL in VLC player on PC
- If it doesn't play in VLC, it won't play on TV
- Check if stream requires authentication/headers

### 4. AVPlay Compatibility
- Supported formats: HLS (.m3u8), MPEG-DASH (.mpd), Progressive MP4
- Codec support: H.264, H.265 (on newer models)
- DRM: PlayReady (if stream is encrypted)

---

## Quick Diagnostic Steps

### Step 1: Enable Debug Overlay
Add this to player.html after body tag:
```html
<div id="debug-overlay" style="position:fixed;top:10px;right:10px;z-index:9999;"></div>
```

### Step 2: Check Logs
Press F12 in Tizen Studio Remote Inspector and look for:
- ✅ "API Connection Test SUCCESS"
- ✅ "Stream URL: http://..."
- ✅ "AVPlayer Prepare Success"
- ✅ "Playback started successfully"

### Step 3: Test with Public Stream
Temporarily replace stream URL with a public test stream:
```javascript
var testUrl = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";
AVPlayer.changeStream(testUrl);
```

If this works, the problem is with your API's stream URLs.

---

## Files Modified

1. **js/api.js**
   - Removed localhost fallback logic
   - Fixed API URL configuration
   - Improved error handling

2. **js/avplayer.js**
   - Added display rect setting in setUrl()
   - Added display method setting
   - Enhanced error callbacks
   - Improved state management

3. **js/player.js**
   - Added debug helper integration
   - Enhanced error messages
   - Added stream URL validation
   - Improved user feedback

4. **js/debug-helper.js** (NEW)
   - On-screen debug overlay
   - Environment detection
   - API connection testing
   - Device info display

5. **player.html**
   - Added debug-helper.js script

---

## Next Steps

1. **Rebuild the app:**
   ```
   Right-click project → Build Package
   ```

2. **Install on TV:**
   ```
   Right-click .wgt → Run As → Tizen Web Application
   ```

3. **Test playback:**
   - Login
   - Select channel
   - Watch for debug messages
   - Check console logs

4. **If still not working:**
   - Share console logs
   - Share API response for channel data
   - Share stream URL being used
   - Check if stream URL works in VLC

---

## Common Solutions

### Empty Screen but Audio Playing
→ Display rect issue (should be fixed now)

### Empty Screen, No Audio
→ Stream URL issue or network problem

### Black Screen with Buffering
→ Stream is loading, wait or check network speed

### Immediate Error
→ Invalid stream URL or format not supported

---

## Contact Points for Further Help

If issues persist, provide:
1. Console logs from Tizen Remote Inspector
2. API response showing channel data
3. Stream URL being used
4. TV model and firmware version
5. Screenshots of debug overlay (if visible)
