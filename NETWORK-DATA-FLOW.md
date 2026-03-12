# Network Data Flow & Device Info - DO NOT CHANGE

## ⚠️ CRITICAL: Keep These Areas Intact

This document specifies the exact data flow for device and network information retrieval. **DO NOT MODIFY** these areas without explicit user approval.

---

## 1. HTML Element IDs (Settings Page)

These are the exact DOM element IDs where network data is displayed. **Keep these IDs unchanged**.

```html
<!-- Network Information Section -->
<span id="device-connection-type">Loading...</span>     <!-- Connection Type: WiFi, Ethernet, etc. -->
<span id="device-ipv4">Loading...</span>                <!-- Local IPv4 Address -->
<span id="device-ipv6">Loading...</span>                <!-- IPv6 Address -->
<span id="device-gateway">Loading...</span>             <!-- Public/Gateway IP -->
<span id="device-dns">Loading...</span>                 <!-- DNS Server -->
<span id="device-wifi-mac">Loading...</span>            <!-- WiFi MAC Address -->
<span id="device-connection-status">Loading...</span>   <!-- Connection Status Header -->
```

---

## 2. Data Flow: What Gets Passed and What's Retrieved

### Step 1: Page Load → loadDeviceInfoPanel()
**File:** `js/settings.js` line 604

```javascript
function loadDeviceInfoPanel() {
    var deviceInfo = typeof DeviceInfo !== 'undefined' ? DeviceInfo.getDeviceInfo() : null;
    var isTizen = (typeof webapis !== 'undefined');
    
    loadNetworkInfo(deviceInfo, isTizen);  // ← Passes these two params
}
```

**Parameters Passed:**
- `deviceInfo` — Device info object from api.js
- `isTizen` — Boolean (true if webapis is globally available)

---

### Step 2: loadNetworkInfo() → Retrieves Network Data
**File:** `js/settings.js` line 699+

**Expected Tizen webapis.network API Calls:**

| Method | Purpose | Expected Return |
|--------|---------|-----------------|
| `webapis.network.getActiveConnectionType()` | Get connection type (WiFi=1, Ethernet=3, etc.) | Integer (0-3) |
| `webapis.network.getIp(networkType)` | Get **local LAN IPv4** | String like "192.168.1.100" |
| `webapis.network.getDns(networkType)` | Get DNS server | String like "8.8.8.8" |
| `webapis.network.getMac(1)` | Get WiFi MAC address (param 1 = WiFi) | String like "AA:BB:CC:DD:EE:FF" |
| `webapis.network.getGateway(networkType)` | Get **gateway/router IP** | String like "192.168.1.1" |

**For Public IP (External Services):**
- Calls external API services: `api.ipify.org`, `api64.ipify.org`, `ipinfo.io`
- Stored in `device-gateway` field (NOT in device-ipv4)

**For IPv6 (Centralized):**
- Uses `DeviceInfo.detectIPv6()` from `api.js`
- Stored in `device-ipv6` field

---

## 3. Settings Page Field Mapping

| HTML Element ID | Data Source | Expected Value | Type |
|-----------------|-------------|-----------------|------|
| `device-connection-type` | `webapis.network.getActiveConnectionType()` | "WiFi", "Ethernet", "Disconnected" | String |
| `device-ipv4` | `webapis.network.getIp(networkType)` | "192.168.x.x" (local LAN IP) | IPv4 String |
| `device-ipv6` | `DeviceInfo.detectIPv6()` | "fe80::..:" or "Not Available" | IPv6 String |
| `device-gateway` | External IP service (public IP) | Public internet IP | IPv4 String |
| `device-dns` | `webapis.network.getDns(networkType)` | "8.8.8.8" or "1.1.1.1" | IPv4 String |
| `device-wifi-mac` | `webapis.network.getMac(1)` (formatted) | "AA:BB:CC:DD:EE:FF" | MAC String |
| `device-connection-status` | Derived from networkType | "Connected" or "Disconnected" | String |

---

## 4. Login Page Reference (For Consistency)

**File:** `js/main.js` lines 138-161

The login page shows **LOCAL IP ONLY**:
```javascript
function showNetworkIP() {
    if (typeof webapis !== 'undefined' && webapis.network) {
        var networkType = webapis.network.getActiveConnectionType();
        var ip = webapis.network.getIp(networkType);  // ← LOCAL IP
        ipText.innerText = ip;
    } else {
        ipText.innerText = "Web/Emulator";
    }
}
```

**Settings page MUST MATCH this behavior:**
- `device-ipv4` should show local LAN IP from `webapis.network.getIp()`
- NOT a public/external IP
- NOT fetched from external APIs

---

## 5. Current Issue

**Problem:** `device-ipv4` shows "N/A (Browser Mode)" instead of local IP

**Root Cause:** The `isTizen` parameter is `false` at page load, so `webapis` check fails

**Solution Being Implemented:**
- Re-check `webapis.network` availability directly in `loadNetworkInfo()` function
- Added fallback methods if primary API returns empty
- Added console logging for debugging

---

## 6. DO NOT CHANGE These Functions

✋ **DO NOT MODIFY without explicit approval:**

1. **`setElementText(id, text)`** — The text setter function
2. **`formatMacAddress(mac)`** — MAC formatting logic
3. **`getConnectionTypeName(type)`** — Connection type label mapping
4. **Element ID strings** — device-ipv4, device-ipv6, device-gateway, etc.
5. **Tizen webapis method names** — getIp(), getGateway(), getMac(), getDns()
6. **Data flow order** — Network info must load after DOM ready

---

## 7. Safe Areas to Modify (If Needed)

✅ **CAN MODIFY for debugging/improvement:**

- Console.log statements and debugging code
- Error handling and try-catch blocks
- Timeout values for external API calls
- Fallback method names (if Samsung webapis has alternative methods)
- Browser/Emulator detection logic
- External IP service URLs (ipify, ipinfo, etc.)

---

## 8. Testing Checklist Before Changes

- [ ] Local IPv4 displays on real Samsung TV
- [ ] Local IPv4 displays in Tizen emulator
- [ ] Gateway/Public IP loads from external service
- [ ] IPv6 loads correctly
- [ ] MAC address displays with colons formatting
- [ ] DNS loads when available
- [ ] Browser mode shows appropriate fallback message
- [ ] Login page and Settings page show same local IP

---

**Last Updated:** March 12, 2026  
**Approved Parameters:** deviceInfo, isTizen, webapis.network  
**Critical Fields:** device-ipv4, device-ipv6, device-gateway, device-dns, device-wifi-mac
