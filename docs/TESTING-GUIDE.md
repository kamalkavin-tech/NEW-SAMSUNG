# 🧪 BBNL IPTV Testing Guide

## The CORS Problem

When testing IPTV apps in a **web browser**, you'll encounter CORS errors:

```
Access to fetch at 'http://124.40.244.211/...' has been blocked by CORS policy
```

This is **NORMAL** because:
- The BBNL API server doesn't allow cross-origin requests from browsers
- IPTV apps are designed to run on **Tizen TV**, not browsers
- Tizen TV doesn't have CORS restrictions

---

## ✅ Testing Options

### **Option 1: Tizen Emulator** (Recommended for final testing)

**Pros:**
- ✅ No CORS issues
- ✅ Real Tizen environment
- ✅ Accurate performance testing
- ✅ Test remote control navigation

**Cons:**
- ❌ Slower than browser
- ❌ Requires Tizen Studio
- ❌ Harder to debug

**How to use:**
1. Open Tizen Studio
2. Launch TV Emulator or Simulator
3. Deploy your app (F5 or Build → Run)
4. Make sure `USE_PROXY = false` in api.js
5. Test the app

---

### **Option 2: Browser with Proxy Server** (Best for development)

**Pros:**
- ✅ Fast refresh/reload
- ✅ Chrome DevTools for debugging
- ✅ No CORS errors
- ✅ Easy to test

**Cons:**
- ❌ Requires Node.js
- ❌ Need to run proxy server
- ❌ Doesn't test Tizen-specific features

**How to use:**

#### Step 1: Start Proxy Server
Open terminal in project folder and run:
```bash
node proxy-server.js
```

You should see:
```
🚀 BBNL CORS Proxy Server running on http://localhost:3000
📡 Forwarding requests to http://124.40.244.211
✅ Ready for browser testing!
```

#### Step 2: Enable Proxy Mode
In `js/api.js`, set:
```javascript
var USE_PROXY = true;  // ✅ ENABLED
```

#### Step 3: Test in Browser
- Open home.html in Chrome/Edge
- API calls will go through localhost:3000 proxy
- No CORS errors!

#### Step 4: Stop Proxy
Press `Ctrl+C` in the terminal

---

### **Option 3: Disable CORS in Browser** (Quick but unsafe)

**⚠️ WARNING: Only for testing! Never use for production!**

**Chrome:**
```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --disable-web-security --user-data-dir="C:\chrome-temp"

# Mac
open -na Google\ Chrome --args --disable-web-security --user-data-dir="/tmp/chrome-temp"

# Linux
google-chrome --disable-web-security --user-data-dir="/tmp/chrome-temp"
```

**Edge:**
```bash
# Windows
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --disable-web-security --user-data-dir="C:\edge-temp"
```

Then open your app - CORS will be disabled.

**⚠️ Remember to close this browser when done!**

---

## 🎯 Recommended Workflow

### **During Development (Daily Work)**
1. Use **Browser + Proxy** for fast iteration
2. Run `node proxy-server.js` once per session
3. Set `USE_PROXY = true`
4. Develop and test quickly

### **Before Deployment (Final Testing)**
1. Switch to **Tizen Emulator**
2. Set `USE_PROXY = false`
3. Test all features
4. Verify remote control navigation
5. Check performance

### **Production Deployment**
1. Ensure `USE_PROXY = false` ✅
2. Build the .wgt package
3. Deploy to Tizen Store or TV

---

## 🐛 Troubleshooting

### "Failed to fetch" or CORS errors
- ✅ Check if proxy server is running (`node proxy-server.js`)
- ✅ Check if `USE_PROXY = true` in api.js
- ✅ Refresh the browser

### Proxy server won't start
- ✅ Check if Node.js is installed: `node --version`
- ✅ Check if port 3000 is free
- ✅ Try a different port (edit proxy-server.js)

### Ads not loading
1. Check browser console for errors
2. Use test-ads-api.html to diagnose
3. Verify you're logged in (some APIs need auth)
4. Check if backend has ads configured for your user

### Works in browser but not on Tizen
- ✅ Make sure `USE_PROXY = false` for Tizen
- ✅ Check Tizen console logs
- ✅ Verify network connectivity on TV/emulator

---

## 📊 Quick Reference

| Environment | USE_PROXY | Start Command | CORS Issues? |
|-------------|-----------|---------------|--------------|
| **Browser (with proxy)** | `true` | `node proxy-server.js` | ❌ No |
| **Browser (no proxy)** | `false` | None | ✅ Yes (blocked) |
| **Tizen Emulator** | `false` | Tizen Studio | ❌ No |
| **Tizen TV (Real device)** | `false` | Deploy via Tizen | ❌ No |

---

## 💡 Pro Tips

1. **Use Live Server extension** in VS Code for auto-refresh
2. **Keep proxy running** - no need to restart between tests
3. **Use Chrome DevTools** Network tab to inspect API calls
4. **Check proxy logs** in terminal to see requests/responses
5. **Test login flow first** - many APIs need authenticated user

---

## 🎓 Understanding the Setup

```
Browser (http://127.0.0.1:5500)
    ↓
    ↓ (with USE_PROXY = true)
    ↓
Proxy Server (localhost:3000)  ← Adds CORS headers
    ↓
    ↓ Forwards to
    ↓
BBNL API Server (http://124.40.244.211)
```

**Without proxy:**
```
Browser → ❌ CORS Error (blocked)
```

**With proxy:**
```
Browser → ✅ Proxy → ✅ BBNL Server
```

---

Happy Testing! 🚀
