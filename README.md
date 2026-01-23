# Samsung Tizen TV - BBNL IPTV Application

[![Tizen](https://img.shields.io/badge/Tizen-2.4+-blue.svg)](https://www.tizen.org/)
[![Samsung TV](https://img.shields.io/badge/Samsung%20TV-Smart%20TV-black.svg)](https://developer.samsung.com/smarttv)
[![License](https://img.shields.io/badge/license-Private-red.svg)]()

A complete IPTV streaming application for Samsung Tizen Smart TVs featuring HLS video playback, user authentication, live channel streaming, VOD content, and comprehensive profile management.

## 📋 Table of Contents

- [Features](#-features)
- [Project Structure](#-project-structure)
- [Technologies Used](#-technologies-used)
- [Getting Started](#-getting-started)
- [Development](#-development)
- [Deployment](#-deployment)
- [API Integration](#-api-integration)
- [Remote Control](#-remote-control)
- [Troubleshooting](#-troubleshooting)
- [Documentation](#-documentation)

## ✨ Features

### User Authentication
- **Mobile-based Login**: Login using mobile number
- **OTP Verification**: Secure OTP-based authentication
- **Device Verification**: Unique device identification using serial number and MAC address
- **Session Management**: Persistent user sessions with auto-login

### Video Streaming
- **HLS Playback**: Advanced HLS video streaming using Samsung AVPlay API
- **Live TV Channels**: Browse and watch live TV channels by category
- **VOD Content**: Movies and TV shows on-demand
- **Channel Categories**: Organized channel browsing (Entertainment, News, Sports, etc.)
- **Adaptive Bitrate**: Automatic quality adjustment based on network conditions

### User Experience
- **Profile Management**: Multiple user profiles with avatars
- **Favorites**: Save favorite channels and content
- **Parental Controls**: Content restriction and PIN protection
- **Dark/Light Theme**: Switchable theme modes
- **Remote Control Navigation**: Full D-pad and Samsung remote support
- **Notifications**: In-app notification system
- **Search**: Quick content search functionality

### Subscription & Monetization
- **Subscription Plans**: Multiple subscription tiers
- **Subscription Status**: Real-time subscription validation
- **Payment Integration**: Subscription payment flows
- **Advertisement**: Integrated ad system for homepage banners

### Settings & Support
- **Network Diagnostics**: Check connection and streaming quality
- **App Settings**: Configure app preferences
- **Help Desk**: User support and FAQs
- **Feedback System**: Integrated user feedback

## 📁 Project Structure

```
SAMSUGNMASTER/
│
├── 📄 HTML Pages (User Interface)
│   ├── index.html              # Login page - Mobile number entry
│   ├── verify.html             # OTP verification page
│   ├── homepage.html           # Main dashboard after login
│   ├── player.html             # Video player with HLS streaming
│   ├── tv-channels.html        # TV channel list and categories
│   ├── movies.html             # Movies library
│   ├── shows.html              # TV shows library
│   ├── favorites.html          # User favorites
│   ├── profiles.html           # User profile management
│   ├── manage-profiles.html    # Profile settings
│   ├── settings.html           # App settings
│   ├── notifications.html      # User notifications
│   ├── subscriptions.html      # Subscription plans
│   ├── subscription-expired.html # Subscription expiry notice
│   ├── parental-controls.html  # Parental control settings
│   ├── apps.html               # Installed apps
│   ├── help-desk.html          # Help and support
│   ├── give-feedback.html      # User feedback form
│   ├── network.html            # Network diagnostics
│   ├── device-verify.html      # Device verification
│   ├── device-verify-failed.html # Device verification failed
│   ├── new-verify.html         # Alternative verification page
│   └── invalid-mobile.html     # Invalid mobile error page
│
├── 📂 api/                     # API Integration Layer
│   ├── config.js               # API configuration and endpoints
│   ├── auth.js                 # Authentication API (Login, OTP)
│   ├── channels.js             # Channel and category APIs
│   └── ads.js                  # Advertisement APIs
│
├── 📂 css/                     # Stylesheets
│   ├── style.css               # Main application styles
│   ├── colors.css              # Color theme definitions
│   ├── base/                   # Base styles
│   │   ├── reset.css           # CSS reset
│   │   └── variable.css        # CSS variables
│   ├── componentes/            # Component styles
│   │   ├── buttons.css         # Button styles
│   │   ├── cards.css           # Card components
│   │   └── forms.css           # Form elements
│   ├── layout/                 # Layout styles
│   │   ├── header.css          # Header navigation
│   │   └── sidebar.css         # Sidebar navigation
│   └── pages/                  # Page-specific styles
│       ├── apps.css            # Apps page
│       ├── auth.css            # Authentication pages
│       ├── favorites.css       # Favorites page
│       ├── homepages.css       # Homepage dashboard
│       ├── notifications.css   # Notifications page
│       ├── profile.css         # Profile pages
│       ├── settings.css        # Settings page
│       └── subscription.css    # Subscription pages
│
├── 📂 images/                  # Application images and assets
├── 📂 js/                      # JavaScript files
│   └── script.js               # Common utility scripts
│
├── 📄 config.xml               # Tizen TV app configuration
├── 📄 API_REQUIREMENTS.md      # API requirements documentation
├── 📄 CORS_FIXED.md            # CORS error solution guide
└── 📄 README.md                # This file

```

---

## 🔧 Core Files Explained

### **API Layer** (`api/` folder)

#### **1. api/config.js**
**Purpose**: Central configuration for all API endpoints and headers

**Features**:
- API base URLs configuration
- Authorization headers
- Device headers (devslno, devmac)
- CORS proxy for development
- Helper methods for headers

**Usage**:
```javascript
const url = API_CONFIG.getUrl(API_CONFIG.ENDPOINTS.LOGIN);
const headers = API_CONFIG.getAuthHeaders();
```

**Configuration**:
```javascript
AUTH_BASE_URL: 'http://124.40.244.211/netmon/cabletvapis'
ADS_BASE_URL: 'https://bbnlnetmon.bbnl.in/prod/cabletvapis'
AUTH_HEADER: 'Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE='
USE_PROXY: true (set false on Samsung TV)
```

---

#### **2. api/auth.js**
**Purpose**: User authentication and session management

**Functions**:
- `requestOTP(mobile)` - Send OTP to mobile number
- `verifyOTP(mobile, otpCode)` - Verify OTP and login
- `getUserData()` - Get current user session
- `isAuthenticated()` - Check login status
- `logout()` - Clear user session
- `getDeviceInfo()` - Get device parameters

**Device Info Sent**:
```javascript
{
  mac_address: '26:F2:AE:D8:3F:99',
  device_name: 'rk3368_box',
  ip_address: '124.40.244.233',
  device_type: 'FOFI'
}
```

**Used By**: 
- [index.html](index.html) - Login page
- [verify.html](verify.html) - OTP verification
- All protected pages

---

#### **3. api/channels.js**
**Purpose**: Channel categories and channel data retrieval

**Functions**:
- `getCategories(userid)` - Get channel categories
- `getChannels(userid, userphone)` - Get all channels
- `getSubscribedChannels(userid, userphone)` - Filter subscribed channels
- `getChannelsByCategory(userid, userphone, category)` - Filter by category

**API Endpoints**:
- `/chnl_categlist` - Channel categories
- `/chnl_data` - Channel data

**Used By**: 
- [tv-channels.html](tv-channels.html)
- [homepage.html](homepage.html)
- [player.html](player.html)

---

#### **4. api/ads.js**
**Purpose**: Advertisement content for homepage and player

**Functions**:
- `getAds()` - Get general ads
- `getIPTVAds(userphone)` - Get IPTV-specific ads

**Features**:
- Dual content-type support (JSON + form-encoded)
- Automatic fallback mechanism
- Requires devmac header

**Used By**: 
- [homepage.html](homepage.html)
- [player.html](player.html)

---

### **HTML Pages**

#### **Authentication Flow**

**1. index.html** - Login Page
- Mobile number input (10 digits)
- OTP request functionality
- Validates mobile format
- Redirects to verify.html

**Dependencies**: `api/config.js`, `api/auth.js`

---

**2. verify.html** - OTP Verification
- 4-digit OTP input
- Auto-focus on input fields
- Resend OTP functionality
- Device info submission
- Redirects to homepage.html on success

**Dependencies**: `api/config.js`, `api/auth.js`

---

#### **Main Application**

**3. homepage.html** - Main Dashboard
- User welcome screen
- Channel categories
- Advertisement display
- Navigation to all sections

**Dependencies**: `api/channels.js`, `api/ads.js`

---

**4. player.html** - Video Player
- HLS video streaming
- Samsung AVPlay API integration
- HLS.js fallback for browsers
- Playback controls
- Quality selection

**Technology**:
- Samsung webapis.avplay (Tizen TV)
- HLS.js (Browser fallback)

**Dependencies**: HLS.js CDN, Samsung webapis

---

**5. tv-channels.html** - Channel List
- Display all channels
- Category filtering
- Channel search
- Subscription status
- Play button redirect to player

**Dependencies**: `api/channels.js`

---

#### **User Management**

**6. profiles.html** - Profile Selection
- Multiple profile support
- Profile switching
- Profile creation

**7. manage-profiles.html** - Profile Settings
- Edit profile details
- Avatar selection
- Profile deletion

**8. parental-controls.html** - Parental Controls
- Content restrictions
- PIN protection
- Age ratings

---

#### **Content Pages**

**9. movies.html** - Movies Library
- Movie catalog
- Genre filtering
- Search functionality

**10. shows.html** - TV Shows
- Show listings
- Episode management
- Continue watching

**11. favorites.html** - User Favorites
- Saved channels
- Favorite shows/movies
- Quick access

---

#### **Settings & Support**

**12. settings.html** - App Settings
- Display settings
- Audio settings
- Network settings
- Account management

**13. notifications.html** - Notifications
- System notifications
- Updates
- Alerts

**14. subscriptions.html** - Subscription Management
- Current plan details
- Upgrade/downgrade options
- Payment history

**15. subscription-expired.html** - Expiry Notice
- Subscription renewal prompt
- Payment options

**16. help-desk.html** - Help & Support
- FAQ section
- Contact support
- Troubleshooting guides

**17. give-feedback.html** - User Feedback
- Feedback form
- Rating system
- Issue reporting

---

#### **Diagnostics**

**18. network.html** - Network Diagnostics
- Connection status
- Speed test
- Network troubleshooting

**19. device-verify.html** - Device Verification
- Device registration
- MAC address verification

**20. device-verify-failed.html** - Verification Failed
- Error messages
- Retry options

---

### **JavaScript Files**

**js/script.js** - Common Utilities
- Shared functions
- Navigation helpers
- Utility methods
- Event handlers

---

### **CSS Architecture**

#### **Base Styles**
- `css/base/reset.css` - Browser default resets
- `css/base/variable.css` - CSS custom properties

#### **Component Styles**
- `css/componentes/buttons.css` - Button components
- `css/componentes/cards.css` - Card layouts
- `css/componentes/forms.css` - Form elements

#### **Layout Styles**
- `css/layout/header.css` - Header navigation
- `css/layout/sidebar.css` - Sidebar menu

#### **Page Styles**
- Individual CSS files for each page type
- Modular and maintainable

#### **Theme**
- `css/colors.css` - Color palette
- `css/style.css` - Main stylesheet

---

## 🚀 Getting Started

### **1. Development Testing (Browser)**

```bash
# Open with live server
# Set USE_PROXY: true in api/config.js
```

**CORS Proxy Enabled**: For testing in browser environment

---

### **2. Samsung TV Deployment**

```bash
# Set USE_PROXY: false in api/config.js
# Package using Tizen Studio
# Install on Samsung TV
```

**No CORS Issues**: App runs locally on TV

---

## 🔐 Authentication Flow

```
1. User enters mobile number (index.html)
   ↓
2. API sends OTP (api/auth.js → requestOTP)
   ↓
3. User enters OTP (verify.html)
   ↓
4. API verifies OTP with device info (api/auth.js → verifyOTP)
   ↓
5. Session stored in localStorage
   ↓
6. Redirect to homepage.html
```

---

## 📡 API Endpoints

### **Authentication**
- `POST /login` - Request OTP
- `POST /loginOtp` - Verify OTP

### **Channels**
- `POST /chnl_categlist` - Get categories
- `POST /chnl_data` - Get channels

### **Advertisements**
- `POST /ads` - General ads
- `POST /iptvads` - IPTV ads

---

## 🔑 Required Headers

**All Requests**:
```javascript
Authorization: Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=
devslno: FOFI20191129000336
Content-Type: application/json
```

**Ads Requests** (Additional):
```javascript
devmac: 68:1D:EF:14:6C:21
```

---

## 💾 LocalStorage Data

**Stored After Login**:
- `userId` - User ID
- `userPhone` - Mobile number
- `bbnl_authenticated` - Login status
- `bbnl_login_time` - Login timestamp
- `device_mac` - Device MAC address

---

## 🛠 Technologies Used

### Frontend
- **HTML5**: Semantic markup and structure
- **CSS3**: Modern styling with CSS Grid and Flexbox
- **JavaScript (ES5)**: Tizen-compatible JavaScript
- **Samsung Tizen WebEngine**: TV-specific APIs

### Video Streaming
- **Samsung AVPlay API**: Native HLS playback for Tizen
- **HLS.js**: Fallback for browser testing
- **Adaptive Bitrate Streaming**: Automatic quality adjustment

### Backend Integration
- **Axios**: HTTP client for API requests
- **REST APIs**: JSON-based communication
- **CORS Proxy**: Development environment support

### Development Tools
- **Tizen Studio**: Development and packaging
- **Samsung TV Simulator**: Testing environment
- **Live Server**: Browser development
- **Node.js**: Proxy server

## 🚀 Getting Started

### Prerequisites

```bash
# Required Software
- Tizen Studio 4.0 or higher
- Samsung TV (2016 or newer) or Emulator
- Node.js 14+ (for proxy server)
- Modern web browser (for development)
```

### Installation

#### 1. Clone or Download Project
```bash
cd c:\Users\kamal\BBNL-SAMSUGN-TV
```

#### 2. Install Proxy Server Dependencies (Development Only)
```bash
cd bbnl-proxy
npm install
```

#### 3. Configure API Settings

Edit [api/config.js](api/config.js):

**For Browser Development:**
```javascript
USE_PROXY: true,
PROXY_URL: 'http://localhost:3000/api'
```

**For Samsung TV:**
```javascript
USE_PROXY: false,
// Direct API calls
```

#### 4. Start Development Server (Browser Testing)
```bash
# Terminal 1: Start proxy server
cd bbnl-proxy
npm start

# Terminal 2: Use Live Server extension in VS Code
# Or any HTTP server to serve the root directory
```

Access: `http://localhost:5500` (or your server port)

### Development Workflow

```
┌─────────────────────────────────────────────────────┐
│ 1. Browser Development (with proxy)                │
│    - Fast iteration                                 │
│    - Console debugging                              │
│    - Network inspection                             │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 2. Tizen Simulator Testing                         │
│    - Tizen API validation                           │
│    - Remote control simulation                      │
│    - TV-specific features                           │
└─────────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────────┐
│ 3. Real Samsung TV Testing                         │
│    - Final validation                               │
│    - Performance testing                            │
│    - Actual hardware testing                        │
└─────────────────────────────────────────────────────┘
```

## 📦 Deployment

### Build for Samsung TV

#### 1. Update Configuration
```javascript
// api/config.js
USE_PROXY: false  // Disable proxy for production
```

#### 2. Package Using Tizen Studio

```bash
# Method 1: Tizen Studio GUI
1. File → Package → Tizen Package
2. Select security profile
3. Build .wgt file

# Method 2: Command Line (Tizen CLI)
tizen package -t wgt -s <security-profile> -- .
```

Output: `SAMSUNGNMASTER.wgt`

#### 3. Install on Samsung TV

**Using Tizen Studio:**
```bash
# Connect to TV
sdb connect <TV_IP_ADDRESS>

# Install package
tizen install -n SAMSUNGNMASTER.wgt -t <TV_NAME>

# Run application
tizen run -p bNoSQVUTDy.SAMSUNGNMASTER -t <TV_NAME>
```

**Using TV Developer Mode:**
1. Enable Developer Mode on TV (Smart Hub → Apps → 12345)
2. Enter PC IP address
3. Use Device Manager in Tizen Studio to connect
4. Right-click project → Run As → Tizen Web Application

### Package Files
- **SAMSUNGMASTER.wgt**: Production build (old version)
- **SAMSUNGNMASTER.wgt**: Latest build
- **config.xml**: Tizen application manifest
- **author-signature.xml**: Code signing
- **signature1.xml**: Distribution signature

## 🔐 Authentication Flow

```mermaid
graph TD
    A[User Opens App] --> B[Index.html - Login Screen]
    B --> C[Enter Mobile Number]
    C --> D[api/auth.js → requestOTP]
    D --> E[Backend Sends OTP]
    E --> F[verify.html - OTP Screen]
    F --> G[Enter OTP Code]
    G --> H[api/auth.js → verifyOTP]
    H --> I{Device Verification}
    I -->|Valid| J[Store Session Data]
    I -->|Invalid| K[device-verify-failed.html]
    J --> L[homepage.html - Dashboard]
    K --> M[Retry or Contact Support]
```

### Session Management

**Data Stored in localStorage:**
```javascript
{
  userId: "testuser1",
  userPhone: "9876543210",
  bbnl_authenticated: "true",
  bbnl_login_time: "2026-01-14T10:30:00",
  device_mac: "26:F2:AE:D8:3F:99",
  device_serial: "FOFI20191129000336"
}
```

**Auto-Login Logic:**
```javascript
// Check on page load
if (AuthAPI.isAuthenticated()) {
    // User logged in - allow access
} else {
    // Redirect to login
    window.location.href = 'index.html';
}
```

## 📡 API Integration

### Base URLs

```javascript
AUTH_API: 'http://124.40.244.211/netmon/cabletvapis'
ADS_API: 'https://bbnlnetmon.bbnl.in/prod/cabletvapis'
```

### Authentication Endpoints

#### Request OTP
```javascript
POST /login
Headers: {
    Authorization: "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=",
    devslno: "FOFI20191129000336"
}
Body: {
    userid: "testuser1",
    mobile: "9876543210"
}
```

#### Verify OTP
```javascript
POST /loginOtp
Body: {
    userid: "testuser1",
    mobile: "9876543210",
    otpcode: "1234",
    mac_address: "26:F2:AE:D8:3F:99",
    device_name: "rk3368_box",
    ip_address: "124.40.244.233",
    device_type: "FOFI"
}
```

### Channel Endpoints

#### Get Categories
```javascript
POST /chnl_categlist
Body: {
    userid: "testuser1"
}
```

#### Get Channels
```javascript
POST /chnl_data
Body: {
    userid: "testuser1",
    userphone: "9876543210"
}
```

### Advertisement Endpoints

```javascript
POST /iptvads
Headers: {
    devmac: "68:1D:EF:14:6C:21"
}
Body: {
    appid: "FOFI"
}
```

See [api/README.md](api/README.md) for detailed API documentation.

## 🎮 Remote Control

### Supported Keys

**Navigation:**
- Arrow Keys (↑ ↓ ← →)
- Enter/Select
- Back/Return
- Exit

**Media Controls:**
- Play/Pause
- Stop
- Fast Forward
- Rewind

**Color Buttons:**
- Red, Green, Yellow, Blue (for quick actions)

**Number Keys:**
- 0-9 (for direct channel input)

### Implementation

```javascript
// Remote control handler
RemoteControl.init({
    onUp: function() { /* Handle up */ },
    onDown: function() { /* Handle down */ },
    onLeft: function() { /* Handle left */ },
    onRight: function() { /* Handle right */ },
    onEnter: function() { /* Handle select */ },
    onBack: function() { /* Handle back */ }
});
```

See [js/remote.js](js/remote.js) for complete implementation.

## 🐛 Troubleshooting

### CORS Errors (Browser Development)

**Problem:** `Access to fetch blocked by CORS policy`

**Solution:**
```javascript
// api/config.js
USE_PROXY: true
```

Then start proxy server:
```bash
cd bbnl-proxy
npm start
```

### Video Playback Issues

**On Browser:**
- Check HLS.js is loaded
- Verify stream URL is accessible
- Check browser console for errors

**On Samsung TV:**
- Verify AVPlay API is available
- Check network connectivity
- Test with different stream URLs
- Check DRM requirements (if any)

### Authentication Failures

**OTP Not Received:**
1. Verify mobile number format (10 digits)
2. Check API response in console
3. Verify server is accessible
4. Check device headers are correct

**Device Verification Failed:**
1. Ensure unique MAC address
2. Verify device serial number
3. Check device is registered with backend

### Network Issues

**Check:**
```javascript
// Network diagnostics available at network.html
- Internet connectivity
- API server status (ping 124.40.244.211)
- Firewall rules
- DNS resolution
```

### Tizen Specific Issues

**App Won't Install:**
- Verify TV is in Developer Mode
- Check certificate validity
- Ensure Tizen version compatibility (2.4+)

**Black Screen:**
- Check webapis.js is loaded
- Verify privilege declarations in config.xml
- Check console logs via Tizen Studio

## 📚 Documentation

### Project Documentation
- [README.md](README.md) - This file (main documentation)
- [TIZEN_TV_COMPLETE_DOCUMENTATION.md](TIZEN_TV_COMPLETE_DOCUMENTATION.md) - Tizen TV development guide
- [TIZEN_CONFIG_XML_DOCUMENTATION.md](TIZEN_CONFIG_XML_DOCUMENTATION.md) - config.xml reference

### Module Documentation
- [api/README.md](api/README.md) - API integration guide
- [css/README.md](css/README.md) - Styling architecture
- [js/README.md](js/README.md) - JavaScript modules guide
- [bbnl-proxy/README.md](bbnl-proxy/README.md) - Proxy server documentation

## 🔄 File Dependencies

```
index.html (Login)
  ├── css/pages/auth.css
  ├── js/script.js
  ├── js/remote.js
  ├── api/config.js
  └── api/auth.js

verify.html (OTP)
  ├── css/pages/auth.css
  ├── js/script.js
  ├── api/config.js
  └── api/auth.js

homepage.html (Dashboard)
  ├── css/pages/homepages.css
  ├── js/script.js
  ├── js/remote.js
  ├── api/config.js
  ├── api/channels.js
  └── api/ads.js

tv-channels.html (Channels)
  ├── css/pages/apps.css
  ├── js/script.js
  ├── api/config.js
  └── api/channels.js

player.html (Video Player)
  ├── css/style.css
  ├── js/avplayer.js
  ├── js/remote.js
  └── Samsung webapis (AVPlay)
```

## 🤝 Contributing

### Code Style
- Use ES5 syntax for Tizen compatibility
- Follow existing naming conventions
- Comment complex logic
- Test on both browser and TV

### Testing Checklist
- [ ] Browser testing (Chrome/Firefox)
- [ ] Tizen Simulator testing
- [ ] Real Samsung TV testing
- [ ] Remote control navigation
- [ ] Video playback
- [ ] Authentication flow
- [ ] Error handling

## 📝 License

Private project for BBNL IPTV Platform.

## 📞 Support

For issues and support:
- Help Desk: Available in app (help-desk.html)
- Feedback: Use in-app feedback (give-feedback.html)

## 🔖 Version History

- **v1.0.0** - Initial release
  - Basic authentication
  - Channel browsing
  - Video playback
  - Profile management

---

**Built with ❤️ for Samsung Tizen Smart TVs**

---

## 📱 Device Configuration

**MAC Address**: `26:F2:AE:D8:3F:99`  
**Device Name**: `rk3368_box`  
**IP Address**: `124.40.244.233`  
**Device Type**: `FOFI`

All configured in [api/auth.js](api/auth.js) → `getDeviceInfo()`

---

## 🎨 Technology Stack

- **Frontend**: HTML5, CSS3, Modern JavaScript (ES6+)
- **Video**: HLS.js, Samsung AVPlay
- **API**: REST APIs, JSON
- **Storage**: LocalStorage
- **Platform**: Samsung Tizen TV

---

## 📝 Notes

1. **Development**: Use CORS proxy (`USE_PROXY: true`)
2. **Production**: Disable proxy (`USE_PROXY: false`)
3. **TV Deployment**: Package with Tizen Studio
4. **Browser Support**: Modern browsers with ES6+ support

---

## 🎯 Quick Start Checklist

- [ ] Open [index.html](index.html) in browser
- [ ] Enter mobile number
- [ ] Receive OTP
- [ ] Enter OTP in [verify.html](verify.html)
- [ ] Access [homepage.html](homepage.html)
- [ ] Browse channels in [tv-channels.html](tv-channels.html)
- [ ] Play video in [player.html](player.html)

---

**Version**: 1.0  
**Platform**: Samsung Tizen TV  
**Date**: December 2025  
**Status**: Ready for Testing ✅

---

# Appendix: Specialized Documentation

The following sections contain detailed technical documentation for specific modules and systems.

---

# A. JavaScript Modules (js/)

Complete JavaScript module documentation for BBNL IPTV Samsung Tizen TV application. All code uses ES5 syntax for maximum compatibility with Tizen WebEngine.

## File Structure

```
js/
├── script.js     # Core utilities and global functions
├── remote.js     # Samsung TV remote control handler
└── avplayer.js   # Video player using Samsung AVPlay API
```

## script.js - Core Utilities

Global utility functions, theme management, and common helpers used across all pages.

### Functions Overview

| Function | Purpose | Usage |
|----------|---------|-------|
| `initializeTheme()` | Initialize dark/light theme from localStorage | Called on page load |
| `setupThemeToggle()` | Set up theme toggle event listeners | Called after DOM ready |
| `showLoading()` | Display loading overlay | Before API calls |
| `hideLoading()` | Hide loading overlay | After API completion |
| `showError(message)` | Display error message | Error handling |
| `showSuccess(message)` | Display success message | After success actions |
| `formatDate(dateString)` | Format date for display | UI rendering |
| `validateMobileNumber(mobile)` | Validate 10-digit mobile | Form validation |
| `validateOTP(otp)` | Validate OTP code | OTP verification |
| `debounce(func, wait)` | Debounce function calls | Search input |
| `throttle(func, wait)` | Throttle function calls | Scroll events |

---

# B. CSS Architecture (css/)

Complete styling system for BBNL IPTV Samsung Tizen TV application organized in a modular, scalable architecture.

## Directory Structure

```
css/
├── style.css              # Main stylesheet (imports all modules)
├── colors.css             # Color palette and theme variables
│
├── base/                  # Foundation styles
│   ├── reset.css          # CSS reset and normalization
│   ├── responsive.css     # Responsive breakpoints and media queries
│   └── variable.css       # CSS custom properties (variables)
│
├── componentes/           # Reusable component styles
│   ├── buttons.css        # Button styles and variants
│   ├── cards.css          # Card components
│   ├── forms.css          # Form elements (inputs, selects, etc.)
│   └── remote.css         # Remote control UI components
│
├── layout/                # Layout and structure
│   ├── header.css         # Top navigation header
│   └── sidebar.css        # Side navigation menu
│
└── pages/                 # Page-specific styles
    ├── apps.css           # Apps page
    ├── auth.css           # Authentication pages (login, OTP)
    ├── favorites.css      # Favorites page
    ├── homepages.css      # Homepage dashboard
    ├── notifications.css  # Notifications page
    ├── profile.css        # Profile management
    ├── settings.css       # Settings page
    └── subscription.css   # Subscription pages
```

### TV-Specific Considerations

#### Focus States
Samsung TVs require visible focus indicators for remote navigation:

```css
.focusable:focus {
    outline: 3px solid var(--accent-color);
    outline-offset: 2px;
    transform: scale(1.05);
    transition: transform 0.2s ease;
}
```

#### Safe Zones
Account for TV overscan (5% padding from edges):

```css
.container {
    padding: 5vh 5vw;
}
```

#### Large Screen Optimization
Design for 10-foot viewing distance:

```css
/* Larger text for TV screens */
body {
    font-size: 18px;
    line-height: 1.6;
}

h1 { font-size: 48px; }
h2 { font-size: 36px; }
h3 { font-size: 28px; }
```

---

# C. API Integration Layer (api/)

Complete API integration module for BBNL IPTV streaming platform.

## File Structure

```
api/
├── config.js      # Central API configuration (URLs, headers, endpoints, proxy)
├── auth.js        # Authentication & session management (login, OTP, logout)
├── channels.js    # Channel data & categories (fetch, filter, organize)
└── ads.js         # Advertisement management (banners, IPTV ads)
```

## Authentication API (auth.js)

Handles user authentication, session management, and device verification.

### Core Functions

#### `requestOTP(userid, mobile)`
Send OTP to user's mobile number for login.

**Parameters:**
- `userid` (string): User ID for login
- `mobile` (string): 10-digit mobile number

**Returns:** Promise with result object

#### `verifyOTP(userid, mobile, otpcode)`
Verify OTP code and complete login.

#### `getUserData()`
Retrieve current logged-in user data.

#### `isAuthenticated()`
Check if user is currently logged in.

#### `logout()`
Clear user session and logout.

---

# D. BBNL Proxy Server (bbnl-proxy/)

CORS proxy server for BBNL IPTV API during browser-based development.

## Overview

**Purpose:**
- Enable browser-based development and testing
- Bypass CORS restrictions in development
- Serve static files for local testing
- Provide video file serving

**Note:** This proxy is **only for development**. On Samsung TV, the app runs natively and doesn't need a proxy.

## Quick Start

```bash
cd bbnl-proxy
npm install
npm start
```

Server runs at: `http://localhost:3000`

## API Endpoints

### Proxied API Routes

All API requests are proxied from `/api/*` to BBNL production servers.

#### Authentication API
```
POST /api/login
POST /api/loginOtp
```

Proxied to: `http://124.40.244.211/netmon/cabletvapis`

#### Channel API
```
POST /api/chnl_categlist
POST /api/chnl_data
```

---

# E. Samsung Tizen TV Complete Development Documentation

## Overview

### What is Tizen TV?
Tizen is Samsung's Linux-based operating system used in Smart TVs. Web applications for Tizen TV are built using HTML5, CSS3, and JavaScript with access to device-specific APIs through `webapis` and `tizen` namespaces.

### Tizen TV Versions by Year

| TV Model Year | Tizen Version | Web Engine Version |
|---------------|---------------|-------------------|
| 2015 | Tizen 2.3 | Chromium 38 |
| 2016 | Tizen 2.4 | Chromium 47 |
| 2017 | Tizen 3.0 | Chromium 56 |
| 2018 | Tizen 4.0 | Chromium 63 |
| 2019 | Tizen 5.0 | Chromium 69 |
| 2020 | Tizen 5.5 | Chromium 76 |
| 2021 | Tizen 6.0 | Chromium 85 |
| 2022 | Tizen 6.5 | Chromium 94 |
| 2023 | Tizen 7.0 | Chromium 108 |
| 2024 | Tizen 8.0 | Chromium 120 |

## Web Engine Specifications

### HTML5 Supported Features
```html
<!-- Standard HTML5 Tags Supported -->
<video src="video.mp4" autoplay></video>
<audio src="audio.mp3" controls></audio>
<iframe src="page.html"></iframe>
<canvas id="myCanvas"></canvas>
<img src="image.jpg" />
<link rel="stylesheet" href="style.css">
<script src="script.js"></script>
```

## JavaScript Compatibility

### ES5 vs ES6 Support

#### Tizen Version Compatibility Matrix

| Feature | Tizen 2.3-3.0 | Tizen 4.0+ | Tizen 6.0+ |
|---------|---------------|------------|------------|
| `var` | ✅ | ✅ | ✅ |
| `let` / `const` | ❌ | ✅ | ✅ |
| Arrow Functions | ❌ | ✅ | ✅ |
| Template Literals | ❌ | ✅ | ✅ |
| Promises | ❌ (polyfill) | ✅ | ✅ |
| `async/await` | ❌ | ❌ | ✅ |
| Classes | ❌ | ✅ | ✅ |

### ES5 Compatible Patterns (RECOMMENDED)

```javascript
// ===== VARIABLE DECLARATIONS =====
// ❌ ES6 (Avoid for older TVs)
const CONFIG = {};
let count = 0;

// ✅ ES5 (Safe for all Tizen versions)
var CONFIG = {};
var count = 0;

// ===== FUNCTIONS =====
// ❌ ES6 Arrow Functions
const handleClick = () => { };

// ✅ ES5 Regular Functions
var handleClick = function() { };

// ===== PROMISES =====
// ❌ ES6 .catch() method
somePromise.catch(function(error) { });

// ✅ ES5 Compatible (second parameter of .then())
somePromise.then(
    function(data) { /* success */ },
    function(error) { /* error handler */ }
);
```

## AVPlay API Reference

The AVPlay API is Samsung's native video player for high-performance streaming.

### Player States
```javascript
// AVPlayPlayerState enum
'NONE'      // Player not created
'IDLE'      // Created but not prepared
'READY'     // Ready to play
'PLAYING'   // Currently playing
'PAUSED'    // Paused
```

### Basic Usage Pattern
```javascript
// ===== INITIALIZATION =====
var videoUrl = 'http://example.com/video.m3u8';

// 1. Open the player with URL
webapis.avplay.open(videoUrl);

// 2. Set display area (x, y, width, height based on 1920x1080)
webapis.avplay.setDisplayRect(0, 0, 1920, 1080);

// 3. Set event listeners
webapis.avplay.setListener({
    onbufferingstart: function() {
        console.log('Buffering started...');
    },
    onbufferingcomplete: function() {
        console.log('Buffering complete');
    },
    oncurrentplaytime: function(currentTime) {
        console.log('Time: ' + currentTime + 'ms');
    },
    onstreamcompleted: function() {
        console.log('Playback complete');
    },
    onerror: function(eventType) {
        console.error('Error:', eventType);
    }
});

// 4. Prepare (async recommended)
webapis.avplay.prepareAsync(
    function() {
        console.log('Prepared successfully');
        // 5. Start playback
        webapis.avplay.play();
    },
    function(error) {
        console.error('Prepare failed:', error);
    }
);
```

## TV Input Device API

### Registering Remote Keys
```javascript
// Register keys that need to be handled by the app
function registerKeys() {
    if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
        var keys = [
            'MediaPlayPause',
            'MediaPlay',
            'MediaPause',
            'MediaStop',
            'MediaFastForward',
            'MediaRewind',
            'ColorF0Red',
            'ColorF1Green',
            'ColorF2Yellow',
            'ColorF3Blue'
        ];
        
        keys.forEach(function(key) {
            try {
                tizen.tvinputdevice.registerKey(key);
            } catch (e) {
                console.warn('Could not register key:', key, e.message);
            }
        });
    }
}
```

### Key Code Reference
```javascript
// Samsung Tizen Remote Key Codes
var KEY_CODES = {
    // Navigation
    LEFT: 37,
    UP: 38,
    RIGHT: 39,
    DOWN: 40,
    ENTER: 13,       // OK/Select button
    BACK: 10009,     // Return/Back button
    EXIT: 10182,     // Exit app
    
    // Media Controls
    PLAY: 415,
    PAUSE: 19,
    STOP: 413,
    FORWARD: 417,    // Fast Forward
    REWIND: 412,     // Rewind
    
    // Color Buttons
    RED: 403,
    GREEN: 404,
    YELLOW: 405,
    BLUE: 406
};
```

## Best Practices

### 1. Always Use ES5 Syntax
```javascript
// ✅ GOOD - ES5 compatible
var myFunction = function(param) {
    param = param || 'default';
    return param;
};

// ❌ BAD - May not work on older TVs
const myFunction = (param = 'default') => param;
```

### 2. Check API Availability Before Use
```javascript
// ✅ Always check if API exists
if (typeof webapis !== 'undefined' && webapis.avplay) {
    webapis.avplay.play();
}
```

### 3. Handle Errors Gracefully
```javascript
// ✅ Wrap Tizen calls in try-catch
function playVideo(url) {
    try {
        webapis.avplay.open(url);
        webapis.avplay.prepareAsync(
            function() { webapis.avplay.play(); },
            function(err) { 
                console.error('Prepare failed:', err);
                showErrorMessage('Unable to play video');
            }
        );
    } catch (e) {
        console.error('AVPlay error:', e);
        // Fallback to HTML5 video
        fallbackToHTML5(url);
    }
}
```

---

# F. Tizen config.xml Documentation

## Overview

The `config.xml` file is the **core configuration file** for Tizen web applications. It defines app metadata, permissions, and runtime behaviors.

- **Location**: Must be in the project root directory
- **Format**: Valid XML
- **Purpose**: Influences packaging, installation, and runtime behavior on Samsung TVs

## Root Element

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" 
        xmlns:tizen="http://tizen.org/ns/widgets" 
        id="http://yourdomain/appname" 
        version="1.0.0" 
        viewmodes="maximized">
    <!-- Child elements here -->
</widget>
```

## W3C Core Elements

### `<access>` - Network Origin Control

```xml
<!-- Allow all origins (default) -->
<access origin="*" subdomains="true"/>

<!-- Restrict to specific domains -->
<access origin="https://api.example.com" subdomains="true"/>
```

### `<content>` - Start Page (Required)

```xml
<content src="index.html" type="text/html"/>
```

### `<name>` - Application Name

```xml
<name>My TV App</name>

<!-- Localized names -->
<name xml:lang="en">My TV App</name>
<name xml:lang="ko">내 TV 앱</name>
```

### `<icon>` - Application Icon

```xml
<icon src="icon.png"/>

<!-- Multiple sizes -->
<icon src="icon-128.png" width="128" height="128"/>
<icon src="icon-256.png" width="256" height="256"/>
```

## Tizen-Specific Extensions

### `<tizen:application>` - App Identity (Required)

```xml
<tizen:application id="bNoSQVUTDy.SAMSUNGNMASTER" 
                   package="bNoSQVUTDy" 
                   required_version="9.0"/>
```

### `<tizen:privilege>` - API Permissions

**Critical for app functionality.** Declares which Tizen APIs the app can access.

```xml
<!-- Network access -->
<tizen:privilege name="http://tizen.org/privilege/internet"/>
<tizen:privilege name="http://tizen.org/privilege/network.get"/>

<!-- TV-specific -->
<tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
<tizen:privilege name="http://tizen.org/privilege/tv.window"/>

<!-- Samsung-specific (AVPlay) -->
<tizen:privilege name="http://developer.samsung.com/privilege/avplay"/>
<tizen:privilege name="http://developer.samsung.com/privilege/productinfo"/>
```

#### Essential TV Privileges

| Privilege | Purpose |
|-----------|---------|
| `http://tizen.org/privilege/internet` | Internet access |
| `http://tizen.org/privilege/network.get` | Get network information (MAC, IP) |
| `http://tizen.org/privilege/tv.inputdevice` | TV remote control events |
| `http://developer.samsung.com/privilege/avplay` | Samsung AVPlay video player |
| `http://developer.samsung.com/privilege/productinfo` | Device product information |

### `<tizen:setting>` - App Settings

```xml
<tizen:setting screen-orientation="landscape" 
               context-menu="enable" 
               background-support="disable" 
               encryption="disable" 
               install-location="auto" 
               hwkey-event="enable"/>
```

| Setting | Values | Description |
|---------|--------|-------------|
| `screen-orientation` | `landscape`, `portrait`, `auto` | Screen orientation lock |
| `hwkey-event` | `enable`, `disable` | Hardware key events (TV remote) |

## Complete Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" 
        xmlns:tizen="http://tizen.org/ns/widgets" 
        id="http://example.com/bbnl-tv" 
        version="2.1.0" 
        viewmodes="maximized">
    
    <!-- Network Access -->
    <access origin="*" subdomains="true"/>
    
    <!-- App Identity -->
    <tizen:application id="bNoSQVUTDy.BBNLTV" 
                       package="bNoSQVUTDy" 
                       required_version="9.0"/>
    
    <!-- Entry Point -->
    <content src="index.html"/>
    
    <!-- App Info -->
    <name>BBNL TV</name>
    <description>BBNL Streaming Application for Samsung TV</description>
    <icon src="icon.png"/>
    
    <!-- Privileges (Permissions) -->
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:privilege name="http://tizen.org/privilege/network.get"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
    <tizen:privilege name="http://developer.samsung.com/privilege/avplay"/>
    <tizen:privilege name="http://developer.samsung.com/privilege/productinfo"/>
    
    <!-- Runtime Settings -->
    <tizen:setting screen-orientation="landscape" 
                   context-menu="enable" 
                   background-support="disable" 
                   encryption="disable" 
                   install-location="auto" 
                   hwkey-event="enable"/>
</widget>
```

---

## Summary

This comprehensive README consolidates all project documentation into a single reference. For module-specific implementation details, refer to the appendix sections above.

**Last Updated**: January 2026  
**Documentation Version**: 2.0  
**Compatible with**: Tizen 2.4 - 9.0
