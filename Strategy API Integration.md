# Strategy API Integration Guide
## BBNL Samsung Tizen TV IPTV Application

---

## Table of Contents
1. [Project Architecture Overview](#1-project-architecture-overview)
2. [API Integration Patterns](#2-api-integration-patterns)
3. [Step-by-Step Integration Guide](#3-step-by-step-integration-guide)
4. [Channel Listing Implementation](#4-channel-listing-implementation)
5. [Error Handling & Recovery](#5-error-handling--recovery)
6. [Testing Strategy](#6-testing-strategy)
7. [Common Pitfalls & Solutions](#7-common-pitfalls--solutions)
8. [Best Practices](#8-best-practices)

---

## 1. Project Architecture Overview

### File Structure
```
NEW-SAMSUNG/
├── HTML Pages (UI Layer)
│   ├── login.html           → Entry point (OTP request)
│   ├── verify.html          → OTP verification
│   ├── home.html            → Dashboard (ads, featured content)
│   ├── channels.html        → Full channel listing
│   ├── player.html          → Video player
│   └── [other pages...]
│
├── JavaScript (Logic Layer)
│   ├── js/api.js            → **CORE API SERVICE** (All backend calls)
│   ├── js/main.js           → Global controller (auth, navigation)
│   ├── js/channels.js       → Channel page controller
│   ├── js/home.js           → Home page controller
│   ├── js/player.js         → Player controller
│   └── [other controllers...]
│
├── CSS (Presentation Layer)
│   ├── css/style.css        → Main aggregator
│   ├── css/base/            → Reset, variables, responsive
│   ├── css/componentes/     → Reusable components
│   ├── css/layout/          → Header, sidebar
│   └── css/pages/           → Page-specific styles
│
└── Configuration
    ├── config.xml           → Tizen app manifest
    ├── bbnl-proxy/          → Development CORS proxy
    └── db.json              → Mock data for testing
```

### Three-Layer Architecture

```
┌─────────────────────────────────────────┐
│         UI LAYER (HTML Pages)           │
│  login.html, channels.html, player.html │
└──────────────┬──────────────────────────┘
               │ User Interactions
               ↓
┌─────────────────────────────────────────┐
│    CONTROLLER LAYER (Page JS Files)     │
│  main.js, channels.js, home.js, etc.    │
│  - Handle UI events                     │
│  - Call API service methods             │
│  - Update DOM with responses            │
└──────────────┬──────────────────────────┘
               │ API Calls
               ↓
┌─────────────────────────────────────────┐
│      SERVICE LAYER (api.js)             │
│  - AuthAPI, ChannelsAPI, AdsAPI         │
│  - Device info management               │
│  - Session management                   │
│  - HTTP request handling                │
└──────────────┬──────────────────────────┘
               │ HTTP Requests
               ↓
┌─────────────────────────────────────────┐
│         BACKEND API                     │
│  http://124.40.244.211/netmon/cabletvapis│
└─────────────────────────────────────────┘
```

---

## 2. API Integration Patterns

### Core API Service: `js/api.js`

The **SINGLE SOURCE OF TRUTH** for all backend communication.

#### API Modules

```javascript
// 1. AuthAPI - Authentication & Session Management
AuthAPI.requestOTP(userid, mobile)
AuthAPI.verifyOTP(userid, mobile, otpcode)
AuthAPI.addMacAddress(userid, mobile)
AuthAPI.setSession(response)
AuthAPI.getUserData()
AuthAPI.isAuthenticated()
AuthAPI.logout()

// 2. ChannelsAPI - Channel Data Management
ChannelsAPI.getCategories()
ChannelsAPI.getChannelData()
ChannelsAPI.getLanguageList()
ChannelsAPI.getSubscribedChannels(channels)
ChannelsAPI.getChannelsByGrid(channels, gridId)
ChannelsAPI.playChannel(channel)

// 3. AdsAPI - Advertisement Management
AdsAPI.getIPTVAds(options)
AdsAPI.getHomeAds()
AdsAPI.getVideoAds()
AdsAPI.createSlider(containerId, ads, interval)

// 4. DeviceInfo - Device Information
DeviceInfo.initializeDeviceInfo()
DeviceInfo.getDeviceInfo()
```

#### Global Access

All APIs are exposed globally via `window.BBNL_API`:

```javascript
// In any HTML page or JS file:
const user = BBNL_API.getUserData();
const channels = await BBNL_API.getChannelList();
```

---

## 3. Step-by-Step Integration Guide

### Step 1: Initialize Device Info (App Startup)

**When**: On every page load, before any API calls
**Where**: `js/api.js` (auto-runs on load) or manually in `main.js`

```javascript
// Auto-initialization (already in api.js)
DeviceInfo.initializeDeviceInfo();

// This will:
// 1. Detect Tizen TV network info (IP, MAC)
// 2. Fallback to hardcoded values if detection fails
// 3. Update DEFAULT_HEADERS with device MAC
```

**Device Info Structure**:
```javascript
{
  ip_address: "103.5.132.130",      // Auto-detected or fallback
  mac_address: "26:F2:AE:D8:3F:99", // Hardcoded (disabled auto-detect)
  device_name: "rk3368_box_",
  device_type: "FOFI_LG",
  devslno: "FOFI20191129000336"
}
```

---

### Step 2: Authenticate User (Login Flow)

**Flow**: `login.html` → `verify.html` → `home.html`

#### A. Request OTP (`login.html`)

```javascript
// login.html or main.js
async function handleLogin() {
  const userid = document.getElementById('userid').value;
  const mobile = document.getElementById('mobile').value;

  // Call API
  const response = await BBNL_API.requestOTP(userid, mobile);

  // Check response
  if (response && response.status && response.status.err_code === 0) {
    console.log("OTP sent successfully!");
    console.log("OTP Code (test):", response.body[0].otpcode); // For testing
    window.location.href = 'verify.html';
  } else {
    alert("Error: " + (response.status?.err_msg || "Failed to send OTP"));
  }
}
```

**API Endpoint**: `POST /login`
**Request Payload**:
```json
{
  "userid": "testiser1",
  "mobile": "7800000001",
  "mac_address": "26:F2:AE:D8:3F:99",
  "device_name": "rk3368_box_",
  "ip_address": "103.5.132.130",
  "device_type": "FOFI_LG",
  "getuserdet": ""
}
```

**Expected Response**:
```json
{
  "body": [{
    "otpcode": 2159,
    "custdet": [...]
  }],
  "status": {
    "err_code": 0,
    "err_msg": "OTP sent successfully"
  }
}
```

---

#### B. Verify OTP (`verify.html`)

```javascript
// verify.html or main.js
async function handleVerifyOTP() {
  const userid = localStorage.getItem('temp_userid') || 'testiser1';
  const mobile = localStorage.getItem('temp_mobile') || '7800000001';
  const otpcode = getOTPFromInputs(); // Read from 4-digit input fields

  // Call API
  const response = await BBNL_API.verifyOTP(userid, mobile, otpcode);

  // Check response
  if (response && response.status && response.status.err_code === 0) {
    console.log("Login successful!");
    // Session is auto-saved by AuthAPI.setSession()
    window.location.href = 'home.html';
  } else {
    alert("Invalid OTP. Please try again.");
  }
}
```

**API Endpoint**: `POST /loginOtp`
**Request Payload**:
```json
{
  "userid": "testiser1",
  "mobile": "7800000001",
  "otpcode": "2159",
  "mac_address": "26:F2:AE:D8:3F:99",
  "device_name": "rk3368_box_",
  "ip_address": "103.5.132.130",
  "device_type": "FOFI_LG",
  "getuserdet": ""
}
```

**Expected Response**:
```json
{
  "userid": "testiser1",
  "mobile": "7800000001",
  "session_token": "abc123...",
  "user_name": "Test User",
  "status": {
    "err_code": 0,
    "err_msg": "Authentication successful!"
  }
}
```

**Session Storage**:
```javascript
// Automatically stored in localStorage["bbnl_user"]
const userData = BBNL_API.getUserData();
// Returns: { userid, mobile, session_token, user_name, ... }
```

---

#### C. Protect Pages (Auth Guard)

```javascript
// On every protected page (home.html, channels.html, etc.)
// Add this at the top of the page script:

if (!BBNL_API.isAuthenticated()) {
  window.location.href = 'login.html';
}

// Or use:
BBNL_API.requireAuth(); // Redirects to login if not authenticated
```

---

### Step 3: Load Channel Categories

**When**: On `channels.html` page load
**Where**: `js/channels.js` - `initPage()` function

```javascript
// channels.js
async function loadCategories() {
  showLoading(true);

  try {
    // Call API
    const categories = await BBNL_API.getCategories();

    // Validate response
    if (!categories || categories.length === 0) {
      console.warn("No categories returned");
      return;
    }

    // Render categories
    renderCategories(categories);

  } catch (error) {
    console.error("Error loading categories:", error);
    alert("Failed to load categories. Please try again.");
  } finally {
    showLoading(false);
  }
}

function renderCategories(categories) {
  const container = document.getElementById('category-filter');
  container.innerHTML = '';

  // Add "All Channels" category
  const allCat = createCategoryChip({ grtitle: 'All Channels', grid: '0' }, true);
  container.appendChild(allCat);

  // Add other categories
  categories.forEach(cat => {
    const chip = createCategoryChip(cat, false);
    container.appendChild(chip);
  });

  refreshFocusables(); // For remote control navigation
}
```

**API Endpoint**: `POST /chnl_categlist`
**Request Payload**:
```json
{
  "userid": "testiser1",
  "mobile": "7800000001",
  "ip_address": "103.5.132.130",
  "mac_address": "26:F2:AE:D8:3F:99"
}
```

**Expected Response**:
```json
{
  "body": [{
    "categories": [
      { "grtitle": "All Channels", "grid": "0" },
      { "grtitle": "Entertainment", "grid": "1" },
      { "grtitle": "News", "grid": "2" },
      { "grtitle": "Sports", "grid": "3" }
    ]
  }]
}
```

**Response Handling**:
```javascript
// api.js automatically handles multiple formats:
// - [{ body: [{ categories: [...] }] }]  → Unwrapped to categories[]
// - { body: [{ categories: [...] }] }    → Unwrapped to categories[]
// - Direct array                         → Returned as-is
```

---

### Step 4: Load Channel Data

**When**: On `channels.html` page load AND when category filter changes
**Where**: `js/channels.js` - `loadChannels()` function

```javascript
// channels.js
let allChannels = []; // Global store

async function loadChannels() {
  showLoading(true);

  try {
    // Call API
    const channels = await BBNL_API.getChannelData();

    // Validate response
    if (!channels || channels.length === 0) {
      console.warn("No channels returned");
      document.getElementById('channel-grid').innerHTML =
        '<p class="error-message">No channels available</p>';
      return;
    }

    // Store globally for filtering
    allChannels = channels;
    console.log(`Loaded ${allChannels.length} channels`);

    // Render all channels initially
    filterAndRenderChannels('0'); // '0' = All Channels

  } catch (error) {
    console.error("Error loading channels:", error);
    alert("Failed to load channels. Please try again.");
  } finally {
    showLoading(false);
  }
}
```

**API Endpoint**: `POST /chnl_data`
**Request Payload**:
```json
{
  "userid": "testiser1",
  "mobile": "7800000001",
  "ip_address": "103.5.132.130",
  "mac_address": "26:F2:AE:D8:3F:99"
}
```

**Expected Response**:
```json
{
  "body": [
    {
      "id": "101",
      "chtitle": "Colors Super TV",
      "chlogo": "https://...",
      "streamlink": "https://...",
      "grid": "1",
      "subscribed": "1",
      "urno": "008"
    },
    {
      "id": "102",
      "chtitle": "BBC News",
      "chlogo": "https://...",
      "streamlink": "https://...",
      "grid": "2",
      "subscribed": "1",
      "urno": "009"
    }
  ]
}
```

**Channel Data Structure**:
```javascript
{
  id: "101",                    // Unique identifier
  chtitle: "Colors Super TV",   // Display name
  channel_name: "...",          // Alternate name
  chlogo: "https://...",        // Logo URL
  logo_url: "https://...",      // Alternate logo URL
  streamlink: "https://...",    // HLS stream URL
  channel_url: "https://...",   // Alternate stream URL
  grid: "1",                    // Category ID
  category: "Entertainment",    // Category name
  subscribed: "1",              // "1" = subscribed, "0" = not subscribed
  urno: "008"                   // Channel number
}
```

---

### Step 5: Filter & Display Channels

**When**: User clicks a category filter
**Where**: `js/channels.js` - `filterAndRenderChannels()` function

```javascript
// channels.js
function filterAndRenderChannels(gridId) {
  let filtered = [];

  if (gridId === '0' || gridId === 'All Channels') {
    // Show all channels
    filtered = allChannels;
  } else {
    // Filter by grid ID or category name
    filtered = allChannels.filter(ch =>
      ch.grid == gridId ||
      ch.category == gridId ||
      ch.grid === gridId.toString()
    );
  }

  console.log(`Filtered ${filtered.length} channels for grid: ${gridId}`);

  // Split into 3 sections (as per current design)
  const initialChannels = filtered.slice(0, 5);
  const moreViewedChannels = filtered.slice(5, 10);
  const otherChannels = filtered.slice(10);

  // Render sections
  const container = document.getElementById('channel-grid');
  container.innerHTML = '';

  if (initialChannels.length > 0) {
    renderSection(container, 'Featured Channels', initialChannels);
  }
  if (moreViewedChannels.length > 0) {
    renderSection(container, 'More Viewed', moreViewedChannels);
  }
  if (otherChannels.length > 0) {
    renderSection(container, 'Other Channels', otherChannels);
  }

  refreshFocusables(); // Update focus management
}

function renderSection(container, title, channels) {
  // Add section header
  const header = document.createElement('h2');
  header.className = 'section-title';
  header.textContent = title;
  container.appendChild(header);

  // Add channel grid
  const grid = document.createElement('div');
  grid.className = 'channel-grid';

  channels.forEach(channel => {
    const card = createChannelCard(channel);
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

function createChannelCard(channel) {
  const card = document.createElement('div');
  card.className = 'channel-card focusable';
  card.setAttribute('data-channel-id', channel.id);

  // Logo with fallback
  const logo = channel.chlogo || channel.logo_url || 'img/default-channel.png';

  card.innerHTML = `
    <div class="channel-logo">
      <img src="${logo}" alt="${channel.chtitle}"
           onerror="this.src='img/default-channel.png'">
      <span class="live-badge">LIVE</span>
    </div>
    <div class="channel-info">
      <h3 class="channel-title">${channel.chtitle || channel.channel_name}</h3>
      <p class="channel-number">CH ${channel.urno || channel.id}</p>
    </div>
  `;

  // Click handler
  card.addEventListener('click', () => {
    BBNL_API.playChannel(channel);
  });

  return card;
}
```

---

### Step 6: Play Channel (Navigate to Player)

**When**: User clicks a channel card
**Where**: `js/api.js` - `ChannelsAPI.playChannel()` (already implemented)

```javascript
// Already in api.js - ChannelsAPI.playChannel()
playChannel: function (channel) {
  const url = this.getStreamUrl(channel);

  if (url) {
    // Encode channel data as URL parameter
    const data = encodeURIComponent(JSON.stringify(channel));
    window.location.href = `player.html?data=${data}`;
  } else {
    console.error("No stream URL for channel", channel);
    alert("Stream not available");
  }
}
```

**Player Page Flow** (`player.html` → `js/player.js`):
```javascript
// player.js - On page load
function initPlayer() {
  // Get channel data from URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const encodedData = urlParams.get('data');

  if (encodedData) {
    const channel = JSON.parse(decodeURIComponent(encodedData));
    setupPlayer(channel);
  }
}

async function setupPlayer(channel) {
  const streamUrl = channel.streamlink || channel.channel_url;

  if (!streamUrl) {
    alert("No stream URL available");
    return;
  }

  // Fix localhost URLs (replace 127.0.0.1 with server IP)
  const fixedUrl = fixLocalhostUrl(streamUrl);

  // Validate URL
  if (!isValidStreamUrl(fixedUrl)) {
    alert("Invalid stream URL format");
    return;
  }

  // Update UI
  updateChannelInfo(channel);

  // Start playback
  if (typeof webapis !== 'undefined' && webapis.avplay) {
    // Use Tizen AVPlay
    AVPlayer.changeStream(fixedUrl);
  } else {
    // Use HTML5 video fallback
    playWithHTML5Video(fixedUrl);
  }

  // Load channel list for zapping
  await loadChannelListForZapping();
}
```

---

### Step 7: Load Advertisements (Home Page)

**When**: On `home.html` page load
**Where**: `js/home.js` - `loadAds()` function

```javascript
// home.js
async function loadAds() {
  try {
    // Call API
    const ads = await BBNL_API.getHomeAds();

    if (!ads || ads.length === 0) {
      console.warn("No ads returned");
      return;
    }

    // Create slider
    BBNL_API.createSlider('hero-banner', ads, 5000); // 5-second interval

  } catch (error) {
    console.error("Error loading ads:", error);
  }
}
```

**API Endpoint**: `POST /iptvads`
**Request Payload**:
```json
{
  "userid": "testiser1",
  "mobile": "7800000001",
  "adclient": "fofi",
  "srctype": "image",
  "displayarea": "homepage",
  "displaytype": "multiple"
}
```

**Expected Response**:
```json
{
  "body": [
    { "adpath": "https://.../banner1.jpg" },
    { "adpath": "https://.../banner2.jpg" },
    { "adpath": "https://.../banner3.jpg" }
  ]
}
```

**Ad Options**:
```javascript
// Different ad types
AdsAPI.getHomeAds()          // Homepage image ads
AdsAPI.getVideoAds()         // Video ads
AdsAPI.getChannelListAds()   // Channel list page ads
AdsAPI.getAdsByArea('homepage', 'image') // Custom area/type
```

---

## 4. Channel Listing Implementation

### Complete Example: `channels.html` + `js/channels.js`

#### HTML Structure (`channels.html`)
```html
<!DOCTYPE html>
<html>
<head>
  <title>Channels</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div class="page-container">
    <!-- Header -->
    <header class="page-header">
      <button class="btn-back focusable" onclick="history.back()">← Back</button>
      <h1>Live Channels</h1>
      <div class="search-bar">
        <input type="text" id="channel-search" placeholder="Search channels...">
      </div>
    </header>

    <!-- Category Filter -->
    <div class="category-filter-container">
      <div id="category-filter" class="category-chips">
        <!-- Dynamically populated -->
      </div>
    </div>

    <!-- Channel Grid -->
    <div class="loading-indicator" id="loading">
      <p>Loading channels...</p>
    </div>

    <div id="channel-grid" class="channels-container">
      <!-- Dynamically populated -->
    </div>
  </div>

  <script src="js/api.js"></script>
  <script src="js/channels.js"></script>
  <script>
    // Page initialization
    window.addEventListener('DOMContentLoaded', () => {
      BBNL_API.requireAuth(); // Protect page
      initPage();
    });
  </script>
</body>
</html>
```

#### JavaScript Controller (`js/channels.js`)
```javascript
// channels.js - Complete Implementation

let allChannels = [];
let allCategories = [];
let currentCategoryId = '0';

// ========== PAGE INITIALIZATION ==========
async function initPage() {
  console.log("[ChannelsPage] Initializing...");

  // Load categories
  await loadCategories();

  // Load channels
  await loadChannels();

  // Setup search
  setupSearch();

  // Setup remote control navigation
  setupKeyNavigation();
}

// ========== LOAD CATEGORIES ==========
async function loadCategories() {
  try {
    const categories = await BBNL_API.getCategories();

    if (!categories || categories.length === 0) {
      console.warn("No categories returned");
      return;
    }

    allCategories = categories;
    renderCategories(categories);

  } catch (error) {
    console.error("Error loading categories:", error);
  }
}

function renderCategories(categories) {
  const container = document.getElementById('category-filter');
  container.innerHTML = '';

  // "All Channels" category
  const allCat = createCategoryChip({ grtitle: 'All Channels', grid: '0' }, true);
  container.appendChild(allCat);

  // Other categories
  categories.forEach(cat => {
    const chip = createCategoryChip(cat, false);
    container.appendChild(chip);
  });
}

function createCategoryChip(category, active = false) {
  const chip = document.createElement('button');
  chip.className = `category-chip focusable ${active ? 'active' : ''}`;
  chip.textContent = category.grtitle || category.category_name;
  chip.setAttribute('data-grid', category.grid);

  chip.addEventListener('click', () => {
    handleCategorySelect(category.grid, chip);
  });

  return chip;
}

function handleCategorySelect(gridId, chipElement) {
  // Update active state
  document.querySelectorAll('.category-chip').forEach(chip => {
    chip.classList.remove('active');
  });
  chipElement.classList.add('active');

  // Store current category
  currentCategoryId = gridId;

  // Filter and render channels
  filterAndRenderChannels(gridId);
}

// ========== LOAD CHANNELS ==========
async function loadChannels() {
  showLoading(true);

  try {
    const channels = await BBNL_API.getChannelData();

    if (!channels || channels.length === 0) {
      document.getElementById('channel-grid').innerHTML =
        '<p class="error-message">No channels available. Please try again later.</p>';
      return;
    }

    allChannels = channels;
    console.log(`[ChannelsPage] Loaded ${allChannels.length} channels`);

    // Render all channels initially
    filterAndRenderChannels('0');

  } catch (error) {
    console.error("Error loading channels:", error);
    document.getElementById('channel-grid').innerHTML =
      '<p class="error-message">Failed to load channels. Please try again.</p>';
  } finally {
    showLoading(false);
  }
}

// ========== FILTER & RENDER ==========
function filterAndRenderChannels(gridId) {
  let filtered = [];

  if (gridId === '0' || gridId === 'All Channels') {
    filtered = allChannels;
  } else {
    filtered = allChannels.filter(ch =>
      ch.grid == gridId ||
      ch.category == gridId ||
      ch.grid === gridId.toString()
    );
  }

  console.log(`[ChannelsPage] Filtered ${filtered.length} channels for grid: ${gridId}`);

  const container = document.getElementById('channel-grid');
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '<p class="info-message">No channels in this category.</p>';
    return;
  }

  // Split into sections
  const initialChannels = filtered.slice(0, 5);
  const moreViewedChannels = filtered.slice(5, 10);
  const otherChannels = filtered.slice(10);

  if (initialChannels.length > 0) {
    renderSection(container, 'Featured Channels', initialChannels);
  }
  if (moreViewedChannels.length > 0) {
    renderSection(container, 'More Viewed', moreViewedChannels);
  }
  if (otherChannels.length > 0) {
    renderSection(container, 'Other Channels', otherChannels);
  }

  refreshFocusables();
}

function renderSection(container, title, channels) {
  const section = document.createElement('div');
  section.className = 'channel-section';

  const header = document.createElement('h2');
  header.className = 'section-title';
  header.textContent = title;
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'channel-grid';

  channels.forEach(channel => {
    const card = createChannelCard(channel);
    grid.appendChild(card);
  });

  section.appendChild(grid);
  container.appendChild(section);
}

function createChannelCard(channel) {
  const card = document.createElement('div');
  card.className = 'channel-card focusable';
  card.setAttribute('data-channel-id', channel.id);

  const logo = channel.chlogo || channel.logo_url || 'img/default-channel.png';
  const title = channel.chtitle || channel.channel_name || 'Unknown Channel';
  const number = channel.urno || channel.id || '000';

  card.innerHTML = `
    <div class="channel-logo">
      <img src="${logo}" alt="${title}" onerror="this.src='img/default-channel.png'">
      <span class="live-badge">LIVE</span>
    </div>
    <div class="channel-info">
      <h3 class="channel-title">${title}</h3>
      <p class="channel-number">CH ${number}</p>
      ${channel.subscribed === '1' ? '<span class="subscribed-badge">✓</span>' : ''}
    </div>
  `;

  card.addEventListener('click', () => {
    playChannel(channel);
  });

  return card;
}

// ========== PLAY CHANNEL ==========
function playChannel(channel) {
  console.log("[ChannelsPage] Playing channel:", channel.chtitle);
  BBNL_API.playChannel(channel);
}

// ========== SEARCH ==========
function setupSearch() {
  const searchInput = document.getElementById('channel-search');

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    if (query === '') {
      // Show all channels for current category
      filterAndRenderChannels(currentCategoryId);
      return;
    }

    // Search in all channels
    const results = allChannels.filter(ch => {
      const title = (ch.chtitle || ch.channel_name || '').toLowerCase();
      const number = (ch.urno || ch.id || '').toString();
      return title.includes(query) || number.includes(query);
    });

    renderSearchResults(results);
  });
}

function renderSearchResults(results) {
  const container = document.getElementById('channel-grid');
  container.innerHTML = '';

  if (results.length === 0) {
    container.innerHTML = '<p class="info-message">No channels found matching your search.</p>';
    return;
  }

  renderSection(container, `Search Results (${results.length})`, results);
  refreshFocusables();
}

// ========== UTILITY FUNCTIONS ==========
function showLoading(show) {
  const loader = document.getElementById('loading');
  loader.style.display = show ? 'block' : 'none';
}

function refreshFocusables() {
  // Update focus management for remote control
  if (typeof updateFocusableElements === 'function') {
    updateFocusableElements();
  }
}

function setupKeyNavigation() {
  // Remote control navigation
  document.addEventListener('keydown', (e) => {
    switch(e.keyCode) {
      case 10009: // Back button
      case 461:
        history.back();
        break;
    }
  });
}
```

---

## 5. Error Handling & Recovery

### API Error Response Format
```javascript
{
  error: true,
  message: "Network error",
  status: {
    err_code: -1,
    err_msg: "Detailed error message"
  }
}
```

### Error Handling Pattern

```javascript
async function loadData() {
  try {
    const response = await BBNL_API.someMethod();

    // Check for error property
    if (response && response.error) {
      console.error("API Error:", response.message);
      showError(response.status?.err_msg || response.message);
      return;
    }

    // Check for status error
    if (response && response.status && response.status.err_code !== 0) {
      console.error("API returned error:", response.status.err_msg);
      showError(response.status.err_msg);
      return;
    }

    // Success - process data
    processData(response);

  } catch (error) {
    console.error("Exception:", error);
    showError("An unexpected error occurred. Please try again.");
  }
}

function showError(message) {
  alert(message);
  // Or use a custom error UI component
}
```

### Retry Logic

```javascript
async function loadWithRetry(apiMethod, maxRetries = 3) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const result = await apiMethod();

      if (!result || result.error) {
        throw new Error("API returned error");
      }

      return result; // Success

    } catch (error) {
      attempt++;
      console.warn(`Attempt ${attempt} failed:`, error);

      if (attempt >= maxRetries) {
        throw error; // Give up
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// Usage
try {
  const channels = await loadWithRetry(() => BBNL_API.getChannelData());
  renderChannels(channels);
} catch (error) {
  showError("Failed to load channels after multiple attempts.");
}
```

### Session Expiry Handling

```javascript
async function apiCallWithAuthCheck(apiMethod) {
  // Check if authenticated
  if (!BBNL_API.isAuthenticated()) {
    alert("Your session has expired. Please login again.");
    window.location.href = 'login.html';
    return;
  }

  // Make API call
  const result = await apiMethod();

  // Check for auth error
  if (result && result.status && result.status.err_msg) {
    if (result.status.err_msg.includes("authentication") ||
        result.status.err_msg.includes("session")) {
      alert("Your session has expired. Please login again.");
      BBNL_API.logout(); // Clear session and redirect
      return;
    }
  }

  return result;
}
```

---

## 6. Testing Strategy

### Development Environment Setup

#### Option 1: Use Proxy Server (Browser Testing)
```bash
cd bbnl-proxy
npm install
npm start
# Server runs on http://localhost:3000
```

Then access the app at `http://localhost:3000` in your browser.

#### Option 2: Direct API (Real Device)
Update `api.js`:
```javascript
const API_BASE_URL_PROD = "http://124.40.244.211/netmon/cabletvapis";
```

Deploy to Tizen TV for testing.

### Test Cases

#### Test 1: Authentication Flow
```javascript
// Manual test in browser console
async function testAuth() {
  // Step 1: Request OTP
  const otpResponse = await BBNL_API.requestOTP('testiser1', '7800000001');
  console.log("OTP Response:", otpResponse);
  console.log("OTP Code:", otpResponse.body?.[0]?.otpcode);

  // Step 2: Verify OTP (use code from response)
  const verifyResponse = await BBNL_API.verifyOTP(
    'testiser1',
    '7800000001',
    otpResponse.body[0].otpcode.toString()
  );
  console.log("Verify Response:", verifyResponse);

  // Step 3: Check session
  const userData = BBNL_API.getUserData();
  console.log("User Data:", userData);
  console.log("Is Authenticated:", BBNL_API.isAuthenticated());
}

testAuth();
```

#### Test 2: Channel Loading
```javascript
async function testChannels() {
  // Load categories
  const categories = await BBNL_API.getCategories();
  console.log("Categories:", categories);

  // Load channels
  const channels = await BBNL_API.getChannelData();
  console.log("Channels:", channels);
  console.log("Total Channels:", channels.length);

  // Filter by category
  const entertainmentChannels = channels.filter(ch => ch.grid === '1');
  console.log("Entertainment Channels:", entertainmentChannels.length);
}

testChannels();
```

#### Test 3: Ads Loading
```javascript
async function testAds() {
  const ads = await BBNL_API.getHomeAds();
  console.log("Ads:", ads);

  if (ads && ads.length > 0) {
    console.log("Ad Paths:", ads.map(ad => ad.adpath));
  }
}

testAds();
```

### Mock Data Testing

Use `db.json` for offline testing:
```javascript
// In api.js, add a debug flag
const USE_MOCK_DATA = true; // Set to false for production

async function apiCall(endpoint, payload, customHeaders) {
  if (USE_MOCK_DATA) {
    return getMockData(endpoint);
  }

  // Regular API call...
}

function getMockData(endpoint) {
  // Load from db.json or return hardcoded mock data
  const mockDb = {
    '/login': { status: "success", message: "OTP Sent", userid: "testiser1" },
    '/chnl_data': [{ body: [...] }],
    // ...
  };

  return mockDb[endpoint] || { error: true, message: "Mock endpoint not found" };
}
```

---

## 7. Common Pitfalls & Solutions

### Issue 1: "User ID already registered with another device"

**Cause**: MAC address mismatch between login and verify OTP calls.

**Solution**:
```javascript
// Ensure DeviceInfo is initialized BEFORE any API call
DeviceInfo.initializeDeviceInfo();

// Device info is now consistent across all API calls
```

### Issue 2: Channels Not Loading

**Checklist**:
1. ✅ Check API endpoint is correct: `/chnl_data` (not `/chnl_list`)
2. ✅ Verify user is authenticated: `BBNL_API.isAuthenticated()`
3. ✅ Check console for API errors
4. ✅ Validate response format (handle array wrapping)

**Debug**:
```javascript
const response = await BBNL_API.getChannelData();
console.log("Raw Response:", response);
console.log("Is Array:", Array.isArray(response));
console.log("Has Body:", response?.body);
```

### Issue 3: Player Not Playing Stream

**Cause**: Invalid or localhost URL.

**Solution**:
```javascript
// In player.js or avplayer.js
function fixLocalhostUrl(url) {
  const SERVER_IP = "124.40.244.211";
  url = url.replace(/127\.0\.0\.1/g, SERVER_IP);
  url = url.replace(/localhost/g, SERVER_IP);
  return url;
}

function isValidStreamUrl(url) {
  return url && (url.startsWith('http://') || url.startsWith('https://'));
}
```

### Issue 4: CORS Errors in Browser

**Cause**: Browser enforces CORS, TV doesn't.

**Solution**: Use the proxy server for browser testing:
```bash
cd bbnl-proxy
npm start
```

Update API base URL for dev:
```javascript
const API_BASE_URL_DEV = "http://localhost:3000";
const API_BASE_URL_PROD = "http://124.40.244.211/netmon/cabletvapis";

const IS_DEV = window.location.hostname === 'localhost';
const API_BASE_URL = IS_DEV ? API_BASE_URL_DEV : API_BASE_URL_PROD;
```

### Issue 5: Focus Lost on Remote Navigation

**Cause**: Dynamic content doesn't update focusable elements.

**Solution**:
```javascript
// After rendering any dynamic content
function refreshFocusables() {
  if (typeof updateFocusableElements === 'function') {
    updateFocusableElements();
  }

  // Re-focus first element
  const firstFocusable = document.querySelector('.focusable');
  if (firstFocusable) {
    firstFocusable.focus();
  }
}

// Call after every DOM update
renderChannels(channels);
refreshFocusables(); // ← Important!
```

### Issue 6: Session Persistence Issues

**Cause**: localStorage not working or cleared.

**Solution**:
```javascript
// Robust session check
function checkSession() {
  try {
    const userDataStr = localStorage.getItem('bbnl_user');

    if (!userDataStr) {
      return null;
    }

    const userData = JSON.parse(userDataStr);

    // Validate required fields
    if (!userData.userid || !userData.mobile) {
      console.warn("Invalid session data");
      localStorage.removeItem('bbnl_user');
      return null;
    }

    return userData;

  } catch (error) {
    console.error("Error reading session:", error);
    localStorage.removeItem('bbnl_user');
    return null;
  }
}
```

---

## 8. Best Practices

### 1. Always Initialize Device Info First
```javascript
// At the top of every page that calls APIs
window.addEventListener('DOMContentLoaded', () => {
  DeviceInfo.initializeDeviceInfo();
  // ... then load data
});
```

### 2. Protect All Non-Public Pages
```javascript
// At the top of every protected page script
if (!BBNL_API.isAuthenticated()) {
  window.location.href = 'login.html';
}
```

### 3. Handle All API Response Formats
```javascript
// Use the patterns already in api.js
if (Array.isArray(response) && response[0]?.body) {
  data = response[0].body;
} else if (response?.body) {
  data = response.body;
} else if (Array.isArray(response)) {
  data = response;
}
```

### 4. Always Provide User Feedback
```javascript
// Show loading state
showLoading(true);

try {
  const data = await BBNL_API.someMethod();
  renderData(data);
} catch (error) {
  showError("Failed to load data");
} finally {
  showLoading(false); // Always hide loading
}
```

### 5. Log Everything (For Debugging)
```javascript
console.log("[PageName] Action:", details);
console.log("[PageName] API Response:", response);
console.log("[PageName] Error:", error);
```

### 6. Use Fallbacks for Images
```html
<img src="${channel.chlogo}"
     onerror="this.src='img/default-channel.png'"
     alt="${channel.chtitle}">
```

### 7. Validate Data Before Rendering
```javascript
if (!channels || !Array.isArray(channels) || channels.length === 0) {
  showEmptyState();
  return;
}
renderChannels(channels);
```

### 8. Refresh Focusables After DOM Changes
```javascript
renderContent();
refreshFocusables(); // Always call after rendering
```

### 9. Use Meaningful Variable Names
```javascript
// Bad
const d = await BBNL_API.getChannelData();

// Good
const channels = await BBNL_API.getChannelData();
```

### 10. Keep UI and Logic Separate
```javascript
// Controller Layer (channels.js)
async function loadChannels() {
  const channels = await BBNL_API.getChannelData();
  renderChannels(channels); // Separate rendering function
}

// UI Layer
function renderChannels(channels) {
  // Pure rendering logic
}
```

---

## Quick Reference: API Methods Cheat Sheet

```javascript
// ========== AUTHENTICATION ==========
await BBNL_API.requestOTP(userid, mobile)
await BBNL_API.verifyOTP(userid, mobile, otpcode)
await BBNL_API.addMacAddress(userid, mobile)
BBNL_API.getUserData()
BBNL_API.isAuthenticated()
BBNL_API.logout()
BBNL_API.requireAuth()

// ========== CHANNELS ==========
await BBNL_API.getCategories()
await BBNL_API.getChannelData()
await BBNL_API.getChannelList() // Alias for getChannelData
await BBNL_API.getLanguageList()
BBNL_API.getSubscribedChannels(channels)
BBNL_API.getChannelsByGrid(channels, gridId)
BBNL_API.playChannel(channel)

// ========== ADS ==========
await BBNL_API.getIPTVAds(options)
await BBNL_API.getHomeAds()
await BBNL_API.getVideoAds()
await BBNL_API.getChannelListAds()
await BBNL_API.getAdsByArea(displayarea, srctype)
BBNL_API.createSlider(containerId, ads, interval)

// ========== DEVICE INFO ==========
BBNL_API.initializeDeviceInfo()
BBNL_API.getDeviceInfo()
```

---

## Conclusion

This strategy guide provides a complete framework for integrating APIs in the BBNL Samsung Tizen TV application. Follow the patterns, handle errors gracefully, and always test thoroughly.

**Key Takeaways**:
1. ✅ Use `js/api.js` as the SINGLE SOURCE for all API calls
2. ✅ Initialize device info before any API call
3. ✅ Protect all pages with authentication checks
4. ✅ Handle multiple response formats
5. ✅ Provide user feedback for all operations
6. ✅ Refresh focusables after DOM updates
7. ✅ Test with both proxy and real API

**Happy Coding!** 🚀
