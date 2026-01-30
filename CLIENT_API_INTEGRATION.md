# Client API Integration - Channel Listing
## BBNL IPTV Channel List API Implementation

---

## 🎯 What Changed

### OLD API (Incorrect)
```
Endpoint: http://124.40.244.211/netmon/cabletvapis/chnl_data
Method: POST
Payload: {
  userid: "testiser1",
  mobile: "7800000001",
  ip_address: "103.5.132.130",
  mac_address: "26:F2:AE:D8:3F:99"
}
```

### NEW CLIENT API (Correct) ✅
```
Endpoint: http://124.40.244.211/netmon-iptv/cabletvapis/chnl_list
Method: POST
Payload: {
  userid: "suresh266",        // MANDATORY
  mobile: "7019260650",        // MANDATORY
  langid: "9",                 // MANDATORY (9 = Kannada)
  grid: "",                    // OPTIONAL (category filter)
  bcid: "",                    // OPTIONAL (broadcaster ID)
  search: "zee"                // OPTIONAL (search keyword)
}
```

---

## 📋 API Specification

### Endpoint Details

**Base URL**: `http://124.40.244.211/netmon-iptv/cabletvapis`
**Endpoint**: `/chnl_list`
**Method**: `POST`
**Content-Type**: `application/json`

### Request Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `userid` | string | ✅ YES | User ID | "suresh266" |
| `mobile` | string | ✅ YES | Mobile number | "7019260650" |
| `langid` | string | ✅ YES | Language ID (9=Kannada) | "9" |
| `grid` | string | ❌ NO | Category/Grid filter | "11" or "" |
| `bcid` | string | ❌ NO | Broadcaster ID filter | "59" or "" |
| `search` | string | ❌ NO | Search keyword (pass "" when not searching) | "zee" or "" |

### Language IDs
```javascript
// Common language IDs (refer to API documentation for complete list)
"9"  // Kannada
"1"  // Hindi
"2"  // English
// ... add more as per your API documentation
```

---

## 📥 Response Format

### Success Response
```json
{
  "body": [
    {
      "channels": [
        {
          "chid": "371",
          "bcid": "59",
          "grid": "11",
          "langid": "9",
          "chno": "234",
          "chtitle": "Chintu TV",
          "chprice": "1.00",
          "chdetails": null,
          "chlogo": "http://124.40.244.211/netmon/assets/site_images/chnlnoimage.jpg",
          "streamlink": "https://ts2ka01.fofilabs.com:8081/live/chintutv/index.mpd",
          "subscribed": "true"
        },
        {
          "chid": "363",
          "bcid": "57",
          "grid": "13",
          "langid": "9",
          "chno": "257",
          "chtitle": "Star Sports 1 Kannada",
          "chprice": "2.00",
          "chdetails": null,
          "chlogo": "http://124.40.244.211/netmon/assets/site_images/chnlnoimage.jpg",
          "streamlink": "https://ts2ka01.fofilabs.com:8081/live/starsportskannada/index.mpd",
          "subscribed": "true"
        }
      ],
      "msg": "success"
    }
  ],
  "status": {
    "err_code": 0,
    "err_msg": "Channels listed successfully"
  }
}
```

### Error Responses

#### 1. Authentication Error
```json
{
  "body": [],
  "status": {
    "err_code": 1,
    "err_msg": "Failed to authenticate"
  }
}
```

#### 2. No Records Found
```json
{
  "body": [],
  "status": {
    "err_code": 1,
    "err_msg": "Channel(s) Not Found"
  }
}
```

### Channel Object Structure

| Field | Type | Description |
|-------|------|-------------|
| `chid` | string | Channel unique ID |
| `bcid` | string | Broadcaster ID |
| `grid` | string | Category/Grid ID |
| `langid` | string | Language ID |
| `chno` | string | Channel number |
| `chtitle` | string | Channel title/name |
| `chprice` | string | Subscription price |
| `chdetails` | string/null | Channel description (HTML) |
| `chlogo` | string | Channel logo URL |
| `streamlink` | string | Stream URL (.mpd for MPEG-DASH) |
| `subscribed` | string | "true" or "false" |

