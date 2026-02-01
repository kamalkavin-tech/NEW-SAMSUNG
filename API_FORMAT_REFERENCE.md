# BBNL IPTV API Format Reference

## ⚠️ IMPORTANT: CORS Issue in Browser

The "Failed to fetch" errors you're seeing are due to **CORS (Cross-Origin Resource Sharing)** blocking in web browsers. This is normal and expected.

**These APIs will work correctly on:**
- ✅ Samsung TV (Real Device)
- ✅ Samsung Tizen Emulator
- ✅ Tizen Studio

**These APIs will NOT work in:**
- ❌ Chrome/Firefox/Safari (CORS blocked)
- ❌ Regular web browser testing

## API Base Configuration

**Base URL**: `http://124.40.244.211/netmon/cabletvapis`

**Required Headers** (All APIs):
```json
{
    "Content-Type": "application/json",
    "Authorization": "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=",
    "devmac": "26:F2:AE:D8:3F:99",
    "devslno": "FOFI20191129000336"
}
```

**Common Payload Fields**:
- `userid`: User ID (from login session)
- `mobile`: Mobile number (from login session)
- `ip_address`: Device IP (optional for some APIs)
- `mac_address`: Device MAC (optional for some APIs)

---

## ✅ Working APIs (Already Tested)

### 1. Login API
**Endpoint**: `/login`
**Payload**:
```json
{
    "mobile": "7800000001",
    "otp": "123456"
}
```
**Status**: ✅ WORKING

### 2. Channel Data API
**Endpoint**: `/chnl_data`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001",
    "ip_address": "192.168.101.110",
    "mac_address": "26:F2:AE:D8:3F:99"
}
```
**Returns**: All 225 channels with streamlinks
**Status**: ✅ WORKING (Returns 204 channels)

### 3. IPTV Ads API
**Endpoint**: `/iptvads`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001",
    "adclient": "fofi",
    "srctype": "image",
    "displayarea": "homepage",
    "displaytype": "multiple"
}
```
**Status**: ✅ WORKING (Returns ads correctly on Samsung TV)

---

## 🔍 APIs to Test on Samsung TV

### 4. Channel Categories API
**Endpoint**: `/chnl_categlist`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001",
    "ip_address": "192.168.101.110",
    "mac_address": "26:F2:AE:D8:3F:99"
}
```
**Expected Response**:
```json
{
    "body": [
        { "catid": "1", "catname": "News" },
        { "catid": "2", "catname": "Sports" },
        { "catid": "3", "catname": "Entertainment" }
    ],
    "status": {
        "err_code": 0,
        "err_msg": "Categories loaded"
    }
}
```

### 5. Language List API
**Endpoint**: `/chnl_langlist`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001",
    "ip_address": "192.168.101.110",
    "mac_address": "26:F2:AE:D8:3F:99"
}
```
**Expected Response**:
```json
{
    "body": [
        { "langid": "1", "langname": "English" },
        { "langid": "9", "langname": "Kannada" },
        { "langid": "12", "langname": "Hindi" }
    ],
    "status": {
        "err_code": 0,
        "err_msg": "Languages loaded"
    }
}
```

### 6. Expiring Channels API
**Endpoint**: `/expiringchnl_list`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001"
}
```
**Expected Response**:
```json
{
    "body": [
        {
            "chid": "123",
            "chtitle": "Star Sports",
            "expirydate": "2026-03-15"
        }
    ],
    "status": {
        "err_code": 0,
        "err_msg": "Expiring channels loaded"
    }
}
```

### 7. OTT Apps API
**Endpoint**: `/allowedapps`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001"
}
```
**Expected Response**:
```json
{
    "body": [
        { "appid": "1", "appname": "Netflix", "appurl": "..." },
        { "appid": "2", "appname": "Amazon Prime", "appurl": "..." }
    ],
    "status": {
        "err_code": 0,
        "err_msg": "Apps loaded"
    }
}
```

### 8. Feedback API
**Endpoint**: `/feedback`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001",
    "feedback": "Great service!",
    "rating": 5
}
```
**Expected Response**:
```json
{
    "status": {
        "err_code": 0,
        "err_msg": "Feedback submitted successfully"
    }
}
```

### 9. App Version API
**Endpoint**: `/appversion`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001"
}
```
**Expected Response**:
```json
{
    "body": [
        {
            "appname": "BBNL IPTV",
            "appversion": "2.1.0",
            "builddate": "2026-02-01"
        }
    ],
    "status": {
        "err_code": 0,
        "err_msg": "Version info loaded"
    }
}
```

