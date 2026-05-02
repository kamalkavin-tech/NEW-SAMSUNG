# Fo-Fi TV (BBNL IPTV) - Samsung Smart TV Application

## Project Overview
Fo-Fi TV is a Tizen-based web application designed specifically for Samsung Smart TVs. It provides users with a seamless interface to stream live IPTV channels, browse OTT applications, and manage their subscription services. The application is highly optimized for Smart TV hardware, employing progressive rendering, in-memory caching, and native Tizen WebAPIs for playback and device management.

## Key Features
- **Live TV Streaming:** Utilizes Samsung's native `AVPlayer` for smooth, hardware-accelerated playback of live channels.
- **Smart Navigation:** Fully optimized for Samsung TV remotes (D-Pad navigation) with predictive focus management and circular wrapping.
- **Dynamic Channel Grid:** Features progressive DOM rendering and lazy-loaded imagery to ensure high performance on low-memory TV environments.
- **Category & Language Filtering:** Instantly filter channels by language (e.g., Hindi, Tamil, Malayalam) and genre (e.g., Sports, Movies, News).
- **LCN Direct Playback:** Support for direct channel tuning via numeric keypad input across all major screens.
- **Device Binding & Security:** Uses Samsung Tizen WebAPIs to bind accounts to specific Device IDs (DUID) and MAC addresses.
- **Ad Integration:** Supports both homepage hero banner carousels and in-stream overlay advertisements.
- **Robust Error Recovery:** Features an offline watchdog, automatic stream resume capabilities, and dynamic fallback image routing.

## Tech Stack
- **Frontend:** HTML5, CSS3 (Responsive/TV-Optimized), Vanilla JavaScript (ES5/ES6)
- **Platform:** Samsung Tizen TV Web Application platform
- **APIs Used:** `tizen.tvinputdevice`, `tizen.systeminfo`, `webapis.avplay`, `webapis.network`, `webapis.productinfo`

## Core Architecture & Modules

### 1. API & Core Services (`js/api.js`)
Acts as the central nervous system of the application. 
- **`BBNL_API`**: Manages all outbound HTTP requests with the BBNL backend.
- **`DeviceInfo`**: Interacts with Tizen APIs to retrieve MAC addresses, IPv4/IPv6, DUIDs, and firmware versions.
- **`CacheManager`**: Handles `localStorage` and `sessionStorage` to persist channel lists, categories, and languages, heavily reducing API calls.
- **Image Preloading**: Manages an internal queue for prefetching and caching channel logos, preventing blank images during rapid channel zapping.

### 2. Video Player (`js/player.js`)
Controls the full-screen playback experience.
- Wraps Samsung's native `AVPlayer` module.
- Manages the Info Bar overlay and Stream Ads.
- Integrates a 2-level sidebar (Categories -> Channels) for quick zapping without exiting the stream.
- Includes an intelligent network watchdog to automatically resume streams if the internet drops and reconnects.

### 3. Home Dashboard (`js/home.js`)
The landing screen of the application.
- Renders the Hero Ad Carousel (`AdsAPI`).
- Displays a quick-access grid for Languages, recently viewed Channels, and OTT Apps.
- Handles automatic initial tuning (tuning to LCN 999 / FoFi Info Channel on launch).

### 4. Channel Guide (`js/channels.js`)
The main grid interface for browsing TV content.
- Utilizes a heavily optimized progressive rendering loop to append DOM nodes in chunks, preventing TV lockups.
- Implements deep caching for logos and API responses.
- Handles instant UI transitions when swapping between "Subscribed", "All Channels", and specific language tabs.

### 5. Settings & Legal (`js/settings.js` / `settings.html`)
The configuration hub.
- Displays detailed network diagnostics and device hardware info.
- Presents legal static pages ("About Us" and "Terms of Service") inside reusable content panels.
- Handles the explicit session teardown and application exit during Logout.

## Remote Control Mapping
| Key | Action |
| :--- | :--- |
| **Arrows (Up/Down/Left/Right)** | Move focus between UI elements |
| **Enter / OK** | Select highlighted item / Open Player Sidebar / Confirm numeric input |
| **Back / Return** | Close open overlays / Go back to previous screen / Exit App (from Home) |
| **CH+ / CH-** | Zap to the next/previous channel while watching TV |
| **0-9 (Numpad)** | Direct channel entry (LCN Search) |
| **Volume Keys** | Control device volume |

## Application Lifecycle & State Management
- **BFCache Support:** The app uses `pageshow` and `pagehide` events rather than `beforeunload` to ensure the TV browser's Back-Forward Cache (BFCache) remains active, resulting in near-instant page transitions.
- **Auth Gate:** Protected pages verify the existence of `bbnl_user` in `localStorage` prior to rendering. 
- **Backgrounding:** Pressing the HOME button on the remote suspends the AVPlayer and exits the app gracefully without invalidating the authentication token.