---

## 🔧 Implementation Changes

### 1. Updated `js/api.js`

#### New Configuration
```javascript
// Added new IPTV base URL
const API_BASE_URL_IPTV = "http://124.40.244.211/netmon-iptv/cabletvapis";

// Added default language ID
const DEFAULT_LANG_ID = "9"; // Kannada
```

#### Updated Endpoints
```javascript
const API_ENDPOINTS = {
  // ... other endpoints
  CHANNEL_LIST: `${API_BASE_URL_IPTV}/chnl_list`,  // NEW
  CHANNEL_DATA: `${API_BASE_URL_IPTV}/chnl_list`,  // Updated (alias)
  // ...
};
```

#### Updated `getChannelData()` Function
```javascript
// OLD signature
getChannelData: async function ()

// NEW signature with options
getChannelData: async function (options = {})

// Usage:
const channels = await BBNL_API.getChannelData({
  langid: "9",      // Mandatory
  grid: "11",       // Optional - category filter
  search: "zee"     // Optional - search term
});
```

#### New Helper Methods
```javascript
// Search channels
BBNL_API.searchChannels("zee", { langid: "9" })

// Filter by category
BBNL_API.getChannelsByCategory("11", { langid: "9" })

// Filter by language
BBNL_API.getChannelsByLanguage("9")
```

### 2. Updated `js/channels.js`

#### Updated `loadChannels()` Function
```javascript
async function loadChannels(options = {}) {
  const apiOptions = {
    langid: options.langid || "9",  // Kannada default
    grid: options.grid || "",       // Category filter
    bcid: options.bcid || "",       // Broadcaster filter
    search: options.search || ""    // Search term
  };

  let response = await BBNL_API.getChannelList(apiOptions);
  // ...
}
```

### 3. Updated Proxy Server (`bbnl-proxy/server.js`)

Added new `/chnl_list` endpoint:
```javascript
app.post('/chnl_list', (req, res) => {
  res.json({
    body: [{
      channels: MOCK_DATA.channels,
      msg: "success"
    }],
    status: {
      err_code: 0,
      err_msg: "Channels listed successfully"
    }
  });
});
```

---

## 🧪 Testing Guide

### Step 1: Start Development Proxy (For Browser Testing)

```bash
cd bbnl-proxy
npm install
npm start
```

Proxy runs on `http://localhost:3000`

### Step 2: Test in Browser Console

Open `channels.html` in browser and open DevTools console.

#### Test 1: Load All Channels (Default Language)
```javascript
// This uses langid = "9" (Kannada) by default
const channels = await BBNL_API.getChannelList();
console.log("Channels:", channels);
console.log("Total:", channels.length);
```

#### Test 2: Load Channels with Specific Language
```javascript
const channels = await BBNL_API.getChannelList({ langid: "1" });
console.log("Hindi Channels:", channels);
```

#### Test 3: Filter by Category (Grid)
```javascript
// Load channels for grid/category ID "11"
const channels = await BBNL_API.getChannelsByCategory("11");
console.log("Category 11 Channels:", channels);
```

#### Test 4: Search Channels
```javascript
const results = await BBNL_API.searchChannels("zee");
console.log("Search Results:", results);
```

#### Test 5: Combined Filters
```javascript
const channels = await BBNL_API.getChannelList({
  langid: "9",
  grid: "11",
  search: "star"
});
console.log("Filtered Channels:", channels);
```

### Step 3: Verify Response Format

```javascript
const channels = await BBNL_API.getChannelList();
console.log("First Channel:", channels[0]);

// Should have these fields:
// chid, bcid, grid, langid, chno, chtitle, chprice,
// chdetails, chlogo, streamlink, subscribed
```

