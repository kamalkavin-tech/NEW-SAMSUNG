# 🚀 Quick Fix Reference Card

## What Was Wrong?

### ❌ Problem 1: API Connection
- Code tried to use `10.127.234.19:3000` (your PC's IP)
- Real TV can't reach your PC
- **Result:** API calls failed silently

### ❌ Problem 2: AVPlay Display
- Video display area not set after opening stream
- **Result:** Video plays but is invisible (off-screen)

### ❌ Problem 3: No Error Messages
- Failures happened silently
- **Result:** Impossible to diagnose on TV

---

## What Was Fixed?

### ✅ Fix 1: API Always Uses Production Server
**File:** `js/api.js`
```javascript
// Now always uses this URL on TV:
BASE_URL: "http://124.40.244.211/netmon/cabletvapis"
```

### ✅ Fix 2: Display Rect Set Immediately
**File:** `js/avplayer.js`
```javascript
// After opening stream, immediately:
avplay.setDisplayRect(0, 0, 1920, 1080);
avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_FULL_SCREEN');
```

### ✅ Fix 3: Debug Tools Added
**Files:** `js/debug-helper.js`, `diagnostics.html`
- On-screen debug overlay
- Diagnostic test page
- User-friendly error messages

---

## How to Test Right Now

### Step 1: Rebuild
```
Right-click project → Build Package
```

### Step 2: Install on TV
```
Right-click BasicProject2.wgt → Run As → Tizen Web Application
```

### Step 3: Run Diagnostics
1. Launch app on TV
2. Navigate to: **diagnostics.html** (add to menu or access directly)
3. Click all test buttons:
   - ✅ Test API Connection
   - ✅ Test Channel Data API
   - ✅ Test AVPlay Init
   - ✅ Test Public Stream

### Step 4: Check Results
- **All green = Good to go!**
- **Red errors = Check console logs**

---

## Quick Diagnostic Checklist

### If Empty Screen Appears:

1. **Check Console (Remote Inspector)**
   ```
   Look for: [AVPlayer] Playback started successfully
   ```

2. **Check Stream URL**
   ```
   Should be: http://... or https://...
   Not: empty, null, or localhost
   ```

3. **Check API Response**
   ```
   Channel data must have: streamlink or channel_url
   ```

4. **Test Public Stream**
   ```
   Use diagnostics page → Test Public Stream
   If this works = Your API stream URLs are the problem
   If this fails = AVPlay or TV issue
   ```

---

## Console Logs to Look For

### ✅ Success Pattern:
```
[DEBUG] Player page loaded
[DEBUG] API Connection Test SUCCESS
[AVPlayer] Opening URL: http://...
[AVPlayer] Display rect set to fullscreen
[AVPlayer] Prepared successfully
[AVPlayer] Playback started successfully
```

### ❌ Error Patterns:

**API Error:**
```
[API] Error: HTTP Error: 500
[DEBUG] API Connection Test FAILED
```
→ **Solution:** Check network, verify API server is up

**No Stream URL:**
```
[DEBUG] ERROR: No stream URL
```
→ **Solution:** Check API response, ensure channel has streamlink

**AVPlay Error:**
```
[AVPlayer] Prepare Failed: PLAYER_ERROR_INVALID_URI
```
→ **Solution:** Stream URL is invalid or unreachable

**Display Error:**
```
[AVPlayer] Display rect error: ...
```
→ **Solution:** Rare, might be TV model specific

---

## Emergency Troubleshooting

### Problem: Still Empty Screen After Fix

**Step 1:** Open Remote Inspector
- Tizen Studio → Tools → Device Manager
- Right-click TV → Inspect
- Check Console tab

**Step 2:** Look for Error Messages
- Red text = errors
- Note the exact message

**Step 3:** Test with Known Good Stream
```javascript
// In diagnostics page, this should work:
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
```

**Step 4:** Check API Response
- In diagnostics, click "Test Channel Data API"
- Look for `streamlink` or `channel_url` in response
- Copy the URL and test in VLC player on PC

---

## Common Solutions

| Problem | Solution |
|---------|----------|
| Empty screen, no audio | Check stream URL in API response |
| Empty screen with audio | Should be fixed (display rect) |
| Black screen buffering | Wait, or check network speed |
| Immediate error | Invalid stream format |
| Works in emulator only | Was API localhost issue (fixed) |
| API connection failed | Check TV internet, verify server |

---

## Files You Can Check

### Modified Files:
- ✅ `js/api.js` - API connection fixed
- ✅ `js/avplayer.js` - Display rect fixed
- ✅ `js/player.js` - Error handling added

### New Files:
- 🆕 `js/debug-helper.js` - Debug tools
- 🆕 `diagnostics.html` - Test page
- 🆕 `TROUBLESHOOTING.md` - Full guide
- 🆕 `FIX_SUMMARY.md` - Detailed summary

---

## Need More Help?

### Provide These:
1. Console logs from Remote Inspector
2. Diagnostics page test results
3. API response showing channel data
4. Stream URL being used
5. TV model and firmware

### Check These:
- Stream URL works in VLC?
- API server accessible from TV network?
- Other channels work or all fail?
- Emulator still works?

---

## Expected Outcome

### Before Fix:
- ❌ Emulator: Works
- ❌ Real TV: Empty screen

### After Fix:
- ✅ Emulator: Works
- ✅ Real TV: Works

---

## One-Line Summary

**The fix ensures API uses production server (not localhost) and AVPlay displays video in visible area (not off-screen).**

---

## Quick Test Command

If you want to test just the critical parts:

1. Open `diagnostics.html` on TV
2. Click "Test Public Stream"
3. If you see video = AVPlay works, check your API stream URLs
4. If no video = AVPlay issue or TV problem

**That's it! The fixes are in place. Just rebuild and test!** 🎉