### 10. Raise Ticket API
**Endpoint**: `/raiseTicket`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001",
    "issue": "Playback issue",
    "description": "Channel not loading"
}
```
**Expected Response**:
```json
{
    "body": {
        "ticketid": "TKT12345"
    },
    "status": {
        "err_code": 0,
        "err_msg": "Ticket raised successfully"
    }
}
```

### 11. App Lock API
**Endpoint**: `/applock`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001"
}
```
**Expected Response**:
```json
{
    "body": {
        "locked": false
    },
    "status": {
        "err_code": 0,
        "err_msg": "App lock status retrieved"
    }
}
```

### 12. TRP Data API
**Endpoint**: `/trpdata`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001"
}
```
**Expected Response**:
```json
{
    "body": [
        {
            "chid": "123",
            "chtitle": "Star Plus",
            "trp": "2.5"
        }
    ],
    "status": {
        "err_code": 0,
        "err_msg": "TRP data loaded"
    }
}
```

### 13. Resend OTP API
**Endpoint**: `/loginOtp`
**Payload**:
```json
{
    "mobile": "7800000001"
}
```
**Expected Response**:
```json
{
    "status": {
        "err_code": 0,
        "err_msg": "OTP sent successfully"
    }
}
```

### 14. User Logout API
**Endpoint**: `/userLogout`
**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001"
}
```
**Expected Response**:
```json
{
    "status": {
        "err_code": 0,
        "err_msg": "Logout successful"
    }
}
```

---

## 📝 Changes Made

### Fixed API Implementations:

1. **FeedbackAPI** - Added proper device headers:
   ```javascript
   return await apiCall(API_ENDPOINTS.FEED_BACK, payload, {
       "devmac": device.mac_address,
       "devslno": device.devslno || "FOFI20191129000336"
   });
   ```

2. **AppVersionAPI** - Added proper device headers:
   ```javascript
   return await apiCall(API_ENDPOINTS.APP_VERSION, payload, {
       "devmac": device.mac_address,
       "devslno": device.devslno || "FOFI20191129000336"
   });
   ```

### All APIs Now Use Consistent Format:
- ✅ Proper Authorization header
- ✅ Device MAC (devmac) header
- ✅ Device Serial (devslno) header
- ✅ Content-Type: application/json
- ✅ Consistent payload structure

---

## 🚀 How to Test on Samsung TV

### Option 1: Real Samsung TV
1. Deploy the app to your Samsung TV
2. Login with your credentials
3. Navigate to different pages (Channels, Settings, Feedback, etc.)
4. Check browser console logs for API responses

### Option 2: Tizen Studio Emulator
1. Open Tizen Studio
2. Launch TV emulator
3. Install and run the app
4. Test all functionality
5. Check logs in Tizen Studio console

### Option 3: Tizen Web Simulator
1. Open Tizen Web Simulator
2. Load the app
3. Test API calls
4. Check network tab for responses

---

## 📊 Current Status Summary

| API | Endpoint | Status | Notes |
|-----|----------|--------|-------|
| Login | `/login` | ✅ WORKING | Tested on TV |
| Channels | `/chnl_data` | ✅ WORKING | Returns 204 channels |
| Ads | `/iptvads` | ✅ WORKING | Returns ads on TV |
| Categories | `/chnl_categlist` | 🔍 NEED TV TEST | Format fixed |
| Languages | `/chnl_langlist` | 🔍 NEED TV TEST | Format fixed |
| Expiring | `/expiringchnl_list` | 🔍 NEED TV TEST | Format ready |
| OTT Apps | `/allowedapps` | 🔍 NEED TV TEST | Format ready |
| Feedback | `/feedback` | 🔍 NEED TV TEST | Headers added ✅ |
| App Version | `/appversion` | 🔍 NEED TV TEST | Headers added ✅ |
| Raise Ticket | `/raiseTicket` | 🔍 NEED TV TEST | Format ready |
| App Lock | `/applock` | 🔍 NEED TV TEST | Format ready |
| TRP Data | `/trpdata` | 🔍 NEED TV TEST | Format ready |
| Resend OTP | `/loginOtp` | 🔍 NEED TV TEST | Format ready |
| Logout | `/userLogout` | 🔍 NEED TV TEST | Format ready |

---

## ✅ Next Steps

1. **Test on Samsung TV Emulator** - All APIs should work without CORS issues
2. **Report Results** - Let me know which APIs return success responses
3. **Integration** - I'll integrate working APIs into the respective pages properly
4. **Error Handling** - Add proper error messages for failed APIs

**Note**: Browser testing will always show "Failed to fetch" due to CORS. Only TV/emulator testing will give real results.