### Step 4: Test Channel Playback

```javascript
const channels = await BBNL_API.getChannelList();
if (channels.length > 0) {
  // This should navigate to player.html with channel data
  BBNL_API.playChannel(channels[0]);
}
```

---

## 🎬 Player Integration

### Stream Format Change

**Old Format**: HLS (.m3u8)
```
https://example.com/stream.m3u8
```

**New Format**: MPEG-DASH (.mpd)
```
https://ts2ka01.fofilabs.com:8081/live/chintutv/index.mpd
```

### Player Compatibility

**Tizen AVPlay** supports both:
- ✅ HLS (.m3u8)
- ✅ MPEG-DASH (.mpd)

No code changes needed in `player.js` or `avplayer.js` - AVPlay auto-detects format.

### Verify Player

1. Load channels page
2. Click any channel
3. Should navigate to `player.html`
4. Video should start playing

**Debug in Player**:
```javascript
// In player.html console
console.log("Current Stream URL:", /* check what URL is being used */);
```

---

## 🔍 Troubleshooting

### Issue 1: "No channels returned"

**Check**:
1. Is user authenticated?
   ```javascript
   console.log("Authenticated:", BBNL_API.isAuthenticated());
   console.log("User Data:", BBNL_API.getUserData());
   ```

2. Check API response in Network tab
   - Look for `/chnl_list` request
   - Check payload has `langid`
   - Check response `status.err_code` === 0

3. Check console logs
   ```javascript
   // Should see:
   [ChannelsAPI] Getting Channel List with payload: {...}
   [ChannelsAPI] Raw Response: {...}
   [ChannelsAPI] Successfully loaded X channels
   ```

### Issue 2: "Failed to authenticate"

**Solution**: Ensure you're logged in
```javascript
// Check session
BBNL_API.isAuthenticated(); // Should return true

// If false, login first
window.location.href = 'login.html';
```

### Issue 3: Channels not filtering by category

**Check**:
1. Category button has correct `data-id` with grid ID
2. `handleCategorySelect()` is passing the grid ID
3. API is being called with `grid` parameter

**Debug**:
```javascript
// In channels.js handleCategorySelect()
console.log("Selected Grid ID:", catId);

// Should call loadChannels with grid
loadChannels({ grid: catId });
```

### Issue 4: Search not working

**Verify search implementation**:
```javascript
// In channel search input handler
const searchTerm = document.getElementById('search-input').value;
const results = await BBNL_API.searchChannels(searchTerm);
console.log("Search Results:", results);
```

### Issue 5: Player not loading stream

**Check**:
1. Stream URL format
   ```javascript
   console.log("Stream URL:", channel.streamlink);
   // Should be: https://.../*.mpd or *.m3u8
   ```

2. Tizen AVPlay availability
   ```javascript
   console.log("AVPlay Available:", typeof webapis !== 'undefined' && webapis.avplay);
   ```

3. Network access in `config.xml`
   ```xml
   <access origin="https://ts2ka01.fofilabs.com" subdomains="true"/>
   ```

---

## 📊 API Usage Examples

### Example 1: Channel Listing Page (Full Implementation)

```javascript
// channels.js
let allChannels = [];
let currentLanguage = "9"; // Kannada

async function initPage() {
  // Load categories
  const categories = await BBNL_API.getCategories();
  renderCategories(categories);

  // Load channels (default language)
  await loadChannels({ langid: currentLanguage });
}

async function loadChannels(options = {}) {
  const channels = await BBNL_API.getChannelList({
    langid: options.langid || currentLanguage,
    grid: options.grid || "",
    search: options.search || ""
  });

  allChannels = channels;
  renderChannels(channels);
}

function handleCategorySelect(gridId) {
  // Filter channels by category
  loadChannels({ grid: gridId });
}

function handleSearch(searchTerm) {
  // Search channels
  loadChannels({ search: searchTerm });
}

function handleLanguageChange(langId) {
  currentLanguage = langId;
  loadChannels({ langid: langId });
}
```

### Example 2: Search Implementation

```html
<!-- Add to channels.html -->
<input
  type="text"
  id="channel-search"
  placeholder="Search channels..."
  onkeyup="handleSearchInput(this.value)"
>
```

```javascript
// In channels.js
let searchTimeout;

function handleSearchInput(searchTerm) {
  // Debounce search
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    if (searchTerm.length >= 2) {
      const results = await BBNL_API.searchChannels(searchTerm);
      renderChannels(results);
    } else if (searchTerm.length === 0) {
      // Show all channels
      loadChannels();
    }
  }, 500); // Wait 500ms after user stops typing
}
```

### Example 3: Language Selector

```html
<!-- Add to channels.html -->
<select id="language-selector" onchange="handleLanguageChange(this.value)">
  <option value="9">Kannada</option>
  <option value="1">Hindi</option>
  <option value="2">English</option>
</select>
```

```javascript
async function handleLanguageChange(langId) {
  console.log("Language changed to:", langId);
  await loadChannels({ langid: langId });
}
```

---

## ✅ Verification Checklist

### API Integration
- [x] Updated base URL to `/netmon-iptv/cabletvapis`
- [x] Updated endpoint to `/chnl_list`
- [x] Added mandatory `langid` parameter
- [x] Added optional `grid`, `bcid`, `search` parameters
- [x] Updated response parsing for nested `body[0].channels` format
- [x] Added new helper methods (searchChannels, getChannelsByCategory, etc.)

### Code Changes
- [x] Updated `js/api.js` - API service layer
- [x] Updated `js/channels.js` - Channel page controller
- [x] Updated `bbnl-proxy/server.js` - Development proxy
- [x] Updated mock data to match client's response format

### Testing
- [ ] Test channel loading with default language
- [ ] Test category filtering
- [ ] Test search functionality
- [ ] Test language selection
- [ ] Test channel playback
- [ ] Test on actual Tizen TV device

### Documentation
- [x] Created CLIENT_API_INTEGRATION.md
- [x] Updated Strategy API Integration.md
- [x] Added inline code comments

---

## 🚀 Deployment Notes

### For Production Deployment:

1. **Update User Credentials** in `js/api.js`:
   ```javascript
   const DEFAULT_USER = {
     userid: "suresh266",    // Update with actual user
     mobile: "7019260650"    // Update with actual mobile
   };
   ```

2. **Set Default Language**:
   ```javascript
   const DEFAULT_LANG_ID = "9"; // Set your default language
   ```

3. **Remove Development Proxy**:
   - Production app connects directly to `http://124.40.244.211/netmon-iptv/cabletvapis`
   - No need for proxy server on Tizen TV

4. **Test on Real Device**:
   - Deploy to Tizen TV
   - Test all features
   - Monitor console logs for errors

5. **Add Error Handling**:
   - Show user-friendly error messages
   - Implement retry logic for failed requests
   - Handle network connectivity issues

---

## 📞 Support

If you encounter issues:

1. Check browser console for errors
2. Check Network tab for API requests/responses
3. Verify `langid` is being sent in all channel requests
4. Ensure response has `body[0].channels` structure
5. Test with mock proxy server first before real API

---

## 🎉 Summary

The client's actual channel listing API has been successfully integrated with:

✅ Correct endpoint: `/netmon-iptv/cabletvapis/chnl_list`
✅ Mandatory `langid` parameter support
✅ Optional filtering: `grid`, `bcid`, `search`
✅ Proper response parsing: `body[0].channels[]`
✅ New helper methods for search and filtering
✅ Updated mock data for testing
✅ Backward compatible with existing code

**All channel-related functionality should now work correctly with the real API!**
